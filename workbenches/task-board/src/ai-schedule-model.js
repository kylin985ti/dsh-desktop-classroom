import {
  isPlanDate, dateToDay, getSchedules, validateScheduleState, applyScheduleChanges,
} from '../dsh/schedule-model.js'
import { workspacePromptContext } from './workspace-scan.js'
import { formatSchedulePrompt } from './ai-prompt-format.js'
import { NEW_TASK_LIMIT, NEW_TASK_FIELDS, canReceiveNewTask, planNewTasks } from './ai-task-creation.js'

/** Local-only proposal protocol. Nothing in this module sends prompts or writes files. */
export const AI_SCHEDULE_LIMITS = Object.freeze({
  tasks: 100, note: 2000, title: 500, constraints: 4000, prompt: 60000,
  proposal: 150000, reason: 2000, assumptions: 12, conflicts: 30,
})
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const SETTLED = new Set(['done', 'dropped'])
const TOP_FIELDS = new Set(['version', 'requestId', 'changes', 'assumptions', 'conflicts'])
const TOP_ALLOWED_FIELDS = new Set([...TOP_FIELDS, 'workspaceSuggestions'])
const TOP_V2_FIELDS = new Set([...TOP_ALLOWED_FIELDS, 'newTasks'])
const CHANGE_FIELDS = new Set(['id', 'planStartDate', 'planEndDate', 'reason', 'estimatedDurationDays', 'assumptions'])
const BASE_FIELDS = ['parentId', 'status', 'planStartDate', 'planEndDate', 'planMode']
const emptyDate = value => value === undefined || value === null || value === ''
const sameDate = (left, right) => (emptyDate(left) && emptyDate(right)) || Object.is(left, right)
const displayDate = value => emptyDate(value) ? '未安排' : value
const messageOf = problem => problem?.message || String(problem)

function failure(messages) {
  const error = new Error(messages.join('\n'))
  error.issues = [...messages]
  return error
}
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const item of Object.values(value)) deepFreeze(item)
  }
  return value
}
function indexTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error('任务列表必须是数组。')
  const byId = new Map()
  for (const task of tasks) {
    if (!plain(task) || typeof task.id !== 'string' || !task.id || byId.has(task.id)) {
      throw new Error('任务列表含有无效或重复的任务 ID。')
    }
    byId.set(task.id, task)
  }
  const children = new Map([...byId.keys()].map(id => [id, []]))
  const roots = []
  for (const task of tasks) {
    if (byId.has(task.parentId)) children.get(task.parentId).push(task.id)
    else roots.push(task.id)
  }
  // Cyclic legacy records stay selectable, but cannot be sent as a false hierarchy.
  const reached = new Set(), stack = [...roots]
  while (stack.length) {
    const id = stack.pop()
    if (reached.has(id)) continue
    reached.add(id)
    stack.push(...children.get(id))
  }
  const cyclic = new Set([...byId.keys()].filter(id => !reached.has(id)))
  return { byId, children, roots: [...roots, ...cyclic], cyclic }
}

/** All source roots, including settled roots; never infer scope from today's visible board. */
export function getAIScheduleScopes(tasks) {
  const index = indexTasks(tasks)
  return index.roots.map(id => ({ id, title: String(index.byId.get(id).title || id) }))
}

function resolveScope(tasks, { scopeId = null, allTasks = false } = {}) {
  const index = indexTasks(tasks)
  if (!index.byId.size && allTasks !== true) throw new Error('没有可用于排期的任务；新增一级任务请明确选择全部任务。')
  const chosen = allTasks === true ? null : scopeId || index.roots[0]
  if (allTasks !== true && !index.byId.has(chosen)) throw new Error('所选任务范围已不存在，请重新选择。')
  const ids = new Set(), stack = allTasks === true ? [...index.roots] : [chosen]
  while (stack.length) {
    const id = stack.pop()
    if (ids.has(id)) continue
    ids.add(id)
    stack.push(...index.children.get(id))
  }
  if ([...ids].some(id => index.cyclic.has(id))) throw new Error('所选任务层级含循环，请先修复层级后排期。')
  const ancestors = new Set()
  if (chosen) {
    let parent = index.byId.get(chosen).parentId
    while (index.byId.has(parent) && !ancestors.has(parent)) {
      ancestors.add(parent)
      parent = index.byId.get(parent).parentId
    }
  }
  const contextIds = new Set([...ids, ...ancestors])
  if (contextIds.size > AI_SCHEDULE_LIMITS.tasks) {
    throw new Error(`当前范围及必要父级共 ${contextIds.size} 项，超过 ${AI_SCHEDULE_LIMITS.tasks} 项上限；请选择较小分支。`)
  }
  return { ...index, chosen, allTasks: allTasks === true, ids, ancestors, contextIds }
}

