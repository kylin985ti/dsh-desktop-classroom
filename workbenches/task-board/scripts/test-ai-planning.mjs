import assert from 'node:assert/strict'
import { buildPrompt, applyProposal } from '../src/ai-schedule-model.js'
import { proposalKeys, togglePlanningSelection, selectedPlanningProposal, planningPreview, buildPlanningRequest,
  parsePlanningReply, createPlanningUndo, undoPlanningBatch, comparePlanningRevisions } from '../src/ai-planning-model.js'
import { runOwnedPlanningTurn, keepOwnedPlanningSession, releaseOwnedPlanningSession } from '../src/ai-native-bridge.js'
import { createAIPlanningPanel } from '../src/ai-planning-panel.js'

let passed = 0
const test = async (label, fn) => { await fn(); passed++; console.log(`ok ${label}`) }
const now = '2026-10-16T10:00:00.000Z'
const task = (id, parentId, extra = {}) => ({ id, title: id, parentId, status: 'todo', note: '合成样本', domain: null,
  sortIndex: null, settledAt: null, createdAt: now, updatedAt: now, ...extra })
const base = () => [task('root', null, { planMode: 'auto' }), task('design', 'root', { planStartDate: '2026-10-19', planEndDate: '2026-10-20', assignee: '合成负责人' }),
  task('dev', 'root', { planStartDate: '2026-10-23', planEndDate: '2026-10-27' }), task('unrelated', null, { note: '范围外合成标记' })]
const advice = { reason: '合成排期依据', estimatedDurationDays: null, assumptions: [] }
const proposal = (id = 'planning-test') => ({ version: 2, requestId: id, changes: [{ id: 'design', planStartDate: '2026-10-21', planEndDate: '2026-10-22', ...advice }],
  newTasks: [
    { ref: 'phase', title: '验收阶段', parentId: 'root', parentRef: null, note: '', planStartDate: null, planEndDate: null, ...advice },
    { ref: 'a', title: '联动检查', parentId: null, parentRef: 'phase', note: '', planStartDate: '2026-10-23', planEndDate: '2026-10-24', ...advice },
    { ref: 'b', title: '样本验收', parentId: null, parentRef: 'phase', note: '', planStartDate: '2026-10-26', planEndDate: '2026-10-28', ...advice },
    { ref: 'optional', title: '编写说明', parentId: 'root', parentRef: null, note: '', planStartDate: '2026-10-29', planEndDate: '2026-10-30', ...advice },
  ], assumptions: [], conflicts: [] })
const revision = () => ({ number: 1, request: buildPrompt(base(), { scopeId: 'root', requestId: 'planning-test' }), proposal: proposal() })

