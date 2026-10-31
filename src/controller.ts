import type { TableHeaderOperation, TableOperation } from "./table";
import {
	menuIcon,
	renderHotkey,
	textAlignCenterIcon,
	textAlignLeftIcon,
	textAlignRightIcon,
} from "./icons";
import { t, type MessageKey } from "./locale";

type MenuOperation =
	| TableOperation
	| TableHeaderOperation
	| "merge"
	| "split"
	| "copy-table"
	| "delete-table";

export type CellAlignment = "left" | "center" | "right";

let controllerId = 0;

const operations: [MenuOperation, MessageKey][][] = [
	[
		["insert-above", "insertRowAbove"],
		["insert-below", "insertRowBelow"],
	],
	[
		["insert-left", "insertColumnLeft"],
		["insert-right", "insertColumnRight"],
	],
	[
		["delete-row", "deleteSelectedRows"],
		["delete-column", "deleteSelectedColumns"],
	],
	[
		["merge", "mergeCells"],
		["split", "splitCell"],
		["set-header", "setHeader"],
		["remove-header", "removeHeader"],
	],
	[
		["copy-table", "copyTable"],
		["delete-table", "deleteTable"],
	],
];

const alignOperations: [CellAlignment, MessageKey, () => SVGElement][] = [
	["left", "alignLeft", textAlignLeftIcon],
	["center", "alignCenter", textAlignCenterIcon],
	["right", "alignRight", textAlignRightIcon],
];

export function attachTableController(
	table: HTMLTableElement,
	actions: {
		isAvailable(operation: MenuOperation): boolean;
		run(operation: MenuOperation): void;
		hotkey(operation: MenuOperation): string | undefined;
		canAlign(): boolean;
		align(alignment: CellAlignment): void;
	},
): () => void {
	const doc = table.ownerDocument;

	const controls = doc.createElement("div");
	controls.className = "enhanced-table-controls";
	controls.setAttribute("data-enhanced-table-controls", "");
	controls.setAttribute("contenteditable", "false");

	const trigger = doc.createElement("button");
	trigger.type = "button";
	trigger.append(menuIcon());
	trigger.title = t("tableActions");
	trigger.setAttribute("aria-label", t("tableActions"));
	trigger.setAttribute("aria-expanded", "false");
	const alignButtons = alignOperations.map(([alignment, label, icon]) => {
		const button = doc.createElement("button");
		button.type = "button";
		button.title = t(label);
		button.setAttribute("aria-label", t(label));
		button.dataset.alignment = alignment;
		button.append(icon());
		button.onclick = () => {
			if (!actions.canAlign()) return;
			actions.align(alignment);
		};
		return button;
	});

	const popup = doc.createElement("div");
	popup.id = `enhanced-table-controller-${++controllerId}`;
	popup.className = "enhanced-table-controller-popup";
	popup.setAttribute("role", "menu");
	popup.hidden = true;
	trigger.setAttribute("aria-controls", popup.id);
	const buttons = operations.flatMap((items) => {
		const group = doc.createElement("div");
		group.className = "enhanced-table-controller-group";
		group.setAttribute("role", "group");
		popup.append(group);
		return items.map(([operation, text]) => {
			const button = doc.createElement("button");
			button.type = "button";
			button.textContent = t(text);
			const hint = doc.createElement("span");
			hint.className = "enhanced-table-hotkey";
			button.append(hint);
			button.dataset.operation = operation;
			button.setAttribute("role", "menuitem");
			button.onclick = () => {
				if (!actions.isAvailable(operation)) return;
				actions.run(operation);
				close();
			};
			group.append(button);
			return button;
		});
	});
	const close = () => {
		popup.hidden = true;
		trigger.setAttribute("aria-expanded", "false");
	};
	trigger.onclick = () => {
		if (!popup.hidden) {
			close();
			return;
		}
		buttons.forEach((button) => {
			const operation = button.dataset.operation as MenuOperation;
			button.disabled = !actions.isAvailable(operation);
			const hint = button.querySelector(".enhanced-table-hotkey");
			if (hint) renderHotkey(hint, actions.hotkey(operation) ?? "");
		});
		popup.hidden = false;
		trigger.setAttribute("aria-expanded", "true");
	};
	controls.addEventListener("mousedown", (event) => {
		event.stopPropagation();
		event.preventDefault();
	});
	for (const name of ["click", "mouseup", "dblclick", "keypress", "keyup"])
		controls.addEventListener(name, (event) => {
			event.stopPropagation();
		});
	controls.addEventListener("keydown", (event) => {
		event.stopPropagation();
		if (event.key !== "Escape") return;
		event.preventDefault();
		close();
		trigger.focus();
	});
	const dismiss = (event: Event) => {
		if (event.target instanceof Node && !controls.contains(event.target))
			close();
	};
	doc.addEventListener("mousedown", dismiss, true);
	doc.addEventListener("focusin", dismiss, true);
	controls.append(trigger, ...alignButtons, popup);
	table.before(controls);
	return () => {
		doc.removeEventListener("mousedown", dismiss, true);
		doc.removeEventListener("focusin", dismiss, true);
		controls.remove();
	};
}
