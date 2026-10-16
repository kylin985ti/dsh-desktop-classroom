import assert from 'node:assert/strict'
import {
  STATUS_META, STATUS_KEYS, SETTLED, buildTree, findNode, subtreeIds, removeSubtree,
  orderedSiblings, applyReorder, applyReparent, appendTask, applyStatus, visibleInBoard, dayKey,
} from '../src/task-model.js'
let count = 0
const test = (name, run) => { run(); count++; console.log(`ok    ${name}`) }
const now = new Date().toISOString()
const task = (id, parentId = null, sortIndex = null, status = 'todo') => ({ id, parentId, sortIndex, status, title: id, note: 'kept', domain: { path: '/selected/example', kind: 'md', workspaceId: 'ws' }, createdAt: now, updatedAt: now, settledAt: null })
const tasks = [task('root'), task('parent', 'root'), task('sibling', 'root'), task('grand', 'parent'), task('deep', 'grand')]
test('任意层级节点均可查到', () => assert.equal(findNode(buildTree(tasks), 'deep').id, 'deep'))
test('详情查找不限一级根节点', () => assert.equal(findNode(buildTree(tasks), 'parent').children[0].id, 'grand'))
test('多级后代集合完整', () => assert.deepEqual([...subtreeIds(tasks, 'parent')].sort(), ['deep','grand','parent']))
test('删除子树不会留下晋升的孤儿', () => assert.deepEqual(removeSubtree(tasks, 'parent').map(t => t.id), ['root','sibling']))
test('删除根任务会删除所有任务记录', () => assert.equal(removeSubtree(tasks, 'root').length, 0))
test('删除数据纯函数不触碰工作域对象', () => assert.equal(tasks[1].domain.path, '/selected/example'))
test('父级缺失时任务仍在树里', () => assert.equal(buildTree([task('orphan', 'missing')])[0].id, 'orphan'))
test('缺少旧版可选状态时仍归入待办，不静默消失', () => assert.equal(buildTree([{id:'legacy',title:'旧任务'}])[0].status, 'todo'))
test('自指环不会无限递归', () => assert.equal(buildTree([task('self', 'self')])[0].id, 'self'))
test('循环链会安全提升为根，保留数据', () => assert.equal(buildTree([task('x','y'),task('y','x'),task('z','x')]).length, 3))
test('后代集合处理环安全终止', () => assert.equal(subtreeIds([task('x','y'),task('y','x')], 'x').size, 2))
const shuffled = [task('c',null,20),task('a',null,0),task('b',null,10)]
test('兄弟排序使用显示位次而非原始数组', () => assert.deepEqual(orderedSiblings(shuffled).map(t => t.id), ['a','b','c']))
test('已手动排序时向前移动正确', () => assert.deepEqual(orderedSiblings(applyReorder(shuffled,'c','b',false)).map(t => t.id), ['a','c','b']))
test('已手动排序时向后移动正确', () => assert.deepEqual(orderedSiblings(applyReorder(shuffled,'a','b',true)).map(t => t.id), ['b','a','c']))
test('排序保留层级与状态', () => { const next=applyReorder(tasks,'sibling','parent'); assert.equal(next.find(t=>t.id==='sibling').parentId,'root'); assert.equal(next.find(t=>t.id==='sibling').status,'todo') })
test('跨父级边缘不隐式改变归属', () => assert.equal(applyReorder(tasks,'grand','sibling'),tasks))
test('排序纯函数不更改输入数组位次', () => { applyReorder(shuffled,'a','c'); assert.equal(shuffled[0].sortIndex,20) })
test('移入另一个父级保持整个子树', () => { const next=applyReparent(tasks,'grand','sibling'); assert.equal(next.find(t=>t.id==='grand').parentId,'sibling'); assert.equal(next.find(t=>t.id==='deep').parentId,'grand') })
test('移入自己被拒绝', () => assert.equal(applyReparent(tasks,'parent','parent'),tasks))
test('移入后代被拒绝', () => assert.equal(applyReparent(tasks,'parent','deep'),tasks))
test('移入缺失父级被拒绝', () => assert.equal(applyReparent(tasks,'parent','missing'),tasks))
test('可明确恢复为一级任务', () => assert.equal(applyReparent(tasks,'grand',null).find(t=>t.id==='grand').parentId,null))
test('移动保留状态、笔记及工作域', () => { const next=applyReparent(tasks,'grand','sibling').find(t=>t.id==='grand'); assert.equal(next.status,'todo'); assert.equal(next.note,'kept'); assert.equal(next.domain,tasks[3].domain) })
const destination = [task('r'),task('p','r'),task('one','p',10),task('two','p',20),task('unindexed','p'),task('moved','r')]
test('移动排在所有已有子任务末尾（含未设位次）', () => assert.deepEqual(orderedSiblings(applyReparent(destination,'moved','p'),'p').map(t=>t.id), ['one','two','unindexed','moved']))
test('新增子任务追加到既有显示顺序末尾，包括有位次间隔与未设位次的节点', () => assert.deepEqual(orderedSiblings(appendTask(destination,task('new','p')),'p').map(t=>t.id), ['one','two','unindexed','new']))
test('新增时只归一化同父级位次，不改变独立状态', () => { const next=appendTask(destination,task('new','p',null,'doing')); assert.equal(next.find(t=>t.id==='new').status,'doing'); assert.equal(next.find(t=>t.id==='moved').sortIndex,null) })
test('移动后源兄弟位次连续', () => assert.deepEqual(orderedSiblings(applyReparent(destination,'moved','p'),'r').map(t=>t.sortIndex), [0]))
test('同父级移动不无故重排', () => assert.equal(applyReparent(tasks,'parent','root'),tasks))
test('状态切换仅影响当前任务', () => { const next=applyStatus(tasks,'parent','doing'); assert.equal(next.find(t=>t.id==='parent').status,'doing'); assert.equal(next.find(t=>t.id==='grand').status,'todo') })
test('完成写入结算时间', () => assert.equal(applyStatus(tasks,'parent','done',now).find(t=>t.id==='parent').settledAt,now))
test('恢复待办清除结算时间', () => { const next=applyStatus(applyStatus(tasks,'parent','done',now),'parent','todo'); assert.equal(next.find(t=>t.id==='parent').settledAt,null) })
test('同一状态不重新结算历史任务', () => { const old={...task('done',null,null,'done'),settledAt:'2020-01-01T00:00:00Z'}; const next=applyStatus([old],'done','done'); assert.equal(next[0],old) })
test('非法状态被忽略', () => assert.equal(applyStatus(tasks,'parent','invalid'),tasks))
test('当天完成可见、往日完成隐去、未结算仍可见', () => { assert.equal(visibleInBoard({...task('a',null,null,'done'),settledAt:now}),true); assert.equal(visibleInBoard({...task('b',null,null,'done'),settledAt:'2020-01-01T00:00:00Z'}),false); assert.equal(visibleInBoard(task('c')),true) })
test('无效时间不会被视为今天', () => assert.equal(dayKey('invalid'),'') )

