import { dateToDay, getSchedules, applyScheduleChanges } from '../dsh/schedule-model.js'
import { subtreeIds } from './task-model.js'

const FIELDS = ['parentId', 'status', 'planStartDate', 'planEndDate', 'planMode']
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const baselineOf = tasks => JSON.stringify(tasks.map(task => [task.id, ...FIELDS.map(field => [own(task, field), task[field] ?? null])]).sort((a, b) => a[0].localeCompare(b[0])))
const freeze = value => { Object.freeze(value); for (const item of Object.values(value)) if (item && typeof item === 'object' && !Object.isFrozen(item)) freeze(item); return value }

export function shiftPlanDate(value, delta) {
  const day = dateToDay(value)
  if (day === null || !Number.isSafeInteger(delta)) throw new Error('改期需要有效的自然日日期与整数天数。')
  const next = new Date((day + delta) * 86400000), year = next.getUTCFullYear()
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('改期超出 0001–9999 年的日期范围。')
  return `${String(year).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

/** Capture only fields relevant to scheduling, never a writable copy of task data. */
export function beginGanttEdit(tasks, id, kind) {
  if (!['move', 'start', 'end'].includes(kind)) throw new Error('不支持的甘特图改期方式。')
  const task = tasks.find(task => task.id === id), schedule = getSchedules(tasks).get(id)
  if (!task || !schedule || schedule.kind === 'empty') throw new Error('请先在详情中补充计划，再拖动改期。')
  if (kind === 'start' && !schedule.start) throw new Error('这个任务仅有截止日，请先补充开始日期。')
  return freeze({ protocol: 'gantt-edit/1', id, kind, baseline: baselineOf(tasks),
    start: schedule.start, end: schedule.end, parent: schedule.hasChildren, automatic: schedule.auto,
    branchIds: [...subtreeIds(tasks, id)] })
}

export function ganttEditRange(session, delta) {
  if (!Number.isSafeInteger(delta)) throw new Error('改期天数必须是整数。')
  return {
    start: session.start && (session.kind === 'move' || session.kind === 'start') ? shiftPlanDate(session.start, delta) : session.start,
    end: session.kind === 'move' || session.kind === 'end' ? shiftPlanDate(session.end, delta) : session.end,
  }
}

/** Pure preview; every parent bound is validated before the shared atomic writer. */
export function previewGanttEdit(tasks, session, delta) {
  if (session?.protocol !== 'gantt-edit/1' || baselineOf(tasks) !== session.baseline) throw new Error('拖动期间任务日期、状态或层级已变化；本次改期已取消，请重新拖动。')
  const range = ganttEditRange(session, delta), changes = []
  if (delta !== 0) {
    if (session.kind === 'move') {
      const ids = new Set(session.parent ? session.branchIds : [session.id]), schedules = getSchedules(tasks)
      for (const task of tasks) {
        if (!ids.has(task.id)) continue
        const schedule = schedules.get(task.id)
        // AUTO parents follow their children; dormant manual fields stay untouched.
        if (schedule.auto && schedule.hasChildren) continue
        const change = { id: task.id }
        for (const field of ['planStartDate', 'planEndDate']) if (dateToDay(task[field]) !== null) change[field] = shiftPlanDate(task[field], delta)
        if (Object.keys(change).length > 1) changes.push(change)
      }
    } else {
      changes.push({ id: session.id, ...(session.kind === 'start' ? { planStartDate: range.start } : { planEndDate: range.end }),
        ...(session.automatic && session.parent ? { planMode: 'manual', planStartDate: range.start, planEndDate: range.end } : {}) })
    }
  }
  // Use the exact detail-editor validation, including all manual ancestors.
  const candidate = applyScheduleChanges(tasks, changes)
  return { session, delta, range, changes, candidate, changedCount: changes.length,
    makesManual: delta !== 0 && session.kind !== 'move' && session.automatic && session.parent }
}

export function applyGanttEdit(tasks, session, delta, options = {}) {
  const preview = previewGanttEdit(tasks, session, delta)
  return applyScheduleChanges(tasks, preview.changes, options)
}