/** Existing task bindings only. Inspecting choices never lists or reads files. */
export function getAIScheduleDomains(tasks, options = {}) {
  if (!tasks.length) return []
  const scope = resolveScope(tasks, options), domains = new Map()
  for (const task of tasks) {
    const path = task.domain?.path
    if (!scope.contextIds.has(task.id) || typeof path !== 'string' || !path.startsWith('/') || path.includes('\0')) continue
    const normalized = path.replace(/\/+$/, '') || '/'
    if (!domains.has(normalized)) domains.set(normalized, { path: normalized, titles: [], taskIds: [] })
    const domain = domains.get(normalized)
    domain.titles.push(String(task.title || task.id)); domain.taskIds.push(task.id)
  }
  return [...domains.values()]
}

function eligibility(task, index, allowOngoing) {
  if (index.children.get(task.id).length) return '父任务仅作为边界/自动汇总，不由 AI 修改。'
  if (SETTLED.has(task.status)) return '已完成或废弃任务保持原样。'
  if (task.status === 'ongoing' && emptyDate(task.planEndDate) && !allowOngoing) {
    return '持续性工作未设截止，默认保持未排期。'
  }
  return null
}
function snapshotBaseline(tasks, scope) {
  const index = indexTasks(tasks)
  return [...scope.contextIds].sort().map(id => {
    const task = index.byId.get(id)
    if (!task) return { id, missing: true }
    return {
      id,
      fields: BASE_FIELDS.map(field => [field, own(task, field), task[field] ?? null]),
      children: [...index.children.get(id)].sort(),
    }
  })
}
const snapshotCreationFacts = scope => [...scope.contextIds].sort().map(id => {
  const task = scope.byId.get(id)
  return [id, task?.title || '', task?.note || '']
})
function checkRequest(tasks, request) {
  if (!request || request.protocol !== 'taskboard-ai-schedule/1') throw new Error('请先预览本次任务上下文。')
  const scope = resolveScope(tasks, request.options)
  if (request.workspaceBinding && JSON.stringify(getAIScheduleDomains(tasks, request.options)) !== JSON.stringify(request.workspaceBinding)) {
    throw new Error('工作域绑定已变化，请重新扫描并预览上下文。')
  }
  if (JSON.stringify([...scope.ids].sort()) !== JSON.stringify([...request.scopeIds].sort())
    || JSON.stringify(snapshotBaseline(tasks, scope)) !== JSON.stringify(request.baseline)) {
    throw new Error('任务日期、状态或层级已变化，本提案已过期；请重新预览上下文并生成提案。')
  }
  return scope
}

