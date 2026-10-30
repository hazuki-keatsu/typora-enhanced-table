"""Run with safaridriver -p 4723 and a generated browser-build.mjs fixture."""
import base64
import http.server
import json
from pathlib import Path
import threading
import urllib.request

root = Path(__file__).resolve().parents[1] / '.test-dist'
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)
    def log_message(self, *args):
        pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = 'http://localhost:4723'
def request(path, data=None, method=None):
    req = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={'Content-Type': 'application/json'}, method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        value = json.load(response)['value']
    if isinstance(value, dict) and 'error' in value:
        raise AssertionError(value)
    return value
session = request('/session', {'capabilities': {'alwaysMatch': {'browserName': 'safari'}}})['sessionId']
path = '/session/' + session
def js(script):
    return request(path + '/execute/sync', {'script': script, 'args': []})
def element(selector):
    return request(path + '/element', {'using': 'css selector', 'value': selector})['element-6066-11e4-a52e-4f735466cecf']
def click(selector):
    request(path + '/element/' + element(selector) + '/click', {})
def shortcut(key, shift=True):
    modifiers = ['\ue009' if shift else '\ue03d'] + (['\ue008'] if shift else [])
    actions = [{'type': 'keyDown', 'value': modifier} for modifier in modifiers] + [
        {'type': 'keyDown', 'value': key}, {'type': 'keyUp', 'value': key},
    ] + [{'type': 'keyUp', 'value': modifier} for modifier in reversed(modifiers)]
    request(path + '/actions', {'actions': [{'type': 'key', 'id': 'keyboard', 'actions': actions}]})
try:
    request(path + '/url', {'url': f'http://127.0.0.1:{server.server_port}/index.html'})
    assert js('return document.querySelector("td").isContentEditable'), 'rendered table must be editable'
    assert js('return !document.querySelector(".enhanced-table-overlay, .enhanced-table-toolbar")'), 'no detached operation panel'
    assert js('let received=false; hostEditor.writingArea.addEventListener("contextmenu",()=>received=true,{once:true}); const event=new MouseEvent("contextmenu",{bubbles:true,cancelable:true}); document.querySelector("td").dispatchEvent(event); return received && !event.defaultPrevented && !document.querySelector(".enhanced-table-context-menu")'), 'original context menu remains available'
    click('td')
    request(path + '/element/' + element('td') + '/value', {'text': '文字'})
    assert '文字' in js('return modelText'), 'real browser typing must reach document model'
    assert js('return originalTable === document.querySelector("table")'), 'typing keeps table identity'
    assert js('return document.activeElement.closest("table") === originalTable'), 'typing keeps caret in table'
    js('const range=document.createRange(); range.selectNodeContents(document.querySelector("td")); const selection=getSelection(); selection.removeAllRanges(); selection.addRange(range); return true')
    shortcut('x', shift=False)
    assert '文字' not in js('return modelText'), 'native browser cut updates the document model'
    assert js('return nativeEditingEvents.length') == 0, 'cell editing bypasses native Markdown handlers'
    click('.enhanced-table-controls > button')
    click('[data-operation="insert-right"]')
    assert js('return [...document.querySelectorAll("tr")].every(row=>row.cells.length===3)'), 'controller inserts a full unmerged column'
    js('document.querySelector(".enhanced-table-controls > button").click(); document.querySelector(\'[data-operation="delete-column"]\').click(); return true')
    assert js('return [...document.querySelectorAll("tr")].every(row=>row.cells.length===2)'), 'controller deletes the selected logical column'
    click('td')
    js('document.querySelectorAll("td")[3].dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true,shiftKey:true,button:0})); return true')
    assert js('return document.querySelectorAll("[data-enhanced-table-selected]").length') == 4, 'Shift selects rectangle'
    first_content = js('return document.querySelector("td").innerHTML')
    shortcut('m')
    assert js('return document.querySelectorAll("td").length') == 1, js('return {events:window.hotkeyEvents, alerts, commands:plugin.commands.map(c=>c.hotkey)}')
    assert js('return document.querySelector("td").innerHTML') == first_content + 'B<br>CD', 'same-row content remains inline and existing markup is preserved'
    assert 'rowspan="2"' in js('return modelText') and 'colspan="2"' in js('return modelText')
    assert js('return !/contenteditable|tabindex|data-enhanced-table/.test(modelText)'), 'editor state excluded from source'
    shortcut('u')
    assert js('return document.querySelectorAll("td").length') == 4
    js('const command=historyCommands[historyCommands.length-1]; modelText=command.undo[0].json.text; document.querySelector(".md-htmlblock-container").innerHTML=modelText; return true')
    assert js('return document.querySelectorAll("td").length') == 1, 'undo model replacement redecorates'
    click('td')
    request(path + '/element/' + element('td') + '/value', {'text': '继续'})
    assert '继续' in js('return modelText'), 'typing works after native rerender'
    screenshot = request(path + '/screenshot')
    (root / 'safari-inline.png').write_bytes(base64.b64decode(screenshot))
    js('plugin.unload(); return true')
    assert js('return !document.querySelector("td").isContentEditable'), 'unload restores preview'
    print('PASS Safari: real typing, table controller, stable caret/table, rectangle merge/split shortcuts, clean source, rerender, unload')
finally:
    request(path, method='DELETE')
    server.shutdown()
