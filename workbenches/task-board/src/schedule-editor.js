import { applyScheduleChanges, getSchedules, todayDate } from '../dsh/schedule-model.js'

/** The editor owns drafts, never persists a default merely by rendering. */
export function createScheduleEditor(React) {
  const h = React.createElement
  return function ScheduleEditor({ task, tasks, commit, onGantt, onCalendar, disabled, registerGuard, requestUnsaved, openOnMount = false }) {
    const [editing, setEditing] = React.useState(false), [draft, setDraft] = React.useState(null)
    const [busy, setBusy] = React.useState(false), [error, setError] = React.useState('')
    const busyRef = React.useRef(false), mounted = React.useRef(true)
    const schedules = getSchedules(tasks), effective = schedules.get(task.id)
    const hasChildren = Boolean(effective?.hasChildren)
    const currentMode = hasChildren && (task.planMode === 'auto' || (!task.planMode && !task.planStartDate && !task.planEndDate)) ? 'auto' : 'manual'
    const base = { planStartDate: task.planStartDate || '', planEndDate: task.planEndDate || '', planMode: currentMode, assignee: task.assignee || '' }
    const baseRef = React.useRef(base), draftRef = React.useRef(draft), editingRef = React.useRef(editing)
    baseRef.current = base; draftRef.current = draft; editingRef.current = editing
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
    const begin = () => {
      const initial = { ...baseRef.current }
      if (initial.planMode === 'manual' && !initial.planStartDate) initial.planStartDate = todayDate()
      draftRef.current = initial; setDraft(initial); setError(''); setEditing(true)
    }
    React.useEffect(() => { if (openOnMount) begin() }, [openOnMount])
    const dirty = editing && draft && Object.keys(base).some(key => draft[key] !== base[key])
    const setField = (key, value) => {
      setDraft(previous => {
        let next = { ...previous, [key]: value }
        if (key === 'planMode' && value === 'manual') next = { ...next,
          planStartDate: previous.planStartDate || effective?.start || todayDate(),
          planEndDate: previous.planEndDate || effective?.end || '' }
        draftRef.current = next; return next
      })
    }
    const save = async () => {
      if (busyRef.current || !draftRef.current) return false
      const values = draftRef.current
      const change = { id: task.id, ...values, assignee: values.assignee.trim() }
      if (hasChildren && change.planMode === 'auto') { change.planStartDate = ''; change.planEndDate = '' }
      busyRef.current = true; setBusy(true); setError('')
      try {
        const success = await commit(list => applyScheduleChanges(list, [change]))
        if (!mounted.current) return success
        if (success) { editingRef.current = false; setEditing(false); setDraft(null) }
        else setError('计划未保存，请检查页面中的错误说明；输入仍保留，可调整后重试。')
        return success
      } catch (problem) {
        if (mounted.current) setError(problem.message || '计划保存失败。')
        return false
      } finally { busyRef.current = false; if (mounted.current) setBusy(false) }
    }
    const guard = async () => {
      if (busyRef.current) { setError('正在保存计划，请稍候再切换。'); return false }
      const value = draftRef.current
      if (!editingRef.current || !value || !Object.keys(baseRef.current).some(key => value[key] !== baseRef.current[key])) return true
      const choice = await requestUnsaved('plan')
      if (choice === 'save') return save()
      if (choice === 'discard') { editingRef.current = false; setEditing(false); setDraft(null); return true }
      return false
    }
    React.useEffect(() => registerGuard(guard), [registerGuard, editing, draft, task])
    React.useEffect(() => {
      if (!dirty) return
      const prevent = event => { event.preventDefault(); event.returnValue = '' }
      window.addEventListener('beforeunload', prevent)
      return () => window.removeEventListener('beforeunload', prevent)
    }, [dirty])
    const range = effective?.kind === 'bar' ? `${effective.start} → ${effective.end}`
      : effective?.kind === 'deadline' ? `截止 ${effective.end} · 待补开始日期` : '尚未设置完整计划'
    const disabledForm = disabled || busy
    return h('section', { className: 'tbPlanSection', 'aria-label': '计划与负责人', 'data-plan-task': task.id },
      h('div', { className: 'tbSectionHeader' }, h('h2', { className: 'tbSectionTitle' }, '计划与负责人'),
        h('button', { type: 'button', className: 'tbBtn tbGhost', onClick: () => onGantt(task.id) }, '查看甘特图'),
        onCalendar ? h('button', { type: 'button', className: 'tbBtn tbGhost', onClick: () => onCalendar(task.id) }, '查看日历') : null),
      h('div', { className: 'tbCard tbPlanCard' },
        !editing ? h(React.Fragment, null,
          h('div', { className: 'tbPlanOverview' },
            h('div', { className: 'tbPlanOverviewBody' }, h('strong', null, range),
              hasChildren ? h('span', { className: 'tbSub' }, effective?.auto ? '根据子任务自动汇总' : '手动计划范围 · 子任务不得越界') : null,
              effective?.partial && hasChildren ? h('span', { className: 'tbSub' }, effective.unscheduledCount > 0 ? `${effective.unscheduledCount} 个下级任务未完整排期` : '部分任务的日期尚未完整') : null,
              task.assignee ? h('span', { className: 'tbPlanAssignee' }, `负责人：${task.assignee}`) : null),
            h('button', { type: 'button', className: 'tbBtn', disabled, 'aria-label': `编辑${task.title}的计划`, onClick: begin }, '编辑计划')),
          h('p', { className: 'tbHelp' }, '计划日期独立于完成状态。首次设置开始日期默认当天，保存后不会随日期变化。')) :
          h('form', { className: 'tbPlanForm', onSubmit: event => { event.preventDefault(); save() } },
            hasChildren ? h('label', { className: 'tbPlanField' }, '父任务排期方式', h('select', { className: 'tbSelect', 'aria-label': '父任务排期方式', value: draft.planMode,
              disabled: disabledForm, onChange: event => setField('planMode', event.target.value) },
              h('option', { value: 'auto' }, '自动汇总子任务'), h('option', { value: 'manual' }, '手动设置范围（硬边界）'))) : null,
            h('div', { className: 'tbPlanDates' },
              h('label', { className: 'tbPlanField' }, '计划开始日期', h('input', { type: 'date', className: 'tbInput', 'aria-label': '计划开始日期',
                value: hasChildren && draft.planMode === 'auto' ? effective?.start || '' : draft.planStartDate, disabled: disabledForm || (hasChildren && draft.planMode === 'auto'),
                onChange: event => setField('planStartDate', event.target.value) })),
              h('label', { className: 'tbPlanField' }, '计划完成日期', h('input', { type: 'date', className: 'tbInput', 'aria-label': '计划完成日期',
                value: hasChildren && draft.planMode === 'auto' ? effective?.end || '' : draft.planEndDate, disabled: disabledForm || (hasChildren && draft.planMode === 'auto'),
                onChange: event => setField('planEndDate', event.target.value) }))),
            hasChildren ? h('p', { className: 'tbHelp' }, draft.planMode === 'auto'
              ? '日期跟随已排期子任务；保存自动模式将清除原有手动日期边界。'
              : '子任务需处于这个范围内；调整父任务或移动子任务产生冲突时，不会静默顺延。') : null,
            h('label', { className: 'tbPlanField' }, '负责人（可选）', h('input', { className: 'tbInput', 'aria-label': '负责人', maxLength: 100, value: draft.assignee,
              disabled: disabledForm, placeholder: '', onChange: event => setField('assignee', event.target.value) })),
            h('div', { className: 'tbPlanActions' },
              h('button', { type: 'button', className: 'tbBtn tbGhost', disabled: disabledForm || (hasChildren && draft.planMode === 'auto'),
                onClick: () => { const next = { ...draftRef.current, planStartDate: '', planEndDate: '' }; draftRef.current = next; setDraft(next) } }, '清除日期'),
              h('span', { className: 'tbGrow' }),
              h('button', { type: 'button', className: 'tbBtn', disabled: busy, onClick: () => { editingRef.current = false; setEditing(false); setDraft(null); setError('') } }, '取消'),
              h('button', { type: 'submit', className: 'tbBtn tbBtnPrimary', disabled: disabledForm }, busy ? '保存中…' : '保存计划')),
            error ? h('div', { className: 'tbErr', role: 'alert' }, error) : null,
          ),
      ),
    )
  }
}
