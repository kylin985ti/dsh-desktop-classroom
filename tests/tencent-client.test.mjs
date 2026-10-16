import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../plugins/dsh-tencent-docs/lib/client.js', import.meta.url), 'utf8');
async function fixture(initial = {}, props = {}) {
  let plugin, Panel, cursor = 0, tape = [], effects = [];
  const effectStates = [], listeners = new Map();
  const actions = [], slots = [], navigation = [], sources = [], status = { authorized: false, connected: false, conversationEnabled: false, allowWrite: false, commands: [], ...initial };
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(v => v != null && v !== false) }), useState: value => { const i = cursor++; if (!(i in tape)) tape[i] = value; return [tape[i], value => tape[i] = typeof value === 'function' ? value(tape[i]) : value]; }, useRef: value => { const i = cursor++; return tape[i] ||= { current: value }; }, useEffect: (fn, deps) => { const i = cursor++, previous = effectStates[i]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) effects.push(() => { previous?.cleanup?.(); effectStates[i] = { deps, cleanup: fn() }; }); } };
  let failApproval = false, statusBarrier = null;
  const primitives = { IconLinkOutlineMedium: 'link-icon', IconDeliverDocMedium: 'doc-icon', Tooltip: 'tooltip', MenuSurface: 'menu-surface', useAnchoredPosition: () => ({ left: 20, top: 20 }), useDismissOnOutsidePointer() {} };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => plugin = value.factory(name => name === 'react-dom' ? { createPortal: node => node } : name === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : React) }, addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) }, document: { activeElement: null, body: {} }, EventSource: class { constructor(url) { this.url = url; this.handlers = new Map(); sources.push(this); } addEventListener(name, fn) { this.handlers.set(name, fn); } close() { this.closed = true; } }, AbortController, fetch: async (_url, { body }) => {
    const q = JSON.parse(body); actions.push(q);
    const snapshot = structuredClone(status);
    if (q.scope === 'session') snapshot.commands = snapshot.commands.filter(c => c.sessionId === q.sessionId);
    if (q.action === 'status' && statusBarrier) { const barrier = statusBarrier; statusBarrier = null; await barrier; }
    if (q.action === 'login') status.login = { url: 'https://docs.qq.com/scenario/open-claw.html?state=synthetic' };
    if (q.action === 'allowWrite') status.allowWrite = q.enabled;
    if (q.action === 'sessionConnection') { status.conversationEnabled = q.enabled; status.commands = status.commands.map(c => c.sessionId === q.sessionId ? { ...c, sessionEnabled: q.enabled } : c); }
    if (q.action === 'reject') status.commands = status.commands.map(c => c.id === q.id ? { ...c, state: 'rejected' } : c);
    if (q.action === 'approve') { status.commands = status.commands.map(c => c.id === q.id ? { ...c, state: failApproval ? 'outcome-unknown' : 'completed' } : c); }
    return { ok: !(failApproval && q.action === 'approve'), json: async () => q.action === 'status' ? snapshot : failApproval && q.action === 'approve' ? { error: '结果待核对' } : { ok: true, tools: [] } };
  } });
  plugin.apply({ effect() {}, layout: { selectPanel: key => navigation.push({ selectPanel: key }) }, uiSession: { adapter: { current: { getSnapshot: () => ({ key: initial.noSession ? null : 'session-own' }) } } }, uiWorkspace: { startSession: async () => navigation.push({ startSession: true }) }, slots: { inject: (_name, fn) => fn(), register: (value, component) => { slots.push(value); if (value.key === 'tencent-docs') Panel = component; } } });
  const render = () => { cursor = 0; const tree = Panel(props); const pending = effects; effects = []; for (const effect of pending) effect(); return tree; };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); return render(); };
  render(); let tree = await flush();
  const nodes = v => v && typeof v === 'object' ? [v, ...v.children.flatMap(nodes)] : [];
  const text = v => v && typeof v === 'object' ? v.children.map(text).join('') : String(v ?? '');
  const button = label => { const value = nodes(tree).find(n => n.type === 'button' && (text(n) === label || n.props['aria-label'] === label)); assert.ok(value, label); return value; };
  return { actions, slots, status, navigation, sources, unmount() { for (const e of effectStates) e?.cleanup?.(); }, async event() { for (const fn of sources[0]?.handlers.values() || []) fn(); tree = await flush(); }, nodes, text, tree: () => tree, button, fail: () => failApproval = true, async click(label) { await button(label).props.onClick(); tree = await flush(); }, async toggle(enabled) { const field = nodes(tree).find(n => n.type === 'input' && n.props.role === 'switch'); assert.ok(field); await field.props.onChange({ target: { checked: enabled } }); tree = await flush(); }, async key(key) { const event = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of [...(listeners.get('keydown') || [])]) fn(event); tree = await flush(); }, slowFocusRefresh() { let release; statusBarrier = new Promise(resolve => release = resolve); for (const fn of listeners.get('focus') || []) fn(); return () => { statusBarrier = null; release(); }; }, keyHandlers: () => listeners.get('keydown')?.size || 0, async refresh() { tree = await flush(); } };
}
test('simple panel loads only local status, shows conversation usage and has no custom browser or preview', async () => {
  const f = await fixture(); assert.deepEqual(f.actions.map(a => a.action), ['status']);
  assert.match(f.text(f.tree()), /连接账号，在会话中选择使用/); assert.match(f.text(f.tree()), /腾讯官方 MCP/);
  assert.equal(f.nodes(f.tree()).some(n => ['iframe', 'webview'].includes(n.type)), false);
  assert.equal(f.slots.some(s => s.name === 'conversation.input.left'), true);
  assert.equal(f.slots.some(s => s.name === 'conversation.input.dock'), false);
});
test('OAuth is completed on Tencent official page with an explicit browser link', async () => {
  const f = await fixture(); await f.click('登录并授权');
  const link = f.nodes(f.tree()).find(n => n.type === 'a' && f.text(n) === '在浏览器确认授权');
  assert.ok(link.props.href.startsWith('https://docs.qq.com/')); assert.equal(link.props.target, '_blank');
  assert.deepEqual(f.actions.map(a => a.action), ['status', 'login', 'status']);
});
const command = { id: 'synthetic-id', tool: 'sheet.set_cell_value', fileId: 'synthetic-document', state: 'pending', at: '2026-10-16T00:00:00Z', arguments: { file_id: 'synthetic-document', sheet_id: 'synthetic-tab', row: 9, col: 0, string_value: '合成修改', value_type: 'STRING' } };
test('a proposal is reviewed with its full target/arguments; opening review never executes it', async () => {
  const f = await fixture({ authorized: true, allowWrite: true, commands: [command] }); await f.click('审阅修改');
  const dialog = f.nodes(f.tree()).find(n => n.props.role === 'dialog'); assert.ok(dialog);
  assert.match(f.text(dialog), /synthetic-document/); assert.match(f.text(dialog), /合成修改/); assert.match(f.text(dialog), /"row": 9/);
  assert.equal(f.actions.some(a => a.action === 'approve'), false);
  const button = f.button('确认写入腾讯文档'); const first = button.props.onClick(), duplicate = button.props.onClick(); await Promise.all([first, duplicate]); await f.refresh();
  assert.equal(f.actions.filter(a => a.action === 'approve').length, 1); assert.deepEqual(f.actions.find(a => a.action === 'approve'), { id: command.id, action: 'approve' });
});
test('failed/ambiguous confirmation refreshes state and cannot be repeated from the old dialog', async () => {
  const f = await fixture({ authorized: true, allowWrite: true, commands: [command] }); await f.click('审阅修改'); f.fail(); await f.click('确认写入腾讯文档');
  assert.equal(f.button('确认写入腾讯文档').props.disabled, true); assert.match(f.text(f.tree()), /结果待核对/);
  assert.deepEqual(f.actions.map(a => a.action), ['status', 'approve', 'status']);
});
test('Escape closes review even when native focus is outside it, without executing or rejecting the proposal', async () => {
  const f = await fixture({ authorized: true, allowWrite: true, commands: [command] }); await f.click('审阅修改');
  assert.equal(f.keyHandlers(), 1); await f.key('Escape');
  assert.equal(f.nodes(f.tree()).some(n => n.props.role === 'dialog'), false);
  assert.equal(f.keyHandlers(), 0); assert.equal(f.status.commands[0].state, 'pending');
  assert.deepEqual(f.actions.map(a => a.action), ['status']);
});
test('a passive status refresh on window focus does not prevent Escape from closing review', async () => {
  const f = await fixture({ authorized: true, allowWrite: true, commands: [command] }); await f.click('审阅修改');
  const release = f.slowFocusRefresh();
  try { await f.key('Escape'); assert.equal(f.nodes(f.tree()).some(n => n.props.role === 'dialog'), false); assert.equal(f.status.commands[0].state, 'pending'); assert.equal(f.actions.some(a => a.action === 'approve'), false); }
  finally { release(); await f.refresh(); }
});

