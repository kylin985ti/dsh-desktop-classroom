import assert from 'node:assert/strict'
import { dateToDay } from '../dsh/schedule-model.js'
import { createCalendarView } from '../src/calendar-view.js'
import { CALENDAR_CSS } from '../src/calendar-styles.js'
import { shiftMonth, deriveCalendarTasks } from '../src/calendar-model.js'
import { CALENDAR_WEEK_HEIGHT, getCalendarWindow, layoutCalendarWindow, captureWindowAnchor, restoreWindowAnchor, calendarWindowCenterMonth, monthForPicker } from '../src/calendar-window-model.js'

let checks = 0
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1 }
const ok = (value, message) => { assert.ok(value, message); checks += 1 }
const throws = (callback, code) => { assert.throws(callback, error => error.code === code); checks += 1 }

// A full Gregorian leap-year cycle: whole, contiguous weeks and unique date DOM.
for (let year = 2000; year < 2400; year += 1) for (let month = 1; month <= 12; month += 1) {
  const key = `${year}-${String(month).padStart(2, '0')}`, window = getCalendarWindow(key)
  equal(window.months.map(entry => entry.month), [shiftMonth(key, -1), key, shiftMonth(key, 1)])
  ok(window.weeks.length >= 13 && window.weeks.length <= 15)
  equal(new Set(window.weeks.map(week => week.key)).size, window.weeks.length)
  const dates = window.weeks.flatMap(week => week.days).filter(day => day.date).map(day => day.date)
  equal(new Set(dates).size, dates.length)
  for (let index = 1; index < dates.length; index += 1) ok(dateToDay(dates[index]) === dateToDay(dates[index - 1]) + 1)
  const middle = window.weeks[Math.floor(window.weeks.length / 2)]
  const anchor = { date: middle.anchorDate, offset: 37.5 }
  const scroll = restoreWindowAnchor(window, anchor)
  equal(captureWindowAnchor(window, scroll), anchor)
  const nextWindow = getCalendarWindow(shiftMonth(key, 1))
  const nextScroll = restoreWindowAnchor(nextWindow, anchor)
  ok(nextScroll !== null)
  equal(captureWindowAnchor(nextWindow, nextScroll), anchor)
  ok(/^\d{4}-\d{2}$/.test(calendarWindowCenterMonth(window, scroll, 640)))
}
for (const key of ['0001-01', '0001-02', '9999-11', '9999-12']) {
  const window = getCalendarWindow(key)
  ok(window.months.length >= 2 && window.months.length <= 3)
  ok(window.weeks.length <= 16)
  const dates = window.weeks.flatMap(week => week.days).filter(day => day.date).map(day => day.date)
  equal(new Set(dates).size, dates.length)
  ok(dates.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))
}
equal(restoreWindowAnchor(getCalendarWindow('2030-02'), { date: '1900-01-01', offset: 3 }), null)
equal(restoreWindowAnchor(getCalendarWindow('2030-02'), { date: '2030-02-01', offset: NaN }), null)
throws(() => captureWindowAnchor(getCalendarWindow('2030-02'), 0, 0), 'invalid_scroll')
equal(CALENDAR_WEEK_HEIGHT, 158)

const longTasks = deriveCalendarTasks([
  { id: 'long', title: 'One project across months', status: 'doing', planStartDate: '2029-12-28', planEndDate: '2030-04-02' },
  { id: 'point', title: 'Only completion', status: 'todo', planEndDate: '2030-02-14' },
]).items
const laidOut = layoutCalendarWindow(getCalendarWindow('2030-02'), longTasks, { maxLanes: 4 })
const segments = laidOut.weeks.flatMap(week => week.segments)
equal(new Set(segments.map(segment => segment.key)).size, segments.length)
equal(segments.filter(segment => segment.item.taskId === 'point').length, 1)
ok(segments.filter(segment => segment.item.taskId === 'long').length >= 13)
for (const week of laidOut.weeks) {
  ok(week.monthLabel && week.anchorDate)
  for (const segment of week.segments) ok(segment.startColumn >= 0 && segment.endColumn <= 6 && segment.lane <= 3)
}
const crowded = deriveCalendarTasks(Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, title: `Task ${i}`, status: 'todo', planStartDate: '2030-02-01', planEndDate: '2030-03-01' }))).items
const crowdedLayout = layoutCalendarWindow(getCalendarWindow('2030-02'), crowded, { maxLanes: 4 })
ok(crowdedLayout.weeks.some(week => week.overflow.some(day => day.count === 5)))

