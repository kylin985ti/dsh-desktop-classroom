#!/usr/bin/env node
/** Pure schedule behavior only; no user data, filesystem writes, servers or Desktop. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { isPlanDate, dateToDay, todayDate, getSchedules, validateScheduleState, applyScheduleChanges } from '../dsh/schedule-model.js'

let count = 0
const test = (label, run) => { run(); count++; console.log(`ok    ${label}`) }
const timestamp = '2025-06-01T12:34:56.000Z'
const oldTime = '2000-02-03T04:05:06.000Z'
const task = (id, fields = {}) => ({
  id, title: `任务 ${id}`, parentId: null, status: 'doing', note: '保留\n原有笔记 ✓', sortIndex: 7,
  domain: { path: '/fixture/not-opened', kind: 'code', workspaceId: 'fixture-workspace' },
  createdAt: '1999-01-01T00:00:00.000Z', updatedAt: oldTime, settledAt: '2000-01-02T00:00:00.000Z', ...fields,
})
const bar = (id, parentId = null, start = '2025-01-10', end = '2025-01-15', fields = {}) =>
  task(id, { parentId, planStartDate: start, planEndDate: end, ...fields })
const schedule = (tasks, id = tasks[0].id) => getSchedules(tasks).get(id)
const issues = tasks => validateScheduleState(tasks)
const freezeTasks = tasks => Object.freeze(tasks.map(entry => Object.freeze(entry)))
const scheduleFields = ['planStartDate', 'planEndDate', 'planMode', 'assignee']

for (const value of ['0001-01-01', '0099-12-31', '1900-02-28', '2000-02-29', '2024-02-29', '2400-02-29', '9999-12-31']) {
  test(`严格合法日历日期 ${value}`, () => assert.equal(isPlanDate(value), true))
}
for (const value of [undefined, null, '', 20250101, {}, [], '2025-1-01', '2025-01-1', '25-01-01',
  '0000-01-01', '10000-01-01', '2025-00-01', '2025-13-01', '2025-01-00', '2025-01-32',
  '2025-04-31', '2025-02-29', '1900-02-29', '2100-02-29', '2024-02-30',
  ' 2025-01-01', '2025-01-01 ', '2025-01-01\n', '2025-01-01T00:00:00Z', '2025/01/01', '+2025-01-01']) {
  test(`拒绝非严格日期 ${JSON.stringify(value)}`, () => {
    assert.equal(isPlanDate(value), false)
    assert.equal(dateToDay(value), null)
  })
}
test('UTC 日索引以 Unix 日零点为 0，之前为负整数', () => {
  assert.equal(dateToDay('1970-01-01'), 0)
  assert.equal(dateToDay('1969-12-31'), -1)
  assert.equal(dateToDay('1970-01-02'), 1)
})
test('小于 100 年不误转到 1900 年，边界年份仍为整数', () => {
  assert.equal(dateToDay('0100-01-01') - dateToDay('0099-12-31'), 1)
  for (const value of ['0001-01-01', '0099-01-01', '9999-12-31']) assert.equal(Number.isInteger(dateToDay(value)), true)
})
test('闰日和非闰世纪按真正的日历天数计算', () => {
  assert.equal(dateToDay('2000-03-01') - dateToDay('2000-02-28'), 2)
  assert.equal(dateToDay('1900-03-01') - dateToDay('1900-02-28'), 1)
})
test('todayDate 使用本地年月日且每次调用才取当前时间', () => {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  assert.equal(todayDate(), `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
})
for (const [tz, expected] of [['UTC', '2025-01-01'], ['Pacific/Honolulu', '2024-12-31'], ['Pacific/Kiritimati', '2025-01-01'], ['America/New_York', '2024-12-31']]) {
  test(`${tz}：today 为本地日期，计划日索引不受时区/DST 影响`, () => {
    const source = `import assert from 'node:assert/strict';
      import { todayDate, dateToDay } from ${JSON.stringify(new URL('../dsh/schedule-model.js', import.meta.url).href)};
      const RealDate = Date;
      globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2025-01-01T00:30:00.000Z'])) } };
      assert.equal(todayDate(), ${JSON.stringify(expected)});
      assert.equal(dateToDay('1970-01-01'), 0);
      assert.equal(dateToDay('2025-03-10') - dateToDay('2025-03-08'), 2);
      assert.equal(dateToDay('2025-11-03') - dateToDay('2025-11-01'), 2);`
    execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ: tz }, stdio: 'pipe' })
  })
}

test('旧任务没有日期默认值、读时迁移或字段补齐', () => {
  const old = freezeTasks([{ id: 'legacy', title: '旧记录' }, { id: 'child', title: '旧子任务', parentId: 'legacy' }])
  assert.deepEqual(issues(old), [])
  assert.deepEqual(schedule(old), { start: null, end: null, kind: 'empty', auto: true, hasChildren: true,
    partial: true, unscheduledCount: 1, descendantCount: 1 })
  assert.deepEqual(old, [{ id: 'legacy', title: '旧记录' }, { id: 'child', title: '旧子任务', parentId: 'legacy' }])
  for (const entry of old) for (const field of scheduleFields) assert.equal(Object.hasOwn(entry, field), false)
})
test('叶子完整日期形成 bar，包括同一天', () => {
  assert.deepEqual(schedule([bar('leaf')]), { start: '2025-01-10', end: '2025-01-15', kind: 'bar', auto: false,
    hasChildren: false, partial: false, unscheduledCount: 0, descendantCount: 0 })
  assert.equal(schedule([bar('one-day', null, '2025-01-10', '2025-01-10')]).kind, 'bar')
})
test('叶子只有开始没有时间线，不借用今天/结算时间制造截止', () => {
  assert.deepEqual(schedule([task('start', { planStartDate: '2025-01-10' })]), {
    start: '2025-01-10', end: null, kind: 'empty', auto: false, hasChildren: false,
    partial: true, unscheduledCount: 0, descendantCount: 0,
  })
})
test('叶子只有截止形成 deadline 点，不伪造开始日期', () => {
  assert.deepEqual(schedule([task('deadline', { planEndDate: '2025-01-10' })]), {
    start: null, end: '2025-01-10', kind: 'deadline', auto: false, hasChildren: false,
    partial: true, unscheduledCount: 0, descendantCount: 0,
  })
})
for (const cleared of ['', null]) test(`日期明确清除 ${JSON.stringify(cleared)} 保持空、不更改原表示`, () => {
  const entry = task('clear', { planStartDate: cleared, planEndDate: cleared })
  assert.deepEqual(issues([entry]), [])
  assert.equal(schedule([entry]).start, null)
  assert.equal(schedule([entry]).end, null)
  assert.equal(entry.planStartDate, cleared)
  assert.equal(entry.planEndDate, cleared)
})
test('叶子不因 planMode auto 丢弃自己的计划', () => {
  const value = schedule([bar('leaf', null, '2025-01-10', '2025-01-15', { planMode: 'auto' })])
  assert.equal(value.auto, false)
  assert.equal(value.start, '2025-01-10')
  assert.equal(value.end, '2025-01-15')
})
for (const status of ['todo', 'doing', 'ongoing', 'done', 'dropped']) test(`${status} 与实际 settledAt 不参与计划推导`, () => {
  const entry = bar(status, null, '2025-01-10', '2025-01-15', { status, settledAt: '1980-01-01T00:00:00Z' })
  assert.deepEqual(schedule([entry]), schedule([bar('reference')]))
  assert.equal(entry.settledAt, '1980-01-01T00:00:00Z')
})

const rolled = [task('root'), task('middle', { parentId: 'root' }), bar('early', 'middle', '2025-01-02', '2025-01-04'),
  bar('late', 'root', '2025-01-20', '2025-01-25')]
test('默认 AUTO 按任意层级的已排期后代汇总范围', () => {
  assert.deepEqual(issues(rolled), [])
  assert.deepEqual(schedule(rolled), { start: '2025-01-02', end: '2025-01-25', kind: 'bar', auto: true,
    hasChildren: true, partial: false, unscheduledCount: 0, descendantCount: 3 })
  assert.equal(schedule(rolled, 'middle').start, '2025-01-02')
  assert.equal(schedule(rolled, 'middle').descendantCount, 1)
})
test('汇总保持原数组 Map 顺序，不回写父任务日期或时间戳', () => {
  const before = structuredClone(rolled)
  assert.deepEqual([...getSchedules(rolled).keys()], rolled.map(entry => entry.id))
  assert.deepEqual(rolled, before)
  assert.equal(Object.hasOwn(rolled[0], 'planStartDate'), false)
  assert.equal(rolled[0].updatedAt, oldTime)
})
test('只有截止的子任务以该日作为父范围 anchor，父计划仍 partial', () => {
  const source = [task('parent'), task('point', { parentId: 'parent', planEndDate: '2025-01-10' })]
  assert.deepEqual(schedule(source), { start: '2025-01-10', end: '2025-01-10', kind: 'bar', auto: true,
    hasChildren: true, partial: true, unscheduledCount: 0, descendantCount: 1 })
  assert.equal(schedule(source, 'point').kind, 'deadline')
})
test('开始而无截止的后代不制造或扩展自动父级时间线', () => {
  const source = [task('parent'), task('start', { parentId: 'parent', planStartDate: '1900-01-01' })]
  assert.equal(schedule(source).kind, 'empty')
  assert.equal(schedule(source).start, null)
  assert.equal(schedule(source).end, null)
  assert.equal(schedule(source).unscheduledCount, 1)
  const withBar = [...source, bar('planned', 'parent')]
  assert.equal(schedule(withBar).start, '2025-01-10')
  assert.equal(schedule(withBar).end, '2025-01-15')
  assert.equal(schedule(withBar).partial, true)
})
test('多层未排期/partial 计数不遗漏深层、不重复计算同一后代', () => {
  const source = [...rolled, task('empty', { parentId: 'middle' }), task('start', { parentId: 'middle', planStartDate: '2025-01-01' }),
    task('deadline', { parentId: 'root', planEndDate: '2025-01-30' })]
  assert.equal(schedule(source).descendantCount, 6)
  assert.equal(schedule(source).unscheduledCount, 2)
  assert.equal(schedule(source).partial, true)
  assert.equal(schedule(source).end, '2025-01-30')
})
test('模式缺省但父任务有显式日期时按 manual 硬边界，不静默覆盖或延长', () => {
  const source = [bar('manual', null, '2025-01-01', '2025-01-31'), bar('inside', 'manual')]
  assert.equal(schedule(source).auto, false)
  assert.equal(schedule(source).start, '2025-01-01')
  assert.equal(schedule(source).end, '2025-01-31')
  assert.deepEqual(issues(source), [])
  const outside = [...source, bar('late', 'manual', '2025-02-01', '2025-02-02')]
  assert.equal(schedule(outside).end, '2025-01-31')
  assert.ok(issues(outside).some(issue => issue.taskId === 'late' && issue.code === 'ancestor_end'))
})
test('显式 auto 父级忽略旧手动日期，不作为硬约束、不改原字段', () => {
  const source = [bar('auto', null, '1999-01-01', '1999-01-02', { planMode: 'auto' }), bar('child', 'auto')]
  assert.equal(schedule(source).auto, true)
  assert.equal(schedule(source).start, '2025-01-10')
  assert.equal(source[0].planEndDate, '1999-01-02')
  assert.deepEqual(issues(source), [])
})
test('null/空日期且 mode 缺省仍为 AUTO，显式 manual 则保持无日期', () => {
  for (const cleared of [null, '']) {
    const auto = [task('root', { planStartDate: cleared, planEndDate: cleared }), bar('child', 'root')]
    assert.equal(schedule(auto).auto, true)
    const manual = [{ ...auto[0], planMode: 'manual' }, auto[1]]
    assert.equal(schedule(manual).auto, false)
    assert.equal(schedule(manual).kind, 'empty')
    assert.deepEqual(issues(manual), [])
  }
})
test('未设日期的 manual 父级允许子级独立计划，祖级仍汇总深层真实日期', () => {
  const source = [task('grand'), task('manual', { parentId: 'grand', planMode: 'manual' }), bar('deep', 'manual')]
  assert.equal(schedule(source).start, '2025-01-10')
  assert.equal(schedule(source).end, '2025-01-15')
  assert.equal(schedule(source).partial, true)
  assert.equal(schedule(source).unscheduledCount, 1)
  assert.equal(schedule(source, 'manual').kind, 'empty')
  assert.deepEqual(issues(source), [])
})

for (const [field, value, code] of [['planStartDate', '2025-02-30', 'invalid_date'], ['planEndDate', 42, 'invalid_date'],
  ['planStartDate', undefined, 'invalid_date'], ['planEndDate', false, 'invalid_date'], ['planMode', '', 'invalid_plan_mode'],
  ['planMode', null, 'invalid_plan_mode'], ['planMode', 'AUTO', 'invalid_plan_mode'], ['assignee', null, 'invalid_assignee'],
  ['assignee', 42, 'invalid_assignee'], ['assignee', 'x'.repeat(101), 'invalid_assignee']]) {
  test(`字段类型不静默截断/丢弃 ${field}=${String(value).slice(0, 15)}`, () => {
    const invalid = issues([task('named', { [field]: value })])
    assert.equal(invalid.length, 1)
    assert.deepEqual(Object.keys(invalid[0]), ['taskId', 'field', 'code', 'message'])
    assert.equal(invalid[0].taskId, 'named')
    assert.equal(invalid[0].field, field)
    assert.equal(invalid[0].code, code)
    assert.match(invalid[0].message, /任务 named/)
  })
}
test('负责人允许 0..100 原始文本字符（含空格，不 trim 或截断）', () => {
  for (const assignee of ['', '  free text  ', 'x'.repeat(100)]) assert.deepEqual(issues([task('owner', { assignee })]), [])
})
test('开始早于/等于截止合法，反向日期给出命名可操作错误', () => {
  assert.deepEqual(issues([bar('one', null, '2025-01-01', '2025-01-01')]), [])
  const problem = issues([bar('reversed', null, '2025-02-01', '2025-01-31')])
  assert.equal(problem[0].code, 'date_order')
  assert.equal(problem[0].field, 'planEndDate')
  assert.match(problem[0].message, /reversed.*2025-01-31.*2025-02-01.*调整/)
})
test('手动父级 start/end 同时约束后代的两种日期，边界日可用', () => {
  const parent = bar('parent', null, '2025-01-01', '2025-01-31', { planMode: 'manual' })
  assert.deepEqual(issues([parent, bar('same', 'parent', '2025-01-01', '2025-01-31')]), [])
  const bad = issues([parent, bar('child', 'parent', '2024-12-31', '2025-02-01')])
  assert.ok(bad.some(issue => issue.field === 'planStartDate' && issue.code === 'ancestor_start'))
  assert.ok(bad.some(issue => issue.field === 'planEndDate' && issue.code === 'ancestor_end'))
  assert.ok(bad.every(issue => /任务 child/.test(issue.message) && /任务 parent/.test(issue.message) && /调整/.test(issue.message)))
})
test('手动边界检查所有祖先，不只看最近父级或 AUTO 中转', () => {
  const source = [bar('outer', null, '2025-01-01', '2025-01-31'), task('auto', { parentId: 'outer' }),
    task('inner', { parentId: 'auto', planMode: 'manual', planEndDate: '2025-01-20' }),
    bar('deep', 'inner', '2024-12-31', '2025-01-25')]
  const bad = issues(source)
  assert.ok(bad.some(issue => issue.taskId === 'deep' && issue.code === 'ancestor_start' && /outer/.test(issue.message)))
  assert.ok(bad.some(issue => issue.taskId === 'deep' && issue.code === 'ancestor_end' && /inner/.test(issue.message)))
})
test('仅设父级开始或截止只约束对应方向，子级 start-only 也不能越界', () => {
  const lower = task('lower', { planMode: 'manual', planStartDate: '2025-01-10' })
  assert.deepEqual(issues([lower, bar('far', 'lower', '2099-01-01', '2099-01-02')]), [])
  assert.ok(issues([lower, task('early', { parentId: 'lower', planStartDate: '2025-01-09' })]).some(issue => issue.code === 'ancestor_start'))
  const upper = task('upper', { planEndDate: '2025-01-10' })
  assert.deepEqual(issues([upper, bar('old', 'upper', '1900-01-01', '1900-01-02')]), [])
  assert.ok(issues([upper, task('late', { parentId: 'upper', planStartDate: '2025-01-11' })]).some(issue => issue.code === 'ancestor_end'))
})
test('后来明确设置 manual 截止必须验证已有整个子树，失败不覆盖任何记录', () => {
  const source = freezeTasks([task('parent'), task('middle', { parentId: 'parent' }), bar('deep', 'middle')])
  assert.throws(() => applyScheduleChanges(source, [{ id: 'parent', planMode: 'manual', planEndDate: '2025-01-14' }]), /deep.*parent.*2025-01-14/)
  assert.equal(Object.hasOwn(source[0], 'planEndDate'), false)
  const valid = applyScheduleChanges(source, [{ id: 'parent', planMode: 'manual', planEndDate: '2025-01-15' }], { timestamp })
  assert.equal(valid[0].planEndDate, '2025-01-15')
  assert.equal(valid[2], source[2])
})
test('重新归属提案会验证移动的全部深层后代，AUTO 不形成额外约束', () => {
  const source = [task('origin'), task('branch', { parentId: 'origin' }), bar('deep', 'branch'),
    bar('destination', null, '2025-02-01', '2025-02-28')]
  const moved = source.map(entry => entry.id === 'branch' ? { ...entry, parentId: 'destination' } : entry)
  assert.ok(issues(moved).some(issue => issue.taskId === 'deep' && /destination/.test(issue.message)))
  const auto = moved.map(entry => entry.id === 'destination' ? { ...entry, planMode: 'auto' } : entry)
  assert.deepEqual(issues(auto), [])
  assert.equal(schedule(auto, 'destination').start, '2025-01-10')
  assert.equal(source[1].parentId, 'origin')
})
test('孤儿、自指环、循环祖链安全保留，不因旧父链有环新增错误', () => {
  const source = [bar('x', 'y', '2025-01-01', '2025-01-02'), bar('y', 'x', '2026-01-01', '2026-01-02'),
    bar('z', 'x', '2027-01-01', '2027-01-02'), task('self', { parentId: 'self' }), bar('orphan', 'missing')]
  assert.deepEqual(issues(source), [])
  assert.equal(getSchedules(source).size, source.length)
  for (const entry of source) {
    assert.equal(schedule(source, entry.id).hasChildren, false)
    assert.equal(schedule(source, entry.id).descendantCount, 0)
  }
  assert.equal(applyScheduleChanges(source, [{ id: 'z', assignee: 'owner' }], { timestamp })[2].assignee, 'owner')
})
test('深层树派生/校验无递归溢出，完整计数与输入顺序无关', () => {
  const length = 2500
  const source = Array.from({ length }, (_, index) => ({ id: `n${index}`, parentId: index ? `n${index - 1}` : null,
    ...(index === length - 1 ? { planStartDate: '2025-01-10', planEndDate: '2025-01-15' } : {}) })).reverse()
  const root = schedule(source, 'n0')
  assert.equal(root.start, '2025-01-10')
  assert.equal(root.end, '2025-01-15')
  assert.equal(root.descendantCount, length - 1)
  assert.equal(root.unscheduledCount, 0)
  assert.equal(root.partial, false)
  assert.deepEqual(issues(source), [])
})

test('空批次/id-only/同值/取消后的批次均返回原数组且不改时间', () => {
  const source = freezeTasks([bar('one'), task('old')])
  for (const changes of [[], [{ id: 'one' }], [{ id: 'one', planStartDate: '2025-01-10' }],
    [{ id: 'one', planStartDate: '2025-01-09' }, { id: 'one', planStartDate: '2025-01-10' }]]) {
    assert.equal(applyScheduleChanges(source, changes, { timestamp }), source)
  }
  assert.equal(source[0].updatedAt, oldTime)
  for (const field of scheduleFields) assert.equal(Object.hasOwn(source[1], field), false)
})
test('只为真变更的任务更新时间，保留全部状态、结算、笔记、域与对象引用', () => {
  const source = freezeTasks([task('parent'), bar('child', 'parent'), task('unrelated')])
  const next = applyScheduleChanges(source, [{ id: 'child', planEndDate: '2025-01-16', assignee: '  自由文本  ' }], { timestamp })
  assert.notEqual(next, source)
  assert.equal(next[0], source[0])
  assert.equal(next[2], source[2])
  assert.deepEqual(next[1], { ...source[1], planEndDate: '2025-01-16', assignee: '  自由文本  ', updatedAt: timestamp })
  assert.equal(next[1].domain, source[1].domain)
  assert.equal(next[1].settledAt, source[1].settledAt)
  assert.equal(source[1].planEndDate, '2025-01-15')
  assert.equal(schedule(next).end, '2025-01-16')
})
test('批次只验证最终关联状态，可同时移动父边界与子范围而不修改中间输入', () => {
  const source = freezeTasks([bar('manual', null, '2025-01-01', '2025-01-31'), bar('child', 'manual')])
  const next = applyScheduleChanges(source, [
    { id: 'child', planStartDate: '2025-02-10' }, { id: 'child', planEndDate: '2025-02-15' },
    { id: 'manual', planStartDate: '2025-02-01', planEndDate: '2025-02-28' },
  ], { timestamp })
  assert.deepEqual(issues(next), [])
  assert.equal(next[0].planEndDate, '2025-02-28')
  assert.equal(next[1].planEndDate, '2025-02-15')
  assert.equal(source[0].planEndDate, '2025-01-31')
})
test('批次一处越界即原子拒绝，不漏改另一任务负责人/时间', () => {
  const source = freezeTasks([bar('parent', null, '2025-01-01', '2025-01-31'), bar('child', 'parent'), task('peer')])
  const before = structuredClone(source)
  assert.throws(() => applyScheduleChanges(source, [{ id: 'peer', assignee: 'should not persist' },
    { id: 'child', planEndDate: '2025-02-01' }], { timestamp }), /child.*parent.*2025-01-31/)
  assert.deepEqual(source, before)
})
test('日期清除保留 null/空表示，不为旧记录增添未提供的可选字段', () => {
  const source = [task('legacy'), bar('dated')]
  const next = applyScheduleChanges(source, [{ id: 'legacy', assignee: '' }, { id: 'dated', planStartDate: null, planEndDate: '' }], { timestamp })
  assert.equal(next[1].planStartDate, null)
  assert.equal(next[1].planEndDate, '')
  assert.equal(next[0].assignee, '')
  for (const field of ['planStartDate', 'planEndDate', 'planMode']) assert.equal(Object.hasOwn(next[0], field), false)
})
for (const [label, changes, pattern] of [
  ['缺少数组', null, /数组/], ['缺少变更对象', [null], /对象/], ['缺少 ID', [{ assignee: 'x' }], /ID/],
  ['错误 ID 类型', [{ id: 42 }], /ID/], ['未知 ID', [{ id: 'missing' }], /missing/],
  ['任意业务字段', [{ id: 'one', status: 'done' }], /status/], ['父级字段', [{ id: 'one', parentId: null }], /parentId/],
  ['未列出的时间字段', [{ id: 'one', updatedAt: timestamp }], /updatedAt/],
  ['不真实日历日期', [{ id: 'one', planStartDate: '2025-02-30' }], /YYYY-MM-DD/],
  ['undefined 日期', [{ id: 'one', planEndDate: undefined }], /YYYY-MM-DD/],
  ['超长负责人', [{ id: 'one', assignee: 'x'.repeat(101) }], /100/],
  ['null 负责人', [{ id: 'one', assignee: null }], /负责人/],
  ['未知模式', [{ id: 'one', planMode: 'weird' }], /auto.*manual/],
  ['无效值后续覆盖也拒绝', [{ id: 'one', assignee: 42 }, { id: 'one', assignee: 'valid' }], /负责人/],
  ['反向最终日期', [{ id: 'one', planStartDate: '2025-02-01' }], /早于/],
]) test(`非法变更 ${label} 给出具体错误且不突变`, () => {
  const source = freezeTasks([bar('one'), task('peer')])
  const before = structuredClone(source)
  assert.throws(() => applyScheduleChanges(source, changes, { timestamp }), pattern)
  assert.deepEqual(source, before)
})
test('符号或 __proto__ 自有字段不能绕过变更白名单', () => {
  const source = [bar('one')]
  assert.throws(() => applyScheduleChanges(source, [{ id: 'one', [Symbol('secret')]: 'x' }]), /Symbol/)
  assert.throws(() => applyScheduleChanges(source, [JSON.parse('{"id":"one","__proto__":{"polluted":true}}')]), /__proto__/)
  assert.equal({}.polluted, undefined)
})
test('默认 timestamp 为有效更新时刻，但不会更新实际结算时间', () => {
  const source = [task('one')]
  const before = Date.now()
  const next = applyScheduleChanges(source, [{ id: 'one', assignee: 'owner' }])
  assert.ok(Date.parse(next[0].updatedAt) >= before && Date.parse(next[0].updatedAt) <= Date.now())
  assert.equal(next[0].settledAt, source[0].settledAt)
  assert.throws(() => applyScheduleChanges(source, [{ id: 'one', assignee: 'owner' }], { timestamp: 'invalid' }), /timestamp/)
})
test('错误的任务名称/ID 不会在错误消息格式化时抛出无关异常', () => {
  const malformed = { id: { toString: null }, title: { toString: null }, planEndDate: 'invalid' }
  assert.equal(issues([malformed])[0].taskId, '')
  assert.match(issues([malformed])[0].message, /YYYY-MM-DD/)
  assert.throws(() => applyScheduleChanges([task('one')], [{ id: { toString: null } }]), /ID/)
})
test('非法空白任务 ID 不可通过计划补丁修补，错误为明确的 ID 校验', () => {
  for (const id of ['', '  ']) assert.throws(() => applyScheduleChanges([task(id)], []), /ID/)
})
test('无效完整状态返回结构化问题而不是递归崩溃', () => {
  assert.equal(issues(null)[0].code, 'invalid_tasks')
  assert.equal(issues([null])[0].code, 'invalid_task')
  assert.throws(() => applyScheduleChanges(null, []), /数组/)
  assert.throws(() => applyScheduleChanges([task('same'), task('same')], []), /重复/)
})

console.log(`\n${count}/${count} pure schedule checks passed`)
