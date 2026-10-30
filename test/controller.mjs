import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";
import { Window } from "happy-dom";

const window = new Window();
const { document } = window;
globalThis.Node = window.Node;
const { code } = await transform(
	await fs.readFile("src/controller.ts", "utf8"),
	{
		loader: "ts",
		format: "esm",
	},
);
const { attachTableController } = await import(
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
document.body.innerHTML = "<table><tbody><tr><td>A</td></tr></tbody></table>";
const table = document.querySelector("table");
let selected = false;
const calls = [];
const dispose = attachTableController(table, {
	hasSelection: () => selected,
	run: (operation) => calls.push(operation),
});
const trigger = document.querySelector(".enhanced-table-controls > button");
trigger.click();
assert.equal(document.querySelectorAll("[data-operation]").length, 7);
assert.ok(
	[...document.querySelectorAll("[data-operation]")].every(
		(button) => button.disabled,
	),
);
assert.equal(document.querySelector("[role=status]").hidden, false);

trigger.click();
selected = true;
trigger.click();
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