/** Whitelist task fields and bound note/total size before any explicit native-draft action. */
export function buildPrompt(tasks, options = {}) {
  const scope = resolveScope(tasks, options)
  const deadline = options.deadline ?? ''
  const constraints = options.constraints ?? ''
  const requestId = options.requestId ?? 'taskboard-schedule-v1'
  const proposalVersion = options.proposalVersion ?? 2
  if (![1, 2].includes(proposalVersion)) throw new Error('不支持这次提案版本，请重新预览上下文。')
  if (deadline !== '' && !isPlanDate(deadline)) throw new Error('用户截止日期必须是有效的 YYYY-MM-DD，或留空。')
  if (typeof constraints !== 'string' || constraints.length > AI_SCHEDULE_LIMITS.constraints) {
    throw new Error(`工作量/约束说明最多 ${AI_SCHEDULE_LIMITS.constraints} 字。`)
  }
  if (typeof requestId !== 'string' || !requestId || requestId.length > 120) throw new Error('提案请求标识无效。')
  const normalizedOptions = {
    scopeId: scope.chosen, allTasks: scope.allTasks, allowOngoing: options.allowOngoing === true,
    deadline, constraints, requestId, proposalVersion,
  }
  const scheduled = getSchedules(tasks)
  const contextTask = task => {
    const effective = scheduled.get(task.id)
    const note = typeof task.note === 'string' ? task.note : ''
    return {
      id: task.id, parentId: scope.byId.has(task.parentId) ? task.parentId : null,
      title: String(task.title || '').slice(0, AI_SCHEDULE_LIMITS.title),
      note: note.slice(0, AI_SCHEDULE_LIMITS.note),
      ...(note.length > AI_SCHEDULE_LIMITS.note ? { noteTruncated: true } : {}),
      status: task.status || 'todo', planStartDate: task.planStartDate ?? null,
      planEndDate: task.planEndDate ?? null, planMode: task.planMode ?? null,
      effectivePlan: { start: effective.start, end: effective.end, automatic: effective.auto },
      editable: scope.ids.has(task.id) && eligibility(task, scope, normalizedOptions.allowOngoing) === null,
      ...(proposalVersion === 2 ? { canReceiveNewTask: canReceiveNewTask(task.id, scope) } : {}),
    }
  }
  const context = {
    requestId, scope: scope.allTasks ? { kind: 'all-explicit' } : { kind: 'branch', id: scope.chosen },
    userDeadline: deadline || null, userWorkloadAndConstraints: constraints,
    allowSchedulingOpenEndedOngoing: normalizedOptions.allowOngoing,
    tasks: tasks.filter(task => scope.ids.has(task.id)).map(contextTask),
    ancestorsForBoundsOnly: tasks.filter(task => scope.ancestors.has(task.id)).map(contextTask),
  }
  let workspaceBinding = null
  if (options.workspaceScan !== undefined) {
    workspaceBinding = getAIScheduleDomains(tasks, normalizedOptions)
    if (!workspaceBinding.some(domain => domain.path === options.workspaceScan?.root)) throw new Error('扫描工作域不属于本次任务范围，请重新选择并扫描。')
    context.workspace = workspacePromptContext(options.workspaceScan)
  }
  const schema = {
    version: proposalVersion, requestId,
    changes: [{ id: '仅 editable=true 的叶任务 ID', planStartDate: 'YYYY-MM-DD 或 null/空字符串',
      planEndDate: 'YYYY-MM-DD 或 null/空字符串', reason: '日期建议的理由',
      estimatedDurationDays: null, assumptions: ['如估计工期，请明确说明估计、依据与不确定性'] }],
    assumptions: ['全局假设；无则空数组'], conflicts: ['尚未解决的冲突；无则空数组'],
    ...(proposalVersion === 2 ? { newTasks: [{ ref: 'new-1', title: '建议新增的任务名称',
      parentId: scope.allTasks ? null : scope.chosen, parentRef: null, note: '',
      planStartDate: null, planEndDate: null, reason: '新增任务的依据', estimatedDurationDays: null,
      assumptions: ['尚待核对的假设；无则空数组'] }] } : {}),
    ...(context.workspace ? { workspaceSuggestions: ['工作域推进建议，写明依据的相对文件路径；需要导入的新任务须列入 newTasks，不执行文件操作。'] } : {}),
  }
  const prompt = formatSchedulePrompt(context, schema)
  if (prompt.length > AI_SCHEDULE_LIMITS.prompt) throw new Error('上下文仍过长，请选择较小分支或缩短约束说明。')
  return deepFreeze({
    protocol: 'taskboard-ai-schedule/1', requestId, proposalVersion, prompt, context,
    options: normalizedOptions, scopeIds: [...scope.ids],
    editableIds: context.tasks.filter(task => task.editable).map(task => task.id),
    baseline: snapshotBaseline(tasks, scope), ...(workspaceBinding ? { workspaceBinding } : {}),
    ...(proposalVersion === 2 ? { creationBaseline: snapshotCreationFacts(scope) } : {}),
  })
}