await test('mixed selection is pure and produces the same candidate for graph and confirmation', () => {
  const tasks = base(), original = JSON.stringify(tasks), version = revision()
  const keys = proposalKeys(version.proposal).filter(key => key !== 'new:optional')
  const result = planningPreview(tasks, version, keys)
  assert.equal(result.selected.changedCount, 1); assert.equal(result.selected.createdCount, 3)
  assert.equal(result.chart.schedules.get('root').end, '2026-10-28')
  assert.equal(result.chart.schedules.get(result.selected.newTasks.find(item => item.title === '验收阶段').id).end, '2026-10-28')
  assert.equal(result.chart.differences.get(result.all.newTasks.find(item => item.title === '编写说明').id).selected, false)
  assert.equal(JSON.stringify(tasks), original)
  const after = applyProposal(tasks, result.selected, { timestamp: now })
  assert.equal(after.length, 7); assert.equal(after.find(item => item.id === 'design').planStartDate, '2026-10-21')
  assert.deepEqual(after.find(item => item.id === 'unrelated'), tasks[3])
  assert.equal(after.find(item => item.id === 'design').assignee, tasks[1].assignee)
})
await test('accepting a proposed child also accepts its proposed parent', () => {
  assert.deepEqual(togglePlanningSelection(proposal(), [], 'new:b', true), ['new:phase', 'new:b'])
})
await test('rejecting a proposed parent rejects all proposed descendants without touching other selections', () => {
  assert.deepEqual(togglePlanningSelection(proposal(), proposalKeys(proposal()), 'new:phase', false), ['change:design', 'new:optional'])
})
await test('directly forged orphan selection is rejected', () => assert.throws(() => selectedPlanningProposal(proposal(), ['new:a']), /父任务/))
await test('unchecked new children remain visible but do not extend selected parent rollups', () => {
  const version = revision(), keys = ['change:design', 'new:phase', 'new:a']
  const result = planningPreview(base(), version, keys)
  assert.equal(result.chart.tasks.length, 8)
  const parent = result.selected.newTasks.find(item => item.title === '验收阶段')
  assert.equal(result.chart.schedules.get(parent.id).end, '2026-10-24')
  assert.equal(result.chart.schedules.get('root').end, '2026-10-27')
})
await test('rejecting every change cannot write anything or alter the real parent range', () => {
  const result = planningPreview(base(), revision(), [])
  assert.equal(result.selected.canApply, false); assert.equal(result.selected.noOp, true)
  assert.equal(result.chart.schedules.get('root').end, '2026-10-27')
})
await test('selected scope becomes stale when an existing task, status or hierarchy changes', () => {
  const tasks = base(); tasks[1] = { ...tasks[1], planEndDate: '2026-10-21' }
  assert.equal(planningPreview(tasks, revision(), ['change:design']).selected.canApply, false)
})
await test('AI conflicts cannot be hidden by unchecking a suggestion', () => {
  const version = revision(); version.proposal = { ...version.proposal, conflicts: ['需要用户确定截止日'] }
  assert.equal(planningPreview(base(), version, []).selected.canApply, false)
})
await test('complete replacement request retains prior feedback and only accepted draft suggestions', () => {
  const request = buildPlanningRequest(base(), { scopeId: 'root', requestId: 'next',
    messages: [{ role: 'user', text: '开发日期不要动。' }], message: '验收改成一天。', priorRevision: revision(), selectedKeys: ['change:design', 'new:phase', 'new:a'] })
  assert(request.prompt.includes('开发日期不要动。')); assert(request.prompt.includes('验收改成一天。'))
  assert(request.prompt.includes('完整替代方案')); assert(!request.prompt.includes('范围外合成标记'))
  assert(!request.prompt.includes('编写说明')); assert.equal(request.context.userWorkloadAndConstraints, '验收改成一天。')
})
await test('initial empty request and oversized feedback are refused before any native action', () => {
  assert.throws(() => buildPlanningRequest(base(), { scopeId: 'root', message: '' }))
  assert.throws(() => buildPlanningRequest(base(), { scopeId: 'root', message: '字'.repeat(2001) }))
})
await test('continuing after apply or undo states the current phase instead of reviving old draft-only wording', () => {
  const applied = buildPlanningRequest(base(), { scopeId: 'root', requestId: 'after-apply', message: '再检查验收。', priorState: 'applied' })
  const undone = buildPlanningRequest(base(), { scopeId: 'root', requestId: 'after-undo', message: '重新规划验收。', priorState: 'undone' })
  assert(applied.prompt.includes('上一批已经确认应用')); assert(!applied.prompt.includes('上一版尚未应用'))
  assert(undone.prompt.includes('上一批应用已撤销')); assert(!undone.prompt.includes('上一版尚未应用'))
})
await test('a short AI clarification is a conversation turn, not an importable proposal', () => {
  assert.deepEqual(parsePlanningReply('## 需要确认\n验收截止是周三还是周五？'), { clarification: '验收截止是周三还是周五？' })
  assert.throws(() => parsePlanningReply('## 需要确认\n```json\n{}\n```'))
})
await test('version comparison reports actual changed dates rather than repeating the full proposal', () => {
  const first = { ...revision(), selected: proposalKeys(proposal()) }, second = structuredClone(first)
  second.proposal.newTasks[2].planEndDate = '2026-10-27'
  const changes = comparePlanningRevisions(first, second)
  assert.equal(changes.length, 1); assert.equal(changes[0].key, 'new:b')
  assert.equal(changes[0].before.planEndDate, '2026-10-28'); assert.equal(changes[0].after.planEndDate, '2026-10-27')
})
await test('undo restores mixed batch exactly, including absent fields and original timestamps', () => {
  const tasks = base(), selected = planningPreview(tasks, revision(), ['change:design', 'new:phase', 'new:a', 'new:b']).selected
  const after = applyProposal(tasks, selected, { timestamp: '2026-10-16T12:00:00.000Z' })
  const receipt = createPlanningUndo(tasks, after)
  assert.equal(receipt.createdCount, 3); assert.equal(receipt.changedCount, 1)
  assert.deepEqual(undoPlanningBatch(after, receipt), tasks)
  assert.throws(() => undoPlanningBatch(tasks, receipt), /修改或删除/)
})
await test('undo preserves an unrelated edit made after confirmation', () => {
  const tasks = base(), after = applyProposal(tasks, planningPreview(tasks, revision(), ['change:design']).selected, { timestamp: now })
  const receipt = createPlanningUndo(tasks, after), live = after.map(item => item.id === 'unrelated' ? { ...item, note: '后来编辑的无关合成笔记' } : item)
  const restored = undoPlanningBatch(live, receipt)
  assert.equal(restored.find(item => item.id === 'unrelated').note, '后来编辑的无关合成笔记')
  assert.deepEqual(restored.find(item => item.id === 'design'), tasks[1])
})
await test('undo refuses to erase later modifications to a changed or created record', () => {
  const tasks = base(), after = applyProposal(tasks, planningPreview(tasks, revision(), ['change:design', 'new:phase', 'new:a']).selected, { timestamp: now })
  const receipt = createPlanningUndo(tasks, after)
  for (const id of ['design', after.at(-1).id]) assert.throws(() => undoPlanningBatch(after.map(item => item.id === id ? { ...item, note: '后来修改' } : item), receipt), /修改或删除/)
})
await test('undo refuses to delete a newly added outside child under a created task', () => {
  const tasks = base(), after = applyProposal(tasks, planningPreview(tasks, revision(), ['new:phase', 'new:a']).selected, { timestamp: now })
  const parent = after.find(item => item.title === '验收阶段')
  assert.throws(() => undoPlanningBatch([...after, task('outside-child', parent.id)], createPlanningUndo(tasks, after)), /本批以外/)
})

