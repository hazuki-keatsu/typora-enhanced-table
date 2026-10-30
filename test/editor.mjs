import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Window } from 'happy-dom'

const result = await build({
  entryPoints: ['src/main.ts'], bundle: true, write: false, format: 'iife', globalName: 'TablePlugin',
  plugins: [{ name: 'host-boundary', setup(build) {
    build.onResolve({ filter: /^(@typora-community-plugin\/core|typora)$/ }, args => ({ path: args.path, namespace: 'host' }))
    build.onLoad({ filter: /.*/, namespace: 'host' }, args => ({ contents: args.path === 'typora'
      ? 'export const editor = globalThis.hostEditor'
      : `export class Plugin {
          commands = []; disposables = [];
          registerCommand(command) { this.commands.push(command) }
          registerDomEvent(target, name, callback, options) {
            target.addEventListener(name, callback, options);
            this.disposables.push(() => target.removeEventListener(name, callback, options));
          }
          unload() { this.onunload(); this.disposables.forEach(dispose => dispose()) }
        }`, loader: 'js' }))
    build.onLoad({ filter: /\.scss$/ }, () => ({ contents: '', loader: 'js' }))
  } }],
})
const window = new Window()
const { document } = window
const calls = []
const alerts = []
let source = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>'
window.hostEditor = {
  getNode: () => ({ get: () => source }),
  htmlBlock: {
    startEditing(cid) { calls.push(['start', cid]); return { setValue(html) { calls.push(['value', html]) } } },
    stopEditing(cid) { calls.push(['stop', cid]) },
  },
}
window.alert = message => alerts.push(message)
window.eval(result.outputFiles[0].text)
const plugin = new window.TablePlugin.default()
plugin.onload()
const overlay = () => document.querySelector('.enhanced-table-overlay')
function open(preview = source) {
  document.body.innerHTML = `<div id="write"><div class="md-htmlblock" cid="n1">${preview}</div></div>`
  const cell = document.querySelector('td')
  const down = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
  let reachedTypora = false
  const nativeHandler = () => { reachedTypora = true }
  document.querySelector('#write').addEventListener('mousedown', nativeHandler)
  cell.dispatchEvent(down)
  assert.equal(down.defaultPrevented, true)
  assert.equal(reachedTypora, false, 'native source editor must never receive mousedown')
}
function button(label) { return Array.from(overlay().querySelectorAll('button')).find(b => b.textContent === label) }
try {
  open()
  assert.ok(overlay(), 'primary pointer action opens visual editor')
  const cells = overlay().querySelectorAll('td')
  cells[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  cells[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }))
  assert.equal(overlay().querySelectorAll('[data-enhanced-table-selected]').length, 4, 'Shift selects rectangle')
  cells[0].textContent = 'Edited'
  plugin.commands.find(c => c.id === 'merge').callback()
  assert.equal(overlay().querySelectorAll('td').length, 1)
  button('保存').click()
  assert.equal(overlay(), null)
  assert.deepEqual(calls.map(c => c[0]), ['start', 'value', 'stop'])
  assert.equal(calls[0][1], 'n1')
  const output = new window.DOMParser().parseFromString(calls[1][1], 'text/html')
  assert.equal(output.querySelector('td').textContent, 'EditedBCD')
  assert.equal(output.querySelector('td').rowSpan, 2)
  assert.equal(output.querySelector('td').colSpan, 2)
  assert.equal(output.querySelector('[contenteditable], [tabindex], [data-enhanced-table-selected]'), null)
  calls.length = 0
  open()
  overlay().querySelector('td').textContent = 'Discarded'
  button('取消').click()
  assert.equal(overlay(), null)
  assert.equal(calls.length, 0, 'cancel never writes host document')
  open(source.replace('>A<', '>Different<'))
  assert.equal(overlay(), null, 'source/preview mismatch refused')
  assert.match(alerts.at(-1), /数据丢失/)
  open()
  const original = source
  source = source.replace('>A<', '>Changed externally<')
  button('保存').click()
  assert.match(overlay().querySelector('[role=status]').textContent, /文档已改变/)
  assert.equal(calls.length, 0, 'conflict never writes host document')
  source = original
  plugin.unload()
  assert.equal(overlay(), null, 'unload removes visual editor')
  assert.equal(calls.length, 0)
  console.log('PASS editor integration: interception, rectangle, merge, save, cancel, mismatch, conflict, unload')
} finally { await window.happyDOM.close() }
