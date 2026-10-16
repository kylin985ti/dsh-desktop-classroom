#!/usr/bin/env node
/**
 * 工作台包自检：按开发规范第 3 节的「必须」项逐条核对。
 *
 * 这是本地开发用的静态校验，不能替代第 8 节的真实安装与界面自测。
 * 用法：node scripts/check-workbench-package.mjs
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const passes = []
const skip = (message) => passes.push(`SKIP  ${message}`)
const ok = (message) => passes.push(`ok    ${message}`)
const fail = (message) => problems.push(message)

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const exists = async (path) =>
  stat(path)
    .then(() => true)
    .catch(() => false)

const manifest = await readJson(join(root, 'package.json'))

// --- package.json 必须项 ---------------------------------------------------
if (typeof manifest.name === 'string' && manifest.name.trim()) ok(`name: ${manifest.name}`)
else fail('package.json 缺少 name。')

if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(manifest.version))) ok(`version: ${manifest.version}`)
else fail('version 必须是完整 SemVer。')

if (manifest.type === 'module') ok('type: module')
else fail('建议声明 "type": "module"。')

const serverEntry = manifest.exports?.['.'] || manifest.main
if (typeof serverEntry === 'string' && (await exists(join(root, serverEntry)))) ok(`服务端入口: ${serverEntry}`)
else fail('main / exports["."] 必须指向存在的服务端入口。')

const patchPath = manifest.dsh?.bundle?.patch
if (typeof patchPath === 'string' && (await exists(join(root, patchPath)))) ok(`dsh.bundle.patch: ${patchPath}`)
else fail('缺少 dsh.bundle.patch，包不会激活插件层。')

if (manifest.dsh?.client?.platform === 'web') ok('dsh.client.platform: web')
else fail('dsh.client.platform 必须是 "web"。')

const inject = manifest.dsh?.client?.inject
if (Array.isArray(inject) && inject.includes('dsh-desktop-workbenches')) {
  ok('dsh.client.inject 含 dsh-desktop-workbenches')
} else {
  fail('dsh.client.inject 必须包含 dsh-desktop-workbenches。')
}

const clientExport = manifest.exports?.['./client']
if (typeof clientExport === 'string' && (await exists(join(root, clientExport)))) ok(`客户端入口: ${clientExport}`)
else fail('exports["./client"] 必须指向已构建的客户端文件。')

if (manifest.exports?.['./package.json'] === './package.json') ok('exports["./package.json"]')
else fail('建议导出 ./package.json。')

if (manifest.exports?.['./cordis.patch.yml'] === './cordis.patch.yml') ok('exports["./cordis.patch.yml"]')
else fail('建议导出 ./cordis.patch.yml。')

// --- cordis.patch.yml ------------------------------------------------------
const patchText = await readFile(join(root, patchPath), 'utf8').catch(() => '')
const meaningful = patchText
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
if (meaningful.length === 0) fail('cordis.patch.yml 为空或只有注释，会导致启动失败。')
else ok('cordis.patch.yml 有内容')

if (new RegExp(`name:\\s*['"]?${manifest.name}['"]?\\s*$`, 'm').test(patchText)) {
  ok(`cordis.patch.yml 的 name 写的是包名 (${manifest.name})`)
} else {
  fail(`cordis.patch.yml 的 name 必须是 npm 包名 ${manifest.name}，不能是相对路径。`)
}

// --- 服务端入口内容 --------------------------------------------------------
const serverText = await readFile(join(root, serverEntry), 'utf8').catch(() => '')
if (/export\s+const\s+Config\s*=/.test(serverText) && /schemastery/.test(serverText)) {
  ok('服务端导出了 Schemastery Config')
} else {
  fail('服务端必须导出 Schemastery 的 Config。')
}
if (/export\s+(const|function)\s+apply/.test(serverText)) ok('服务端导出了 apply')
else fail('服务端必须导出 apply。')

// --- 客户端入口内容 --------------------------------------------------------
const clientText = await readFile(join(root, clientExport), 'utf8').catch(() => '')
if (clientText.includes('__ModuleLoader__.load')) ok('客户端通过 __ModuleLoader__.load 注册')
else fail('客户端必须通过 window.__ModuleLoader__.load 注册。')
// 包名可能直接写字面量，也可能经由常量传入；两种写法都接受。
if (clientText.includes(manifest.name)) ok(`客户端加载器 id 与包名一致 (${manifest.name})`)
else fail('window.__ModuleLoader__.load({ id }) 必须与包名一致。')
if (/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(clientText)) ok('register() 提供了规范的 GitHub repository')
else fail('register() 必须提供规范的 GitHub repository URL。')
if (/业务数据目录|dshHomePath/.test(patchText) || /root:/.test(patchText)) {
  ok('数据目录由 patch 提供')
} else {
  skip('未在 patch 中声明数据目录')
}

// --- files 白名单 ----------------------------------------------------------
const files = manifest.files
if (Array.isArray(files)) {
  const needed = [serverEntry.replace(/^\.\//, ''), clientExport.replace(/^\.\//, ''), patchPath.replace(/^\.\//, '')]
  const covered = needed.every((entry) => files.some((pattern) => entry === pattern || entry.startsWith(pattern.replace(/\/\*+$/, ''))))
  if (covered) ok(`files 覆盖入口与 patch: ${files.join(', ')}`)
  else fail(`files 必须包含 cordis.patch.yml、服务端入口和客户端产物；当前为 ${JSON.stringify(files)}`)
} else {
  fail('建议声明 files 白名单，避免把无关文件打进包。')
}

// --- peerDependencies 版本范围 --------------------------------------------
// 只有当宿主包本身是预发布版本（如 0.2.0-rc.2）时，范围才必须显式包含预发布分支；
// 稳定版（如 cordis 4.0.4）用 ^4.0.4 即可，与已上架的 dsh-better-sidebar 一致。
// 注意：本机 DSH 0.11.1 的插件落格校验要求所有声明的 peer 在安装闭包内可物理解析，
// react/@deepseek-ai/cordis/@deepseek-ai/dsh-client-ui-primitives 在 profiles/web
// 闭包里并不存在（由宿主客户端沙箱在运行时提供单例，实测注册成功），声明成 peer
// 会被记入 deferred（.generations-deferred.json）。因此本包不声明这些 peer；
// 若之后声明，则继续校验预发布分支覆盖。
const peers = manifest.peerDependencies || {}
// 本机 Desktop 0.11.1 随附的宿主包版本，用于判断该包是否为预发布。
const HOST_PRERELEASE = new Set([
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-modules',
])
for (const [name, range] of Object.entries(peers)) {
  if (!name.startsWith('@deepseek-ai/')) continue
  if (!HOST_PRERELEASE.has(name)) {
    ok(`peer ${name}: ${range}（宿主为稳定版，无需预发布分支）`)
    continue
  }
  if (/(?:rc|alpha|beta)/.test(range)) ok(`peer ${name}: ${range} 覆盖预发布分支`)
  else fail(`peerDependencies 的 ${name} 范围 ${range} 未显式包含预发布分支，宿主为预发布版时会 ERESOLVE。`)
}
for (const name of Object.keys(manifest.dependencies || {})) {
  if (name.startsWith('@deepseek-ai/') && name !== '@deepseek-ai/schemastery') {
    fail(`${name} 属于宿主包，应放在 peerDependencies，避免装进第二份宿主代码。`)
  }
}

// Local-calendar integration is retired; no route provider or native payload ships.
for (const path of ['dsh/calendar-provider.js', 'dsh/calendar-protocol.js', 'dsh/calendar-native', 'src/calendar-api.js']) {
  if (await exists(join(root, path))) fail(`已移除的本地日历组件仍存在: ${path}`)
  else ok(`不包含本地日历组件: ${path}`)
}
if (/registerCalendarRoutes|calendarProtocol|calendar-native/.test(serverText) || /api\/dsh-task-board\/calendar\//.test(clientText)) fail('构建产物仍引用已移除的本地日历连接。')
else ok('客户端和服务端入口不包含本地日历连接')

// --- 输出 ------------------------------------------------------------------
console.log(`工作台包自检: ${manifest.name}@${manifest.version}`)
console.log(`目录: ${root}\n`)
for (const line of passes) console.log(line)
if (problems.length > 0) {
  console.log('\n未通过：')
  for (const problem of problems) console.log(`  ✗ ${problem}`)
  process.exit(1)
}
console.log('\n第 3 节「必须」项全部通过。')
