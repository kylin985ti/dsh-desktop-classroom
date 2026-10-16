/**
 * Pure, read-only month-calendar projections. No clock, store, native APIs or writes.
 *
 * Public failures throw with stable `code` and `path` properties; invalid rows are
 * never silently removed. Each collection is capped at 10,000 rows, projected
 * strings at 2 Mi UTF-16 units (4 MiB), IDs at 1,024 units, titles at 20,000,
 * and lanes at 32. Unknown task/item fields are not copied or traversed.
 *
 * Dates are Gregorian 0001..9999. Null grid boundaries/cells mean outside that
 * domain. Task deadlines have startDate:null and use endDate as their point;
 * unscheduled rows retain their supplied plan fields without inventing dates.
 */
import { dateToDay, getSchedules, isPlanDate } from '../dsh/schedule-model.js'

const DAY_MS = 86400000
const MIN_DAY = dateToDay('0001-01-01')
const MAX_DAY = dateToDay('9999-12-31')
const MAX_ROWS = 10000
const MAX_TEXT = 2 * 1024 * 1024
const MAX_ID = 1024
const MAX_TITLE = 20000
const MAX_KEY = 8192
const MAX_LANES = 32
const STATUSES = new Set(['todo', 'doing', 'ongoing', 'done', 'dropped'])
const TASK_KINDS = new Set(['bar', 'deadline'])
const KIND_ORDER = new Map([['bar', 0], ['deadline', 1]])
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0
const mod = (value, base) => ((value % base) + base) % base
const pad = (value, length = 2) => String(value).padStart(length, '0')

function fail(code, path, message, Type = TypeError) {
  const error = new Type(`${path}: ${message}`)
  error.code = code
  error.path = path
  throw error
}

function record(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    fail('invalid_record', path, 'expected a plain data object')
  }
  return value
}

// Reading descriptors avoids invoking data-supplied getters, including getters on
// unknown fields. Proxies are not a supported input transport; pass JSON DTOs.
function field(object, key, path, required = false) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor) {
    if (required) fail('missing_field', `${path}.${key}`, 'required field is missing')
    return undefined
  }
  if (!own(descriptor, 'value')) fail('invalid_record', `${path}.${key}`, 'accessor properties are not data')
  return descriptor.value
}

function list(value, path) {
  if (!Array.isArray(value)) fail('invalid_collection', path, 'expected an array')
  if (value.length > MAX_ROWS) fail('resource_limit', path, `at most ${MAX_ROWS} rows are supported`, RangeError)
  return value
}

function text(value, path, budget, max = MAX_TITLE, nonblank = false) {
  if (typeof value !== 'string' || value.length > max || (nonblank && !value.trim())) {
    fail(typeof value === 'string' && value.length > max ? 'resource_limit' : 'invalid_text', path,
      `expected ${nonblank ? 'nonblank ' : ''}text of at most ${max} UTF-16 units`)
  }
  if (budget) {
    budget.units += value.length
    if (budget.units > MAX_TEXT) fail('resource_limit', path, 'projected text exceeds 4 MiB of UTF-16 data', RangeError)
  }
  return value
}

function date(value, path) {
  if (typeof value !== 'string' || value.length !== 10 || !isPlanDate(value)) {
    fail('invalid_date', path, 'expected a valid Gregorian YYYY-MM-DD in years 0001..9999')
  }
  return value
}

function dayDate(day) {
  if (day < MIN_DAY || day > MAX_DAY) return null
  const value = new Date(day * DAY_MS)
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
}

function monthParts(month) {
  if (typeof month !== 'string' || month.length !== 7 || !/^\d{4}-\d{2}$/.test(month) ||
      !isPlanDate(`${month}-01`)) fail('invalid_month', 'month', 'expected YYYY-MM in years 0001..9999')
  return { year: Number(month.slice(0, 4)), monthNumber: Number(month.slice(5, 7)) }
}

function options(value, path, allowed) {
  record(value, path)
  for (const key of Reflect.ownKeys(value)) {
    if (!allowed.includes(key)) fail('invalid_options', path, 'unknown option')
    field(value, key, path)
  }
  return value
}

/** Monday-first whole weeks; every week has exactly seven cells, including null edge cells. */
export function getMonthGrid(month) {
  const { year, monthNumber } = monthParts(month)
  const first = dateToDay(`${month}-01`)
  const next = month === '9999-12' ? MAX_DAY + 1 : dateToDay(`${shiftMonth(month, 1)}-01`)
  const beginning = first - mod(first + 3, 7) // 1970-01-01 was Thursday.
  const cellCount = Math.ceil((next - beginning) / 7) * 7
  const weeks = []
  for (let at = beginning; at < beginning + cellCount; at += 7) {
    const days = []
    for (let column = 0; column < 7; column++) {
      const value = dayDate(at + column)
      days.push({ date: value, inMonth: value !== null && value.slice(0, 7) === month, isWeekend: column >= 5 })
    }
    const startDate = dayDate(at)
    weeks.push({ key: startDate ?? `outside:${at}`, startDate, days })
  }
  return { month, year, monthNumber, startDate: dayDate(beginning),
    endDateExclusive: dayDate(beginning + cellCount), weeks }
}

