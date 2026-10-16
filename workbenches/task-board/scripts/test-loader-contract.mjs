#!/usr/bin/env node
/**
 * 客户端契约测试：模拟宿主模块加载器，验证已构建的 lib/client.js
 * 在真实加载路径下的行为是否与宿主 Desktop 的约定一致。
 *
 * 重点验证三件在重启后才可能暴露、但可以在此提前证明的事：
 *  1. 加载器 id 必须等于 npm 包名——宿主的 sourcePackage() 读的就是它；
 *  2. factory 只 require 共享基线（react），不会去要别的模块；
 *  3. register() 的入参通过宿主 register() 的全部校验分支（title、repository、
 *     customFrame、layout 的取值范围）。
 *
 * 用法：node scripts/test-loader-contract.mjs
 */
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { STATUS_META, STATUS_KEYS, SETTLED, visibleInBoard, buildTree, findNode, subtreeIds } from '../src/task-model.js'

const require = createRequire(import.meta.url)
const results = []
const check = (label, condition, detail = '') => {
  results.push({ label, pass: !!condition, detail })
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${detail && !condition ? ` — ${detail}` : ''}`)
}

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

// --- 模拟宿主的最小加载环境 -------------------------------------------------
const registrations = []
globalThis.window = globalThis
globalThis.document = {
  head: { appendChild() {} },
  getElementById: () => null,
  createElement: () => ({ id: '', textContent: '', style: {}, appendChild() {} }),
  querySelector: () => null,
}
globalThis.window.__ModuleLoader__ = {
  load(registration) {
    registrations.push(registration)
  },
}

// 记录 factory 请求过哪些模块
const requested = []
await import('../lib/client.js')

check('bundle 注册了一次', registrations.length === 1, `实际 ${registrations.length}`)
const registration = registrations[0]

// 宿主 create() 用 { name: <graph row id> } 建立 fiber，工作台包的 row id 就是包名。
check(
  '加载器 id 等于 npm 包名（宿主 sourcePackage 依据）',
  registration.id === manifest.name,
  `id=${registration.id} name=${manifest.name}`,
)

const React = require('react')
const exported = registration.factory((name) => {
  requested.push(name)
  if (name === 'react') return React
  throw new Error(`bundle requested a non-baseline module: ${name}`)
})

check('factory 只请求了共享基线模块', requested.every((name) => name === 'react'), requested.join(', '))
check('factory 返回 apply', typeof exported.apply === 'function')
check(
  'factory 声明 inject 含 desktopWorkbenches',
  Array.isArray(exported.inject) && exported.inject.includes('desktopWorkbenches'),
)
check(
  'dsh.client.inject 与运行时 inject 都指向 desktopWorkbenches',
  manifest.dsh.client.inject.includes('dsh-desktop-workbenches') && exported.inject.includes('desktopWorkbenches'),
)

// --- 复刻宿主 register() 的校验分支 ----------------------------------------
let received = null
const errors = []
const ctx = {
  effect(factory) {
    try {
      return factory()
    } catch (error) {
      errors.push(error.message)
      return () => {}
    }
  },
  desktopWorkbenches: {
    // 逐条复刻 @deepseek-ai/dsh-desktop-workbenches 的 register() 校验
    register(descriptor, Component) {
      if (!descriptor || !descriptor.title || typeof Component !== 'function') {
        throw new Error('Invalid workbench registration')
      }
      const repoPattern = /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/i
      const match = descriptor.repository.match(repoPattern)
      if (!match) throw new Error('Workbench repository must be a GitHub URL.')
      if (descriptor.customFrame !== undefined && typeof descriptor.customFrame !== 'boolean') {
        throw new Error('Invalid custom frame flag')
      }
      const layout = descriptor.layout || {}
      if (layout.businessSide !== undefined && !['left', 'right'].includes(layout.businessSide)) {
        throw new Error('Invalid workbench business side')
      }
      if (
        layout.businessWidth !== undefined &&
        (!Number.isFinite(layout.businessWidth) || layout.businessWidth < 0.25 || layout.businessWidth > 0.7)
      ) {
        throw new Error('Workbench business width must be between 0.25 and 0.7')
      }
      received = {
        descriptor,
        Component,
        identity: `${match[1]}/${match[2]}`.toLowerCase(),
        layout: {
          businessSide: layout.businessSide || 'right',
          businessWidth: layout.businessWidth ?? 0.36,
        },
      }
      return () => {}
    },
  },
}

exported.apply(ctx)

check('apply 未触发任何 register 校验异常', errors.length === 0, errors.join('; '))
check('register() 被调用', received !== null)
check('工作台身份解析为 owner/repo', received?.identity === 'xudingsheng/dsh-task-board', String(received?.identity))

// 身份必须唯一：本地包只能靠 repository 推断，不能与其他条目冲突
check('未填写旧的 register({ id }) 字段', received?.descriptor.id === undefined, String(received?.descriptor.id))
check('声明了 customFrame 为布尔值', typeof received?.descriptor.customFrame === 'boolean' || received?.descriptor.customFrame === undefined)
check('业务面板布局取值为 left', received?.layout.businessSide === 'left', String(received?.layout.businessSide))
check(
  '业务面板宽度在 0.25–0.7 之间',
  received?.layout.businessWidth >= 0.25 && received?.layout.businessWidth <= 0.7,
  String(received?.layout.businessWidth),
)
check(
  '使用 customFrame 独占主内容区（会话改由内部抽屉承载）',
  received?.descriptor.customFrame === true,
  String(received?.descriptor.customFrame),
)

// --- 执行正式状态模型，不另造过期的四状态集合或可见性逻辑 ---------------
check('当天完成的可见', visibleInBoard({ status: 'done', settledAt: new Date().toISOString() }))
check('当天废弃的可见', visibleInBoard({ status: 'dropped', settledAt: new Date().toISOString() }))
const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString()
check('昨日完成的隐去', !visibleInBoard({ status: 'done', settledAt: yesterday }))
check('昨日废弃的隐去', !visibleInBoard({ status: 'dropped', settledAt: yesterday }))
check('正式模型只将 done/dropped 计为结算', [...SETTLED].join() === 'done,dropped' && !SETTLED.has('ongoing'))
check('正式模型提供五个按序独立状态', STATUS_KEYS.length === 5 &&
  STATUS_KEYS.join() === 'todo,doing,ongoing,done,dropped' && STATUS_KEYS.every(key => typeof STATUS_META[key]?.label === 'string'))
check('正式模型的 ongoing 标签为持续性工作', STATUS_META.ongoing?.label === '持续性工作')
check('正式模型的全部非终态始终可见，包含旧或缺少时间的持续性工作',
  STATUS_KEYS.filter(status => !SETTLED.has(status)).length === 3 &&
  STATUS_KEYS.filter(status => !SETTLED.has(status)).every(status => [
    { status }, { status, settledAt: null }, { status, settledAt: yesterday },
    { status, settledAt: 'invalid', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' },
  ].every(visibleInBoard)))

// --- 包文件齐备 --------------------------------------------------------------
const bundleText = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
check('bundle 中没有对 node 内置模块的引用', !/require\(["'](node:|fs|path|os)["']\)/.test(bundleText))

// --- 直接执行正式数据模型，而不是用源码正则模拟行为 -------------------------
{
  const fixture = [
    { id: 'a', title: '一级', status: 'ongoing', parentId: null },
    { id: 'b', title: '二级', status: 'doing', parentId: 'a' },
    { id: 'c', title: '三级', status: 'ongoing', parentId: 'b' },
    { id: 'd', title: '四级', status: 'done', parentId: 'c' },
  ]
  const tree = buildTree(fixture)
  check('正式任务树保留根与嵌套持续性工作的独立状态', findNode(tree, 'a')?.status === 'ongoing' &&
    findNode(tree, 'c')?.status === 'ongoing' && findNode(tree, 'b')?.status === 'doing')
  check('正式任务树保留四级节点', findNode(tree, 'd')?.title === '四级')
  check('正式父子关系保留三级的子节点', findNode(tree, 'c')?.children[0]?.id === 'd')
  const corrupt = buildTree([
    { id: 'x', title: '环一', parentId: 'y' }, { id: 'y', title: '环二', parentId: 'x' },
    { id: 'z', title: '孤儿', parentId: 'absent' },
  ])
  check('循环父链与孤儿节点不会消失或阻断树构建', corrupt.length === 3)
  check('正式删除范围涵盖所有后代', [...subtreeIds(fixture, 'a')].sort().join() === 'a,b,c,d')
}

const failed = results.filter((result) => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) {
  console.log('未通过：')
  for (const item of failed) console.log(`  ✗ ${item.label} ${item.detail}`)
  process.exit(1)
}
