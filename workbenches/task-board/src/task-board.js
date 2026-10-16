import { validateScheduleState } from '../dsh/schedule-model.js'
import { createGanttView } from './gantt-view.js'
import { createScheduleEditor } from './schedule-editor.js'
import { createAISchedulePanel } from './ai-schedule-panel.js'
import { createCalendarView } from './calendar-view.js'
import {
  STATUS_META, STATUS_KEYS, SETTLED, newId, visibleInBoard, buildTree, findNode,
  flattenTree, subtreeIds, removeSubtree, appendTask, applyStatus, applyReorder, applyReparent,
} from './task-model.js'

/** Create stable component types once, using the host's shared React instance. */
export function createTaskBoard(React, { ensureStyle, loadTasks, saveTasks, DomainPanel }) {
  const h = React.createElement
  const GanttView = createGanttView(React), ScheduleEditor = createScheduleEditor(React), AISchedulePanel = createAISchedulePanel(React), CalendarView = createCalendarView(React)
  const paths = {
    plus: ['M12 5v14M5 12h14'], close: ['m6 6 12 12M18 6 6 18'],
    grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    chat: ['M6 18 3 21V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3z','M7 8h10M7 12h6'],
    history: ['M3 10a9 9 0 1 1 2.5 8M3 4v6h6M12 7v5l3 2'],
    folder: ['M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    branch: ['M6 3v11a4 4 0 0 0 4 4h8M6 8h12','m15 5 3 3-3 3m0 4 3 3-3 3'],
    back: ['M19 12H5m5-5-5 5 5 5'], arrow: ['M5 12h14m-5-5 5 5-5 5'],
    check: ['m5 12 4 4L19 6'], restore: ['M4 10a8 8 0 1 1 1.5 7M4 4v6h6'],
    trash: ['M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7'],
    move: ['M12 3v18M3 12h18m-13-8 4-2 4 2m-8 16 4 2 4-2M4 8l-2 4 2 4m16-8 2 4-2 4'],
    info: ['M12 10v7M12 7h.01'], file: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 14h8M8 17h5'],
  }
  function Icon({ name, ...rest }) {
    const children = name === 'dots'
      ? [5,12,19].map(cx => h('circle', { key: cx, cx, cy: 12, r: 1, fill: 'currentColor', stroke: 'none' }))
      : name === 'grip'
        ? [7,15].flatMap(cx => [5,12,19].map(cy => h('circle', { key: `${cx}-${cy}`, cx, cy, r: 1, fill: 'currentColor', stroke: 'none' })))
        : (paths[name] || paths.info).map((d, index) => h('path', { key: index, d }))
    return h('svg', { className: 'tbIcon', viewBox: '0 0 24 24', 'aria-hidden': true, ...rest }, children)
  }
  const icon = name => h(Icon, { name })
  function StatusPicker({ task, menu, onOpen }) {
    const meta = STATUS_META[task.status] || STATUS_META.todo
    return h('span', { className: 'tbStatus' }, h('button', {
      type: 'button', className: 'tbStatusChip', 'data-status': task.status,
      'data-popover-trigger': 'status', 'data-menu-task': task.id,
      'aria-label': `修改${task.title}的状态：${meta.label}`, 'aria-haspopup': 'menu',
      'aria-expanded': menu?.id === task.id && menu?.type === 'status',
      title: `当前状态：${meta.label}（点击切换）`, onClick: event => onOpen(event, task, 'status'),
    }, h('span', { className: 'tbStatusDot' }), h('span', null, meta.label), h('span', { className: 'tbStatusCaret', 'aria-hidden': true }, '▾')))
  }
  function TaskActions({ task, menu, onOpen }) {
    return h('button', {
      type: 'button', className: 'tbMenuTrigger', 'aria-label': `更多操作：${task.title}`,
      'data-popover-trigger': 'actions', 'data-menu-task': task.id, 'aria-haspopup': 'menu',
      'aria-expanded': menu?.id === task.id && menu?.type === 'actions',
      onClick: event => onOpen(event, task, 'actions'), title: '打开、添加子任务、移动或删除',
    }, icon('dots'))
  }
  function Grip({ task, small, onDrag, onStatus, disabled }) {
    return h('button', {
      type: 'button', className: `tbGrip${small ? ' tbGripSm' : ''}`, disabled,
      'aria-label': `拖动${task.title}以改变状态`, title: '拖到列空白处改状态；拖到任务边缘排序；悬停 0.5 秒移入子级',
      onPointerDown: event => onDrag(event, task.id),
      onKeyDown: event => {
        const delta = ['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : ['ArrowRight','ArrowDown'].includes(event.key) ? 1 : 0
        if (!delta) return
        event.preventDefault()
        const next = STATUS_KEYS[STATUS_KEYS.indexOf(task.status) + delta]
        if (next) onStatus(task.id, next)
      },
    }, icon('grip'))
  }
  function AddChild({ parentId, value, onValue, onAdd, onCancel, pending, disabled }) {
    return h('form', { className: 'tbAddChild', 'data-parent-id': parentId, onSubmit: event => { event.preventDefault(); onAdd(parentId, value) } },
      h('input', { className: 'tbInput', 'aria-label': '添加子任务', placeholder: '子任务标题…', value,
        autoFocus: true, maxLength: 500, disabled: disabled || pending, onChange: event => onValue(parentId, event.target.value) }),
      h('button', { type: 'submit', className: 'tbBtn tbBtnPrimary', disabled: disabled || pending || !value.trim() }, pending ? '添加中…' : '添加'),
      onCancel ? h('button', { type: 'button', className: 'tbAddCancel', 'aria-label': '取消', title: '取消添加子任务', disabled: pending, onClick: () => onCancel(parentId) }, '取消') : null,
    )
  }
  function ChildRow({ task, depth = 1, ui }) {
    const children = task.children || []
    const expanded = ui.expanded.includes(task.id)
    const adding = ui.adding.includes(task.id)
    const drop = ui.drop?.id === task.id ? ui.drop.mode === 'child' ? ui.drop.pending ? ' tbDropPending' : ' tbDropInto' : ui.drop.mode === 'after' ? ' tbDropAfter' : ' tbDropBefore' : ''
    return h('div', { className: `tbChild${ui.dragging === task.id ? ' tbDragging' : ''}${drop}`, 'data-task-id': task.id,
      'data-depth': depth, style: { '--tb-indent': `${Math.min((depth - 1) * 8, 32)}px` } },
      h('div', { className: 'tbRow', 'data-status': task.status, 'data-drop-surface': true },
        h(Grip, { task, small: true, onDrag: ui.onDrag, onStatus: ui.onStatus, disabled: ui.disabled }),
        children.length ? h('button', { type: 'button', className: 'tbFold tbFoldSm', 'aria-expanded': expanded,
          'aria-label': `${expanded ? '折叠' : '展开'}${task.title}的 ${children.length} 个下级任务`,
          title: `${children.length} 个下级任务`, onClick: () => ui.onExpand(task.id) }, h('span', { className: 'tbFoldCaret' }, expanded ? '▾' : '▸'))
          : h('span', { className: 'tbFoldSpacer' }),
        h('button', { type: 'button', className: 'tbRowBtn', title: task.title, 'aria-label': `打开子任务：${task.title}`, onClick: () => ui.onTask(task.id) }, h('span', { className: 'tbRowTitle' }, task.title)),
        h(StatusPicker, { task, menu: ui.menu, onOpen: ui.onMenu }),
        h('button', { type: 'button', className: 'tbAddNode', 'aria-label': `添加子任务：${task.title}`, disabled: ui.disabled, onClick: () => ui.onShowAdd(task.id), title: '在这一层直接添加子任务' }, icon('plus')),
        h(TaskActions, { task, menu: ui.menu, onOpen: ui.onMenu }),
      ),
      adding && (expanded || !children.length) ? h(AddChild, { parentId: task.id, value: ui.drafts[task.id] || '', onValue: ui.onDraft, onAdd: ui.onAdd,
        onCancel: ui.onHideAdd, pending: ui.pendingAdds.includes(task.id), disabled: ui.disabled }) : null,
      children.length && expanded ? h('div', { className: 'tbGrandChildren' }, children.map(child => h(ChildRow, { key: child.id, task: child, depth: depth + 1, ui }))) : null,
    )
  }
  function TaskCard({ root, ui }) {
    const children = root.children || []
    const settled = children.filter(child => SETTLED.has(child.status)).length
    const expanded = ui.expanded.includes(root.id)
    const adding = ui.adding.includes(root.id)
    const drop = ui.drop?.id === root.id ? ui.drop.mode === 'child' ? ui.drop.pending ? ' tbDropPending' : ' tbDropInto' : ui.drop.mode === 'after' ? ' tbDropAfter' : ' tbDropBefore' : ''
    return h('div', { className: `tbCard tbItem${expanded ? ' tbItemExpanded' : ''}${ui.dragging === root.id ? ' tbDragging' : ''}${drop}`,
      'data-task-id': root.id, 'data-status': root.status },
      h('div', { className: 'tbCardHead', 'data-drop-surface': true },
        h(Grip, { task: root, onDrag: ui.onDrag, onStatus: ui.onStatus, disabled: ui.disabled }),
        h('button', { type: 'button', className: 'tbCardTitle', 'aria-label': `打开任务：${root.title}`, onClick: () => ui.onTask(root.id) }, root.title),
        h(StatusPicker, { task: root, menu: ui.menu, onOpen: ui.onMenu }),
        h(TaskActions, { task: root, menu: ui.menu, onOpen: ui.onMenu }),
      ),
      h('div', { className: 'tbTaskMeta' },
        children.length ? h('button', { className: 'tbFold', type: 'button', 'aria-expanded': expanded,
          'aria-label': `${expanded ? '折叠' : '展开'}${root.title}的 ${children.length} 个子任务`, onClick: () => ui.onExpand(root.id) },
          h('span', { className: 'tbFoldCaret' }, expanded ? '▾' : '▸'), `${children.length} 个子任务`, settled ? h('span', { className: 'tbFoldDone' }, ` · ${settled} 已结算`) : null)
          : h('button', { type: 'button', className: 'tbInlineAdd', 'aria-label': `添加子任务：${root.title}`, onClick: () => ui.onShowAdd(root.id), disabled: ui.disabled }, icon('plus'), '添加子任务'),
        root.domain?.path ? h('span', { className: 'tbMetaPart tbName', title: root.domain.path }, icon('folder'), root.domain.path.split(/[\\/]/).filter(Boolean).pop()) : null,
        SETTLED.has(root.status) ? h('span', null, visibleInBoard(root) ? '今天结算' : '往日结算') : null,
      ),
      children.length && expanded ? h('div', { className: 'tbChildren' }, children.map(child => h(ChildRow, { key: child.id, task: child, ui }))) : null,
      adding && expanded ? h(AddChild, { parentId: root.id, value: ui.drafts[root.id] || '', onValue: ui.onDraft, onAdd: ui.onAdd,
        onCancel: ui.onHideAdd, pending: ui.pendingAdds.includes(root.id), disabled: ui.disabled }) : null,
      expanded && children.length ? h('div', { className: 'tbItemFoot' },
        h('span', null, `${children.length} 个子任务 · ${settled} 已结算`),
        children.length ? h('span', { className: 'tbProgress', 'aria-hidden': true }, h('span', { style: { width: `${settled / children.length * 100}%` } })) : null,
        h('span', { className: 'tbGrow' }),
        !adding ? h('button', { type: 'button', className: 'tbInlineAdd', 'aria-label': `添加子任务：${root.title}`, disabled: ui.disabled, onClick: () => ui.onShowAdd(root.id) }, icon('plus'), '添加子任务') : null,
      ) : null,
    )
  }

  return function TaskBoard({ service, aiService, entry, conversation, active = true }) {
    ensureStyle()
    const [tasks, setTasks] = React.useState([])
    const tasksRef = React.useRef([]), persistedRef = React.useRef([])
    const [hydrated, setHydrated] = React.useState(false), hydratedRef = React.useRef(false)
    const [loading, setLoading] = React.useState(true), [error, setError] = React.useState('')
    const [loadKey, setLoadKey] = React.useState(0), [pending, setPending] = React.useState(0)
    const saveTail = React.useRef(Promise.resolve()), latestSave = React.useRef(Promise.resolve(true)), revision = React.useRef(0)
    const mounted = React.useRef(true)
    const [view, setView] = React.useState({ name: 'board' }), viewRef = React.useRef(view)
    viewRef.current = view
    const [showHistory, setShowHistory] = React.useState(false), [chatOpen, setChatOpen] = React.useState(false)
    const [expanded, setExpanded] = React.useState([]), [adding, setAdding] = React.useState([])
    const [drafts, setDrafts] = React.useState({}), draftsRef = React.useRef(drafts)
    draftsRef.current = drafts
    const [pendingAdds, setPendingAdds] = React.useState([])
    const [menu, setMenu] = React.useState(null), [dialog, setDialog] = React.useState(null)
    const [newTask, setNewTask] = React.useState({ title: '', parentId: '', status: 'todo' })
    const [moveParent, setMoveParent] = React.useState(''), [dialogBusy, setDialogBusy] = React.useState(false)
    const [detailDraft, setDetailDraft] = React.useState({ id: null, title: '', note: '' }), detailRef = React.useRef(detailDraft)
    detailRef.current = detailDraft
    const rootRef = React.useRef(null), barRef = React.useRef(null), popoverRef = React.useRef(null), dialogRef = React.useRef(null)
    const returnFocus = React.useRef(null), fileGuardRef = React.useRef(null), dragCleanup = React.useRef(null)
    const [dragging, setDragging] = React.useState(null), [dragStatus, setDragStatus] = React.useState(null), [drop, setDrop] = React.useState(null)
    const childPendingRef = React.useRef(new Set()), [chatBusy, setChatBusy] = React.useState(false)
    const planGuardRef = React.useRef(null), ganttState = React.useRef(new Map()), calendarState = React.useRef({})
    const [planAutoOpen, setPlanAutoOpen] = React.useState(false), [aiScope, setAIScope] = React.useState(undefined)
    const [aiImportNonce, setAIImportNonce] = React.useState(0)

    React.useEffect(() => {
      mounted.current = true
      return () => { mounted.current = false; dragCleanup.current?.(); }
    }, [])
    React.useEffect(() => {
      let alive = true
      hydratedRef.current = false; setHydrated(false); setLoading(true)
      loadTasks().then(list => {
        if (!alive) return
        tasksRef.current = list; persistedRef.current = list; setTasks(list)
        hydratedRef.current = true; setHydrated(true); setError('')
      }).catch(problem => { if (alive) setError(problem.message) }).finally(() => { if (alive) setLoading(false) })
      return () => { alive = false }
    }, [loadKey])
    React.useEffect(() => {
      const bar = barRef.current, root = rootRef.current
      if (!bar || !root) return
      const sync = () => root.style.setProperty('--tb-bar-h', `${Math.ceil(bar.getBoundingClientRect().height)}px`)
      sync()
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(sync); observer.observe(bar)
      return () => observer.disconnect()
    }, [view.name])
    React.useEffect(() => { if (!active) { dragCleanup.current?.(); setMenu(null); } }, [active])
    React.useEffect(() => {
      if (!menu || !popoverRef.current || !rootRef.current) return
      const bounds = rootRef.current.getBoundingClientRect(), size = popoverRef.current.getBoundingClientRect()
      const height = Math.min(size.height, bounds.height - 16), width = size.width
      const up = bounds.height - menu.anchorBottom < height + 8 && menu.anchorTop > bounds.height - menu.anchorBottom
      const top = Math.max(8, Math.min(up ? menu.anchorTop - height - 6 : menu.anchorBottom + 6, bounds.height - height - 8))
      const left = Math.max(8, Math.min(menu.anchorRight - width, bounds.width - width - 8))
      setMenu(value => value?.id === menu.id && value?.type === menu.type ? { ...value, up, top, left } : value)
    }, [menu?.id, menu?.type])
    React.useEffect(() => {
      if (!menu) return
      popoverRef.current?.querySelector('button')?.focus()
      const outside = event => {
        if (!popoverRef.current?.contains(event.target) && !event.target.closest?.('[data-popover-trigger]')) setMenu(null)
      }
      const close = () => setMenu(null)
      document.addEventListener('pointerdown', outside)
      rootRef.current?.addEventListener('scroll', close, true)
      window.addEventListener('resize', close)
      return () => { document.removeEventListener('pointerdown', outside); rootRef.current?.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
    }, [menu])
    React.useEffect(() => {
      if (dialog) dialogRef.current?.querySelector('input,select,textarea,button')?.focus()
      const keys = event => {
        if ((aiScope !== undefined || event.target.closest?.('[data-calendar-dialog]')) && !event.target.closest?.('.tbChat')) return
        if (event.key === 'Escape') {
          if (dragCleanup.current) { dragCleanup.current(); event.preventDefault(); return }
          if (dialog && !dialogBusy) { event.preventDefault(); closeDialog('cancel'); return }
          if (menu) { event.preventDefault(); closeMenu(true); return }
          if (chatOpen) setChatOpen(false)
        }
        const container = dialog ? dialogRef.current : menu ? popoverRef.current : null
        if (!container) return
        const controls = [...container.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
        const index = controls.indexOf(document.activeElement)
        if (event.key === 'Tab' && controls.length) {
          const next = event.shiftKey ? index <= 0 ? controls.length - 1 : index - 1 : index >= controls.length - 1 ? 0 : index + 1
          if (dialog || index <= 0 && event.shiftKey || index === controls.length - 1 && !event.shiftKey) {
            event.preventDefault(); controls[next]?.focus()
          }
        }
        if (menu && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length
          controls[next]?.focus()
        }
      }
      document.addEventListener('keydown', keys)
      return () => document.removeEventListener('keydown', keys)
    }, [dialog, dialogBusy, menu, chatOpen, aiScope])

    // Ordered functional snapshots, immediate live ref update, and revision-aware rollback.
    const commit = React.useCallback(compute => {
      if (!hydratedRef.current) { setError('任务尚未成功载入，禁止写入。请重新加载后再试。'); return Promise.resolve(false) }
      let next
      try {
        next = typeof compute === 'function' ? compute(tasksRef.current) : compute
        if (!Array.isArray(next)) return Promise.resolve(false)
        if (next === tasksRef.current) return latestSave.current
        const conflicts = validateScheduleState(next)
        if (conflicts.length) throw new Error(conflicts.map(issue => issue.message).join('\n'))
      } catch (problem) {
        setError(problem.message || '任务或计划变更无效，原数据未修改。')
        return Promise.resolve(false)
      }
      const ticket = ++revision.current
      tasksRef.current = next; setTasks(next); setPending(value => value + 1)
      const run = saveTail.current.then(async () => {
        try {
          const data = await saveTasks(next)
          persistedRef.current = Array.isArray(data?.tasks) ? data.tasks : next
          if (mounted.current && revision.current === ticket) setError('')
          return true
        } catch (problem) {
          if (mounted.current) {
            if (revision.current === ticket) { tasksRef.current = persistedRef.current; setTasks(persistedRef.current) }
            setError(problem.message || '保存失败，请重试。')
          }
          return false
        } finally { if (mounted.current) setPending(value => Math.max(0, value - 1)) }
      })
      saveTail.current = run.then(() => {})
      latestSave.current = run
      return run
    }, [])
    const patchTask = (id, changes) => commit(list => list.map(task => task.id === id ? { ...task, ...changes, updatedAt: new Date().toISOString() } : task))
    const setStatus = (id, status) => commit(list => applyStatus(list, id, status))
    const tree = React.useMemo(() => buildTree(tasks), [tasks])
    const current = view.name === 'task' ? tasks.find(task => task.id === view.id) : null
    const parent = current?.parentId ? tasks.find(task => task.id === current.parentId) : null
    const roots = tree.filter(task => showHistory || visibleInBoard(task))
    const disabled = !hydrated

    const flushDetail = async () => {
      // Wait for an existing blur save, then re-check current drafts against acknowledged state.
      await latestSave.current
      const draft = detailRef.current
      if (viewRef.current.name !== 'task' || draft.id !== viewRef.current.id) return true
      const task = tasksRef.current.find(item => item.id === draft.id)
      if (!task) return true
      const title = draft.title.trim()
      if (!title) { setError('任务标题不能为空。'); return false }
      if (title !== task.title || draft.note !== (task.note || '')) return patchTask(task.id, { title, note: draft.note })
      return true
    }
    const canLeave = async () => await flushDetail() && (!planGuardRef.current || await planGuardRef.current()) && (!fileGuardRef.current || await fileGuardRef.current())
    const openTask = async (id, options = {}) => {
      if (!await canLeave()) return false
      dragCleanup.current?.(); setMenu(null)
      const task = tasksRef.current.find(item => item.id === id)
      if (!task) return false
      const from = viewRef.current
      const returnTo = ['gantt','calendar'].includes(from.name) ? { name: from.name, scopeId: from.scopeId || null } : from.returnTo || null
      const draft = { id, title: task.title, note: task.note || '' }
      detailRef.current = draft; setDetailDraft(draft); setPlanAutoOpen(Boolean(options.editPlan)); setView({ name: 'task', id, returnTo })
      return true
    }
    const openGantt = async (scopeId = null) => {
      if (!await canLeave()) return false
      dragCleanup.current?.(); setMenu(null); setView({ name: 'gantt', scopeId: scopeId || null })
      return true
    }
    const openCalendar = async (scopeId = null) => {
      if (!await canLeave()) return false
      dragCleanup.current?.(); setMenu(null); setView({ name: 'calendar', scopeId: scopeId || null })
      return true
    }
    const openAI = async (scopeId = null, importReply = false) => {
      if (!await canLeave()) return
      dragCleanup.current?.(); setMenu(null); returnFocus.current = document.activeElement
      setAIImportNonce(value => importReply ? value + 1 : 0); setAIScope(scopeId || null)
    }
    const goBoard = async () => {
      if (!await canLeave()) return
      dragCleanup.current?.(); setMenu(null); setView({ name: 'board' })
    }
    const showAdd = id => {
      setExpanded(list => list.includes(id) ? list : [...list, id])
      setAdding(list => list.includes(id) ? list : [...list, id]); closeMenu()
    }
    const hideAdd = id => setAdding(list => list.filter(item => item !== id))
    const toggleExpanded = id => setExpanded(list => list.includes(id) ? list.filter(item => item !== id) : [...list, id])
    const addChild = async (parentId, value) => {
      const title = value.trim()
      if (!title || childPendingRef.current.has(parentId)) return
      if (!tasksRef.current.some(task => task.id === parentId)) { setError('父任务已不存在。'); return }
      childPendingRef.current.add(parentId); setPendingAdds([...childPendingRef.current])
      const success = await commit(list => appendTask(list, { id: newId(), title, note: '', status: 'todo', parentId, domain: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), settledAt: null }))
      if (success) {
        setDrafts(list => (list[parentId] || '') === value ? { ...list, [parentId]: '' } : list)
        setExpanded(list => list.includes(parentId) ? list : [...list, parentId])
      }
      childPendingRef.current.delete(parentId); setPendingAdds([...childPendingRef.current])
    }
    const closeMenu = focus => {
      const source = returnFocus.current, previous = menu
      setMenu(null)
      if (!focus) return
      if (source?.isConnected) source.focus()
      // A status change may move a root card between columns and replace its DOM.
      requestAnimationFrame(() => {
        if (!rootRef.current || !previous) return
        const activeElement = document.activeElement
        if (activeElement?.isConnected && activeElement !== document.body && activeElement !== source) return
        const replacement = [...rootRef.current.querySelectorAll('[data-popover-trigger]')].find(button =>
          button.dataset.menuTask === previous.id && button.dataset.popoverTrigger === previous.type)
        replacement?.focus()
      })
    }
    const openMenu = (event, task, type) => {
      if (menu?.id === task.id && menu.type === type) { closeMenu(true); return }
      returnFocus.current = event.currentTarget
      const rect = event.currentTarget.getBoundingClientRect(), root = rootRef.current.getBoundingClientRect()
      const width = type === 'status' ? 154 : 190, height = type === 'status' ? STATUS_KEYS.length * 34 + 12 : 232
      const up = root.bottom - rect.bottom < height + 10 && rect.top - root.top > height + 10
      setMenu({ id: task.id, type, up, anchorTop: rect.top - root.top, anchorBottom: rect.bottom - root.top,
        anchorRight: rect.right - root.left, left: Math.max(8, Math.min(rect.right - root.left - width, root.width - width - 8)),
        top: Math.max(8, Math.min(up ? rect.top - root.top - height - 6 : rect.bottom - root.top + 6, root.height - height - 8)),
        maxHeight: Math.max(80, root.height - 16) })
    }
    const closeDialog = choice => {
      if (dialogBusy) return
      dialog?.resolve?.(choice || 'cancel'); setDialog(null)
      if (returnFocus.current?.isConnected) returnFocus.current.focus()
    }
    const requestUnsaved = (kind = 'file') => new Promise(resolve => { setMenu(null); setDialog({ type: 'unsaved', kind, resolve }) })
    const registerFileGuard = React.useCallback(guard => { fileGuardRef.current = guard; return () => { if (fileGuardRef.current === guard) fileGuardRef.current = null } }, [])
    const registerPlanGuard = React.useCallback(guard => { planGuardRef.current = guard; return () => { if (planGuardRef.current === guard) planGuardRef.current = null } }, [])
    const startCreate = (status = 'todo') => {
      returnFocus.current = document.activeElement
      setNewTask({ title: '', parentId: '', status }); setDialog({ type: 'create' }); closeMenu()
    }
    const submitCreate = async event => {
      event.preventDefault(); if (dialogBusy || !newTask.title.trim()) return
      setDialogBusy(true)
      const now = new Date().toISOString(), parentId = newTask.parentId || null, createdId = newId()
      const success = await commit(list => appendTask(list, { id: createdId, title: newTask.title.trim(), note: '', status: newTask.status,
        parentId, domain: null, createdAt: now, updatedAt: now, settledAt: SETTLED.has(newTask.status) ? now : null }))
      if (success) {
        setDialog(null)
        if (parentId) setExpanded(list => list.includes(parentId) ? list : [...list, parentId])
        requestAnimationFrame(() => {
          if (viewRef.current.name !== 'board') return
          const item = [...(rootRef.current?.querySelectorAll('.tbItem,.tbChild') || [])].find(element => element.dataset.taskId === createdId)
          item?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          item?.querySelector(':scope > .tbCardHead > .tbCardTitle,:scope > .tbRow > .tbRowBtn')?.focus({ preventScroll: true })
        })
      }
      setDialogBusy(false)
    }
    const startDelete = task => { closeMenu(); setDialog({ type: 'delete', id: task.id }) }
    const startMove = task => { closeMenu(); setMoveParent(task.parentId || ''); setDialog({ type: 'move', id: task.id }) }
    const submitMove = async event => {
      event.preventDefault(); if (dialogBusy) return
      setDialogBusy(true)
      const moved = await commit(list => applyReparent(list, dialog.id, moveParent || null))
      if (moved) { if (moveParent) setExpanded(list => list.includes(moveParent) ? list : [...list, moveParent]); setDialog(null) }
      setDialogBusy(false)
    }
    const confirmDelete = async () => {
      if (dialogBusy) return
      const id = dialog.id
      if (!await canLeave()) return
      setDialogBusy(true)
      const removed = subtreeIds(tasksRef.current, id)
      const success = await commit(list => removeSubtree(list, id))
      if (success) {
        setDialog(null); setExpanded(list => list.filter(item => !removed.has(item))); setAdding(list => list.filter(item => !removed.has(item)))
        if (removed.has(viewRef.current.id)) setView({ name: 'board' })
      }
      setDialogBusy(false)
    }

    const beginDrag = (event, id) => {
      if (disabled || event.button !== 0 || !active) return
      event.preventDefault(); closeMenu(); dragCleanup.current?.()
      const start = { x: event.clientX, y: event.clientY }, pointerId = event.pointerId
      let engaged = false, spot = null, status = null, hover = null, timer = null, finished = false
      let scrollFrame = null, lastPoint = start
      const viewport = rootRef.current?.querySelector('.tbBoardViewport')
      const forbidden = subtreeIds(tasksRef.current, id)
      const clearHover = () => { if (timer !== null) clearTimeout(timer); timer = null; hover = null }
      const hit = (x, y) => {
        const root = rootRef.current
        const element = document.elementFromPoint(x, y)
        if (!element || !root?.contains(element) || element.closest('.tbChat,.tbPopover,.tbDialogShade')) return { spot: null, status: null }
        const group = element.closest('.tbGroup[data-status]')
        let card = null
        for (const node of document.elementsFromPoint(x, y)) {
          if (!root.contains(node)) continue
          const candidate = node.closest('.tbChild[data-task-id],.tbItem[data-task-id]')
          if (candidate && (!card || card.contains(candidate))) card = candidate
        }
        if (!card) return { spot: null, status: group?.dataset.status || null }
        const targetId = card.dataset.taskId
        if (forbidden.has(targetId)) return { spot: null, status: null }
        const surface = card.querySelector(':scope > [data-drop-surface]') || card
        const bounds = surface.getBoundingClientRect(), ratio = (y - bounds.top) / Math.max(1, bounds.height)
        return { spot: { id: targetId, mode: ratio < .25 ? 'before' : ratio > .75 ? 'after' : 'child', pending: true }, status: group?.dataset.status || null }
      }
      const paint = (x, y) => {
        const found = hit(x, y); status = found.status
        setDragStatus(status)
        if (found.spot?.mode === 'child') {
          const moved = !hover || hover.id !== found.spot.id || Math.hypot(x - hover.x, y - hover.y) > 8
          if (moved) {
            clearHover(); hover = { id: found.spot.id, x, y }; spot = found.spot; setDrop(spot)
            timer = setTimeout(() => { timer = null; if (finished || !hover) return; spot = { ...spot, pending: false }; setDrop(spot) }, 500)
          }
        } else { clearHover(); spot = found.spot; setDrop(spot) }
      }
      const scrollAtEdge = () => {
        scrollFrame = null
        if (finished || !engaged || !viewport?.isConnected) return
        const bounds = viewport.getBoundingClientRect(), { x, y } = lastPoint
        if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return
        const edge = Math.min(36, bounds.width / 5)
        const direction = x < bounds.left + edge ? -1 : x > bounds.right - edge ? 1 : 0
        if (!direction) return
        const distance = direction < 0 ? x - bounds.left : bounds.right - x
        const step = direction * Math.ceil(4 + 12 * (1 - Math.max(0, distance) / edge))
        const before = viewport.scrollLeft
        viewport.scrollLeft += step
        if (viewport.scrollLeft === before) return
        // Moving columns are not a stable 500ms reparent target, even with a still pointer.
        clearHover(); paint(x, y)
        scrollFrame = requestAnimationFrame(scrollAtEdge)
      }
      const cleanup = () => {
        finished = true; clearHover()
        if (scrollFrame !== null) cancelAnimationFrame(scrollFrame)
        scrollFrame = null
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel)
        dragCleanup.current = null; setDragging(null); setDragStatus(null); setDrop(null)
      }
      const move = event => {
        if (event.pointerId !== pointerId) return
        if (!engaged && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
        if (!engaged) { engaged = true; setDragging(id) }
        lastPoint = { x: event.clientX, y: event.clientY }
        paint(lastPoint.x, lastPoint.y)
        if (scrollFrame === null) scrollFrame = requestAnimationFrame(scrollAtEdge)
      }
      const finish = event => {
        if (event.pointerId !== pointerId) return
        if (engaged) {
          const release = hit(event.clientX, event.clientY)
          const selected = release.spot
          const confirmed = selected?.mode === 'child' && spot?.id === selected.id && spot.mode === 'child' && !spot.pending
          const column = release.status
          commit(list => {
            if (confirmed) {
              const next = applyReparent(list, id, selected.id)
              setExpanded(items => items.includes(selected.id) ? items : [...items, selected.id])
              return next
            }
            // A pending center drop is a true no-op, never an implicit reorder.
            if (selected?.mode === 'child') return list
            if (selected) {
              const dragged = list.find(task => task.id === id)
              let next = !dragged?.parentId && column ? applyStatus(list, id, column) : list
              return applyReorder(next, id, selected.id, selected.mode === 'after')
            }
            return column ? applyStatus(list, id, column) : list
          })
        }
        cleanup()
      }
      const cancel = () => cleanup()
      dragCleanup.current = cancel
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', cancel); window.addEventListener('blur', cancel)
    }

    const ui = {
      expanded, adding, drafts, pendingAdds, disabled, menu, drop, dragging,
      onTask: openTask, onStatus: setStatus, onDrag: beginDrag, onMenu: openMenu, onExpand: toggleExpanded,
      onShowAdd: showAdd, onHideAdd: hideAdd, onAdd: addChild,
      onDraft: (id, value) => { const next = { ...draftsRef.current, [id]: value }; draftsRef.current = next; setDrafts(next) },
    }
    const renderPopover = () => {
      if (!menu) return null
      const task = tasks.find(item => item.id === menu.id)
      if (!task) return null
      const attrs = { ref: popoverRef, role: 'menu', 'aria-label': menu.type === 'status' ? '选择状态' : '任务操作',
        className: `tbPopover ${menu.type === 'status' ? `tbStatusMenu${menu.up ? ' tbStatusMenuUp' : ''}` : 'tbActionMenu'}`,
        style: { left: menu.left, top: menu.top, maxHeight: menu.maxHeight } }
      if (menu.type === 'status') return h('div', attrs, STATUS_KEYS.map(key => h('button', {
        key, type: 'button', className: `tbStatusItem${task.status === key ? ' tbStatusItemActive' : ''}`, role: 'menuitemradio',
        'aria-checked': task.status === key, disabled, onClick: () => { setStatus(task.id, key); closeMenu(true) },
      }, h('span', { className: 'tbStatusDot', style: { background: STATUS_META[key].color } }), STATUS_META[key].label)))
      const item = (name, glyph, action, danger = false) => h('button', { key: name, type: 'button', role: 'menuitem', disabled,
        className: `tbMenuItem${danger ? ' tbDanger' : ''}`, onClick: action }, icon(glyph), name)
      return h('div', attrs,
        item('打开任务', 'arrow', () => { closeMenu(); openTask(task.id) }),
        item('添加子任务', 'plus', () => showAdd(task.id)),
        item(SETTLED.has(task.status) ? '恢复为待办' : '标记完成', SETTLED.has(task.status) ? 'restore' : 'check', () => { setStatus(task.id, SETTLED.has(task.status) ? 'todo' : 'done'); closeMenu(true) }),
        item('移动到…', 'move', () => startMove(task)), h('div', { className: 'tbMenuRule', role: 'separator' }),
        item('删除任务', 'trash', () => startDelete(task), true),
      )
    }
    const renderDialog = () => {
      if (!dialog) return null
      const task = tasks.find(item => item.id === dialog.id)
      const names = { create: '新建任务', move: '移动任务', delete: '删除任务', unsaved: dialog.kind === 'plan' ? '未保存的计划修改' : '未保存的文件修改' }
      const actions = children => h('div', { className: 'tbDialogActions' }, children)
      let body
      if (dialog.type === 'create') body = h('form', { className: 'tbDialog', ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-label': names.create, onSubmit: submitCreate },
        h('h2', { className: 'tbDialogTitle' }, '新建任务'),
        h('label', null, '任务标题', h('input', { className: 'tbInput', 'aria-label': '新任务标题', value: newTask.title, maxLength: 500,
          disabled: dialogBusy, onChange: event => setNewTask(value => ({ ...value, title: event.target.value })) })),
        h('label', null, '归属', h('select', { className: 'tbSelect', 'aria-label': '作为子任务归属于', value: newTask.parentId, disabled: dialogBusy,
          onChange: event => setNewTask(value => ({ ...value, parentId: event.target.value })) }, h('option', { value: '' }, '作为一级任务'),
          flattenTree(tree).map(node => h('option', { key: node.id, value: node.id }, `${'　'.repeat(Math.min(node.depth, 6))}↳ ${node.title}`)))),
        h('label', null, '状态', h('select', { className: 'tbSelect', 'aria-label': '新任务状态', value: newTask.status, disabled: dialogBusy,
          onChange: event => setNewTask(value => ({ ...value, status: event.target.value })) }, STATUS_KEYS.map(key => h('option', { key, value: key }, STATUS_META[key].label)))),
        actions([h('button', { key: 'cancel', type: 'button', className: 'tbBtn', disabled: dialogBusy, onClick: () => closeDialog() }, '取消'),
          h('button', { key: 'submit', className: 'tbBtn tbBtnPrimary', type: 'submit', disabled: disabled || dialogBusy || !newTask.title.trim() }, dialogBusy ? '创建中…' : '创建')]),
      )
      else if (dialog.type === 'move') {
        const forbidden = subtreeIds(tasks, dialog.id)
        body = h('form', { className: 'tbDialog', ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-label': names.move, onSubmit: submitMove },
          h('h2', { className: 'tbDialogTitle' }, '移动任务'), h('p', { className: 'tbDialogText' }, `移动「${task?.title || ''}」及其全部子任务，状态和工作域保持不变。`),
          h('label', null, '新的父级', h('select', { className: 'tbSelect', 'aria-label': '新父级任务', value: moveParent, disabled: dialogBusy, onChange: event => setMoveParent(event.target.value) },
            h('option', { value: '' }, '一级任务（无父级）'), flattenTree(tree).filter(node => !forbidden.has(node.id)).map(node => h('option', { key: node.id, value: node.id }, `${'　'.repeat(Math.min(node.depth, 6))}${node.title}`)))),
          actions([h('button', { key: 'cancel', type: 'button', className: 'tbBtn', disabled: dialogBusy, onClick: () => closeDialog() }, '取消'),
            h('button', { key: 'move', type: 'submit', className: 'tbBtn tbBtnPrimary', disabled: disabled || dialogBusy }, dialogBusy ? '移动中…' : '移动')]),
        )
      } else if (dialog.type === 'delete') body = h('section', { className: 'tbDialog', ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-label': names.delete },
        h('h2', { className: 'tbDialogTitle' }, '删除任务'),
        h('p', { className: 'tbDialogText' }, `确认删除「${task?.title || ''}」及其 ${Math.max(0, subtreeIds(tasks, dialog.id).size - 1)} 个下级任务？`),
        h('p', { className: 'tbHelp' }, '此操作不可撤销，仅删除任务记录，不删除任何工作域文件或文件夹。'),
        actions([h('button', { key: 'cancel', type: 'button', className: 'tbBtn', disabled: dialogBusy, onClick: () => closeDialog() }, '取消'),
          h('button', { key: 'delete', type: 'button', className: 'tbBtn tbDanger', disabled: disabled || dialogBusy, onClick: confirmDelete }, dialogBusy ? '删除中…' : '删除')]),
      )
      else body = h('section', { className: 'tbDialog', ref: dialogRef, role: 'dialog', 'aria-modal': true, 'aria-label': names.unsaved },
        h('h2', { className: 'tbDialogTitle' }, names.unsaved), h('p', { className: 'tbDialogText' }, dialog.kind === 'plan'
          ? '计划日期或负责人有未保存的修改。继续之前，可以先保存，或者明确放弃修改。'
          : '当前文件有未保存的内容。继续之前，可以先保存，或者明确放弃修改。'),
        actions([h('button', { key: 'cancel', type: 'button', className: 'tbBtn', onClick: () => closeDialog('cancel') }, '取消'),
          h('button', { key: 'discard', type: 'button', className: 'tbBtn tbGhost', onClick: () => closeDialog('discard') }, '放弃修改'),
          h('button', { key: 'save', type: 'button', className: 'tbBtn tbBtnPrimary', onClick: () => closeDialog('save') }, '保存并继续')]),
      )
      body = React.cloneElement(body, null, ...React.Children.toArray(body.props.children),
        error && dialog.type !== 'unsaved' ? h('div', { className: 'tbErr', role: 'alert' }, error) : null)
      return h('div', { className: 'tbDialogShade', onPointerDown: event => { if (event.target === event.currentTarget) closeDialog() } }, body)
    }
    const renderBoard = () => h('div', { className: 'tbScroll tbBoardScroll' },
      h('div', { className: 'tbViewBar' }, h('span', { className: 'tbViewLabel' }, icon('grid'), '任务总览'),
        h('span', null, `${roots.length} 个一级任务 · 子任务不重复计数`),
        h('span', { className: 'tbBoardHint' }, '横向滚动查看全部列'), h('span', { className: 'tbGrow' }),
        showHistory ? h('span', null, '包含往日结算') : null),
      error && !dialog ? h('div', { className: 'tbErr', role: 'alert' }, error) : null,
      !loading && !hydrated ? h('button', { className: 'tbBtn', type: 'button', onClick: () => setLoadKey(value => value + 1) }, '重新加载') : null,
      loading ? h('div', { className: 'tbEmpty' }, '正在读取任务…') : null,
      h('div', { className: 'tbBoardViewport', role: 'region', 'aria-label': '任务看板（可横向滚动）', tabIndex: 0,
        onKeyDown: event => {
          if (event.target !== event.currentTarget) return
          const viewport = event.currentTarget
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault(); viewport.scrollLeft += (event.key === 'ArrowRight' ? 1 : -1) * 266
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault(); viewport.scrollLeft = event.key === 'Home' ? 0 : viewport.scrollWidth
          }
        } }, h('div', { className: 'tbGroups' }, STATUS_KEYS.map(key => {
        const groupTasks = roots.filter(task => task.status === key)
        return h('section', { key, className: `tbGroup${dragStatus === key ? ' tbGroupOver' : ''}`, 'data-status': key, 'aria-label': `${STATUS_META[key].label}任务` },
          h('header', { className: 'tbGroupHead' }, h('span', { className: 'tbGroupDot', 'data-status': key }),
            h('span', { className: 'tbGroupTitle' }, STATUS_META[key].label), h('span', { className: 'tbGroupCount' }, String(groupTasks.length)),
            h('span', { className: 'tbGroupCaption' }, SETTLED.has(key) ? showHistory ? '历史' : '今天' : key === 'ongoing' ? '长期' : ''),
            h('button', { type: 'button', className: 'tbGroupHeadAdd', disabled, 'aria-label': `添加${STATUS_META[key].label}任务`, onClick: () => startCreate(key) }, icon('plus'))),
          h('div', { className: 'tbGroupBody' }, groupTasks.length ? groupTasks.map(root => h(TaskCard, { key: root.id, root, ui })) : h('div', { className: 'tbGroupEmpty' }, loading ? '正在读取…' : '暂无任务')),
          h('button', { type: 'button', className: 'tbGroupAdd', disabled, 'aria-label': `在${STATUS_META[key].label}列添加任务`, onClick: () => startCreate(key) }, icon('plus'), '添加任务'),
          SETTLED.has(key) && !showHistory && groupTasks.length ? h('div', { className: 'tbSettlementHint' }, '结算任务只在当天保留。次日从总览隐去，可通过「查询历史」找回。') : null,
        )
      }))),
    )
    const renderTask = () => {
      if (!current) return h('div', { className: 'tbScroll' }, h('div', { className: 'tbEmpty' }, '该任务已不存在。'),
        h('button', { className: 'tbBtn', type: 'button', onClick: goBoard }, '返回任务总览'))
      const children = findNode(tree, current.id)?.children || []
      const completed = children.filter(task => SETTLED.has(task.status)).length
      return h('div', { className: 'tbScroll' },
        h('section', { className: 'tbDetailHeader' },
          h('nav', { className: 'tbBreadcrumb', 'aria-label': '任务导航' }, h('button', { className: 'tbBack', type: 'button', onClick: goBoard }, '← 总览'),
            view.returnTo?.name === 'gantt' ? h('button', { className: 'tbBack', type: 'button', onClick: () => openGantt(view.returnTo.scopeId) }, '← 返回甘特图') : null,
            view.returnTo?.name === 'calendar' ? h('button', { className: 'tbBack', type: 'button', onClick: () => openCalendar(view.returnTo.scopeId) }, '← 返回日历') : null,
            parent ? h('button', { className: 'tbBack', type: 'button', title: `返回父级任务：${parent.title}`, onClick: () => openTask(parent.id) }, '↑ 父级') : null),
          h('div', { className: 'tbDetailTitleLine' }, h('input', { className: 'tbDetailTitle', 'aria-label': '任务标题', value: detailDraft.title,
            maxLength: 500, disabled, onChange: event => { const next = { ...detailRef.current, title: event.target.value }; detailRef.current = next; setDetailDraft(next) },
            onBlur: flushDetail, onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } } }),
            h(StatusPicker, { task: current, menu, onOpen: openMenu }), h(TaskActions, { task: current, menu, onOpen: openMenu })),
          h('div', { className: 'tbDetailMeta' }, h('span', null, parent ? `父级：${parent.title}` : '一级任务'),
            h('span', null, `${children.length} 个子任务 · ${completed} 已结算`), h('span', null, current.domain?.path ? '工作域已绑定' : '工作域未绑定'))),
        error && !dialog ? h('div', { className: 'tbErr', role: 'alert' }, error) : null,
        h('div', { className: 'tbDetailGrid' },
          h('div', { className: 'tbDetailColumn' },
            h(ScheduleEditor, { key: current.id, task: current, tasks, commit, onGantt: openGantt, onCalendar: openCalendar, disabled,
              registerGuard: registerPlanGuard, requestUnsaved, openOnMount: planAutoOpen }),
            h('section', { className: 'tbSection' }, h('header', { className: 'tbSectionHeader' }, h('h2', null, '任务笔记'), h('span', { className: 'tbGrow' }), h('span', { className: 'tbSub' }, '离开输入后保存')),
              h('div', { className: 'tbCard' }, h('textarea', { className: 'tbArea tbNote', 'aria-label': '任务笔记', placeholder: '记录目标、进展与待办事项…', rows: 4,
                value: detailDraft.note, maxLength: 20000, disabled, onChange: event => { const next = { ...detailRef.current, note: event.target.value }; detailRef.current = next; setDetailDraft(next) }, onBlur: flushDetail }))),
            h('section', { className: 'tbSection' }, h('header', { className: 'tbSectionHeader' }, h('h2', null, '子任务'), h('span', { className: 'tbSub' }, String(children.length))),
              h('div', { className: 'tbCard tbDetailTree' }, children.map(child => h(ChildRow, { key: child.id, task: child, ui })),
                h(AddChild, { parentId: current.id, value: drafts[current.id] || '', onValue: ui.onDraft, onAdd: addChild,
                  pending: pendingAdds.includes(current.id), disabled })), h('p', { className: 'tbHelp' }, '每一级任务都能继续创建子级，创建后立即显示在当前页面。'))),
          h('div', { className: 'tbDetailColumn' }, h('section', { className: 'tbSection' },
            h('header', { className: 'tbSectionHeader' }, h('h2', null, '工作域')),
            h(DomainPanel, { key: current.id, service, task: current, commit, Icon, disabled,
              registerGuard: registerFileGuard, requestUnsaved }),
            h('p', { className: 'tbHelp' }, '需要协助时再展开 AI 会话，沿用 DSH 原生能力。'))),
        ),
      )
    }
    const startChat = async () => {
      const provider = aiService || service
      if (!provider?.newWorkspaceSession) { setError('请先在宿主侧栏选择或创建工作台会话。'); return }
      setChatBusy(true)
      try { await provider.newWorkspaceSession() } catch (problem) { setError(problem.message || '创建会话失败。') } finally { setChatBusy(false) }
    }
    const noVisibleConversation = !conversation || conversation?.props?.style?.display === 'none'
    return h('div', { className: `tbRoot${view.name === 'task' ? ' tbRootDetail' : ''}`, ref: rootRef },
      h('header', { className: 'tbBar', ref: barRef }, h('strong', { className: 'tbBarTitle' }, entry?.panelTitle || entry?.title || '任务栏'),
        h('nav', { className: 'tbViewNav', 'aria-label': '任务栏视图' },
          h('button', { type: 'button', className: `tbViewTab${view.name === 'board' ? ' tbViewTabActive' : ''}`, 'aria-current': view.name === 'board' ? 'page' : undefined, onClick: goBoard }, '总览'),
          h('button', { type: 'button', className: `tbViewTab${view.name === 'gantt' ? ' tbViewTabActive' : ''}`, 'aria-current': view.name === 'gantt' ? 'page' : undefined, onClick: () => openGantt(null) }, '甘特图'),
          h('button', { type: 'button', className: `tbViewTab${view.name === 'calendar' ? ' tbViewTabActive' : ''}`, 'aria-current': view.name === 'calendar' ? 'page' : undefined, onClick: () => openCalendar(null) }, '日历')),
        view.name === 'task' ? h('span', { className: 'tbBarPage' }, '任务详情') : null, h('span', { className: 'tbGrow' }),
        pending ? h('span', { className: 'tbSub', role: 'status' }, '保存中…') : null,
        h('div', { className: 'tbBarActions' }, view.name === 'board' ? h('button', { className: 'tbBtn tbGhost', type: 'button', 'aria-pressed': showHistory, onClick: () => setShowHistory(value => !value) }, icon('history'), showHistory ? '隐藏往日结算' : '查询历史') : null,
          h('button', { className: 'tbBtn', type: 'button', 'aria-expanded': chatOpen, 'aria-controls': 'tb-native-chat', onClick: () => setChatOpen(value => !value) }, icon('chat'), 'AI 会话'),
          h('button', { className: 'tbBtn tbBtnPrimary', type: 'button', disabled, onClick: () => startCreate() }, icon('plus'), '新建任务'))),
      view.name === 'board' ? renderBoard() : view.name === 'gantt' ? h('div', { className: 'tbGanttPage' },
        error && !dialog ? h('div', { className: 'tbErr', role: 'alert' }, error) : null,
        loading ? h('div', { className: 'tbEmpty' }, '正在读取任务…') : null,
        !loading && !hydrated ? h('button', { className: 'tbBtn', type: 'button', onClick: () => setLoadKey(value => value + 1) }, '重新加载') : null,
        h(GanttView, { tasks, commit, active, scopeId: view.scopeId || null, onTask: id => openTask(id), onEditPlan: id => openTask(id, { editPlan: true }),
          onAI: () => openAI(view.scopeId), onScopeAll: () => openGantt(null), disabled, stateRef: ganttState }))
        : view.name === 'calendar' ? h('div', { className: 'tbCalendarPage' },
          error && !dialog ? h('div', { className: 'tbErr', role: 'alert' }, error) : null,
          loading ? h('div', { className: 'tbEmpty' }, '正在读取任务…') : null,
          !loading && !hydrated ? h('button', { className: 'tbBtn', type: 'button', onClick: () => setLoadKey(value => value + 1) }, '重新加载') : null,
          h(CalendarView, { tasks, scopeId: view.scopeId || null, onTask: id => openTask(id), onEditPlan: id => openTask(id, { editPlan: true }),
            onScopeAll: () => openCalendar(null), disabled, active, stateRef: calendarState })) : renderTask(),
      view.name === 'board' ? h('footer', { className: 'tbFooter' }, h('span', null, '拖拽边缘排序 · 悬停 0.5 秒移入子级'), h('span', { className: 'tbFooterExtra' }, '横向滚动查看全部列 · 拖到边缘自动滚动')) : null,
      h('aside', { className: `tbChat${chatOpen ? ' tbChatOpen' : ''}`, id: 'tb-native-chat', 'aria-label': 'AI 会话', 'aria-hidden': !chatOpen },
        h('header', { className: 'tbChatBar' }, icon('chat'), 'AI 会话', h('span', { className: 'tbSub' }, '宿主提供'),
          h('button', { className: 'tbBtn', type: 'button', disabled, onClick: () => openAI(view.name === 'task' ? view.id : view.scopeId, true) }, '导入 AI 建议'),
          h('button', { className: 'tbMenuTrigger', type: 'button', 'aria-label': '收起会话', onClick: () => setChatOpen(false) }, icon('close'))),
        h('div', { className: 'tbChatBody' }, conversation,
          noVisibleConversation ? h('section', { className: 'tbChatInit' }, h('strong', null, '按需开始原生会话'),
            h('span', null, '业务操作无需先建会话。需要 AI 协助时，可选择宿主已有工作区，或新建工作区并开始会话。'),
            h('button', { className: 'tbBtn', type: 'button', disabled: chatBusy, onClick: startChat }, chatBusy ? '正在创建…' : '新建工作区并开始会话')) : null)),
      renderPopover(), renderDialog(),
      aiScope !== undefined ? h(AISchedulePanel, { tasks, initialScopeId: aiScope, service: aiService || service, commit, disabled, importNonce: aiImportNonce,
        onOpenChat: () => setChatOpen(true), onClose: () => { setAIScope(undefined); requestAnimationFrame(() => returnFocus.current?.isConnected && returnFocus.current.focus()) } }) : null,
    )
  }
}