/** Shift by an integral number of months; never clamp or wrap at the domain edge. */
export function shiftMonth(month, delta) {
  const { year, monthNumber } = monthParts(month)
  if (!Number.isSafeInteger(delta)) fail('invalid_delta', 'delta', 'expected a safe integer month delta')
  const shifted = (year - 1) * 12 + monthNumber - 1 + delta
  if (!Number.isSafeInteger(shifted) || shifted < 0 || shifted >= 9999 * 12) {
    fail('date_domain', 'delta', 'shift would leave years 0001..9999', RangeError)
  }
  return `${pad(Math.floor(shifted / 12) + 1, 4)}-${pad(shifted % 12 + 1)}`
}

export function monthForDate(value) {
  return date(value, 'date').slice(0, 7)
}

function readTasks(tasks) {
  list(tasks, 'tasks')
  const budget = { units: 0 }
  const byId = new Map()
  const trimmedIds = new Set()
  const rows = []
  for (let index = 0; index < tasks.length; index++) {
    const path = `tasks[${index}]`
    const task = record(tasks[index], path)
    const id = text(field(task, 'id', path, true), `${path}.id`, budget, MAX_ID, true)
    const title = text(field(task, 'title', path, true), `${path}.title`, budget, MAX_TITLE, true)
    if (trimmedIds.has(id.trim())) fail('duplicate_id', `${path}.id`, 'task IDs must be unique, including trimmed IDs')
    trimmedIds.add(id.trim())
    const parentId = field(task, 'parentId', path)
    if (parentId !== undefined && parentId !== null) text(parentId, `${path}.parentId`, budget, MAX_ID)
    const status = field(task, 'status', path)
    if (status !== undefined && !STATUSES.has(status)) fail('invalid_status', `${path}.status`, 'unknown task status')
    const row = { id, title, parentId, status }
    for (const key of ['planStartDate', 'planEndDate']) {
      if (!own(task, key)) continue
      const value = field(task, key, path)
      if (value !== null && value !== '') date(value, `${path}.${key}`)
      row[key] = value
    }
    if (row.planStartDate && row.planEndDate && row.planStartDate > row.planEndDate) {
      fail('date_order', `${path}.planEndDate`, 'task end precedes its start')
    }
    if (own(task, 'planMode')) {
      const mode = field(task, 'planMode', path)
      if (mode !== 'manual' && mode !== 'auto') fail('invalid_plan_mode', `${path}.planMode`, 'expected manual or auto')
      row.planMode = mode
    }
    if (own(task, 'assignee')) row.assignee = text(field(task, 'assignee', path), `${path}.assignee`, budget, 100)
    byId.set(id, row)
    rows.push(row)
  }
  return { rows, byId }
}

// Match getSchedules/buildTree's display-depth policy: every record whose ancestor
// chain touches a legacy cycle is detached. Raw descendant scope is intentionally
// separate so selecting a cycle member still retains all of its real descendants.
function taskDepths(byId) {
  const cyclic = new Map()
  for (const id of byId.keys()) {
    if (cyclic.has(id)) continue
    const trail = []
    const seen = new Set()
    let cursor = id
    while (byId.has(cursor) && !cyclic.has(cursor) && !seen.has(cursor)) {
      trail.push(cursor)
      seen.add(cursor)
      cursor = byId.get(cursor).parentId
    }
    const touchesCycle = seen.has(cursor) || cyclic.get(cursor) === true
    for (const member of trail) cyclic.set(member, touchesCycle)
  }
  const depths = new Map()
  for (const id of byId.keys()) {
    if (depths.has(id)) continue
    const trail = []
    let cursor = id
    while (byId.has(cursor) && !depths.has(cursor)) {
      trail.push(cursor)
      cursor = cyclic.get(cursor) ? undefined : byId.get(cursor).parentId
    }
    let depth = depths.get(cursor) ?? -1
    for (let index = trail.length - 1; index >= 0; index--) depths.set(trail[index], ++depth)
  }
  return depths
}

/**
 * All historical statuses are retained. includeSummaries=false hides normalized
 * parents (manual or auto); totalCount is items+unscheduled AFTER that option.
 * Unknown scope IDs fail closed. Depth is the global, not scope-relative, depth.
 * This is projection, not authoring validation: manual ancestor bounds are neither
 * extended nor used to clip a descendant's independently stored valid dates.
 */
