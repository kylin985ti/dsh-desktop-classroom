import { todayDate, dateToDay } from '../dsh/schedule-model.js'
import { STATUS_META, STATUS_KEYS } from './task-model.js'
import { getMonthGrid, shiftMonth, monthForDate, deriveCalendarTasks, itemsOnDate } from './calendar-model.js'
import { getCalendarWindow, layoutCalendarWindow, captureWindowAnchor, restoreWindowAnchor, calendarWindowCenterMonth, monthForPicker } from './calendar-window-model.js'

const factories = new WeakMap()
const EMPTY_PLAN_TEXT = '请备注起始和完成时间点'
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const EMPTY_ITEMS = Object.freeze([])
const itemKey = item => typeof item?.key === 'string' ? item.key : `task:${item?.taskId || item?.id || ''}`
const taskIdOf = item => item?.taskId || item?.id
const titleOf = item => typeof item?.title === 'string' && item.title ? item.title : '（无标题）'
const dayAnchor = item => item?.kind === 'deadline' ? item.endDate : item?.startDate
const scheduleFrame = callback => typeof globalThis.requestAnimationFrame === 'function'
  ? { kind: 'frame', id: globalThis.requestAnimationFrame(callback) } : { kind: 'timer', id: setTimeout(callback, 16) }
