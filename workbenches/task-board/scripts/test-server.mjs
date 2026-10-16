#!/usr/bin/env node
/**
 * 服务端行为测试：直接调用 apply() 注册的路由处理函数，验证任务读写与文件接口。
 * 不启动 HTTP 服务，也不接触真实用户数据（使用临时目录）。
 *
 * 用法：node scripts/test-server.mjs
 */
import { chmod, mkdtemp, mkdir, readFile, realpath, stat, symlink, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { apply } from '../dsh/index.js'
import { getSchedules } from '../dsh/schedule-model.js'

const results = []
const check = (label, condition, detail = '') => {
  results.push({ label, pass: !!condition, detail })
  console.log(`${condition ? 'ok  ' : 'FAIL'}  ${label}${detail && !condition ? ` — ${detail}` : ''}`)
}

/**
 * 收集 apply() 注册的所有路由。
 * 复刻宿主约束：exact 路由按 path 唯一，同一路径重复注册会抛错——
 * 这正是本地启动测试抓到的真实缺陷，必须在单测里固定下来。
 */
function collectRoutes(config) {
  const routes = new Map()
  const seenPaths = new Set()
  const ctx = {
    connection: {
      fetch: {
        register(route) {
          if (seenPaths.has(route.path)) {
            throw new Error(`connection: exact Fetch route "${route.path}" is already registered`)
          }
          seenPaths.add(route.path)
          for (const method of route.methods) routes.set(`${method} ${route.path}`, route)
          return () => routes.delete(route.path)
        },
      },
    },
  }
  apply(ctx, config)
  return routes
}

const temporaryBase = await realpath(tmpdir())
const root = await mkdtemp(join(temporaryBase, 'tb-test-'))
const stateFile = join(root, 'tasks.json')
const routes = collectRoutes({ root })

const call = async (key, { method = 'GET', body, query, routeMap = routes } = {}) => {
  const route = routeMap.get(key)
  if (!route) throw new Error(`route missing: ${key}`)
  const url = `http://local${route.path}${query ? `?${query}` : ''}`
  const request = new Request(url, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  })
  const response = await route.fetch(request)
  return { status: response.status, data: await response.json() }
}

const STATE = 'GET /api/dsh-task-board/state'
const WRITE = 'POST /api/dsh-task-board/state/write'
const FILES = 'GET /api/dsh-task-board/files'
const FILE_GET = 'GET /api/dsh-task-board/file'
const FILE_POST = 'POST /api/dsh-task-board/file'