export function deriveCalendarTasks(tasks, config = {}) {
  // Validate options before reading them, and do not spread task fields into output.
  options(config, 'options', ['scopeId', 'includeSummaries'])
  const scopeId = field(config, 'scopeId', 'options') ?? null
  const summaryOption = field(config, 'includeSummaries', 'options')
  const includeSummaries = summaryOption === undefined ? true : summaryOption
  if (scopeId !== null) text(scopeId, 'options.scopeId', null, MAX_ID, true)
  if (typeof includeSummaries !== 'boolean') fail('invalid_options', 'options.includeSummaries', 'expected a boolean')
  const { rows, byId } = readTasks(tasks)
  if (scopeId !== null && !byId.has(scopeId)) fail('scope_not_found', 'options.scopeId', 'selected task does not exist', RangeError)
  let scoped = null
  if (scopeId !== null) {
    const children = new Map()
    for (const row of rows) {
      if (!children.has(row.parentId)) children.set(row.parentId, [])
      children.get(row.parentId).push(row.id)
    }
    scoped = new Set()
    const stack = [scopeId]
    while (stack.length) {
      const id = stack.pop()
      if (scoped.has(id)) continue
      scoped.add(id)
      for (const child of children.get(id) || []) if (!scoped.has(child)) stack.push(child)
    }
  }
  const schedules = getSchedules(rows)
  const depths = taskDepths(byId)
  const items = []
  const unscheduled = []
  for (const row of rows) {
    if (scoped && !scoped.has(row.id)) continue
    const schedule = schedules.get(row.id)
    if (!includeSummaries && schedule.hasChildren) continue
    const common = { key: `task:${row.id}`, source: 'task', taskId: row.id, title: row.title, status: row.status,
      depth: depths.get(row.id), auto: schedule.auto, partial: schedule.partial, hasChildren: schedule.hasChildren,
      descendantCount: schedule.descendantCount, unscheduledCount: schedule.unscheduledCount }
    // Keep only actually supplied plan/assignee fields; never infer an assignee.
    for (const key of ['planStartDate', 'planEndDate', 'planMode', 'assignee']) if (own(row, key)) common[key] = row[key]
    if (schedule.kind === 'empty') unscheduled.push(common)
    else items.push({ ...common, startDate: schedule.start, endDate: schedule.end, kind: schedule.kind })
  }
  return { items: sortedItems(items), unscheduled: unscheduled.sort((a, b) => cmp(a.key, b.key)),
    totalCount: items.length + unscheduled.length, scopeTitle: scopeId === null ? '全部任务' : byId.get(scopeId).title }
}

function prepareItems(items) {
  list(items, 'items')
  const keys = new Set()
  const budget = { units: 0 }
  const prepared = []
  for (let index = 0; index < items.length; index++) {
    const path = `items[${index}]`
    const item = record(items[index], path)
    const key = text(field(item, 'key', path, true), `${path}.key`, budget, MAX_KEY, true)
    if (keys.has(key)) fail('duplicate_key', `${path}.key`, 'calendar item keys must be unique')
    keys.add(key)
    const source = field(item, 'source', path, true)
    const kind = field(item, 'kind', path, true)
    if (source !== 'task' || !TASK_KINDS.has(kind)) {
      fail('invalid_item', path, 'source and kind are not a supported calendar item')
    }
    text(field(item, 'title', path, true), `${path}.title`, budget, MAX_TITLE, true)
    const end = date(field(item, 'endDate', path, true), `${path}.endDate`)
    const suppliedStart = field(item, 'startDate', path, true)
    if (kind === 'deadline' && suppliedStart !== null) fail('invalid_item', `${path}.startDate`, 'deadline start must stay null')
    const start = kind === 'deadline' ? end : date(suppliedStart, `${path}.startDate`)
    if (start > end) fail('date_order', path, 'invalid inclusive calendar item range')
    const taskId = text(field(item, 'taskId', path, true), `${path}.taskId`, budget, MAX_ID, true)
    if (key !== `task:${taskId}`) fail('invalid_item', `${path}.key`, 'task key does not match taskId')
    const status = field(item, 'status', path)
    if (status !== undefined && !STATUSES.has(status)) fail('invalid_status', `${path}.status`, 'unknown task status')
    for (const name of ['auto', 'partial']) {
      if (typeof field(item, name, path, true) !== 'boolean') fail('invalid_item', `${path}.${name}`, 'expected a boolean')
    }
    prepared.push({ item, key, start, end, first: dateToDay(start), last: dateToDay(end), kind })
  }
  return prepared
}

