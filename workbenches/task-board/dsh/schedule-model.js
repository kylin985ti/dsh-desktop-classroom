/**
 * Pure scheduling rules shared by the taskboard client and server.
 *
 * Optional fields remain optional: reading/deriving schedules never migrates a task,
 * invents a date, changes a status, or touches actual settlement timestamps.
 * Both null and '' are explicit cleared dates; their stored representation is kept.
 */
const DAY_MS = 86400000
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const CHANGE_FIELDS = new Set(['id', 'planStartDate', 'planEndDate', 'planMode', 'assignee'])
const DATE_FIELDS = ['planStartDate', 'planEndDate']

/** Strict Gregorian YYYY-MM-DD (years 0001..9999), without Date.parse rollover. */
export function isPlanDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/** Integer UTC calendar-day index, never a local-midnight/DST calculation. */
export function dateToDay(value) {
  if (!isPlanDate(value)) return null
  const date = new Date(0)
  // Date.UTC treats years 0..99 as 1900..1999; setUTCFullYear does not.
  date.setUTCFullYear(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
  return date.getTime() / DAY_MS
}

/** Today's LOCAL calendar date; unlike a plan date this depends on the user's TZ. */
export function todayDate() {
  const now = new Date()
  const pad = value => String(value).padStart(2, '0')
  return `${String(now.getFullYear()).padStart(4, '0')}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const dateValue = value => isPlanDate(value) ? value : null
const taskName = task => {
  const id = typeof task?.id === 'string' ? task.id : '未知任务'
  return typeof task?.title === 'string' && task.title ? `“${task.title}”（${id}）` : `“${id}”`
}
const rangeKind = (start, end) => end ? (start ? 'bar' : 'deadline') : 'empty'

/**
 * Match the existing task tree's legacy-cycle policy: detach a link when its
 * ancestor chain reaches a cycle. Orphans and cyclic records remain present.
 * Iterative memoization also handles deep trees without recursive stack growth.
 */
function scheduleTree(tasks) {
  const byId = new Map()
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (task && typeof task === 'object' && typeof task.id === 'string') byId.set(task.id, task)
  }
  const cyclicAncestry = new Map()
  for (const id of byId.keys()) {
    if (cyclicAncestry.has(id)) continue
    const trail = []
    const seen = new Set()
    let cursor = id
    while (byId.has(cursor) && !cyclicAncestry.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor)
      trail.push(cursor)
      cursor = byId.get(cursor).parentId
    }
    const cyclic = seen.has(cursor) || cyclicAncestry.get(cursor) === true
    for (const member of trail) cyclicAncestry.set(member, cyclic)
  }
  const children = new Map([...byId.keys()].map(id => [id, []]))
  const parents = new Map()
  const roots = []
  for (const [id, task] of byId) {
    if (!cyclicAncestry.get(id) && byId.has(task.parentId)) {
      children.get(task.parentId).push(id)
      parents.set(id, task.parentId)
    } else roots.push(id)
  }
  const order = []
  const stack = [...roots]
  while (stack.length) {
    const id = stack.pop()
    order.push(id)
    for (const child of children.get(id)) stack.push(child)
  }
  return { byId, children, parents, order }
}

function isAutoParent(task, hasChildren) {
  return hasChildren && (task.planMode === 'auto' || (
    task.planMode !== 'manual' && !dateValue(task.planStartDate) && !dateValue(task.planEndDate)
  ))
}

/**
 * Effective schedules, in original task order. Auto parents roll up all scheduled
 * descendants, including those below an unplanned manual parent. Only a task with
 * an end contributes an anchor: a start-only task has no timeline at all.
 *
 * descendantCount counts ALL strict descendants. unscheduledCount counts those
 * descendants whose effective kind is empty (a leaf has no descendants, so 0).
 * partial also flags deadline-only plans and incomplete own/manual schedules.
 */
export function getSchedules(tasks) {
  const { byId, children, order } = scheduleTree(tasks)
  const schedules = new Map()
  const anchors = new Map()
  for (let index = order.length - 1; index >= 0; index--) {
    const id = order[index]
    const task = byId.get(id)
    const childIds = children.get(id)
    const hasChildren = childIds.length > 0
    const auto = isAutoParent(task, hasChildren)
    let first = null
    let last = null
    let descendantCount = 0
    let unscheduledCount = 0
    let incompleteDescendant = false
    const addAnchor = (start, end) => {
      if (!end) return
      const beginning = start || end
      if (!first || beginning < first) first = beginning
      if (!last || end > last) last = end
    }
    for (const childId of childIds) {
      const child = schedules.get(childId)
      const anchor = anchors.get(childId)
      addAnchor(anchor.start, anchor.end)
      descendantCount += 1 + child.descendantCount
      unscheduledCount += (child.kind === 'empty' ? 1 : 0) + child.unscheduledCount
      incompleteDescendant ||= child.partial
    }
    const start = auto ? first : dateValue(task.planStartDate)
    const end = auto ? last : dateValue(task.planEndDate)
    const kind = rangeKind(start, end)
    schedules.set(id, {
      start, end, kind, auto, hasChildren,
      partial: kind !== 'bar' || incompleteDescendant,
      unscheduledCount, descendantCount,
    })
    // Keep descendant anchors even if a manual parent's own dates are incomplete.
    if (!auto) addAnchor(start, end)
    anchors.set(id, { start: first, end: last })
  }
  return new Map([...byId.keys()].map(id => [id, schedules.get(id)]))
}

/** Return named, actionable issues; this does not normalize or mutate records. */
export function validateScheduleState(tasks) {
  const issues = []
  const add = (task, field, code, message) => issues.push({ taskId: typeof task?.id === 'string' ? task.id : '', field, code, message })
  if (!Array.isArray(tasks)) {
    add(null, 'tasks', 'invalid_tasks', '任务列表必须是数组。')
    return issues
  }
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      add(task, 'task', 'invalid_task', '任务记录必须是对象。')
      continue
    }
    for (const field of DATE_FIELDS) {
      if (own(task, field) && task[field] !== '' && task[field] !== null && !isPlanDate(task[field])) {
        add(task, field, 'invalid_date', `${taskName(task)} 的${field === 'planStartDate' ? '计划开始日期' : '计划截止日期'}必须是有效的 YYYY-MM-DD 日历日期，或用空字符串/null 清除。`)
      }
    }
    if (own(task, 'planMode') && task.planMode !== 'auto' && task.planMode !== 'manual') {
      add(task, 'planMode', 'invalid_plan_mode', `${taskName(task)} 的计划模式只能是 auto（自动汇总）或 manual（手动边界）。`)
    }
    if (own(task, 'assignee') && (typeof task.assignee !== 'string' || task.assignee.length > 100)) {
      add(task, 'assignee', 'invalid_assignee', `${taskName(task)} 的负责人必须是最多 100 个字符的文本；不指定时请用空字符串。`)
    }
    const start = dateValue(task.planStartDate)
    const end = dateValue(task.planEndDate)
    if (start && end && start > end) {
      add(task, 'planEndDate', 'date_order', `${taskName(task)} 的计划截止日期 ${end} 早于开始日期 ${start}；请调整开始或截止日期。`)
    }
  }
  const { byId, children, parents } = scheduleTree(tasks)
  for (const [id, task] of byId) {
    // Explicit auto-parent fields are dormant, not a constraint on its subtree.
    if (isAutoParent(task, children.get(id).length > 0)) continue
    for (const field of DATE_FIELDS) {
      const date = dateValue(task[field])
      if (!date) continue
      let ancestorId = parents.get(id)
      while (ancestorId !== undefined) {
        const ancestor = byId.get(ancestorId)
        if (!isAutoParent(ancestor, true)) {
          const first = dateValue(ancestor.planStartDate)
          const last = dateValue(ancestor.planEndDate)
          const label = field === 'planStartDate' ? '计划开始日期' : '计划截止日期'
          if (first && date < first) {
            add(task, field, 'ancestor_start', `${taskName(task)} 的${label} ${date} 早于手动父任务 ${taskName(ancestor)} 的开始边界 ${first}；请调整该日期、移动任务，或明确修改父任务的手动边界。`)
          }
          if (last && date > last) {
            add(task, field, 'ancestor_end', `${taskName(task)} 的${label} ${date} 超出手动父任务 ${taskName(ancestor)} 的截止边界 ${last}；请调整该日期、移动任务，或明确修改父任务的手动边界。`)
          }
        }
        ancestorId = parents.get(ancestorId)
      }
    }
  }
  return issues
}

/**
 * Apply an atomic batch of scheduling/assignee patches. Last patch per field wins,
 * but every supplied patch must be well formed. Only genuinely changed task
 * objects get updatedAt; all unrelated fields/objects/timestamps are preserved.
 */
export function applyScheduleChanges(tasks, changesArray, options = {}) {
  if (!Array.isArray(tasks)) throw new Error('任务列表必须是数组。')
  if (!Array.isArray(changesArray)) throw new Error('计划变更必须是数组。')
  const byId = new Map()
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task) || typeof task.id !== 'string' || !task.id.trim() || byId.has(task.id)) {
      throw new Error('任务列表含有无效或重复的任务 ID，无法应用计划变更。')
    }
    byId.set(task.id, task)
  }
  const proposals = new Map()
  for (const change of changesArray) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) throw new Error('每条计划变更必须是含有 id 的对象。')
    for (const key of Reflect.ownKeys(change)) {
      if (!CHANGE_FIELDS.has(key)) throw new Error(`不支持修改计划字段 ${String(key)}；只能修改 planStartDate、planEndDate、planMode 和 assignee。`)
    }
    if (!own(change, 'id') || typeof change.id !== 'string' || !change.id.trim()) {
      throw new Error('计划变更必须提供有效的字符串任务 ID。')
    }
    if (!byId.has(change.id)) throw new Error(`未找到计划变更对应的任务 ID：${change.id}。`)
    const original = byId.get(change.id)
    const candidate = { ...(proposals.get(change.id) || original) }
    for (const field of CHANGE_FIELDS) {
      if (field !== 'id' && own(change, field)) candidate[field] = change[field]
    }
    // Reject bad field types immediately, even when a later patch replaces them.
    const fieldIssues = validateScheduleState([{ ...candidate, parentId: null }])
      .filter(issue => issue.code !== 'date_order')
    if (fieldIssues.length) throw new Error(fieldIssues.map(issue => issue.message).join('\n'))
    proposals.set(change.id, candidate)
  }
  const changed = new Map()
  for (const [id, candidate] of proposals) {
    const original = byId.get(id)
    if ([...CHANGE_FIELDS].some(field => field !== 'id' && (
      own(candidate, field) !== own(original, field) || !Object.is(candidate[field], original[field])
    ))) changed.set(id, candidate)
  }
  const next = changed.size ? tasks.map(task => changed.get(task.id) || task) : tasks
  const issues = validateScheduleState(next)
  if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'))
  if (!changed.size) return tasks
  const timestamp = options?.timestamp ?? new Date().toISOString()
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error('计划变更的 timestamp 必须是有效的时间戳。')
  return next.map(task => changed.has(task.id) ? { ...task, updatedAt: timestamp } : task)
}
