/**
 * dsh-task-board · 服务端入口
 *
 * 职责：
 *  - 声明插件身份与配置（数据目录由 cordis.patch.yml 通过 dshHomePath 注入）
 *  - 在 /api/dsh-task-board/ 前缀下提供本工作台自己的业务接口
 *  - 任务/子任务的持久化：一个 JSON 文件，原子写入
 *
 * 本工作台不占用 Desktop 或其他插件的路径，也不删除用户数据。
 */
import Schema from '@deepseek-ai/schemastery'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { validateScheduleState } from './schedule-model.js'

export const name = 'dsh-task-board'
export const inject = ['connection']
export const Config = Schema.object({
  root: Schema.string().required(),
})

/** 状态文件版本；读取时做一次迁移判断。 */
const STORE_VERSION = 1
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** 任务状态取值范围。 */
const STATUSES = new Set(['todo', 'doing', 'ongoing', 'done', 'dropped'])

function emptyStore() {
  return { version: STORE_VERSION, tasks: [], updatedAt: new Date().toISOString() }
}

const isTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const isOptionalString = (value) => value === undefined || value === null || typeof value === 'string'

/** 校验已落盘的记录，不能靠过滤无效记录来把损坏的文件伪装成空数据。 */
function validateStoredTasks(tasks) {
  const ids = new Set()
  for (const [index, task] of tasks.entries()) {
    const domain = task?.domain
    const validDomain = domain === undefined || domain === null || (
      typeof domain === 'object' && !Array.isArray(domain) &&
      isOptionalString(domain.path) && isOptionalString(domain.workspaceId) &&
      (domain.kind === undefined || domain.kind === 'md' || domain.kind === 'code')
    )
    const valid = task && typeof task === 'object' && !Array.isArray(task) &&
      typeof task.id === 'string' && task.id.trim() &&
      typeof task.title === 'string' && task.title.trim() &&
      (task.status === undefined || STATUSES.has(task.status)) &&
      (task.note === undefined || typeof task.note === 'string') &&
      isOptionalString(task.parentId) && validDomain &&
      (task.sortIndex === undefined || task.sortIndex === null || Number.isInteger(task.sortIndex)) &&
      (task.createdAt === undefined || isTimestamp(task.createdAt)) &&
      (task.updatedAt === undefined || isTimestamp(task.updatedAt)) &&
      (task.settledAt === undefined || task.settledAt === null || isTimestamp(task.settledAt))
    if (!valid || ids.has(task.id.trim())) {
      throw new Error(`任务数据文件含有不合法或重复的任务记录（第 ${index + 1} 条），原文件已保留。`)
    }
    ids.add(task.id.trim())
  }
  const scheduleIssues = validateScheduleState(tasks)
  if (scheduleIssues.length) {
    throw new Error(`任务数据文件含有不合法的计划：${scheduleIssues.map(issue => issue.message).join(' ')} 原文件已保留。`)
  }
}

/**
 * 仅不存在的文件视为空状态；损坏、格式错误或不可读时明确报错并保留原文件。
 * 缺少旧版可选字段的记录仍可读取，不做迁移或静默删减。
 * @param {string} file - 状态文件的绝对路径。
 */
async function readStore(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyStore()
    throw new Error(`无法读取任务数据文件（${error?.code || '读取失败'}），原文件已保留。`, { cause: error })
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error('任务数据文件不是合法 JSON，原文件已保留。', { cause: error })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.tasks)) {
    throw new Error('任务数据文件结构无效（需要 tasks 数组），原文件已保留。')
  }
  if (parsed.version !== undefined && parsed.version !== STORE_VERSION) {
    throw new Error('任务数据文件版本不受支持，原文件已保留。')
  }
  if (parsed.updatedAt !== undefined && !isTimestamp(parsed.updatedAt)) {
    throw new Error('任务数据文件的更新时间无效，原文件已保留。')
  }
  validateStoredTasks(parsed.tasks)
  return {
    version: STORE_VERSION,
    tasks: parsed.tasks,
    updatedAt: parsed.updatedAt ?? new Date().toISOString(),
  }
}

