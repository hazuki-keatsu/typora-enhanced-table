import './style.scss'
import { Plugin } from '@typora-community-plugin/core'
import { editor } from 'typora'
import { mergeCells, splitCell, tableGrid } from './table'

interface HtmlBlockAPI {
  startEditing(cid: string): { setValue(value: string): void } | undefined
  stopEditing(cid: string): void
}

function htmlBlockAPI(): HtmlBlockAPI {
  // shortcut: Typora exposes no public HTML write API; recheck this adapter after upgrades.
  if (!('htmlBlock' in editor)) throw Error('当前 Typora 不提供 HTML 编辑接口。')
  const api = editor.htmlBlock
  if (!api || typeof api !== 'object' || !('startEditing' in api) || !('stopEditing' in api)
    || typeof api.startEditing !== 'function' || typeof api.stopEditing !== 'function') {
    throw Error('当前 Typora 的 HTML 编辑接口不兼容。')
  }
  return api as HtmlBlockAPI
}

export default class EnhancedTable extends Plugin {
  private closeEditor: (() => void) | undefined
  private merge: (() => void) | undefined
  private split: (() => void) | undefined
  private target: HTMLElement | undefined

  onload() {
    const modifier = /Mac/.test(navigator.platform) ? 'meta' : 'ctrl'
    this.registerCommand({ id: 'edit', title: '编辑 HTML 表格', scope: 'editor', hotkey: `${modifier}+shift+e`, callback: () => this.openTarget() })
    this.registerCommand({ id: 'merge', title: '合并单元格', scope: 'global', hotkey: `${modifier}+shift+m`, callback: () => this.merge?.() })
    this.registerDomEvent(document, 'mousedown', (event: MouseEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('#write .md-htmlblock table')) {
        this.target = event.target
        if (event.button === 0) { event.preventDefault(); event.stopImmediatePropagation(); this.openTarget() }
      }
      else if (event.button === 2) this.target = undefined
    }, true)
    this.registerDomEvent(document, 'click', (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest('#write .md-htmlblock table')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.target = event.target
      this.openTarget()
    }, true)

  }

  onunload() { this.closeEditor?.() }

  private openTarget() {
    if (this.closeEditor) return
    const block = this.target?.closest<HTMLElement>('.md-htmlblock')
      ?? document.querySelector<HTMLElement>('#write .md-htmlblock.md-focus')
    const cid = block?.getAttribute('cid')
    if (!block || !cid) return
    try { this.open(block, cid) } catch (error) { window.alert(String(error)) }
  }

  private open(block: HTMLElement, cid: string) {
    const api = htmlBlockAPI()
    const original = editor.getNode(cid).get('text')
    if (typeof original !== 'string') throw Error('无法读取表格源内容。')
    const parsed = new DOMParser().parseFromString(original, 'text/html')
    const sourceTable = parsed.body.firstElementChild
    if (!(sourceTable instanceof HTMLTableElement) || parsed.body.children.length !== 1 || parsed.head.children.length || Array.from(parsed.body.childNodes).some(node => node !== sourceTable && node.textContent?.trim()) || sourceTable.querySelector('table')) {
      throw Error('仅支持独立的 HTML table，不支持嵌套表格。')
    }
    if (sourceTable.querySelector('[contenteditable], [tabindex], [data-enhanced-table-selected]')) throw Error('该表格使用了编辑器保留属性，无法安全编辑。')
    tableGrid(sourceTable)
    const overlay = document.createElement('div')
    overlay.className = 'enhanced-table-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.style.top = `${Math.max(8, block.getBoundingClientRect().top)}px`
    overlay.style.left = `${Math.max(8, block.getBoundingClientRect().left)}px`
    overlay.setAttribute('aria-label', '编辑 HTML 表格')
    const panel = document.createElement('div')
    panel.className = 'enhanced-table-panel'
    const toolbar = document.createElement('div')
    toolbar.className = 'enhanced-table-toolbar'
    const hint = document.createElement('p')
    hint.textContent = '直接输入编辑内容；Shift 点击选择多个单元格。合并后保留所有内容，拆分后内容留在左上角。'
    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    // Render through Typora's sanitized preview, never execute raw document HTML in the app.
    const preview = block.querySelector('table')
    if (!preview) throw Error('Typora 尚未渲染表格，请退出源码模式后重试。')
    const table = preview.cloneNode(true)
    if (!(table instanceof HTMLTableElement)) throw Error('无法读取表格预览。')
    if (sourceTable.outerHTML !== table.outerHTML) throw Error('Typora 预览修改了表格内容或属性；为避免数据丢失，此表格保留源码编辑。')
    let anchor: HTMLTableCellElement | undefined
    let selected: HTMLTableCellElement[] = []
    const select = (cells: HTMLTableCellElement[]) => {
      selected.forEach(c => c.removeAttribute('data-enhanced-table-selected'))
      selected = cells
      selected.forEach(c => c.setAttribute('data-enhanced-table-selected', ''))
    }
    const prepare = () => Array.from(table.rows).forEach(row => Array.from(row.cells).forEach(cell => {
      cell.contentEditable = 'true'
      cell.setAttribute('tabindex', '0')
    }))
    const perform = (operation: () => void) => {
      try { operation(); prepare(); status.textContent = '' } catch (error) { status.textContent = String(error) }
    }
    this.merge = () => perform(() => select([mergeCells(table, selected)]))
    this.split = () => perform(() => { if (selected.length === 1) splitCell(table, selected[0]); else throw Error('请选择一个单元格。') })
    const close = () => {
      contextMenu.remove()
      overlay.remove()
      this.merge = this.split = this.closeEditor = undefined
      block.focus()
    }
    this.closeEditor = close
    const button = (label: string, action: () => void) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = label
      el.onclick = action
      toolbar.append(el)
    }
    button('合并单元格', this.merge)
    button('拆分单元格', this.split)
    button('保存', () => perform(() => {
      if (!block.isConnected || editor.getNode(cid).get('text') !== original) throw Error('文档已改变，请取消后重新编辑。')
      const output = table.cloneNode(true) as HTMLTableElement
      output.querySelectorAll('td, th').forEach(cell => {
        cell.removeAttribute('contenteditable')
        cell.removeAttribute('tabindex')
        cell.removeAttribute('data-enhanced-table-selected')
      })
      const cm = api.startEditing(cid)
      if (!cm) throw Error('文档已锁定或无法进入编辑状态。')
      cm.setValue(output.outerHTML)
      api.stopEditing(cid)
      close()
    }))
    button('取消', close)
    table.addEventListener('click', event => {
      if (!(event.target instanceof HTMLElement)) return
      if (event.target.closest('a, button, input, select')) event.preventDefault()
      const cell = event.target.closest('td, th')
      if (!(cell instanceof HTMLTableCellElement)) return
      if (event.shiftKey && anchor) {
        event.preventDefault()
        const rects = tableGrid(table)
        const start = rects.find(r => r.cell === anchor)
        const end = rects.find(r => r.cell === cell)
        if (start && end) select(rects.filter(r => r.bottom >= Math.min(start.top, end.top) && r.top <= Math.max(start.bottom, end.bottom) && r.right >= Math.min(start.left, end.left) && r.left <= Math.max(start.right, end.right)).map(r => r.cell))
      } else { anchor = cell; select([cell]) }
    })
    table.addEventListener('paste', event => {
      event.preventDefault()
      document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '')
    })
    table.addEventListener('drop', event => event.preventDefault())
    const contextMenu = document.createElement('div')
    contextMenu.className = 'enhanced-table-context-menu'
    contextMenu.hidden = true
    for (const [label, action] of [['合并单元格', this.merge], ['拆分单元格', this.split]] as const) {
      const item = document.createElement('button')
      item.textContent = label
      item.onclick = () => { contextMenu.hidden = true; action() }
      contextMenu.append(item)
    }
    table.addEventListener('contextmenu', event => {
      event.preventDefault()
      contextMenu.hidden = false
      contextMenu.style.left = `${event.clientX}px`
      contextMenu.style.top = `${event.clientY}px`
    })
    overlay.addEventListener('mousedown', event => { if (event.target instanceof Node && !contextMenu.contains(event.target)) contextMenu.hidden = true })
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, [contenteditable="true"]'))
        const index = focusable.indexOf(document.activeElement as HTMLElement)
        event.preventDefault()
        focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus()
      }
    })
    panel.append(toolbar, hint, table, status, contextMenu)
    overlay.append(panel)
    document.body.append(overlay)
    prepare()
    table.rows[0]?.cells[0]?.focus()
  }
}