// Split only headings outside fenced data; notes and file bodies cannot inject
// a second task section, constraints, or import identity.
function readableSections(prompt) {
  const sections = new Map()
  let fence = null, title = null, lines = []
  const finish = () => {
    if (title === null) return
    if (sections.has(title)) throw new Error('原生上下文含重复段落，请重新生成建议。')
    sections.set(title, lines.join('\n').trim())
  }
  for (const line of prompt.replace(/\r\n/g, '\n').split('\n')) {
    if (fence) {
      lines.push(line)
      if (line === fence) fence = null
      continue
    }
    const opening = /^(~{3,}|`{3,})(?:text|json)?$/.exec(line)
    if (opening) { fence = opening[1]; lines.push(line); continue }
    if (line.startsWith('## ')) { finish(); title = line.slice(3); lines = [] }
    else lines.push(line)
  }
  if (fence) throw new Error('原生上下文数据块不完整，请重新生成建议。')
  finish()
  return sections
}

/** Recover a closed panel only when the original sent task facts still match. */
export function restoreNativeRequest(tasks, { prompt, requestId, scopeId = null, allTasks = false }) {
  if (typeof prompt !== 'string' || !prompt.startsWith('# 排期与工作域建议\n') || prompt.length > AI_SCHEDULE_LIMITS.prompt) throw new Error('这条回复缺少可核对的排期上下文，请重新生成。')
  const sections = readableSections(prompt)
  const schema = sections.get('回复方式')?.match(/```json\n([\s\S]*?)\n```$/)
  const format = schema && JSON.parse(schema[1])
  if (!format || format.requestId !== requestId) throw new Error('AI 回复与原生请求标识不符，未导入。')
  const data = sections.get('本轮用户约束')?.match(/^(~{3,})text\n([\s\S]*)\n\1$/)?.[2]
  const inputs = data?.match(/^用户给定截止：([^\n]+)\n工作量与约束：\n([\s\S]*)\n允许为未设截止的持续性工作建议日期：(是|否)$/)
  if (!inputs) throw new Error('无法恢复本次用户约束，请重新预览上下文。')
  const deadline = inputs[1] === '未知（未填写，不是已有承诺）' ? '' : inputs[1]
  const constraints = inputs[2] === '未填写，工作量未知' ? '' : inputs[2]
  const request = buildPrompt(tasks, { scopeId, allTasks, requestId, deadline, constraints, allowOngoing: inputs[3] === '是', proposalVersion: format.version })
  const current = readableSections(request.prompt)
  for (const name of ['任务资料', '父级边界参考（不允许修改）']) {
    if (sections.get(name) !== current.get(name)) throw new Error('任务范围、日期、状态或资料与原生建议不符，可能已应用或已过期；请选择对应范围，或重新生成建议。')
  }
  return deepFreeze({ ...request, prompt, restoredFromNative: true,
    ...(sections.has('工作域资料') ? { workspaceBinding: getAIScheduleDomains(tasks, request.options) } : {}) })
}

function proposalIssues(proposal) {
  const issues = []
  const add = text => issues.push(text)
  const exactFields = (value, fields, label, required = fields) => {
    if (!plain(value)) { add(`${label}必须是 JSON 对象。`); return false }
    for (const key of Object.keys(value)) if (!fields.has(key)) add(`${label}含不允许的字段：${key}。`)
    for (const key of required) if (!own(value, key)) add(`${label}缺少字段：${key}。`)
    return true
  }
  const strings = (value, label, max) => {
    if (!Array.isArray(value) || value.length > max) { add(`${label}必须是最多 ${max} 项的文本数组。`); return }
    for (const [index, text] of value.entries()) {
      if (typeof text !== 'string' || !text.trim() || text.length > AI_SCHEDULE_LIMITS.reason) add(`${label}第 ${index + 1} 项须为非空、最多 ${AI_SCHEDULE_LIMITS.reason} 字的文本。`)
    }
  }
  const version2 = proposal?.version === 2
  if (!exactFields(proposal, version2 ? TOP_V2_FIELDS : TOP_ALLOWED_FIELDS, '提案', version2 ? new Set([...TOP_FIELDS, 'newTasks']) : TOP_FIELDS)) return issues
  if (proposal.version !== 1 && proposal.version !== 2) add('提案 version 必须为 1 或 2。')
  if (typeof proposal.requestId !== 'string' || !proposal.requestId || proposal.requestId.length > 120) add('提案 requestId 无效。')
  strings(proposal.assumptions, '全局假设', AI_SCHEDULE_LIMITS.assumptions)
  strings(proposal.conflicts, '冲突', AI_SCHEDULE_LIMITS.conflicts)
  if (own(proposal, 'workspaceSuggestions')) strings(proposal.workspaceSuggestions, '工作域建议', AI_SCHEDULE_LIMITS.assumptions)
  if (!Array.isArray(proposal.changes) || proposal.changes.length > AI_SCHEDULE_LIMITS.tasks) {
    add(`changes 必须是最多 ${AI_SCHEDULE_LIMITS.tasks} 项的数组。`)
    return issues
  }
  const advice = (change, label) => {
    for (const field of ['planStartDate', 'planEndDate']) {
      if (change[field] !== '' && change[field] !== null && !isPlanDate(change[field])) add(`${label}的 ${field} 必须是有效 YYYY-MM-DD 或 null/空字符串。`)
    }
    if (isPlanDate(change.planStartDate) && isPlanDate(change.planEndDate) && change.planStartDate > change.planEndDate) add(`${label}的截止日期早于开始日期。`)
    if (typeof change.reason !== 'string' || !change.reason.trim() || change.reason.length > AI_SCHEDULE_LIMITS.reason) add(`${label}必须提供非空、最多 ${AI_SCHEDULE_LIMITS.reason} 字的理由。`)
    const days = change.estimatedDurationDays
    if (days !== null && (typeof days !== 'number' || !Number.isFinite(days) || days <= 0 || days > 36500)) add(`${label}的 estimatedDurationDays 必须为正数估计或 null。`)
    strings(change.assumptions, `${label}的假设`, AI_SCHEDULE_LIMITS.assumptions)
    if (days !== null && Array.isArray(change.assumptions) && !change.assumptions.length) add(`${label}含预计工期，必须说明估计依据与不确定性。`)
  }
  const ids = new Set()
  for (const [index, change] of proposal.changes.entries()) {
    const label = `变更 ${index + 1}`
    if (!exactFields(change, CHANGE_FIELDS, label)) continue
    if (typeof change.id !== 'string' || !change.id || change.id.length > 200) add(`${label}的任务 ID 无效。`)
    else if (ids.has(change.id)) add(`任务 ID 重复：${change.id}。`)
    else ids.add(change.id)
    advice(change, label)
  }
  if (version2) {
    if (!Array.isArray(proposal.newTasks) || proposal.newTasks.length > NEW_TASK_LIMIT) add(`newTasks 必须是最多 ${NEW_TASK_LIMIT} 项的数组。`)
    else {
      const refs = new Set()
      for (const [index, item] of proposal.newTasks.entries()) {
        const label = `新增任务 ${index + 1}`
        if (!exactFields(item, NEW_TASK_FIELDS, label)) continue
        if (typeof item.ref !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(item.ref)) add(`${label}的临时 ref 无效。`)
        else if (refs.has(item.ref)) add(`新增任务临时 ref 重复：${item.ref}。`)
        else refs.add(item.ref)
        if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > AI_SCHEDULE_LIMITS.title) add(`${label}名称须为非空、最多 ${AI_SCHEDULE_LIMITS.title} 字。`)
        if (typeof item.note !== 'string' || item.note.length > AI_SCHEDULE_LIMITS.note) add(`${label}笔记须为最多 ${AI_SCHEDULE_LIMITS.note} 字的文本。`)
        if (item.parentId !== null && (typeof item.parentId !== 'string' || !item.parentId || item.parentId.length > 128)) add(`${label}的原有父任务 ID 无效。`)
        if (item.parentRef !== null && (typeof item.parentRef !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(item.parentRef))) add(`${label}的新父任务 ref 无效。`)
        if (item.parentId !== null && item.parentRef !== null) add(`${label}不能同时指定原有父任务和新父任务。`)
        advice(item, label)
      }
    }
  }
  return issues
}

/** Legacy JSON or one explicitly labelled footer; never guess among code blocks. */
export function parseProposal(source) {
  if (typeof source !== 'string' || source.length > AI_SCHEDULE_LIMITS.proposal) throw new Error(`提案须为最多 ${AI_SCHEDULE_LIMITS.proposal} 字的 JSON 文本。`)
  let text = source.trim()
  if (/^#{1,3} +排期建议(?:\r?\n|$)/.test(text)) {
    const footer = /^([\s\S]*?)\r?\n## 工作台导入数据[\t ]*\r?\n(?:[\t ]*\r?\n)*```json[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text)
    if (!footer || /```|<\/?[a-z!]|^## 工作台导入数据/mi.test(footer[1])) {
      throw new Error('请复制完整中文回复及末尾唯一的“工作台导入数据”JSON 代码块；不要混入 HTML、其他代码块或多份提案。')
    }
    text = footer[2].trim()
  }
  if (text.startsWith('```')) {
    const fenced = /^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text)
    if (!fenced) throw new Error('仅接受纯 JSON，或完整且唯一的 JSON 代码块；不要夹带其他内容。')
    text = fenced[1].trim()
  }
  let proposal
  try {
    proposal = JSON.parse(text, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('不安全的 JSON 字段。')
      return value
    })
  } catch { throw new Error('无法解析 JSON：请粘贴本次完整中文回复及末尾“工作台导入数据”，或单份纯 JSON 提案；不要混入 HTML 或多份回复。') }
  const issues = proposalIssues(proposal)
  if (issues.length) throw failure(issues)
  return deepFreeze(proposal)
}

