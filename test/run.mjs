import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transform } from 'esbuild'
import { Window } from 'happy-dom'

const window = new Window()
const { code } = await transform(await fs.readFile('src/table.ts', 'utf8'), { loader: 'ts', format: 'esm' })
const { mergeCells, splitCell, tableGrid } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
globalThis.document = window.document
const html = await fs.readFile('test/table.test.html', 'utf8')
window.document.body.innerHTML = '<pre id="result"></pre>'
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/m, '')
new Function('mergeCells', 'splitCell', 'tableGrid', 'window', 'document', script)(mergeCells, splitCell, tableGrid, window, window.document)
assert.equal(window.testResult.error, undefined)
assert.equal(window.testResult.passed, 13)
console.log(window.document.querySelector('#result').textContent)
await window.happyDOM.close()
