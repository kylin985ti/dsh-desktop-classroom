import {
  AI_SCHEDULE_LIMITS, getAIScheduleScopes, getAIScheduleDomains, buildPrompt, parseProposal,
  previewProposal, applyProposal, formatAIPlanRange, restoreNativeRequest,
} from './ai-schedule-model.js'

import { inspectNativeDraftHost, placeOwnedNativeDraft, inspectNativeReplyHost, readOwnedNativeReply } from './ai-native-bridge.js'
import { scanWorkspace, WORKSPACE_SCAN_LIMITS } from './workspace-scan.js'

const messageOf = problem => problem?.message || String(problem)
const EMPTY_LIST = []
const makeRequestId = () => `tb-ai-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
const confirmLabel = preview => preview.createdCount
  ? `确认应用：新增 ${preview.createdCount} 项任务${preview.changedCount ? `、${preview.changedCount} 项日期变更` : ''}`
  : `确认应用 ${preview.changedCount} 项日期变更`

/** Stable component factory, using the host React. No calls execute until a user action. */
export function createAISchedulePanel(React) {
  const h = React.createElement
  return function AISchedulePanel({ tasks = EMPTY_LIST, initialScopeId = null, service, commit,
    onClose, onOpenChat, importNonce = 0, disabled = false }) {
    const scopes = React.useMemo(() => {
      try { return { items: getAIScheduleScopes(tasks), error: '' } }
      catch (problem) { return { items: [], error: messageOf(problem) } }
    }, [tasks])
    const [scopeChoice, setScopeChoice] = React.useState(() => {
      const selected = initialScopeId && tasks.some(task => task.id === initialScopeId) ? initialScopeId : scopes.items[0]?.id
      return selected ? `branch:${selected}` : ''
    })
    const [deadline, setDeadline] = React.useState(''), [constraints, setConstraints] = React.useState('')
    const [allowOngoing, setAllowOngoing] = React.useState(false)
    const [includeWorkspace, setIncludeWorkspace] = React.useState(false), [domainChoice, setDomainChoice] = React.useState('')
    const [workspaceScan, setWorkspaceScan] = React.useState(null), [scanBusy, setScanBusy] = React.useState(false)
    const [scanProgress, setScanProgress] = React.useState(''), [selectedDocuments, setSelectedDocuments] = React.useState([])
    const scanController = React.useRef(null), scanSequence = React.useRef(0)
    const domainOptions = React.useMemo(() => {
      try { return getAIScheduleDomains(tasks, { scopeId: scopeChoice.startsWith('branch:') ? scopeChoice.slice(7) : null, allTasks: scopeChoice === 'all' }) }
      catch { return [] }
    }, [tasks, scopeChoice])
    const domainRoot = domainOptions.find(domain => domain.path === domainChoice)?.path || domainOptions[0]?.path || ''
    const domainToken = JSON.stringify([scopeChoice, domainRoot, domainOptions])
    const liveDomainToken = React.useRef(domainToken)
    liveDomainToken.current = domainToken
    const [request, setRequest] = React.useState(null), requestRef = React.useRef(null)
    const [proposalText, setProposalText] = React.useState(''), [preview, setPreview] = React.useState(null)
    const [errors, setErrors] = React.useState([]), [notice, setNotice] = React.useState('')
    const [nativeBusy, setNativeBusy] = React.useState(false), [applyBusy, setApplyBusy] = React.useState(false)
    const [replyBusy, setReplyBusy] = React.useState(false), nativeSession = React.useRef(null)
    const [minimized, setMinimized] = React.useState(false), [closing, setClosing] = React.useState(false)
    const [applied, setApplied] = React.useState(false)
    const mounted = React.useRef(true), applying = React.useRef(false), nativeFlight = React.useRef(false)
    const latestTasks = React.useRef(tasks)
    latestTasks.current = tasks
    const panelRef = React.useRef(null), promptRef = React.useRef(null), headingRef = React.useRef(null), previewRef = React.useRef(null)
    const currentScope = React.useRef(scopeChoice)
    currentScope.current = scopeChoice
    const fieldId = React.useId()
    requestRef.current = request
    const busy = nativeBusy || applyBusy || scanBusy || replyBusy
    React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; scanSequence.current++; scanController.current?.abort() } }, [])
    const dirty = !applied && (!!request || !!proposalText || !!deadline || !!constraints || allowOngoing || includeWorkspace)
    const close = () => {
      if (busy) return
      if (dirty) { setClosing(true); setMinimized(false) }
      else onClose?.()
    }
    const closeRef = React.useRef(close)
    closeRef.current = close
    React.useEffect(() => {
      if (minimized) return
      const previous = document.activeElement
      headingRef.current?.focus()
      const keys = event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation()
          closeRef.current()
        } else if (event.key === 'Tab') {
          const controls = [...(panelRef.current?.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary') || [])]
            .filter(element => element.getClientRects().length > 0)
          if (!controls.length) { event.preventDefault(); headingRef.current?.focus(); return }
          const index = controls.indexOf(document.activeElement)
          if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === controls.length - 1)) {
            event.preventDefault(); event.stopPropagation()
            controls[event.shiftKey ? controls.length - 1 : 0]?.focus()
          }
        }
      }
      document.addEventListener('keydown', keys, true)
      return () => {
        document.removeEventListener('keydown', keys, true)
        if (previous?.isConnected && panelRef.current?.contains(document.activeElement)) previous.focus?.()
      }
    }, [minimized])

    const livePreview = React.useMemo(() => {
      if (!preview || applied) return preview
      return previewProposal(tasks, preview.proposal, preview.request)
    }, [tasks, preview, applied])
    const availability = inspectNativeDraftHost(service)
    const replyAvailability = inspectNativeReplyHost(service)
    const invalidate = action => {
      action(); setRequest(null); requestRef.current = null; setPreview(null); setApplied(false)
      nativeSession.current = null
      setErrors([]); setNotice('范围或约束已变更，请重新预览上下文；不会自动发送或修改日期。')
    }
    const clearWorkspaceScan = () => {
      scanSequence.current++; scanController.current?.abort(); scanController.current = null
      setWorkspaceScan(null); setSelectedDocuments([]); setScanProgress(''); setScanBusy(false)
    }
    React.useEffect(() => { clearWorkspaceScan() }, [domainToken])
    const scanDomain = async () => {
      if (!includeWorkspace || !domainRoot || busy || disabled) return
      const sequence = ++scanSequence.current, token = domainToken, controller = new AbortController()
      scanController.current?.abort(); scanController.current = controller
      setScanBusy(true); setWorkspaceScan(null); setErrors([]); setNotice(''); setRequest(null); requestRef.current = null; setPreview(null)
      try {
        const result = await scanWorkspace(domainRoot, { signal: controller.signal,
          onProgress: value => { if (mounted.current && sequence === scanSequence.current) setScanProgress(`正在读取 ${value.relative}（${value.attempted}/${WORKSPACE_SCAN_LIMITS.files}）`) } })
        if (!mounted.current || sequence !== scanSequence.current || liveDomainToken.current !== token) return
        setWorkspaceScan(result); setSelectedDocuments(result.documents.map(file => file.relative))
        setScanProgress(''); setNotice('扫描已完成，内容仅在本地。请检查下方文件与正文，再预览上下文；尚未发送给 AI。')
      } catch (problem) {
        if (mounted.current && sequence === scanSequence.current) {
          setScanProgress('')
          if (controller.signal.aborted) setNotice('已取消扫描，没有加入 AI 上下文。')
          else setErrors([messageOf(problem)])
        }
      } finally { if (mounted.current && sequence === scanSequence.current) setScanBusy(false) }
    }
    const prepare = () => {
      setErrors([]); setNotice(''); setPreview(null); setApplied(false)
      nativeSession.current = null
      try {
        if (includeWorkspace && (!workspaceScan || workspaceScan.root !== domainRoot)) throw new Error('请先主动扫描选定工作域，或关闭“读取工作域辅助排期”。')
        const next = buildPrompt(tasks, { scopeId: scopeChoice.startsWith('branch:') ? scopeChoice.slice(7) : null,
          allTasks: scopeChoice === 'all', deadline, constraints, allowOngoing, requestId: makeRequestId(),
          ...(includeWorkspace ? { workspaceScan: { ...workspaceScan, documents: workspaceScan.documents.filter(file => selectedDocuments.includes(file.relative)) } } : {}) })
        setRequest(next); requestRef.current = next
        setNotice('上下文已在本地生成，尚未放入原生草稿，也未发送。请先检查下面的内容。')
      } catch (problem) { setRequest(null); requestRef.current = null; setErrors(problem.issues || [messageOf(problem)]) }
    }
    const requestIsFresh = target => {
      const empty = { version: 1, requestId: target.requestId, changes: [], assumptions: [], conflicts: [] }
      const check = previewProposal(latestTasks.current, empty, target)
      if (check.errors.length) throw new Error(check.errors.join('\n'))
    }
    const openNative = () => {
      setMinimized(true)
      onOpenChat?.()
    }
    const copyPrompt = async () => {
      if (!request) return
      setErrors([])
      try {
        requestIsFresh(request)
        if (typeof globalThis.navigator?.clipboard?.writeText !== 'function') throw new Error('当前环境不支持自动复制。')
        await globalThis.navigator.clipboard.writeText(request.prompt)
        if (mounted.current) setNotice('已复制所预览的提示词；请在自己的原生会话中粘贴并手动发送，回复后复制完整回答回来导入。')
      } catch (problem) {
        promptRef.current?.focus(); promptRef.current?.select()
        if (mounted.current) setErrors([`${messageOf(problem)} 提示词保持可选中，请核对后手动复制；没有向 AI 发送。`])
      }
    }
    const placeNativeDraft = async mode => {
      if (!request || disabled || nativeFlight.current) return
      const target = request
      nativeFlight.current = true; setNativeBusy(true); setErrors([]); setNotice('')
      try {
        requestIsFresh(target)
        const capability = inspectNativeDraftHost(service)
        if (!capability.supported) throw new Error(capability.reason)
        let sessionId = capability.sessionId
        if (mode === 'existing-workspace') {
          if (!capability.workspaceId || typeof service.newSession !== 'function') throw new Error('没有已确认的可用工作区；请明确选择位置新建，或复制提示词。')
          sessionId = await service.newSession(capability.workspaceId)
        } else if (mode === 'choose-workspace') {
          if (typeof service.newWorkspaceSession !== 'function') throw new Error('当前宿主不支持从工作台选择位置新建会话，请手动创建后重试。')
          // This is the sole picker path: only this explicitly named button invokes it.
          sessionId = await service.newWorkspaceSession()
          if (!sessionId) { if (mounted.current) setNotice('已取消选择位置，未放入任何草稿。'); return }
        }
        await placeOwnedNativeDraft({
          service, sessionId, prompt: target.prompt,
          isCurrent: () => mounted.current && requestRef.current === target,
          validate: () => requestIsFresh(target),
        })
        if (mounted.current) {
          nativeSession.current = sessionId
          setNotice('已放入本工作台原生草稿。手动发送并等待回复完成后，点击“导入本次 AI 建议”即可校验预览。')
          openNative()
        }
      } catch (problem) { if (mounted.current) setErrors([`${messageOf(problem)} 可选中或复制下面的提示词手动使用。`]) }
      finally {
        nativeFlight.current = false
        if (mounted.current) setNativeBusy(false)
      }
    }
    const importPreview = () => {
      setErrors([]); setNotice(''); setApplied(false)
      try {
        if (!request) throw new Error('请先预览上下文并使用本次提示词；不能导入没有对应上下文的 JSON。')
        const proposal = parseProposal(proposalText)
        const next = previewProposal(tasks, proposal, request)
        setPreview(next)
        if (next.noOp) setNotice('提案没有实际日期变更或新增任务，不会写入。')
      } catch (problem) { setPreview(null); setErrors(problem.issues || [messageOf(problem)]) }
    }
    const importNative = async () => {
      if (disabled || busy || applied || nativeFlight.current) return
      const target = requestRef.current, scope = scopeChoice
      nativeFlight.current = true; setReplyBusy(true); setErrors([]); setNotice(''); setClosing(false); setMinimized(false)
      try {
        const result = await readOwnedNativeReply({ service, sessionId: nativeSession.current,
          isCurrent: () => mounted.current && requestRef.current === target && currentScope.current === scope,
          validate: () => { if (target) requestIsFresh(target) },
        })
        const proposal = parseProposal(result.text)
        const restored = restoreNativeRequest(latestTasks.current, { prompt: result.prompt, requestId: proposal.requestId,
          scopeId: scope.startsWith('branch:') ? scope.slice(7) : null, allTasks: scope === 'all' })
        if (target && proposal.requestId !== target.requestId) throw new Error('AI 回复不是本次请求，请切回对应会话；没有导入其他建议。')
        const nextRequest = target || restored
        const next = previewProposal(latestTasks.current, proposal, nextRequest)
        if (!mounted.current || requestRef.current !== target || currentScope.current !== scope) return
        if (!target) {
          setRequest(restored); requestRef.current = restored
          setDeadline(restored.options.deadline); setConstraints(restored.options.constraints); setAllowOngoing(restored.options.allowOngoing)
        }
        nativeSession.current = result.sessionId
        setProposalText(result.text); setPreview(next); setApplied(false)
        setNotice(next.noOp ? '已导入原生建议，没有实际日期变更或新增任务，不会写入。'
          : '已从当前原生会话导入完整建议并完成校验。请核对下方新增任务、层级和日期；点击“确认应用”才会保存。')
      } catch (problem) { if (mounted.current) { setPreview(null); setErrors(problem.issues || [messageOf(problem)]) } }
      finally { nativeFlight.current = false; if (mounted.current) setReplyBusy(false) }
    }
    const importAction = React.useRef(importNative)
    importAction.current = importNative
    React.useEffect(() => { if (importNonce) void importAction.current() }, [importNonce])
    React.useEffect(() => {
      if (!preview || minimized) return
      previewRef.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
      previewRef.current?.focus?.({ preventScroll: true })
    }, [preview, minimized])
    const confirmApply = async () => {
      if (disabled || applying.current || !preview || !livePreview?.canApply || applied) return
      if (typeof commit !== 'function') { setErrors(['当前界面没有可用的原子提交通道，不能应用提案。']); return }
      applying.current = true; setApplyBusy(true); setErrors([]); setNotice('')
      try {
        // Exactly one functional commit; validation reruns on its latest live snapshot.
        const outcome = await commit(latest => applyProposal(latest, preview))
        if (outcome === false) throw new Error('提案保存失败，任务与日期未确认落盘。请检查保存错误并重新预览后重试。')
        if (mounted.current) {
          setApplied(true)
          setNotice(preview.createdCount
            ? `已确认新增 ${preview.createdCount} 项待办任务${preview.changedCount ? `，并应用 ${preview.changedCount} 项原有日期变更` : ''}。原有任务的负责人、状态、笔记与实际完成时间未改动；此提案不能再次应用。`
            : `已确认并应用 ${preview.changedCount} 项日期变更。负责人、状态、笔记与实际完成时间未改动；此提案不能再次应用。`)
        }
      } catch (problem) { if (mounted.current) setErrors(problem.issues || [messageOf(problem)]) }
      finally { applying.current = false; if (mounted.current) setApplyBusy(false) }
    }
    const issueList = (items, label, className = 'tbAIIssues') => items?.length ? h('div', { className, role: className === 'tbAIIssues' ? 'alert' : 'note' },
      h('strong', null, label), h('ul', null, items.map((text, index) => h('li', { key: index }, String(text))))) : null
    const button = (label, onClick, extra = {}) => h('button', { type: 'button', className: 'tbBtn', onClick, ...extra }, label)
    const chosenTask = tasks.find(task => `branch:${task.id}` === scopeChoice)
    const scopeItems = chosenTask && !scopes.items.some(item => item.id === chosenTask.id)
      ? [{ id: chosenTask.id, title: `${chosenTask.title || chosenTask.id}（当前分支）` }, ...scopes.items] : scopes.items

    if (minimized) return h('aside', { className: 'tbAIDock', 'data-ai-schedule-dock': true, 'aria-label': 'AI 排期提案待导入' },
      h('span', { className: 'tbAIStatus' }, '仅建议 · 等待导入 AI 完整回复'),
      button('导入本次 AI 建议', importNative, { className: 'tbBtn tbBtnPrimary', disabled: busy || disabled || !replyAvailability.supported || !replyAvailability.owned }),
      button('返回 AI 排期预览', () => { setMinimized(false); setClosing(false) }),
      button('关闭', close, { disabled: busy, 'aria-label': '关闭 AI 排期提案' }))

    return h('div', { className: 'tbAIShade', 'data-ai-schedule-scope': true },
      h('section', { className: 'tbAI', ref: panelRef, role: 'dialog', 'aria-modal': true, 'aria-labelledby': `${fieldId}-title` },
        h('header', { className: 'tbAIHeader' }, h('div', null,
          h('h2', { id: `${fieldId}-title`, tabIndex: -1, ref: headingRef }, 'AI 辅助排期'),
          h('p', null, '选择范围 → 预览上下文 → 原生会话手动发送 → 一键导入建议 → 确认应用')),
          button('关闭', close, { disabled: busy, 'aria-label': '关闭 AI 排期' })),
        h('div', { className: 'tbAIBody' },
          h('div', { className: 'tbAISafety' }, '默认只分析任务。只有勾选并主动扫描工作域才读取文件；结果先在本地展示，不自动发送。确认应用可更新原有叶任务日期，并创建预览中的待办任务与子任务；不更改已有任务的负责人、状态、笔记或实际完成时间，不操作工作域文件。'),
          closing ? h('div', { className: 'tbAICloseConfirm', role: 'alert' },
            h('strong', null, '关闭后会丢失本地未应用的提示词、约束与粘贴内容。任务不会改动，原生会话草稿不会被删除。'),
            h('div', { className: 'tbAIActions' }, button('继续排期', () => setClosing(false)), button('丢弃本地草稿并关闭', () => onClose?.(), { disabled: busy }))) : null,
          issueList([...errors, ...(scopes.error ? [scopes.error] : [])], '无法继续'),
          notice ? h('p', { className: 'tbAINotice', role: 'status' }, notice) : null,
          h('section', { className: 'tbAIStep', 'aria-labelledby': `${fieldId}-scope` },
            h('h3', { id: `${fieldId}-scope` }, '1 · 选定任务与用户约束'),
            h('div', { className: 'tbAIFields' },
              h('label', null, '排期范围', h('select', { className: 'tbSelect', 'aria-label': '排期范围', value: scopeChoice, disabled: busy || disabled,
                onChange: event => invalidate(() => setScopeChoice(event.target.value)) },
                !scopeItems.length ? h('option', { value: '' }, '暂无任务') : null,
                scopeItems.map(item => h('option', { value: `branch:${item.id}`, key: item.id }, `${item.title}（含全部下级）`)),
                h('option', { value: 'all' }, '明确选择全部任务（含全部历史任务）'))),
              h('label', null, '用户给定截止（可选）', h('input', { type: 'date', className: 'tbInput', 'aria-label': '用户给定截止', value: deadline, disabled: busy || disabled,
                onChange: event => invalidate(() => setDeadline(event.target.value)) }))),
            scopeChoice === 'all' ? h('p', { className: 'tbAIWarning' }, '已明确选择全部任务；超过 100 项时必须缩小范围，不会静默截断任务。') : null,
            h('label', { className: 'tbAILabel' }, '工作量与约束（可选，均由你提供）', h('textarea', { className: 'tbArea', 'aria-label': '工作量与约束', rows: 3,
              placeholder: '例如：每天可投入 2 小时、某任务必须先完成；没有填写就按未知处理。', value: constraints,
              maxLength: AI_SCHEDULE_LIMITS.constraints, disabled: busy || disabled, onChange: event => invalidate(() => setConstraints(event.target.value)) })),
            h('label', { className: 'tbAICheck' }, h('input', { type: 'checkbox', checked: allowOngoing, disabled: busy || disabled,
              onChange: event => invalidate(() => setAllowOngoing(event.target.checked)) }), '本次明确允许为未设截止的持续性工作建议日期（默认不允许）'),
            h('section', { className: 'tbAIWorkspace', 'aria-label': '可选工作域扫描' },
              h('label', { className: 'tbAICheck' }, h('input', { type: 'checkbox', checked: includeWorkspace, disabled: busy || disabled,
                onChange: event => invalidate(() => { setIncludeWorkspace(event.target.checked); if (!event.target.checked) clearWorkspaceScan() }) }), '读取工作域辅助排期（可选）'),
              includeWorkspace ? h(React.Fragment, null,
                !domainRoot ? h('p', { className: 'tbAIHelp' }, '所选任务及其父级尚未绑定工作域，请先在任务详情选择文件夹。') : h(React.Fragment, null,
                  h('label', { className: 'tbAILabel' }, '扫描工作域', h('select', { className: 'tbSelect', 'aria-label': '扫描工作域', value: domainRoot, disabled: busy,
                    onChange: event => invalidate(() => { clearWorkspaceScan(); setDomainChoice(event.target.value) }) },
                    domainOptions.map(domain => h('option', { key: domain.path, value: domain.path }, `${domain.titles.join('、')} · ${domain.path}`)))),
                  h('p', { className: 'tbAIHelp' }, `递归浏览这个工作域的可读文本索引，跳过隐藏、常见凭据、依赖与构建文件。最多列出 ${WORKSPACE_SCAN_LIMITS.index} 个文件名、读取 ${WORKSPACE_SCAN_LIMITS.files} 篇正文，共 ${WORKSPACE_SCAN_LIMITS.content} 字；扫描不代表全部文件已审阅。`),
                  h('div', { className: 'tbAIActions' }, button(scanBusy ? '正在扫描…' : '扫描工作域', scanDomain, { disabled: busy || disabled }),
                    scanBusy ? button('取消扫描', () => scanController.current?.abort()) : null,
                    workspaceScan ? button('清除扫描结果', () => invalidate(clearWorkspaceScan), { disabled: busy }) : null),
                  scanProgress ? h('p', { className: 'tbAIHelp', role: 'status' }, scanProgress) : null,
                  workspaceScan ? h('div', { className: 'tbAIWorkspaceResult' },
                    h('p', { role: 'status' }, `已列出 ${workspaceScan.files.length} 个文件，读取 ${workspaceScan.documents.length} 篇正文；本次选择 ${selectedDocuments.length} 篇加入上下文。`),
                    workspaceScan.coverage.listingMayBeLimited ? h('p', { className: 'tbAIWarning' }, '宿主索引已达 400 项上限，仍可能有未列出的文件；不能据此声称扫描完整。') : null,
                    h('details', null, h('summary', null, '检查文件索引与已读取正文'),
                      h('ul', { className: 'tbAIFileIndex' }, workspaceScan.files.map(file => h('li', { key: file.relative }, file.relative,
                        h('span', null, workspaceScan.documents.some(document => document.relative === file.relative) ? '已读取' : '仅文件名')))),
                      workspaceScan.documents.map(file => h('details', { className: 'tbAIWorkspaceDocument', key: file.relative },
                        h('summary', null, file.relative, file.truncated ? '（正文已截断）' : ''),
                        h('label', { className: 'tbAICheck' }, h('input', { type: 'checkbox', checked: selectedDocuments.includes(file.relative),
                          'aria-label': `加入正文：${file.relative}`, onChange: event => invalidate(() => setSelectedDocuments(previous => event.target.checked ? [...previous, file.relative] : previous.filter(value => value !== file.relative))) }), '将这篇正文加入 AI 上下文'),
                        h('pre', null, file.content)))),
                    issueList(workspaceScan.warnings, '未读取的内容', 'tbAIWarnings')) : null)) : null),
            h('div', { className: 'tbAIActions' }, button('预览本次上下文', prepare, { className: 'tbBtn tbBtnPrimary', disabled: busy || disabled || !tasks.length && scopeChoice !== 'all' }))),
          request ? h('section', { className: 'tbAIStep', 'aria-labelledby': `${fieldId}-context` },
            h('h3', { id: `${fieldId}-context` }, '2 · 检查后，放入原生会话草稿'),
            h('p', { className: 'tbAIHelp' }, request.restoredFromNative ? '已从原生会话恢复已发送资料，并核对任务范围、日期、状态及用户约束。没有重新扫描文件；工作域建议只供审阅。如需重新建议，请先重新预览上下文。' : `本次 ${request.scopeIds.length} 项任务，${request.editableIds.length} 项允许建议日期。包含标题、笔记、计划、状态与层级；${request.context.workspace ? `另含主动扫描的文件索引与 ${request.context.workspace.documents.length} 篇正文片段，不含绝对工作域路径。` : '不包含工作域路径、文件内容或负责人。'}单项笔记最多 ${AI_SCHEDULE_LIMITS.note} 字。`),
            h('label', { className: 'tbAILabel' }, '发送给 AI 的完整内容（中文资料与格式说明）', h('textarea', { className: 'tbArea', ref: promptRef,
              value: request.prompt, readOnly: true, rows: 8, 'aria-label': '本次 AI 排期上下文与提示词' })),
            !availability.supported ? h('p', { className: 'tbAIHelp' }, availability.reason) : !availability.owned ? h('p', { className: 'tbAIHelp' }, '尚无正在显示且属于本工作台的会话。可明确新建，或复制后在原生会话中手动使用。') : null,
            h('div', { className: 'tbAIActions' },
              button(nativeBusy ? '正在准备草稿…' : '放入当前工作台会话草稿', () => placeNativeDraft('current'), { className: 'tbBtn tbBtnPrimary', disabled: busy || disabled || !availability.supported || !availability.owned || (!request.editableIds.length && !request.context.workspace && request.proposalVersion !== 2) }),
              button('复制提示词', copyPrompt, { disabled: busy }),
              button('打开原生会话', openNative, { disabled: busy })),
            availability.supported ? h('details', { className: 'tbAINativeOptions' }, h('summary', null, '需要新的本工作台会话？（不自动发送）'),
              h('div', { className: 'tbAIActions' },
                button('在已确认工作区新建会话并放入草稿', () => placeNativeDraft('existing-workspace'), { disabled: busy || disabled || !availability.workspaceId || (!request.editableIds.length && !request.context.workspace && request.proposalVersion !== 2) }),
                button('选择文件夹位置并新建会话草稿', () => placeNativeDraft('choose-workspace'), { disabled: busy || disabled || typeof service?.newWorkspaceSession !== 'function' || (!request.editableIds.length && !request.context.workspace && request.proposalVersion !== 2) }))) : null,
            h('p', { className: 'tbAIHelp' }, '草稿按原生会话规则保存，已有文字/附件不会被覆盖。原生消息仍由你手动发送；回复完成后点击“导入本次 AI 建议”。只读取当前本工作台会话，不自动读取其他会话或应用日期；手动粘贴仍可使用。')) : null,
          h('section', { className: 'tbAIStep', 'aria-labelledby': `${fieldId}-import` },
            h('h3', { id: `${fieldId}-import` }, '3 · 导入原生 AI 建议'),
            h('div', { className: 'tbAIActions' }, button(replyBusy ? '正在导入建议…' : '导入本次 AI 建议', importNative,
              { className: 'tbBtn tbBtnPrimary', disabled: busy || disabled || applied || !replyAvailability.supported || !replyAvailability.owned })),
            h('p', { className: 'tbAIHelp' }, replyAvailability.supported && replyAvailability.owned ? '一键读取当前会话已完成的回复，核对请求后展示新增任务、父子层级及日期，无需复制粘贴。导入只预览，另行确认才保存。' : replyAvailability.reason || '请先打开属于本任务栏工作台的原生会话；也可以在下方手动粘贴。'),
            h('label', { className: 'tbAILabel' }, 'AI 完整回复（中文建议与导入数据，无需手工拆分）', h('textarea', { className: 'tbArea', 'aria-label': '本次提案 JSON（仅作为数据校验，不执行内容）', value: proposalText,
              rows: 7, maxLength: AI_SCHEDULE_LIMITS.proposal, disabled: busy || disabled,
              placeholder: '直接粘贴本次 AI 完整回复，保留末尾“工作台导入数据”代码块。也兼容旧版纯 JSON；不要拼接多份回复。',
              onChange: event => { setProposalText(event.target.value); setPreview(null); setApplied(false); setErrors([]) } })),
            h('div', { className: 'tbAIActions' }, button('校验并预览 JSON 提案', importPreview, { disabled: busy || disabled || !request || !proposalText.trim() }))),
          livePreview ? h('section', { className: 'tbAIStep', 'aria-labelledby': `${fieldId}-preview` },
            h('h3', { id: `${fieldId}-preview`, ref: previewRef, tabIndex: -1 }, '4 · 核对任务与日期，手动确认'),
            issueList(livePreview.errors, '冲突：下列问题全部解决前不能应用'),
            issueList(livePreview.warnings, '核对提醒', 'tbAIWarnings'),
            issueList(livePreview.proposal.assumptions, 'AI 全局假设（不是事实）', 'tbAIWarnings'),
            issueList(livePreview.proposal.workspaceSuggestions, '工作域文字建议（仅供审阅；可导入任务见下方）', 'tbAIWarnings'),
            livePreview.creationRows.length ? h('section', { className: 'tbAINewTasks', 'aria-label': '新增任务与子任务预览' },
              h('strong', null, `新增 ${livePreview.createdCount} 项待办任务（确认前尚未创建）`),
              h('div', { className: 'tbAIProposalList' }, livePreview.creationRows.map(row => h('article', {
                className: 'tbAIProposal tbAINewTask', key: row.ref, style: { marginLeft: `${Math.min(row.depth, 6) * 14}px` } },
                h('div', { className: 'tbAIProposalTitle' }, h('strong', null, row.title), h('span', { className: 'tbAIStatus' }, row.automatic ? '新增父任务 · 待办' : '新增任务 · 待办')),
                h('p', { className: 'tbAIHelp' }, row.path),
                h('div', { className: 'tbAIRange' }, h('span', null, row.automatic ? '自动汇总' : '计划'), h('code', null, formatAIPlanRange(row.after))),
                h('p', null, h('strong', null, '笔记：'), row.note || '未填写'),
                h('p', null, h('strong', null, '新增理由：'), row.reason),
                h('p', { className: 'tbAIHelp' }, `AI 预计工期：${row.estimatedDurationDays === null ? '未知' : `${row.estimatedDurationDays} 天（估计）`}`),
                issueList(row.assumptions, '新增假设（待核对）', 'tbAIWarnings'))))) : null,
            h('div', { className: 'tbAIProposalList' }, livePreview.rows.map(row => h('article', { className: 'tbAIProposal', key: row.id },
              h('div', { className: 'tbAIProposalTitle' }, h('strong', null, row.title), h('span', { className: 'tbAIStatus' }, row.changed ? '拟变更' : '无变化')),
              h('div', { className: 'tbAIRange' }, h('span', null, '变更前'), h('code', null, formatAIPlanRange(row.before)),
                h('span', null, '建议后'), h('code', null, formatAIPlanRange(row.after))),
              h('p', null, h('strong', null, '理由：'), row.reason),
              h('p', { className: 'tbAIHelp' }, `AI 预计工期：${row.estimatedDurationDays === null ? '未知' : `${row.estimatedDurationDays} 天（估计）`}${row.calendarSpanDays === null ? '' : `；计划跨度 ${row.calendarSpanDays} 个日历日`}`),
              issueList(row.assumptions, '本项假设/估计依据', 'tbAIWarnings')))),
            livePreview.parentRows.length ? h('div', { className: 'tbAIParentChanges' }, h('strong', null, '自动父级汇总随之重新计算（不写入父级日期）'),
              livePreview.parentRows.map(row => h('p', { key: row.id }, `${row.title}：${formatAIPlanRange(row.before)} → ${formatAIPlanRange(row.after)}`))) : null,
            !livePreview.rows.length && !livePreview.createdCount && !livePreview.errors.length ? h('p', { className: 'tbAIHelp' }, '没有建议的日期变更或新增任务。') : null,
            h('p', { className: 'tbAIHelp' }, '应用前核对新增名称、父子层级、笔记与日期；新任务均为待办。若预览已过期，整批拒绝，不会部分应用。已有任务的负责人、笔记、状态、计划模式与实际完成时间保持不变。'),
            h('div', { className: 'tbAIActions' }, button(applyBusy ? '正在保存…' : applied ? '本提案已应用' : confirmLabel(livePreview), confirmApply,
              { className: 'tbBtn tbBtnPrimary', disabled: busy || disabled || applied || !livePreview.canApply }),
              livePreview.noOp ? h('span', { className: 'tbAIHelp' }, '无实际变更，不会写入。') : null)) : null,
        ),
      ),
    )
  }
}