/** Read-only before/after and conflict validation. All proposed fields stay inert. */
export function previewProposal(tasks, proposal, request) {
  const errors = proposalIssues(proposal), warnings = []
  const structuralValid = errors.length === 0
  const rows = [], changes = [], parentRows = []
  let creation = { errors: [], records: [], rows: [] }
  let scope
  try { scope = checkRequest(tasks, request) } catch (problem) { errors.push(messageOf(problem)) }
  if (request && proposal?.requestId !== request.requestId) errors.push('提案 requestId 与本次上下文不符，请勿导入其他范围或旧请求的回复。')
  if (Array.isArray(proposal?.conflicts)) for (const conflict of proposal.conflicts) if (typeof conflict === 'string') errors.push(`AI 报告的未解决冲突：${conflict}`)
  if (scope && structuralValid && proposal.version === 2) {
    if (proposal.newTasks.length && JSON.stringify(snapshotCreationFacts(scope)) !== JSON.stringify(request.creationBaseline)) errors.push('任务名称或笔记已变化，新增任务提案已过期；请重新生成。')
    creation = planNewTasks(tasks, proposal.newTasks, scope, request)
    errors.push(...creation.errors)
  }
  if (scope && Array.isArray(proposal?.changes)) {
    for (const change of proposal.changes) {
      if (!plain(change) || typeof change.id !== 'string') continue
      const task = scope.byId.get(change.id)
      if (!task) { errors.push(`未知任务 ID：${change.id}。`); continue }
      if (!scope.ids.has(change.id)) { errors.push(`任务“${task.title || task.id}”不在本次选择范围内。`); continue }
      const protectedReason = eligibility(task, scope, request.options.allowOngoing)
      if (protectedReason) { errors.push(`任务“${task.title || task.id}”：${protectedReason}`); continue }
      const changed = !sameDate(task.planStartDate, change.planStartDate) || !sameDate(task.planEndDate, change.planEndDate)
      rows.push({
        id: task.id, title: String(task.title || task.id), changed,
        before: { planStartDate: task.planStartDate ?? '', planEndDate: task.planEndDate ?? '' },
        after: { planStartDate: change.planStartDate, planEndDate: change.planEndDate },
        reason: change.reason, estimatedDurationDays: change.estimatedDurationDays,
        assumptions: Array.isArray(change.assumptions) ? [...change.assumptions] : [],
        calendarSpanDays: isPlanDate(change.planStartDate) && isPlanDate(change.planEndDate)
          ? dateToDay(change.planEndDate) - dateToDay(change.planStartDate) + 1 : null,
      })
      if (changed) {
        const patch = { id: task.id }
        // A cleared absent value is a semantic no-op: do not migrate legacy records.
        if (!sameDate(task.planStartDate, change.planStartDate)) patch.planStartDate = change.planStartDate
        if (!sameDate(task.planEndDate, change.planEndDate)) patch.planEndDate = change.planEndDate
        changes.push(patch)
      }
    }
    if (request.options.deadline) {
      for (const row of rows) if (isPlanDate(row.after.planEndDate) && row.after.planEndDate > request.options.deadline) errors.push(`任务“${row.title}”的建议截止超过用户填写的截止 ${request.options.deadline}。`)
    }
    const patches = new Map(changes.map(change => [change.id, change]))
    const candidate = [...tasks.map(task => patches.has(task.id) ? { ...task, ...patches.get(task.id) } : task), ...creation.records]
    errors.push(...validateScheduleState(candidate).map(issue => issue.message))
    if (!errors.length) {
      const before = getSchedules(tasks), after = getSchedules(candidate)
      creation.rows = creation.rows.map(row => ({ ...row, after: { planStartDate: after.get(row.id).start, planEndDate: after.get(row.id).end } }))
      if (request.options.deadline) for (const row of creation.rows) {
        if (isPlanDate(row.after.planEndDate) && row.after.planEndDate > request.options.deadline) errors.push(`新增任务“${row.title}”的建议截止超过用户填写的截止 ${request.options.deadline}。`)
      }
      for (const task of tasks) {
        const previous = before.get(task.id), next = after.get(task.id)
        if (next.auto && (previous.start !== next.start || previous.end !== next.end)) parentRows.push({
          id: task.id, title: String(task.title || task.id),
          before: { planStartDate: previous.start, planEndDate: previous.end },
          after: { planStartDate: next.start, planEndDate: next.end },
        })
      }
    }
    const preserved = request.scopeIds.length - rows.length
    if (preserved > 0) warnings.push(`${preserved} 项未列入可应用变更的任务保持原样（含父任务/受保护任务）；自动父级仅重算显示。`)
  }
  if (rows.some(row => row.estimatedDurationDays !== null)) warnings.push('预计工期均为 AI 估计，不是已有承诺，也不会写入任务。请核对假设与工作量。')
  return deepFreeze({
    proposal, request, rows, parentRows, changes, newTasks: creation.records, creationRows: creation.rows, errors: [...new Set(errors)], warnings,
    baseline: scope ? snapshotBaseline(tasks, scope) : null,
    changedCount: changes.length, createdCount: creation.records.length, canApply: errors.length === 0 && changes.length + creation.records.length > 0,
    noOp: errors.length === 0 && changes.length + creation.records.length === 0,
  })
}