/** 原子写入：先写临时文件再 rename，避免半截文件。 */
/**
 * 原子写：先写临时文件再 rename。
 * 临时名必须唯一（pid 不够）：拖拽等操作可能在同一进程内触发并发保存，
 * 若共用同一个临时文件，先完成的 rename 会让后一个写盘直接 ENOENT。
 * 再加一个进程内串行队列，彻底避免并发写互相踩踏。
 */
let writeChain = Promise.resolve()

async function writeStore(file, store) {
  const run = async () => {
    // 检查必须在串行队列内：无法读取或已损坏的数据绝不能被下一次保存覆盖。
    await readStore(file)
    await mkdir(dirname(file), { recursive: true })
    const payload = JSON.stringify({ ...store, version: STORE_VERSION, updatedAt: new Date().toISOString() }, null, 2)
    const unique = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const temporary = `${file}.${unique}.tmp`
    try {
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, file)
    } catch (error) {
      // 写失败时清掉临时文件，避免留下垃圾
      await rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }
  // 串行化：前一个写完再写下一个，保证最后一次写入是最终状态
  const next = writeChain.then(run, run)
  writeChain = next.catch(() => {})
  return next
}

/**
 * 校验并规范化客户端提交的单个任务。
 * 只接受已知字段，避免客户端把任意结构写进状态文件。
 * @param {unknown} input - 客户端提交的任务对象。
 * @returns 规范化后的任务，或 null（表示不合法）。
 */
function normalizeTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim().slice(0, 128) : null
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 500) : ''
  if (!id || !title) return null
  const status = STATUSES.has(input.status) ? input.status : 'todo'
  const parentId = typeof input.parentId === 'string' && input.parentId.trim() ? input.parentId.trim().slice(0, 128) : null
  const domain = input.domain && typeof input.domain === 'object' && !Array.isArray(input.domain)
    ? {
        path: typeof input.domain.path === 'string' ? input.domain.path.slice(0, 4096) : null,
        kind: input.domain.kind === 'code' ? 'code' : 'md',
        workspaceId: typeof input.domain.workspaceId === 'string' ? input.domain.workspaceId.slice(0, 128) : null,
      }
    : null
  // 手动排序位次（同组内越小越靠前）；未设置时按状态与更新时间排序
  const sortIndex = Number.isFinite(input.sortIndex) ? Math.trunc(input.sortIndex) : null
  const now = new Date().toISOString()
  return {
    id,
    title,
    note: typeof input.note === 'string' ? input.note.slice(0, 20000) : '',
    status,
    parentId,
    sortIndex,
    domain,
    createdAt: isTimestamp(input.createdAt) ? input.createdAt : now,
    updatedAt: isTimestamp(input.updatedAt) ? input.updatedAt : now,
    settledAt: isTimestamp(input.settledAt) ? input.settledAt : null,
    // 新计划字段只在明确提供时携带；旧版本 1 记录不补日期/模式/负责人。
    ...Object.fromEntries(['planStartDate', 'planEndDate', 'planMode', 'assignee']
      .filter(field => Object.prototype.hasOwnProperty.call(input, field))
      .map(field => [field, input[field]])),
  }
}

/** 读取请求体并按上限截断，防止超大请求占用内存。 */
async function readJsonBody(request) {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new Error('请求体过大。')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是合法 JSON。')
  }
}

const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } })

/** 允许在工作域里浏览与编辑的扩展名：md 文档 + 常见代码/文本文件。 */
const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.mdx', '.txt', '.json', '.yml', '.yaml', '.toml', '.ini', '.env',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.cs', '.c', '.h', '.cpp', '.hpp', '.cc',
  '.swift', '.php', '.sh', '.bash', '.zsh', '.fish', '.sql', '.css', '.scss', '.less',
  '.html', '.htm', '.xml', '.svg', '.graphql', '.proto', '.lua', '.r', '.pl', '.ex', '.exs',
])
/** 目录浏览时跳过的噪声目录。 */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next', '.cache', '__pycache__'])
/** 单次读取的文件大小上限（1 MiB）。 */
const MAX_FILE_BYTES = 1024 * 1024
/** 目录浏览返回的最大条目数。 */
const MAX_ENTRIES = 400

