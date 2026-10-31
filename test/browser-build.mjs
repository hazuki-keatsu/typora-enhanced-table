import { build } from "esbuild";
import fs from "node:fs/promises";
await fs.mkdir(".test-dist", { recursive: true });
await build({
	entryPoints: ["src/main.ts"],
	bundle: true,
	outfile: ".test-dist/plugin.js",
	format: "iife",
	globalName: "TablePlugin",
	plugins: [
		{
			name: "browser-host",
			setup(build) {
				build.onResolve(
					{ filter: /^(@typora-community-plugin\/core|typora)$/ },
					(args) => ({ path: args.path, namespace: "host" }),
				);
				build.onLoad({ filter: /.*/, namespace: "host" }, (args) => ({
					contents:
						args.path === "typora"
							? "export const editor = window.hostEditor; export const File = window.hostFile"
							: `export const path = {join: (...parts) => parts.join('/')};
         export class I18n {constructor() {this.t = new Proxy({}, {get: (_, key) => key})}};
         export const HtmlPostProcessor = {from: value => value};
         export const HtmlExportProcessor = {from: value => value};
         export class Plugin {
           commands = []; processors = []; disposables = [];
           manifest = {dir: '/plugin'};
           app = { i18n: {locale: 'en'}, features: { exporter: {register: processor => { window.exportProcessor = processor; return () => {} }} } };
           registerCommand(command) {
             this.commands.push(command)
             this.registerDomEvent(globalThis.hostEditor.writingArea, 'keyup', event => {
               const hotkey = [event.metaKey && 'meta', event.ctrlKey && 'ctrl', event.shiftKey && 'shift', event.altKey && 'alt', event.key.toLowerCase()].filter(Boolean).join('+');
               (window.hotkeyEvents ??= []).push([hotkey, command.hotkey])
               if (hotkey === command.hotkey) command.callback()
             })
           }
           register(dispose) { this.disposables.push(dispose) }
           registerMarkdownPostProcessor(processor) { this.processors.push(processor) }
           registerDomEvent(target, name, handler, options) {
             target.addEventListener(name, handler, options);
             this.register(() => target.removeEventListener(name, handler, options));
           }
           unload() { this.onunload(); this.disposables.forEach(dispose => dispose()) }
         }`,
					loader: "js",
				}));
				build.onLoad({ filter: /\.scss$/ }, () => ({
					contents: "",
					loader: "js",
				}));
			},
		},
	],
});
await fs.writeFile(
	".test-dist/index.html",
	`<!doctype html><meta charset="utf-8">
<style>td {border:1px solid #888; min-width:80px; padding:16px} [data-enhanced-table-selected] {background:#def}</style>
<div id="write"><div cid="n1" mdtype="html_block" class="md-htmlblock"><div class="md-htmlblock-container" contenteditable="false"><table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table></div></div><p id="outside" contenteditable="true">Outside</p></div>
<script>
window.modelText = document.querySelector('table').outerHTML;
window.historyCommands = [];
window.hostFile = {isLocked:false};
const node = {id:'n1', get:key=>window.modelText, set:(key,value)=>window.modelText=value};
window.hostEditor = {writingArea:document.querySelector('#write'), sourceView:{inSourceMode:false}, getNode:cid=>cid==='n1'?node:undefined,
 undo:{endSnap(){}, UndoManager:{buildReplaceUndo:()=>({type:'replace',id:'n1',json:{text:window.modelText}})},
 register:command=>window.historyCommands.push(command)}};
window.alerts = []; window.alert = message=>window.alerts.push(message);
window.nativeEditingEvents = [];
for (const name of ['keypress','copy','cut','compositionstart','compositionend']) {
  hostEditor.writingArea.addEventListener(name, event => {
    nativeEditingEvents.push(name); event.preventDefault();
  });
}
</script><script src="plugin.js"></script><script>
window.plugin = new TablePlugin.default(); plugin.onload();
window.decorate = () => plugin.processors.forEach(p=>document.querySelectorAll(p.selector).forEach(el=>p.process(el,{containerEl:hostEditor.writingArea})));
decorate(); window.originalTable = document.querySelector('table');
window.command = id=>plugin.commands.find(c=>c.id===id).callback();
</script>`,
);
console.log(
	"Browser fixture: .test-dist/index.html (real plugin, simulated Typora boundary)",
);
