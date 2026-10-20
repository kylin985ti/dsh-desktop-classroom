import { getAIScheduleScopes, getAIScheduleDomains, previewProposal, applyProposal, restoreNativeRequest, formatAIPlanRange } from './ai-schedule-model.js'
import { PLANNING_LIMITS, proposalKeys, changeKey, newTaskKey, togglePlanningSelection, planningPreview,
  buildPlanningRequest, parsePlanningReply, createPlanningUndo, undoPlanningBatch, comparePlanningRevisions } from './ai-planning-model.js'
import { inspectNativeDraftHost, readOwnedNativeReply, runOwnedPlanningTurn, keepOwnedPlanningSession, releaseOwnedPlanningSession } from './ai-native-bridge.js'
import { scanWorkspace } from './workspace-scan.js'
import { subtreeIds } from './task-model.js'

const EMPTY = [], messageOf = error => error?.message || String(error)
const freshPlan = () => ({ input: '', messages: [], revisions: [], index: -1, sessionId: null, pending: null,
  phase: 'idle', includeWorkspace: false, domainChoice: '', scan: null, documents: [], deadline: '', allowOngoing: false })
const requestId = () => `tb-ai-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
const shortRange = plan => {
  const start = plan?.planStartDate, end = plan?.planEndDate, year = String(new Date().getFullYear())
  const date = value => value?.startsWith(year + '-') ? value.slice(5).replace('-', '.') : value?.replaceAll('-', '.')
  if (start && end) return start === end ? date(start) : `${date(start)}–${date(end)}`
  return end ? `截至 ${date(end)}` : start ? `自 ${date(start)}` : '未安排'
}

/** Persistent per-scope planning state; the only task mutation paths are confirm and undo. */
export function createAIPlanningPanel(React) {
  const h = React.createElement
  return function AIPlanningPanel({ tasks = EMPTY, initialScopeId = null, service, commit, onClose, onOpenChat,
    onPreviewChange, onScopeChange, stateRef, importNonce = 0, disabled = false }) {
    const fallback = React.useRef(null), holder = stateRef || fallback
    if (!holder.current?.plans) holder.current = { plans: new Map(), choice: '', undo: null }
    const cache = holder.current
    const scopes = React.useMemo(() => { try { return getAIScheduleScopes(tasks) } catch { return [] } }, [tasks])
    const [scopeChoice, setScopeChoice] = React.useState(() => initialScopeId ? `branch:${initialScopeId}` : cache.choice || (scopes[0] ? `branch:${scopes[0].id}` : 'all'))
    const [model, setModel] = React.useState(() => cache.plans.get(scopeChoice) || freshPlan())
    const liveModel = React.useRef(model), liveTasks = React.useRef(tasks), scopeRef = React.useRef(scopeChoice)
    liveTasks.current = tasks; scopeRef.current = scopeChoice
    const [busy, setBusy] = React.useState(false), [scanBusy, setScanBusy] = React.useState(false)
    const [errors, setErrors] = React.useState([]), [notice, setNotice] = React.useState(''), [progress, setProgress] = React.useState('')
    const [compare, setCompare] = React.useState(false), [manualText, setManualText] = React.useState('')
    const mounted = React.useRef(true), flight = React.useRef(0), controller = React.useRef(null), scanController = React.useRef(null)
    const applying = React.useRef(false), nativeFlight = React.useRef(false), root = React.useRef(null), heading = React.useRef(null), inputRef = React.useRef(null)
    const update = change => {
      const next = typeof change === 'function' ? change(liveModel.current) : change
      liveModel.current = next; cache.plans.set(scopeRef.current, next); cache.choice = scopeRef.current
      if (mounted.current) setModel(next)
      return next
    }
    React.useEffect(() => {
      mounted.current = true; heading.current?.focus()
      return () => { mounted.current = false; flight.current++; controller.current?.abort(); scanController.current?.abort(); onPreviewChange?.(null); if (!stateRef) releaseOwnedPlanningSession(cache) }
    }, [])
    React.useEffect(() => { onScopeChange?.(scopeChoice === 'all' ? null : scopeChoice.slice(7)) }, [scopeChoice, onScopeChange])
    const revision = model.revisions[model.index]
    const domains = React.useMemo(() => {
      try { return getAIScheduleDomains(tasks, { scopeId: scopeChoice.startsWith('branch:') ? scopeChoice.slice(7) : null, allTasks: scopeChoice === 'all' }) }
      catch { return [] }
    }, [tasks, scopeChoice])
    const domainRoot = domains.find(item => item.path === model.domainChoice)?.path || domains[0]?.path || ''
    const domainToken = JSON.stringify([scopeChoice, domains])
    const scanToken = React.useRef(domainToken)
    React.useEffect(() => {
      if (scanToken.current !== domainToken) {
        scanToken.current = domainToken; scanController.current?.abort()
        update(previous => ({ ...previous, scan: null, documents: [] }))
      }
    }, [domainToken])
    const derived = React.useMemo(() => {
      if (!revision) return null
      if (['applied', 'undone'].includes(revision.status) && revision.confirmed) return revision.confirmed
      try { return planningPreview(tasks, revision, revision.selected) }
      catch (error) { return { error: messageOf(error) } }
    }, [tasks, revision, model.phase])
    const draftVisible = !['applied', 'undone'].includes(model.phase) && (!revision || revision.status === 'draft')
    React.useEffect(() => { onPreviewChange?.(draftVisible ? derived?.chart || null : null) }, [derived, draftVisible, onPreviewChange])
    const busyNow = busy || scanBusy || disabled
    const selected = revision && new Set(revision.selected)
    const issues = derived?.error ? [derived.error] : draftVisible ? derived?.selected?.errors || [] : []
    const capability = inspectNativeDraftHost(service)
    const changeScope = choice => {
      if (busyNow) return
      cache.plans.set(scopeChoice, liveModel.current); cache.choice = choice; scopeRef.current = choice
      const next = cache.plans.get(choice) || freshPlan(); liveModel.current = next
      setScopeChoice(choice); setModel(next); setErrors([]); setNotice(''); setCompare(false)
    }
    const validate = request => {
      const check = previewProposal(liveTasks.current, { version: 1, requestId: request.requestId, changes: [], assumptions: [], conflicts: [] }, request)
      if (check.errors.length) throw new Error(check.errors.join('\n'))
    }
    const scanDomain = async () => {
      if (!domainRoot || busyNow) return
      const token = scanToken.current, abort = new AbortController()
      scanController.current = abort; setScanBusy(true); setErrors([]); setNotice(''); setProgress('正在扫描所选工作域…')
      try {
        const scan = await scanWorkspace(domainRoot, { signal: abort.signal, onProgress: value => {
          if (mounted.current && scanToken.current === token) setProgress(`正在读取 ${value.relative}…`)
        } })
        if (!mounted.current || token !== scanToken.current || abort.signal.aborted) return
        update(previous => ({ ...previous, scan, documents: scan.documents.map(item => item.relative) }))
        setNotice(`已扫描 ${scan.files.length} 个文件，读取 ${scan.documents.length} 篇正文；请预览并选择要参考的内容。`)
      } catch (error) { if (mounted.current) setErrors([abort.signal.aborted ? '已取消扫描，未加入工作域内容。' : messageOf(error)]) }
      finally { if (mounted.current) { setScanBusy(false); setProgress('') } }
    }
    const accept = (reply, request) => {
      validate(request)
      const parsed = parsePlanningReply(reply.text)
      const keepInput = previous => previous.input.trim() && previous.input.trim() !== request.options.constraints.trim() ? previous.input : ''
      if (parsed.clarification) {
        update(previous => ({ ...previous, phase: 'question', pending: null, input: keepInput(previous),
          messages: [...previous.messages, { role: 'assistant', text: parsed.clarification, clarification: true }] }))
        inputRef.current?.focus(); return
      }
      if (parsed.proposal.requestId !== request.requestId) throw new Error('AI 返回了其他轮次的方案，当前预览已保留。')
      const existing = liveModel.current.revisions.findIndex(item => item.request.requestId === request.requestId)
      if (existing >= 0) {
        update(previous => ({ ...previous, index: existing, pending: null,
          phase: ['applied', 'undone'].includes(previous.revisions[existing].status) ? previous.revisions[existing].status : 'preview' }))
        setNotice('已恢复同一份方案，没有重复生成版本或修改任务。'); return
      }
      const preview = previewProposal(liveTasks.current, parsed.proposal, request)
      update(previous => {
        const prior = previous.revisions[previous.index], previousKeys = new Set(prior ? proposalKeys(prior.proposal) : [])
        const priorSelected = new Set(prior?.selected)
        const keys = proposalKeys(parsed.proposal).filter(key => !previousKeys.has(key) || priorSelected.has(key))
        const number = (previous.revisions.at(-1)?.number || 0) + 1
        const next = { number, request, proposal: parsed.proposal, explanation: parsed.explanation, selected: keys, status: 'draft' }
        const summary = preview.errors.length ? `第 ${number} 版已返回，有 ${preview.errors.length} 处需要调整，请查看冲突。`
          : `已生成第 ${number} 版：新增 ${preview.createdCount} 项任务、调整 ${preview.changedCount} 项日期。请在图上核对。`
        return { ...previous, input: keepInput(previous), phase: 'preview', pending: null,
          revisions: [...previous.revisions, next], index: previous.revisions.length,
          messages: [...previous.messages, { role: 'assistant', text: summary }] }
      })
      setNotice(''); inputRef.current?.focus()
    }
    const generate = async () => {
      const current = liveModel.current, text = current.input.trim()
      if (busyNow || applying.current || nativeFlight.current || !text) return
      if (current.revisions.length >= PLANNING_LIMITS.revisions) { setErrors(['已保留 12 个方案版本。请开始新规划，合并需要保留的要求；现有方案仍保留。']); return }
      nativeFlight.current = true
      const token = ++flight.current, scope = scopeChoice, abort = new AbortController()
      controller.current = abort; setBusy(true); setErrors([]); setNotice(''); setProgress('正在准备规划会话…')
      let request
      try {
        if (current.includeWorkspace && (!current.scan || current.scan.root !== domainRoot)) throw new Error('请先扫描并预览所选工作域，或取消“参考工作域”。')
        let history = current.messages
        if (current.pending?.message === text && history.at(-1)?.role === 'user' && history.at(-1).text === text) history = history.slice(0, -1)
        request = buildPlanningRequest(liveTasks.current, { scopeId: scope.startsWith('branch:') ? scope.slice(7) : null, allTasks: scope === 'all',
          message: text, messages: history, requestId: requestId(),
          priorState: current.phase,
          priorRevision: ['applied', 'undone'].includes(current.phase) ? null : current.revisions[current.index],
          selectedKeys: current.revisions[current.index]?.selected || [], deadline: current.deadline, allowOngoing: current.allowOngoing,
          ...(current.includeWorkspace ? { workspaceScan: { ...current.scan, documents: current.scan.documents.filter(item => current.documents.includes(item.relative)) } } : {}) })
        validate(request)
        const available = inspectNativeDraftHost(service)
        if (!available.supported) throw new Error(available.reason)
        let sessionId = current.sessionId
        if (!sessionId || available.sessionId !== sessionId || !service.ownsSession(sessionId)) {
          if (!available.workspaceId || typeof service.newSession !== 'function') throw new Error('请先选择本工作台的会话位置，然后生成方案。')
          sessionId = await service.newSession(available.workspaceId)
        }
        if (!mounted.current || token !== flight.current || abort.signal.aborted || scopeRef.current !== scope) return
        keepOwnedPlanningSession(cache, service, sessionId)
        update(previous => ({ ...previous, sessionId, phase: 'generating' }))
        const reply = await runOwnedPlanningTurn({ service, sessionId, prompt: request.prompt, signal: abort.signal,
          isCurrent: () => mounted.current && token === flight.current && scopeRef.current === scope,
          onDispatch: () => update(previous => ({ ...previous, sessionId, phase: 'generating', input: '', pending: { request, message: text, sessionId },
            messages: [...history, { role: 'user', text }] })),
          validate: () => validate(request), onProgress: value => { if (mounted.current && token === flight.current) setProgress(value) } })
        if (mounted.current && token === flight.current && scopeRef.current === scope) accept(reply, request)
      } catch (error) {
        if (mounted.current && token === flight.current) {
          update(previous => ({ ...previous, phase: ['applied', 'undone'].includes(current.phase) ? current.phase : previous.revisions.length ? 'preview' : 'error', input: text }))
          setErrors(error.issues || [messageOf(error)])
        }
      } finally { nativeFlight.current = false; if (mounted.current && token === flight.current) { setBusy(false); setProgress('') } }
    }
    const importReply = async () => {
      if (busyNow || applying.current || nativeFlight.current) return
      nativeFlight.current = true
      const token = ++flight.current, scope = scopeChoice, target = liveModel.current.pending?.request
      setBusy(true); setErrors([]); setNotice('')
      try {
        keepOwnedPlanningSession(cache, service, liveModel.current.pending?.sessionId || liveModel.current.sessionId || service?.currentSession?.())
        const reply = await readOwnedNativeReply({ service, sessionId: liveModel.current.pending?.sessionId || liveModel.current.sessionId || undefined,
          isCurrent: () => mounted.current && token === flight.current && scopeRef.current === scope,
          validate: () => { if (target) validate(target) } })
        const parsed = parsePlanningReply(reply.text)
        const request = target || restoreNativeRequest(liveTasks.current, { prompt: reply.prompt, requestId: parsed.proposal?.requestId,
          scopeId: scope.startsWith('branch:') ? scope.slice(7) : null, allTasks: scope === 'all' })
        if (target && reply.prompt !== target.prompt) throw new Error('原生回复与本轮请求不对应，未导入。')
        if (!liveModel.current.messages.length) update(previous => ({ ...previous, sessionId: reply.sessionId,
          messages: [{ role: 'user', text: request.options.constraints || '导入已有排期建议' }] }))
        accept(reply, request)
      } catch (error) { if (mounted.current) setErrors(error.issues || [messageOf(error)]) }
      finally { nativeFlight.current = false; if (mounted.current) setBusy(false) }
    }
    const importRef = React.useRef(importReply); importRef.current = importReply
    React.useEffect(() => { if (importNonce) void importRef.current() }, [importNonce])
    const confirm = async () => {
      const current = liveModel.current, version = current.revisions[current.index]
      if (busyNow || applying.current || !version || !draftVisible || !derived?.selected?.canApply || typeof commit !== 'function') return
      applying.current = true; setBusy(true); setErrors([])
      let receipt, confirmed
      try {
        const outcome = await commit(latest => {
          confirmed = planningPreview(latest, version, version.selected)
          const after = applyProposal(latest, confirmed.selected)
          receipt = createPlanningUndo(latest, after)
          return after
        })
        if (outcome === false) throw new Error('保存失败，原任务已保留；请重试确认。')
        cache.undo = { ...receipt, scopeChoice, requestId: version.request.requestId }
        update(previous => ({ ...previous, phase: 'applied', pending: null, revisions: previous.revisions.map((item, index) => index === previous.index ? { ...item, status: 'applied', confirmed } : item) }))
        setNotice(`已应用 ${receipt.records.length} 项变化，可撤销本批。`)
      } catch (error) { if (mounted.current) setErrors(error.issues || [messageOf(error)]) }
      finally { applying.current = false; if (mounted.current) setBusy(false) }
    }
    const undo = async () => {
      if (busyNow || applying.current || !cache.undo || typeof commit !== 'function') return
      applying.current = true; setBusy(true); setErrors([])
      try {
        let problem
        const receipt = cache.undo
        const outcome = await commit(latest => { try { return undoPlanningBatch(latest, receipt) } catch (error) { problem = error; throw error } })
        if (outcome === false) throw problem || new Error('撤销保存失败，本批记录保持原样，可重试。')
        cache.undo = null
        const markUndone = plan => {
          const viewing = plan.revisions[plan.index]?.request.requestId === receipt.requestId
          return { ...plan, ...(viewing ? { phase: 'undone', pending: null } : {}),
            revisions: plan.revisions.map(item => item.request.requestId === receipt.requestId ? { ...item, status: 'undone' } : item) }
        }
        // Display version numbers restart for a new plan. Match the immutable
        // request, including archived plans, without replacing a later draft.
        for (const [key, plan] of cache.plans) if (key !== scopeChoice) cache.plans.set(key, markUndone(plan))
        update(previous => ({ ...markUndone(previous),
          messages: [...previous.messages, { role: 'system', text: '已撤销上次应用，任务恢复到该批应用前。可以继续调整。' }] }))
        setNotice('已整批撤销新增任务、子任务及日期调整。对话和方案版本仍保留。')
      } catch (error) { if (mounted.current) setErrors([messageOf(error)]) }
      finally { applying.current = false; if (mounted.current) setBusy(false) }
    }
    const toggle = (key, checked) => update(previous => ({ ...previous, revisions: previous.revisions.map((item, index) => index === previous.index
      ? { ...item, selected: togglePlanningSelection(item.proposal, item.selected, key, checked) } : item) }))
    const chooseVersion = index => {
      setCompare(false); setErrors([]); setNotice('')
      update(previous => ({ ...previous, index, phase: ['applied', 'undone'].includes(previous.revisions[index]?.status) ? previous.revisions[index].status : 'preview' }))
    }
    const startNew = () => {
      if (busyNow) return
      // Keep prior revisions in the per-scope cache; an explicit new plan gets a
      // fresh session and baseline. It never removes native history or task data.
      cache.plans.set(`history:${scopeChoice}:${Date.now()}`, liveModel.current)
      update(freshPlan()); setErrors([]); setNotice('已开始新规划；此前记录仍在本次工作台内保留。'); setCompare(false)
    }
    const button = (text, action, extra = {}) => h('button', { type: 'button', className: 'tbBtn', disabled: busyNow, onClick: action, ...extra }, text)
    const issueList = items => items.length ? h('div', { className: 'tbPlanningErrors', role: 'alert' }, items.map((text, index) => h('p', { key: index }, text))) : null
    const recent = model.messages.slice(-2), older = model.messages.slice(0, -2)
    const renderMessage = (item, index) => h('p', { key: index, className: `tbPlanningMessage tbPlanningMessage-${item.role}` }, item.text)
    const rows = revision ? [
      ...revision.proposal.changes.map(item => ({ key: changeKey(item.id), title: tasks.find(task => task.id === item.id)?.title || '原有任务', kind: '改期',
        range: `${shortRange(derived?.all?.rows?.find(row => row.id === item.id)?.before || tasks.find(task => task.id === item.id))} → ${shortRange(item)}`, item })),
      ...(revision.proposal.newTasks || []).map(item => {
        const effective = derived?.selected?.creationRows?.find(row => row.ref === item.ref) || derived?.all?.creationRows?.find(row => row.ref === item.ref)
        return { key: newTaskKey(item.ref), title: item.title, kind: '新增',
          range: `${item.parentRef ? `${revision.proposal.newTasks.find(parent => parent.ref === item.parentRef)?.title || '新父任务'} · ` : effective?.automatic ? '自动汇总 · ' : ''}${shortRange(effective?.after || item)}`, item }
      }),
    ] : []
    const selectedCount = revision?.selected.length || 0
    const explanation = revision ? [revision.explanation,
      ...rows.map(row => `${row.title}：${row.item.reason}${row.item.assumptions.length ? `\n假设：${row.item.assumptions.join('；')}` : ''}`),
      ...(revision.proposal.workspaceSuggestions || []), ...(revision.proposal.assumptions || [])].filter(Boolean) : []
    const composer = h('form', { className: 'tbPlanningComposer', onSubmit: event => { event.preventDefault(); void generate() } },
      !model.messages.length ? h('label', { className: 'tbPlanningLabel', htmlFor: 'tb-planning-goal' }, '告诉 AI 你的目标') : null,
      h('textarea', { id: 'tb-planning-goal', ref: inputRef, className: 'tbArea', 'aria-label': model.messages.length ? '继续调整方案' : '规划目标',
        rows: model.messages.length ? 3 : 5, maxLength: PLANNING_LIMITS.message, value: model.input, disabled: busyNow,
        placeholder: model.messages.length ? '继续说哪里不合适…' : '例如：10月28日前完成验收，开发日期不动，帮我补齐遗漏步骤。',
        onChange: event => update(previous => ({ ...previous, input: event.target.value })) }),
      !model.messages.length ? h('div', { className: 'tbPlanningExamples' },
        button('补齐子任务', () => { update(previous => ({ ...previous, input: '请根据当前任务和已选择的资料补齐遗漏的子任务，保留现有任务安排。' })); inputRef.current?.focus() }),
        button('优化当前排期', () => { update(previous => ({ ...previous, input: '请检查当前排期，指出冲突并给出更合理的日期安排，说明需要我确认的假设。' })); inputRef.current?.focus() })) : null,
      h('button', { type: 'submit', className: `tbBtn${!model.messages.length ? ' tbBtnPrimary tbPlanningGenerate' : ' tbPlanningUpdate'}`,
        disabled: busyNow || !model.input.trim() }, busy ? '正在生成…' : model.messages.length ? '更新预览' : '生成方案预览'),
      h('p', { className: 'tbPlanningHelp' }, ['applied', 'undone'].includes(model.phase)
        ? '继续输入将基于当前任务生成新预览。' : revision ? '确认前只更新预览，不修改任务。' : '先生成预览，确认后才会修改任务。'))
    return h('aside', { className: 'tbPlanning', ref: root, 'data-ai-planning': true, 'data-phase': model.phase, 'aria-label': 'AI 辅助规划',
      onKeyDown: event => { if (event.key === 'Escape' && !applying.current) { event.preventDefault(); event.stopPropagation(); onClose?.() } } },
      h('header', { className: 'tbPlanningHeader' }, h('h2', { tabIndex: -1, ref: heading }, revision ? 'AI 方案' : 'AI 辅助规划'),
        revision ? h('span', { className: 'tbPlanningBadge' }, model.phase === 'applied' ? '已应用' : model.phase === 'undone' ? '已撤销' : '预览中') : null,
        button('关闭', onClose, { className: 'tbBtn tbGhost', 'aria-label': '关闭 AI 规划', disabled: applying.current })),
      h('div', { className: 'tbPlanningBody' },
        model.revisions.length ? h('div', { className: 'tbPlanningVersion' },
          h('select', { className: 'tbSelect', 'aria-label': '方案版本', value: model.index, disabled: busyNow, onChange: event => chooseVersion(Number(event.target.value)) },
            model.index < 0 ? h('option', { value: -1 }, '查看此前方案…') : null,
            model.revisions.map((item, index) => h('option', { key: item.number, value: index }, `第 ${item.number} 版${item.status === 'applied' ? '（已应用）' : ''}`))),
          button(compare ? '收起对比' : '对比上一版', () => setCompare(value => !value), { className: 'tbPlanningLink', disabled: busyNow || model.index < 1 })) : null,
        !model.messages.length ? h('div', { className: 'tbPlanningWelcome' }, h('h3', null, '你想怎么安排这个项目？'), h('p', null, '说清目标，AI 会把建议画在甘特图上。')) : null,
        !model.messages.length ? h('label', { className: 'tbPlanningLabel' }, '规划范围', h('select', { className: 'tbSelect', 'aria-label': '规划范围', value: scopeChoice,
          disabled: busyNow, onChange: event => changeScope(event.target.value) },
          initialScopeId && !scopes.some(item => item.id === initialScopeId) ? h('option', { value: `branch:${initialScopeId}` }, tasks.find(task => task.id === initialScopeId)?.title || '当前分支') : null,
          scopes.map(item => h('option', { key: item.id, value: `branch:${item.id}` }, `当前项目 · ${item.title}`)),
          h('option', { value: 'all' }, '全部任务（明确包含历史任务）')),
          h('span', { className: 'tbPlanningHelp' }, scopeChoice === 'all' ? '已明确选择全部任务，请核对范围。' : `包含 ${Math.max(0, subtreeIds(tasks, scopeChoice.slice(7)).size - 1)} 个子任务`)) : null,
        h('section', { className: 'tbPlanningWorkspace' },
          h('label', { className: 'tbPlanningCheck' }, h('input', { type: 'checkbox', 'aria-label': '参考工作域', checked: model.includeWorkspace,
            disabled: busyNow, onChange: event => update(previous => ({ ...previous, includeWorkspace: event.target.checked,
              ...(!event.target.checked ? { scan: null, documents: [] } : {}) })) }), '参考工作域', h('span', { className: 'tbPlanningHelp' }, '可选')),
          model.includeWorkspace ? h(model.messages.length ? 'details' : React.Fragment, model.messages.length ? { className: 'tbPlanningDetails' } : null,
            model.messages.length ? h('summary', null, `已参考 ${model.documents.length} 篇正文 · 调整资料`) : null,
            !domainRoot ? h('p', { className: 'tbPlanningHelp' }, '当前范围尚未绑定工作域，请先在任务详情选择文件夹。') : h(React.Fragment, null,
              h('select', { className: 'tbSelect', 'aria-label': '扫描工作域', value: domainRoot, disabled: busyNow,
                onChange: event => update(previous => ({ ...previous, domainChoice: event.target.value, scan: null, documents: [] })) },
                domains.map(item => h('option', { key: item.path, value: item.path }, item.titles.join('、')))),
              h('div', { className: 'tbPlanningScanActions' }, button(scanBusy ? '正在扫描…' : model.scan ? '重新扫描' : '扫描工作域', scanDomain),
                scanBusy ? button('取消扫描', () => scanController.current?.abort(), { disabled: false }) : null),
              model.scan ? h('details', { key: model.messages.length, className: 'tbPlanningDetails' }, h('summary', null, `预览扫描内容 · ${model.scan.files.length} 个文件 / ${model.documents.length} 篇正文`),
                h('p', { className: 'tbPlanningHelp' }, '仅勾选的正文与已列出的相对文件名会加入请求；未读取或截断内容不算已审阅。'),
                model.scan.files.map(file => h('p', { key: file.relative, className: 'tbPlanningHelp' }, file.relative)),
                model.scan.documents.map(file => h('details', { key: file.relative }, h('summary', null, file.relative, file.truncated ? '（已截断）' : ''),
                  h('label', { className: 'tbPlanningCheck' }, h('input', { type: 'checkbox', checked: model.documents.includes(file.relative), 'aria-label': `加入正文：${file.relative}`,
                    disabled: busyNow, onChange: event => update(previous => ({ ...previous,
                      documents: event.target.checked ? [...previous.documents, file.relative] : previous.documents.filter(name => name !== file.relative) })) }), '加入本篇正文'),
                  h('pre', null, file.content))),
                model.scan.warnings.map((text, index) => h('p', { key: index, className: 'tbPlanningHelp' }, text))) : null))
            : !model.messages.length ? h('p', { className: 'tbPlanningHelp' }, '勾选后选择文件，发送前可预览。') : null),
        older.length ? h('details', { className: 'tbPlanningDetails' }, h('summary', null, `前面的对话 · ${older.length} 条`), older.map(renderMessage)) : null,
        recent.length ? h('div', { className: 'tbPlanningMessages', 'aria-label': '本轮规划对话' }, recent.map(renderMessage)) : null,
        issueList([...errors, ...issues]),
        progress ? h('p', { className: 'tbPlanningProgress', role: 'status' }, progress) : null,
        busy && !scanBusy ? button('停止等待', () => controller.current?.abort(), { disabled: false }) : null,
        model.pending && !busy ? h('div', { className: 'tbPlanningPending' },
          h('p', { className: 'tbPlanningHelp' }, '本轮请求已保留，可接收完成的结果；当前预览仍保留。'),
          button('接收本轮结果', importReply)) : null,
        notice ? h('p', { className: 'tbPlanningNotice', role: 'status' }, notice) : null,
        compare && model.index > 0 ? h('section', { className: 'tbPlanningComparison', 'aria-label': '与上一版比较' },
          h('strong', null, `第 ${revision.number - 1} 版 → 第 ${revision.number} 版`),
          comparePlanningRevisions(model.revisions[model.index - 1], revision).map(row => h('p', { key: row.key },
            `${row.after?.title || row.before?.title || tasks.find(task => task.id === (row.after?.id || row.before?.id))?.title || '任务'}：${row.before ? shortRange(row.before) : '上版未提出'} → ${row.after ? shortRange(row.after) : '本版移除'}${row.selectionChanged ? ` · ${row.afterSelected ? '接受' : '未接受'}` : ''}`)),
          button('退回上一版预览', () => chooseVersion(model.index - 1))) : null,
        revision ? h('section', { className: 'tbPlanningSuggestions', 'aria-label': '选择接受的建议' },
          h('header', null, h('strong', null, `已选 ${selectedCount} / ${rows.length} 项`), h('span', { className: 'tbPlanningHelp' },
            `新增 ${revision.proposal.newTasks?.length || 0} 项 · 改期 ${revision.proposal.changes.length} 项`)),
          rows.map(row => h('label', { key: row.key, className: 'tbPlanningSuggestion', 'data-selected': selected.has(row.key) ? 'true' : 'false' },
            h('input', { type: 'checkbox', checked: selected.has(row.key), disabled: busyNow || !draftVisible,
              'aria-label': `接受建议：${row.title}`, onChange: event => toggle(row.key, event.target.checked) }),
            h('span', null, h('span', { className: 'tbPlanningSuggestionName' }, row.title, h('small', { 'data-kind': row.kind }, row.kind)),
              h('span', { className: 'tbPlanningSuggestionRange' }, row.range, !selected.has(row.key) ? ' · 暂不加入' : '')))),
          !rows.length ? h('p', { className: 'tbPlanningHelp' }, '本版没有需要保存的任务或日期变化，可以继续说明目标。') : null,
          h('details', { className: 'tbPlanningDetails' }, h('summary', null, '方案依据与解释'), explanation.map((text, index) => h('p', { key: index }, text)),
            derived?.selected?.parentRows.map(row => h('p', { key: row.id }, `父级汇总 ${row.title}：${formatAIPlanRange(row.before)} → ${formatAIPlanRange(row.after)}`))),
          draftVisible && !issues.length && derived?.selected?.canApply ? h('p', { className: 'tbPlanningValid' }, '所选方案无日期冲突') : null) : null,
        !capability.supported ? h('p', { className: 'tbPlanningHelp' }, capability.reason) : !capability.workspaceId && !model.sessionId ?
          button('选择会话位置', async () => { try { const id = await service.newWorkspaceSession?.(); if (id) { update(previous => ({ ...previous, sessionId: id })); setNotice('会话位置已选定，可以生成方案。') } } catch (error) { setErrors([messageOf(error)]) } }) : null,
        !model.messages.length ? h('details', { className: 'tbPlanningDetails' }, h('summary', null, '补充排期约束（可选）'),
          h('label', { className: 'tbPlanningLabel' }, '用户给定截止', h('input', { type: 'date', className: 'tbInput', value: model.deadline, 'aria-label': '用户给定截止', disabled: busyNow,
            onChange: event => update(previous => ({ ...previous, deadline: event.target.value })) })),
          h('label', { className: 'tbPlanningCheck' }, h('input', { type: 'checkbox', checked: model.allowOngoing, disabled: busyNow,
            onChange: event => update(previous => ({ ...previous, allowOngoing: event.target.checked })) }), '允许为未设截止的持续工作建议日期')) : null,
        h('details', { className: 'tbPlanningDetails tbPlanningAdvanced' }, h('summary', null, '会话与已有建议'),
          button('查看原生会话', onOpenChat),
          button('接收本轮结果 / 导入已有建议', importReply),
          h('textarea', { className: 'tbArea', 'aria-label': '手动导入完整建议', rows: 3, value: manualText, maxLength: 150000,
            onChange: event => setManualText(event.target.value), placeholder: '需要时粘贴已有完整回复' }),
          button('预览粘贴的建议', () => {
            try { const request = liveModel.current.pending?.request || revision?.request; if (!request) throw new Error('没有对应请求，请先生成规划或从本工作台会话导入。'); accept({ text: manualText }, request) }
            catch (error) { setErrors(error.issues || [messageOf(error)]) }
          }, { disabled: busyNow || !manualText.trim() }), button('开始新规划', startNew),
          [...cache.plans.keys()].some(key => key.startsWith(`history:${scopeChoice}:`)) ? button('恢复前次规划', () => {
            const key = [...cache.plans.keys()].findLast(value => value.startsWith(`history:${scopeChoice}:`))
            if (key) { update(cache.plans.get(key)); setErrors([]); setNotice('已恢复前次规划，仍会核对当前任务是否变化。') }
          }) : null)),
      composer,
      revision || cache.undo ? h('footer', { className: 'tbPlanningFooter' },
        revision ? h('button', { className: 'tbBtn tbBtnPrimary', type: 'button', onClick: confirm,
          disabled: busyNow || !draftVisible || !derived?.selected?.canApply },
        model.phase === 'applied' ? '本版方案已应用' : model.phase === 'undone' ? '本版应用已撤销' : `确认应用所选 ${selectedCount} 项`) : null,
        h('div', null, button('放弃方案', () => { update(previous => ({ ...previous, index: -1, phase: 'idle', pending: null })); setNotice('已放弃当前预览，方案版本和对话仍保留。') }, { className: 'tbPlanningLink' }),
          button('撤销上次应用', undo, { className: 'tbPlanningLink', disabled: busyNow || !cache.undo }))) : null,
    )
  }
}
