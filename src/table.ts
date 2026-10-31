export interface CellRect {
	cell: HTMLTableCellElement;
	top: number;
	left: number;
	bottom: number;
	right: number;
}

export type TableOperation =
	| "insert-above"
	| "insert-below"
	| "insert-left"
	| "insert-right"
	| "delete-row"
	| "delete-column"
	| "set-header";

export function tableGrid(table: HTMLTableElement): CellRect[] {
	const occupied: boolean[][] = [];
	const rects: CellRect[] = [];
	Array.from(table.rows).forEach((row, top) => {
		let left = 0;
		Array.from(row.cells).forEach((cell) => {
			while (occupied[top]?.[left]) left++;
			const bottom =
				cell.rowSpan === 0 || cell.getAttribute("rowspan") === "0"
					? Array.from(table.rows).filter(
							(r) => r.parentElement === row.parentElement,
						).length +
						top -
						row.sectionRowIndex -
						1
					: top + cell.rowSpan - 1;
			const right = left + cell.colSpan - 1;
			if (bottom >= table.rows.length) throw Error("cellOutsideTable");
			for (let y = top; y <= bottom; y++) {
				if (table.rows[y].parentElement !== row.parentElement)
					throw Error("cellCrossesSections");
				occupied[y] ??= [];
				for (let x = left; x <= right; x++) {
					if (occupied[y][x]) throw Error("overlappingCells");
					occupied[y][x] = true;
				}
			}
			rects.push({ cell, top, left, bottom, right });
			left = right + 1;
		});
	});
	return rects;
}

export function mergeCells(
	table: HTMLTableElement,
	selected: HTMLTableCellElement[],
): HTMLTableCellElement {
	const rects = tableGrid(table);
	const chosen = rects.filter((r) => selected.includes(r.cell));
	if (chosen.length < 2) throw Error("selectMultipleCells");
	const top = Math.min(...chosen.map((r) => r.top));
	const left = Math.min(...chosen.map((r) => r.left));
	const bottom = Math.max(...chosen.map((r) => r.bottom));
	const right = Math.max(...chosen.map((r) => r.right));
	if (table.rows[top].parentElement !== table.rows[bottom].parentElement)
		throw Error("mergeAcrossSections");
	const area = chosen.reduce(
		(sum, r) => sum + (r.bottom - r.top + 1) * (r.right - r.left + 1),
		0,
	);
	if (area !== (bottom - top + 1) * (right - left + 1))
		throw Error("selectRectangle");
	const first = chosen[0];
	first.cell.rowSpan = bottom - top + 1;
	first.cell.colSpan = right - left + 1;
	let contentRow = top;
	chosen
		.filter((r) => r !== first)
		.forEach((r) => {
			if (r.top !== contentRow) {
				first.cell.appendChild(document.createElement("br"));
				contentRow = r.top;
			}
			while (r.cell.firstChild) first.cell.appendChild(r.cell.firstChild);
			r.cell.remove();
		});
	return first.cell;
}

export function splitCell(table: HTMLTableElement, cell: HTMLTableCellElement) {
	const rects = tableGrid(table);
	const rect = rects.find((r) => r.cell === cell);
	if (!rect) throw Error("selectTableCell");
	for (let y = rect.top; y <= rect.bottom; y++) {
		for (let x = rect.left; x <= rect.right; x++) {
			if (y === rect.top && x === rect.left) continue;
			const next = rects.find((r) => r.top === y && r.left > x);
			const empty = document.createElement(cell.tagName.toLowerCase());
			table.rows[y].insertBefore(empty, next?.cell ?? null);
		}
	}
	cell.removeAttribute("rowspan");
	cell.removeAttribute("colspan");
}

function structure(table: HTMLTableElement, cell: HTMLTableCellElement) {
	const rects = tableGrid(table);
	const selected = rects.find((rect) => rect.cell === cell);
	if (!selected) throw Error("selectTableCell");
	const width = Math.max(...rects.map((rect) => rect.right)) + 1;
	for (let row = 0; row < table.rows.length; row++) {
		for (let column = 0; column < width; column++) {
			if (
				!rects.some(
					(rect) =>
						rect.top <= row &&
						rect.bottom >= row &&
						rect.left <= column &&
						rect.right >= column,
				)
			)
				throw Error("tableNotRectangular");
		}
	}
	return { rects, selected, width };
}

function crossesRow(rect: CellRect, boundary: number) {
	return rect.top < boundary && rect.bottom >= boundary;
}

function crossesColumn(rect: CellRect, boundary: number) {
	return rect.left < boundary && rect.right >= boundary;
}

function cellAt(
	table: HTMLTableElement,
	row: number,
	column: number,
): HTMLTableCellElement {
	const rects = tableGrid(table);
	const found = rects.find(
		(rect) =>
			rect.top <= row &&
			rect.bottom >= row &&
			rect.left <= column &&
			rect.right >= column,
	);
	if (!found) throw Error("invalidTable");
	return found.cell;
}

