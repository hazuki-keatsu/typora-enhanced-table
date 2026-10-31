import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";
import { Window } from "happy-dom";

const window = new Window();
globalThis.document = window.document;
globalThis.HTMLTableElement = window.HTMLTableElement;
const { code } = await transform(await fs.readFile("src/table.ts", "utf8"), {
	loader: "ts",
	format: "esm",
});
const { applyTableOperation, tableGrid } = await import(
	`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

function table(html) {
	window.document.body.innerHTML = html;
	return window.document.querySelector("table");
}

let value = table(
	"<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>",
);
applyTableOperation(value, value.rows[0].cells[1], "insert-above");
assert.equal(value.rows.length, 2);
assert.equal(value.rows[0].cells.length, 2);
assert.ok(
	[...value.rows[0].cells].every(
		(cell) => cell.rowSpan === 1 && cell.colSpan === 1,
	),
);

applyTableOperation(value, value.rows[1].cells[0], "insert-right");
assert.equal(
	tableGrid(value).reduce((width, rect) => Math.max(width, rect.right + 1), 0),
	3,
);
assert.ok([...value.rows].every((row) => row.cells.length === 3));

value = table(
	'<table><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
);
const before = value.outerHTML;
assert.throws(
	() => applyTableOperation(value, value.rows[1].cells[0], "insert-above"),
	/insertRowCrossesMerge/,
);
assert.equal(value.outerHTML, before, "rejected inserts are atomic");

value = table(
	'<table><tbody><tr><td colspan="2">A</td></tr><tr><td>B</td><td>C</td></tr></tbody></table>',
);
assert.throws(
	() => applyTableOperation(value, value.rows[1].cells[1], "insert-left"),
	/insertColumnCrossesMerge/,
);

value = table(
	'<table><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr><tr><td>D</td><td>E</td></tr></tbody></table>',
);
applyTableOperation(value, value.rows[0].cells[0], "delete-row");
assert.equal(value.rows.length, 1);
assert.equal(value.textContent, "DE");

value = table(
	'<table><tbody><tr><td colspan="2">A</td><td>B</td></tr><tr><td>C</td><td>D</td><td>E</td></tr></tbody></table>',
);
applyTableOperation(value, value.rows[0].cells[0], "delete-column");
assert.equal(value.rows[0].cells.length, 1);
assert.equal(value.rows[1].cells.length, 1);
assert.equal(value.textContent, "BE");

value = table(
	"<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>",
);
const selected = applyTableOperation(
	value,
	value.rows[0].cells[0],
	"set-header",
);
assert.equal(value.querySelectorAll("thead > tr").length, 1);
assert.equal(value.querySelector("thead > tr")?.cells[0].tagName, "TH");
assert.equal(selected.tagName, "TH");
assert.throws(
	() => applyTableOperation(value, value.rows[1].cells[0], "set-header"),
	/headerFirstRowOnly/,
);

value = table(
	'<table><tbody><tr><td rowspan="2">A</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>',
);
assert.throws(
	() => applyTableOperation(value, value.rows[0].cells[1], "set-header"),
	/headerVerticalMerge/,
);
assert.equal(value.tHead, null, "rejected header conversion is atomic");

console.log(
	"PASS table structure: insert, delete, header conversion, atomic validation",
);
await window.happyDOM.close();