// ongoing is independent, nonterminal work, not a recurrence or a migration of doing.
const transitionTime = '2025-04-05T06:07:08.000Z'
const historicalSettlement = '2000-01-02T00:00:00.000Z'
test('正式状态顺序为五个独立状态，持续性工作标签准确', () => {
  assert.deepEqual(STATUS_KEYS, ['todo', 'doing', 'ongoing', 'done', 'dropped'])
  assert.equal(STATUS_META.ongoing.label, '持续性工作')
  assert.ok(STATUS_META.doing.rank < STATUS_META.ongoing.rank && STATUS_META.ongoing.rank < STATUS_META.done.rank)
})
test('SETTLED 仍只有完成和废弃，持续性工作不计结算', () => {
  assert.deepEqual([...SETTLED], ['done', 'dropped'])
  for (const status of ['todo', 'doing', 'ongoing']) assert.equal(SETTLED.has(status), false)
})
test('旧四状态与缺省旧任务不自动迁移为 ongoing', () => {
  const legacy = ['todo', 'doing', 'done', 'dropped'].map(status => task(`legacy-${status}`, null, null, status))
  const tree = buildTree([...legacy, { id: 'legacy-missing', title: '旧记录' }])
  for (const entry of legacy) assert.equal(findNode(tree, entry.id).status, entry.status)
  assert.equal(findNode(tree, 'legacy-missing').status, 'todo')
  assert.deepEqual(legacy.map(entry => entry.status), ['todo', 'doing', 'done', 'dropped'])
})
for (const [label, settledAt] of [
  ['缺少', undefined], ['null', null], ['空字符串', ''], ['历史', historicalSettlement],
  ['当天', now], ['未来', '2099-01-01T00:00:00.000Z'], ['非法', 'invalid'],
]) test(`持续性工作始终可见（${label}结算时间和旧 createdAt/updatedAt）`, () => {
  const ongoing = { ...task('ongoing-visible', null, null, 'ongoing'),
    createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z', settledAt }
  if (settledAt === undefined) delete ongoing.settledAt
  assert.equal(visibleInBoard(ongoing), true)
})
test('持续性工作没有任何时间字段仍可见', () => {
  assert.equal(visibleInBoard({ id: 'ongoing-no-dates', title: '长期工作', status: 'ongoing' }), true)
})
for (const status of ['todo', 'doing']) test(`${status} 原有非终态可见性不因历史结算时间改变`, () => {
  assert.equal(visibleInBoard({ ...task(`visible-${status}`, null, null, status), settledAt: historicalSettlement }), true)
})
for (const status of ['done', 'dropped']) test(`${status} 仍仅当天结算可见，往日保持历史口径`, () => {
  assert.equal(visibleInBoard({ ...task(`visible-${status}`, null, null, status), settledAt: now }), true)
  assert.equal(visibleInBoard({ ...task(`hidden-${status}`, null, null, status), settledAt: historicalSettlement }), false)
})
for (const status of ['todo', 'doing', 'done', 'dropped']) test(`${status} → ongoing 清除结算时间，保留全部业务数据和独立子任务`, () => {
  const source = { ...task('continuous', 'owner', 17, status), createdAt: '1999-01-01T00:00:00.000Z',
    updatedAt: historicalSettlement, settledAt: historicalSettlement }
  const descendants = [task('owner'), task('child', source.id, 5, 'doing'), task('deep-child', 'child', 3, 'done')]
  const before = [descendants[0], source, ...descendants.slice(1)]
  const next = applyStatus(before, source.id, 'ongoing', transitionTime)
  assert.deepEqual(next[1], { ...source, status: 'ongoing', updatedAt: transitionTime, settledAt: null })
  assert.equal(next[1].domain, source.domain)
  assert.deepEqual(next.map(entry => entry.id), before.map(entry => entry.id))
  for (const index of [0, 2, 3]) assert.equal(next[index], before[index])
  assert.equal(source.status, status)
  assert.equal(source.settledAt, historicalSettlement)
  assert.equal(findNode(buildTree(next), 'deep-child').parentId, 'child')
})
for (const status of ['done', 'dropped']) test(`ongoing → ${status} 写入此次结算时间，不改变笔记/域/层级/排序`, () => {
  const source = { ...task('ongoing-terminal', 'owner', 6, 'ongoing'), createdAt: '1999-01-01T00:00:00.000Z',
    updatedAt: historicalSettlement, settledAt: historicalSettlement }
  const sibling = task('untouched', 'owner', 8, 'doing')
  const next = applyStatus([source, sibling], source.id, status, transitionTime)
  assert.deepEqual(next[0], { ...source, status, updatedAt: transitionTime, settledAt: transitionTime })
  assert.equal(next[0].domain, source.domain)
  assert.equal(next[1], sibling)
  assert.equal(source.status, 'ongoing')
  assert.equal(source.settledAt, historicalSettlement)
})
for (const status of ['todo', 'doing']) test(`ongoing → ${status} 保持非终态并清空旧结算时间`, () => {
  const source = { ...task('ongoing-active', null, 4, 'ongoing'), settledAt: historicalSettlement }
  assert.deepEqual(applyStatus([source], source.id, status, transitionTime)[0],
    { ...source, status, updatedAt: transitionTime, settledAt: null })
})
test('ongoing → ongoing 不重写旧时间、笔记或生成新身份', () => {
  const source = { ...task('same-ongoing', 'owner', 8, 'ongoing'),
    updatedAt: historicalSettlement, settledAt: historicalSettlement }
  const next = applyStatus([source], source.id, 'ongoing', transitionTime)
  assert.equal(next.length, 1)
  assert.equal(next[0], source)
})
const hierarchy = [
  task('ongoing-root', null, 10, 'ongoing'), task('other-root', null, 0, 'doing'),
  task('ongoing-child', 'ongoing-root', 20, 'ongoing'), task('todo-child', 'ongoing-root', 0, 'todo'),
  task('ongoing-deep', 'ongoing-child', 5, 'ongoing'), task('done-child', 'ongoing-root', 10, 'done'),
]
test('持续性工作在根/子级/深层保留独立状态与手动排序', () => {
  const tree = buildTree(hierarchy)
  assert.deepEqual(tree.map(entry => entry.id), ['other-root', 'ongoing-root'])
  assert.deepEqual(findNode(tree, 'ongoing-root').children.map(entry => entry.id), ['todo-child', 'done-child', 'ongoing-child'])
  for (const id of ['ongoing-root', 'ongoing-child', 'ongoing-deep']) assert.equal(findNode(tree, id).status, 'ongoing')
  assert.equal(findNode(tree, 'todo-child').status, 'todo')
  assert.equal(findNode(tree, 'ongoing-deep').parentId, 'ongoing-child')
  assert.deepEqual([...subtreeIds(hierarchy, 'ongoing-child')].sort(), ['ongoing-child', 'ongoing-deep'])
})
test('无手动位次时持续性工作按独立状态 rank 排在进行中与完成之间', () => {
  const mixed = [...STATUS_KEYS].reverse().map(status => task(`rank-${status}`, null, null, status))
  assert.deepEqual(orderedSiblings(mixed).map(entry => entry.status), STATUS_KEYS)
})
test('持续性工作仍优先使用手动 sortIndex，而非状态 rank', () => {
  const mixed = [task('todo-last', null, 30, 'todo'), task('ongoing-first', null, 0, 'ongoing'), task('done-middle', null, 10, 'done')]
  assert.deepEqual(orderedSiblings(mixed).map(entry => entry.id), ['ongoing-first', 'done-middle', 'todo-last'])
})
test('持续性工作同级重排保留状态/父级/时间/域/笔记与深层子树', () => {
  const next = applyReorder(hierarchy, 'ongoing-child', 'todo-child')
  assert.deepEqual(orderedSiblings(next, 'ongoing-root').map(entry => entry.id), ['ongoing-child', 'todo-child', 'done-child'])
  assert.deepEqual(next.map(entry => entry.id), hierarchy.map(entry => entry.id))
  for (const entry of hierarchy) {
    const reordered = next.find(candidate => candidate.id === entry.id)
    assert.deepEqual({ ...reordered, sortIndex: entry.sortIndex }, entry)
    assert.equal(reordered.domain, entry.domain)
  }
  assert.equal(next.find(entry => entry.id === 'ongoing-deep'), hierarchy[4])
  assert.equal(hierarchy[2].sortIndex, 20)
})
test('持续性工作跨父级移动保留整棵子树与业务字段，未改变任何任务状态', () => {
  const next = applyReparent(hierarchy, 'ongoing-child', 'other-root')
  const moved = next.find(entry => entry.id === 'ongoing-child')
  assert.equal(moved.parentId, 'other-root')
  assert.equal(moved.sortIndex, 0)
  assert.deepEqual({ ...moved, parentId: hierarchy[2].parentId, sortIndex: hierarchy[2].sortIndex,
    updatedAt: hierarchy[2].updatedAt }, hierarchy[2])
  assert.equal(moved.domain, hierarchy[2].domain)
  assert.equal(next.find(entry => entry.id === 'ongoing-deep'), hierarchy[4])
  assert.deepEqual(next.map(entry => entry.status), hierarchy.map(entry => entry.status))
  assert.equal(findNode(buildTree(next), 'ongoing-deep').parentId, 'ongoing-child')
  assert.equal(hierarchy[2].parentId, 'ongoing-root')
})
test('新增持续性工作只追加当前父级，不继承父级状态或修改既有时间', () => {
  const added = task('new-ongoing', 'ongoing-root', null, 'ongoing')
  const next = appendTask(hierarchy, added)
  assert.deepEqual(orderedSiblings(next, 'ongoing-root').map(entry => entry.id),
    ['todo-child', 'done-child', 'ongoing-child', 'new-ongoing'])
  assert.deepEqual(next.at(-1), { ...added, sortIndex: 3 })
  assert.equal(next.at(-1).settledAt, null)
  assert.equal(next.at(-1).domain, added.domain)
  assert.deepEqual(next.slice(0, hierarchy.length).map(entry => entry.status), hierarchy.map(entry => entry.status))
  for (const entry of hierarchy) assert.equal(next.find(candidate => candidate.id === entry.id).updatedAt, entry.updatedAt)
})
console.log(`\n${count}/${count} 通过`)
