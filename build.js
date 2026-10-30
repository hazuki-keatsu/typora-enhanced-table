import * as child_process from 'node:child_process'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import * as esbuild from 'esbuild'
import typoraPlugin, { installDevPlugin, closeTypora } from 'esbuild-plugin-typora'
import { sassPlugin } from 'esbuild-sass-plugin'


const args = process.argv.slice(2)
const IS_PROD = args.includes('--prod')
const IS_DEV = !IS_PROD

await fs.rm('./dist', { recursive: true, force: true })

try {
  await fs.access('./src/locales')
  await fs.cp('./src/locales', './dist/locales', { recursive: true })
}
catch (e) {
}

await esbuild.build({
  entryPoints: ['src/main.ts'],
  outdir: 'dist',
  format: 'esm',
  bundle: true,
  minify: IS_PROD,
  sourcemap: IS_DEV,
  plugins: [
    typoraPlugin({
      mode: IS_PROD ? 'production' : 'development'
    }),
    sassPlugin(),
  ],
})

await fs.copyFile('src/manifest.json', 'dist/manifest.json')
await fs.rename('dist/main.css', 'dist/style.css')
if (IS_DEV) await fs.rename('dist/main.css.map', 'dist/style.css.map')

if (IS_DEV) {
  const vault = path.resolve('test/vault')
  if (process.platform === 'darwin') {
    const app = '/Applications/Typora.app'
    const html = await fs.readFile(`${app}/Contents/Resources/TypeMark/index.html`, 'utf8')
    if (!html.includes('/plugins/loader.js')) {
      throw new Error('Typora 未安装社区插件核心启动器，请先运行官方 install-macos.sh。')
    }
    await fs.access(path.join(os.homedir(), 'Library/Application Support/abnerworks.Typora/plugins/loader.json'))
    const loaderDir = path.join(os.homedir(), 'Library/Application Support/abnerworks.Typora/plugins')
    const loader = JSON.parse(await fs.readFile(path.join(loaderDir, 'loader.json'), 'utf8'))
    if (typeof loader.coreVersion !== 'string' || !/^[\d.]+$/.test(loader.coreVersion)) {
      throw new Error('社区插件核心版本无效，请重新安装官方核心。')
    }
    const core = path.join(loaderDir, loader.coreVersion, 'core.js')
    await fs.access(core)
    const envPath = path.join(vault, '.typora/env.json')
    const env = JSON.parse(await fs.readFile(envPath, 'utf8'))
    env.PLUGIN_CORE_PATH = pathToFileURL(core).href
    await fs.writeFile(envPath, JSON.stringify(env, null, 2) + '\n')
  }
  await installDevPlugin()
  await closeTypora()
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'Typora' : 'typora'
  // The loader must see the vault at startup, rather than reuse an existing window.
  const launchArgs = process.platform === 'darwin'
    ? ['-n', '-a', '/Applications/Typora.app', vault]
    : [path.join(vault, 'doc.md')]
  console.log(`Opening development vault: ${vault}`)
  await promisify(child_process.execFile)(command, launchArgs)
}