function cancelFrame(frame) {
  if (!frame) return
  if (frame.kind === 'frame') globalThis.cancelAnimationFrame?.(frame.id)
  else clearTimeout(frame.id)
}
function ensureStore(holder) {
  if (!holder.current || typeof holder.current !== 'object' || holder.current instanceof Map || Array.isArray(holder.current)) holder.current = {}
  const store = holder.current
  if (!(store.scopes instanceof Map)) store.scopes = new Map()
  return store
}
function scopeState(store, key, today) {
  if (!store.scopes.has(key)) store.scopes.set(key, {
    month: monthForDate(today), selectedDate: today, selectedItemKey: null, drawerOpen: false,
    includeSummaries: true, statusFilter: 'all', sidebarOpen: false, scrollTop: 0, scrollLeft: 0, scrollAnchor: null,
  })
  return store.scopes.get(key)
}
function dateLabel(date) {
  if (typeof date !== 'string') return '未设置'
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}
function addDays(date, count) {
  const day = dateToDay(date)
  if (day === null) return date
  const next = new Date((day + count) * 86400000)
  const year = next.getUTCFullYear()
  if (year < 1 || year > 9999) return date
  return `${String(year).padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}
function taskTiming(item) {
  if (item?.kind === 'deadline') return `仅完成日期：${item.endDate}`
  if (item?.startDate && item?.endDate) return `${item.startDate} — ${item.endDate}`
  return EMPTY_PLAN_TEXT
}
/** Task plans projected through the host React singleton; navigation never writes task data. */
export function createCalendarView(React) {
  if (factories.has(React)) return factories.get(React)
  const h = React.createElement

  function Icon({ name }) {
    const paths = {
      previous: ['m14 6-6 6 6 6'], next: ['m10 6 6 6-6 6'], close: ['m6 6 12 12M18 6 6 18'],
      calendar: ['M7 3v4M17 3v4M4 10h16', 'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z'],
      back: ['M19 12H5m5-5-5 5 5 5'], sources: ['M4 6h16M4 12h16M4 18h16', 'M8 3v6M16 9v6M10 15v6'],
      external: ['M14 4h6v6M20 4l-9 9', 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5'],
    }
    return h('svg', { className: 'tbCalendarIcon', viewBox: '0 0 24 24', 'aria-hidden': true },
      (paths[name] || []).map((d, index) => h('path', { key: index, d })))
  }

  function CalendarView({ tasks = [], scopeId = null, onTask, onEditPlan, onScopeAll, disabled = false, active = true, stateRef }) {
    const localStore = React.useRef(null)
    const holder = stateRef || localStore
    const store = ensureStore(holder)
    const today = todayDate(), scopeKey = scopeId ?? null
    const state = scopeState(store, scopeKey, today)
    const [, redraw] = React.useReducer(value => value + 1, 0)
    const rootRef = React.useRef(null), viewportRef = React.useRef(null), drawerRef = React.useRef(null)
    const dayRefs = React.useRef(new Map()), openerRef = React.useRef(null), pendingFocus = React.useRef(null)
    const scrollFrame = React.useRef(null), restoreFrame = React.useRef(null), restoringScroll = React.useRef(false)
    const pickerTrigger = React.useRef(null), pickerRef = React.useRef(null), pickerYearInput = React.useRef(null), pickerMonths = React.useRef(new Map())
    const [pickerOpen, setPickerOpen] = React.useState(false)
    const [pickerYear, setPickerYear] = React.useState(String(Number(state.month.slice(0, 4))))
    const [scrollRevision, alignScroll] = React.useReducer(value => value + 1, 0)
    const currentScope = React.useRef(state)
    currentScope.current = state
    const activeRef = React.useRef(active)
    activeRef.current = active
    const headingId = `tb-calendar-heading-${React.useId()}`
    const drawerId = `tb-calendar-detail-${React.useId()}`
    const sidebarId = `tb-calendar-sources-${React.useId()}`
    const pickerId = `tb-calendar-month-picker-${React.useId()}`
    const grid = React.useMemo(() => getCalendarWindow(state.month), [state.month])
    const taskModel = React.useMemo(() => {
      try { return deriveCalendarTasks(Array.isArray(tasks) ? tasks : [], { scopeId: scopeKey, includeSummaries: state.includeSummaries !== false }) }
      catch { return { items: [], unscheduled: [], totalCount: 0, scopeTitle: '当前任务', error: '当前任务范围或日期数据不可用，未生成任务日历。' } }
    }, [tasks, scopeKey, state.includeSummaries])
    const taskItems = React.useMemo(() => (taskModel.items || []).filter(item => state.statusFilter === 'all' || item.status === state.statusFilter), [taskModel, state.statusFilter])
    const unscheduled = React.useMemo(() => (taskModel.unscheduled || []).filter(item => state.statusFilter === 'all' || item.status === state.statusFilter), [taskModel, state.statusFilter])
    const allItems = taskItems
    const monthLayout = React.useMemo(() => {
      try { return layoutCalendarWindow(grid, allItems, { maxLanes: 4 }) }
      catch { return { weeks: grid.weeks.map(week => ({ ...week, segments: [], overflow: [] })), error: '当前条目超出日历展示范围或数据限制，未生成月历条目。请缩小任务范围后重试。' } }
    }, [grid, allItems])
    const itemByKey = new Map([...allItems, ...unscheduled].map(item => [itemKey(item), item]))
    const selectedItem = state.selectedItemKey ? itemByKey.get(state.selectedItemKey) : null
    const selectedUnscheduled = selectedItem && !selectedItem.endDate
    const selectedDate = state.selectedDate || today
    const dayItems = React.useMemo(() => selectedUnscheduled || monthLayout.error || dateToDay(selectedDate) === null ? EMPTY_ITEMS : itemsOnDate(allItems, selectedDate), [allItems, selectedUnscheduled, monthLayout.error, selectedDate])
    const scopeTitle = scopeKey === null ? '全部任务' : taskModel.scopeTitle || '当前任务'

    function savePosition() {
      if (!viewportRef.current) return
      state.scrollTop = viewportRef.current.scrollTop
      state.scrollLeft = viewportRef.current.scrollLeft
      state.scrollAnchor = captureWindowAnchor(grid, state.scrollTop)
    }
    function handleScroll() {
      if (!activeRef.current) return
      savePosition()
      if (restoringScroll.current || scrollFrame.current) return
      if (pickerOpen) setPickerOpen(false)
      scrollFrame.current = scheduleFrame(() => {
        scrollFrame.current = null
        const viewport = viewportRef.current
        if (!viewport || !activeRef.current || restoringScroll.current || currentScope.current !== state) return
        const next = calendarWindowCenterMonth(grid, viewport.scrollTop, viewport.clientHeight)
        if (next === state.month) return
        // Rebase around the month actually in view, retaining the same leading
        // week/date and fractional pixel offset instead of synthesizing a page turn.
        state.scrollAnchor = captureWindowAnchor(grid, viewport.scrollTop)
        restoringScroll.current = true
        state.month = next
        redraw()
      })
    }
    function closePicker(returnFocus = true) {
      setPickerOpen(false)
      if (returnFocus) focusInCalendar(pickerTrigger.current)
    }
    function openPicker() {
      if (pickerOpen) { closePicker(); return }
      setPickerYear(String(grid.year))
      setPickerOpen(true)
    }
    function chooseMonth(month) {
      if (!month) return
      setMonth(month)
      closePicker()
    }
    function pickerKeyDown(event, number) {
      let next = number
      if (event.key === 'ArrowLeft') next -= 1
      else if (event.key === 'ArrowRight') next += 1
      else if (event.key === 'ArrowUp') next -= 4
      else if (event.key === 'ArrowDown') next += 4
      else if (event.key === 'Home') next = Math.floor((number - 1) / 4) * 4 + 1
      else if (event.key === 'End') next = Math.floor((number - 1) / 4) * 4 + 4
      else return
      event.preventDefault()
      focusInCalendar(pickerMonths.current.get(Math.max(1, Math.min(12, next))))
    }
    function updateDetailBounds() {
      const root = rootRef.current, viewport = viewportRef.current
      if (!activeRef.current || !root || !viewport || !root.style?.setProperty) return
      const rootBounds = root.getBoundingClientRect(), viewBounds = viewport.getBoundingClientRect()
      const top = `${Math.max(0, Math.ceil(viewBounds.top - rootBounds.top))}px`
      const bottom = `${Math.max(0, Math.ceil(rootBounds.bottom - viewBounds.bottom))}px`
      if (root.style.getPropertyValue('--tb-calendar-detail-top') !== top) root.style.setProperty('--tb-calendar-detail-top', top)
      if (root.style.getPropertyValue('--tb-calendar-detail-bottom') !== bottom) root.style.setProperty('--tb-calendar-detail-bottom', bottom)
    }
    // Never let focus()/scrollIntoView() scroll the platform shell or its hidden
    // ancestors. A roving date may reveal itself only inside our owned viewport.
    function focusInCalendar(element, reveal = false) {
      if (!element?.focus) return
      element.focus({ preventScroll: true })
      const viewport = viewportRef.current
      if (!reveal || !viewport?.contains(element)) return
      const view = viewport.getBoundingClientRect(), target = element.getBoundingClientRect()
      const header = viewport.querySelector('.tbCalendarWeekdays')?.getBoundingClientRect().height || 29
      const left = view.left + viewport.clientLeft + 3
      const right = view.left + viewport.clientLeft + viewport.clientWidth - 3
      const top = view.top + viewport.clientTop + header + 2
      const bottom = view.top + viewport.clientTop + viewport.clientHeight - 3
      const dx = target.left < left ? target.left - left : target.right > right ? target.right - right : 0
      const dy = target.top < top ? target.top - top : target.bottom > bottom ? target.bottom - bottom : 0
      if (dx) viewport.scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + dx))
      if (dy) viewport.scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, viewport.scrollTop + dy))
      savePosition()
    }
    function navigate(callback, taskId) {
      savePosition()
      if (typeof callback === 'function') callback(taskId)
    }
    function openDay(date, event, item = null) {
      if (event?.currentTarget) openerRef.current = event.currentTarget
      state.selectedDate = date || selectedDate
      state.selectedItemKey = item ? itemKey(item) : null
      state.drawerOpen = true
      redraw()
    }
    function closeDrawer() {
      state.drawerOpen = false
      redraw()
      const opener = openerRef.current
      if (opener?.isConnected) focusInCalendar(opener, true)
      else focusInCalendar(dayRefs.current.get(state.selectedDate), true)
    }
    function setMonth(month, focus = false, preferredDate = null, anchorDate = null) {
      cancelFrame(scrollFrame.current)
      scrollFrame.current = null
      restoringScroll.current = true
      savePosition()
      const nextGrid = getMonthGrid(month)
      const dates = nextGrid.weeks.flatMap(week => week.days).filter(day => day.inMonth)
      const preferredNumber = Number((preferredDate || selectedDate).slice(8, 10))
      const day = dates.find(entry => Number(entry.date.slice(8, 10)) === preferredNumber) || dates[dates.length - 1] || dates[0]
      state.month = nextGrid.month
      state.selectedDate = day?.date || nextGrid.startDate
      state.selectedItemKey = null
      state.drawerOpen = false
      state.scrollAnchor = { date: anchorDate || `${nextGrid.month}-01`, offset: 0 }
      state.scrollTop = restoreWindowAnchor(getCalendarWindow(nextGrid.month), state.scrollAnchor) || 0
      setPickerOpen(false)
      alignScroll()
      if (focus) pendingFocus.current = state.selectedDate
      redraw()
    }
    function goToday() {
      // A late-month today must be visible even in a short viewport; month
      // picking keeps its separate first-week alignment contract.
      setMonth(monthForDate(today), false, today, today)
    }
    function moveDayFocus(date, event) {
      const shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      let next = null
      if (Object.prototype.hasOwnProperty.call(shifts, event.key)) next = addDays(date, shifts[event.key])
      else if (event.key === 'Home' || event.key === 'End') {
        const column = ((new Date(dateToDay(date) * 86400000).getUTCDay() + 6) % 7)
        next = addDays(date, event.key === 'Home' ? -column : 6 - column)
      } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault()
        const focusedMonth = monthForDate(date)
        if ((event.key === 'PageUp' && focusedMonth === '0001-01') || (event.key === 'PageDown' && focusedMonth === '9999-12')) return
        setMonth(shiftMonth(focusedMonth, event.key === 'PageUp' ? -1 : 1), true, date)
        return
      }
      if (!next) return
      event.preventDefault()
      if (next < grid.firstDate || next > grid.lastDate) setMonth(monthForDate(next), false, next)
      state.selectedDate = next
      state.selectedItemKey = null
      pendingFocus.current = next
      redraw()
    }

    React.useLayoutEffect(updateDetailBounds)
    React.useEffect(() => {
      if (!active || !rootRef.current || !viewportRef.current) return undefined
      const observer = typeof globalThis.ResizeObserver === 'function' ? new globalThis.ResizeObserver(updateDetailBounds) : null
      observer?.observe(rootRef.current)
      observer?.observe(viewportRef.current)
      globalThis.addEventListener?.('resize', updateDetailBounds)
      return () => { observer?.disconnect(); globalThis.removeEventListener?.('resize', updateDetailBounds) }
    }, [active])
    React.useLayoutEffect(() => {
      const element = viewportRef.current
      if (!element || !active) return
      restoringScroll.current = true
      cancelFrame(restoreFrame.current)
      const anchor = state.scrollAnchor || { date: `${state.month}-01`, offset: 0 }
      const position = restoreWindowAnchor(grid, anchor)
      element.scrollTop = position === null ? restoreWindowAnchor(grid, { date: `${state.month}-01`, offset: 0 }) || 0 : position
      element.scrollLeft = Number(state.scrollLeft) || 0
      savePosition()
      restoreFrame.current = scheduleFrame(() => { restoreFrame.current = null; restoringScroll.current = false })
    }, [state, state.month, active, scrollRevision])
    React.useLayoutEffect(() => {
      if (!pendingFocus.current || !active) return
      const element = dayRefs.current.get(pendingFocus.current)
      pendingFocus.current = null
      focusInCalendar(element, true)
    })
    React.useEffect(() => {
      if (active && state.drawerOpen) drawerRef.current?.focus({ preventScroll: true })
    }, [active, state, state.drawerOpen])
    React.useEffect(() => {
      setPickerOpen(false)
      return () => { cancelFrame(scrollFrame.current); scrollFrame.current = null; cancelFrame(restoreFrame.current); restoringScroll.current = false }
    }, [active, state])
    React.useEffect(() => {
      if (active && pickerOpen) pickerYearInput.current?.focus({ preventScroll: true })
    }, [active, pickerOpen])

    function itemColor(item) {
      return (STATUS_META[item.status] || STATUS_META.todo).color
    }
    function itemDescription(item) {
      const meta = STATUS_META[item.status] || STATUS_META.todo
      return `${titleOf(item)}，${taskTiming(item)}，${meta.label}${item.auto ? '，下级任务自动汇总' : ''}`
    }
    function renderDayListItem(item) {
      return h('button', { key: itemKey(item), type: 'button', className: 'tbCalendarDayItem',
        'data-source': item.source, 'aria-pressed': state.selectedItemKey === itemKey(item), title: itemDescription(item),
        style: { '--tb-calendar-color': itemColor(item) }, onClick: () => { state.selectedItemKey = itemKey(item); redraw() } },
      h('span', { className: item.kind === 'deadline' ? 'tbCalendarDiamond' : 'tbCalendarItemDot', 'aria-hidden': true }),
      h('span', { className: 'tbCalendarDayItemText' }, h('strong', null, titleOf(item)),
        h('span', null, taskTiming(item))),
      item.auto ? h('span', { className: 'tbCalendarTinyTag' }, '汇总') : null)
    }
    function renderSegment(segment, week) {
      const item = segment.item, date = week.days[segment.startColumn]?.date || dayAnchor(item)
      return h('button', { key: segment.key, type: 'button', className: `tbCalendarBar${segment.continuesBefore ? ' tbCalendarContinuesBefore' : ''}${segment.continuesAfter ? ' tbCalendarContinuesAfter' : ''}`,
        'data-source': item.source, 'data-status': item.status, 'data-kind': item.kind, 'data-auto': item.auto ? 'true' : 'false',
        'data-task-id': taskIdOf(item), 'data-item-key': itemKey(item),
        style: { gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, gridRow: segment.lane + 1, '--tb-calendar-color': itemColor(item) },
        title: itemDescription(item), 'aria-label': itemDescription(item), 'aria-controls': drawerId,
        onClick: event => openDay(date, event, item) },
      item.kind === 'deadline' ? h('span', { className: 'tbCalendarDiamond', 'aria-hidden': true }) : null,
      h('span', { className: 'tbCalendarBarTitle' }, titleOf(item)),
      item.auto ? h('span', { className: 'tbCalendarTinyTag', 'aria-hidden': true }, '汇') : null)
    }
    function renderWeek(week) {
      const overflow = new Map((week.overflow || []).map(entry => [entry.date, entry]))
      return h('div', { key: week.key, className: 'tbCalendarWeek', role: 'row', 'data-week-start': week.anchorDate,
        'data-label-month': week.labelMonth, 'data-month-transition': week.transition ? 'true' : 'false' },
        h('div', { className: 'tbCalendarWeekHeader', 'data-current-month': week.labelMonth === state.month ? 'true' : 'false' },
          h('span', null, week.monthLabel), h('span', null, `${dateLabel(week.days.find(day => day.date)?.date)} — ${dateLabel(week.days.filter(day => day.date).at(-1)?.date)}`)),
        h('div', { className: 'tbCalendarDayCells' }, week.days.map((day, column) => {
          if (!day.date) return h('div', { key: `outside:${column}`, role: 'gridcell', className: 'tbCalendarDay tbCalendarOtherMonth', 'aria-disabled': true })
          const more = overflow.get(day.date)
          const count = (week.segments || []).filter(segment => segment.startColumn <= column && segment.endColumn >= column).length + (more?.count || 0)
          return h('div', { key: day.date, role: 'gridcell', className: `tbCalendarDay${!day.inMonth ? ' tbCalendarOtherMonth' : ''}${day.isWeekend ? ' tbCalendarWeekend' : ''}${day.date === selectedDate ? ' tbCalendarDaySelected' : ''}`,
            'data-date': day.date, 'aria-selected': day.date === selectedDate,
            onClick: event => { if (event.currentTarget === event.target) openDay(day.date, event) } },
          h('button', { ref: node => { if (node) dayRefs.current.set(day.date, node); else dayRefs.current.delete(day.date) }, type: 'button', className: `tbCalendarDayButton${day.date === today ? ' tbCalendarToday' : ''}`,
            tabIndex: day.date === focusDate ? 0 : -1, 'data-calendar-date': day.date, 'aria-current': day.date === today ? 'date' : undefined,
            'aria-label': `${day.date} 星期${WEEKDAYS[column]}${day.date === today ? '，今天' : ''}，${count}项`,
            'aria-controls': drawerId, onKeyDown: event => moveDayFocus(day.date, event), onClick: event => openDay(day.date, event) },
          h('time', { dateTime: day.date }, Number(day.date.slice(8, 10))),
          !day.inMonth ? h('span', { className: 'tbCalendarAdjacentMonth' }, `${Number(day.date.slice(5, 7))}月`) : null),
          more?.count > 0 ? h('button', { type: 'button', className: 'tbCalendarOverflow', 'aria-controls': drawerId,
            'aria-label': `查看${day.date}全部${count}项，另有${more.count}项未在月历显示`, onClick: event => openDay(day.date, event) }, `+${more.count} 项`) : null)
        })),
        h('div', { className: 'tbCalendarBars' }, (week.segments || []).map(segment => renderSegment(segment, week))))
    }

    const selectedMeta = selectedItem ? STATUS_META[selectedItem.status] || STATUS_META.todo : null
    const gridDates = grid.weeks.flatMap(week => week.days).filter(day => day.date).map(day => day.date)
    const taskCountInMonth = taskItems.filter(item => (dayAnchor(item) || '') <= gridDates[gridDates.length - 1] && (item.endDate || '') >= gridDates[0]).length
    const focusDate = selectedDate >= grid.firstDate && selectedDate <= grid.lastDate ? selectedDate : grid.firstDate
    const pickerYearValid = Boolean(monthForPicker(pickerYear, 1))

    return h('section', { ref: rootRef, className: 'tbCalendar', hidden: !active, 'data-month': state.month, 'data-scope': scopeKey === null ? 'all' : String(scopeKey),
      'data-sidebar-open': state.sidebarOpen ? 'true' : 'false', 'data-window-start': grid.firstDate, 'data-window-end': grid.lastDate, 'data-window-weeks': grid.weeks.length,
      'aria-label': `连续任务月历，范围：${scopeTitle}`,
      onPointerDownCapture: event => { if (pickerOpen && !pickerRef.current?.contains(event.target) && !pickerTrigger.current?.contains(event.target)) closePicker(false) },
      onKeyDown: event => {
        if (event.key !== 'Escape') return
        if (pickerOpen) { event.stopPropagation(); closePicker() }
        else if (state.drawerOpen) { event.stopPropagation(); closeDrawer() }
        else if (state.sidebarOpen) { event.stopPropagation(); state.sidebarOpen = false; redraw() }
      } },
    h('div', { className: 'tbCalendarToolbar' },
      h('div', { className: 'tbCalendarScope' }, h('h2', { className: 'tbCalendarScopeTitle', title: `范围：${scopeTitle}` }, `范围：${scopeTitle}`),
        h('span', { className: 'tbCalendarScopeCaption' }, `${taskModel.totalCount || 0} 项任务 · ${scopeKey === null ? '含历史记录' : '当前任务与全部下级'}`)),
      h('div', { className: 'tbCalendarToolbarActions' },
        scopeKey !== null && typeof onScopeAll === 'function' ? h('button', { type: 'button', className: 'tbCalendarControl', onClick: () => navigate(onScopeAll), 'aria-label': '返回全部任务日历' }, h(Icon, { name: 'back' }), '全部任务') : null,
        h('button', { type: 'button', className: 'tbCalendarControl tbCalendarSourcesToggle', 'aria-controls': sidebarId, 'aria-expanded': Boolean(state.sidebarOpen),
          onClick: () => { state.sidebarOpen = !state.sidebarOpen; redraw() } }, h(Icon, { name: 'sources' }), '待排期'),
        h('label', { className: 'tbCalendarSummaryToggle' }, h('input', { type: 'checkbox', checked: state.includeSummaries !== false,
          onChange: event => { state.includeSummaries = event.target.checked; redraw() } }), '显示父任务'),
        h('select', { className: 'tbCalendarStatusFilter', value: state.statusFilter || 'all', 'aria-label': '按任务状态筛选',
          onChange: event => { state.statusFilter = event.target.value; redraw() } },
        h('option', { value: 'all' }, '全部状态'), STATUS_KEYS.map(key => h('option', { key, value: key }, STATUS_META[key].label))))),
    h('div', { className: 'tbCalendarBody' },
      h('aside', { id: sidebarId, className: 'tbCalendarSidebar', 'aria-label': '任务计划与待排期' },
        h('section', { className: 'tbCalendarSourceSection' },
          h('h3', { className: 'tbCalendarSideHeading' }, h(Icon, { name: 'calendar' }), '任务计划'),
          h('div', { className: 'tbCalendarOwnSource' }, h('span', { className: 'tbCalendarItemDot', 'aria-hidden': true, style: { '--tb-calendar-color': 'var(--tb-accent)' } }), '任务计划', h('span', { className: 'tbCalendarSourceCount' }, taskItems.length))),
        h('section', { className: 'tbCalendarUnplannedSection', 'aria-label': '待排期任务' },
          h('h3', { className: 'tbCalendarSideHeading' }, '待排期', h('span', { className: 'tbCalendarSourceCount' }, unscheduled.length)),
          h('p', { className: 'tbCalendarSideHelp' }, EMPTY_PLAN_TEXT),
          unscheduled.length ? h('div', { className: 'tbCalendarUnplannedList' }, unscheduled.map(item => h('button', { key: itemKey(item), type: 'button', className: 'tbCalendarUnplanned',
            'data-task-id': taskIdOf(item), style: { '--tb-calendar-color': itemColor(item) }, 'aria-label': `${titleOf(item)}，${EMPTY_PLAN_TEXT}`,
            'aria-controls': drawerId, onClick: event => openDay(null, event, item) },
          h('span', { className: 'tbCalendarItemDot', 'aria-hidden': true }), h('span', null, titleOf(item)))))
            : h('p', { className: 'tbCalendarSideHelp' }, state.statusFilter === 'all' ? '当前范围没有待排期任务。' : '当前筛选下没有待排期任务。'))),
      h('div', { className: 'tbCalendarMain' },
        h('div', { className: 'tbCalendarMonthToolbar' },
          h('div', { className: 'tbCalendarMonthTitle' },
            h('h3', { id: headingId }, h('button', { ref: pickerTrigger, type: 'button', className: 'tbCalendarMonthButton', 'aria-label': '选择年月',
              'aria-haspopup': 'dialog', 'aria-expanded': pickerOpen, 'aria-controls': pickerId, onClick: openPicker }, `${grid.year}年${grid.monthNumber}月`, h('span', { 'aria-hidden': true }, '⌄'))),
            h('span', null, '连续月历'),
            pickerOpen ? h('div', { ref: pickerRef, id: pickerId, className: 'tbCalendarMonthPicker', role: 'dialog', 'aria-modal': false,
              'aria-label': '快速选择月份', 'data-calendar-dialog': true },
              h('div', { className: 'tbCalendarPickerHeader' },
                h('label', { className: 'tbCalendarPickerYear' }, h('span', null, '年份'), h('input', { ref: pickerYearInput, type: 'number', min: 1, max: 9999, step: 1,
                  value: pickerYear, inputMode: 'numeric', 'aria-label': '年份', 'aria-invalid': !pickerYearValid,
                  onChange: event => setPickerYear(event.target.value), onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); chooseMonth(monthForPicker(pickerYear, grid.monthNumber)) } } })),
                h('button', { type: 'button', className: 'tbCalendarControl', 'aria-label': '上一年', disabled: pickerYearValid && Number(pickerYear) <= 1,
                  onClick: () => setPickerYear(String(Math.max(1, (pickerYearValid ? Number(pickerYear) : grid.year) - 1))) }, h(Icon, { name: 'previous' })),
                h('button', { type: 'button', className: 'tbCalendarControl', 'aria-label': '下一年', disabled: pickerYearValid && Number(pickerYear) >= 9999,
                  onClick: () => setPickerYear(String(Math.min(9999, (pickerYearValid ? Number(pickerYear) : grid.year) + 1))) }, h(Icon, { name: 'next' })),
                h('button', { type: 'button', className: 'tbCalendarClose', 'aria-label': '关闭月份选择', onClick: () => closePicker() }, h(Icon, { name: 'close' }))),
              !pickerYearValid ? h('p', { className: 'tbCalendarPickerError', role: 'alert' }, '请输入 1–9999 年。') : null,
              h('div', { className: 'tbCalendarPickerMonths', role: 'group', 'aria-label': '月份' }, Array.from({ length: 12 }, (_, index) => {
                const number = index + 1, month = monthForPicker(pickerYear, number)
                return h('button', { key: number, ref: element => { if (element) pickerMonths.current.set(number, element); else pickerMonths.current.delete(number) },
                  type: 'button', className: 'tbCalendarPickerMonth', disabled: !month, 'data-month-option': month || undefined,
                  'aria-label': month ? `${Number(pickerYear)}年${number}月` : `${number}月，年份无效`, 'aria-pressed': month === state.month,
                  onKeyDown: event => pickerKeyDown(event, number), onClick: () => chooseMonth(month) }, `${number}月`)
              }))) : null),
          h('div', { className: 'tbCalendarMonthNav' },
            h('button', { type: 'button', className: 'tbCalendarControl', 'aria-label': '上个月', title: '上个月', disabled: state.month === '0001-01', onClick: () => setMonth(shiftMonth(state.month, -1)) }, h(Icon, { name: 'previous' })),
            h('button', { type: 'button', className: 'tbCalendarControl', onClick: goToday, 'aria-label': '回到今天' }, '今天'),
            h('button', { type: 'button', className: 'tbCalendarControl', 'aria-label': '下个月', title: '下个月', disabled: state.month === '9999-12', onClick: () => setMonth(shiftMonth(state.month, 1)) }, h(Icon, { name: 'next' })))),
        h('div', { className: 'tbCalendarObservation', role: 'status', 'aria-live': 'polite' },
          h('span', { className: 'tbCalendarWindowRange' }, `${grid.months[0].month} — ${grid.months.at(-1).month} · 上下滚动跨月`),
          h('span', null, `窗口内 ${taskCountInMonth} 项任务计划`)),
        taskModel.error || monthLayout.error ? h('div', { className: 'tbCalendarMainError', role: 'alert' }, taskModel.error || monthLayout.error) : null,
        h('div', { ref: viewportRef, className: 'tbCalendarViewport', role: 'region', tabIndex: -1,
          'aria-label': '连续三个月月历，可用鼠标滚轮或触控板在内部上下滚动跨月；日期支持方向键、Home、End 与 Page Up / Down', onScroll: handleScroll },
          h('div', { className: 'tbCalendarCanvas', role: 'grid', 'aria-labelledby': headingId, 'aria-colcount': 7, 'aria-rowcount': grid.weeks.length + 1,
            style: { '--tb-calendar-weeks': grid.weeks.length }, 'data-focus-date': focusDate },
            h('div', { className: 'tbCalendarWeekdays', role: 'row' }, WEEKDAYS.map((name, index) => h('div', { key: name, role: 'columnheader', className: index > 4 ? 'tbCalendarWeekendLabel' : '' }, `周${name}`))),
            monthLayout.weeks.map(renderWeek))),
        h('div', { className: 'tbCalendarFooter' },
          h('span', null, '横条表示计划窗口，不代表连续占用时间。'),
          h('div', { className: 'tbCalendarLegend', 'aria-label': '任务状态图例' }, STATUS_KEYS.map(key => h('span', { key, style: { '--tb-calendar-color': STATUS_META[key].color } }, h('i', { className: 'tbCalendarItemDot', 'aria-hidden': true }), STATUS_META[key].label)),
            h('span', null, h('i', { className: 'tbCalendarDiamond', 'aria-hidden': true }), '仅完成日期'))))),
    state.drawerOpen ? h('aside', { ref: drawerRef, id: drawerId, className: 'tbCalendarDetail', role: 'dialog', tabIndex: -1, 'data-calendar-dialog': true,
      'aria-modal': false, 'aria-label': selectedUnscheduled ? '待排期任务详情' : `${selectedDate}任务详情` },
      h('div', { className: 'tbCalendarDetailHeader' },
        h('div', null, h('h3', null, selectedUnscheduled ? '待排期任务' : `${dateLabel(selectedDate)}`),
          h('span', null, selectedUnscheduled ? EMPTY_PLAN_TEXT : `${selectedDate} · ${dayItems.length} 项`)),
        h('button', { type: 'button', className: 'tbCalendarClose', title: '关闭详情', 'aria-label': '关闭日历详情', onClick: closeDrawer }, h(Icon, { name: 'close' }))),
      h('div', { className: 'tbCalendarDetailBody' },
        !selectedUnscheduled ? h('section', { className: 'tbCalendarDayList', 'aria-label': '当天全部条目' },
          dayItems.length ? dayItems.map(renderDayListItem) : h('p', { className: 'tbCalendarDetailEmpty' }, '当天没有当前筛选下的任务。')) : null,
        selectedItem ? h('section', { className: 'tbCalendarItemDetail', 'data-source': selectedItem.source },
          h('div', { className: 'tbCalendarDetailEyebrow' }, selectedItem.auto ? '任务计划 · 自动汇总' : '任务计划'),
          h('h4', null, titleOf(selectedItem)),
          h(React.Fragment, null,
              h('span', { className: 'tbCalendarDetailStatus', style: { '--tb-calendar-color': selectedMeta.color } }, h('span', { className: 'tbCalendarItemDot', 'aria-hidden': true }), selectedMeta.label),
              h('dl', { className: 'tbCalendarDetailFields' },
                h('dt', null, '开始'), h('dd', null, selectedItem.kind === 'deadline' ? '未设置' : selectedItem.startDate || selectedItem.planStartDate || '未设置'),
                h('dt', null, '完成'), h('dd', null, selectedItem.endDate || selectedItem.planEndDate || '未设置')),
              selectedUnscheduled ? h('p', { className: 'tbCalendarDetailNote' }, EMPTY_PLAN_TEXT) : null,
              selectedItem.kind === 'deadline' ? h('p', { className: 'tbCalendarDetailNote' }, '仅设置了完成日期；补充开始日期后可显示跨日计划。') : null,
              selectedItem.auto ? h('p', { className: 'tbCalendarDetailNote' }, '由下级任务日期自动汇总，不生成新的日历事件。') : null,
              selectedItem.partial && selectedItem.auto ? h('p', { className: 'tbCalendarWarning' }, '部分下级任务的排期仍不完整。') : null,
              h('div', { className: 'tbCalendarDetailActions' },
                h('button', { type: 'button', className: 'tbCalendarControl tbCalendarOpenTask', 'data-task-id': taskIdOf(selectedItem), disabled: typeof onTask !== 'function', onClick: () => navigate(onTask, taskIdOf(selectedItem)) }, h(Icon, { name: 'external' }), '打开任务'),
                h('button', { type: 'button', className: 'tbCalendarControl tbCalendarEditPlan', 'data-task-id': taskIdOf(selectedItem), disabled: disabled || typeof onEditPlan !== 'function', onClick: () => navigate(onEditPlan, taskIdOf(selectedItem)) }, '编辑计划'))))
          : dayItems.length ? h('p', { className: 'tbCalendarDetailEmpty' }, '选择一项查看详情。') : null)) : null)
  }
  factories.set(React, CalendarView)
  return CalendarView
}
