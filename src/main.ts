import "./style.scss";
import * as Core from "@typora-community-plugin/core";
import { editor, File } from "typora";
import { attachTableController, type CellAlignment } from "./controller";
import { setLocale, t, translateError } from "./locale";
import {
	applyTableOperation,
	applyTableHeaderOperation,
	mergeCells,
	splitCell,
	tableGrid,
	type TableOperation,
	type TableHeaderOperation,
} from "./table";

const { Plugin, HtmlPostProcessor, HtmlExportProcessor } = Core;

type EditorNode = ReturnType<typeof editor.getNode>;
type Snapshot = { type: "replace"; id: string; json: unknown };
type NativeUndo = {
	UndoManager: { buildReplaceUndo(node: EditorNode): Snapshot };
	register(command: { undo: Snapshot[]; redo: Snapshot[] }): void;
	endSnap?(discard: boolean): void;
	undo?(): void;
	redo?(): void;
};
type MutableEditorNode = EditorNode & {
	parseFrom(options: {
		skips: { old_code: boolean; pass_format: boolean };
	}): [string, EditorNode[]];
	readFromJson(json: unknown, nodeMap: unknown): void;
	toHTML(): string;
};
type MutableEditor = typeof editor & {
	store(cid: string): void;
	nodeMap: unknown;
};
type Session = {
	cid: string;
	node: EditorNode;
	table: HTMLTableElement;
	lastCommitted: string;
	selected: HTMLTableCellElement[];
	anchor: HTMLTableCellElement | undefined;
	composing: boolean;
};
type TableTarget = { paragraph: HTMLElement; cid: string };
const marker = "data-enhanced-table";
const selectedMarker = "data-enhanced-table-selected";
const emptyTable = "<table><tbody><tr><td></td></tr></tbody></table>";
const unsafeTableContent =
	"table, script, style, iframe, object, embed, form, input, textarea, select, button, [contenteditable], [data-enhanced-table], [data-enhanced-table-selected]";

function standaloneTable(html: string): string | undefined {
	if (!html) return;
	const parsed = new DOMParser().parseFromString(html, "text/html");
	const table = parsed.body.firstElementChild;
	if (
		!(table instanceof HTMLTableElement) ||
		parsed.body.children.length !== 1 ||
		Array.from(parsed.body.childNodes).some(
			(node) => node !== table && node.textContent?.trim(),
		) ||
		table.matches(
			"[contenteditable], [data-enhanced-table], [data-enhanced-table-selected]",
		) ||
		table.querySelector(unsafeTableContent) ||
		[table, ...table.querySelectorAll("*")].some((element) =>
			Array.from(element.attributes).some((attribute) =>
				attribute.name.toLowerCase().startsWith("on"),
			),
		)
	)
		return;
	try {
		tableGrid(table);
	} catch {
		return;
	}
	return table.outerHTML;
}

function clean(table: HTMLTableElement) {
	const copy = table.cloneNode(true);
	if (!(copy instanceof HTMLTableElement)) throw Error("cannotReadTable");
	copy.removeAttribute(marker);
	copy.querySelectorAll("td, th").forEach((cell) => {
		cell.removeAttribute("contenteditable");
		cell.removeAttribute(selectedMarker);
	});
	return copy.outerHTML;
}

function writable() {
	return (
		!("isLocked" in File && File.isLocked) && !editor.sourceView?.inSourceMode
	);
}

function showError(error: unknown) {
	window.alert(
		error instanceof Error ? translateError(error.message) : String(error),
	);
}

function undoAPI(): NativeUndo {
	// shortcut: Typora has no public HTML write API; recheck native snapshots after upgrades.
	const undo = editor.undo;
	if (
		!undo ||
		!("register" in undo) ||
		typeof undo.register !== "function" ||
		!undo.UndoManager ||
		!("buildReplaceUndo" in undo.UndoManager) ||
		typeof undo.UndoManager.buildReplaceUndo !== "function"
	) {
		throw Error("undoInterfaceUnavailable");
	}
	return undo as unknown as NativeUndo;
}

export default class EnhancedTable extends Plugin {
	private session: Session | undefined;
	private tables = new Set<HTMLTableElement>();
	private controllers = new Map<HTMLTableElement, () => void>();