function comparePrepared(a, b) {
  return cmp(a.start, b.start) || cmp(b.end, a.end) ||
    KIND_ORDER.get(a.kind) - KIND_ORDER.get(b.kind) || cmp(a.key, b.key)
}

function sortedItems(items) {
  return prepareItems(items).sort(comparePrepared).map(entry => entry.item)
}

function checkedGrid(grid) {
  record(grid, 'grid')
  const canonical = getMonthGrid(field(grid, 'month', 'grid', true))
  for (const key of ['year', 'monthNumber', 'startDate', 'endDateExclusive']) {
    if (field(grid, key, 'grid', true) !== canonical[key]) fail('invalid_grid', `grid.${key}`, 'does not match canonical month grid')
  }
  const weeks = field(grid, 'weeks', 'grid', true)
  if (!Array.isArray(weeks) || weeks.length !== canonical.weeks.length) fail('invalid_grid', 'grid.weeks', 'expected canonical whole month weeks')
  for (let index = 0; index < weeks.length; index++) {
    const path = `grid.weeks[${index}]`
    const week = record(weeks[index], path)
    const expected = canonical.weeks[index]
    for (const key of ['key', 'startDate']) if (field(week, key, path, true) !== expected[key]) fail('invalid_grid', path, 'invalid week identity')
    const days = field(week, 'days', path, true)
    if (!Array.isArray(days) || days.length !== 7) fail('invalid_grid', `${path}.days`, 'expected seven day cells')
    for (let column = 0; column < 7; column++) {
      record(days[column], `${path}.days[${column}]`)
      for (const key of ['date', 'inMonth', 'isWeekend']) {
        if (field(days[column], key, `${path}.days[${column}]`, true) !== expected.days[column][key]) {
          fail('invalid_grid', `${path}.days[${column}].${key}`, 'does not match canonical day cell')
        }
      }
    }
  }
  return canonical
}

/**
 * Stable per-week greedy placement: clipped start, longest clipped end, then full
 * start/end/kind/instant/key. A strip gets the first lane free for its whole span;
 * otherwise that entire week's strip is hidden and counted on EACH covered day.
 * No per-day expansion of long ranges: work is bounded by six weeks/seven cells.
 */
export function layoutCalendarMonth(grid, items, config = {}) {
  options(config, 'options', ['maxLanes'])
  const laneOption = field(config, 'maxLanes', 'options')
  const maxLanes = laneOption === undefined ? 4 : laneOption
  if (!Number.isInteger(maxLanes) || maxLanes < 1 || maxLanes > MAX_LANES) {
    fail('invalid_lanes', 'options.maxLanes', `expected an integer from 1 to ${MAX_LANES}`, RangeError)
  }
  const canonical = checkedGrid(grid)
  const prepared = prepareItems(items)
  const monthFirst = dateToDay(`${canonical.month}-01`)
  const gridFirst = monthFirst - mod(monthFirst + 3, 7)
  const weeks = canonical.weeks.map((week, weekIndex) => {
    const first = gridFirst + weekIndex * 7
    const last = first + 6
    const candidates = prepared.filter(entry => entry.first <= last && entry.last >= first)
      .map(entry => ({ ...entry, startColumn: Math.max(0, entry.first - first), endColumn: Math.min(6, entry.last - first) }))
      .sort((a, b) => a.startColumn - b.startColumn || b.endColumn - a.endColumn || comparePrepared(a, b))
    const occupied = Array(maxLanes).fill(-1)
    const segments = []
    const hidden = Array.from({ length: 7 }, () => [])
    for (const entry of candidates) {
      const lane = occupied.findIndex(until => until < entry.startColumn)
      if (lane < 0) {
        for (let column = entry.startColumn; column <= entry.endColumn; column++) hidden[column].push(entry.key)
      } else {
        occupied[lane] = entry.endColumn
        segments.push({ key: `segment:${JSON.stringify([entry.key, week.key])}`, item: entry.item,
          startColumn: entry.startColumn, endColumn: entry.endColumn, lane,
          continuesBefore: entry.first < first, continuesAfter: entry.last > last })
      }
    }
    const overflow = []
    for (let column = 0; column < 7; column++) {
      if (hidden[column].length) overflow.push({ date: week.days[column].date,
        count: hidden[column].length, itemKeys: hidden[column] })
    }
    return { ...week, segments, overflow }
  })
  return { weeks }
}

/** Sorted full original items, never just visible strips; therefore includes overflow. */
export function itemsOnDate(items, value) {
  const target = date(value, 'date')
  return prepareItems(items).filter(entry => entry.start <= target && entry.end >= target)
    .sort(comparePrepared).map(entry => entry.item)
}