/** 判断一个扩展名是否可编辑。 */
const isTextFile = (name) => TEXT_EXTENSIONS.has(extname(name).toLowerCase())

/**
 * 递归收集工作域内的可编辑文件。
 * @param {string} root - 用户已确认的工作域绝对路径。
 * @param {string} current - 当前遍历目录。
 * @param {Array} out - 结果累加数组。
 */
async function collectFiles(root, current, out) {
  if (out.length >= MAX_ENTRIES) return
  let entries
  try {
    entries = await readdir(current, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_ENTRIES) return
    if (entry.name.startsWith('.') && entry.name !== '.env') continue
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue
      await collectFiles(root, full, out)
      continue
    }
    if (!entry.isFile() || !isTextFile(entry.name)) continue
    let size = 0
    try {
      size = (await stat(full)).size
    } catch {
      continue
    }
    out.push({
      name: entry.name,
      path: full,
      relative: full.slice(root.length + 1),
      size,
    })
  }
}

const withinPath = (target, base) => target === base || target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`)

/** 新文件可不存在；沿父链找到真实的已存在目录，绝不跨过无法解析的符号链接。 */
async function realTargetPath(target, create) {
  let current = target
  const missing = []
  for (;;) {
    try {
      return join(await realpath(current), ...missing.slice().reverse())
    } catch (error) {
      if (!create || error?.code !== 'ENOENT') throw error
      const existing = await lstat(current).catch((problem) => {
        if (problem?.code === 'ENOENT') return null
        throw problem
      })
      if (existing) throw new Error('工作域路径包含无法解析的符号链接。')
      const parent = dirname(current)
      if (parent === current) throw error
      missing.push(basename(current))
      current = parent
    }
  }
}

/**
 * 路径必须位于已登记目录及其 realpath 边界内。
 * 返回真实路径供后续读写使用，阻止目录/文件符号链接逃逸；登记的根自身可以是链接。
 * @param {unknown} raw - 客户端提交的路径。
 * @param {string[]} domains - 已登记的工作域绝对路径列表。
 * @param {boolean} create - 是否允许末尾文件及子目录尚不存在。
 */
async function requireDomainPath(raw, domains, create = false) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('缺少路径参数。')
  const value = raw.trim()
  if (!isAbsolute(value)) throw new Error('路径必须是绝对路径。')
  const target = resolve(value)

  for (const domain of domains) {
    const base = resolve(domain)
    let realBase
    try {
      realBase = await realpath(base)
    } catch (error) {
      if (withinPath(target, base)) throw error
      continue
    }
    // 也接受文件列表返回的真实路径（例如用户登记的根本身是符号链接）。
    if (!withinPath(target, base) && !withinPath(target, realBase)) continue
    const realTarget = await realTargetPath(target, create)
    if (!withinPath(realTarget, realBase)) {
      throw new Error('这个路径通过符号链接越出了已登记的工作域。')
    }
    return realTarget
  }
  throw new Error('这个路径不在任何已登记的工作域内。')
}

export function apply(ctx, config) {
  const file = join(config.root, 'tasks.json')

  /**
   * 读取当前已登记的工作域路径列表。
   * 每次请求都从状态文件读，保证界面刚选完文件夹立刻就能用，
   * 也让「解除绑定」立刻生效——不需要重启插件。
   */
  const readDomains = async () => {
    const store = await readStore(file)
    return store.tasks
      .map((task) => task?.domain?.path)
      .filter((path) => typeof path === 'string' && path.trim() && isAbsolute(path))
  }

  ctx.connection.fetch.register({
    path: '/api/dsh-task-board/state',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        // Capability is response metadata only, never a persisted store migration.
        return json({ ...await readStore(file), scheduleProtocol: 1 })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : '无法读取任务数据。' }, 500)
      }
    },
  })

  ctx.connection.fetch.register({
    path: '/api/dsh-task-board/state/write',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        const payload = await readJsonBody(request)
        if (!payload || typeof payload !== 'object' || !Array.isArray(payload.tasks)) {
          return json({ error: '缺少 tasks 数组。' }, 400)
        }
        // 先验证显式输入的字段类型，不能在规范化时截断/丢弃不合法的计划。
        const inputScheduleIssues = validateScheduleState(payload.tasks)
        if (inputScheduleIssues.length) return json({ error: inputScheduleIssues.map(issue => issue.message).join('\n') }, 400)
        const tasks = payload.tasks.map(normalizeTask)
        if (tasks.some((task) => task === null)) return json({ error: '存在不合法的任务记录。' }, 400)
        if (new Set(tasks.map((task) => task.id)).size !== tasks.length) return json({ error: '任务 ID 不能重复。' }, 400)
        // ID/parentId 的既有规范化也可能改变父链；完整提案通过后才能原子落盘。
        const scheduleIssues = validateScheduleState(tasks)
        if (scheduleIssues.length) return json({ error: scheduleIssues.map(issue => issue.message).join('\n') }, 400)
        await writeStore(file, { tasks })
        return json({ ok: true, count: tasks.length })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : '无法保存任务数据。' }, 500)
      }
    },
  })

  // 列出某个工作域里的可编辑文件。
  ctx.connection.fetch.register({
    path: '/api/dsh-task-board/files',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        const path = await requireDomainPath(new URL(request.url).searchParams.get('path'), await readDomains())
        const info = await stat(path).catch(() => null)
        if (!info?.isDirectory()) return json({ error: '工作域目录不存在。' }, 404)
        const files = []
        await collectFiles(path, path, files)
        files.sort((a, b) => a.relative.localeCompare(b.relative))
        return json({ files })
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : '无法读取目录。' },
          error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 400)
      }
    },
  })

  // 读取或写入一个文件。
  //
  // 宿主对 exact 路由按 path 唯一：同一条路径不能注册两次，所以 GET 与 POST
  // 必须合并为一条路由，在 fetch 内按 request.method 分派。
  ctx.connection.fetch.register({
    path: '/api/dsh-task-board/file',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') {
          const path = await requireDomainPath(new URL(request.url).searchParams.get('path'), await readDomains())
          const info = await stat(path).catch(() => null)
          if (!info?.isFile()) return json({ error: '文件不存在。' }, 404)
          if (info.size > MAX_FILE_BYTES) return json({ error: '文件过大，无法在面板中打开。' }, 413)
          if (!isTextFile(basename(path))) return json({ error: '这个文件类型不支持在面板中打开。' }, 415)
          return json({ path, content: await readFile(path, 'utf8') })
        }

        if (request.method === 'POST') {
          const payload = await readJsonBody(request)
          const path = await requireDomainPath(payload?.path, await readDomains(), payload?.create === true)
          const content = typeof payload?.content === 'string' ? payload.content : ''
          if (!isTextFile(basename(path))) return json({ error: '只能在这个面板中保存文本类文件。' }, 415)
          if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) return json({ error: '内容过大，无法保存。' }, 413)
          if (payload?.create !== true) {
            const info = await stat(path).catch(() => null)
            if (!info?.isFile()) return json({ error: '文件不存在，无法保存。' }, 404)
          }
          await mkdir(dirname(path), { recursive: true })
          await writeFile(path, content, { encoding: 'utf8', flag: payload?.create === true ? 'wx' : 'w' })
          return json({ ok: true, path })
        }

        return json({ error: '不支持的方法。' }, 405)
      } catch (error) {
        if (error?.code === 'EEXIST') return json({ error: '文件已存在，未覆盖原内容。' }, 409)
        return json({ error: error instanceof Error ? error.message : '无法处理文件请求。' },
          error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 404 : 400)
      }
    },
  })
}
