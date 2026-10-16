import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../plugins/dsh-tencent-docs/lib/client.js', import.meta.url), 'utf8');
async function fixture(initial = {}) {
  let plugin, Panel, cursor = 0, tape = [], effects = [];
  const effectStates = [], listeners = new Map();
  const actions = [], slots = [], status = { authorized: false, connected: false, allowWrite: false, commands: [], ...initial };
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(v => v != null && v !== false) }), useState: value => { const i = cursor++; if (!(i in tape)) tape[i] = value; return [tape[i], value => tape[i] = typeof value === 'function' ? value(tape[i]) : value]; }, useRef: value => { const i = cursor++; return tape[i] ||= { current: value }; }, useEffect: (fn, deps) => { const i = cursor++, previous = effectStates[i]; if (!previous || deps.some((value, n) => !Object.is(value, previous.deps[n]))) effects.push(() => { previous?.cleanup?.(); effectStates[i] = { deps, cleanup: fn() }; }); } };
  let failApproval = false, statusBarrier = null;
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => plugin = value.factory(() => React) }, addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }, removeEventListener: (name, fn) => listeners.get(name)?.delete(fn) }, document: { activeElement: null }, AbortController, fetch: async (_url, { body }) => {
    const q = JSON.parse(body); actions.push(q);
    if (q.action === 'status' && statusBarrier) await statusBarrier;
    if (q.action === 'login') status.login = { url: 'https://docs.qq.com/scenario/open-claw.html?state=synthetic' };
    if (q.action === 'allowWrite') status.allowWrite = q.enabled;
    if (q.action === 'approve') { status.commands = status.commands.map(c => c.id === q.id ? { ...c, state: failApproval ? 'outcome-unknown' : 'completed' } : c); }
    return { ok: !(failApproval && q.action === 'approve'), json: async () => q.action === 'status' ? structuredClone(status) : failApproval && q.action === 'approve' ? { error: '结果待核对' } : { ok: true, tools: [] } };
  } });
  plugin.apply({ effect() {}, slots: { inject: (_name, fn) => fn(), register: (value, component) => { slots.push(value); if (value.key === 'tencent-docs') Panel = component; } } });
  const render = () => { cursor = 0; const tree = Panel(); const pending = effects; effects = []; for (const effect of pending) effect(); return tree; };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); return render(); };
  render(); let tree = await flush();
  const nodes = v => v && typeof v === 'object' ? [v, ...v.children.flatMap(nodes)] : [];
  const text = v => v && typeof v === 'object' ? v.children.map(text).join('') : String(v ?? '');
  const button = label => { const value = nodes(tree).find(n => n.type === 'button' && text(n) === label); assert.ok(value, label); return value; };
  return { actions, slots, status, nodes, text, tree: () => tree, button, fail: () => failApproval = true, async click(label) { await button(label).props.onClick(); tree = await flush(); }, async key(key) { const event = { key, preventDefault() {}, stopPropagation() {} }; for (const fn of [...(listeners.get('keydown') || [])]) fn(event); tree = await flush(); }, slowFocusRefresh() { let release; statusBarrier = new Promise(resolve => release = resolve); for (const fn of listeners.get('focus') || []) fn(); return () => { statusBarrier = null; release(); }; }, keyHandlers: () => listeners.get('keydown')?.size || 0, async refresh() { tree = await flush(); } };
}
test('simple panel loads only local status, shows conversation usage and has no custom browser or preview', async () => {
  const f = await fixture(); assert.deepEqual(f.actions.map(a => a.action), ['status']);
  assert.match(f.text(f.tree()), /在会话里直接使用/); assert.match(f.text(f.tree()), /腾讯官方 MCP/);
  assert.equal(f.nodes(f.tree()).some(n => ['iframe', 'webview'].includes(n.type)), false);
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