try {
  // --- 路由注册 -----------------------------------------------------------
  const allPaths = new Set([...routes.keys()].map(key => key.split(' ').slice(1).join(' ')))
  check('任务与文件接口为 5 条方法路由、4 个唯一路径', routes.size === 5 && allPaths.size === 4, [...routes.keys()].join(' | '))
  check('已移除全部本地日历接口', ![...routes.keys()].some(key => key.includes('/calendar/')))
  check(
    '接口都在 /api/dsh-task-board/ 前缀下',
    [...routes.keys()].every((key) => key.includes('/api/dsh-task-board/')),
  )

  // --- 初始状态 -----------------------------------------------------------
  const empty = await call(STATE)
  check('初始状态可读且为空', empty.status === 200 && Array.isArray(empty.data.tasks) && empty.data.tasks.length === 0)
  check('读取响应显式声明计划协议，防止新客户端被旧服务静默丢弃字段', empty.data.scheduleProtocol === 1)
  check('读取能力标记不会生成或迁移空状态文件', await stat(stateFile).catch(() => null) === null)
  check('响应不再声明本地日历连接能力', !Object.hasOwn(empty.data, 'calendarProtocol'))

  // --- 写入与回读 ---------------------------------------------------------
  const write = await call(WRITE, {
    method: 'POST',
    body: {
      tasks: [
        { id: 'a', title: '一级任务 A', status: 'doing', note: '背景' },
        { id: 'b', title: '子任务 B', status: 'todo', parentId: 'a', domain: { path: join(root, 'placeholder-domain'), kind: 'md' } },
        { id: 'c', title: '已完成 C', status: 'done', settledAt: new Date().toISOString() },
      ],
    },
  })
  check('写入任务成功', write.status === 200 && write.data.ok === true, JSON.stringify(write.data))

  const reread = await call(STATE)
  check('回读得到 3 条任务', reread.data.tasks.length === 3, `实际 ${reread.data.tasks.length}`)
  check('能力协议信息只在响应中，不侵入版本1存储结构', reread.data.scheduleProtocol === 1 && !Object.hasOwn(JSON.parse(await readFile(stateFile, 'utf8')), 'scheduleProtocol'))
  const taskB = reread.data.tasks.find((task) => task.id === 'b')
  check('子任务的 parentId 得到保留', taskB?.parentId === 'a', JSON.stringify(taskB))
  check('工作域信息得到保留', taskB?.domain?.path === join(root, 'placeholder-domain') && taskB?.domain?.kind === 'md', JSON.stringify(taskB?.domain))

  // --- 持续性工作：独立状态、任意层级与版本 1 原样往返 --------------------
  const ongoingTasks = [
    { id: 'continuous-root', title: '持续性工作根任务', note: '长期维护\n保留原笔记 ✓', status: 'ongoing',
      parentId: null, sortIndex: 7,
      domain: { path: join(root, 'ongoing-domain'), kind: 'code', workspaceId: 'ongoing-workspace' },
      createdAt: '2018-01-02T03:04:05.000Z', updatedAt: '2019-02-03T04:05:06.000Z', settledAt: null },
    { id: 'continuous-child', title: '独立待办子任务', note: '子任务笔记', status: 'todo',
      parentId: 'continuous-root', sortIndex: 4, domain: null,
      createdAt: '2018-01-03T03:04:05.000Z', updatedAt: '2019-02-04T04:05:06.000Z', settledAt: null },
    { id: 'continuous-grandchild', title: '嵌套持续性工作', note: '多级持续记录', status: 'ongoing',
      parentId: 'continuous-child', sortIndex: 2,
      domain: { path: join(root, 'ongoing-child-domain'), kind: 'md', workspaceId: 'nested-workspace' },
      createdAt: '2018-01-04T03:04:05.000Z', updatedAt: '2019-02-05T04:05:06.000Z',
      settledAt: '2017-01-01T00:00:00.000Z' },
    { id: 'continuous-peer', title: '原有进行中任务', note: '不自动迁移', status: 'doing',
      parentId: null, sortIndex: 1, domain: null,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-02-01T00:00:00.000Z', settledAt: null },
  ]
  const ongoingWrite = await call(WRITE, { method: 'POST', body: { tasks: ongoingTasks } })
  const ongoingRead = await call(STATE)
  check('持续性工作根任务与多级子任务可写入和读取，不被降为待办', ongoingWrite.status === 200 &&
    ongoingWrite.data.count === ongoingTasks.length && ongoingRead.status === 200 &&
    ongoingRead.data.tasks[0]?.status === 'ongoing' && ongoingRead.data.tasks[2]?.status === 'ongoing',
    JSON.stringify(ongoingRead.data))
  check('持续性工作完整保留身份、标题、笔记、域、父级、数组顺序、位次与时间戳',
    isDeepStrictEqual(ongoingRead.data.tasks, ongoingTasks), JSON.stringify(ongoingRead.data.tasks))
  const ongoingDisk = JSON.parse(await readFile(stateFile, 'utf8'))
  check('持续性工作落盘保持版本 1，没有重新生成任务或改写既有数据', ongoingRead.data.version === 1 &&
    ongoingDisk.version === 1 && isDeepStrictEqual(ongoingDisk.tasks, ongoingTasks), JSON.stringify(ongoingDisk))
  const ongoingRoundtripWrite = await call(WRITE, { method: 'POST', body: { tasks: ongoingRead.data.tasks } })
  const ongoingRoundtripRead = await call(STATE)
  check('持续性工作二次全量保存后仍逐字段一致', ongoingRoundtripWrite.status === 200 &&
    ongoingRoundtripRead.status === 200 && isDeepStrictEqual(ongoingRoundtripRead.data.tasks, ongoingTasks))
  const ongoingEditedPeer = ongoingRead.data.tasks.map(task => task.id === 'continuous-peer'
    ? { ...task, note: '只改旁边的任务', updatedAt: '2024-03-01T00:00:00.000Z' } : task)
  const ongoingPeerWrite = await call(WRITE, { method: 'POST', body: { tasks: ongoingEditedPeer } })
  const ongoingAfterPeer = await call(STATE)
  check('保存其他任务不会改变持续性工作记录或其子树', ongoingPeerWrite.status === 200 &&
    ongoingAfterPeer.status === 200 && isDeepStrictEqual(ongoingAfterPeer.data.tasks, ongoingEditedPeer) &&
    ongoingAfterPeer.data.tasks.slice(0, 3).every((task, index) => isDeepStrictEqual(task, ongoingTasks[index])))

  // API 历来按时间戳合法性规范化，不按状态重写：进入 ongoing 的清理属于客户端 applyStatus。
  const suppliedSettlement = '2016-02-03T04:05:06.000Z'
  const settlementInputs = [
    { label: '省略', fields: {}, expected: null },
    { label: 'null', fields: { settledAt: null }, expected: null },
    { label: '非法', fields: { settledAt: 'invalid' }, expected: null },
    { label: '有效旧值', fields: { settledAt: suppliedSettlement }, expected: suppliedSettlement },
  ]
  const normalizedSettlementTasks = ['todo', 'doing', 'ongoing'].flatMap(status => settlementInputs.map((sample, index) => ({
    id: `settlement-${status}-${index}`, title: `${status} ${sample.label}`, status, ...sample.fields,
  })))
  const settlementWrite = await call(WRITE, { method: 'POST', body: { tasks: normalizedSettlementTasks } })
  const settlementRead = await call(STATE)
  check('ongoing 的 settledAt 输入沿用 todo/doing 规范化：省略/null/非法清空，有效值保留',
    settlementWrite.status === 200 && settlementRead.status === 200 &&
    normalizedSettlementTasks.every((input, index) => settlementRead.data.tasks[index]?.status === input.status &&
      settlementRead.data.tasks[index]?.settledAt === settlementInputs[index % settlementInputs.length].expected),
    JSON.stringify(settlementRead.data))

  // 原始旧数据和含 ongoing 的旧时间/缺字段夹具都必须可读，GET 不迁移也不写盘。
  const compatibleTasks = [
    ...['todo', 'doing', 'done', 'dropped'].map((status, index) => ({ id: `old-status-${status}`, title: `旧 ${status}`,
      note: '旧记录不自动改状态', status, sortIndex: index,
      createdAt: '2010-01-01T00:00:00.000Z', updatedAt: '2010-01-02T00:00:00.000Z',
      ...(status === 'done' || status === 'dropped' ? { settledAt: '2010-01-02T00:00:00.000Z' } : {}) })),
    { id: 'raw-ongoing', title: '时间字段缺失的持续性工作', status: 'ongoing', note: '保留缺省字段' },
    { id: 'raw-nested-ongoing', title: '旧时间的持续性工作子级', status: 'ongoing', parentId: 'raw-ongoing',
      sortIndex: 8, createdAt: '2009-01-01T00:00:00.000Z', updatedAt: '2009-01-02T00:00:00.000Z',
      settledAt: '2009-01-02T00:00:00.000Z', domain: { path: join(root, 'raw-domain'), kind: 'md' } },
  ]
  await writeFile(stateFile, JSON.stringify({ version: 1, tasks: compatibleTasks, updatedAt: '2011-01-01T00:00:00.000Z' }), 'utf8')
  const compatibleBytes = await readFile(stateFile)
  const compatibleRead = await call(STATE)
  check('原有四状态与旧时间/缺时间的 ongoing 都不被误判为状态损坏', compatibleRead.status === 200 &&
    compatibleRead.data.version === 1 && isDeepStrictEqual(compatibleRead.data.tasks, compatibleTasks), JSON.stringify(compatibleRead.data))
  check('读取不自动迁移原有四状态、不补写时间或可选字段，原始字节不变',
    (await readFile(stateFile)).equals(compatibleBytes) && compatibleRead.data.updatedAt === '2011-01-01T00:00:00.000Z')
  const compatibleWrite = await call(WRITE, { method: 'POST', body: { tasks: compatibleRead.data.tasks } })
  const compatibleAfterWrite = await call(STATE)
  check('含 ongoing 的合法原始夹具不会阻塞下一次保存，原有四状态保持不变', compatibleWrite.status === 200 &&
    compatibleAfterWrite.status === 200 && compatibleAfterWrite.data.tasks.every((task, index) =>
      task.status === compatibleTasks[index].status && task.id === compatibleTasks[index].id), JSON.stringify(compatibleAfterWrite.data))

  // --- 输入校验 -----------------------------------------------------------
  const badShape = await call(WRITE, { method: 'POST', body: { nope: true } })
  check('缺少 tasks 数组时返回 400', badShape.status === 400, `status=${badShape.status}`)

  const badTask = await call(WRITE, { method: 'POST', body: { tasks: [{ id: 'x', title: '' }] } })
  check('标题为空的任务被拒绝', badTask.status === 400, `status=${badTask.status}`)

  const badStatus = await call(WRITE, { method: 'POST', body: { tasks: [{ id: 'x', title: 't', status: 'weird' }] } })
  const coerced = await call(STATE)
  check(
    '未知状态被规范化而不是写入',
    badStatus.status === 200 && coerced.status === 200 && coerced.data.tasks.length === 1 && coerced.data.tasks[0].status === 'todo',
  )

  // --- 手动排序字段 -------------------------------------------------------
  const withSort = await call(WRITE, {
    method: 'POST',
    body: { tasks: [
      { id: 's-1', title: '甲', sortIndex: 2 },
      { id: 's-2', title: '乙', sortIndex: 0 },
      { id: 's-3', title: '丙', sortIndex: 1 },
    ] },
  })
  const sorted = await call(STATE)
  check(
    'sortIndex 被保留（手动排序可持久化）',
    withSort.status === 200 && sorted.data.tasks.find((t) => t.id === 's-2')?.sortIndex === 0,
    JSON.stringify(sorted.data.tasks.map((t) => [t.id, t.sortIndex])),
  )
  const badSort = await call(WRITE, {
    method: 'POST',
    body: { tasks: [{ id: 's-9', title: '丁', sortIndex: 'abc' }] },
  })
  const coercedSort = await call(STATE)
  check(
    '非法 sortIndex 被规范化为 null 而不是写入脏值',
    badSort.status === 200 && coercedSort.data.tasks[0].sortIndex === null,
    String(coercedSort.data.tasks[0].sortIndex),
  )
  // --- 时间戳与原有任务数据：保存其他任务不能改写未触及的时间/位次 -------
  const chronology = [
    { id: 'old', title: '较旧', status: 'todo', note: '保留这段笔记',
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-02-01T00:00:00.000Z', sortIndex: 9 },
    { id: 'new', title: '较新', status: 'doing', parentId: 'old', sortIndex: 3,
      createdAt: '2021-01-01T00:00:00.000Z', updatedAt: '2021-02-01T00:00:00.000Z',
      domain: { path: join(root, 'chrono-domain'), kind: 'code', workspaceId: 'fixture-workspace' } },
    { id: 'settled', title: '已结算', status: 'done', sortIndex: null,
      createdAt: '2019-01-01T00:00:00.000Z', updatedAt: '2019-02-01T00:00:00.000Z',
      settledAt: '2019-02-01T00:00:00.000Z' },
  ]
  const chronologyWrite = await call(WRITE, { method: 'POST', body: { tasks: chronology } })
  const firstChronology = await call(STATE)
  check('有效的 createdAt / updatedAt 原样保留', chronologyWrite.status === 200 &&
    firstChronology.data.tasks.every((task, index) => task.createdAt === chronology[index].createdAt &&
      task.updatedAt === chronology[index].updatedAt), JSON.stringify(firstChronology.data))
  const touched = firstChronology.data.tasks.map((task) => task.id === 'new'
    ? { ...task, note: '只改这一条', updatedAt: '2022-03-01T00:00:00.000Z' } : task)
  const touchWrite = await call(WRITE, { method: 'POST', body: { tasks: touched } })
  const afterTouch = await call(STATE)
  check('回读完整保留 ID、父级、域、笔记、结算时间、数组顺序与 sortIndex', touchWrite.status === 200 &&
    JSON.stringify(afterTouch.data.tasks) === JSON.stringify(touched), JSON.stringify(afterTouch.data))
  check('未触及任务的时间戳不被全量保存重置', afterTouch.data.tasks[0].updatedAt === chronology[0].updatedAt &&
    afterTouch.data.tasks[2].updatedAt === chronology[2].updatedAt)
  const beforeDuplicate = await readFile(stateFile)
  const duplicate = await call(WRITE, { method: 'POST', body: { tasks: [chronology[0], chronology[0]] } })
  check('重复 ID 被拒绝且不修改已保存数据', duplicate.status === 400 &&
    (await readFile(stateFile)).equals(beforeDuplicate), JSON.stringify(duplicate.data))
  const invalidDates = await call(WRITE, { method: 'POST', body: { tasks: [
    { id: 'dates', title: '无效输入时间', createdAt: 'invalid', updatedAt: 'invalid', settledAt: 'invalid' },
  ] } })
  const repairedDates = await call(STATE)
  check('无效输入时间被规范化为有效默认值', invalidDates.status === 200 && repairedDates.status === 200 &&
    Number.isFinite(Date.parse(repairedDates.data.tasks[0].createdAt)) &&
    Number.isFinite(Date.parse(repairedDates.data.tasks[0].updatedAt)) && repairedDates.data.tasks[0].settledAt === null)

  // --- 计划：同一个纯模型与版本 1 服务端，全量提案必须先验证后落盘 --------
  {
    const scheduleFields = ['planStartDate', 'planEndDate', 'planMode', 'assignee']
    const scheduleTask = (id, fields = {}) => ({
      id, title: `计划 ${id}`, status: 'ongoing', note: `原笔记 ${id}\n不应丢失 ✓`, parentId: null, sortIndex: 9,
      domain: { path: join(root, 'schedule-domain'), kind: 'code', workspaceId: 'schedule-workspace' },
      createdAt: '2001-01-01T00:00:00.000Z', updatedAt: '2002-02-02T00:00:00.000Z',
      settledAt: '2000-01-01T00:00:00.000Z', ...fields,
    })
    const scheduledTasks = [
      scheduleTask('legacy'), scheduleTask('auto'), scheduleTask('middle', { parentId: 'auto' }),
      scheduleTask('deadline', { parentId: 'middle', planEndDate: '2024-02-29', assignee: '  free text  ' }),
      scheduleTask('one-day', { parentId: 'auto', planStartDate: '2024-02-29', planEndDate: '2024-02-29' }),
      scheduleTask('start-only', { parentId: 'auto', planStartDate: '2024-02-01' }),
      scheduleTask('manual', { planStartDate: '2024-02-01', planEndDate: '2024-03-31' }),
      scheduleTask('manual-child', { parentId: 'manual', planStartDate: '2024-03-01', planEndDate: '2024-03-10', assignee: 'x'.repeat(100) }),
      scheduleTask('manual-empty', { parentId: 'auto', planMode: 'manual' }),
      scheduleTask('deep', { parentId: 'manual-empty', planStartDate: '2024-02-27', planEndDate: '2024-02-28' }),
      scheduleTask('cleared-null', { planStartDate: null, planEndDate: null, assignee: '' }),
      scheduleTask('cleared-empty', { planStartDate: '', planEndDate: '', planMode: 'auto' }),
      ...['todo', 'doing', 'ongoing', 'done', 'dropped'].map(status => scheduleTask(`status-${status}`, {
        status, planStartDate: '1999-01-01', planEndDate: '1999-01-02',
      })),
    ]
    const scheduleWrite = await call(WRITE, { method: 'POST', body: { tasks: scheduledTasks } })
    const scheduleRead = await call(STATE)
    check('计划字段/闰日/同日条/仅开始/截止点可完整保存和读取', scheduleWrite.status === 200 &&
      scheduleRead.status === 200 && isDeepStrictEqual(scheduleRead.data.tasks, scheduledTasks), JSON.stringify(scheduleRead.data))
    check('日期/负责人保持原输入，null 与空日期不被补默认日期或互相替换',
      scheduleRead.data.tasks[10]?.planStartDate === null && scheduleRead.data.tasks[10]?.planEndDate === null &&
      scheduleRead.data.tasks[11]?.planStartDate === '' && scheduleRead.data.tasks[11]?.planEndDate === '' &&
      scheduleRead.data.tasks[3]?.assignee === '  free text  ' && scheduleRead.data.tasks[7]?.assignee.length === 100)
    check('旧记录与默认 AUTO 父级不新增计划日期/模式/负责人字段', [0, 1, 2].every(index =>
      scheduleFields.every(field => !Object.hasOwn(scheduleRead.data.tasks[index], field))))
    const effective = getSchedules(scheduleRead.data.tasks)
    check('服务端原始日期可被同一个模型汇总；start-only 不制造父开始/截止',
      effective.get('auto')?.start === '2024-02-27' && effective.get('auto')?.end === '2024-02-29' &&
      effective.get('auto')?.auto === true && effective.get('auto')?.partial === true &&
      effective.get('auto')?.unscheduledCount === 2 && effective.get('start-only')?.kind === 'empty' &&
      effective.get('deadline')?.kind === 'deadline' && effective.get('one-day')?.kind === 'bar')
    const scheduleDisk = JSON.parse(await readFile(stateFile, 'utf8'))
    check('计划落盘仍为 schema/version 1，所有旧字段、域、笔记、时间与数组顺序不变',
      scheduleDisk.version === 1 && scheduleRead.data.version === 1 && isDeepStrictEqual(scheduleDisk.tasks, scheduledTasks))
    const scheduleRoundtrip = await call(WRITE, { method: 'POST', body: { tasks: scheduleRead.data.tasks } })
    const scheduleRoundtripRead = await call(STATE)
    check('二次全量保存不生成 AUTO 父日期、不重置任务时间或实际结算', scheduleRoundtrip.status === 200 &&
      isDeepStrictEqual(scheduleRoundtripRead.data.tasks, scheduledTasks))
    check('所有实际状态/settledAt 与计划独立，不由计划起止重写', scheduledTasks.slice(-5).every(input => {
      const stored = scheduleRoundtripRead.data.tasks.find(entry => entry.id === input.id)
      return stored?.status === input.status && stored?.settledAt === input.settledAt &&
        stored?.createdAt === input.createdAt && stored?.updatedAt === input.updatedAt
    }))

    const invalidScheduleInputs = [
      ['无效闰日', 'planEndDate', '2025-02-29'], ['无效世纪闰日', 'planStartDate', '1900-02-29'],
      ['越界天数', 'planEndDate', '2024-04-31'], ['零年', 'planStartDate', '0000-01-01'],
      ['省略补零', 'planEndDate', '2024-2-29'], ['带时区/时刻', 'planEndDate', '2024-02-29T00:00:00Z'],
      ['前后空白', 'planStartDate', ' 2024-02-29 '], ['日期数字', 'planStartDate', 20240229],
      ['日期布尔', 'planEndDate', false], ['日期数组', 'planStartDate', []], ['日期对象', 'planEndDate', {}],
      ['负责人过长', 'assignee', 'x'.repeat(101)], ['负责人 null', 'assignee', null],
      ['负责人数字', 'assignee', 42], ['负责人对象', 'assignee', { name: 'x' }],
      ['未知模式', 'planMode', 'AUTO'], ['空模式', 'planMode', ''], ['null 模式', 'planMode', null],
    ]
    const goodBytes = await readFile(stateFile)
    for (const [label, field, value] of invalidScheduleInputs) {
      const proposal = scheduledTasks.map(entry => entry.id === 'legacy' ? { ...entry, [field]: value }
        : entry.id === 'manual-child' ? { ...entry, note: '不应提前提交的另一处修改' } : entry)
      const invalid = await call(WRITE, { method: 'POST', body: { tasks: proposal } })
      check(`计划输入 ${label}：明确 400 且命名任务，不静默过滤/规范化`, invalid.status === 400 &&
        typeof invalid.data.error === 'string' && invalid.data.error.includes('计划 legacy'), JSON.stringify(invalid.data))
      check(`计划输入 ${label}：全量提案原子拒绝、原文件字节不变`, (await readFile(stateFile)).equals(goodBytes))
    }
    const backwards = scheduledTasks.map(entry => entry.id === 'manual-child'
      ? { ...entry, planStartDate: '2024-03-11' } : entry)
    const reversedWrite = await call(WRITE, { method: 'POST', body: { tasks: backwards } })
    check('反向起止日期 400、错误可操作且不替换文件', reversedWrite.status === 400 &&
      /manual-child.*早于.*调整/.test(reversedWrite.data.error) && (await readFile(stateFile)).equals(goodBytes), JSON.stringify(reversedWrite.data))
    const overflow = scheduledTasks.map(entry => entry.id === 'manual-child'
      ? { ...entry, planEndDate: '2024-04-01' } : entry.id === 'legacy' ? { ...entry, assignee: 'no partial commit' } : entry)
    const overflowWrite = await call(WRITE, { method: 'POST', body: { tasks: overflow } })
    check('手动日期（mode 缺省也算）不会因孩子越界自动扩展，原子 400 指明子/父/截止边界', overflowWrite.status === 400 &&
      /manual-child.*manual.*2024-03-31.*调整/.test(overflowWrite.data.error) && (await readFile(stateFile)).equals(goodBytes), JSON.stringify(overflowWrite.data))
    const laterManual = scheduledTasks.map(entry => entry.id === 'auto'
      ? { ...entry, planMode: 'manual', planEndDate: '2024-02-28' } : entry)
    const laterManualWrite = await call(WRITE, { method: 'POST', body: { tasks: laterManual } })
    check('后来给 AUTO 父级明确手动截止前先检验所有已有后代', laterManualWrite.status === 400 &&
      /deadline.*auto.*2024-02-28/.test(laterManualWrite.data.error) && (await readFile(stateFile)).equals(goodBytes), JSON.stringify(laterManualWrite.data))
    const normalizedLink = await call(WRITE, { method: 'POST', body: { tasks: [
      scheduleTask(' normalized-bound ', { planEndDate: '2024-01-31' }),
      scheduleTask('normalized-child', { parentId: 'normalized-bound ', planEndDate: '2024-02-01' }),
    ] } })
    check('既有 ID/父级 trim 规范化后形成的父链也重新验证，不借此绕过边界', normalizedLink.status === 400 &&
      /normalized-child.*normalized-bound/.test(normalizedLink.data.error) && (await readFile(stateFile)).equals(goodBytes), JSON.stringify(normalizedLink.data))

    // 全量提案允许同批更新父/子最终一致；不检查不曾落盘的中间态。
    const batch = scheduledTasks.map(entry => entry.id === 'manual'
      ? { ...entry, planStartDate: '2024-04-01', planEndDate: '2024-04-30' }
      : entry.id === 'manual-child' ? { ...entry, planStartDate: '2024-04-10', planEndDate: '2024-04-20' } : entry)
    const batchWrite = await call(WRITE, { method: 'POST', body: { tasks: batch } })
    const afterBatch = await call(STATE)
    check('合法父/子计划批次按最终状态一起写入，未触及记录逐字段不变', batchWrite.status === 200 &&
      isDeepStrictEqual(afterBatch.data.tasks, batch), JSON.stringify(afterBatch.data))

    const moveTasks = [
      scheduleTask('origin'), scheduleTask('branch', { parentId: 'origin' }),
      scheduleTask('moved-deep', { parentId: 'branch', planStartDate: '2024-02-10', planEndDate: '2024-02-15' }),
      scheduleTask('destination', { planStartDate: '2024-01-01', planEndDate: '2024-01-31' }),
    ]
    const moveSeed = await call(WRITE, { method: 'POST', body: { tasks: moveTasks } })
    const beforeMove = await readFile(stateFile)
    const moved = moveTasks.map(entry => entry.id === 'branch' ? { ...entry, parentId: 'destination' } : entry)
    const badMove = await call(WRITE, { method: 'POST', body: { tasks: moved } })
    check('跨父级移动验证整棵子树，不能把 AUTO 中转下的深层任务移出手动边界', moveSeed.status === 200 &&
      badMove.status === 400 && /moved-deep.*destination.*2024-01-31/.test(badMove.data.error) &&
      (await readFile(stateFile)).equals(beforeMove), JSON.stringify(badMove.data))
    const expanded = moved.map(entry => entry.id === 'destination' ? { ...entry, planEndDate: '2024-02-29' } : entry)
    const legalMove = await call(WRITE, { method: 'POST', body: { tasks: expanded } })
    const legalMoveRead = await call(STATE)
    check('用户明确同批扩展手动父边界后移动可成功，深层笔记/域/结算/时间不变', legalMove.status === 200 &&
      isDeepStrictEqual(legalMoveRead.data.tasks, expanded) &&
      isDeepStrictEqual(legalMoveRead.data.tasks[2], moveTasks[2]), JSON.stringify(legalMoveRead.data))
    const autoDestination = moved.map(entry => entry.id === 'destination' ? { ...entry, planMode: 'auto' } : entry)
    const autoMove = await call(WRITE, { method: 'POST', body: { tasks: autoDestination } })
    const autoMoveRead = await call(STATE)
    check('显式 AUTO 父级旧日期不成为硬约束，也不被服务端静默重写', autoMove.status === 200 &&
      isDeepStrictEqual(autoMoveRead.data.tasks, autoDestination) &&
      getSchedules(autoMoveRead.data.tasks).get('destination')?.start === '2024-02-10' &&
      getSchedules(autoMoveRead.data.tasks).get('destination')?.end === '2024-02-15')

    const nested = [scheduleTask('outer', { planStartDate: '2024-01-01', planEndDate: '2024-01-31' }),
      scheduleTask('auto-middle', { parentId: 'outer' }),
      scheduleTask('inner', { parentId: 'auto-middle', planMode: 'manual', planStartDate: '2024-01-10' }),
      scheduleTask('nested-deep', { parentId: 'inner', planStartDate: '2024-01-20', planEndDate: '2024-01-25' })]
    const nestedSeed = await call(WRITE, { method: 'POST', body: { tasks: nested } })
    const nestedBytes = await readFile(stateFile)
    const nestedOverflow = nested.map(entry => entry.id === 'nested-deep' ? { ...entry, planEndDate: '2024-02-01' } : entry)
    const nestedWrite = await call(WRITE, { method: 'POST', body: { tasks: nestedOverflow } })
    check('所有手动祖先都生效，近父无截止/中间 AUTO 不会屏蔽远祖边界', nestedSeed.status === 200 &&
      nestedWrite.status === 400 && /nested-deep.*outer.*2024-01-31/.test(nestedWrite.data.error) &&
      (await readFile(stateFile)).equals(nestedBytes), JSON.stringify(nestedWrite.data))

    const cyclic = [scheduleTask('cycle-a', { parentId: 'cycle-b', planStartDate: '2000-01-01', planEndDate: '2000-01-02' }),
      scheduleTask('cycle-b', { parentId: 'cycle-a', planStartDate: '2099-01-01', planEndDate: '2099-01-02' }),
      scheduleTask('cycle-descendant', { parentId: 'cycle-a', planEndDate: '2100-01-01' }),
      scheduleTask('self', { parentId: 'self' }), scheduleTask('orphan', { parentId: 'missing', planEndDate: '2000-01-01' })]
    const cyclicWrite = await call(WRITE, { method: 'POST', body: { tasks: cyclic } })
    const cyclicRead = await call(STATE)
    check('旧环/自指/孤儿父链不新增拒绝或挂死，不错误套用循环父日期', cyclicWrite.status === 200 &&
      cyclicRead.status === 200 && isDeepStrictEqual(cyclicRead.data.tasks, cyclic), JSON.stringify(cyclicRead.data))

    const rawScheduleTasks = [
      { id: 'raw-old', title: '无新字段旧记录', note: '不改原文', customLegacy: { retainedOnRead: true } },
      { id: 'raw-auto', title: '无时间 AUTO 父' },
      { id: 'raw-point', title: '仅截止', parentId: 'raw-auto', planEndDate: '2000-02-29', assignee: '' },
      { id: 'raw-null', title: '明确 null', planStartDate: null, planEndDate: '' },
    ]
    const rawStore = JSON.stringify({ version: 1, tasks: rawScheduleTasks, updatedAt: '2000-01-01T00:00:00.000Z' }, null, 3)
    await writeFile(stateFile, rawStore, 'utf8')
    const rawBytes = await readFile(stateFile)
    const rawRead = await call(STATE)
    check('读取合法新旧混合计划不规范化/迁移/补字段，未知旧字段仍原样返回', rawRead.status === 200 &&
      isDeepStrictEqual(rawRead.data.tasks, rawScheduleTasks) && rawRead.data.updatedAt === '2000-01-01T00:00:00.000Z')
    check('读取合法计划文件原始字节不变（含格式/时间/显式 null）', (await readFile(stateFile)).equals(rawBytes))
  }

  // --- 并发写：拖拽同时改状态与排序会触发并发保存 ------------------------
  {
    const burst = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        call(WRITE, { method: 'POST', body: { tasks: [{ id: `burst-${index}`, title: '并发', sortIndex: index }] } }),
      ),
    )
    check(
      '并发写不再因临时文件竞争而失败（ENOENT 回归）',
      burst.every((r) => r.status === 200),
      JSON.stringify(burst.map((r) => r.status)),
    )
    const after = await call(STATE)
    check(
      '并发写后文件仍可正常读取',
      after.status === 200 && Array.isArray(after.data.tasks),
      `status=${after.status}`,
    )
  }

  // --- 持久化落盘 ---------------------------------------------------------
  const onDisk = JSON.parse(await readFile(join(root, 'tasks.json'), 'utf8'))
  check('数据确实写入磁盘', Array.isArray(onDisk.tasks) && onDisk.tasks.length === 1, `磁盘上 ${onDisk.tasks?.length} 条`)

  // --- 文件接口 -----------------------------------------------------------
  // 文件接口只服务已登记的工作域，所以先把该目录登记到一个任务上。
  const domain = join(root, 'domain')
  await mkdir(join(domain, 'sub'), { recursive: true })
  await call(WRITE, {
    method: 'POST',
    body: { tasks: [{ id: 'd1', title: '带工作域的任务', domain: { path: domain, kind: 'md' } }] },
  })
  await writeFile(join(domain, 'note.md'), '# 标题\n\n正文', 'utf8')
  await writeFile(join(domain, 'main.ts'), 'const x = 1\n', 'utf8')
  await writeFile(join(domain, 'sub', 'deep.md'), 'deep', 'utf8')
  await writeFile(join(domain, 'image.png'), 'not-really', 'utf8')
  await mkdir(join(domain, 'node_modules'), { recursive: true })
  await writeFile(join(domain, 'node_modules', 'skip.md'), 'skip', 'utf8')

  const listed = await call(FILES, { query: `path=${encodeURIComponent(domain)}` })
  const names = (listed.data.files || []).map((file) => file.relative).sort()
  check('列出 md 与代码文件', names.includes('note.md') && names.includes('main.ts'), JSON.stringify(names))
  check('递归进入子目录', names.includes(join('sub', 'deep.md')), JSON.stringify(names))
  check('跳过非文本文件', !names.includes('image.png'), JSON.stringify(names))
  check('跳过 node_modules', !names.some((name) => name.includes('node_modules')), JSON.stringify(names))

  const read = await call(FILE_GET, { query: `path=${encodeURIComponent(join(domain, 'note.md'))}` })
  check('读取 md 内容', read.status === 200 && read.data.content.includes('正文'), JSON.stringify(read.data).slice(0, 120))
  check('md 走 GET 分支', read.status === 200)

  // 同一路径的 POST 保存
  const postRoute = routes.get(FILE_POST)
  const saveResponse = await postRoute.fetch(
    new Request(`http://local${postRoute.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(domain, 'note.md'), content: '# 改过了' }),
    }),
  )
  check('保存已有文件成功', saveResponse.status === 200, `status=${saveResponse.status}`)
  check('磁盘内容已更新', (await readFile(join(domain, 'note.md'), 'utf8')) === '# 改过了')

  const createResponse = await postRoute.fetch(
    new Request(`http://local${postRoute.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(domain, 'brand-new.md'), content: 'new', create: true }),
    }),
  )
  check('新建文件成功', createResponse.status === 200, `status=${createResponse.status}`)
  check('新建文件内容确实落盘', (await readFile(join(domain, 'brand-new.md'), 'utf8')) === 'new')

  const collisionBytes = await readFile(join(domain, 'note.md'))
  const collision = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'note.md'), content: '', create: true } })
  check('同名新建返回 409，而不是截断原文件', collision.status === 409, JSON.stringify(collision.data))
  check('同名新建后原文件字节完全不变', (await readFile(join(domain, 'note.md'))).equals(collisionBytes))
  const racingPath = join(domain, 'racing-create.md')
  const racingBodies = ['first', 'second']
  const racingCreates = await Promise.all(racingBodies.map((content) =>
    call(FILE_POST, { method: 'POST', body: { path: racingPath, content, create: true } })))
  check('并发同名新建只有一次成功，另一次 409',
    JSON.stringify(racingCreates.map((result) => result.status).sort()) === '[200,409]')
  check('并发新建不会覆盖获胜者的内容', (await readFile(racingPath, 'utf8')) ===
    racingBodies[racingCreates.findIndex((result) => result.status === 200)])
  const nestedCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'new-sub', 'deeper', 'new.md'), content: 'nested', create: true } })
  check('域内不存在的子目录仍可安全新建文件', nestedCreate.status === 200 &&
    (await readFile(join(domain, 'new-sub', 'deeper', 'new.md'), 'utf8')) === 'nested', JSON.stringify(nestedCreate.data))

  const missingResponse = await postRoute.fetch(
    new Request(`http://local${postRoute.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(domain, 'does-not-exist.md'), content: 'x' }),
    }),
  )
  check('保存不存在的文件返回 404', missingResponse.status === 404, `status=${missingResponse.status}`)

  const binResponse = await postRoute.fetch(
    new Request(`http://local${postRoute.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(domain, 'evil.sh'), content: 'x', create: true }),
    }),
  )
  check('允许列表内的 .sh 文件可新建', binResponse.status === 200, `status=${binResponse.status}`)
  const unknownExtension = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'unknown.bin'), content: 'x', create: true } })
  check('未知扩展名被拒绝且不落盘', unknownExtension.status === 415 &&
    !(await stat(join(domain, 'unknown.bin')).catch(() => null)))

  // --- 符号链接边界：所有目标都是本测试拥有的临时夹具 --------------------
  const escapeDir = join(root, 'unregistered')
  const escapeFile = join(escapeDir, 'secret.md')
  await mkdir(escapeDir)
  await writeFile(escapeFile, 'OUTSIDE FIXTURE', 'utf8')
  await symlink(escapeFile, join(domain, 'escaped-file.md'))
  await symlink(escapeDir, join(domain, 'escaped-dir'))
  const escapedRead = await call(FILE_GET, { query: `path=${encodeURIComponent(join(domain, 'escaped-file.md'))}` })
  check('拒绝读取逃出域的文件符号链接', escapedRead.status === 400 && escapedRead.data.content === undefined)
  const escapedWrite = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'escaped-file.md'), content: 'overwrite' } })
  const escapedCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'escaped-file.md'), content: '', create: true } })
  check('拒绝通过文件链接保存或新建，域外夹具字节不变', escapedWrite.status === 400 &&
    escapedCreate.status === 400 && (await readFile(escapeFile, 'utf8')) === 'OUTSIDE FIXTURE')
  const escapedList = await call(FILES, { query: `path=${encodeURIComponent(join(domain, 'escaped-dir'))}` })
  const escapedDirectoryRead = await call(FILE_GET,
    { query: `path=${encodeURIComponent(join(domain, 'escaped-dir', 'secret.md'))}` })
  check('拒绝目录符号链接的列表与读取', escapedList.status === 400 && escapedDirectoryRead.status === 400)
  const escapedNestedCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'escaped-dir', 'new-sub', 'new.md'), content: 'x', create: true } })
  check('不存在的创建父目录也不能通过链接逃逸', escapedNestedCreate.status === 400 &&
    !(await stat(join(escapeDir, 'new-sub')).catch(() => null)))
  await symlink(join(escapeDir, 'missing-parent'), join(domain, 'dangling-dir'))
  await symlink(join(escapeDir, 'missing.md'), join(domain, 'dangling-file.md'))
  const danglingDirectoryCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'dangling-dir', 'nested', 'new.md'), content: 'x', create: true } })
  const danglingFileCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'dangling-file.md'), content: 'x', create: true } })
  check('无法解析的文件/目录链接被拒绝，不创建域外目标', danglingDirectoryCreate.status === 400 &&
    danglingFileCreate.status === 400 && !(await stat(join(escapeDir, 'missing-parent')).catch(() => null)) &&
    !(await stat(join(escapeDir, 'missing.md')).catch(() => null)))
  const listWithLinks = await call(FILES, { query: `path=${encodeURIComponent(domain)}` })
  check('正常目录列表不遍历或暴露逃逸链接', listWithLinks.status === 200 &&
    listWithLinks.data.files.every((file) => !file.relative.startsWith('escaped-') && !file.relative.startsWith('dangling-')))
  await symlink(join(domain, 'note.md'), join(domain, 'internal-link.md'))
  const internalRead = await call(FILE_GET, { query: `path=${encodeURIComponent(join(domain, 'internal-link.md'))}` })
  const internalWrite = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'internal-link.md'), content: 'internal save' } })
  check('仍允许域内文件链接的读取与保存', internalRead.status === 200 && internalWrite.status === 200 &&
    (await readFile(join(domain, 'note.md'), 'utf8')) === 'internal save')
  const internalCollision = await call(FILE_POST, { method: 'POST',
    body: { path: join(domain, 'internal-link.md'), content: '', create: true } })
  check('通过域内链接同名新建仍返回 409 且不覆盖目标', internalCollision.status === 409 &&
    (await readFile(join(domain, 'note.md'), 'utf8')) === 'internal save')

  // 用户选中的根本身是链接时，真实根就是明确授权的边界。
  const domainAlias = join(root, 'domain-alias')
  await symlink(domain, domainAlias)
  await call(WRITE, { method: 'POST', body: { tasks: [
    { id: 'alias-root', title: '根目录链接', domain: { path: domainAlias, kind: 'md' } },
  ] } })
  const aliasList = await call(FILES, { query: `path=${encodeURIComponent(domainAlias)}` })
  const listedRealFile = aliasList.data.files?.find((file) => file.name === 'note.md')
  const aliasRead = await call(FILE_GET, { query: `path=${encodeURIComponent(listedRealFile?.path || domainAlias)}` })
  check('登记的根链接可列出文件，并可读取列表返回的真实路径', aliasList.status === 200 &&
    !!listedRealFile && aliasRead.status === 200 && aliasRead.data.content === 'internal save')
  const aliasCreate = await call(FILE_POST, { method: 'POST',
    body: { path: join(domainAlias, 'alias-created.md'), content: 'alias', create: true } })
  check('通过登记的根链接新建落在真实域内', aliasCreate.status === 200 &&
    (await readFile(join(domain, 'alias-created.md'), 'utf8')) === 'alias')

  const relative = await call(FILES, { query: `path=${encodeURIComponent('relative/dir')}` })
  check('拒绝相对路径', relative.status === 400, `status=${relative.status}`)

  // 未登记的路径先被工作域边界挡住（400）；已登记但已被删除的目录才是 404。
  const missingDir = await call(FILES, { query: `path=${encodeURIComponent(join(root, 'nope'))}` })
  check('未登记路径被工作域边界拒绝', missingDir.status === 400, `status=${missingDir.status}`)

  const goneDir = join(root, 'gone-domain')
  await call(WRITE, {
    method: 'POST',
    body: { tasks: [{ id: 'gone', title: '目录已消失', domain: { path: goneDir, kind: 'md' } }] },
  })
  const gone = await call(FILES, { query: `path=${encodeURIComponent(goneDir)}` })
  check('已登记但目录已不存在时返回 404（可重新选择）', gone.status === 404, `status=${gone.status}`)

  const noPath = await call(FILE_GET, {})
  check('缺少 path 参数时返回 400', noPath.status === 400, `status=${noPath.status}`)

  // --- 路径必须落在已登记的工作域内（安全边界） ---------------------------
  // 只检查「是绝对路径」会把接口变成任意文件读取器；这里固定住真正的约束。
  const outsideDir = join(root, 'outside-domain')
  const outsideFile = join(outsideDir, 'secret.txt')
  await mkdir(outsideDir)
  await writeFile(outsideFile, 'SECRET', 'utf8')

  const outsideRead = await call(FILE_GET, { query: `path=${encodeURIComponent(outsideFile)}` })
  check('工作域之外的文件不可读', outsideRead.status === 400, `status=${outsideRead.status}`)

  const outsideList = await call(FILES, { query: `path=${encodeURIComponent(outsideDir)}` })
  check('工作域之外的目录不可列', outsideList.status === 400, `status=${outsideList.status}`)

  // 把该目录登记为工作域后，同一路径应当变得可用
  await call(WRITE, { method: 'POST', body: { tasks: [{ id: 'dom', title: '带工作域的任务', domain: { path: outsideDir, kind: 'md' } }] } })
  const nowAllowed = await call(FILE_GET, { query: `path=${encodeURIComponent(outsideFile)}` })
  check('登记为工作域后即可读取', nowAllowed.status === 200, `status=${nowAllowed.status}`)

  const traversal = await call(FILE_GET, { query: `path=${encodeURIComponent(`${outsideDir}/../unregistered/secret.md`)}` })
  check('用 .. 越出工作域被拒绝', traversal.status === 400, `status=${traversal.status}`)

  const sibling = await call(FILES, { query: `path=${encodeURIComponent(`${outsideDir}-evil`)}` })
  check('同前缀的兄弟目录不被误判为工作域内', sibling.status === 400, `status=${sibling.status}`)

  const writeOutside = await routes.get(FILE_POST).fetch(
    new Request(`http://local${routes.get(FILE_POST).path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: join(outsideDir, '..', 'written.md'), content: 'x', create: true }),
    }),
  )
  check('不能通过写接口在工作域外创建文件', writeOutside.status === 400, `status=${writeOutside.status}`)

  // --- 状态损坏必须报错并保留原字节，不能被保存操作覆盖 ------------------
  const invalidStores = [
    ['非法 JSON', '{ this is not json'],
    ['缺少 tasks 数组', JSON.stringify({ version: 1, nope: true })],
    ['null 任务', JSON.stringify({ version: 1, tasks: [null] })],
    ['空任务标题', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: '' }] })],
    ['重复任务 ID', JSON.stringify({ version: 1, tasks: [
      { id: 'duplicate', title: 'first' }, { id: 'duplicate', title: 'second' },
    ] })],
    ['非法任务状态', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: 'x', status: 'invalid' }] })],
    ['非法笔记类型', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: 'x', note: 42 }] })],
    ['非法域结构', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: 'x', domain: [] }] })],
    ['非法排序类型', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: 'x', sortIndex: 'first' }] })],
    ['非法任务时间', JSON.stringify({ version: 1, tasks: [{ id: 'invalid', title: 'x', updatedAt: 'invalid' }] })],
    ['持续性工作非法结算时间', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-ongoing', title: 'x', status: 'ongoing', settledAt: 'invalid' }] })],
    ['持续性工作非法域字段', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-ongoing', title: 'x', status: 'ongoing', domain: { path: 42 } }] })],
    ['持续性工作重复 ID', JSON.stringify({ version: 1, tasks: [
      { id: 'duplicate-ongoing', title: 'first', status: 'ongoing' },
      { id: 'duplicate-ongoing', title: 'second', status: 'ongoing', parentId: 'duplicate-ongoing' },
    ] })],
    ['计划非法日历日期', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效计划', planEndDate: '2025-02-29' }] })],
    ['计划日期类型错误', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效类型', planStartDate: 42 }] })],
    ['计划包含时刻', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '非日历日期', planEndDate: '2024-02-29T12:00:00Z' }] })],
    ['计划反向起止', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '反向计划', planStartDate: '2025-01-02', planEndDate: '2025-01-01' }] })],
    ['计划负责人超长', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效负责人', assignee: 'x'.repeat(101) }] })],
    ['计划负责人 null', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效负责人', assignee: null }] })],
    ['计划负责人类型错误', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效负责人', assignee: {} }] })],
    ['计划模式错误', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效模式', planMode: 'unknown' }] })],
    ['计划模式 null', JSON.stringify({ version: 1, tasks: [{ id: 'invalid-plan', title: '无效模式', planMode: null }] })],
    ['计划手动祖先边界冲突', JSON.stringify({ version: 1, tasks: [
      { id: 'bounded', title: '手动父任务', planEndDate: '2025-01-31' },
      { id: 'auto-middle', title: '自动中转', parentId: 'bounded' },
      { id: 'outside-plan', title: '越界深层任务', parentId: 'auto-middle', planEndDate: '2025-02-01' },
    ] })],
    ['未知数据版本', JSON.stringify({ version: 2, tasks: [] })],
  ]
  for (const [label, bytes] of invalidStores) {
    await writeFile(stateFile, bytes, 'utf8')
    const before = await readFile(stateFile)
    const broken = await call(STATE)
    check(`${label}：读取返回明确 500，不伪装为空任务`, broken.status === 500 &&
      typeof broken.data.error === 'string' && broken.data.error.includes('原文件已保留') && broken.data.tasks === undefined,
      JSON.stringify(broken.data))
    const blockedWrite = await call(WRITE, { method: 'POST', body: { tasks: [] } })
    check(`${label}：保存返回 500，原文件字节不变`, blockedWrite.status === 500 &&
      (await readFile(stateFile)).equals(before), JSON.stringify(blockedWrite.data))
  }

  // 旧版可选字段不齐全仍可读；一次失败不应毒化串行写队列。
  await writeFile(stateFile, JSON.stringify({ tasks: [{ id: 'legacy', title: '旧记录', note: '原笔记' }] }), 'utf8')
  const legacy = await call(STATE)
  check('缺少旧版可选字段仍可读，且记录不被丢弃', legacy.status === 200 && legacy.data.version === 1 &&
    legacy.data.tasks.length === 1 && legacy.data.tasks[0].note === '原笔记')
  const recovered = await call(WRITE, { method: 'POST', body: { tasks: [{ id: 'recovered', title: '可继续保存' }] } })
  const recoveredState = await call(STATE)
  check('修复夹具后队列仍可保存，STORE_VERSION 保持 1', recovered.status === 200 &&
    recoveredState.status === 200 && recoveredState.data.version === 1 && recoveredState.data.tasks[0].id === 'recovered')

  // 一个目录不能被当作空状态后替换；仅对本测试的子目录操作。
  const unreadableRoot = join(root, 'unreadable-store')
  const unreadableState = join(unreadableRoot, 'tasks.json')
  await mkdir(unreadableState, { recursive: true })
  await writeFile(join(unreadableState, 'keep.txt'), 'KEEP', 'utf8')
  const unreadableRoutes = collectRoutes({ root: unreadableRoot })
  const unreadableRead = await call(STATE, { routeMap: unreadableRoutes })
  const unreadableWrite = await call(WRITE, { method: 'POST', routeMap: unreadableRoutes, body: { tasks: [] } })
  check('不可读状态路径的 I/O 错误返回 500，不当作不存在', unreadableRead.status === 500 &&
    typeof unreadableRead.data.error === 'string' && unreadableRead.data.error.includes('原文件已保留'))
  check('不可读状态路径不会被替换，原夹具保持不变', unreadableWrite.status === 500 &&
    (await stat(unreadableState)).isDirectory() && (await readFile(join(unreadableState, 'keep.txt'), 'utf8')) === 'KEEP')
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    const beforePermission = await readFile(stateFile)
    await chmod(stateFile, 0o000)
    try {
      const permissionRead = await call(STATE)
      const permissionWrite = await call(WRITE, { method: 'POST', body: { tasks: [] } })
      check('无读取权限时读写都明确失败，不当作空状态', permissionRead.status === 500 && permissionWrite.status === 500,
        JSON.stringify([permissionRead, permissionWrite]))
    } finally {
      await chmod(stateFile, 0o600)
    }
    check('权限错误后原状态字节仍不变', (await readFile(stateFile)).equals(beforePermission))
  } else {
    console.log('SKIP  权限位测试：当前用户可绕过文件权限；目录 I/O 错误已单独覆盖')
  }
} finally {
  // 删除前核对绝对路径确为本次 mkdtemp 创建的直接子目录。
  if (dirname(root) !== temporaryBase || !basename(root).startsWith('tb-test-') || await realpath(root) !== root) {
    throw new Error('临时测试目录校验失败，拒绝删除。')
  }
  await rm(root, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.pass)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
if (failed.length > 0) {
  console.log('未通过：')
  for (const item of failed) console.log(`  ✗ ${item.label} ${item.detail}`)
  process.exit(1)
}
