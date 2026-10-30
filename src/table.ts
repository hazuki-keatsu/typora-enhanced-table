export interface CellRect {
  cell: HTMLTableCellElement
  top: number
  left: number
  bottom: number
  right: number
}

export function tableGrid(table: HTMLTableElement): CellRect[] {
  const occupied: boolean[][] = []
  const rects: CellRect[] = []
  Array.from(table.rows).forEach((row, top) => {
    let left = 0
    Array.from(row.cells).forEach(cell => {
      while (occupied[top]?.[left]) left++
      const bottom = cell.rowSpan === 0 || cell.getAttribute('rowspan') === '0'
        ? Array.from(table.rows).filter(r => r.parentElement === row.parentElement).length + top - row.sectionRowIndex - 1
        : top + cell.rowSpan - 1
      const right = left + cell.colSpan - 1
      if (bottom >= table.rows.length) throw Error('单元格跨越了表格边界。')
      for (let y = top; y <= bottom; y++) {
        if (table.rows[y].parentElement !== row.parentElement) throw Error('单元格不能跨越表头和表体。')
        occupied[y] ??= []
        for (let x = left; x <= right; x++) {
          if (occupied[y][x]) throw Error('表格存在重叠单元格。')
          occupied[y][x] = true
        }
      }
      rects.push({ cell, top, left, bottom, right })
      left = right + 1
    })
  })
  return rects
}

export function mergeCells(table: HTMLTableElement, selected: HTMLTableCellElement[]): HTMLTableCellElement {
  const rects = tableGrid(table)
  const chosen = rects.filter(r => selected.includes(r.cell))
  if (chosen.length < 2) throw Error('请按住 Shift 点击选择至少两个单元格。')
  const top = Math.min(...chosen.map(r => r.top))
  const left = Math.min(...chosen.map(r => r.left))
  const bottom = Math.max(...chosen.map(r => r.bottom))
  const right = Math.max(...chosen.map(r => r.right))
  if (table.rows[top].parentElement !== table.rows[bottom].parentElement) throw Error('不能跨越表头和表体合并。')
  const area = chosen.reduce((sum, r) => sum + (r.bottom - r.top + 1) * (r.right - r.left + 1), 0)
  if (area !== (bottom - top + 1) * (right - left + 1)) throw Error('请选择完整的矩形区域。')
  const first = chosen.find(r => r.top === top && r.left === left)!
  first.cell.rowSpan = bottom - top + 1
  first.cell.colSpan = right - left + 1
  chosen.filter(r => r !== first).forEach(r => {
    if (r.cell.innerHTML.trim()) {
      first.cell.appendChild(document.createElement('br'))
      while (r.cell.firstChild) first.cell.appendChild(r.cell.firstChild)
    }
    r.cell.remove()
  })
  return first.cell
}

export function splitCell(table: HTMLTableElement, cell: HTMLTableCellElement) {
  const rects = tableGrid(table)
  const rect = rects.find(r => r.cell === cell)
  if (!rect) throw Error('请选择表格内的单元格。')
  for (let y = rect.top; y <= rect.bottom; y++) {
    for (let x = rect.left; x <= rect.right; x++) {
      if (y === rect.top && x === rect.left) continue
      const next = rects.find(r => r.top === y && r.left > x)
      const empty = document.createElement(cell.tagName.toLowerCase())
      table.rows[y].insertBefore(empty, next?.cell ?? null)
    }
  }
  cell.removeAttribute('rowspan')
  cell.removeAttribute('colspan')
}
