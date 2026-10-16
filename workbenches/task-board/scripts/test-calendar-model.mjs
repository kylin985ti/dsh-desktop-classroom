#!/usr/bin/env node
/** Synthetic pure-model tests only. No task stores, native calendars, servers or writes. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import * as calendar from '../src/calendar-model.js'
import { dateToDay, getSchedules } from '../dsh/schedule-model.js'
const { getMonthGrid, shiftMonth, monthForDate, deriveCalendarTasks,
  layoutCalendarMonth, itemsOnDate } = calendar

let count = 0
const test = (name, run) => { run(); count++; console.log(`ok    ${name}`) }
const rejects = (run, code) => assert.throws(run, error => {
  assert.ok(error instanceof Error)
  assert.equal(typeof error.code, 'string')
  assert.equal(typeof error.path, 'string')
  if (code) assert.equal(error.code, code)
  return true
})
const freeze = value => {
  const seen = new WeakSet()
  const stack = [value]
  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if (Object.hasOwn(descriptor, 'value')) stack.push(descriptor.value)
    }
    Object.freeze(current)
  }
  return value
}
const task = (id, fields = {}) => ({ id, title: `Task ${id}`, parentId: null, status: 'doing',
  settledAt: '1999-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z', ...fields })
const bar = (id, startDate = '2025-01-10', endDate = '2025-01-15', fields = {}) =>
  task(id, { planStartDate: startDate, planEndDate: endDate, ...fields })
const projected = tasks => deriveCalendarTasks(tasks).items
const byId = (rows, id) => rows.find(row => row.taskId === id || row.eventId === id)
const cells = grid => grid.weeks.flatMap(week => week.days)
const layoutSummary = result => result.weeks.map(week => ({ key: week.key,
  segments: week.segments.map(segment => ({ key: segment.key, itemKey: segment.item.key,
    start: segment.startColumn, end: segment.endColumn, lane: segment.lane,
    before: segment.continuesBefore, after: segment.continuesAfter })), overflow: week.overflow }))

// Date-domain and independent Gregorian/Date checks.
test('exactly the six task-calendar exports, without runtime dependencies or extra public state', () => {
  assert.deepEqual(Object.keys(calendar).sort(), ['deriveCalendarTasks', 'getMonthGrid',
    'itemsOnDate', 'layoutCalendarMonth', 'monthForDate', 'shiftMonth'].sort())
})
test('February 2021 has four Monday-first whole weeks (28 cells)', () => {
  const grid = getMonthGrid('2021-02')
  assert.deepEqual(Object.keys(grid), ['month', 'year', 'monthNumber', 'startDate', 'endDateExclusive', 'weeks'])
  assert.equal(grid.year, 2021)
  assert.equal(grid.monthNumber, 2)
  assert.equal(grid.startDate, '2021-02-01')
  assert.equal(grid.endDateExclusive, '2021-03-01')
  assert.equal(cells(grid).length, 28)
})
test('six-week month contains 42 cells and adjacent-month dates, never a partial week', () => {
  const grid = getMonthGrid('2025-03')
  assert.equal(grid.startDate, '2025-02-24')
  assert.equal(grid.endDateExclusive, '2025-04-07')
  assert.equal(cells(grid).length, 42)
  assert.equal(cells(grid).filter(day => day.inMonth).length, 31)
})
test('leap day, month/year clipping, and distinct week keys', () => {
  assert.ok(cells(getMonthGrid('2024-02')).some(day => day.date === '2024-02-29' && day.inMonth))
  const grid = getMonthGrid('2025-01')
  assert.equal(grid.startDate, '2024-12-30')
  assert.equal(grid.endDateExclusive, '2025-02-03')
  assert.equal(new Set(grid.weeks.map(week => week.key)).size, grid.weeks.length)
})
test('one full 400-year Gregorian cycle agrees with actual Date weekdays and day counts', () => {
  for (let year = 2000; year < 2400; year++) for (let month = 1; month <= 12; month++) {
    const name = `${year}-${String(month).padStart(2, '0')}`
    const grid = getMonthGrid(name)
    const all = cells(grid)
    assert.ok([28, 35, 42].includes(all.length))
    assert.equal(dateToDay(grid.endDateExclusive) - dateToDay(grid.startDate), all.length)
    for (let index = 0; index < all.length; index++) {
      const day = all[index]
      const actual = new Date(dateToDay(day.date) * 86400000)
      assert.equal(actual.getUTCDay(), (index + 1) % 7)
      assert.equal(day.inMonth, day.date.startsWith(`${name}-`))
      assert.equal(day.isWeekend, index % 7 >= 5)
      assert.equal(dateToDay(day.date), dateToDay(grid.startDate) + index)
    }
  }
})
for (const month of ['0001-01', '0001-02', '0099-12', '0100-01', '9999-11', '9999-12']) {
  test(`safe edge-year grid ${month}, with explicit nullable out-of-domain cells`, () => {
    const grid = getMonthGrid(month)
    assert.ok([4, 5, 6].includes(grid.weeks.length))
    assert.equal(grid.year, Number(month.slice(0, 4)))
    assert.ok(cells(grid).every(day => day.date === null || /^\d{4}-\d{2}-\d{2}$/.test(day.date)))
    assert.ok(cells(grid).filter(day => day.date === null).every(day => !day.inMonth))
    if (month === '0001-01') assert.equal(grid.startDate, '0001-01-01')
    if (month === '9999-12') {
      assert.equal(grid.endDateExclusive, null)
      assert.deepEqual(grid.weeks.at(-1).days.slice(-2).map(day => day.date), [null, null])
    }
  })
}
for (const invalid of [undefined, null, '', {}, 202501, '0-01', '0000-12', '10000-01', '2025-00', '2025-13',
  '2025-1', '25-01', '2025-01-01', ' 2025-01', '2025-01\n']) {
  test(`invalid month is rejected: ${JSON.stringify(invalid)}`, () => rejects(() => getMonthGrid(invalid), 'invalid_month'))
}
test('month shifting uses arithmetic across years and low years, without Date year-1900 behavior', () => {
  assert.equal(shiftMonth('2025-01', -1), '2024-12')
  assert.equal(shiftMonth('2024-12', 14), '2026-02')
  assert.equal(shiftMonth('0099-12', 1), '0100-01')
  assert.equal(shiftMonth('0001-01', 119987), '9999-12')
  assert.equal(shiftMonth('9999-12', -119987), '0001-01')
  assert.equal(shiftMonth('2025-02', 0), '2025-02')
})
for (const delta of [null, '1', 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  test(`non-integral/unsafe month shift is rejected: ${String(delta)}`, () => rejects(() => shiftMonth('2025-01', delta), 'invalid_delta'))
}
for (const [month, delta] of [['0001-01', -1], ['9999-12', 1], ['2025-01', Number.MAX_SAFE_INTEGER]]) {
  test(`month shift never wraps domain: ${month}/${delta}`, () => rejects(() => shiftMonth(month, delta), 'date_domain'))
}
for (const valid of ['0001-01-01', '0099-02-28', '2000-02-29', '2024-02-29', '9999-12-31']) {
  test(`monthForDate retains calendar fields: ${valid}`, () => assert.equal(monthForDate(valid), valid.slice(0, 7)))
}
for (const invalid of [null, {}, '', '2025-02-29', '1900-02-29', '2100-02-29', '2024-02-30', '2025-1-01',
  '0000-01-01', '10000-01-01', '2025-01-01T00:00:00Z', '2025-01-01\n']) {
  test(`monthForDate rejects invalid/instant input: ${JSON.stringify(invalid)}`, () => rejects(() => monthForDate(invalid), 'invalid_date'))
}

// Task scheduling semantics, source preservation, scopes and legacy hierarchy.
test('task bars are inclusive, deadline has null start and end-only marker, start-only stays unplanned', () => {
  const result = deriveCalendarTasks([bar('bar'), task('deadline', { planEndDate: '2025-01-10' }),
    task('start-only', { planStartDate: '2025-01-01' }), task('empty')])
  assert.equal(result.totalCount, 4)
  assert.equal(result.scopeTitle, '全部任务')
  assert.equal(byId(result.items, 'bar').kind, 'bar')
  assert.equal(byId(result.items, 'deadline').startDate, null)
  assert.equal(byId(result.items, 'deadline').endDate, '2025-01-10')
  assert.equal(byId(result.items, 'deadline').kind, 'deadline')
  for (const row of result.unscheduled) {
    assert.ok(!Object.hasOwn(row, 'startDate'))
    assert.ok(!Object.hasOwn(row, 'endDate'))
    assert.ok(!Object.hasOwn(row, 'kind'))
  }
  assert.equal(byId(result.unscheduled, 'start-only').planStartDate, '2025-01-01')
  assert.ok(!Object.hasOwn(byId(result.unscheduled, 'empty'), 'planEndDate'))
  assert.deepEqual(itemsOnDate(result.items, '2025-01-15').map(row => row.taskId), ['bar'])
  assert.deepEqual(itemsOnDate(result.items, '2025-01-16'), [])
})
for (const status of ['todo', 'doing', 'ongoing', 'done', 'dropped']) {
  test(`calendar retains historical ${status}, independent of settlement/updated dates`, () => {
    const input = freeze([bar(status, '1990-12-30', '1991-01-02', { status, settledAt: '1980-01-01T00:00:00Z' })])
    const before = structuredClone(input)
    const result = deriveCalendarTasks(input)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].status, status)
    assert.equal(itemsOnDate(result.items, '1991-01-01').length, 1)
    assert.deepEqual(input, before)
  })
}
for (const cleared of ['', null]) {
  test(`explicit cleared plan fields keep original ${JSON.stringify(cleared)} representation`, () => {
    const input = freeze([task('cleared', { planStartDate: cleared, planEndDate: cleared })])
    const row = deriveCalendarTasks(input).unscheduled[0]
    assert.equal(row.planStartDate, cleared)
    assert.equal(row.planEndDate, cleared)
    assert.equal(input[0].planEndDate, cleared)
  })
}
test('legacy missing status/date/mode/assignee stays missing in source; no assignee defaults are made', () => {
  const input = freeze([{ id: 'parent', title: 'Parent', assignee: 'A' },
    { id: 'legacy', title: 'Legacy', parentId: 'parent' }])
  const result = deriveCalendarTasks(input)
  assert.equal(byId(result.unscheduled, 'legacy').status, undefined)
  assert.equal(byId(result.unscheduled, 'parent').assignee, 'A')
  assert.ok(!Object.hasOwn(byId(result.unscheduled, 'legacy'), 'assignee'))
  assert.deepEqual(Object.keys(input[1]), ['id', 'title', 'parentId'])
})
test('auto parents reuse getSchedules exactly, including partial descendants below manual gaps', () => {
  const input = freeze([task('root'), task('gap', { parentId: 'root', planMode: 'manual' }),
    bar('child', '2025-02-27', '2025-03-03', { parentId: 'gap' }),
    task('deadline', { parentId: 'root', planEndDate: '2025-03-10' }),
    task('start', { parentId: 'root', planStartDate: '1900-01-01' })])
  const expected = getSchedules(input)
  const result = deriveCalendarTasks(input)
  for (const row of [...result.items, ...result.unscheduled]) {
    const schedule = expected.get(row.taskId)
    assert.equal(row.auto, schedule.auto)
    assert.equal(row.partial, schedule.partial)
    assert.equal(row.hasChildren, schedule.hasChildren)
    assert.equal(row.descendantCount, schedule.descendantCount)
    assert.equal(row.unscheduledCount, schedule.unscheduledCount)
    if (schedule.kind !== 'empty') {
      assert.equal(row.startDate, schedule.start)
      assert.equal(row.endDate, schedule.end)
      assert.equal(row.kind, schedule.kind)
    }
  }
  assert.equal(byId(result.items, 'root').startDate, '2025-02-27')
  assert.equal(byId(result.items, 'root').endDate, '2025-03-10')
  assert.equal(byId(result.items, 'root').partial, true)
  assert.ok(!Object.hasOwn(input[0], 'planStartDate'))
})
test('explicit auto parent dormant manual dates are preserved, not used as projection bounds', () => {
  const input = freeze([bar('auto', '1999-01-01', '1999-01-02', { planMode: 'auto' }),
    bar('child', '2025-01-10', '2025-01-20', { parentId: 'auto' })])
  const parent = byId(projected(input), 'auto')
  assert.equal(parent.startDate, '2025-01-10')
  assert.equal(parent.planStartDate, '1999-01-01')
  assert.equal(input[0].planEndDate, '1999-01-02')
})
test('manual parent bounds and independently stored child dates are not clipped or rewritten', () => {
  const input = freeze([bar('manual', '2025-01-10', '2025-01-15', { planMode: 'manual' }),
    bar('outside-legacy', '2025-01-01', '2025-01-31', { parentId: 'manual' })])
  const result = projected(input)
  assert.equal(byId(result, 'manual').startDate, '2025-01-10')
  assert.equal(byId(result, 'manual').endDate, '2025-01-15')
  assert.equal(byId(result, 'outside-legacy').endDate, '2025-01-31')
  assert.equal(input[0].planEndDate, '2025-01-15')
})
test('summary toggle hides manual and auto parents, totalCount equals the returned rows', () => {
  const input = [task('auto'), bar('manual', '2025-01-01', '2025-01-31'),
    bar('a', undefined, undefined, { parentId: 'auto' }), task('b', { parentId: 'manual' })]
  const all = deriveCalendarTasks(input)
  const leaves = deriveCalendarTasks(input, { includeSummaries: false })
  assert.equal(all.totalCount, 4)
  assert.equal(leaves.totalCount, 2)
  assert.deepEqual([...leaves.items, ...leaves.unscheduled].map(row => row.taskId).sort(), ['a', 'b'])
  assert.equal(leaves.totalCount, leaves.items.length + leaves.unscheduled.length)
})
test('selected task scope includes self and arbitrary-depth descendants but no sibling or ancestors', () => {
  const input = [task('root'), task('middle', { parentId: 'root', title: 'Chosen title' }),
    bar('child', undefined, undefined, { parentId: 'middle' }), task('deep', { parentId: 'child' }),
    bar('sibling', undefined, undefined, { parentId: 'root' })]
  const result = deriveCalendarTasks(input, { scopeId: 'middle' })
  assert.equal(result.scopeTitle, 'Chosen title')
  assert.equal(result.totalCount, 3)
  assert.deepEqual([...result.items, ...result.unscheduled].map(row => row.taskId).sort(), ['child', 'deep', 'middle'])
  assert.equal(byId(result.items, 'child').depth, 2)
  assert.equal(byId(result.unscheduled, 'deep').depth, 3)
})
test('orphan and its descendants are retained globally and in explicit scope', () => {
  const input = [task('orphan', { parentId: 'missing' }), bar('child', undefined, undefined, { parentId: 'orphan' })]
  const result = deriveCalendarTasks(input, { scopeId: 'orphan' })
  assert.equal(result.totalCount, 2)
  assert.equal(byId(result.items, 'orphan').depth, 0)
  assert.equal(byId(result.items, 'child').depth, 1)
})
test('cycle and descendant of cycle are safe and retained; scope follows raw descendants', () => {
  const input = freeze([bar('a', undefined, undefined, { parentId: 'b' }),
    bar('b', undefined, undefined, { parentId: 'a' }), bar('c', undefined, undefined, { parentId: 'a' }), task('other')])
  const result = deriveCalendarTasks(input, { scopeId: 'a', includeSummaries: false })
  assert.equal(result.totalCount, 3)
  assert.deepEqual(result.items.map(row => row.taskId), ['a', 'b', 'c'])
  assert.ok(result.items.every(row => row.depth === 0 && row.auto === false))
  assert.equal(deriveCalendarTasks([bar('self', undefined, undefined, { parentId: 'self' })], { scopeId: 'self' }).totalCount, 1)
})
test('10,000-node deep tree is iterative and bounded; no recursive stack growth', () => {
  const input = Array.from({ length: 10000 }, (_, index) => ({ id: `n${index}`, title: 'Node',
    parentId: index ? `n${index - 1}` : null, ...(index === 9999 ? { planEndDate: '2025-01-10' } : {}) }))
  const result = deriveCalendarTasks(input)
  assert.equal(result.totalCount, 10000)
  assert.equal(byId(result.items, 'n9999').depth, 9999)
  assert.equal(byId(result.items, 'n0').descendantCount, 9999)
  assert.equal(deriveCalendarTasks(input, { scopeId: 'n9999' }).totalCount, 1)
})
test('task projection has deterministic total order independent of input order', () => {
  const input = [bar('b'), bar('a'), bar('long', '2025-01-10', '2025-01-20'), task('z'), task('q')]
  assert.deepEqual(deriveCalendarTasks(input), deriveCalendarTasks([...input].reverse()))
})
for (const [name, input, config, code] of [
  ['nonarray', {}, {}, 'invalid_collection'], ['null row', [null], {}, 'invalid_record'],
  ['array row', [[]], {}, 'invalid_record'], ['sparse row', Array(1), {}, 'invalid_record'],
  ['duplicate', [task('a'), task('a')], {}, 'duplicate_id'], ['trim duplicate', [task('a'), task(' a ')], {}, 'duplicate_id'],
  ['empty ID', [task(' ')], {}, 'invalid_text'], ['oversized ID', [task('i'.repeat(1025))], {}, 'resource_limit'],
  ['oversized title', [task('a', { title: 't'.repeat(20001) })], {}, 'resource_limit'],
  ['bad title', [task('a', { title: 42 })], {}, 'invalid_text'],
  ['bad parent', [task('a', { parentId: {} })], {}, 'invalid_text'],
  ['bad status', [task('a', { status: 'archived' })], {}, 'invalid_status'],
  ['bad date', [bar('a', '2025-02-30')], {}, 'invalid_date'],
  ['undefined own date', [task('a', { planEndDate: undefined })], {}, 'invalid_date'],
  ['reversed range', [bar('a', '2025-01-20', '2025-01-10')], {}, 'date_order'],
  ['bad mode', [task('a', { planMode: 'inherit' })], {}, 'invalid_plan_mode'],
  ['bad assignee', [task('a', { assignee: null })], {}, 'invalid_text'],
  ['long assignee', [task('a', { assignee: 'a'.repeat(101) })], {}, 'resource_limit'],
  ['missing scope', [task('a')], { scopeId: 'missing' }, 'scope_not_found'],
  ['bad scope', [task('a')], { scopeId: 1 }, 'invalid_text'],
  ['bad summary', [], { includeSummaries: null }, 'invalid_options'],
  ['unknown option', [], { writing: true }, 'invalid_options'],
  ['null options', [], null, 'invalid_record'],
]) test(`task validation is explicit: ${name}`, () => rejects(() => deriveCalendarTasks(input, config), code))
test('task row and projected text caps fail explicitly, never truncate a corrupt list', () => {
  rejects(() => deriveCalendarTasks(Array(10001)), 'resource_limit')
  rejects(() => deriveCalendarTasks(Array.from({ length: 110 }, (_, index) => task(`${index}`, { title: 'a'.repeat(20000) }))), 'resource_limit')
  assert.equal(deriveCalendarTasks([task('i'.repeat(1024), { title: 'a'.repeat(20000), assignee: 'b'.repeat(100) })]).totalCount, 1)
})
test('unknown task properties, cyclic payload and own __proto__ cannot mutate prototypes or leak into items', () => {
  const original = JSON.parse('{"id":"__proto__","title":"Safe","planEndDate":"2025-01-10","__proto__":{"polluted":true}}')
  original.unknown = original
  let touched = false
  Object.defineProperty(original, 'getterUnknown', { get() { touched = true; throw new Error('must not run') } })
  const result = deriveCalendarTasks([original])
  assert.equal(result.items[0].taskId, '__proto__')
  assert.ok(!Object.hasOwn(result.items[0], '__proto__'))
  assert.ok(!Object.hasOwn(result.items[0], 'unknown'))
  assert.equal({}.polluted, undefined)
  assert.equal(touched, false)
})
test('known task/option accessor values are rejected without executing them', () => {
  let touched = false
  const input = { id: 'a', title: 'A' }
  Object.defineProperty(input, 'planEndDate', { get() { touched = true; return '2025-01-10' } })
  rejects(() => deriveCalendarTasks([input]), 'invalid_record')
  const config = Object.defineProperty({}, 'scopeId', { get() { touched = true; return null } })
  rejects(() => deriveCalendarTasks([], config), 'invalid_record')
  assert.equal(touched, false)
})

// Week clipping, stable lane allocation, hidden per-day counts, and complete agenda.
test('multi-week/year strip clips to rows and visible range with correct continuation flags', () => {
  const grid = getMonthGrid('2025-01')
  const item = projected([bar('long', '2024-12-28', '2025-02-04')])[0]
  const result = layoutCalendarMonth(grid, [item])
  assert.equal(result.weeks.length, 5)
  assert.equal(result.weeks.flatMap(week => week.segments).length, 5)
  for (const week of result.weeks) {
    const strip = week.segments[0]
    assert.equal(strip.item, item)
    assert.equal(strip.startColumn, 0)
    assert.equal(strip.endColumn, 6)
    assert.equal(strip.lane, 0)
    assert.equal(strip.continuesBefore, true)
    assert.equal(strip.continuesAfter, true)
    assert.deepEqual(week.overflow, [])
  }
  assert.equal(new Set(result.weeks.flatMap(week => week.segments.map(segment => segment.key))).size, 5)
})
test('task deadline is a one-cell marker anchored at its inclusive end, never a full-width bar', () => {
  const items = projected([task('deadline', { planEndDate: '2025-01-01' })])
  const result = layoutCalendarMonth(getMonthGrid('2025-01'), items)
  const segments = result.weeks.flatMap(week => week.segments)
  assert.equal(segments.length, 1)
  assert.equal(segments[0].startColumn, 2)
  assert.equal(segments[0].endColumn, 2)
  assert.equal(segments[0].continuesBefore, false)
  assert.equal(segments[0].continuesAfter, false)
})
test('whole-strip overflow reports each covered day, including free tail days of a blocked strip', () => {
  const input = projected([bar('a', '2025-01-01', '2025-01-03'), bar('b', '2025-01-02', '2025-01-04')])
  const result = layoutCalendarMonth(getMonthGrid('2025-01'), input, { maxLanes: 1 })
  const week = result.weeks[0]
  assert.deepEqual(week.segments.map(strip => strip.item.taskId), ['a'])
  assert.deepEqual(week.overflow, ['2025-01-02', '2025-01-03', '2025-01-04']
    .map(date => ({ date, count: 1, itemKeys: ['task:b'] })))
  assert.deepEqual(itemsOnDate(input, '2025-01-03').map(row => row.taskId), ['a', 'b'])
  assert.deepEqual(itemsOnDate(input, '2025-01-04').map(row => row.taskId), ['b'])
})
test('greedy lanes can be reused after inclusive end, with no overlap on touching dates', () => {
  const input = projected([bar('a', '2025-01-06', '2025-01-07'), bar('b', '2025-01-07', '2025-01-08'),
    bar('c', '2025-01-08', '2025-01-09'), bar('d', '2025-01-10', '2025-01-10')])
  const week = layoutCalendarMonth(getMonthGrid('2025-01'), input, { maxLanes: 2 }).weeks[1]
  const lanes = Object.fromEntries(week.segments.map(segment => [segment.item.taskId, segment.lane]))
  assert.deepEqual(lanes, { a: 0, b: 1, c: 0, d: 0 })
  assert.deepEqual(week.overflow, [])
})
test('default is four lanes and overflow counts include all hidden item identities', () => {
  const input = projected(Array.from({ length: 7 }, (_, index) => bar(`n${index}`, '2025-01-06', '2025-01-06')))
  const week = layoutCalendarMonth(getMonthGrid('2025-01'), input).weeks[1]
  assert.deepEqual(week.segments.map(strip => strip.lane), [0, 1, 2, 3])
  assert.deepEqual(week.overflow, [{ date: '2025-01-06', count: 3, itemKeys: ['task:n4', 'task:n5', 'task:n6'] }])
  assert.equal(itemsOnDate(input, '2025-01-06').length, 7)
})
test('a hidden whole-week strip does not prevent later nonoverlapping short strips from using available lanes', () => {
  const input = projected([bar('early', '2025-01-06', '2025-01-08'), bar('blocked', '2025-01-07', '2025-01-11'),
    bar('late', '2025-01-09', '2025-01-09')])
  const week = layoutCalendarMonth(getMonthGrid('2025-01'), input, { maxLanes: 1 }).weeks[1]
  assert.deepEqual(week.segments.map(strip => strip.item.taskId), ['early', 'late'])
  assert.equal(week.overflow.find(day => day.date === '2025-01-09').count, 1)
})
test('visible plus hidden count equals all active items for every date; lanes never overlap (200 synthetic ranges)', () => {
  const grid = getMonthGrid('2025-01')
  const input = projected(Array.from({ length: 200 }, (_, index) => {
    const first = index * 17 % 31 + 1
    const last = Math.min(31, first + index % 9)
    return bar(`range-${String(index).padStart(3, '0')}`, `2025-01-${String(first).padStart(2, '0')}`,
      `2025-01-${String(last).padStart(2, '0')}`)
  }))
  const result = layoutCalendarMonth(grid, input, { maxLanes: 3 })
  for (const week of result.weeks) for (let column = 0; column < 7; column++) {
    const day = week.days[column].date
    const active = week.segments.filter(strip => strip.startColumn <= column && strip.endColumn >= column)
    assert.equal(new Set(active.map(strip => strip.lane)).size, active.length)
    assert.ok(active.every(strip => strip.lane >= 0 && strip.lane < 3))
    const hidden = week.overflow.find(row => row.date === day)
    const agenda = itemsOnDate(input, day)
    assert.equal(active.length + (hidden?.count || 0), agenda.length)
    if (hidden) {
      assert.equal(new Set(hidden.itemKeys).size, hidden.count)
      assert.ok(hidden.itemKeys.every(key => agenda.some(item => item.key === key)))
    }
  }
  assert.deepEqual(layoutSummary(result), layoutSummary(layoutCalendarMonth(grid, [...input].reverse(), { maxLanes: 3 })))
})
test('year-9999 clipping never places segments/overflow into nullable edge cells', () => {
  const grid = getMonthGrid('9999-12')
  const input = projected([bar('a', '9999-12-01', '9999-12-31'), bar('b', '9999-12-30', '9999-12-31')])
  const result = layoutCalendarMonth(grid, input, { maxLanes: 1 })
  assert.equal(result.weeks.at(-1).segments[0].endColumn, 4)
  assert.ok(result.weeks.flatMap(week => week.overflow).every(row => row.date !== null))
  assert.equal(itemsOnDate(input, '9999-12-31').length, 2)
})
test('full-domain task ranges use bounded weeks, not millions of expanded days', () => {
  const item = projected([bar('centuries', '0001-01-01', '9999-12-31')])[0]
  const result = layoutCalendarMonth(getMonthGrid('2025-03'), [item])
  assert.equal(result.weeks.length, 6)
  assert.ok(result.weeks.every(week => week.segments.length === 1))
})
test('off-grid valid items stay out of the month without disappearing from date lookup', () => {
  const input = projected([bar('outside', '1999-01-01', '1999-01-02')])
  assert.ok(layoutCalendarMonth(getMonthGrid('2025-01'), input).weeks.every(week => !week.segments.length && !week.overflow.length))
  assert.equal(itemsOnDate(input, '1999-01-02').length, 1)
})
test('grid, task item arrays, and all supplied options stay unmodified when frozen', () => {
  const grid = freeze(getMonthGrid('2025-01'))
  const input = freeze(projected([bar('a'), bar('b')]))
  const beforeGrid = structuredClone(grid)
  const beforeItems = structuredClone(input)
  layoutCalendarMonth(grid, input, freeze({ maxLanes: 1 }))
  const result = itemsOnDate(input, '2025-01-10')
  assert.notEqual(result, input)
  assert.ok(result.every(item => input.includes(item)))
  assert.deepEqual(grid, beforeGrid)
  assert.deepEqual(input, beforeItems)
})
for (const lanes of [0, -1, 33, 1.1, '4', null, NaN, Infinity]) {
  test(`invalid/unbounded maxLanes ${String(lanes)} fails explicitly`, () =>
    rejects(() => layoutCalendarMonth(getMonthGrid('2025-01'), [], { maxLanes: lanes }), 'invalid_lanes'))
}
for (const [name, change] of [
  ['year', grid => { grid.year = 1900 }], ['boundary', grid => { grid.endDateExclusive = '2025-02-04' }],
  ['week key', grid => { grid.weeks[0].key = 'fake' }], ['weekday', grid => { grid.weeks[0].days[0].date = '2025-01-01' }],
  ['weekend', grid => { grid.weeks[0].days[0].isWeekend = true }],
  ['missing cell', grid => { grid.weeks[0].days.pop() }], ['extra week', grid => { grid.weeks.push(grid.weeks[0]) }],
]) test(`noncanonical grid is rejected: ${name}`, () => {
  const grid = getMonthGrid('2025-01')
  change(grid)
  rejects(() => layoutCalendarMonth(grid, []), 'invalid_grid')
})
test('item collections, duplicate keys and invalid rows never disappear even outside the visible range', () => {
  const grid = getMonthGrid('2025-01')
  const item = projected([bar('a')])[0]
  rejects(() => layoutCalendarMonth(grid, {}), 'invalid_collection')
  rejects(() => layoutCalendarMonth(grid, Array(10001)), 'resource_limit')
  rejects(() => itemsOnDate(Array(10001), '2025-01-01'), 'resource_limit')
  rejects(() => layoutCalendarMonth(grid, [item, item]), 'duplicate_key')
  rejects(() => itemsOnDate([item, item], '1999-01-01'), 'duplicate_key')
  rejects(() => itemsOnDate([null], '2025-01-01'), 'invalid_record')
  rejects(() => itemsOnDate([], '2025-02-29'), 'invalid_date')
  rejects(() => layoutCalendarMonth(grid, [], { unknown: true }), 'invalid_options')
})
for (const [name, changes, code] of [
  ['unknown source', { source: 'foreign' }, 'invalid_item'], ['unknown kind', { kind: 'recurring' }, 'invalid_item'],
  ['bad start', { startDate: '2025-01-32' }, 'invalid_date'], ['null bar start', { startDate: null }, 'invalid_date'],
  ['reversed', { startDate: '2025-01-20' }, 'date_order'], ['wrong identity', { taskId: 'other' }, 'invalid_item'],
  ['bad auto', { auto: 'yes' }, 'invalid_item'], ['bad partial', { partial: null }, 'invalid_item'],
  ['bad status', { status: 'archived' }, 'invalid_status'],
]) test(`invalid layout task item is explicit: ${name}`, () => {
  const input = [{ ...projected([bar('a')])[0], ...changes }]
  rejects(() => layoutCalendarMonth(getMonthGrid('2025-01'), input), code)
  rejects(() => itemsOnDate(input, '1999-01-01'), code)
})
test('deadline layout rejects fabricated non-null starts, even when equal to its deadline', () => {
  const item = projected([task('deadline', { planEndDate: '2025-01-10' })])[0]
  rejects(() => itemsOnDate([{ ...item, startDate: item.endDate }], '2025-01-10'), 'invalid_item')
})
test('layout ignores unknown getters and __proto__ fields without executing or copying them', () => {
  let touched = false
  const grid = getMonthGrid('2025-01')
  Object.defineProperty(grid.weeks[0], 'unused', { get() { touched = true; throw new Error('do not run') } })
  const item = projected([bar('a')])[0]
  Object.defineProperty(item, 'unused', { get() { touched = true; throw new Error('do not run') } })
  const result = layoutCalendarMonth(grid, [item])
  assert.ok(!Object.hasOwn(result.weeks[0], 'unused'))
  assert.equal(touched, false)
  assert.equal({}.polluted, undefined)
})

// Repeat a compact contract under truly different process TZ settings, not a Date mock.
for (const zone of ['UTC', 'America/New_York', 'Pacific/Honolulu', 'Pacific/Kiritimati']) {
  test(`host TZ ${zone} cannot change pure grids or task plans`, () => {
    const source = `import assert from 'node:assert/strict';
      import { getMonthGrid, deriveCalendarTasks, itemsOnDate } from ${JSON.stringify(new URL('../src/calendar-model.js', import.meta.url).href)};
      assert.equal(getMonthGrid('2025-03').startDate, '2025-02-24');
      const tasks = deriveCalendarTasks([{id:'a', title:'A', planStartDate:'2025-03-08', planEndDate:'2025-03-10', status:'done', settledAt:'1990-01-01T00:00:00Z'}]).items;
      assert.equal(itemsOnDate(tasks, '2025-03-09').length, 1);
`
    execFileSync(process.execPath, ['--input-type=module', '-e', source], { env: { ...process.env, TZ: zone }, stdio: 'pipe' })
  })
}
console.log(`\n${count} calendar model tests passed (synthetic fixtures only).`)
