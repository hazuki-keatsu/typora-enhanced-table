import assert from "node:assert/strict";
import { build } from "esbuild";
import { Window } from "happy-dom";

const window = new Window();
const { document } = window;
Object.defineProperty(window.navigator, "platform", {
	value: "MacIntel",
	configurable: true,
});
Object.defineProperty(globalThis, "navigator", {
	value: window.navigator,
	configurable: true,
});
globalThis.Node = window.Node;
globalThis.document = document;
globalThis.SVGSVGElement = window.SVGSVGElement;
const result = await build({
	entryPoints: ["src/controller.ts"],
	bundle: true,
	write: false,
	format: "esm",
});
const code = result.outputFiles[0].text;
const { attachTableController } = await import(
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>";
const table = document.querySelector("table");
let selected = false;
const calls = [];
let binding = "Ctrl+Enter";
const dispose = attachTableController(table, {
	hasSelection: () => selected,
	run: (operation) => calls.push(operation),
	hotkey: (operation) => (operation === "insert-below" ? binding : undefined),
});
const trigger = document.querySelector(".enhanced-table-controls > button");
trigger.click();
assert.match(
	document.querySelector('[data-operation="insert-below"]').textContent,
	/Ctrl\+Enter/,
);
binding = "ctrl+shift+backspace";
trigger.click();
trigger.click();
assert.equal(
	document.querySelectorAll(
		'[data-operation="insert-below"] .enhanced-table-hotkey svg',
	).length,
	3,
);
binding = "ctrl+shift+m";
trigger.click();
trigger.click();
assert.equal(
	document.querySelectorAll(
		'[data-operation="insert-below"] .enhanced-table-hotkey svg',
	).length,
	3,
);
assert.equal(
	document
		.querySelector('[data-operation="insert-below"] .enhanced-table-hotkey')
		.getAttribute("aria-label"),
	"ctrl+shift+m",
);
Object.defineProperty(window.navigator, "platform", {
	value: "Win32",
	configurable: true,
});
trigger.click();
trigger.click();
assert.equal(
	document.querySelector(
		'[data-operation="insert-below"] .enhanced-table-hotkey',
	).textContent,
	"Ctrl+Shift+M",
);
assert.equal(
	document.querySelectorAll(
		'[data-operation="insert-below"] .enhanced-table-hotkey svg',
	).length,
	0,
);
assert.equal(document.querySelectorAll("[data-operation]").length, 11);
assert.ok(
	[...document.querySelectorAll("[data-operation]")].every(
		(button) => button.disabled,
	),
);
assert.equal(
	document.querySelectorAll('[role="menu"] > [role="group"]').length,
	5,
);
assert.equal(document.querySelectorAll("details, summary").length, 0);

trigger.click();
selected = true;
binding = "Alt+R";
trigger.click();
assert.match(
	document.querySelector('[data-operation="insert-below"]').textContent,
	/Alt\+R/,
);
document.querySelector('[data-operation="delete-row"]').click();
assert.deepEqual(calls, ["delete-row"]);
assert.equal(document.querySelector("[role=menu]").hidden, true);

trigger.click();
document.body.dispatchEvent(
	new window.MouseEvent("mousedown", { bubbles: true }),
);
assert.equal(document.querySelector("[role=menu]").hidden, true);
dispose();
assert.equal(document.querySelector("[data-enhanced-table-controls]"), null);
console.log(
	"PASS table controller: selection gate, operations, dismissal, disposal",
);
await window.happyDOM.close();