test('connected card returns to the selected native conversation without writing or sending a draft', async () => {
  const f = await fixture({ authorized: true, connected: true }); await f.click('去会话');
  assert.deepEqual(f.navigation, [{ selectPanel: null }]);
  assert.deepEqual(f.actions.map(a => a.action), ['status']);
});
test('without a selected conversation the connector uses the native new-session flow', async () => {
  const f = await fixture({ authorized: true, connected: true, noSession: true }); await f.click('去会话');
  assert.deepEqual(f.navigation, [{ startSession: true }]);
  assert.deepEqual(f.actions.map(a => a.action), ['status']);
});
test('conversation dock reviews only its own proposal and rejects it with the exact session scope', async () => {
  const own = { ...command, sessionId: 'session-own', sessionEnabled: true }, other = { ...command, id: 'other-id', fileId: 'other-private-document', sessionId: 'session-other' };
  const f = await fixture({ authorized: true, connected: true, conversationEnabled: true, allowWrite: true, commands: [own, other] }, { compact: true, sessionId: 'session-own' });
  assert.equal(f.text(f.tree()).includes('other-private-document'), false); await f.click('审阅修改');
  await f.key('Escape'); assert.equal(f.status.commands[0].state, 'pending'); await f.click('拒绝');
  assert.deepEqual(f.actions.find(a => a.action === 'reject'), { action: 'reject', id: command.id, scope: 'session', sessionId: 'session-own' });
  assert.equal(f.status.commands[0].state, 'rejected'); assert.equal(f.status.commands[1].state, 'pending');
  assert.equal(f.actions.some(a => a.action === 'approve'), false);
});
test('a pushed connector change reveals the new conversation proposal without focus polling', async () => {
  const f = await fixture({ authorized: true, connected: true, conversationEnabled: true, allowWrite: true }, { compact: true, sessionId: 'session-own' });
  assert.equal(f.text(f.tree()).includes('审阅修改'), false);
  f.status.commands.push({ ...command, sessionId: 'session-own', sessionEnabled: true }); await f.event();
  assert.ok(f.button('审阅修改')); assert.equal(f.sources[0].url, '/api/tencent-docs/events');
  assert.deepEqual(f.actions.map(a => a.action), ['status', 'status']);
  f.unmount(); assert.equal(f.sources[0].closed, true);
});
test('late status responses cannot replace a newer authorization state', async () => {
  const f = await fixture({ authorized: true, connected: true, conversationEnabled: true }, { compact: true, sessionId: 'session-own' });
  const release = f.slowFocusRefresh(); f.status.authorized = false; f.status.connected = false; f.status.conversationEnabled = false;
  await f.event(); assert.ok(f.button('腾讯文档连接器，本会话未启用'));
  release(); await f.refresh(); assert.ok(f.button('腾讯文档连接器，本会话未启用'));
});