const store = initial => {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set: next => { value = next; for (const listener of [...listeners]) listener() }, count: () => listeners.size }
}
function nativeFixture() {
  const sessionState = store({ sessionId: 'owned', running: false, awaitingFirstTurn: false, openState: 'open', removed: false, pendingSubmissions: [] })
  const events = store({ entries: [] }), calls = { prompts: [], releases: 0, newSessions: 0 }
  let current = 'owned', active = true, draft = { phase: 'plain', draft: '', attachmentIds: [] }, responder
  const append = event => events.set({ entries: [...events.getSnapshot().entries, { type: 'durable', event: { surfaceOp: 'append', ...event } }] })
  const session = { getSnapshot: sessionState.getSnapshot, subscribe: sessionState.subscribe,
    prompt: async (content, mode, signal) => {
      calls.prompts.push({ content, mode, signal }); sessionState.set({ ...sessionState.getSnapshot(), running: true })
      append({ type: 'user/message', data: { role: 'user', content } })
      if (responder) await responder(content[0].text)
      return { ok: true }
    } }
  const binding = { sessionId: 'owned', ctx: { scope: 'owned' }, session, eventSource: events }
  const service = { isActive: () => active, currentSession: () => current, ownsSession: id => id === current && id === 'owned', defaultWorkspace: () => ({ workspaceId: 'workspace' }),
    newSession: async () => { calls.newSessions++; return 'owned' },
    ctx: { sessions: { retain: id => { assert.equal(id, 'owned'); return { ready: Promise.resolve(binding), release: () => calls.releases++ } } },
      conversation: { input: { for: ctx => { assert.equal(ctx, binding.ctx); return { state: { getSnapshot: () => draft }, setDraft: () => { throw new Error('must not edit composer') }, submit: () => { throw new Error('must not submit composer') } } } } } }
  }
  const finish = text => {
    append({ type: 'assistant/message', seq: events.getSnapshot().entries.length + 1, data: { message: { role: 'assistant', content: [{ type: 'text', text }] } } })
    sessionState.set({ ...sessionState.getSnapshot(), running: false, awaitingFirstTurn: false })
  }
  return { service, binding, calls, events, sessionState, finish, setResponder: fn => { responder = fn },
    setDraft: value => { draft = value }, setCurrent: value => { current = value }, setActive: value => { active = value } }
}
await test('native button submits only to the retained owned session and never touches the composer', async () => {
  const fixture = nativeFixture(); fixture.setResponder(() => fixture.finish('complete reply'))
  const result = await runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'explicit planning' })
  assert.equal(result.text, 'complete reply'); assert.equal(fixture.calls.prompts.length, 1)
  assert.equal(fixture.calls.prompts[0].mode, 'queue'); assert.equal(fixture.calls.releases, 1)
  assert.equal(fixture.events.count() + fixture.sessionState.count(), 0)
})
await test('the planning lifetime retains the binding after a completed turn until workbench disposal', async () => {
  const fixture = nativeFixture(), cache = {}; let owners = 0
  const retain = fixture.service.ctx.sessions.retain
  fixture.service.ctx.sessions.retain = (...args) => { const reference = retain(...args); owners++; return {
    ready: reference.ready, release: () => { owners--; reference.release() } } }
  fixture.service.ctx.sessions.binding = () => owners > 0 ? fixture.binding : undefined
  fixture.setResponder(() => fixture.finish('complete reply'))
  keepOwnedPlanningSession(cache, fixture.service, 'owned')
  keepOwnedPlanningSession(cache, fixture.service, 'owned')
  await runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning' })
  assert.equal(owners, 1); assert.equal(fixture.service.ctx.sessions.binding('owned'), fixture.binding)
  releaseOwnedPlanningSession(cache); releaseOwnedPlanningSession(cache)
  assert.equal(owners, 0); assert.equal(fixture.calls.releases, 2)
})
await test('replacing a planning host releases the prior lifetime once without retaining foreign sessions', async () => {
  const first = nativeFixture(), second = nativeFixture(), cache = {}
  keepOwnedPlanningSession(cache, first.service, 'owned')
  keepOwnedPlanningSession(cache, second.service, 'owned'); await Promise.resolve()
  assert.equal(first.calls.releases, 1); assert.equal(second.calls.releases, 0)
  second.setCurrent('foreign')
  assert.throws(() => keepOwnedPlanningSession(cache, second.service, 'foreign'), /归属/)
  assert.equal(cache.nativeLease.sessionId, 'owned')
  releaseOwnedPlanningSession(cache); assert.equal(second.calls.releases, 1)
})
await test('real host runtime context and skill catalog messages do not replace the authored planning turn', async () => {
  const fixture = nativeFixture()
  fixture.setResponder(() => {
    for (const kind of ['runtime-context', 'skill-catalog']) fixture.events.set({ entries: [...fixture.events.getSnapshot().entries,
      { type: 'durable', event: { type: 'user/message', surfaceOp: 'append', data: { role: 'user', source: { kind },
        id: `host-${kind}`, content: [{ type: 'text', text: kind === 'runtime-context' ? 'Current runtime context.' : '<system-reminder>Available skills.</system-reminder>' }] } } }] })
    fixture.finish('completed planning reply')
  })
  const reply = await runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'authored planning request' })
  assert.equal(reply.text, 'completed planning reply'); assert.equal(fixture.calls.prompts.length, 1)
  assert.equal(fixture.events.count() + fixture.sessionState.count(), 0)
})
await test('a later authored or unknown-source message still blocks receiving the earlier proposal', async () => {
  for (const source of [undefined, { kind: 'user' }, { kind: 'unrecognized-context' }]) {
    const fixture = nativeFixture()
    fixture.setResponder(() => {
      fixture.events.set({ entries: [...fixture.events.getSnapshot().entries, { type: 'durable', event: {
        type: 'user/message', surfaceOp: 'append', data: { role: 'user', source,
          content: [{ type: 'text', text: '<system-reminder>different user request</system-reminder>' }] } } }] })
      fixture.finish('must not import this reply')
    })
    await assert.rejects(() => runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'first request' }), /其他消息/)
    assert.equal(fixture.calls.prompts.length, 1); assert.equal(fixture.calls.releases, 1)
  }
})
await test('existing draft text, attachments, busy input or foreign session refuse any native send', async () => {
  for (const draft of [{ phase: 'plain', draft: '保留原草稿', attachmentIds: [] }, { phase: 'plain', draft: '', attachmentIds: ['keep'] }, { phase: 'submitting', draft: '', attachmentIds: [] }]) {
    const fixture = nativeFixture(); fixture.setDraft(draft)
    await assert.rejects(() => runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning' }))
    assert.equal(fixture.calls.prompts.length, 0); assert.equal(fixture.calls.releases, 1)
  }
  const fixture = nativeFixture(); fixture.setCurrent('foreign')
  await assert.rejects(() => runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning' }))
  assert.equal(fixture.calls.prompts.length, 0)
})
await test('old replies and transient streams never become the new planning result', async () => {
  const fixture = nativeFixture()
  fixture.finish('old reply')
  let finish
  const gate = new Promise(resolve => { finish = resolve })
  fixture.setResponder(async () => { await gate; fixture.finish('new reply') })
  const operation = runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'new planning' })
  await Promise.resolve(); await Promise.resolve()
  fixture.events.set({ entries: [...fixture.events.getSnapshot().entries, { type: 'transient', event: { type: 'assistant/message', surfaceOp: 'append', data: { message: { role: 'assistant', content: [{ type: 'text', text: 'streaming' }] } } } }] })
  finish(); assert.equal((await operation).text, 'new reply')
})
await test('cancel and timeout unsubscribe without applying or automatically resending', async () => {
  for (const cancel of [true, false]) {
    const fixture = nativeFixture(), abort = new AbortController()
    const operation = runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning', signal: abort.signal, timeoutMs: cancel ? 1000 : 5 })
    await Promise.resolve(); await Promise.resolve()
    if (cancel) abort.abort()
    await assert.rejects(() => operation)
    assert.equal(fixture.calls.prompts.length, 1); assert.equal(fixture.calls.releases, 1)
    assert.equal(fixture.events.count() + fixture.sessionState.count(), 0)
  }
})
await test('scope or task changes during generation refuse a late reply', async () => {
  const fixture = nativeFixture(); let fresh = true
  fixture.setResponder(() => { fresh = false; fixture.finish('late reply') })
  await assert.rejects(() => runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning',
    validate: () => { if (!fresh) throw new Error('stale task snapshot') } }), /stale/)
  assert.equal(fixture.calls.releases, 1)
})
await test('cancel while a retained session is opening releases it without submitting anything', async () => {
  const fixture = nativeFixture(), abort = new AbortController()
  fixture.service.ctx.sessions.retain = () => ({ ready: new Promise(() => {}), release: () => fixture.calls.releases++ })
  const opening = runOwnedPlanningTurn({ service: fixture.service, sessionId: 'owned', prompt: 'planning', signal: abort.signal, timeoutMs: 20 })
  abort.abort(); await assert.rejects(() => opening)
  assert.equal(fixture.calls.prompts.length, 0); assert.equal(fixture.calls.releases, 1)
})

