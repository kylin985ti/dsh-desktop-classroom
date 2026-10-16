#!/usr/bin/env node
/**
 * 客户端静态契约测试：用最小 document 替身加载已构建的 lib/client.js，
 * 捕获宿主 factory，以静态渲染和受控内存状态检查注册、五个任务组与状态选择。
 * 不启动浏览器、不执行网络请求或持久化，也不访问真实用户数据。
 *
 * 用法：node scripts/test-client.mjs
 */
import { STATUS_META, STATUS_KEYS } from '../src/task-model.js'
import { inspectNativeDraftHost } from '../src/ai-native-bridge.js'

const results = []
const check = (label, condition, detail = '') => {
  results.push({ label, pass: !!condition, detail })
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${detail && !condition ? ` — ${detail}` : ''}`)
}

// --- 最小的 window / document 替身 -------------------------------------------------
const captured = []
const elementStub = () => ({
  id: '',
  textContent: '',
  style: {},
  appendChild() {},
  setAttribute() {},
})
globalThis.window = globalThis
globalThis.document = {
  head: { appendChild() {} },
  getElementById: () => null,
  createElement: elementStub,
  querySelector: () => null,
}
globalThis.window.__ModuleLoader__ = {
  load(entry) {
    captured.push(entry)
  },
}

// 加载构建产物（它会立即调用 load）
await import('../lib/client.js')

check('客户端调用了 __ModuleLoader__.load', captured.length === 1, `调用 ${captured.length} 次`)
const entry = captured[0]
check('加载器 id 是包名', entry?.id === 'dsh-task-board', String(entry?.id))

// 假 require：只提供 react，并允许观察注册调用
const registered = []
const React = await import('react')
const moduleExports = entry.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

check('factory 导出了 apply', typeof moduleExports.apply === 'function')
check('factory 声明注入 desktopWorkbenches', Array.isArray(moduleExports.inject) && moduleExports.inject.includes('desktopWorkbenches'))

// 通过 apply 捕获 register 的入参，并取出业务组件
let descriptor = null
const effects = []
moduleExports.apply({
  effect(factory) {
    effects.push(factory)
    factory()
  },
  desktopWorkbenches: {
    register(d, Component) {
      descriptor = { ...d, Component }
      return () => {}
    },
  },
})

check('调用了 ctx.effect 管理注销', effects.length === 1, `effects=${effects.length}`)
check('register() 提供了 title', descriptor?.title === '任务栏', String(descriptor?.title))
check(
  'register() 提供了规范的 GitHub repository',
  /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(descriptor?.repository || ''),
  String(descriptor?.repository),
)
check('register() 未填写兼容用旧 id 字段', descriptor?.id === undefined, String(descriptor?.id))
check('注册了业务组件', typeof descriptor?.Component === 'function')
// Reproduce Cordis's direct-dependency boundary: the provider-scoped service
// exposes its caller context, which cannot read undeclared native services.
const nativeContext = new Proxy({
  sessions: { retain() {} },
  conversation: { input: { for() {} } },
}, { get(target, name) {
  if (!moduleExports.inject.includes(name)) throw new Error(`cannot get property "${name}" without inject`)
  return target[name]
} })
const nativeService = {
  ctx: nativeContext, isActive: () => true, currentSession: () => 'owned-native',
  ownsSession: id => id === 'owned-native', defaultWorkspace: () => ({ workspaceId: 'native-workspace' }),
}
let nativeComponent
moduleExports.apply({ effect: factory => factory(), desktopWorkbenches: {
  ...nativeService, register(d, Component) { nativeComponent = Component; return () => {} },
} })
const nativeCapability = inspectNativeDraftHost(nativeComponent({}).props.aiService)
check('提供者作用域显式依赖允许读取原生草稿服务且验证归属', nativeCapability.supported && nativeCapability.owned && nativeCapability.workspaceId === 'native-workspace')
check('业务面板布局在左侧（对话在右）', descriptor?.layout?.businessSide === 'left', String(descriptor?.layout?.businessSide))
check('使用 customFrame 让面板独占主内容区', descriptor?.customFrame === true, String(descriptor?.customFrame))
check('默认宽度偏向业务面板（>0.5，会话不再偏宽）',
  (descriptor?.layout?.businessWidth ?? 0) > 0.5 && descriptor.layout.businessWidth <= 0.7,
  String(descriptor?.layout?.businessWidth))
check('业务面板宽度在规范范围 [0.25, 0.7]', (descriptor?.layout?.businessWidth ?? 0) >= 0.25 && descriptor.layout.businessWidth <= 0.7, String(descriptor?.layout?.businessWidth))

// --- 渲染：用 react-dom/server 做静态渲染，验证不抛错且关键文案出现 ---------------
const { renderToStaticMarkup } = await import('react-dom/server')
const fakeService = {
  ctx: {
    uiWorkspace: { pickDirectory: async () => null },
    workspaces: { create: async () => ({ workspaceId: 'ws-1' }) },
  },
}
const html = renderToStaticMarkup(
  React.createElement(descriptor.Component, { service: fakeService, entry: descriptor }),
)

check('渲染出任务栏标题', html.includes('任务栏'))
check('按正式模型渲染五个独立任务组，包含持续性工作', STATUS_KEYS.length === 5 &&
  STATUS_KEYS.every(key => html.includes(STATUS_META[key].label)) && html.includes('持续性工作'))
check('五个统计/组计数元素存在', (html.match(/tbGroupCount/g) || []).length === 5, `${(html.match(/tbGroupCount/g) || []).length} 组`)
const renderedGroups = [...html.matchAll(/class="tbGroup(?:\s[^\"]*)?" data-status="([^\"]+)"/g)].map(match => match[1])
check('五列状态次序与正式模型一致', renderedGroups.join() === STATUS_KEYS.join(), renderedGroups.join())
check('组标题带进度归组结构', html.includes('tbGroupHead') && html.includes('tbGroupBody'))
check('提供新建任务入口', html.includes('新建任务'))
check('提供历史查询入口', html.includes('查询历史'))
check('横向排布容器存在', html.includes('tbGroups'))
check('横向任务列由专用内层滚动容器承载', /class="tbBoardViewport"[^>]*><div class="tbGroups"/.test(html))
check('渲染会话抽屉容器（承载宿主原生会话）', html.includes('tbChat') && html.includes('AI 会话'))
check('渲染时不因缺少会话而失败', html.length > 200, `${html.length} 字符`)

// --- 用注入的 document 检查样式只注入一次 --------------------------------------
const styles = []
globalThis.document.getElementById = (id) => styles.find((item) => item.id === id) || null
globalThis.document.createElement = () => {
  const node = elementStub()
  styles.push(node)
  return node
}
globalThis.document.head.appendChild = () => {}
renderToStaticMarkup(React.createElement(descriptor.Component, { service: fakeService, entry: descriptor }))
check('样式表被注入', styles.length >= 1, `注入 ${styles.length} 次`)
renderToStaticMarkup(React.createElement(descriptor.Component, { service: fakeService, entry: descriptor }))
check('重复渲染仍只注入一次样式', styles.length === 1, `注入 ${styles.length} 次`)
check('样式使用 tb 前缀类名', styles[0]?.textContent.includes('.tbRoot'))
{
  const { readFileSync } = await import('node:fs')
  const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  // esbuild 把中文写成 \uXXXX 转义，所以用转义形式匹配；同时源码层校验无旧文案
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  check('子任务文案统一为「添加子任务」',
    bundle.includes('\\u6DFB\\u52A0\\u5B50\\u4EFB\\u52A1')
    && !source.includes('新增子任务') && !source.includes('+ 子任务'))
  check('提供拖拽手柄（Pointer Events 实现）', bundle.includes('tbGrip') && /beginDrag/.test(bundle))
  check('拖拽用 window 指针监听与落点判定',
    bundle.includes('elementFromPoint') && /beginDrag/.test(bundle))
  check('下拉菜单具备向上翻转能力（避免被容器裁剪）', bundle.includes('tbStatusMenuUp'))
}
check('样式包含容器查询以适配业务面板宽度', styles[0]?.textContent.includes('@container tb-body'))
const css = styles[0]?.textContent || ''
const groupRules = [...css.matchAll(/\.tbGroups\s*\{([^}]*)\}/g)].map(match => match[1].replace(/\s+/g, ''))
check('五组固定为同一横排，列宽至少 250px 且可均分', groupRules.some(rule =>
  rule.includes('display:grid') && rule.includes('grid-auto-flow:column') &&
  rule.includes('grid-auto-columns:minmax(250px,1fr)') && rule.includes('grid-template-rows:auto')))
check('任务列不再被任何容器查询切成二列/四列或单列网格', groupRules.length > 0 &&
  groupRules.every(rule => !/grid-template-columns:/.test(rule)), groupRules.join(' | '))
check('专用任务列内层提供水平滚动，不让整页滚动承载列宽',
  /\.tbBoardViewport\s*\{[^}]*overflow-x\s*:\s*auto/.test(css))
check('详情仍保留窄面板响应式布局', /@container tb-body\s*\(max-width:820px\)\s*\{\s*\.tbDetailGrid\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(css))
// 空数据时不会渲染任务卡，因此这几项断言检查样式表/产物证据
check('样式表含单一状态胶囊（不平铺五个状态按钮）', styles[0]?.textContent.includes('.tbStatusChip'))
check('次要操作有统一菜单样式，不再常驻整排按钮',
  styles[0]?.textContent.includes('.tbMenuTrigger') && styles[0]?.textContent.includes('.tbMenuItem'))
check('任务名与状态同行且标题有独立换行空间',
  styles[0]?.textContent.includes('.tbItem > .tbCardHead{display:grid;grid-template-columns:20px minmax(0,1fr) auto 22px')
  && styles[0]?.textContent.includes('overflow-wrap:anywhere;min-width:0'))
check('弹出菜单在业务根容器内独立定位，避免嵌套卡片裁剪',
  styles[0]?.textContent.includes('.tbPopover{position:absolute;z-index:80')
  && styles[0]?.textContent.includes('max-width:calc(100% - 16px)'))
check('没有会话时保留明确的初始化入口', html.includes('新建工作区并开始会话'))
check('所有视图使用一个语义 header 和一个会话抽屉',
  /class="tbRoot[^\"]*"[^>]*><header/.test(html) && (html.match(/class="tbChat(?:\s|\")/g) || []).length === 1)
check('首次加载前新建任务入口被禁用，避免覆盖原数据',
  /<button[^>]*disabled[^>]*>[\s\S]*?新建任务<\/button>/.test(html))
check('不会呈现尚未实现的搜索、筛选、列表视图入口',
  !html.includes('搜索任务') && !html.includes('筛选') && !html.includes('列表视图'))
check('样式表含拖拽与落点高亮', styles[0]?.textContent.includes('.tbDragging') && styles[0]?.textContent.includes('.tbGroupOver'))

// --- 受控静态状态：直接展开真实 bundle 的创建表单与状态菜单 ---------------
// 不模拟浏览器可交互性；忽略 useEffect，绝不触发载入/保存或宿主 OS API。
function staticFixture(initialTasks = []) {
  const slots = []
  let cursor = 0
  const fixtureReact = {
    ...React,
    useState(initial) {
      const index = cursor++
      // TaskBoard 的首个状态槽是本夹具拥有的任务快照。
      if (!(index in slots)) slots[index] = index === 0 ? initialTasks : typeof initial === 'function' ? initial() : initial
      return [slots[index], update => { slots[index] = typeof update === 'function' ? update(slots[index]) : update }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect() {},
    useLayoutEffect() {},
    useMemo: compute => compute(),
    useCallback: callback => callback,
  }
  const exported = entry.factory(name => {
    if (name !== 'react') throw new Error(`unexpected fixture require: ${name}`)
    return fixtureReact
  })
  let fixtureDescriptor
  exported.apply({ effect: factory => factory(), desktopWorkbenches: {
    register(d, Component) { fixtureDescriptor = { ...d, Component }; return () => {} },
  } })
  return {
    render() {
      cursor = 0
      return fixtureDescriptor.Component({ service: fakeService, entry: fixtureDescriptor })
    },
  }
}
function elementsIn(tree) {
  const elements = []
  const visit = node => {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!React.isValidElement(node)) return
    if (typeof node.type === 'function') { visit(node.type(node.props)); return }
    elements.push(node)
    visit(node.props.children)
  }
  visit(tree)
  return elements
}
const createFixture = staticFixture()
const createInitial = createFixture.render()
const createButton = elementsIn(createInitial).find(node => node.type === 'button' &&
  React.Children.toArray(node.props.children).includes('新建任务'))
check('静态夹具能定位正式创建表单入口', typeof createButton?.props.onClick === 'function')
createButton?.props.onClick?.()
const createTree = createFixture.render()
const statusSelect = elementsIn(createTree).find(node => node.type === 'select' && node.props['aria-label'] === '新任务状态')
const createChoices = React.Children.toArray(statusSelect?.props.children)
check('正式创建表单有五个状态选项，按模型顺序包含持续性工作', createChoices.length === 5 &&
  createChoices.every((option, index) => option.props.value === STATUS_KEYS[index] &&
    option.props.children === STATUS_META[STATUS_KEYS[index]].label), createChoices.map(option => option.props.value).join())

const oldDate = '2000-01-01T00:00:00.000Z'
const staticTasks = [
  { id: 'static-ongoing', title: '静态持续性工作', status: 'ongoing', createdAt: oldDate, updatedAt: oldDate, settledAt: oldDate },
  { id: 'static-doing', title: '静态进行中', status: 'doing' },
  { id: 'static-old-done', title: '静态历史完成', status: 'done', settledAt: oldDate },
  { id: 'static-old-dropped', title: '静态历史废弃', status: 'dropped', settledAt: oldDate },
]
const menuFixture = staticFixture(staticTasks)
const menuInitial = menuFixture.render()
const initialElements = elementsIn(menuInitial)
check('正式 bundle 的持续性工作旧时间任务仍在总览，旧完成/废弃保持隐去',
  initialElements.some(node => node.props['data-task-id'] === 'static-ongoing') &&
  initialElements.some(node => node.props['data-task-id'] === 'static-doing') &&
  !initialElements.some(node => ['static-old-done', 'static-old-dropped'].includes(node.props['data-task-id'])))
// 只提供弹出菜单定位所需的受控矩形，无真实 DOM 或桌面路径。
const menuRoot = initialElements.find(node => String(node.props.className || '').split(' ').includes('tbRoot'))
check('提供者归属包装后仍能定位真实业务根节点', Boolean(menuRoot?.ref))
menuRoot.ref.current = { getBoundingClientRect: () => ({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600 }) }
const statusButton = initialElements.find(node => node.type === 'button' &&
  node.props['data-popover-trigger'] === 'status' && node.props['data-menu-task'] === 'static-ongoing')
check('持续性工作卡片使用准确状态标签，而不是被合并到进行中',
  statusButton?.props['data-status'] === 'ongoing' && statusButton.props['aria-label'].includes('持续性工作'))
statusButton?.props.onClick?.({ currentTarget: {
  getBoundingClientRect: () => ({ top: 30, bottom: 54, left: 10, right: 150, width: 140, height: 24 }),
} })
const statusChoices = elementsIn(menuFixture.render()).filter(node => node.props.role === 'menuitemradio')
check('正式状态菜单有五个独立选择，标签与正式模型一致', statusChoices.length === 5 &&
  statusChoices.every((choice, index) => React.Children.toArray(choice.props.children).includes(STATUS_META[STATUS_KEYS[index]].label)),
  String(statusChoices.length))
check('状态菜单只将 ongoing 选为当前状态', statusChoices.filter(choice => choice.props['aria-checked']).length === 1 &&
  statusChoices[STATUS_KEYS.indexOf('ongoing')]?.props['aria-checked'] === true)

const failed = results.filter((result) => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) {
  console.log('未通过：')
  for (const item of failed) console.log(`  ✗ ${item.label} ${item.detail}`)
  process.exit(1)
}
