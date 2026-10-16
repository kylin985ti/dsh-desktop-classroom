import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sources = {
  '@modelcontextprotocol/client': `export class Client { constructor(){this.f=globalThis.__tencentApiFixture;this.f.clients++;} async connect(wire){this.f.wires.push(wire);if(this.f.failConnect)throw Error('synthetic connection failure');} async close(){} async listTools(){return {tools:this.f.tools};} async callTool(q,options){this.f.calls.push(q);return this.f.answer(q,options);} } export class StreamableHTTPClientTransport {constructor(url,options){this.url=url.href;this.options=options;}}`,
  '@deepseek-ai/dsh-mcp-client': `export const createMcpToolDefinition=(_ctx,value)=>value;`,
};
const hook = registerHooks({ resolve(specifier, context, next) { return sources[specifier] ? { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true } : next(specifier, context); } });
const { apply, isReadOnly, documentId, checkedResult, nativeInputSchema } = await import('../plugins/dsh-tencent-docs/lib/index.mjs'); hook.deregister();
const response = data => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
async function fixture({ granted = true, saved = {} } = {}) {
  const home = await fs.mkdtemp(join(tmpdir(), 'dsh-tencent-api-')), previous = process.env.DSH_HOME;
  const path = join(home, 'storages/tencent_docs/connection.json');
  await fs.mkdir(join(home, 'storages/tencent_docs'), { recursive: true }); await fs.writeFile(path, JSON.stringify(saved));
  const state = {
    clients: 0, calls: [], wires: [], writes: 0, content: '合成内容', cells: 0, beforeRead: null, failWrite: false,
    tools: ['get_content', 'sheet.get_cell_data', 'sheet.set_cell_value', 'doc.update_content', 'doc.create', 'doc.delete', 'get_and_update_content', 'new_unknown_tool'].map(name => ({ name, inputSchema: { type: 'object', properties: { file_id: { type: 'string' } } } })),
    async answer(q) {
      if (q.name === 'get_content') { if (state.beforeRead) await state.beforeRead(); return response({ content: state.content, trace_id: String(Math.random()) }); }
      if (q.name === 'sheet.get_cell_data') return response({ cells: [{ row: 0, col: 0, value: state.cells }] });
      state.writes++;
      if (state.failWrite) throw new Error('synthetic transport failure after possible write');
      return response({ code: 0, message: 'synthetic success' });
    },
  };
  let record = granted ? { kind: 'grant', payload: { mode: 'personal-token', accessToken: 'synthetic-only-token' } } : null;
  const credentials = { readRecord: async () => record, modifyRecord: async (_key, fn) => { const next = await fn(record); if (next !== undefined) record = next; }, deleteRecord: async () => { record = null; } };
  globalThis.__tencentApiFixture = state; const routes = new Map(), cleanup = [], tools = new Map(); process.env.DSH_HOME = home;
  try {
    await apply({ effect: fn => { const dispose = fn(); if (typeof dispose === 'function') cleanup.push(dispose); }, credentials, tools: { register: value => { tools.set(value.rawName, value); return () => tools.delete(value.rawName); } }, connection: { fetch: { register: value => { routes.set(value.path, value); return () => {}; } } } });
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; }
  const request = async body => { const r = await routes.get('/api/tencent-docs').fetch(new Request('http://localhost/api/tencent-docs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return { status: r.status, value: await r.json() }; };
  if (granted) assert.equal((await request({ action: 'discover' })).status, 200);
  return { state, home, tools, request, events: signal => { const route = routes.get('/api/tencent-docs/events'); assert.equal(route.requestBody, 'buffered', 'Desktop HTTP bridge must not attach a request body to GET'); return route.fetch(new Request('http://localhost/api/tencent-docs/events', { signal })); }, stored: async () => JSON.parse(await fs.readFile(path, 'utf8')), tool: (name, args, sessionId) => tools.get(name).call(args, { signal: new AbortController().signal, ...(sessionId ? { agent: { session: { id: sessionId } } } : {}) }), async close() { for (const fn of cleanup.reverse()) fn(); delete globalThis.__tencentApiFixture; await fs.rm(home, { recursive: true, force: true }); } };
}
const propose = async f => { await f.request({ action: 'allowWrite', enabled: true }); const r = await f.tool('doc.update_content', { file_id: 'synthetic', content: '新内容' }); return JSON.parse(r.content[0].text).operationId; };
test('without authorization status does not contact Tencent or expose credentials; old browser routes are gone', async () => {
  const f = await fixture({ granted: false });
  try {
    const r = await f.request({ action: 'status' }); assert.equal(r.value.authorized, false); assert.equal(f.state.clients, 0); assert.equal(f.state.calls.length, 0);
    assert.equal((await f.request({ action: 'allowWrite', enabled: true })).status, 400);
    for (const action of ['openBrowser', 'webInbox', 'webImage', 'dismissWeb', 'workspace', 'preview', 'browse', 'search', 'call']) assert.equal((await f.request({ action })).status, 400);
    assert.equal(f.state.calls.length, 0);
  } finally { await f.close(); }
});
test('official MCP discovery and read use the native tool adapter; discovery alone is not a document read', async () => {
  const f = await fixture();
  try {
    assert.equal(f.state.wires[0].url, 'https://docs.qq.com/openapi/mcp'); assert.equal(f.state.wires[0].options.requestInit.headers.Authorization, 'synthetic-only-token');
    assert.equal((await f.request({ action: 'status' })).value.verified, null); assert.equal(f.state.calls.length, 0); assert.equal(f.tools.has('doc.delete'), false);
    const result = await f.tool('get_content', { file_id: 'synthetic' }); assert.match(result.content[0].text, /合成内容/); assert.equal(f.state.writes, 0);
    const r = await f.request({ action: 'read', fileId: 'https://docs.qq.com/doc/synthetic?access_token=discard' }); assert.equal(r.status, 200); assert.equal(r.value.verified.level, 'document-read'); assert.deepEqual(f.state.calls.at(-1).arguments, { file_id: 'synthetic' });
    assert.equal(JSON.stringify((await f.request({ action: 'status' })).value).includes('synthetic-only-token'), false);
  } finally { await f.close(); }
});
test('all unknown/mutating tools require confirmation even with a read-only annotation or misleading prefix', () => {
  for (const name of ['doc.update_content', 'slide_set_text', 'get_and_update_content', 'doc.get_and_delete', 'new_unknown_tool']) assert.equal(isReadOnly({ name, annotations: { readOnlyHint: true } }), false, name);
  for (const name of ['get_content', 'sheet.get_cell_data', 'slide_get_page_info']) assert.equal(isReadOnly({ name }), true, name);
  assert.equal(isReadOnly({ name: 'get_content', annotations: { readOnlyHint: false } }), false);
});
test('AI proposes an immutable modification; only the exact reviewed id can execute once', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.tool('doc.update_content', { file_id: 'synthetic', content: '新内容' }), /尚未开启/); assert.equal(f.state.writes, 0);
    const id = await propose(f); assert.equal(f.state.writes, 0); assert.equal((await f.stored()).commands[0].state, 'pending');
    assert.equal((await f.request({ action: 'approve', id: 'forged' })).status, 400);
    const r = await f.request({ action: 'approve', id, arguments: { content: '不可替换参数' } }); assert.equal(r.status, 200); assert.equal(r.value.command.state, 'completed');
    assert.deepEqual(f.state.calls.at(-1), { name: 'doc.update_content', arguments: { file_id: 'synthetic', content: '新内容' } }); assert.equal(f.state.writes, 1);
    assert.equal((await f.request({ action: 'approve', id })).status, 400); assert.equal(f.state.writes, 1);
  } finally { await f.close(); }
});
test('document or exact sheet range changes block a write, including zero/false values', async () => {
  const f = await fixture();
  try {
    const id = await propose(f); f.state.content = '外部变化'; assert.equal((await f.request({ action: 'approve', id })).status, 400); assert.equal(f.state.writes, 0);
    f.state.content = '稳定'; const r = await f.tool('sheet.set_cell_value', { file_id: 'synthetic', sheet_id: 'tab1', row: 0, col: 0, value_type: 'BOOL', bool_value: false });
    const sheetId = JSON.parse(r.content[0].text).operationId;
    assert.deepEqual(f.state.calls.at(-1), { name: 'sheet.get_cell_data', arguments: { file_id: 'synthetic', sheet_id: 'tab1', start_row: 0, end_row: 0, start_col: 0, end_col: 0, include_formula: true, return_csv: false } });
    f.state.cells = false; assert.equal((await f.request({ action: 'approve', id: sheetId })).status, 400); assert.equal(f.state.writes, 0);
  } finally { await f.close(); }
});
for (const stop of ['allowWrite', 'reject', 'logout']) test('a concurrent ' + stop + ' during conflict checking prevents the write', async () => {
  const f = await fixture();
  try {
    const id = await propose(f), entered = deferred(), release = deferred();
    f.state.beforeRead = async () => { entered.resolve(); await release.promise; };
    const pending = f.request({ action: 'approve', id }); await entered.promise;
    assert.equal((await f.request({ action: 'approve', id })).status, 400);
    assert.equal((await f.request({ action: stop, id, enabled: false })).status, 200);
    release.resolve(); assert.equal((await pending).status, 400); assert.equal(f.state.writes, 0);
    if (stop === 'logout') { const r = await f.request({ action: 'status' }); assert.equal(r.value.allowWrite, false); assert.equal(r.value.authorized, false); assert.equal(r.value.commands[0].state, 'account-changed'); }
  } finally { await f.close(); }
});
test('ambiguous writes become persistent outcome-unknown and are never retried; crash recovery also forbids retry', async () => {
  const f = await fixture(); let stored;
  try {
    const id = await propose(f); f.state.failWrite = true; assert.equal((await f.request({ action: 'approve', id })).status, 400);
    assert.equal((await f.stored()).commands[0].state, 'outcome-unknown'); assert.equal((await f.request({ action: 'approve', id })).status, 400); assert.equal(f.state.writes, 1);
    stored = await f.stored(); stored.commands[0].state = 'executing';
  } finally { await f.close(); }
  const recovered = await fixture({ saved: stored });
  try { const r = await recovered.request({ action: 'status' }); assert.equal(r.value.commands[0].state, 'outcome-unknown'); assert.equal((await recovered.request({ action: 'approve', id: stored.commands[0].id })).status, 400); assert.equal(recovered.state.writes, 0); } finally { await recovered.close(); }
});
test('invalid links fail before network calls, and native schemas preserve nullable arguments', async () => {
  const f = await fixture();
  try {
    for (const value of ['https://example.com/doc/synthetic', 'https://docs.qq.com:8443/doc/synthetic', 'https://u:p@docs.qq.com/doc/synthetic', 'https://docs.qq.com/desktop/', 'https://docs.qq.com/openapi/mcp/oauth/authorize']) assert.equal((await f.request({ action: 'read', fileId: value })).status, 400);
    assert.equal(f.state.calls.length, 0); assert.equal(documentId('https://docs.qq.com/sheet/synthetic?tab=one'), 'synthetic');
    const schema = nativeInputSchema({ type: 'object', required: ['name'], properties: { name: { type: ['string', 'null'] }, active: { type: 'boolean', const: false } } });
    assert.deepEqual(schema.properties.name.oneOf, [{ type: 'string' }, { type: 'null' }]); assert.deepEqual(schema.properties.active.enum, [false]);
    assert.throws(() => checkedResult(response({ error_code: 400006 })), /授权失效/); assert.throws(() => checkedResult({ isError: true, content: [] }), /调用失败/);
  } finally { await f.close(); }
});
test('structured-only content participates in conflicts and structured business errors never count as success', async () => {
  const f = await fixture();
  try {
    f.state.answer = async q => { if (q.name === 'get_content') return { content: [], structuredContent: { data: { content: f.state.content } } }; f.state.writes++; return response({ code: 0 }); };
    const id = await propose(f); f.state.content = '结构化结果的外部变化';
    assert.equal((await f.request({ action: 'approve', id })).status, 400); assert.equal(f.state.writes, 0);
    assert.throws(() => checkedResult({ content: [], structuredContent: { error_code: 400006 } }), /授权失效/);
    assert.throws(() => checkedResult({ content: [], structuredContent: { retcode: 7, message: 'synthetic error' } }), /返回错误/);
  } finally { await f.close(); }
});
test('saving authorization immediately connects and registers conversation tools without a second discovery action', async () => {
  const f = await fixture({ granted: false });
  try {
    assert.equal((await f.request({ action: 'token', token: 'synthetic-new-connector-token' })).status, 200);
    const status = (await f.request({ action: 'status' })).value;
    assert.equal(status.authorized, true); assert.equal(status.connected, true); assert.equal(status.allowWrite, false);
    assert.ok(f.tools.has('get_content')); assert.equal(f.state.calls.length, 0); assert.equal(f.state.writes, 0);
  } finally { await f.close(); }
});
test('a failed post-authorization connection remains authorized, reports an error and can retry without another login', async () => {
  const f = await fixture({ granted: false });
  try {
    f.state.failConnect = true;
    assert.equal((await f.request({ action: 'token', token: 'synthetic-new-connector-token' })).status, 200);
    const status = (await f.request({ action: 'status' })).value;
    assert.equal(status.authorized, true); assert.equal(status.connected, false); assert.match(status.error, /连接失败/);
    f.state.failConnect = false; assert.equal((await f.request({ action: 'discover' })).status, 200);
    assert.equal((await f.request({ action: 'status' })).value.connected, true); assert.equal(f.state.writes, 0);
  } finally { await f.close(); }
});
test('conversation proposals use the trusted runtime SessionId, isolate other sessions and retain legacy proposals', async () => {
  const f = await fixture();
  try {
    await f.request({ action: 'allowWrite', enabled: true });
    const idOf = r => JSON.parse(r.content[0].text).operationId;
    const own = idOf(await f.tool('doc.update_content', { file_id: 'synthetic', content: 'own', sessionId: 'forged' }, 'session-own'));
    const other = idOf(await f.tool('doc.update_content', { file_id: 'synthetic', content: 'other' }, 'session-other'));
    const legacy = idOf(await f.tool('doc.update_content', { file_id: 'synthetic', content: 'legacy' }));
    const status = (await f.request({ action: 'status', scope: 'session', sessionId: 'session-own' })).value;
    assert.deepEqual(status.commands.map(c => c.id), [own]); assert.equal(status.commands[0].sessionId, 'session-own'); assert.equal(status.otherPendingCount, 2);
    assert.equal((await f.request({ action: 'approve', id: other, scope: 'session', sessionId: 'session-own' })).status, 400);
    assert.equal((await f.request({ action: 'reject', id: legacy, scope: 'session', sessionId: 'session-own' })).status, 400);
    assert.equal((await f.request({ action: 'status', scope: 'session' })).status, 400);
    assert.equal(f.state.writes, 0);
    assert.equal((await f.request({ action: 'reject', id: own, scope: 'session', sessionId: 'session-own' })).status, 200);
    assert.equal((await f.request({ action: 'status' })).value.commands.length, 3);
  } finally { await f.close(); }
});
test('connector events push only invalidation revisions and terminate on request cancellation', async () => {
  const f = await fixture(); const abort = new AbortController();
  try {
    const stream = await f.events(abort.signal), reader = stream.body.getReader();
    assert.equal(stream.headers.get('content-type'), 'text/event-stream');
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /^event: changed\ndata: \{"revision":\d+\}\n\n$/);
    await f.request({ action: 'allowWrite', enabled: true });
    const second = new TextDecoder().decode((await reader.read()).value);
    assert.match(second, /^event: changed\ndata: \{"revision":\d+\}\n\n$/);
    assert.equal((first + second).includes('synthetic'), false); assert.equal(f.state.calls.length, 0);
    abort.abort(); assert.equal((await reader.read()).done, true);
  } finally { await f.close(); }
});
