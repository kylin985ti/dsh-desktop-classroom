/**
 * 把 src/client.js 打成单文件 lib/client.js。
 *
 * 规范要求：Desktop 不会替工作台构建客户端，交付的必须是已构建好的单文件模块。
 * esbuild 只做打包与压缩，不做语法降级——宿主是 Electron 的现代 Chromium。
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const result = await build({
  entryPoints: [join(root, 'src', 'client.js')],
  outfile: join(root, 'lib', 'client.js'),
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  platform: 'browser',
  minify: false,
  legalComments: 'none',
  // 客户端入口自身调用 window.__ModuleLoader__.load 注册；
  // require 由宿主模块加载器在 factory 内提供，因此不能被打包。
  banner: { js: '/* dsh-task-board client bundle · built by scripts/build-client.mjs */' },
})

if (result.errors.length > 0) {
  console.error(result.errors)
  process.exit(1)
}
console.log('built lib/client.js')
