import { dateToDay, todayDate, getSchedules } from '../dsh/schedule-model.js'
import { STATUS_META, buildTree, subtreeIds } from './task-model.js'
import { beginGanttEdit, previewGanttEdit, ganttEditRange, applyGanttEdit } from './gantt-edit-model.js'

const DAY_MS = 86400000
const DAY_WIDTH = 30
const ROW_HEIGHT = 52
// Stay below browser layout/scroll-width limits, even for dates centuries apart.
// This only changes pixels per day for exceptional spans, never the daily model.
const MAX_TRACK_WIDTH = 8000000
const EMPTY_PLAN_TEXT = '请备注起始和完成时间点'
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MIN_DAY = dateToDay('0001-01-01'), MAX_DAY = dateToDay('9999-12-31')
const factories = new WeakMap()

const ownerOf = task => typeof task.assignee === 'string' ? task.assignee.trim() : ''
const titleOf = task => typeof task.title === 'string' && task.title ? task.title : '（无标题）'
const clamp = (value, min, max) => Math.max(min, Math.min(value, Math.max(min, max)))
const pad = value => String(value).padStart(2, '0')

function dayParts(day) {
  const date = new Date(day * DAY_MS)
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1, number = date.getUTCDate()
  return { year, month, number, weekday: date.getUTCDay(), date: `${String(year).padStart(4, '0')}-${pad(month)}-${pad(number)}` }
}

function planOf(schedule) {
  const start = dateToDay(schedule?.start), end = dateToDay(schedule?.end)
  const kind = schedule?.kind === 'bar' && start !== null && end !== null && start <= end
    ? 'bar' : schedule?.kind === 'deadline' && end !== null ? 'deadline' : 'empty'
  return { start, end, kind, duration: kind === 'bar' ? end - start + 1 : null }
}

function scopeState(store, key) {
  let state = store.get(key)
  if (!state || typeof state !== 'object') {
    state = { collapsed: new Set(), scrollLeft: 0, scrollTop: 0, initialized: false, anchorDay: null, showCompleted: false }
    store.set(key, state)
  }
  if (!(state.collapsed instanceof Set)) state.collapsed = new Set(Array.isArray(state.collapsed) ? state.collapsed : [])
  return state
}

function visibleRows(tree, collapsed, showCompleted) {
  const rows = [], seen = new Set(), stack = tree.map((task, index) => ({ task, depth: 0, outline: `${index + 1}`, group: index % 4, parentTitle: '' })).reverse()
  while (stack.length) {
    const row = stack.pop()
    if (seen.has(row.task.id)) continue
    seen.add(row.task.id)
    // A completed project hides its whole branch, matching overview grouping.
    // The original task tree and schedules remain intact for history and editing.
    if (!showCompleted && row.task.status === 'done') continue
    rows.push(row)
    if (!collapsed.has(row.task.id)) {
      const children = row.task.children || []
      for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ task: children[index], depth: row.depth + 1,
        outline: `${row.outline}.${index + 1}`, group: row.group, parentTitle: titleOf(row.task) })
    }
  }
  return rows
}

function chartRange(tasks, schedules, today) {
  let earliest = null, latest = null, firstId = null
  for (const task of tasks) {
    const schedule = schedules.get(task.id)
    for (const value of [schedule?.start, schedule?.end]) {
      const day = dateToDay(value)
      if (day === null) continue
      if (earliest === null || day < earliest) { earliest = day; firstId = task.id }
      if (latest === null || day > latest) latest = day
    }
  }
  return {
    start: Math.max(MIN_DAY, earliest === null ? today - 14 : Math.min(earliest - 7, today - 7)),
    end: Math.min(MAX_DAY, latest === null ? today + 35 : Math.max(latest + 7, today + 21)),
    firstDay: earliest, firstId,
  }
}