function panelHarness(fixture) {
  const slots = [], cache = { current: null }
  let cursor = 0, currentTasks = base(), writes = 0, failWrite = false
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(item => item !== null && item !== undefined && item !== false) } }),
    Fragment: 'fragment', useState: initial => { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef: initial => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
    useMemo: fn => fn(), useEffect: () => {},
  }
  const Component = createAIPlanningPanel(React)
  const render = () => { cursor = 0; return Component({ tasks: currentTasks, initialScopeId: 'root', service: fixture.service, stateRef: cache,
    commit: async fn => { const next = fn(currentTasks); writes++; if (failWrite) return false; currentTasks = next; return true } }) }
  const all = node => typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flatMap(all)]
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).map(text).join('')
  const find = predicate => all(render()).find(predicate)
  const input = label => find(node => node.props?.['aria-label'] === label)
  const click = async label => {
    const node = find(node => node.type === 'button' && text(node) === label)
    assert(node, label); assert(!node.props.disabled, `${label} disabled`); await node.props.onClick?.(); render()
  }
  return { render, text: () => text(render()), input, click, cache, writes: () => writes, tasks: () => currentTasks,
    button: label => find(node => node.type === 'button' && text(node) === label),
    submit: async text => { const field = input('规划目标') || input('继续调整方案'); field.props.onChange({ target: { value: text } });
      const form = find(node => node.type === 'form'); await form.props.onSubmit({ preventDefault() {} });
      // The form intentionally starts the async action without blocking DOM events.
      for (let index = 0; index < 20; index++) await Promise.resolve(); render() },
    failWrites: value => { failWrite = value } }
}
await test('sidebar begins with optional workspace off and an empty disabled generation action', () => {
  const panel = panelHarness(nativeFixture())
  assert.equal(panel.input('参考工作域').props.checked, false)
  assert.equal(panel.input('规划目标').props.value, '')
  assert(panel.text().includes('生成方案预览')); assert(!panel.text().includes('确认应用所选'))
  assert.equal(panel.writes(), 0)
})
await test('two integrated bridge turns keep history and versions, selective mixed apply and undo each write once', async () => {
  const fixture = nativeFixture()
  fixture.setResponder(prompt => fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))))
  const panel = panelHarness(fixture), before = structuredClone(panel.tasks())
  await panel.submit('请补齐验收步骤。')
  assert.equal(fixture.calls.prompts.length, 1); assert(panel.text().includes('第 1 版')); assert.equal(panel.writes(), 0)
  panel.input('接受建议：编写说明').props.onChange({ target: { checked: false } }); panel.render()
  await panel.submit('开发日期不要动，保留所选方案。')
  assert.equal(fixture.calls.prompts.length, 2); assert(panel.text().includes('第 2 版'))
  assert.equal(panel.input('接受建议：编写说明').props.checked, false)
  assert.equal(panel.writes(), 0)
  await panel.click('确认应用所选 4 项')
  assert.equal(panel.writes(), 1); assert.equal(panel.tasks().length, 7)
  assert(panel.text().includes('10.19–10.20 → 10.21–10.22'))
  assert(panel.text().includes('自动汇总 · 10.23–10.28'))
  await panel.click('撤销上次应用')
  assert.equal(panel.writes(), 2); assert.deepEqual(panel.tasks(), before)
  assert(panel.text().includes('已撤销'))
})
await test('a clarification and its answer stay in the same planning conversation without a premature preview', async () => {
  const fixture = nativeFixture(); let turns = 0
  fixture.setResponder(prompt => {
    if (++turns === 1) fixture.finish('## 需要确认\n你希望验收在哪一天完成？')
    else { assert(prompt.includes('你希望验收在哪一天完成？')); fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))) }
  })
  const panel = panelHarness(fixture)
  await panel.submit('请补齐验收。'); assert(panel.text().includes('你希望验收在哪一天完成？')); assert(!panel.text().includes('确认应用所选'))
  await panel.submit('10月28日完成。'); assert(panel.text().includes('第 1 版')); assert.equal(fixture.calls.prompts.length, 2)
  assert.equal(fixture.calls.newSessions, 1); assert.equal(panel.writes(), 0)
})
await test('failed confirmation preserves the same draft and retry IDs without resending to AI', async () => {
  const fixture = nativeFixture(); fixture.setResponder(prompt => fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))))
  const panel = panelHarness(fixture); await panel.submit('补齐验收。')
  panel.failWrites(true); await panel.click('确认应用所选 5 项')
  assert.equal(panel.tasks().length, 4); assert(panel.text().includes('保存失败')); assert.equal(panel.cache.current.undo, null)
  panel.failWrites(false); await panel.click('确认应用所选 5 项')
  assert.equal(panel.tasks().length, 8); assert.equal(new Set(panel.tasks().map(item => item.id)).size, 8)
  assert.equal(fixture.calls.prompts.length, 1)
})
await test('two confirmation clicks in one event batch still issue exactly one task save', async () => {
  const fixture = nativeFixture(); fixture.setResponder(prompt => fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))))
  const panel = panelHarness(fixture); await panel.submit('补齐验收。')
  const click = panel.button('确认应用所选 5 项').props.onClick
  await Promise.all([click(), click()]); assert.equal(panel.writes(), 1)
})
await test('undo after starting a new plan marks the original proposal, not another version numbered one', async () => {
  const fixture = nativeFixture(); fixture.setResponder(prompt => fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))))
  const panel = panelHarness(fixture), before = structuredClone(panel.tasks())
  await panel.submit('先调整交互设计。')
  for (const title of ['验收阶段', '编写说明']) panel.input(`接受建议：${title}`).props.onChange({ target: { checked: false } })
  await panel.click('确认应用所选 1 项')
  const original = panel.cache.current.plans.get('branch:root').revisions[0].request.requestId
  await panel.click('开始新规划'); await panel.submit('另外规划一组验收步骤。')
  const next = panel.cache.current.plans.get('branch:root').revisions[0]
  assert.equal(next.number, 1); assert.notEqual(next.request.requestId, original)
  await panel.click('撤销上次应用')
  const current = panel.cache.current.plans.get('branch:root')
  assert.equal(current.phase, 'preview'); assert.equal(current.revisions[0].status, 'draft')
  assert.deepEqual(panel.tasks(), before); assert.equal(panel.writes(), 2)
  await panel.click('恢复前次规划')
  assert.equal(panel.cache.current.plans.get('branch:root').revisions[0].status, 'undone')
  assert(panel.text().includes('本版应用已撤销'))
})
await test('undo of an applied version preserves a later draft as the current preview', async () => {
  const fixture = nativeFixture(); fixture.setResponder(prompt => fixture.finish(JSON.stringify(proposal(JSON.parse(prompt.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId))))
  const panel = panelHarness(fixture), before = structuredClone(panel.tasks())
  await panel.submit('先调整交互设计。')
  for (const title of ['验收阶段', '编写说明']) panel.input(`接受建议：${title}`).props.onChange({ target: { checked: false } })
  await panel.click('确认应用所选 1 项'); await panel.submit('继续补齐验收。')
  await panel.click('撤销上次应用')
  const current = panel.cache.current.plans.get('branch:root')
  assert.equal(current.phase, 'preview'); assert.equal(current.index, 1)
  assert.equal(current.revisions[0].status, 'undone'); assert.equal(current.revisions[1].status, 'draft')
  assert.deepEqual(panel.tasks(), before); assert.equal(panel.writes(), 2)
})
await test('a busy retry cannot replace the pending request, and receiving it preserves new unsent feedback', async () => {
  const fixture = nativeFixture(), panel = panelHarness(fixture)
  await panel.submit('请生成第一版。')
  await panel.click('停止等待'); for (let index = 0; index < 10; index++) await Promise.resolve()
  const first = panel.cache.current.plans.get('branch:root').pending.request
  await panel.submit('开发日期别动，请再补充说明。')
  assert.equal(fixture.calls.prompts.length, 1)
  assert.equal(panel.cache.current.plans.get('branch:root').pending.request.requestId, first.requestId)
  fixture.finish(JSON.stringify(proposal(first.requestId)))
  await panel.click('接收本轮结果')
  assert(panel.text().includes('第 1 版'))
  assert.equal(panel.input('继续调整方案').props.value, '开发日期别动，请再补充说明。')
  assert.equal(panel.writes(), 0)
})
console.log(`\n${passed} planning checks passed`)
