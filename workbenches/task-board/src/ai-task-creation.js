/** Bounded creation planning. Preview is pure; timestamps are added only on apply. */
export const NEW_TASK_LIMIT = 40
export const NEW_TASK_FIELDS = new Set(['ref', 'title', 'parentId', 'parentRef', 'note',
  'planStartDate', 'planEndDate', 'reason', 'estimatedDurationDays', 'assumptions'])

const settled = new Set(['done', 'dropped'])
const empty = value => value === null || value === ''
const normalizedTitle = value => value.trim().normalize('NFKC').toLowerCase()

// Stable local IDs make a retry of the same request/ref use the same identity.
// Hashes are identifiers, never authorization. Any occupied ID is rejected.
function creationId(requestId, ref) {
  const text = JSON.stringify([requestId, ref])
  const hashes = [2166136261, 3335557771, 1234567891, 374761393]
  for (let index = 0; index < text.length; index++) {
    for (let seed = 0; seed < hashes.length; seed++) hashes[seed] = Math.imul(hashes[seed] ^ text.charCodeAt(index), 16777619) >>> 0
  }
  return `t-ai-${hashes.map(value => value.toString(16).padStart(8, '0')).join('')}`
}

export function canReceiveNewTask(id, scope) {
  const visited = new Set()
  let task = scope.byId.get(id)
  if (!task || !scope.ids.has(id)) return false
  while (task) {
    if (visited.has(task.id) || settled.has(task.status)) return false
    visited.add(task.id)
    task = scope.byId.get(task.parentId)
  }
  return true
}

/** Called only after field/type validation. Does not alter existing siblings. */
export function planNewTasks(tasks, proposals, scope, request) {
  const errors = [], records = [], rows = []
  if (!proposals.length) return { errors, records, rows }
  if (request.proposalVersion !== 2) return { errors: ['这次原生请求仅允许日期建议，请重新预览上下文生成新增任务提案。'], records, rows }
  const refs = new Map(proposals.map(item => [item.ref, item]))
  const parents = new Set(proposals.map(item => item.parentRef).filter(Boolean))
  const ids = new Map(proposals.map(item => [item.ref, creationId(request.requestId, item.ref)]))
  if (new Set(ids.values()).size !== proposals.length) return { errors: ['新增任务的导入标识发生冲突，请重新生成提案。'], records, rows }
  const siblingNames = new Set(tasks.map(task => JSON.stringify([task.parentId || null, normalizedTitle(task.title || '')])))
  const pending = new Map(refs), resolved = new Map()
  for (const item of proposals) {
    if (scope.byId.has(ids.get(item.ref))) errors.push(`新增任务“${item.title}”的导入标识已存在，提案可能已经应用；请刷新任务。`)
    if (item.parentRef && !refs.has(item.parentRef)) errors.push(`新增任务“${item.title}”引用了不存在的新父任务：${item.parentRef}。`)
    if (item.parentId && !canReceiveNewTask(item.parentId, scope)) errors.push(`新增任务“${item.title}”的父任务不在所选可用分支内，或位于已完成/废弃分支。`)
    if (!item.parentId && !item.parentRef && !scope.allTasks) errors.push(`新增一级任务“${item.title}”超出当前分支；请挂到本分支任务下，或明确选择全部任务。`)
    if (parents.has(item.ref) && (!empty(item.planStartDate) || !empty(item.planEndDate))) errors.push(`新父任务“${item.title}”由子任务自动汇总日期，请将它自己的计划日期留空。`)
  }
  if (errors.length) return { errors, records, rows }
  while (pending.size) {
    let progressed = false
    for (const [ref, item] of pending) {
      if (item.parentRef && !resolved.has(item.parentRef)) continue
      const parent = item.parentRef ? resolved.get(item.parentRef) : null
      const parentId = parent?.id || item.parentId || null
      const title = item.title.trim()
      const key = JSON.stringify([parentId, normalizedTitle(title)])
      if (siblingNames.has(key)) errors.push(`同一父任务下已存在“${title}”，或这份建议包含同名重复项；请删除重复建议或修改名称。`)
      siblingNames.add(key)
      const parentTitle = parent?.title || (parentId ? scope.byId.get(parentId).title : '总览（一级任务）')
      const path = parent ? `${parent.path} → ${title}` : `${parentTitle} → ${title}`
      const record = { id: ids.get(ref), title, parentId, note: item.note,
        status: 'todo', sortIndex: null, domain: null, settledAt: null,
        planStartDate: item.planStartDate, planEndDate: item.planEndDate,
        ...(parents.has(ref) ? { planMode: 'auto' } : {}) }
      const row = { ref, id: record.id, title, parentId, parentTitle, path,
        depth: parent ? parent.depth + 1 : 0, automatic: parents.has(ref),
        note: item.note, reason: item.reason, estimatedDurationDays: item.estimatedDurationDays,
        assumptions: [...item.assumptions] }
      records.push(record); rows.push(row); resolved.set(ref, row)
      pending.delete(ref); progressed = true
    }
    if (!progressed) { errors.push('新增任务的父子引用含循环，不能导入。'); break }
  }
  return { errors, records, rows }
}
