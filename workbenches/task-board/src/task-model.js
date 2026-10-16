/** Pure task operations shared by the UI and direct behavioral tests. */
export const STATUS_META = {
  todo: { label: '待办', color: '#818b9a', rank: 0 },
  doing: { label: '进行中', color: '#686ad3', rank: 1 },
  ongoing: { label: '持续性工作', color: '#317777', rank: 2 },
  done: { label: '完成', color: '#458866', rank: 3 },
  dropped: { label: '废弃', color: '#98a1af', rank: 4 },
}
export const STATUS_KEYS = Object.keys(STATUS_META)
export const SETTLED = new Set(['done', 'dropped'])
export function dayKey(value) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export const today = () => dayKey()
export const visibleInBoard = task => !SETTLED.has(task.status) || dayKey(task.settledAt) === today()
export const newId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export function compareTasks(a, b) {
  const ai = Number.isFinite(a.sortIndex) ? a.sortIndex : null
  const bi = Number.isFinite(b.sortIndex) ? b.sortIndex : null
  if (ai !== null && bi !== null && ai !== bi) return ai - bi
  if (ai !== null && bi === null) return -1
  if (ai === null && bi !== null) return 1
  const rank = (STATUS_META[a.status]?.rank ?? 9) - (STATUS_META[b.status]?.rank ?? 9)
  return rank || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
}
export function orderedSiblings(tasks, parentId = null) {
  return tasks.filter(task => (task.parentId || null) === (parentId || null)).sort(compareTasks)
}
export function buildTree(tasks) {
  const byId = new Map(tasks.map(task => [task.id, { ...task, status: STATUS_KEYS.includes(task.status) ? task.status : 'todo', children: [] }]))
  const roots = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null
    const visited = new Set([node.id])
    let cursor = parent
    let cyclic = false
    while (cursor) {
      if (visited.has(cursor.id)) { cyclic = true; break }
      visited.add(cursor.id)
      cursor = cursor.parentId ? byId.get(cursor.parentId) : null
    }
    if (parent && !cyclic) parent.children.push(node)
    else roots.push(node)
  }
  const sortDeep = list => {
    list.sort(compareTasks)
    for (const node of list) sortDeep(node.children)
  }
  sortDeep(roots)
  return roots
}
export function findNode(list, id) {
  const stack = [...list]
  while (stack.length) {
    const node = stack.pop()
    if (node.id === id) return node
    stack.push(...(node.children || []))
  }
  return null
}
/** Including the selected node; iterative and cycle-safe. */
export function subtreeIds(tasks, id) {
  const children = new Map()
  for (const task of tasks) {
    if (!children.has(task.parentId)) children.set(task.parentId, [])
    children.get(task.parentId).push(task.id)
  }
  const result = new Set()
  const stack = [id]
  while (stack.length) {
    const current = stack.pop()
    if (result.has(current)) continue
    result.add(current)
    stack.push(...(children.get(current) || []))
  }
  return result
}
export function removeSubtree(tasks, id) {
  const ids = subtreeIds(tasks, id)
  return tasks.filter(task => !ids.has(task.id))
}
export function applyStatus(tasks, id, status, now = new Date().toISOString()) {
  if (!STATUS_KEYS.includes(status)) return tasks
  return tasks.map(task => task.id === id && task.status !== status
    ? { ...task, status, updatedAt: now, settledAt: SETTLED.has(status) ? now : null }
    : task)
}
export function appendTask(tasks, added) {
  const siblings = orderedSiblings(tasks, added.parentId)
  const indices = new Map(siblings.map((task, index) => [task.id, index]))
  return [...tasks.map(task => indices.has(task.id) ? { ...task, sortIndex: indices.get(task.id) } : task),
    { ...added, sortIndex: siblings.length }]
}
export function applyReorder(tasks, id, targetId, after = false) {
  const moved = tasks.find(task => task.id === id)
  const target = tasks.find(task => task.id === targetId)
  if (!moved || !target || id === targetId || (moved.parentId || null) !== (target.parentId || null)) return tasks
  // Use the displayed order, not the storage-array order (which differs after previous moves).
  const siblings = orderedSiblings(tasks, moved.parentId).filter(task => task.id !== id)
  const at = siblings.findIndex(task => task.id === targetId)
  siblings.splice(at + (after ? 1 : 0), 0, moved)
  const indices = new Map(siblings.map((task, index) => [task.id, index]))
  return tasks.map(task => indices.has(task.id) ? { ...task, sortIndex: indices.get(task.id) } : task)
}
export function applyReparent(tasks, id, parentId = null) {
  const moved = tasks.find(task => task.id === id)
  const nextParent = parentId || null
  if (!moved || (moved.parentId || null) === nextParent) return tasks
  if (nextParent && (!tasks.some(task => task.id === nextParent) || subtreeIds(tasks, id).has(nextParent))) return tasks
  const oldSiblings = orderedSiblings(tasks, moved.parentId).filter(task => task.id !== id)
  const newSiblings = orderedSiblings(tasks, nextParent).filter(task => task.id !== id)
  newSiblings.push({ ...moved, parentId: nextParent, updatedAt: new Date().toISOString() })
  const changes = new Map()
  oldSiblings.forEach((task, index) => changes.set(task.id, { ...task, sortIndex: index }))
  newSiblings.forEach((task, index) => changes.set(task.id, { ...task, sortIndex: index }))
  return tasks.map(task => changes.get(task.id) || task)
}
export function flattenTree(tree, depth = 0) {
  return tree.flatMap(node => [{ ...node, depth }, ...flattenTree(node.children || [], depth + 1)])
}