for (const invalid of ['', '0', '0000', '10000', '-1', '2030.5', 'year']) equal(monthForPicker(invalid, 2), null)
equal(monthForPicker('1', 2), '0001-02'); equal(monthForPicker('9999', 12), '9999-12'); equal(monthForPicker('2030', 0), null)
// A minimal host-React/DOM stand-in exercises UI state transitions without a browser.
function nodes(value) {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(nodes)
  return [value, ...nodes(value.props?.children)]
}
function content(value) {
  if (value == null || typeof value === 'boolean') return ''
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.map(content).join('')
  return content(value.props?.children)
}
function harness(initial) {
  const slots = [], focused = [], assigned = [], styles = new Map()
  let cursor = 0, pending = [], dirty = true, tree, props = initial, scrollTop = 0, scrollLeft = 0
  const viewport = { clientLeft: 1, clientTop: 1, clientWidth: 700, clientHeight: 560, scrollWidth: 700, scrollHeight: 2500,
    get scrollTop() { return scrollTop }, set scrollTop(value) { scrollTop = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)) },
    get scrollLeft() { return scrollLeft }, set scrollLeft(value) { scrollLeft = Math.max(0, Math.min(value, this.scrollWidth - this.clientWidth)) },
    getBoundingClientRect: () => ({ top: 160, bottom: 720, left: 300, right: 1000 }),
    contains: element => element?.inViewport === true,
    querySelector: () => ({ getBoundingClientRect: () => ({ height: 29 }) }) }
  const root = { style: { getPropertyValue: key => styles.get(key) || '', setProperty: (key, value) => styles.set(key, value) },
    getBoundingClientRect: () => ({ top: 60, bottom: 760, left: 280, right: 1020 }) }
  const makeElement = (name, inViewport = false) => ({ name, inViewport, isConnected: true, contains(element) { return element === this },
    focus: options => focused.push({ name, options }), getBoundingClientRect: () => ({ top: 200, bottom: 231, left: 320, right: 390 }) })
  const fixed = { root, viewport, picker: makeElement('picker'), trigger: makeElement('trigger'), year: makeElement('year'), drawer: makeElement('drawer') }
  const hook = init => { const index = cursor++; if (!slots[index]) slots[index] = init(); return slots[index] }
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]))
  const effect = (callback, deps) => { const slot = hook(() => ({})); if (changed(slot.deps, deps)) { slot.deps = deps; pending.push(() => { slot.cleanup?.(); slot.cleanup = callback() }) } }
  const React = { Fragment: Symbol('fragment'), createElement: (type, attributes, ...children) => ({ type, props: { ...(attributes || {}), children } }),
    useRef: value => hook(() => ({ current: value })), useId: () => hook(() => ({ value: String(cursor) })).value,
    useState: initial => { const slot = hook(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true } }] },
    useReducer: (reduce, initial) => { const slot = hook(() => ({ value: initial })); return [slot.value, action => { slot.value = reduce(slot.value, action); dirty = true }] },
    useMemo: (callback, deps) => { const slot = hook(() => ({})); if (changed(slot.deps, deps)) { slot.deps = deps; slot.value = callback() } return slot.value }, useEffect: effect, useLayoutEffect: effect }
  const View = createCalendarView(React)
  equal(createCalendarView(React), View, 'host-React factory is stable')
  function commit() {
    for (const previous of assigned.splice(0)) { if (typeof previous === 'function') previous(null); else previous.current = null }
    const all = nodes(tree)
    viewport.scrollHeight = all.filter(node => node.props?.className === 'tbCalendarWeek').length * CALENDAR_WEEK_HEIGHT + 29
    for (const node of all) {
      const ref = node.props?.ref
      if (!ref) continue
      let element
      const cls = node.props.className
      if (cls === 'tbCalendar') element = root
      else if (cls === 'tbCalendarViewport') element = viewport
      else if (cls === 'tbCalendarMonthButton') element = fixed.trigger
      else if (cls === 'tbCalendarMonthPicker') element = fixed.picker
      else if (cls === 'tbCalendarDetail') element = fixed.drawer
      else if (node.props['aria-label'] === '年份') element = fixed.year
      else if (node.props['data-calendar-date']) element = makeElement(node.props['data-calendar-date'], true)
      else element = makeElement(node.props['data-month-option'] || 'month')
      if (typeof ref === 'function') ref(element); else ref.current = element
      assigned.push(ref)
    }
  }
  function render() {
    for (let run = 0; dirty && run < 30; run += 1) { dirty = false; cursor = 0; tree = View(props); commit(); const effects = pending; pending = []; effects.forEach(callback => callback()) }
    assert.equal(dirty, false, 'UI settles without a render loop')
    return tree
  }
  const query = callback => nodes(render()).find(callback)
  const byClass = name => nodes(render()).filter(node => (node.props?.className || '').split(' ').includes(name))
  const button = label => query(node => node.type === 'button' && (node.props['aria-label'] === label || content(node) === label))
  const click = label => { const node = button(label); assert.ok(node, `Missing button: ${label}`); assert.ok(!node.props.disabled, `Disabled button: ${label}`); return node.props.onClick?.({ currentTarget: makeElement(label) }) }
  const settle = async () => { for (let iteration = 0; iteration < 14; iteration += 1) { render(); await Promise.resolve() } return render() }
  return { render, settle, viewport, focused, styles, query, byClass, button, click, get tree() { return render() },
    update(next) { props = { ...props, ...next }; dirty = true; return render() },
    close() { slots.forEach(slot => slot.cleanup?.()); for (const ref of assigned) if (typeof ref === 'function') ref(null); else ref.current = null } }
}
const frames = new Map(), previousFrame = globalThis.requestAnimationFrame, previousCancel = globalThis.cancelAnimationFrame
let frameNumber = 0
const flushFrames = ui => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); ui.render() }
globalThis.requestAnimationFrame = callback => { const number = ++frameNumber; frames.set(number, callback); return number }
globalThis.cancelAnimationFrame = number => frames.delete(number)
const scopeRef = () => ({ current: { scopes: new Map([[null, { month: '2030-02', selectedDate: '2030-02-15', includeSummaries: true, statusFilter: 'all' }]]) } })
try {
  const ref = scopeRef(), ui = harness({ tasks: [], stateRef: ref })
  await ui.settle(); flushFrames(ui)
  equal(ui.tree.props['data-month'], '2030-02')
  ok(ui.byClass('tbCalendarWeek').length >= 13 && ui.byClass('tbCalendarWeek').length <= 15)
  const dates = nodes(ui.tree).filter(node => node.props?.['data-calendar-date']).map(node => node.props['data-calendar-date'])
  equal(new Set(dates).size, dates.length, 'date selectors stay unique')
  equal(ref.current.scopes.get(null).scrollAnchor, captureWindowAnchor(getCalendarWindow('2030-02'), ui.viewport.scrollTop))
  ui.viewport.scrollTop += 20; ui.byClass('tbCalendarViewport')[0].props.onScroll(); flushFrames(ui)
  equal(ui.tree.props['data-month'], '2030-02', 'small native scrolling is not a month-page trigger')
  const oldWindow = getCalendarWindow('2030-02')
  ui.viewport.scrollTop = restoreWindowAnchor(oldWindow, { date: '2030-03-04', offset: 51.5 })
  const beforeRebase = captureWindowAnchor(oldWindow, ui.viewport.scrollTop)
  ui.byClass('tbCalendarViewport')[0].props.onScroll(); flushFrames(ui); flushFrames(ui)
  equal(ui.tree.props['data-month'], '2030-03', 'visible center rebases the bounded window')
  equal(captureWindowAnchor(getCalendarWindow('2030-03'), ui.viewport.scrollTop), beforeRebase, 'rebase preserves date plus fractional pixel offset')
  ui.click('选择年月'); await ui.settle()
  ok(ui.query(node => node.props?.['aria-label'] === '快速选择月份'))
  ui.query(node => node.props?.['aria-label'] === '年份').props.onChange({ target: { value: '10000' } }); ui.render()
  ok(ui.byClass('tbCalendarPickerMonth').every(node => node.props.disabled))
  ui.query(node => node.props?.['aria-label'] === '年份').props.onChange({ target: { value: '2042' } }); ui.render(); ui.click('2042年7月'); ui.render(); flushFrames(ui)
  equal(ui.tree.props['data-month'], '2042-07')
  equal(captureWindowAnchor(getCalendarWindow('2042-07'), ui.viewport.scrollTop).offset, 0, 'picked month aligns its first week')
  equal(captureWindowAnchor(getCalendarWindow('2042-07'), ui.viewport.scrollTop).date, getCalendarWindow('2042-07').weeks.find(week => week.days.some(day => day.date === '2042-07-01')).anchorDate)
  ui.click('选择年月'); ui.render(); let stopped = false; ui.tree.props.onKeyDown({ key: 'Escape', stopPropagation() { stopped = true } }); ui.render()
  ok(stopped); equal(ui.byClass('tbCalendarMonthPicker').length, 0)
  ok(ui.focused.every(entry => entry.options?.preventScroll === true))
  const inactiveAnchor = ref.current.scopes.get(null).scrollAnchor
  ui.update({ active: false }); ui.viewport.scrollTop = 0; ui.byClass('tbCalendarViewport')[0].props.onScroll(); ui.render()
  equal(ref.current.scopes.get(null).scrollAnchor, inactiveAnchor, 'hidden scroller events cannot erase the saved anchor')
  ui.update({ active: true }); ui.render(); flushFrames(ui)
  equal(ref.current.scopes.get(null).scrollAnchor, inactiveAnchor, 'reactivation restores the anchored month position')
  const saved = ref.current.scopes.get(null).scrollAnchor; ui.close()
  const returned = harness({ tasks: [], stateRef: ref }); await returned.settle(); equal(ref.current.scopes.get(null).scrollAnchor, saved); returned.close()

  const ActualDate = globalThis.Date, lateToday = new ActualDate(2030, 0, 31, 12, 0, 0).getTime()
  class LateMonthDate extends ActualDate {
    constructor(...args) { super(...(args.length ? args : [lateToday])) }
    static now() { return lateToday }
  }
  let lateUI
  try {
    globalThis.Date = LateMonthDate
    const lateRef = scopeRef()
    lateUI = harness({ tasks: [], stateRef: lateRef })
    lateUI.viewport.clientHeight = 180
    await lateUI.settle(); flushFrames(lateUI)
    lateUI.click('回到今天'); lateUI.render(); flushFrames(lateUI)
    equal(lateUI.tree.props['data-month'], '2030-01')
    equal(lateRef.current.scopes.get(null).selectedDate, '2030-01-31')
    const lateWindow = getCalendarWindow('2030-01')
    const todayWeek = lateWindow.weeks.findIndex(week => week.days.some(day => day.date === '2030-01-31'))
    equal(lateRef.current.scopes.get(null).scrollAnchor, { date: lateWindow.weeks[todayWeek].anchorDate, offset: 0 }, 'Today anchors the actual late-month week, not month 01')
    const todayTop = 29 + todayWeek * CALENDAR_WEEK_HEIGHT + 22 - lateUI.viewport.scrollTop
    ok(todayTop >= 29 && todayTop + 31 <= lateUI.viewport.clientHeight, 'January 31 is visibly inside a short viewport')
    lateUI.viewport.scrollTop = restoreWindowAnchor(lateWindow, { date: '2030-01-01', offset: 0 })
    lateUI.byClass('tbCalendarViewport')[0].props.onScroll(); flushFrames(lateUI)
    lateUI.click('回到今天'); lateUI.render(); flushFrames(lateUI)
    equal(lateRef.current.scopes.get(null).scrollAnchor, { date: lateWindow.weeks[todayWeek].anchorDate, offset: 0 }, 'Today also re-aligns within the already-selected month')
  } finally { lateUI?.close(); globalThis.Date = ActualDate }
  ok(!nodes(returned.tree).some(node => node.props?.onWheel), 'no wheel interception or synthetic month-page handler')
  ok(CALENDAR_CSS.includes(`--tb-calendar-week-height:${CALENDAR_WEEK_HEIGHT}px`))
  ok(CALENDAR_CSS.includes('top:var(--tb-calendar-detail-top,120px)'))
} finally { frames.clear(); globalThis.requestAnimationFrame = previousFrame; globalThis.cancelAnimationFrame = previousCancel }
console.log(`Calendar rolling window: ${checks} assertions passed, covering all 4,800 months of a 400-year cycle, boundary years, anchors, unique weeks/dates/strips, picker interactions, late-month Today, inactive guards and focus restoration. No browser, network, native app, or user data used.`)
