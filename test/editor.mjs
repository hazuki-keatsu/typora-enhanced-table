import assert from "node:assert/strict";
import { build } from "esbuild";
import { Window } from "happy-dom";

const result = await build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	write: false,
	format: "iife",
	globalName: "TablePlugin",
	plugins: [
		{
			name: "host-boundary",
			setup(build) {
				build.onResolve(
					{ filter: /^(@typora-community-plugin\/core|typora)$/ },
					(args) => ({ path: args.path, namespace: "host" }),
				);
				build.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({
					contents:
						args.path === "typora"
							? "export const editor = globalThis.hostEditor; export const File = globalThis.hostFile"
							: `export class HtmlPostProcessor { static from(options) { return options } }
        export class HtmlExportProcessor { static from(options) { return options } }
        export class Plugin {
          commands = []; disposables = []; processors = []; exporters = [];
          app = { features: { exporter: { register: processor => { this.exporters.push(processor); return () => {} } } } };
          register(dispose) { this.disposables.push(dispose) }
          registerCommand(command) {
            this.commands.push(command)
            this.registerDomEvent(globalThis.hostEditor.writingArea, 'keyup', event => {
              const hotkey = [event.metaKey && 'meta', event.ctrlKey && 'ctrl', event.shiftKey && 'shift', event.altKey && 'alt', event.key.toLowerCase()].filter(Boolean).join('+')
              if (hotkey === command.hotkey) command.callback()
            })
          }
          registerMarkdownPostProcessor(processor) { this.processors.push(processor) }
          registerDomEvent(target, name, callback, options) {
            target.addEventListener(name, callback, options);
            this.disposables.push(() => target.removeEventListener(name, callback, options));
          }
          unload() { this.onunload(); this.disposables.forEach(dispose => dispose()) }
        }`,
					loader: "js",
				}));
				build.onLoad({ filter: /\.scss$/ }, () => ({
					contents: "",
					loader: "js",
				}));
			},
		},
	],
});
const window = new Window();
const { document } = window;
Object.defineProperty(window.navigator, "platform", { value: "MacIntel" });
const original =
	"<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>";