test('the native toolbar shows only an icon until opened, and its switch changes only this session', async () => {
  const f = await fixture({ authorized: true, connected: true }, { compact: true, sessionId: 'session-own' });
  assert.equal(f.text(f.tree()), ''); assert.equal(f.nodes(f.tree()).some(n => n.props.role === 'dialog'), false);
  await f.click('腾讯文档连接器，本会话未启用');
  assert.match(f.text(f.tree()), /本会话使用腾讯文档/); assert.match(f.text(f.tree()), /关闭会保留账号授权/);
  await f.toggle(true); assert.ok(f.button('腾讯文档连接器，本会话已启用'));
  await f.toggle(false); assert.ok(f.button('腾讯文档连接器，本会话未启用'));
  assert.deepEqual(f.actions.filter(a => a.action === 'sessionConnection'), [{ action: 'sessionConnection', scope: 'session', sessionId: 'session-own', enabled: true }, { action: 'sessionConnection', scope: 'session', sessionId: 'session-own', enabled: false }]);
  assert.equal(f.actions.some(a => ['logout', 'login', 'read', 'approve'].includes(a.action)), false);
  await f.key('Escape'); assert.equal(f.nodes(f.tree()).some(n => n.props.role === 'dialog'), false);
});
test('a disabled conversation retains its pending proposal, disables approval and can still reject it', async () => {
  const f = await fixture({ authorized: true, connected: true, allowWrite: true, commands: [{ ...command, sessionId: 'session-own', sessionEnabled: false }] }, { compact: true, sessionId: 'session-own' });
  assert.equal(f.button('审阅修改').props.disabled, true); assert.match(f.text(f.tree()), /所属会话未启用/);
  await f.click('拒绝'); assert.equal(f.status.commands[0].state, 'rejected');
  assert.equal(f.actions.some(a => ['logout', 'approve'].includes(a.action)), false);
});