/** Create the component once with the host's React; no other React copy or task I/O. */
export function createGanttView(React) {
  if (factories.has(React)) return factories.get(React)
  const h = React.createElement
  const useLayoutEffect = React.useLayoutEffect

  function Icon({ name }) {
    const paths = {
      today: ['M6 3v3M18 3v3M4 10h16', 'M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z', 'M9 14h6v3H9z'],
      locate: ['M12 3v4M12 17v4M3 12h4M17 12h4', 'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z'],
      ai: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z', 'M20 3v4M18 5h4'],
      back: ['M19 12H5m5-5-5 5 5 5'],
    }
    return h('svg', { className: 'tbGanttIcon', viewBox: '0 0 24 24', 'aria-hidden': true },
      (paths[name] || []).map((d, index) => h('path', { key: index, d })))
  }

  function GanttView({ tasks = [], scopeId = null, onTask, onEditPlan, onAI, onScopeAll, commit, active = true, disabled = false, stateRef }) {
    const localStateRef = React.useRef(null)
    const holder = stateRef || localStateRef
    if (!(holder.current instanceof Map)) holder.current = new Map()
    const store = holder.current
    // null deliberately distinguishes the global scope from a task whose id is "all".
    const scopeKey = scopeId ?? null
    const state = scopeState(store, scopeKey)
    const showCompleted = state.showCompleted === true
    const rootRef = React.useRef(null), viewportRef = React.useRef(null), leftHeadRef = React.useRef(null)
    const tooltipRef = React.useRef(null), frameRef = React.useRef(null), pendingJumpRef = React.useRef(null)
    const latestScopeRef = React.useRef(scopeKey)
    latestScopeRef.current = scopeKey
    const [, redraw] = React.useReducer(value => value + 1, 0)
    const [geometry, setGeometry] = React.useState({ left: 0, width: 0, sticky: 0, height: 0 })
    const [tooltip, setTooltip] = React.useState(null)
    const [editPreview, setEditPreview] = React.useState(null), [editBusy, setEditBusy] = React.useState(false)
    const [editMessage, setEditMessage] = React.useState(null)
    const gestureRef = React.useRef(null), clickBlockRef = React.useRef(null), mountedRef = React.useRef(true)
    const liveRef = React.useRef(null)
    const tooltipId = `tb-gantt-tooltip-${React.useId()}`
    const allTasks = Array.isArray(tasks) ? tasks : []
    liveRef.current = { tasks: allTasks, commit, disabled: disabled || editBusy || !active }
    const scopedTasks = React.useMemo(() => {
      if (scopeKey === null) return allTasks
      const ids = subtreeIds(allTasks, scopeKey)
      return allTasks.filter(task => ids.has(task.id))
    }, [allTasks, scopeKey])
    const tree = React.useMemo(() => buildTree(scopedTasks), [scopedTasks])
    const schedules = React.useMemo(() => getSchedules(scopedTasks), [scopedTasks])
    const drawingSchedules = React.useMemo(() => editPreview?.candidate ? getSchedules(editPreview.candidate) : schedules, [schedules, editPreview])
    const displayedTasks = React.useMemo(() => visibleRows(tree, new Set(), showCompleted).map(row => row.task), [tree, showCompleted])
    const rows = visibleRows(tree, state.collapsed, showCompleted)
    const hiddenCount = scopedTasks.length - displayedTasks.length
    const today = dateToDay(todayDate())
    const range = React.useMemo(() => chartRange(displayedTasks, schedules, today), [displayedTasks, schedules, today])
    const visibleWidth = Math.max(0, geometry.width - geometry.sticky)
    const dayCount = Math.min(MAX_DAY - range.start + 1, Math.max(range.end - range.start + 1, Math.ceil(visibleWidth / DAY_WIDTH), 1))
    const trackWidth = Math.min(dayCount * DAY_WIDTH, MAX_TRACK_WIDTH)
    const dayWidth = trackWidth / dayCount
    const endDay = range.start + dayCount - 1
    const hasOwners = displayedTasks.some(task => ownerOf(task))
    const scopedTask = scopeKey === null ? null : scopedTasks.find(task => task.id === scopeKey)
    const scopeLabel = scopeKey === null ? '全部任务' : scopedTask ? titleOf(scopedTask) : '当前任务'
    const parentById = React.useMemo(() => new Map(scopedTasks.map(task => [task.id, task.parentId])), [scopedTasks])

    function clearGesture() {
      const gesture = gestureRef.current
      gestureRef.current = null
      gesture?.cleanup?.()
      return gesture
    }
    function cancelEdit(message = '') {
      const gesture = clearGesture()
      if (gesture?.started) clickBlockRef.current = { id: gesture.session.id, until: Date.now() + 700 }
      if (mountedRef.current) {
        setEditPreview(null)
        if (message) setEditMessage({ error: false, text: message })
      }
    }
    function updateEdit(gesture, delta) {
      if (gestureRef.current !== gesture) return
      gesture.delta = delta
      let preview
      try { preview = { ...previewGanttEdit(liveRef.current.tasks, gesture.session, delta), error: null } }
      catch (problem) {
        let range = null
        try { range = ganttEditRange(gesture.session, delta) } catch { /* Outside supported dates. */ }
        preview = { session: gesture.session, delta, range, error: problem.message }
      }
      gesture.preview = preview
      setEditPreview(preview)
    }
    async function saveEdit() {
      const gesture = clearGesture()
      if (!gesture) return
      const preview = gesture.preview
      if (gesture.started) clickBlockRef.current = { id: gesture.session.id, until: Date.now() + 700 }
      setEditPreview(null)
      if (!preview || !preview.delta) return
      if (preview.error) { setEditMessage({ error: true, text: `${preview.error} 原计划未改变。` }); return }
      if (liveRef.current.disabled || typeof liveRef.current.commit !== 'function') return
      savePosition()
      setEditBusy(true)
      setTooltip(null)
      setEditMessage({ error: false, text: '正在保存计划…' })
      let failure = ''
      try {
        const saved = await liveRef.current.commit(latest => {
          try { return applyGanttEdit(latest, gesture.session, preview.delta) }
          catch (problem) { failure = problem.message; throw problem }
        })
        if (mountedRef.current) setEditMessage(saved === false
          ? { error: true, text: `${failure || '计划保存失败，请重试。'} 原计划已保留。` }
          : { error: false, text: `已保存 ${preview.changedCount} 项计划，详情中的计划日期已同步。` })
      } catch (problem) {
        if (mountedRef.current) setEditMessage({ error: true, text: `${problem.message} 原计划已保留。` })
      } finally { if (mountedRef.current) setEditBusy(false) }
    }
    function startPointerEdit(event, task, kind) {
      if (event.button !== 0 || liveRef.current.disabled || typeof commit !== 'function') return
      cancelEdit()
      clickBlockRef.current = null
      let session
      try { session = beginGanttEdit(liveRef.current.tasks, task.id, kind) }
      catch (problem) { setEditMessage({ error: true, text: problem.message }); return }
      const viewport = viewportRef.current, view = viewport?.ownerDocument?.defaultView
      if (!view) return
      const gesture = { session, startX: event.clientX, clientX: event.clientX, startScroll: viewport.scrollLeft,
        pointerId: event.pointerId, started: false, delta: 0, frame: null }
      gestureRef.current = gesture
      const refresh = () => {
        const pixels = gesture.clientX - gesture.startX + viewport.scrollLeft - gesture.startScroll
        if (!gesture.started && Math.abs(pixels) < 5) return
        gesture.started = true
        setTooltip(null)
        const delta = Math.round(pixels / dayWidth)
        if (!gesture.preview || gesture.delta !== delta) updateEdit(gesture, delta)
      }
      const move = pointer => {
        if (pointer.pointerId !== gesture.pointerId) return
        gesture.clientX = pointer.clientX
        refresh()
        if (gesture.started) pointer.preventDefault()
      }
      const up = pointer => {
        if (pointer.pointerId !== gesture.pointerId) return
        gesture.clientX = pointer.clientX
        refresh()
        void saveEdit()
      }
      const cancel = () => cancelEdit('已取消改期，原计划未改变。')
      const key = keyEvent => { if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); keyEvent.stopPropagation(); cancel() } }
      const edge = () => {
        if (gestureRef.current !== gesture) return
        if (gesture.started) {
          const rect = viewport.getBoundingClientRect(), frozen = leftHeadRef.current?.getBoundingClientRect().width || 0
          const left = rect.left + frozen + 26, right = rect.right - 26
          const step = gesture.clientX < left ? -Math.min(12, (left - gesture.clientX) / 3)
            : gesture.clientX > right ? Math.min(12, (gesture.clientX - right) / 3) : 0
          if (step) { viewport.scrollLeft += step; refresh() }
        }
        gesture.frame = view.requestAnimationFrame(edge)
      }
      view.addEventListener('pointermove', move, { passive: false })
      view.addEventListener('pointerup', up)
      view.addEventListener('pointercancel', cancel)
      view.addEventListener('blur', cancel)
      view.addEventListener('keydown', key, true)
      gesture.cleanup = () => {
        view.removeEventListener('pointermove', move); view.removeEventListener('pointerup', up)
        view.removeEventListener('pointercancel', cancel); view.removeEventListener('blur', cancel)
        view.removeEventListener('keydown', key, true); view.cancelAnimationFrame(gesture.frame)
      }
      gesture.frame = view.requestAnimationFrame(edge)
      event.stopPropagation()
      // Native button clicks still open details when the pointer has not moved.
      if (kind !== 'move') event.preventDefault()
    }
    function keyboardEdit(event, task, kind) {
      const gesture = gestureRef.current
      if (gesture?.keyboard && gesture.session.id === task.id) {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void saveEdit(); return }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit('已取消改期，原计划未改变。'); return }
      }
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || (kind === 'move' && !event.altKey)
        || liveRef.current.disabled || typeof commit !== 'function') return
      event.preventDefault(); event.stopPropagation()
      let current = gesture
      if (!current?.keyboard || current.session.id !== task.id || current.session.kind !== kind) {
        cancelEdit()
        try { current = { session: beginGanttEdit(liveRef.current.tasks, task.id, kind), keyboard: true, started: true, delta: 0 } }
        catch (problem) { setEditMessage({ error: true, text: problem.message }); return }
        gestureRef.current = current
        setTooltip(null); setEditMessage(null)
      }
      updateEdit(current, current.delta + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 7 : 1))
    }
    function barClick(event, id) {
      if (gestureRef.current?.started || (event.detail > 0 && clickBlockRef.current?.id === id && clickBlockRef.current.until > Date.now())) {
        event.preventDefault(); return
      }
      navigate(onTask, id)
    }
    React.useEffect(() => { cancelEdit(); return () => { clearGesture() } }, [scopeKey, active, disabled])
    React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; clearGesture() } }, [])

    const measure = React.useCallback(() => {
      const element = viewportRef.current
      if (!element) return
      const next = { left: element.scrollLeft, width: element.clientWidth, height: element.clientHeight,
        sticky: leftHeadRef.current?.getBoundingClientRect().width || 0 }
      setGeometry(previous => previous.left === next.left && previous.width === next.width && previous.sticky === next.sticky && previous.height === next.height ? previous : next)
    }, [])
    const queueMeasure = React.useCallback(() => {
      if (frameRef.current !== null) return
      const view = viewportRef.current?.ownerDocument?.defaultView
      if (view?.requestAnimationFrame) frameRef.current = view.requestAnimationFrame(() => { frameRef.current = null; measure() })
      else measure()
    }, [measure])

    function savePosition() {
      const element = viewportRef.current
      if (!element) return
      state.scrollLeft = element.scrollLeft
      state.scrollTop = element.scrollTop
      state.anchorDay = range.start + element.scrollLeft / dayWidth
    }
    function scrollToDay(day, rowIndex = null) {
      const element = viewportRef.current
      if (!element || day === null) return
      const leftWidth = leftHeadRef.current?.getBoundingClientRect().width || 0
      const available = Math.max(0, element.clientWidth - leftWidth)
      element.scrollLeft = clamp((day - range.start) * dayWidth - available * 0.2, 0, trackWidth - available)
      if (rowIndex !== null) element.scrollTop = Math.max(0, rowIndex * ROW_HEIGHT)
      savePosition()
      measure()
      setTooltip(null)
    }
    function navigate(callback, id) {
      if (editBusy) return
      cancelEdit()
      savePosition()
      setTooltip(null)
      if (typeof callback === 'function') callback(id)
    }
    function toggle(id) {
      cancelEdit()
      savePosition()
      const next = new Set(state.collapsed)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      state.collapsed = next
      setTooltip(null)
      redraw()
    }
    function toggleCompleted() {
      cancelEdit()
      savePosition()
      state.showCompleted = !showCompleted
      setTooltip(null)
      redraw()
    }
    function locatePlan() {
      if (range.firstDay === null) return
      savePosition()
      const next = new Set(state.collapsed), visited = new Set()
      let parent = parentById.get(range.firstId)
      while (parent && !visited.has(parent)) {
        visited.add(parent)
        next.delete(parent)
        parent = parentById.get(parent)
      }
      state.collapsed = next
      pendingJumpRef.current = { key: scopeKey, day: range.firstDay, id: range.firstId }
      redraw()
    }

    useLayoutEffect(() => {
      const element = viewportRef.current
      if (!element) return undefined
      measure()
      const view = element.ownerDocument?.defaultView
      const Observer = view?.ResizeObserver
      const observer = Observer ? new Observer(queueMeasure) : null
      observer?.observe(element)
      if (leftHeadRef.current) observer?.observe(leftHeadRef.current)
      view?.addEventListener('resize', queueMeasure)
      return () => {
        observer?.disconnect()
        view?.removeEventListener('resize', queueMeasure)
        if (frameRef.current !== null) view?.cancelAnimationFrame?.(frameRef.current)
        frameRef.current = null
      }
    }, [measure, queueMeasure])

    useLayoutEffect(() => {
      const element = viewportRef.current
      if (!element) return undefined
      const leftWidth = leftHeadRef.current?.getBoundingClientRect().width || 0
      const available = Math.max(0, element.clientWidth - leftWidth)
      const savedDay = Number.isFinite(state.anchorDay) ? state.anchorDay : null
      const left = state.initialized
        ? savedDay === null ? Number(state.scrollLeft) || 0 : (savedDay - range.start) * dayWidth
        : ((range.firstDay ?? today) - range.start) * dayWidth - available * 0.2
      element.scrollLeft = clamp(left, 0, trackWidth - available)
      element.scrollTop = Math.max(0, Number(state.scrollTop) || 0)
      state.initialized = true
      savePosition()
      measure()
      setTooltip(null)
      return () => {
        // A scope switch may already have changed the DOM's scrollable dimensions.
        // Its previous scope was saved on every scroll and before navigation.
        if (latestScopeRef.current === scopeKey && element.isConnected) {
          state.scrollLeft = element.scrollLeft
          state.scrollTop = element.scrollTop
        }
      }
    }, [state, range.start, dayWidth, trackWidth, geometry.width, geometry.sticky])

    useLayoutEffect(() => {
      const jump = pendingJumpRef.current
      if (!jump || jump.key !== scopeKey) return
      pendingJumpRef.current = null
      scrollToDay(jump.day, Math.max(0, rows.findIndex(row => row.task.id === jump.id)))
    })

    function tooltipPosition(anchor) {
      const root = rootRef.current
      if (!root) return null
      const bounds = root.getBoundingClientRect()
      return { anchorLeft: Math.max(8, anchor.left - bounds.left),
        anchorTop: anchor.top - bounds.top, anchorBottom: anchor.bottom - bounds.top,
        left: Math.max(8, anchor.left - bounds.left), top: anchor.bottom - bounds.top + 7 }
    }
    function showTooltip(event, task, schedule) {
      if (gestureRef.current?.started) return
      const anchorElement = event.currentTarget
      const position = tooltipPosition(anchorElement.getBoundingClientRect())
      if (position) setTooltip({ task, schedule, anchorElement, ...position })
    }
    function hideTooltip(event) {
      const anchorElement = event.currentTarget
      setTooltip(value => value?.anchorElement === anchorElement ? null : value)
    }
    function retainFocusedTooltip() {
      setTooltip(value => {
        const element = value?.anchorElement, viewport = viewportRef.current
        if (!element?.isConnected || !viewport?.contains(element) || element.ownerDocument.activeElement !== element) return null
        const anchor = element.getBoundingClientRect(), frame = viewport.getBoundingClientRect()
        const frozen = leftHeadRef.current?.getBoundingClientRect()
        const header = leftHeadRef.current?.parentElement?.getBoundingClientRect()
        const contentLeft = frame.left + viewport.clientLeft, contentTop = frame.top + viewport.clientTop
        const visibleLeft = element.closest('.tbGanttTimeline') ? Math.max(contentLeft, frozen?.right || contentLeft) : contentLeft
        const visibleTop = Math.max(contentTop, header?.bottom || contentTop)
        if (anchor.width <= 0 || anchor.height <= 0 || anchor.right <= visibleLeft || anchor.left >= contentLeft + viewport.clientWidth
          || anchor.bottom <= visibleTop || anchor.top >= contentTop + viewport.clientHeight) return null
        const position = tooltipPosition(anchor)
        if (!position) return null
        // Focus can auto-scroll AFTER onFocus; keep its description, but move the
        // tooltip to the final visible control instead of retaining stale geometry.
        return value.anchorLeft === position.anchorLeft && value.anchorTop === position.anchorTop && value.anchorBottom === position.anchorBottom
          ? value : { ...value, ...position }
      })
    }
    useLayoutEffect(() => {
      if (!tooltip || !tooltipRef.current || !rootRef.current) return
      const bounds = rootRef.current.getBoundingClientRect(), tip = tooltipRef.current.getBoundingClientRect()
      const left = clamp(tooltip.anchorLeft, 8, bounds.width - tip.width - 8)
      const below = tooltip.anchorBottom + 7
      const top = clamp(below + tip.height <= bounds.height - 8 ? below : tooltip.anchorTop - tip.height - 7, 8, bounds.height - tip.height - 8)
      if (left !== tooltip.left || top !== tooltip.top) setTooltip(value => value === tooltip ? { ...value, left, top } : value)
    }, [tooltip])

    function tooltipProps(task, schedule) {
      return {
        'aria-describedby': tooltip?.task.id === task.id ? tooltipId : undefined,
        onMouseEnter: event => showTooltip(event, task, schedule),
        onMouseLeave: event => { if (event.currentTarget.ownerDocument.activeElement !== event.currentTarget) hideTooltip(event) },
        onFocus: event => showTooltip(event, task, schedule), onBlur: hideTooltip,
      }
    }

    // Render only visible daily labels (+ small overscan), not every day in the range.
    // At exceptional compressed spans, labels are spaced out; the background still
    // draws every daily boundary and every bar retains its exact daily coordinates.
    const labelStep = Math.max(1, Math.ceil(26 / dayWidth))
    const firstVisible = Math.max(0, Math.floor(geometry.left / dayWidth) - 3 * labelStep)
    const lastVisible = Math.min(dayCount - 1, Math.ceil((geometry.left + (visibleWidth || 900)) / dayWidth) + 3 * labelStep)
    const ticks = []
    const tickStart = Math.max(0, Math.floor(firstVisible / labelStep) * labelStep)
    for (let offset = tickStart; offset <= lastVisible; offset += labelStep) {
      const parts = dayParts(range.start + offset), isToday = range.start + offset === today
      ticks.push(h('div', { key: offset, className: `tbGanttDay${parts.weekday === 0 || parts.weekday === 6 ? ' tbGanttWeekend' : ''}${isToday ? ' tbGanttDayToday' : ''}`,
        style: { left: offset * dayWidth, width: dayWidth * labelStep }, title: `${parts.date} 星期${WEEKDAYS[parts.weekday]}`,
        'aria-label': `${parts.date} 星期${WEEKDAYS[parts.weekday]}${isToday ? '，今天' : ''}`, 'data-date': parts.date },
      h('span', { className: 'tbGanttDayNumber' }, parts.number), h('span', { className: 'tbGanttWeekday' }, WEEKDAYS[parts.weekday])))
    }
    const months = []
    let monthOffset = firstVisible
    while (monthOffset <= lastVisible) {
      const parts = dayParts(range.start + monthOffset)
      const cursor = new Date((range.start + monthOffset) * DAY_MS)
      cursor.setUTCDate(1)
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      const nextOffset = Math.round(cursor.getTime() / DAY_MS) - range.start
      const segmentEnd = Math.min(nextOffset, lastVisible + 1)
      const left = monthOffset * dayWidth, width = (segmentEnd - monthOffset) * dayWidth
      const labelLeft = Math.max(0, geometry.left - left) + 8
      months.push(h('div', { key: `${parts.year}-${parts.month}`, className: 'tbGanttMonth', style: { left, width } },
        h('span', { style: { left: labelLeft } }, `${parts.year}年${parts.month}月`)))
      monthOffset = Math.max(monthOffset + 1, nextOffset)
    }
    const todayX = (today - range.start + 0.5) * dayWidth
    const weekShift = -((dayParts(range.start).weekday + 6) % 7) * dayWidth
    const chartStyle = { '--tb-gantt-track': `${trackWidth}px`, '--tb-gantt-day': `${dayWidth}px`,
      '--tb-gantt-week': `${dayWidth * 7}px`, '--tb-gantt-week-shift': `${weekShift}px`, '--tb-gantt-row-height': `${ROW_HEIGHT}px` }

    function renderRow({ task, depth, outline, group, parentTitle }, rowIndex) {
      const schedule = drawingSchedules.get(task.id), plan = planOf(schedule)
      const meta = STATUS_META[task.status] || STATUS_META.todo
      const owner = ownerOf(task), title = titleOf(task), children = task.children || []
      const hasVisibleChildren = children.some(child => showCompleted || child.status !== 'done')
      const collapsed = state.collapsed.has(task.id), auto = Boolean(schedule?.auto && schedule?.hasChildren)
      const missing = Math.max(0, Number(schedule?.unscheduledCount) || 0)
      const partialChildren = children.some(child => schedules.get(child.id)?.partial)
      const partialLabel = missing ? `${missing} 个下级任务尚未形成排期` : '下级任务排期不完整'
      const startText = schedule?.start || '', endText = schedule?.end || ''
      const dateLabel = `编辑排期：${title}。开始：${startText || '未设置'}，完成：${endText || '未设置'}${auto ? '，当前为子任务自动汇总' : ''}`
      const rowStyle = { '--tb-gantt-status': meta.color, '--tb-gantt-depth': depth }
      const editable = typeof commit === 'function' && !disabled && !editBusy && active
      const editing = editPreview?.session.id === task.id
      const controlProps = kind => ({
        onPointerDown: event => startPointerEdit(event, task, kind),
        onKeyDown: event => keyboardEdit(event, task, kind),
        onBlur: event => { hideTooltip(event); if (gestureRef.current?.keyboard) cancelEdit('已取消改期，原计划未改变。') },
      })
      let graphic
      if (plan.kind === 'bar') {
        const gutter = Math.min(3, dayWidth * 0.12)
        const left = (plan.start - range.start) * dayWidth + gutter
        const width = Math.max(1, plan.duration * dayWidth - gutter * 2)
        const tag = typeof onTask === 'function' ? 'button' : 'span'
        graphic = h(React.Fragment, null, h(tag, { className: auto ? 'tbGanttSummary' : 'tbGanttBar', type: tag === 'button' ? 'button' : undefined,
          style: { left, width }, 'aria-label': `打开任务：${title}，${startText}至${endText}，${plan.duration}天，${meta.label}${auto ? '，子任务自动汇总' : ''}`,
          'data-editable': editable ? 'true' : 'false', title: editable ? '拖动横条平移计划；Alt + 左右键调整，Enter 保存，Esc 取消' : undefined,
          onClick: tag === 'button' ? event => barClick(event, task.id) : undefined,
          ...tooltipProps(task, schedule), ...(editable ? controlProps('move') : {}) },
        h('span', { className: 'tbGanttBarLabel', style: width < 46 ? { display: 'none' } : undefined }, title)),
        editable ? ['start', 'end'].map(kind => h('button', { key: kind, type: 'button', className: `tbGanttResize tbGanttResize-${kind}`,
          style: { left: kind === 'start' ? left - 3 : left + width - 7 },
          'aria-label': `调整${kind === 'start' ? '开始' : '完成'}日期：${title}`,
          title: `${kind === 'start' ? '开始' : '完成'}：拖动或左右键调整，Enter 保存，Esc 取消`, ...controlProps(kind) },
          h('span', { 'aria-hidden': true }, '⋮'))) : null)
      } else if (plan.kind === 'deadline') {
        const left = (plan.end - range.start + 0.5) * dayWidth
        const tag = typeof onTask === 'function' ? 'button' : 'span'
        const editTag = typeof onEditPlan === 'function' ? 'button' : 'span'
        const hintOnLeft = left + 112 > trackWidth
        graphic = h(React.Fragment, null,
          h(tag, { className: 'tbGanttDeadline', type: tag === 'button' ? 'button' : undefined, style: { left },
            'aria-label': `打开截止任务：${title}，截止${endText}，${meta.label}`,
            'data-editable': editable ? 'true' : 'false', onClick: tag === 'button' ? event => barClick(event, task.id) : undefined,
            ...tooltipProps(task, schedule), ...(editable ? controlProps('move') : {}) }, h('span', { className: 'tbGanttDiamond', 'aria-hidden': true })),
          h(editTag, { className: 'tbGanttDeadlineHint', type: editTag === 'button' ? 'button' : undefined,
            style: { left: hintOnLeft ? Math.max(0, left - 108) : left + 14 }, disabled: editTag === 'button' ? disabled : undefined,
            'aria-label': `补充开始日期：${title}`, onClick: editTag === 'button' ? () => navigate(onEditPlan, task.id) : undefined,
            ...tooltipProps(task, schedule) }, '补充开始日期'))
      } else {
        const tag = typeof onEditPlan === 'function' ? 'button' : 'span'
        graphic = h(tag, { className: 'tbGanttEmptyPlan', type: tag === 'button' ? 'button' : undefined,
          disabled: tag === 'button' ? disabled : undefined, 'aria-label': `${EMPTY_PLAN_TEXT}：${title}`,
          onClick: tag === 'button' ? () => navigate(onEditPlan, task.id) : undefined, ...tooltipProps(task, schedule) }, EMPTY_PLAN_TEXT)
      }
      const titleTag = typeof onTask === 'function' ? 'button' : 'span'
      const dateTag = typeof onEditPlan === 'function' ? 'button' : 'span'
      return h('div', { key: task.id, role: 'row', className: 'tbGanttRow', 'aria-rowindex': rowIndex + 2,
        'aria-label': `${outline} ${title}${parentTitle ? `，上级：${parentTitle}` : '，顶层任务'}`,
        'data-outline': outline, 'data-group': group, 'data-parent': children.length ? 'true' : 'false', 'data-editing': editing ? 'true' : 'false',
        'data-task-id': task.id, 'data-plan-kind': plan.kind, 'data-status': task.status, 'data-depth': depth,
        'data-auto': auto ? 'true' : 'false', style: rowStyle },
      h('div', { className: 'tbGanttLeft' },
        h('div', { className: 'tbGanttTask', role: 'rowheader' },
          depth ? h('span', { className: 'tbGanttBranch', 'aria-hidden': true }, '└') : null,
          hasVisibleChildren ? h('button', { type: 'button', className: 'tbGanttFold', 'aria-expanded': !collapsed,
            'aria-label': `${collapsed ? '展开' : '折叠'}${title}的下级任务`, onClick: () => toggle(task.id) },
          h('span', { 'aria-hidden': true }, collapsed ? '▸' : '▾')) : h('span', { className: 'tbGanttFoldSpace', 'aria-hidden': true }),
          h('span', { className: 'tbGanttStatusDot', role: 'img', 'aria-label': meta.label, title: meta.label }),
          h('span', { className: 'tbGanttOutline', title: `层级编号 ${outline}${parentTitle ? ` · 上级：${parentTitle}` : ' · 顶层任务'}` }, outline),
          h(titleTag, { className: 'tbGanttTaskTitle', type: titleTag === 'button' ? 'button' : undefined,
            'aria-label': `打开任务：${title}`, onClick: titleTag === 'button' ? () => navigate(onTask, task.id) : undefined,
            ...tooltipProps(task, schedule) }, title),
          children.length ? h('span', { className: 'tbGanttParentBadge', title: `${children.length} 个直接下级；折叠箭头可展开或收起` }, '项目') : null,
          partialChildren ? h('span', { className: 'tbGanttPartialBadge',
            title: partialLabel, 'aria-label': partialLabel }, missing ? `缺 ${missing}` : '不完整') : null),
        hasOwners ? h('span', { className: 'tbGanttOwner', role: 'cell', title: owner || undefined }, owner || null) : null,
        h('div', { className: 'tbGanttDatesCell', role: 'cell' },
          h(dateTag, { className: `tbGanttDates${auto ? ' tbGanttAutoDates' : ''}`, type: dateTag === 'button' ? 'button' : undefined,
            disabled: dateTag === 'button' ? disabled : undefined, 'aria-label': dateLabel,
            onClick: dateTag === 'button' ? () => navigate(onEditPlan, task.id) : undefined, ...tooltipProps(task, schedule) },
          h('span', { className: 'tbGanttDate' }, h('span', { className: 'tbGanttDateKey', 'aria-hidden': true }, '始'),
            startText ? h('time', { dateTime: startText }, startText) : h('span', { className: 'tbGanttDateEmpty' }, '—')),
          h('span', { className: 'tbGanttDate' }, h('span', { className: 'tbGanttDateKey', 'aria-hidden': true }, '终'),
            endText ? h('time', { dateTime: endText }, endText) : h('span', { className: 'tbGanttDateEmpty' }, '—'))))),
      h('div', { className: 'tbGanttTimeline', role: 'cell' }, graphic,
        editing && editPreview.error && editPreview.range ? h('span', { className: 'tbGanttInvalidGhost', 'aria-hidden': true,
          style: { left: ((dateToDay(editPreview.range.start || editPreview.range.end)) - range.start) * dayWidth,
            width: Math.max(dayWidth, ((dateToDay(editPreview.range.end) - dateToDay(editPreview.range.start || editPreview.range.end)) + 1) * dayWidth) } }) : null))
    }

    const tooltipPlan = tooltip ? planOf(tooltip.schedule) : null
    const tooltipOwner = tooltip ? ownerOf(tooltip.task) : ''
    const tooltipMeta = tooltip ? STATUS_META[tooltip.task.status] || STATUS_META.todo : null
    const tooltipPartialChildren = tooltip?.task.children?.some(child => schedules.get(child.id)?.partial)
    return h('section', { ref: rootRef, className: 'tbGantt', 'data-scope': scopeKey === null ? 'all' : String(scopeKey),
      'data-show-completed': showCompleted ? 'true' : 'false',
      'data-has-owners': hasOwners ? 'true' : 'false', 'aria-label': `甘特图，范围：${scopeLabel}`, style: chartStyle,
      onKeyDown: event => { if (event.key === 'Escape' && tooltip) { setTooltip(null); event.stopPropagation() } } },
    h('div', { className: 'tbGanttToolbar' },
      h('div', { className: 'tbGanttScope' },
        h('div', { className: 'tbGanttScopeLine' }, h('h2', { className: 'tbGanttScopeTitle', title: `范围：${scopeLabel}` }, `范围：${scopeLabel}`),
          h('span', { className: 'tbGanttCount' }, `${displayedTasks.length} 项`)),
        h('div', { className: 'tbGanttRange' }, h('span', null, showCompleted ? scopeKey === null ? '含全部历史记录' : '当前任务与全部下级' : '已隐藏已完成任务及其下级'),
          h('span', { 'aria-hidden': true }, '·'), h('span', null, `${dayParts(range.start).date} — ${dayParts(endDay).date}`))),
      h('div', { className: 'tbGanttActions' },
        h('button', { type: 'button', className: 'tbGanttControl tbGanttCompletedToggle', 'aria-pressed': showCompleted,
          title: '显示或隐藏已完成任务及其下级；不修改任务状态和计划', onClick: toggleCompleted }, '显示已完成'),
        scopeKey !== null && typeof onScopeAll === 'function' ? h('button', { type: 'button', className: 'tbGanttControl tbGanttScopeAll',
          'aria-label': '返回全部任务甘特图', onClick: () => navigate(onScopeAll) }, h(Icon, { name: 'back' }), '全部任务') : null,
        h('button', { type: 'button', className: 'tbGanttControl', 'aria-label': '今天', title: '定位今天，不修改任务排期', onClick: () => scrollToDay(today) }, h(Icon, { name: 'today' }), '今天'),
        h('button', { type: 'button', className: 'tbGanttControl', 'aria-label': '定位排期', title: '定位当前范围最早的排期，并展开其上级任务',
          disabled: range.firstDay === null, onClick: locatePlan }, h(Icon, { name: 'locate' }), '定位排期'),
        typeof onAI === 'function' ? h('button', { type: 'button', className: 'tbGanttControl tbGanttAI', 'aria-label': 'AI辅助排期',
          disabled: disabled || editBusy, onClick: () => navigate(onAI) }, h(Icon, { name: 'ai' }), 'AI辅助排期') : null)),
    h('div', { className: 'tbGanttHowTo' },
      h('span', null, '拖动横条移动计划 · 拖动两端改起止 · 编号与连线表示上下级'),
      h('details', { className: 'tbGanttGuide' }, h('summary', null, '操作与层级示意'),
        h('div', { className: 'tbGanttGuideBody' },
          h('div', { className: 'tbGanttGuideTree', 'aria-label': '层级示例' },
            h('strong', null, '▾ 1  父项目'), h('span', null, '└ 1.1  子任务'), h('span', { className: 'tbGanttGuideGrandchild' }, '└ 1.1.1  下一级任务')),
          h('p', null, '同一顶层分支沿用同色边线；编号、缩进与连线共同表示层级。箭头可折叠下级，横条颜色表示任务状态。'),
          h('div', { className: 'tbGanttGuideBar', 'aria-label': '排期拖动示例' }, h('span', null, '↔ 起点'), h('strong', null, '← 整段平移 →'), h('span', null, '终点 ↔')),
          h('p', null, '拖动父项目会平移整个分支（含隐藏的已完成任务）；调整父项目两端保留子任务日期，越界时不保存。自动汇总项目调整两端后改为手动计划。'),
          h('p', null, '键盘：横条 Alt + 左右键平移；两端左右键调整；Shift 每次 7 天；Enter 保存，Esc 取消。单击横条打开详情。')))),
    h('div', { className: 'tbGanttEditSlot' }, editPreview ? h('div', { className: `tbGanttEditFeedback${editPreview.error ? ' tbGanttEditError' : ''}`, role: editPreview.error ? 'alert' : 'status' },
      h('strong', null, editPreview.error ? '无法保存：' : '改期预览：'),
      editPreview.range ? `${editPreview.range.start || '未设置'} → ${editPreview.range.end} · ` : '',
      editPreview.error || `${editPreview.changedCount} 项计划将同步${editPreview.session.parent && editPreview.session.kind === 'move' ? '（包含整个分支）' : ''}${editPreview.makesManual ? ' · 改为手动计划' : ''} · ${gestureRef.current?.keyboard ? 'Enter 保存，Esc 取消' : '松开保存，Esc 取消'}`) : null,
    !editPreview && editMessage ? h('div', { className: `tbGanttEditFeedback${editMessage.error ? ' tbGanttEditError' : ''}`, role: editMessage.error ? 'alert' : 'status' }, editMessage.text) : null),
    h('div', { ref: viewportRef, className: 'tbGanttViewport', tabIndex: 0, role: 'region',
      'aria-label': '甘特图任务树与每日时间轴，可横向和纵向滚动',
      onScroll: () => { savePosition(); retainFocusedTooltip(); queueMeasure() } },
      h('div', { className: 'tbGanttCanvas', role: 'table', 'aria-label': '任务排期', 'aria-rowcount': rows.length + 1,
        'aria-colcount': hasOwners ? 4 : 3 },
      h('div', { className: 'tbGanttTodayLine', style: { left: `calc(var(--tb-gantt-left) + ${todayX}px)` }, 'aria-hidden': true }),
      h('div', { className: 'tbGanttHeader', role: 'row', 'aria-rowindex': 1 },
        h('div', { ref: leftHeadRef, className: 'tbGanttLeft tbGanttLeftHead' },
          h('span', { className: 'tbGanttNameHead', role: 'columnheader' }, '任务', hasOwners ? h('span', { className: 'tbGanttCompactOwnerHead' }, ' / 负责人') : null),
          hasOwners ? h('span', { className: 'tbGanttOwnerHead', role: 'columnheader' }, '负责人') : null,
          h('div', { className: 'tbGanttDatesHead', role: 'columnheader', 'aria-label': '计划开始与完成日期' }, h('span', null, '开始'), h('span', null, '完成'))),
        h('div', { className: 'tbGanttCalendar', role: 'columnheader', 'aria-label': '每日时间轴' },
          h('div', { className: 'tbGanttMonths', 'aria-hidden': true }, months), h('div', { className: 'tbGanttDays' }, ticks),
          h('div', { className: 'tbGanttTodayMarker', style: { left: todayX }, 'aria-hidden': true }, h('span', null, '今天')))),
      rows.map(renderRow),
      !rows.length ? h('div', { className: 'tbGanttNoTasks' }, hiddenCount ? '已隐藏已完成任务及其下级，点击“显示已完成”查看。' : scopeKey === null ? '暂无任务' : '当前任务不存在或已被删除') : null)),
    h('div', { className: 'tbGanttFooter' }, h('span', null, `每日时间轴 · ${rows.length} / ${displayedTasks.length} 项可见${hiddenCount ? ` · 已隐藏 ${hiddenCount} 项（含已完成项目下级）` : ''}`),
      h('div', { className: 'tbGanttLegend', 'aria-label': '排期图例' },
        h('span', null, h('i', { className: 'tbGanttLegendSummary', 'aria-hidden': true }), '自动汇总'),
        h('span', null, h('i', { className: 'tbGanttLegendDeadline', 'aria-hidden': true }), '截止时间'))),
    tooltip ? h('div', { ref: tooltipRef, id: tooltipId, role: 'tooltip', className: 'tbGanttTooltip', style: { left: tooltip.left, top: tooltip.top } },
      h('strong', null, titleOf(tooltip.task)),
      h('div', { className: 'tbGanttTooltipStatus', style: { '--tb-gantt-status': tooltipMeta.color } }, h('span', { className: 'tbGanttStatusDot', 'aria-hidden': true }), tooltipMeta.label),
      h('dl', null,
        h('dt', null, '开始'), h('dd', null, tooltip.schedule?.start || '未设置'),
        h('dt', null, '完成'), h('dd', null, tooltip.schedule?.end || '未设置'),
        h('dt', null, '时长'), h('dd', null, tooltipPlan.duration === null ? '—' : `${tooltipPlan.duration} 天（含首尾）`),
        tooltipOwner ? h(React.Fragment, null, h('dt', null, '负责人'), h('dd', null, tooltipOwner)) : null),
      tooltip.schedule?.auto && tooltip.schedule?.hasChildren ? h('div', { className: 'tbGanttTooltipNote' }, '由下级任务自动汇总，不修改原始日期') : null,
      tooltipPartialChildren ? h('div', { className: 'tbGanttTooltipNote' }, tooltip.schedule?.unscheduledCount
        ? `${tooltip.schedule.unscheduledCount} 个下级任务尚未形成排期` : '下级任务排期不完整') : null) : null)
  }
  factories.set(React, GanttView)
  return GanttView
}
