import { dateToDay, isPlanDate } from '../dsh/schedule-model.js'
import { getMonthGrid, shiftMonth, monthForDate, layoutCalendarMonth } from './calendar-model.js'

export const CALENDAR_WEEK_HEIGHT = 158
const MAX_MONTH = 9999 * 12 - 1
const pad = number => String(number).padStart(2, '0')
const fail = (code, message) => { const error = new TypeError(message); error.code = code; throw error }

function monthIndex(month) {
  getMonthGrid(month) // Preserve the canonical model's strict date-domain validation.
  return (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5, 7)) - 1
}
function numeric(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }

/** Three neighboring months, represented once per Monday week and once per date. */
export function getCalendarWindow(month) {
  const center = monthIndex(month)
  const months = [-1, 0, 1].filter(delta => center + delta >= 0 && center + delta <= MAX_MONTH).map(delta => {
    const value = shiftMonth(month, delta)
    return { month: value, grid: getMonthGrid(value) }
  })
  const validMonths = new Set(months.map(entry => entry.month)), seen = new Set(), weeks = []
  for (const entry of months) for (const week of entry.grid.weeks) {
    if (seen.has(week.key)) continue
    seen.add(week.key)
    const dates = week.days.filter(day => day.date)
    const middle = week.days[3].date || dates[dates.length - 1]?.date || dates[0]?.date
    const labelMonth = monthForDate(middle)
    weeks.push({ ...week, labelMonth, anchorDate: dates[0].date,
      monthLabel: `${Number(labelMonth.slice(0, 4))}年${Number(labelMonth.slice(5, 7))}月`,
      transition: dates.some(day => day.date.endsWith('-01')),
      days: week.days.map(day => ({ ...day, inMonth: Boolean(day.date && validMonths.has(day.date.slice(0, 7))) })) })
  }
  const days = weeks.flatMap(week => week.days).filter(day => day.date)
  return { month, year: Number(month.slice(0, 4)), monthNumber: Number(month.slice(5, 7)), months, weeks,
    startDate: days[0].date, endDateExclusive: months[months.length - 1].grid.endDateExclusive,
    firstDate: days[0].date, lastDate: days[days.length - 1].date }
}

/** Reuse the frozen one-month layout, de-duplicating only identical whole weeks. */
export function layoutCalendarWindow(window, items, options = {}) {
  const canonical = getCalendarWindow(window.month), byWeek = new Map()
  for (const entry of canonical.months) for (const week of layoutCalendarMonth(entry.grid, items, options).weeks) {
    if (!byWeek.has(week.key)) byWeek.set(week.key, week)
  }
  return { weeks: canonical.weeks.map(week => ({ ...byWeek.get(week.key), ...week,
    segments: byWeek.get(week.key).segments, overflow: byWeek.get(week.key).overflow })) }
}

export function captureWindowAnchor(window, scrollTop, weekHeight = CALENDAR_WEEK_HEIGHT) {
  if (!Number.isFinite(weekHeight) || weekHeight <= 0) fail('invalid_scroll', 'Week height must be positive.')
  const position = Math.max(0, numeric(scrollTop, 0))
  const index = Math.min(window.weeks.length - 1, Math.floor(position / weekHeight))
  return { date: window.weeks[index].anchorDate, offset: position - index * weekHeight }
}
export function restoreWindowAnchor(window, anchor, weekHeight = CALENDAR_WEEK_HEIGHT) {
  if (!anchor || !isPlanDate(anchor.date) || !Number.isFinite(anchor.offset) || !Number.isFinite(weekHeight) || weekHeight <= 0) return null
  const index = window.weeks.findIndex(week => week.days.some(day => day.date === anchor.date))
  return index < 0 ? null : Math.max(0, index * weekHeight + anchor.offset)
}
export function calendarWindowCenterMonth(window, scrollTop, viewportHeight, headerHeight = 29) {
  const middle = Math.max(0, numeric(scrollTop, 0)) + Math.max(0, numeric(viewportHeight, 0) - headerHeight) / 2
  const index = Math.min(window.weeks.length - 1, Math.floor(middle / CALENDAR_WEEK_HEIGHT))
  return window.weeks[index].labelMonth
}
export function monthForPicker(yearText, monthNumber) {
  if (typeof yearText !== 'string' || !/^\d{1,4}$/.test(yearText) || Number(yearText) < 1 || Number(yearText) > 9999
    || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) return null
  return `${String(Number(yearText)).padStart(4, '0')}-${pad(monthNumber)}`
}
