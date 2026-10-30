import './style.scss'
import { Plugin, HtmlPostProcessor, HtmlExportProcessor } from '@typora-community-plugin/core'
import { editor, File } from 'typora'
import { mergeCells, splitCell, tableGrid } from './table'

type EditorNode = ReturnType<typeof editor.getNode>
type Snapshot = { type: 'replace'; id: string; json: unknown }
type NativeUndo = { UndoManager: { buildReplaceUndo(node: EditorNode): Snapshot }; register(command: { undo: Snapshot[]; redo: Snapshot[] }): void; endSnap?(discard: boolean): void; undo?(): void; redo?(): void }
type Session = { cid: string; node: EditorNode; table: HTMLTableElement; lastCommitted: string; selected: HTMLTableCellElement[]; anchor: HTMLTableCellElement | undefined; composing: boolean }
const marker = 'data-enhanced-table'
const selectedMarker = 'data-enhanced-table-selected'

function clean(table: HTMLTableElement) {
  const copy = table.cloneNode(true)
  if (!(copy instanceof HTMLTableElement)) throw Error('无法读取表格。')
  copy.removeAttribute(marker)
  copy.querySelectorAll('td, th').forEach(cell => {
    cell.removeAttribute('contenteditable')
    cell.removeAttribute(selectedMarker)
  })
  return copy.outerHTML
}

function writable() {
  return !('isLocked' in File && File.isLocked) && !editor.sourceView?.inSourceMode
}

function undoAPI(): NativeUndo {
  // shortcut: Typora has no public HTML write API; recheck native snapshots after upgrades.
  const undo = editor.undo
  if (!undo || !('register' in undo) || typeof undo.register !== 'function'
    || !undo.UndoManager || !('buildReplaceUndo' in undo.UndoManager) || typeof undo.UndoManager.buildReplaceUndo !== 'function') {
    throw Error('当前 Typora 不支持表格编辑所需的撤销接口。')
  }
  return undo as unknown as NativeUndo
}

export default class EnhancedTable extends Plugin {
  private session: Session | undefined
  private tables = new Set<HTMLTableElement>()
  private menu: HTMLElement | undefined