/** Revalidate against the latest commit snapshot, then apply one all-or-nothing batch. */
export function applyProposal(tasks, preview, options = {}) {
  if (!preview?.request || !preview?.proposal || !preview.baseline) throw new Error('请先导入并预览有效提案。')
  const scope = checkRequest(tasks, preview.request)
  if (JSON.stringify(snapshotBaseline(tasks, scope)) !== JSON.stringify(preview.baseline)) throw new Error('预览后任务日期或层级已变化，禁止应用旧提案。')
  const fresh = previewProposal(tasks, preview.proposal, preview.request)
  if (fresh.errors.length) throw failure(fresh.errors)
  if (!fresh.changes.length && !fresh.newTasks.length) return tasks
  const timestamp = options.timestamp ?? new Date().toISOString()
  if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) throw new Error('提案 timestamp 必须是有效时间戳。')
  const updated = fresh.changes.length ? applyScheduleChanges(tasks, fresh.changes, { ...options, timestamp }) : tasks
  return fresh.newTasks.length ? [...updated, ...fresh.newTasks.map(item => ({ ...item, createdAt: timestamp, updatedAt: timestamp }))] : updated
}

export function formatAIPlanRange(plan) {
  return `${displayDate(plan?.planStartDate)} → ${displayDate(plan?.planEndDate)}`
}