function insertRow(
	table: HTMLTableElement,
	selected: CellRect,
	width: number,
	above: boolean,
) {
	const boundary = above ? selected.top : selected.bottom + 1;
	if (tableGrid(table).some((rect) => crossesRow(rect, boundary)))
		throw Error("insertRowCrossesMerge");
	const reference = table.rows[above ? selected.top : selected.bottom];
	const section = reference.parentElement;
	if (!section || !["THEAD", "TBODY", "TFOOT"].includes(section.tagName))
		throw Error("rowPositionUnknown");
	const row = (section as HTMLTableSectionElement).insertRow(
		reference.sectionRowIndex + (above ? 0 : 1),
	);
	for (let column = 0; column < width; column++) row.insertCell();
	return row.cells[Math.min(selected.left, width - 1)];
}

function insertColumn(
	table: HTMLTableElement,
	selected: CellRect,
	left: boolean,
) {
	const rects = tableGrid(table);
	const boundary = left ? selected.left : selected.right + 1;
	if (rects.some((rect) => crossesColumn(rect, boundary)))
		throw Error("insertColumnCrossesMerge");
	let result: HTMLTableCellElement | undefined;
	Array.from(table.rows).forEach((row, top) => {
		const next = rects.find(
			(rect) => rect.top === top && rect.left >= boundary,
		)?.cell;
		const cell = document.createElement("td");
		row.insertBefore(cell, next ?? null);
		if (top === selected.top) result = cell;
	});
	if (!result) throw Error("columnPositionUnknown");
	return result;
}

function deleteRows(
	table: HTMLTableElement,
	selected: CellRect,
	rects: CellRect[],
) {
	if (selected.top === 0 && selected.bottom === table.rows.length - 1)
		throw Error("deleteAllRows");
	if (
		rects.some(
			(rect) =>
				crossesRow(rect, selected.top) || crossesRow(rect, selected.bottom + 1),
		)
	)
		throw Error("deleteRowCrossesMerge");
	for (let row = selected.bottom; row >= selected.top; row--)
		table.rows[row].remove();
	return cellAt(
		table,
		Math.min(selected.top, table.rows.length - 1),
		selected.left,
	);
}

function deleteColumns(
	table: HTMLTableElement,
	selected: CellRect,
	rects: CellRect[],
	width: number,
) {
	if (selected.left === 0 && selected.right === width - 1)
		throw Error("deleteAllColumns");
	if (
		rects.some(
			(rect) =>
				crossesColumn(rect, selected.left) ||
				crossesColumn(rect, selected.right + 1),
		)
	)
		throw Error("deleteColumnCrossesMerge");
	for (const rect of rects)
		if (rect.left >= selected.left && rect.right <= selected.right)
			rect.cell.remove();
	return cellAt(
		table,
		Math.min(selected.top, table.rows.length - 1),
		Math.min(selected.left, width - (selected.right - selected.left + 1) - 1),
	);
}

function replaceCell(
	cell: HTMLTableCellElement,
	tag: "th" | "td",
): HTMLTableCellElement {
	if (cell.tagName.toLowerCase() === tag) return cell;
	const replacement = document.createElement(tag);
	for (const attribute of Array.from(cell.attributes))
		replacement.setAttribute(attribute.name, attribute.value);
	while (cell.firstChild) replacement.append(cell.firstChild);
	cell.replaceWith(replacement);
	return replacement;
}

function setHeader(
	table: HTMLTableElement,
	selected: CellRect,
	rects: CellRect[],
) {
	if (selected.top !== 0) throw Error("headerFirstRowOnly");
	if (rects.some((rect) => rect.top === 0 && rect.bottom > 0))
		throw Error("headerVerticalMerge");
	const row = table.rows[0];
	const selectedIndex = Array.from(row.cells).indexOf(selected.cell);
	const cells = Array.from(row.cells).map((cell) => replaceCell(cell, "th"));
	if (row.parentElement !== table.tHead) {
		const previousSection = row.parentElement;
		const head = table.tHead ?? table.createTHead();
		head.append(row);
		if (
			previousSection?.tagName === "TBODY" &&
			previousSection.querySelectorAll(":scope > tr").length === 0
		)
			previousSection.remove();
	}
	return cells[selectedIndex];
}

export function applyTableOperation(
	table: HTMLTableElement,
	cell: HTMLTableCellElement,
	operation: TableOperation,
): HTMLTableCellElement {
	const { rects, selected, width } = structure(table, cell);
	switch (operation) {
		case "insert-above":
			return insertRow(table, selected, width, true);
		case "insert-below":
			return insertRow(table, selected, width, false);
		case "insert-left":
			return insertColumn(table, selected, true);
		case "insert-right":
			return insertColumn(table, selected, false);
		case "delete-row":
			return deleteRows(table, selected, rects);
		case "delete-column":
			return deleteColumns(table, selected, rects, width);
		case "set-header":
			return setHeader(table, selected, rects);
	}
}