let source = original;
const commands = [];
const alerts = [];
let failRegister = false;
const node = {
	get: () => source,
	set: (_key, text) => {
		source = text;
	},
};
window.hostFile = { isLocked: false };
window.hostEditor = {
	getNode: () => node,
	sourceView: { inSourceMode: false },
	undo: {
		UndoManager: {
			buildReplaceUndo: () => ({
				type: "replace",
				id: "n1",
				json: { content: { text: source } },
			}),
		},
		register(command) {
			if (failRegister) throw Error("register failed");
			commands.push(command);
		},
	},
};
window.alert = (message) => alerts.push(message);
window.eval(result.outputFiles[0].text);
let plugin;
function setup(preview = source) {
	if (plugin) plugin.unload();
	document.body.innerHTML = `<div id="write"><div class="md-htmlblock" cid="n1"><div class="md-htmlblock-container">${preview}</div></div></div>`;
	window.hostEditor.writingArea = document.querySelector("#write");
	plugin = new window.TablePlugin.default();
	plugin.onload();
	return document.querySelector("table");
}
function mouse(cell, shiftKey = false, button = 0) {
	const event = new window.MouseEvent("mousedown", {
		bubbles: true,
		cancelable: true,
		shiftKey,
		button,
	});
	cell.dispatchEvent(event);
	return event;
}
function input(cell, text, isComposing = false) {
	cell.textContent = text;
	cell.dispatchEvent(
		new window.InputEvent("input", { bubbles: true, isComposing }),
	);
}
function command(id) {
	plugin.commands.find((c) => c.id === id).callback();
}
function processAgain() {
	plugin.processors.forEach((p) => {
		document.querySelectorAll(p.selector).forEach((el) => {
			p.process(el, { containerEl: window.hostEditor.writingArea });
		});
	});
}
try {
	let table = setup();
	assert.ok(
		!document.querySelector(".enhanced-table-overlay, .enhanced-table-toolbar"),
		"inline edit never opens overlay or toolbar",
	);
	assert.equal(
		table.rows[0].cells[0].contentEditable,
		"true",
		"initial scan enables original cells",
	);
	const cell = table.rows[0].cells[0];
	let nativeMouse = 0;
	document
		.querySelector("#write")
		.addEventListener("mousedown", () => nativeMouse++);
	const down = mouse(cell);
	assert.equal(
		down.defaultPrevented,
		false,
		"ordinary editing retains browser caret placement",
	);
	assert.equal(nativeMouse, 0, "Typora source editor receives no mousedown");
	for (const name of [
		"copy",
		"cut",
		"keypress",
		"compositionstart",
		"compositionupdate",
		"compositionend",
	]) {
		let nativeHandler = 0;
		document
			.querySelector("#write")
			.addEventListener(name, () => nativeHandler++);
		const event = new window.Event(name, { bubbles: true, cancelable: true });
		cell.dispatchEvent(event);
		assert.equal(
			nativeHandler,
			0,
			`${name} cannot reach native Markdown block handling`,
		);
		assert.equal(
			event.defaultPrevented,
			false,
			`${name} retains browser default behavior`,
		);
	}
	const range = document.createRange();
	range.selectNodeContents(cell);
	range.collapse(false);
	window.getSelection().addRange(range);
	input(cell, "Edited");
	assert.equal(
		document.querySelector("table"),
		table,
		"typing retains original table identity",
	);
	assert.equal(
		window.getSelection().anchorNode,
		cell,
		"commit never resets the selection container",
	);
	assert.match(source, />Edited</);
	assert.equal(commands.length, 1);
	assert.equal(commands[0].undo[0].id, "n1");
	assert.equal(commands[0].undo[0].json.content.text, original);
	assert.equal(commands[0].redo[0].json.content.text, source);
	assert.doesNotMatch(source, /contenteditable|data-enhanced-table/);
	const decorated = table.outerHTML;
	processAgain();
	assert.equal(table.outerHTML, decorated, "postprocessor is idempotent");
	let nativeSave = 0;
	document.querySelector("#write").addEventListener("keydown", (event) => {
		if (event.key === "s") nativeSave++;
	});
	cell.dispatchEvent(
		new window.KeyboardEvent("keydown", {
			key: "s",
			metaKey: true,
			bubbles: true,
			cancelable: true,
		}),
	);
	assert.equal(
		nativeSave,
		1,
		"save shortcut reaches native handler with current model",
	);
	mouse(cell);
	mouse(table.rows[1].cells[1], true);
	assert.equal(
		table.querySelectorAll("[data-enhanced-table-selected]").length,
		4,
	);
	let nativeContext = 0;
	document
		.querySelector("#write")
		.addEventListener("contextmenu", () => nativeContext++);
	const context = new window.MouseEvent("contextmenu", {
		bubbles: true,
		cancelable: true,
	});
	cell.dispatchEvent(context);
	assert.equal(
		context.defaultPrevented,
		false,
		"native context menu remains available",
	);
	assert.equal(nativeContext, 1, "contextmenu reaches the original handler");
	assert.equal(document.querySelector(".enhanced-table-context-menu"), null);
	const keyCommands = commands.length;
	cell.dispatchEvent(
		new window.KeyboardEvent("keydown", {
			key: "m",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		}),
	);
	assert.equal(
		commands.length,
		keyCommands,
		"keydown must not invoke merge outside the core registry",
	);
	let coreKeyup = 0;
	document.querySelector("#write").addEventListener("keyup", () => coreKeyup++);
	cell.dispatchEvent(
		new window.KeyboardEvent("keyup", {
			key: "m",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
		}),
	);
	assert.equal(coreKeyup, 1, "keyup reaches the community hotkey registry");
	assert.equal(commands.length, keyCommands + 1);
	assert.equal(table.querySelectorAll("td").length, 1);
	assert.equal(table.rows[0].cells[0].textContent, "EditedBCD");
	assert.match(source, /rowspan="2"/);
	command("split");
	assert.equal(table.rows[1].cells.length, 2);
	assert.equal(document.querySelector("table"), table);
	const lastCell = table.rows[1].cells[1];
	mouse(lastCell);
	const leaveTable = new window.KeyboardEvent("keydown", {
		key: "Tab",
		bubbles: true,
		cancelable: true,
	});
	lastCell.dispatchEvent(leaveTable);
	assert.equal(
		leaveTable.defaultPrevented,
		false,
		"Tab at table boundary must not trap keyboard focus",
	);
	mouse(cell);
	const beforeComposition = commands.length;
	cell.dispatchEvent(
		new window.CompositionEvent("compositionstart", { bubbles: true }),
	);
	input(cell, "输入中", true);
	const compositionSave = new window.KeyboardEvent("keydown", {
		key: "s",
		metaKey: true,
		bubbles: true,
		cancelable: true,
	});
	cell.dispatchEvent(compositionSave);
	assert.equal(
		compositionSave.defaultPrevented,
		true,
		"save waits for composition completion",
	);
	assert.equal(
		commands.length,
		beforeComposition,
		"IME intermediate input is not persisted",
	);
	cell.dispatchEvent(
		new window.CompositionEvent("compositionend", { bubbles: true }),
	);
	assert.equal(commands.length, beforeComposition + 1);
	assert.match(source, /输入中/);
	cell.dispatchEvent(new window.InputEvent("input", { bubbles: true }));
	assert.equal(
		commands.length,
		beforeComposition + 1,
		"trailing composition input adds no duplicate undo",
	);
	const exportDoc = new window.DOMParser().parseFromString(
		document.body.innerHTML,
		"text/html",
	);
	plugin.exporters.forEach((p) => {
		p.process({ doc: exportDoc });
	});
	assert.doesNotMatch(
		exportDoc.querySelector("table").outerHTML,
		/contenteditable|data-enhanced-table/,
	);
	const snapshots = commands.length;
	source = "<table><tbody><tr><td>External change</td></tr></tbody></table>";
	input(cell, "Recoverable");
	assert.equal(commands.length, snapshots, "conflict refuses overwrite");
	assert.match(source, /External change/);
	assert.match(alerts.at(-1), /文档已改变/);
	assert.equal(
		cell.textContent,
		"Recoverable",
		"failed input stays available to copy",
	);
	plugin.unload();
	plugin = undefined;
	assert.doesNotMatch(table.outerHTML, /contenteditable|data-enhanced-table/);
	source = original;
	table = setup(source.replace(">A<", ">Mismatch<"));
	assert.equal(
		table.rows[0].cells[0].hasAttribute("contenteditable"),
		false,
		"sanitized mismatch stays native",
	);
	source = original;
	table = setup();
	mouse(table.rows[0].cells[0]);
	window.hostFile.isLocked = true;
	const blocked = new window.InputEvent("beforeinput", {
		bubbles: true,
		cancelable: true,
	});
	table.rows[0].cells[0].dispatchEvent(blocked);
	assert.equal(blocked.defaultPrevented, true, "locked document blocks input");
	window.hostFile.isLocked = false;
	window.hostEditor.sourceView.inSourceMode = true;
	const sourceMode = new window.InputEvent("beforeinput", {
		bubbles: true,
		cancelable: true,
	});
	table.rows[0].cells[0].dispatchEvent(sourceMode);
	assert.equal(sourceMode.defaultPrevented, true);
	window.hostEditor.sourceView.inSourceMode = false;
	failRegister = true;
	input(table.rows[0].cells[0], "Failed write");
	assert.equal(
		source,
		original,
		"failed undo registration rolls back model text",
	);
	failRegister = false;
	input(table.rows[0].cells[0], "Retry");
	assert.match(source, /Retry/);
	const last = commands.at(-1);
	let undoCalls = 0;
	window.hostEditor.undo.undo = () => {
		undoCalls++;
		source = last.undo[0].json.content.text;
		document.querySelector(".md-htmlblock-container").innerHTML = source;
		processAgain();
	};
	const undoKey = new window.KeyboardEvent("keydown", {
		key: "z",
		metaKey: true,
		bubbles: true,
		cancelable: true,
	});
	table.rows[0].cells[0].dispatchEvent(undoKey);
	assert.equal(undoCalls, 1, "keyboard undo routes to Typora snapshots");
	assert.equal(
		undoKey.defaultPrevented,
		true,
		"browser undo cannot mutate cell behind model",
	);
	const redo = commands.at(-1).redo[0].json.content.text;
	source = commands.at(-1).undo[0].json.content.text;
	document.querySelector(".md-htmlblock-container").innerHTML = source;
	processAgain();
	assert.equal(
		document.querySelector("td").contentEditable,
		"true",
		"native undo rerender is enabled again",
	);
	source = redo;
	document.querySelector(".md-htmlblock-container").innerHTML = source;
	processAgain();
	assert.equal(
		document.querySelector("td").contentEditable,
		"true",
		"native redo rerender is enabled again",
	);
	document.querySelector(".md-htmlblock-container").innerHTML = source;
	await new Promise((resolve) => setTimeout(resolve, 10));
	assert.equal(
		document.querySelector("td").contentEditable,
		"true",
		"render replacement rebinds without a core edit notification",
	);
	source = original;
	table = setup();
	mouse(table.rows[0].cells[0]);
	mouse(table.rows[1].cells[1], true);
	plugin.commands.find((c) => c.id === "merge").hotkey = "ctrl+shift+k";
	const beforeRebind = commands.length;
	const firstCell = table.rows[0].cells[0];
	firstCell.dispatchEvent(
		new window.KeyboardEvent("keydown", {
			key: "m",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
		}),
	);
	firstCell.dispatchEvent(
		new window.KeyboardEvent("keyup", {
			key: "m",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
		}),
	);
	assert.equal(
		commands.length,
		beforeRebind,
		"old binding cannot merge after customization",
	);
	firstCell.dispatchEvent(
		new window.KeyboardEvent("keyup", {
			key: "k",
			ctrlKey: true,
			shiftKey: true,
			bubbles: true,
		}),
	);
	assert.equal(
		commands.length,
		beforeRebind + 1,
		"customized binding runs through the core registry",
	);
	console.log(
		"PASS inline editor: live DOM, input persistence, native snapshots, merge/split, IME, export, conflict, locks, rollback, undo/redo rerender",
	);
} finally {
	plugin?.unload();
	await window.happyDOM.close();
}