  onload() {
    const modifier = /Mac/.test(navigator.platform) ? 'meta' : 'ctrl'
    this.registerCommand({ id: 'merge', title: '合并单元格', scope: 'editor', hotkey: `${modifier}+shift+m`, callback: () => this.change('merge') })
    this.registerCommand({ id: 'split', title: '拆分单元格', scope: 'editor', hotkey: `${modifier}+shift+u`, callback: () => this.change('split') })
    this.registerMarkdownPostProcessor(HtmlPostProcessor.from({
      selector: '.md-htmlblock-container > table',
      process: (el, context) => { if (context.containerEl === editor.writingArea && el instanceof HTMLTableElement) this.enable(el) },
    }))
    this.register(this.app.features.exporter.register(HtmlExportProcessor.from({ process: ({ doc }) => {
      doc.querySelectorAll<HTMLTableElement>(`table[${marker}]`).forEach(table => { table.outerHTML = clean(table) })
      doc.querySelectorAll('.enhanced-table-context-menu').forEach(menu => menu.remove())
    } })))
    editor.writingArea?.querySelectorAll<HTMLTableElement>('.md-htmlblock-container > table').forEach(table => this.enable(table))
    // Native undo can replace HTML without emitting the core's edit notification.
    const observer = new MutationObserver(records => {
      for (const record of records) for (const added of Array.from(record.addedNodes)) {
        if (!(added instanceof HTMLElement)) continue
        if (added instanceof HTMLTableElement) this.enable(added)
        added.querySelectorAll<HTMLTableElement>('.md-htmlblock-container > table').forEach(table => this.enable(table))
      }
    })
    if (editor.writingArea) observer.observe(editor.writingArea, { childList: true, subtree: true })
    this.register(() => observer.disconnect())
    this.registerDomEvent(document, 'mousedown', (event: MouseEvent) => {
      const table = this.tableAt(event.target)
      if (!table) {
        if (!(event.target instanceof Node) || !this.menu?.contains(event.target)) { this.menu?.remove(); this.menu = undefined }
        return
      }
      if (!writable()) { this.disable(table); return }
      const cell = event.target instanceof HTMLElement ? event.target.closest('td, th') : null
      if (!(cell instanceof HTMLTableCellElement)) return
      if (!this.activate(table)) return
      event.stopImmediatePropagation()
      if (event.shiftKey) event.preventDefault()
      if (event.button === 0 || !this.session?.selected.includes(cell)) this.select(cell, event.shiftKey)
    }, true)
    this.registerDomEvent(document, 'click', (event: MouseEvent) => {
      if (!this.tableAt(event.target)) return
      event.stopImmediatePropagation()
      if (event.target instanceof HTMLElement && event.target.closest('a,button,input,select')) event.preventDefault()
    }, true)
    this.registerDomEvent(document, 'beforeinput', (event: InputEvent) => {
      const table = this.tableAt(event.target)
      if (!table) return
      event.stopImmediatePropagation()
      if (!writable() || !this.activate(table)) event.preventDefault()
    }, true)
    this.registerDomEvent(document, 'input', (event: InputEvent) => {
      const table = this.tableAt(event.target)
      if (!table) return
      event.stopImmediatePropagation()
      if (this.session?.table === table && !this.session.composing && !event.isComposing) this.attempt(() => this.commit())
    }, true)
    this.registerDomEvent(document, 'compositionstart', (event: CompositionEvent) => {
      const table = this.tableAt(event.target)
      if (!table) return
      event.stopImmediatePropagation()
      if (this.activate(table) && this.session) this.session.composing = true
    }, true)
    this.registerDomEvent(document, 'compositionend', (event: CompositionEvent) => {
      const table = this.tableAt(event.target)
      if (!table) return
      event.stopImmediatePropagation()
      if (table !== this.session?.table || !this.session) return
      this.session.composing = false
      this.attempt(() => this.commit())
    }, true)
    for (const name of ['mouseup', 'dblclick', 'keypress', 'copy', 'cut', 'compositionupdate']) this.registerDomEvent(document, name, (event: Event) => {
      if (this.tableAt(event.target)) event.stopImmediatePropagation()
      if (name === 'cut' && this.tableAt(event.target) && !writable()) event.preventDefault()
    }, true)
    this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
      if (!this.tableAt(event.target)) return
      if (!writable()) { event.preventDefault(); event.stopImmediatePropagation(); return }
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === 's') {
          if (this.session?.composing) { event.preventDefault(); event.stopImmediatePropagation(); return }
          try { this.commit() } catch (error) { event.preventDefault(); event.stopImmediatePropagation(); window.alert(String(error)) }
          return
        }
        if (key === 'z' || key === 'y') {
          event.preventDefault()
          event.stopImmediatePropagation()
          if (this.session?.composing) return
          this.attempt(() => {
            this.commit()
            const undo = undoAPI()
            const operation = key === 'y' || event.shiftKey ? 'redo' : 'undo'
            if (typeof undo[operation] !== 'function') throw Error('当前 Typora 不支持原生撤销。')
            this.clearSelection()
            this.session = undefined
            undo[operation]?.()
          })
          return
        }
        if (event.shiftKey && ['m', 'u'].includes(key)) {
          event.preventDefault()
          this.change(key === 'm' ? 'merge' : 'split')
        }
      }
      event.stopImmediatePropagation()
      if (event.key === 'Escape') { this.clearSelection(); this.menu?.remove(); this.menu = undefined }
      if (event.key === 'Tab') {
        const cells = Array.from(this.session?.table.querySelectorAll<HTMLTableCellElement>('td, th') ?? [])
        const current = event.target instanceof HTMLElement ? event.target.closest('td, th') : null
        const index = cells.findIndex(cell => cell === current)
        const next = cells[index + (event.shiftKey ? -1 : 1)]
        if (next) { event.preventDefault(); next.focus(); this.select(next, false) }
      }
    }, true)
    this.registerDomEvent(document, 'keyup', (event: KeyboardEvent) => { if (this.tableAt(event.target)) event.stopImmediatePropagation() }, true)
    this.registerDomEvent(document, 'paste', (event: ClipboardEvent) => {
      if (!this.tableAt(event.target)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (writable()) document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '')
    }, true)
    this.registerDomEvent(document, 'drop', (event: DragEvent) => { if (this.tableAt(event.target)) { event.preventDefault(); event.stopImmediatePropagation() } }, true)
    this.registerDomEvent(document, 'contextmenu', (event: MouseEvent) => {
      const table = this.tableAt(event.target)
      if (!table || !this.activate(table)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      this.showMenu(event)
    }, true)
  }

  onunload() {
    if (this.session) this.session.composing = false
    this.attempt(() => this.commit())
    this.menu?.remove()
    this.tables.forEach(table => this.disable(table))
    this.tables.clear()
    this.session = undefined
  }

  private tableAt(target: EventTarget | null): HTMLTableElement | undefined {
    const table = target instanceof HTMLElement ? target.closest(`table[${marker}]`) : null
    return table instanceof HTMLTableElement && this.tables.has(table) ? table : undefined
  }

  private enable(table: HTMLTableElement) {
    if (table.hasAttribute(marker)) return
    if (!writable()) return
    const block = table.closest<HTMLElement>('.md-htmlblock')
    const cid = block?.getAttribute('cid')
    if (!cid || !editor.writingArea?.contains(table)) return
    const text = editor.getNode(cid)?.get('text')
    if (typeof text !== 'string') return
    const parsed = new DOMParser().parseFromString(text, 'text/html')
    const source = parsed.body.firstElementChild
    if (!(source instanceof HTMLTableElement) || parsed.head.children.length || parsed.body.children.length !== 1
      || Array.from(parsed.body.childNodes).some(node => node !== source && node.textContent?.trim())
      || source.querySelector('table, [contenteditable], [data-enhanced-table], [data-enhanced-table-selected]')
      || source.hasAttribute(marker) || source.hasAttribute('contenteditable') || source.outerHTML !== table.outerHTML) return
    try { tableGrid(table); undoAPI() } catch { return }
    table.setAttribute(marker, '')
    this.prepare(table)
    this.tables.add(table)
    for (const previous of this.tables) if (!previous.isConnected) this.tables.delete(previous)
  }

  private disable(table: HTMLTableElement) {
    table.removeAttribute(marker)
    table.querySelectorAll('td, th').forEach(cell => { cell.removeAttribute('contenteditable'); cell.removeAttribute(selectedMarker) })
  }

  private prepare(table: HTMLTableElement) {
    table.querySelectorAll('td, th').forEach(cell => cell.setAttribute('contenteditable', 'true'))
  }

  private activate(table: HTMLTableElement) {
    if (this.session?.table === table) return true
    this.clearSelection()
    const cid = table.closest('.md-htmlblock')?.getAttribute('cid')
    if (!cid) return false
    const node = editor.getNode(cid)
    const text = node?.get('text')
    if (typeof text !== 'string') return false
    this.session = { cid, node, table, lastCommitted: text, selected: [], anchor: undefined, composing: false }
    return true
  }

  private clearSelection() {
    this.session?.selected.forEach(cell => cell.removeAttribute(selectedMarker))
    if (this.session) this.session.selected = []
  }

  private select(cell: HTMLTableCellElement, extend: boolean) {
    const session = this.session
    if (!session) return
    this.clearSelection()
    const rects = tableGrid(session.table)
    const start = rects.find(r => r.cell === session.anchor)
    const end = rects.find(r => r.cell === cell)
    if (extend && start && end) session.selected = rects.filter(r => r.bottom >= Math.min(start.top, end.top) && r.top <= Math.max(start.bottom, end.bottom) && r.right >= Math.min(start.left, end.left) && r.left <= Math.max(start.right, end.right)).map(r => r.cell)
    else { session.anchor = cell; session.selected = [cell] }
    session.selected.forEach(selected => selected.setAttribute(selectedMarker, ''))
  }

  private commit() {
    const session = this.session
    if (!session || session.composing) return
    if (!session.table.isConnected) { this.session = undefined; return }
    if (!writable() || !session.table.isConnected || editor.getNode(session.cid) !== session.node || session.node.get('text') !== session.lastCommitted) {
      throw Error('文档已改变或被锁定；表格中的未保存内容仍可复制，请重新打开文档后重试。')
    }
    const output = clean(session.table)
    if (output === new DOMParser().parseFromString(session.lastCommitted, 'text/html').body.firstElementChild?.outerHTML) return
    const undo = undoAPI()
    undo.endSnap?.(true)
    const before = undo.UndoManager.buildReplaceUndo(session.node)
    const previous = session.lastCommitted
    session.node.set('text', output)
    try {
      const after = undo.UndoManager.buildReplaceUndo(session.node)
      undo.register({ undo: [before], redo: [after] })
      session.lastCommitted = output
    } catch (error) { session.node.set('text', previous); throw error }
  }

  private change(operation: 'merge' | 'split') {
    this.attempt(() => {
      const session = this.session
      if (!session || session.composing) return
      if (!writable() || editor.getNode(session.cid) !== session.node || session.node.get('text') !== session.lastCommitted) throw Error('文档已改变或被锁定。')
      if (operation === 'merge') {
        const cell = mergeCells(session.table, session.selected)
        this.select(cell, false)
      } else {
        if (session.selected.length !== 1) throw Error('请选择一个单元格。')
        splitCell(session.table, session.selected[0])
      }
      this.prepare(session.table)
      this.commit()
    })
  }

  private attempt(action: () => void) { try { action() } catch (error) { window.alert(String(error)) } }

  private showMenu(event: MouseEvent) {
    this.menu?.remove()
    const menu = document.createElement('div')
    menu.className = 'enhanced-table-context-menu'
    menu.setAttribute('contenteditable', 'false')
    menu.style.left = `${event.clientX}px`
    menu.style.top = `${event.clientY}px`
    for (const [label, operation] of [['合并单元格', 'merge'], ['拆分单元格', 'split']] as const) {
      const button = document.createElement('button')
      button.textContent = label
      button.onmousedown = event => event.preventDefault()
      button.onclick = () => { this.change(operation); menu.remove(); this.menu = undefined }
      menu.append(button)
    }
    document.body.append(menu)
    this.menu = menu
  }
}