	onload() {
		setLocale({
			localePath: Core.path.join(this.manifest.dir ?? "/src/", "locales"),
			userLang: this.app.i18n.locale,
		});
		this.interceptNavigation();
		this.registerCommand({
			id: "create-table",
			title: t("createTable"),
			scope: "editor",
			hotkey: "ctrl+shift+t",
			callback: () => this.createTable(),
		});
		this.registerCommand({
			id: "merge",
			title: t("mergeCells"),
			scope: "editor",
			hotkey: "ctrl+shift+m",
			callback: () => this.change("merge"),
		});
		this.registerCommand({
			id: "split",
			title: t("splitCell"),
			scope: "editor",
			hotkey: "ctrl+shift+u",
			callback: () => this.change("split"),
		});
		this.registerCommand({
			id: "insert-row-below",
			title: t("insertRowBelow"),
			scope: "editor",
			hotkey: "ctrl+enter",
			callback: () => {
				if (this.session)
					this.changeStructure(this.session.table, "insert-below");
			},
		});
		this.registerCommand({
			id: "delete-row",
			title: t("deleteRow"),
			scope: "editor",
			hotkey: "ctrl+shift+backspace",
			callback: () => {
				if (this.session)
					this.changeStructure(this.session.table, "delete-row");
			},
		});
		this.registerMarkdownPostProcessor(
			HtmlPostProcessor.from({
				selector: ".md-htmlblock-container > table",
				process: (el, context) => {
					if (
						context.containerEl === editor.writingArea &&
						el instanceof HTMLTableElement
					)
						this.enable(el);
				},
			}),
		);
		this.register(
			this.app.features.exporter.register(
				HtmlExportProcessor.from({
					process: ({ doc }) => {
						doc
							.querySelectorAll("[data-enhanced-table-controls]")
							.forEach((el) => {
								el.remove();
							});
						doc
							.querySelectorAll<HTMLTableElement>(`table[${marker}]`)
							.forEach((table) => {
								table.outerHTML = clean(table);
							});
					},
				}),
			),
		);
		editor.writingArea
			?.querySelectorAll<HTMLTableElement>(".md-htmlblock-container > table")
			.forEach((table) => {
				this.enable(table);
			});
		// Native undo can replace HTML without emitting the core's edit notification.
		const observer = new MutationObserver((records) => {
			for (const record of records)
				for (const added of Array.from(record.addedNodes)) {
					if (!(added instanceof HTMLElement)) continue;
					if (added instanceof HTMLTableElement) this.enable(added);
					added
						.querySelectorAll<HTMLTableElement>(
							".md-htmlblock-container > table",
						)
						.forEach((table) => {
							this.enable(table);
						});
				}
		});
		if (editor.writingArea)
			observer.observe(editor.writingArea, { childList: true, subtree: true });
		this.register(() => observer.disconnect());
		this.registerDomEvent(
			document,
			"mousedown",
			(event: MouseEvent) => {
				const table = this.tableAt(event.target);
				if (!table || event.button !== 0) return;
				if (!writable()) {
					this.disable(table);
					return;
				}
				const cell =
					event.target instanceof HTMLElement
						? event.target.closest("td, th")
						: null;
				if (!(cell instanceof HTMLTableCellElement)) return;
				if (!this.activate(table)) return;
				event.stopImmediatePropagation();
				if (event.shiftKey) event.preventDefault();
				this.select(cell, event.shiftKey);
			},
			true,
		);
		this.registerDomEvent(
			document,
			"click",
			(event: MouseEvent) => {
				if (!this.tableAt(event.target)) return;
				event.stopImmediatePropagation();
				if (
					event.target instanceof HTMLElement &&
					event.target.closest("a,button,input,select")
				)
					event.preventDefault();
			},
			true,
		);
		this.registerDomEvent(
			document,
			"beforeinput",
			(event: InputEvent) => {
				const table = this.tableAt(event.target);
				if (!table) return;
				event.stopImmediatePropagation();
				if (!writable() || !this.activate(table)) event.preventDefault();
			},
			true,
		);
		this.registerDomEvent(
			document,
			"input",
			(event: InputEvent) => {
				const table = this.tableAt(event.target);
				if (!table) return;
				event.stopImmediatePropagation();
				if (
					this.session?.table === table &&
					!this.session.composing &&
					!event.isComposing
				)
					this.attempt(() => this.commit());
			},
			true,
		);
		this.registerDomEvent(
			document,
			"compositionstart",
			(event: CompositionEvent) => {
				const table = this.tableAt(event.target);
				if (!table) return;
				event.stopImmediatePropagation();
				if (this.activate(table) && this.session) this.session.composing = true;
			},
			true,
		);
		this.registerDomEvent(
			document,
			"compositionend",
			(event: CompositionEvent) => {
				const table = this.tableAt(event.target);
				if (!table) return;
				event.stopImmediatePropagation();
				if (table !== this.session?.table || !this.session) return;
				this.session.composing = false;
				this.attempt(() => this.commit());
			},
			true,
		);
		for (const name of [
			"mouseup",
			"dblclick",
			"keypress",
			"copy",
			"cut",
			"compositionupdate",
		])
			this.registerDomEvent(
				document,
				name,
				(event: Event) => {
					if (this.tableAt(event.target)) event.stopImmediatePropagation();
					if (name === "cut" && this.tableAt(event.target) && !writable())
						event.preventDefault();
				},
				true,
			);
		this.registerDomEvent(
			document,
			"keydown",
			(event: KeyboardEvent) => {
				if (this.createTable(event)) return;
				if (!this.tableAt(event.target)) return;
				if (!writable()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				const key = event.key.toLowerCase();
				const primary = event.ctrlKey && !event.metaKey;
				if (
					primary &&
					!event.altKey &&
					((key === "enter" && !event.shiftKey) ||
						(key === "backspace" && event.shiftKey))
				)
					event.preventDefault();
				if ((event.ctrlKey || event.metaKey) && !event.altKey) {
					if (key === "s") {
						if (this.session?.composing) {
							event.preventDefault();
							event.stopImmediatePropagation();
							return;
						}
						try {
							this.commit();
						} catch (error) {
							event.preventDefault();
							event.stopImmediatePropagation();
							showError(error);
						}
						return;
					}
					if (key === "z" || key === "y") {
						event.preventDefault();
						event.stopImmediatePropagation();
						if (this.session?.composing) return;
						this.attempt(() => {
							this.commit();
							const undo = undoAPI();
							const operation = key === "y" || event.shiftKey ? "redo" : "undo";
							if (typeof undo[operation] !== "function")
								throw Error("nativeUndoUnavailable");
							this.clearSelection();
							this.session = undefined;
							undo[operation]?.();
						});
						return;
					}
					// The core dispatches shortcuts on keyup; suppress native keydown actions.
					if (
						event.ctrlKey &&
						!event.metaKey &&
						event.shiftKey &&
						["m", "u"].includes(key)
					) {
						event.preventDefault();
					}
				}
				event.stopImmediatePropagation();
				if (event.key === "Escape") this.clearSelection();
				if (event.key === "Tab") {
					const cells = Array.from(
						this.session?.table.querySelectorAll<HTMLTableCellElement>(
							"td, th",
						) ?? [],
					);
					const current =
						event.target instanceof HTMLElement
							? event.target.closest("td, th")
							: null;
					const index =
						current instanceof HTMLTableCellElement
							? cells.indexOf(current)
							: -1;
					const next = cells[index + (event.shiftKey ? -1 : 1)];
					if (next) {
						event.preventDefault();
						next.focus();
						this.select(next, false);
					}
				}
			},
			true,
		);
		this.registerDomEvent(
			document,
			"paste",
			(event: ClipboardEvent) => {
				if (this.tableAt(event.target)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					if (writable())
						document.execCommand(
							"insertText",
							false,
							event.clipboardData?.getData("text/plain") ?? "",
						);
				} else this.createPastedTable(event);
			},
			true,
		);
		this.registerDomEvent(
			document,
			"drop",
			(event: DragEvent) => {
				if (this.tableAt(event.target)) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			},
			true,
		);
	}

	private interceptNavigation() {
		const host = editor as typeof editor & {
			selection: { moveUpOrDown: (...args: unknown[]) => unknown };
			htmlBlock: { startEditing: (...args: unknown[]) => unknown };
		};
		const selection = host.selection;
		const html = host.htmlBlock;
		if (
			typeof selection?.moveUpOrDown !== "function" ||
			typeof html?.startEditing !== "function"
		)
			return;
		const original = selection.moveUpOrDown;
		const plugin = this;
		const wrapped = function (this: typeof selection, ...args: unknown[]) {
			const start = html.startEditing;
			html.startEditing = function (...parameters: unknown[]) {
				const target = parameters[0];
				const element =
					target instanceof Element
						? target
						: target &&
								typeof target === "object" &&
								"0" in target &&
								target[0] instanceof Element
							? target[0]
							: typeof target === "string"
								? Array.from(
										editor.writingArea?.querySelectorAll("[cid]") ?? [],
									).find((el) => el.getAttribute("cid") === target)
								: undefined;
				const table = element?.querySelector<HTMLTableElement>(
					".md-htmlblock-container > table[data-enhanced-table]",
				);
				const cell = table?.querySelector<HTMLTableCellElement>("td, th");
				if (
					!writable() ||
					!table ||
					!cell ||
					!plugin.tables.has(table) ||
					!plugin.activate(table)
				)
					return start.apply(this, parameters);
				plugin.select(cell, false);
				cell.focus();
				const range = document.createRange();
				range.selectNodeContents(cell);
				range.collapse(true);
				const current = document.getSelection();
				current?.removeAllRanges();
				current?.addRange(range);
				return {
					focus() {},
					setCursor() {},
					getCursor: () => ({ line: 0, ch: 0 }),
					cursorCoords: () => ({ left: 0, right: 0 }),
					coordsChar: () => ({ line: 0, ch: 0 }),
				};
			};
			try {
				return original.apply(this, args);
			} finally {
				html.startEditing = start;
			}
		};
		selection.moveUpOrDown = wrapped;
		this.register(() => {
			if (selection.moveUpOrDown === wrapped) selection.moveUpOrDown = original;
		});
	}

	onunload() {
		if (this.session) this.session.composing = false;
		this.attempt(() => this.commit());
		this.tables.forEach((table) => {
			this.disable(table);
		});
		this.tables.clear();
		this.controllers.forEach((dispose) => {
			dispose();
		});
		this.controllers.clear();
		this.session = undefined;
	}

	private tableAt(target: EventTarget | null): HTMLTableElement | undefined {
		const table =
			target instanceof HTMLElement ? target.closest(`table[${marker}]`) : null;
		return table instanceof HTMLTableElement && this.tables.has(table)
			? table
			: undefined;
	}

	private enable(table: HTMLTableElement) {
		if (table.hasAttribute(marker)) return;
		if (!writable()) return;
		const block = table.closest<HTMLElement>(".md-htmlblock");
		const cid = block?.getAttribute("cid");
		if (!cid || !editor.writingArea?.contains(table)) return;
		const text = editor.getNode(cid)?.get("text");
		if (typeof text !== "string") return;
		const parsed = new DOMParser().parseFromString(text, "text/html");
		const source = parsed.body.firstElementChild;
		if (
			!(source instanceof HTMLTableElement) ||
			parsed.head.children.length ||
			parsed.body.children.length !== 1 ||
			Array.from(parsed.body.childNodes).some(
				(node) => node !== source && node.textContent?.trim(),
			) ||
			source.querySelector(
				"table, [contenteditable], [data-enhanced-table], [data-enhanced-table-selected]",
			) ||
			source.hasAttribute(marker) ||
			source.hasAttribute("contenteditable") ||
			source.outerHTML !== table.outerHTML
		)
			return;
		try {
			tableGrid(table);
			undoAPI();
		} catch {
			return;
		}
		table.setAttribute(marker, "");
		this.prepare(table);
		this.tables.add(table);
		this.controllers.set(
			table,
			attachTableController(table, {
				canAlign: () =>
					this.session?.table === table &&
					!this.session.composing &&
					this.session.selected.length > 0,
				align: (alignment) => this.changeAlignment(table, alignment),
				hotkey: (operation) => {
					const ids: Partial<Record<typeof operation, string>> = {
						"insert-below": "insert-row-below",
						"delete-row": "delete-row",
						merge: "merge",
						split: "split",
					};
					const id = ids[operation];
					const key =
						id &&
						this.app.commands?.commandMap[`${this.manifest?.id}:${id}`]?.hotkey;
					return key || undefined;
				},
				isAvailable: (operation) => {
					if (this.session?.table !== table || this.session.composing)
						return false;
					if (operation === "set-header") return !table.tHead;
					if (operation === "remove-header") return Boolean(table.tHead);
					return operation === "merge"
						? this.session.selected.length >= 2
						: this.session.selected.length === 1;
				},
				run: (operation) => {
					if (operation === "merge" || operation === "split")
						this.change(operation);
					else if (operation === "delete-table") this.deleteTable(table);
					else if (operation === "copy-table") {
						void navigator.clipboard
							.writeText(clean(table))
							.catch((error: unknown) => {
								showError(error);
							});
					} else if (
						operation === "set-header" ||
						operation === "remove-header"
					)
						this.changeHeader(table, operation);
					else this.changeStructure(table, operation);
				},
			}),
		);
		for (const previous of this.tables)
			if (!previous.isConnected) this.disable(previous);
	}

	private deleteTable(table: HTMLTableElement) {
		this.attempt(() => {
			const session = this.session;
			if (
				!session ||
				session.table !== table ||
				session.composing ||
				!writable() ||
				editor.getNode(session.cid) !== session.node ||
				session.node.get("text") !== session.lastCommitted
			)
				throw Error("documentChanged");
			const node = session.node as MutableEditorNode;
			const host = editor as MutableEditor;
			if (
				typeof node.parseFrom !== "function" ||
				typeof node.readFromJson !== "function" ||
				typeof node.toHTML !== "function"
			)
				throw Error("deleteTableUnavailable");
			const block = table.closest<HTMLElement>(".md-htmlblock");
			if (!block) throw Error("tableBlockMissing");
			const undo = undoAPI();
			undo.endSnap?.(true);
			const before = undo.UndoManager.buildReplaceUndo(node);
			try {
				node.set("text", "");
				const [html, nodes] = node.parseFrom({
					skips: { old_code: false, pass_format: true },
				});
				if (
					nodes.length !== 1 ||
					nodes[0] !== node ||
					node.get("type") !== "paragraph"
				)
					throw Error("emptyParagraphConversionFailed");
				const after = undo.UndoManager.buildReplaceUndo(node);
				undo.register({ undo: [before], redo: [after] });
				this.disable(table);
				document.getSelection()?.removeAllRanges();
				this.session = undefined;
				block.outerHTML = html;
			} catch (error) {
				node.readFromJson(before.json, host.nodeMap);
				throw error;
			}
		});
	}

	private disable(table: HTMLTableElement) {
		this.controllers.get(table)?.();
		this.controllers.delete(table);
		this.tables.delete(table);
		table.removeAttribute(marker);
		table.querySelectorAll("td, th").forEach((cell) => {
			cell.removeAttribute("contenteditable");
			cell.removeAttribute(selectedMarker);
		});
	}

	private prepare(table: HTMLTableElement) {
		table.querySelectorAll("td, th").forEach((cell) => {
			cell.setAttribute("contenteditable", "true");
		});
	}

	private activate(table: HTMLTableElement) {
		if (this.session?.table === table) return true;
		this.clearSelection();
		const cid = table.closest(".md-htmlblock")?.getAttribute("cid");
		if (!cid) return false;
		const node = editor.getNode(cid);
		const text = node?.get("text");
		if (typeof text !== "string") return false;
		this.session = {
			cid,
			node,
			table,
			lastCommitted: text,
			selected: [],
			anchor: undefined,
			composing: false,
		};
		return true;
	}

	private clearSelection() {
		this.session?.selected.forEach((cell) => {
			cell.removeAttribute(selectedMarker);
		});
		if (this.session) this.session.selected = [];
	}

	private select(cell: HTMLTableCellElement, extend: boolean) {
		const session = this.session;
		if (!session) return;
		this.clearSelection();
		const rects = tableGrid(session.table);
		const start = rects.find((r) => r.cell === session.anchor);
		const end = rects.find((r) => r.cell === cell);
		if (extend && start && end)
			session.selected = rects
				.filter(
					(r) =>
						r.bottom >= Math.min(start.top, end.top) &&
						r.top <= Math.max(start.bottom, end.bottom) &&
						r.right >= Math.min(start.left, end.left) &&
						r.left <= Math.max(start.right, end.right),
				)
				.map((r) => r.cell);
		else {
			session.anchor = cell;
			session.selected = [cell];
		}
		session.selected.forEach((selected) => {
			selected.setAttribute(selectedMarker, "");
		});
	}

	private commit() {
		const session = this.session;
		if (!session || session.composing) return;
		if (!session.table.isConnected) {
			this.session = undefined;
			return;
		}
		if (
			!writable() ||
			!session.table.isConnected ||
			editor.getNode(session.cid) !== session.node ||
			session.node.get("text") !== session.lastCommitted
		) {
			throw Error("unsavedTableConflict");
		}
		const output = clean(session.table);
		if (
			output ===
			new DOMParser().parseFromString(session.lastCommitted, "text/html").body
				.firstElementChild?.outerHTML
		)
			return;
		const undo = undoAPI();
		undo.endSnap?.(true);
		const before = undo.UndoManager.buildReplaceUndo(session.node);
		const previous = session.lastCommitted;
		session.node.set("text", output);
		try {
			const after = undo.UndoManager.buildReplaceUndo(session.node);
			undo.register({ undo: [before], redo: [after] });
			session.lastCommitted = output;
		} catch (error) {
			session.node.set("text", previous);
			throw error;
		}
	}

	private change(operation: "merge" | "split") {
		this.attempt(() => {
			const session = this.session;
			if (!session || session.composing) return;
			if (
				!writable() ||
				editor.getNode(session.cid) !== session.node ||
				session.node.get("text") !== session.lastCommitted
			)
				throw Error("documentChanged");
			if (operation === "merge") {
				const cell = mergeCells(session.table, session.selected);
				this.select(cell, false);
			} else {
				if (session.selected.length !== 1) throw Error("selectOneCell");
				splitCell(session.table, session.selected[0]);
			}
			this.prepare(session.table);
			this.commit();
		});
	}

	private changeStructure(table: HTMLTableElement, operation: TableOperation) {
		this.attempt(() => {
			const session = this.session;
			if (
				!session ||
				session.table !== table ||
				session.composing ||
				session.selected.length !== 1
			)
				throw Error("selectCellFirst");
			if (
				!writable() ||
				editor.getNode(session.cid) !== session.node ||
				session.node.get("text") !== session.lastCommitted
			)
				throw Error("documentChanged");
			const cell = applyTableOperation(table, session.selected[0], operation);
			this.prepare(table);
			this.select(cell, false);
			cell.focus();
			this.commit();
		});
	}

	private changeAlignment(table: HTMLTableElement, alignment: CellAlignment) {
		this.attempt(() => {
			const session = this.session;
			if (
				!session ||
				session.table !== table ||
				session.composing ||
				session.selected.length === 0
			)
				throw Error("selectCellFirst");
			if (
				!writable() ||
				editor.getNode(session.cid) !== session.node ||
				session.node.get("text") !== session.lastCommitted
			)
				throw Error("documentChanged");
			for (const cell of session.selected) cell.style.textAlign = alignment;
			this.commit();
		});
	}

	private changeHeader(
		table: HTMLTableElement,
		operation: TableHeaderOperation,
	) {
		this.attempt(() => {
			const session = this.session;
			if (!session || session.table !== table || session.composing)
				throw Error("tableNotActive");
			if (
				!writable() ||
				editor.getNode(session.cid) !== session.node ||
				session.node.get("text") !== session.lastCommitted
			)
				throw Error("documentChanged");
			const cell = applyTableHeaderOperation(table, operation);
			this.prepare(table);
			this.select(cell, false);
			cell.focus();
			this.commit();
		});
	}

	private tableTarget(
		expectedText: string,
		atEnd: boolean,
	): TableTarget | undefined {
		const selection = document.getSelection();
		if (selection?.rangeCount !== 1) return;
		const range = selection.getRangeAt(0);
		const paragraph = (
			range.endContainer instanceof HTMLElement
				? range.endContainer
				: range.endContainer.parentElement
		)?.closest<HTMLElement>('p[mdtype="paragraph"][cid]');
		if (!paragraph || paragraph.parentElement !== editor.writingArea) return;
		const suffix = range.cloneRange();
		suffix.setEndAfter(paragraph);
		if (
			!range.collapsed ||
			!paragraph.contains(range.endContainer) ||
			(atEnd && suffix.toString().trim()) ||
			(expectedText ? paragraph.textContent?.trim() : paragraph.textContent) !==
				expectedText
		)
			return;
		const cid = paragraph.getAttribute("cid");
		return cid ? { paragraph, cid } : undefined;
	}

	private replaceParagraphWithTable(
		target: TableTarget,
		expectedText: string,
		tableHtml: string,
		event?: Event,
	): boolean {
		const { paragraph, cid } = target;
		const mutableEditor = editor as MutableEditor;
		if (
			typeof mutableEditor.store !== "function" ||
			!("nodeMap" in mutableEditor)
		)
			return false;
		mutableEditor.store(cid);
		const node = editor.getNode(cid) as MutableEditorNode | undefined;
		if (
			!node ||
			(expectedText ? node.get("text")?.trim() : node.get("text")) !==
				expectedText ||
			typeof node.parseFrom !== "function" ||
			typeof node.readFromJson !== "function" ||
			typeof node.toHTML !== "function"
		)
			return false;
		event?.preventDefault();
		event?.stopImmediatePropagation();
		this.attempt(() => {
			const undo = undoAPI();
			undo.endSnap?.(true);
			const before = undo.UndoManager.buildReplaceUndo(node);
			let createdTable: HTMLTableElement | undefined;
			try {
				node.set("text", tableHtml);
				const [html, nodes] = node.parseFrom({
					skips: { old_code: false, pass_format: true },
				});
				if (nodes.length !== 1 || nodes[0] !== node)
					throw Error("tableConversionFailed");
				paragraph.outerHTML = html;
				const block = Array.from(editor.writingArea?.children ?? []).find(
					(element) => element.getAttribute("cid") === cid,
				);
				const table = block?.querySelector(
					":scope > .md-htmlblock-container > table",
				);
				if (!(table instanceof HTMLTableElement))
					throw Error("tablePreviewMissing");
				createdTable = table;
				this.enable(table);
				if (!table.hasAttribute(marker)) throw Error("tableEditUnavailable");
				const after = undo.UndoManager.buildReplaceUndo(node);
				undo.register({ undo: [before], redo: [after] });
				const cell = table.querySelector<HTMLTableCellElement>("td, th");
				if (cell && this.activate(table)) {
					this.select(cell, false);
					cell.focus();
					const range = document.createRange();
					range.selectNodeContents(cell);
					range.collapse(true);
					const selection = document.getSelection();
					selection?.removeAllRanges();
					selection?.addRange(range);
				}
			} catch (error) {
				if (createdTable) this.disable(createdTable);
				node.readFromJson(before.json, mutableEditor.nodeMap);
				const current = Array.from(editor.writingArea?.children ?? []).find(
					(element) => element.getAttribute("cid") === cid,
				);
				if (current) current.outerHTML = node.toHTML();
				throw error;
			}
		});
		return true;
	}

	private createPastedTable(event: ClipboardEvent): boolean {
		if (!writable() || this.session?.composing) return false;
		const table =
			standaloneTable(event.clipboardData?.getData("text/html") ?? "") ??
			standaloneTable(event.clipboardData?.getData("text/plain") ?? "");
		const target = this.tableTarget("", false);
		if (
			!target ||
			!(event.target instanceof Node) ||
			(event.target !== editor.writingArea &&
				!target.paragraph.contains(event.target))
		)
			return false;
		try {
			undoAPI();
		} catch {
			return false;
		}
		return Boolean(
			table && this.replaceParagraphWithTable(target, "", table, event),
		);
	}

	private createTable(event?: KeyboardEvent): boolean {
		if (event) {
			if (
				event.key !== "Enter" ||
				event.isComposing ||
				event.shiftKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.altKey ||
				!writable()
			)
				return false;
		} else if (!writable() || this.session?.composing) return false;
		const expectedText = event ? "<table>" : "";
		const target = this.tableTarget(expectedText, Boolean(event));
		return Boolean(
			target &&
				this.replaceParagraphWithTable(target, expectedText, emptyTable, event),
		);
	}

	private attempt(action: () => void) {
		try {
			action();
		} catch (error) {
			showError(error);
		}
	}
}
