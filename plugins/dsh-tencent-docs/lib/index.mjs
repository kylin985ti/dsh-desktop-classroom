import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import { TencentAuth, ORIGIN } from './auth.mjs';
import { documentURL } from './document.mjs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

export const name = 'tencent-docs';
export const inject = ['connection', 'credentials', 'tools', 'agents'];
const SAFE_TOOLS = new Set(['query_space_node', 'query_space_list', 'get_user_info', 'manage.search_file', 'manage.recent_online_file', 'manage.folder_list', 'manage.query_file_info', 'search_space_file', 'get_content', 'slide_get_info', 'slide_get_page_info', 'slide_get_shape_info', 'slide_get_text', 'slide_get_chart_info', 'smartcanvas.get_element_info', 'smartcanvas.get_page_info', 'smartcanvas.get_top_level_pages', 'smartsheet.list_tables', 'smartsheet.list_views', 'smartsheet.list_fields', 'smartsheet.list_records']);
const mutation = /(?:^|[._-])(?:set|update|create|add|insert|append|replace|edit|write|delete|remove|move|copy|upload|share|grant|revoke|rename|clear|batch)(?:[._-]|$)/;
// An annotation alone must never turn a new/renamed mutating tool into a read.
export const isReadOnly = tool => tool.annotations?.readOnlyHint !== false && !mutation.test(tool.name) && (SAFE_TOOLS.has(tool.name) || /(?:^|\.)(?:get|list|query|search|read)(?:_|$)/.test(tool.name));
const deletion = tool => /(?:^|[._-])(?:delete|remove)(?:[._-]|$)/.test(tool.name);
export function documentId(input) {
  let value = String(input || '').trim();
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(documentURL(value));
    const match = url.pathname.match(/^\/(?:doc|document|sheet|slide|mind|form|smartcanvas|smartsheet|flowchart)\/([^/]+)\/?$/);
    if (!match) throw new Error('请输入包含文档 ID 的腾讯文档链接');
    value = decodeURIComponent(match[1]);
  }
  if (!value || value.length > 300 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('请输入腾讯文档链接或 file_id');
  return value;
}
/** Keep the native rc.2 schema vocabulary; the MCP client still validates the original schema. */
export function nativeInputSchema(schema) {
  if (!schema || typeof schema !== 'object') return {};
  const result = {};
  for (const key of ['description', 'title', 'default', 'examples']) if (schema[key] !== undefined) result[key] = schema[key];
  const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
  if (types.includes(schema.type)) result.type = schema.type;
  else if (schema.properties) result.type = 'object';
  else if (schema.items) result.type = 'array';
  else if (Array.isArray(schema.type) && schema.type.every(type => types.includes(type))) result.oneOf = schema.type.map(type => ({ type }));
  if (result.type === 'object') {
    result.properties = Object.fromEntries(Object.entries(schema.properties || {}).map(([key, value]) => [key, nativeInputSchema(value)]));
    if (Array.isArray(schema.required)) result.required = schema.required.filter(key => key in result.properties);
    result.additionalProperties = typeof schema.additionalProperties === 'boolean' ? schema.additionalProperties : true;
  }
  if (result.type === 'array') result.items = nativeInputSchema(schema.items);
  if (Array.isArray(schema.enum) && result.type && !['object', 'array'].includes(result.type)) result.enum = schema.enum;
  if (schema.const !== undefined && result.type && !['object', 'array'].includes(result.type)) result.enum = [schema.const];
  return result;
}
export function checkedResult(result) {
  if (!result || result.isError) throw new Error('腾讯文档工具调用失败，请检查文档权限或重新授权');
  const values = [result.structuredContent];
  for (const content of result.content || []) if (content.type === 'text') { try { values.push(JSON.parse(content.text)); } catch {} }
  for (const value of values) if (value && typeof value === 'object') {
      const code = value.code ?? value.error_code ?? value.ret ?? value.retcode;
      if ([400006, 400007].includes(Number(code))) throw new Error(Number(code) === 400006 ? '腾讯文档授权失效，请重新登录' : '腾讯文档返回额度或会员权限限制');
      if (code !== undefined && Number.isFinite(Number(code)) && Number(code) !== 0 && (value.msg !== undefined || value.message !== undefined || value.error !== undefined || value.ret !== undefined || value.retcode !== undefined || value.error_code !== undefined)) throw new Error('腾讯文档返回错误 ' + code + '，操作尚未完成');
      if (typeof value.error === 'string' && value.error.trim() && (value.trace_id !== undefined || value.has_next !== undefined)) throw new Error('腾讯文档操作未完成，请检查文档权限和输入');
  }
  return result;
}
export async function apply(ctx) {
  const root = join(process.env.DSH_HOME || join(homedir(), 'Library/Application Support/dsh-desktop/harness'), 'storages/tencent_docs');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, 'connection.json');
  let saved = {}; try { saved = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const listeners = new Set(), streams = new Set(); let revision = 0;
  // Push only an invalidation counter. Grants and document contents never enter events.
  const changed = () => { revision++; for (const listener of listeners) listener(revision); };
  let saving = Promise.resolve();
  const save = () => { const text = JSON.stringify(saved); const task = saving.then(async () => { const temp = path + '.' + randomUUID(); await writeFile(temp, text, { mode: 0o600 }); await rename(temp, path); changed(); }); saving = task.catch(() => {}); return task; };
  saved.commands ||= []; for (const command of saved.commands) if (command.state === 'executing') command.state = 'outcome-unknown';
  if (saved.commands.some(command => command.state === 'outcome-unknown')) await save();
  // Authorization belongs to the account; use of that account is opt-in per Session.
  saved.sessionConnections = Object.assign(Object.create(null), saved.sessionConnections || {});
  const sessionVersions = new Map(), operations = new Map(), registered = new Map(), bindings = new Map();
  const sessionEnabled = id => typeof id === 'string' && Object.hasOwn(saved.sessionConnections, id) && saved.sessionConnections[id] === true;
  const sessionError = () => new Error('请先在当前会话的连接器中启用腾讯文档');
  const clearBinding = id => { const binding = bindings.get(id); if (!binding) return; bindings.delete(id); for (const dispose of binding.disposers.reverse()) dispose(); };
  const syncAgent = agent => {
    const id = agent.session.id;
    clearBinding(id);
    if (!registered.size) return;
    const disposers = [];
    try {
      // Keep inherited names known for old history, but never expose another
      // Session's tools. Own scoped registrations survive an ancestor's mask.
      disposers.push(agent.ctx.tools.restrict({ deny: [...registered.keys()] }));
      if (sessionEnabled(id)) for (const definition of registered.values()) disposers.push(agent.ctx.tools.register(definition));
      bindings.set(id, { agent, disposers });
    } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
  };
  const syncAgents = () => { for (const agent of ctx.agents.list()) syncAgent(agent); };
  const invalidateSession = id => {
    sessionVersions.set(id, (sessionVersions.get(id) || 0) + 1);
    for (const controller of operations.get(id) || []) controller.abort();
    const agent = ctx.agents.get(id); if (agent) syncAgent(agent);
  };
  const inSession = async (id, signal, work) => {
    if (!sessionEnabled(id)) throw sessionError();
    const version = sessionVersions.get(id) || 0, accountVersion = grantRevision, controller = new AbortController();
    const active = operations.get(id) || new Set(); operations.set(id, active); active.add(controller);
    const guard = () => !disposed && sessionEnabled(id) && version === (sessionVersions.get(id) || 0) && accountVersion === grantRevision;
    try { return await work({ guard, signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal }); }
    finally { active.delete(controller); if (!active.size) operations.delete(id); }
  };
  ctx.on('agent/created', ({ agent }) => syncAgent(agent));
  ctx.on('agent/disposed', ({ agent }) => { if (bindings.get(agent.session.id)?.agent === agent) clearBinding(agent.session.id); });
  ctx.effect(() => ctx.tools.guard(execution => execution.name.startsWith('mcp__tencent_docs__') && !sessionEnabled(execution.agent?.session?.id) ? sessionError().message : undefined));
  let client = null, connecting = null, authorization = '', definitions = [], disposers = [], disposed = false, grantRevision = 0, connectionError = '';
  const disconnect = async () => { for (const id of [...bindings.keys()]) clearBinding(id); for (const dispose of disposers) dispose(); disposers = []; registered.clear(); definitions = []; const old = client; client = null; authorization = ''; if (old) await old.close().catch(() => {}); };
  const auth = new TencentAuth({ credentials: ctx.credentials, client: saved.client, saveClient: async value => { saved.client = value; await save(); }, onGrant: async () => {
    grantRevision++; await disconnect(); connectionError = ''; delete saved.verified; delete saved.identity; saved.allowWrite = false;
    for (const id of Object.keys(saved.sessionConnections)) { delete saved.sessionConnections[id]; invalidateSession(id); }
    for (const command of saved.commands) if (command.state === 'pending') command.state = 'account-changed';
    await save();
    // A successful login prepares the account; each Session still opts in.
    // Connection failure remains distinct from saved authorization and is retryable.
    if (connecting) await connecting.catch(() => {});
    if (await auth.grant()) await connect().catch(() => {});
  } });
  const connect = async () => {
    if (disposed) throw new Error('插件已关闭');
    const header = await auth.authorization(); if (client && header === authorization) return client;
    if (connecting) { await connecting; return connect(); }
    const revision = grantRevision;
    connectionError = '';
    connecting = (async () => {
      await disconnect();
      const next = new Client({ name: 'dsh-desktop-tencent-docs', version: '0.4.0' });
      const wire = new StreamableHTTPClientTransport(new URL(ORIGIN + '/openapi/mcp'), { requestInit: { headers: { Authorization: header } } });
      try {
        await next.connect(wire, { timeout: 20000 });
        const list = await next.listTools(undefined, { timeout: 20000 });
        if (disposed || revision !== grantRevision) throw new Error('腾讯文档账号已变化，请重新连接');
        client = next; authorization = header; definitions = list.tools;
        for (const tool of definitions) {
          if (tool.execution?.taskSupport === 'required' || deletion(tool)) continue;
          const cleaned = tool.name.replace(/[^A-Za-z0-9_-]/g, '_');
          const publicName = ('mcp__tencent_docs__' + cleaned).slice(0, 50) + '_' + createHash('sha256').update(tool.name).digest('hex').slice(0, 8);
          const definition = createMcpToolDefinition(ctx, { name: publicName, rawName: tool.name, description: (tool.description || tool.name) + (isReadOnly(tool) ? '' : '\n此操作只生成待确认修改；用户在腾讯文档连接器审阅并确认后才真正执行，确认前不可声称已修改。'), inputSchema: nativeInputSchema(tool.inputSchema), outputSchema: isReadOnly(tool) ? tool.outputSchema : undefined, call: async (args, execution) => inSession(execution.agent?.session?.id, execution.signal, async options => {
            if (!isReadOnly(tool)) {
              const command = await propose(tool.name, args, execution.agent.session.id, options);
              return { content: [{ type: 'text', text: JSON.stringify({ status: 'pending-user-confirmation', operationId: command.id, tool: command.tool, message: '修改尚未执行，请在会话输入区的腾讯文档连接器中审阅并确认。' }) }] };
            }
            return call(tool.name, args, { ...options, readOnly: true });
          }) });
          disposers.push(ctx.tools.register(definition));
          registered.set(publicName, definition);
        }
        syncAgents();
        return next;
      } catch { await next.close().catch(() => {}); await disconnect(); connectionError = '腾讯文档连接失败：请检查登录授权、网络或可用额度'; throw new Error(connectionError); }
    })().finally(() => { connecting = null; changed(); });
    changed();
    return connecting;
  };
  const call = async (toolName, args, { signal, readOnly = false, guard } = {}) => {
    if (guard && !guard()) throw Object.assign(sessionError(), { notExecuted: true });
    const ready = await connect(), tool = definitions.find(tool => tool.name === toolName);
    if (!tool || deletion(tool) || tool.execution?.taskSupport === 'required') throw new Error('腾讯文档未提供所需工具');
    if (readOnly && !isReadOnly(tool)) throw new Error('腾讯文档未提供所需只读工具');
    // Run after all awaits, immediately before invoking the official write tool.
    if (guard && !guard()) throw Object.assign(new Error('腾讯文档连接或修改权限已变化，未执行写入'), { notExecuted: true });
    const result = checkedResult(await ready.callTool({ name: toolName, arguments: args }, { signal, timeout: 60000, toolDefinition: tool }));
    if (readOnly && guard && !guard()) throw new Error('腾讯文档已在当前会话关闭，未返回读取内容');
    return result;
  };
  const read = async (toolName, args, signal) => {
    const result = await call(toolName, args, { signal, readOnly: true });
    saved.verified = { at: new Date().toISOString(), level: 'document-read', tools: definitions.length };
    await save(); return result;
  };
  const digest = result => {
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !['request_id', 'requestId', 'trace_id', 'traceId'].includes(key)).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])) : value;
    const content = (result.content || []).map(item => {
      if (item.type !== 'text') return item;
      try { const value = JSON.parse(item.text); return stable(value.data ?? value.content ?? value); } catch { return item.text; }
    });
    return createHash('sha256').update(JSON.stringify({ content, ...(result.structuredContent === undefined ? {} : { structuredContent: stable(result.structuredContent) }) })).digest('hex');
  };
  const beforePlan = (toolName, args, fileId) => {
    if (!fileId) return [];
    const plan = [{ name: 'get_content', arguments: { file_id: fileId } }];
    if (toolName === 'sheet.set_cell_value' || toolName === 'sheet.set_range_value') {
      const values = toolName === 'sheet.set_cell_value' ? [args] : args.values;
      if (!Array.isArray(values) || !values.length || values.length > 1000 || !args.sheet_id || values.some(cell => !Number.isInteger(cell.row) || cell.row < 0 || !Number.isInteger(cell.col) || cell.col < 0 || !['STRING', 'NUMBER', 'BOOL', 'FORMULA'].includes(String(cell.value_type || '').toUpperCase()))) throw new Error('腾讯文档单元格修改需要明确的工作表、行列和数据类型，请分批处理');
      const rows = values.map(cell => cell.row), columns = values.map(cell => cell.col);
      const start_row = Math.min(...rows), end_row = Math.max(...rows), start_col = Math.min(...columns), end_col = Math.max(...columns);
      if ((end_row - start_row + 1) * (end_col - start_col + 1) > 10000) throw new Error('腾讯文档修改区域过大，请按相邻单元格分批处理');
      plan.push({ name: 'sheet.get_cell_data', arguments: { file_id: fileId, sheet_id: args.sheet_id, start_row, end_row, start_col, end_col, include_formula: true, return_csv: false } });
    }
    return plan;
  };
  const readBefore = async (plan, options = {}) => {
    if (!plan.length) return null;
    const snapshots = []; for (const item of plan) snapshots.push({ name: item.name, result: await call(item.name, item.arguments, { ...options, readOnly: true }) });
    return snapshots.length === 1 ? snapshots[0].result : { content: snapshots.flatMap(item => [{ type: 'text', text: item.name }, ...item.result.content]) };
  };
  const propose = async (toolName, args, sessionId, options) => {
    if (!saved.allowWrite) throw new Error('腾讯文档写入尚未开启，请在腾讯文档插件中开启后再修改');
    const revision = grantRevision;
    const snapshot = JSON.parse(JSON.stringify(args)); if (Buffer.byteLength(JSON.stringify(snapshot)) > 512000) throw new Error('腾讯文档修改内容过长，请分批处理');
    if (saved.commands.filter(command => command.state === 'pending').length >= 40) throw new Error('腾讯文档待确认修改较多，请先处理现有清单');
    const fileId = ['file_id', 'doc_id', 'document_id'].map(key => snapshot[key]).find(value => typeof value === 'string') || null;
    // Existing-document changes require a successful read for a conflict check.
    const readPlan = beforePlan(toolName, snapshot, fileId);
    const before = await readBefore(readPlan, options);
    if (revision !== grantRevision || !saved.allowWrite || disposed || !options.guard()) throw new Error('腾讯文档连接或修改权限已变化，请重新提出修改');
    const command = { id: randomUUID(), tool: toolName, arguments: snapshot, fileId, ...(typeof sessionId === 'string' && sessionId ? { sessionId } : {}), readPlan, before, beforeHash: before ? digest(before) : null, state: 'pending', at: new Date().toISOString() };
    saved.commands.unshift(command); saved.commands = saved.commands.filter((command, index) => command.state === 'pending' || command.state === 'executing' || command.state === 'outcome-unknown' || index < 50); await save(); return command;
  };
  const approving = new Set();
  const approve = async id => {
    const command = saved.commands.find(command => command.id === id);
    if (!command || command.state !== 'pending' || approving.has(id)) throw new Error('腾讯文档修改请求已处理或正在执行');
    if (!saved.allowWrite) throw new Error('腾讯文档写入尚未开启');
    const perform = async (options = {}) => {
      const revision = grantRevision;
      approving.add(id);
      try {
        if (command.fileId && digest(await readBefore(command.readPlan || [{ name: 'get_content', arguments: { file_id: command.fileId } }], options)) !== command.beforeHash) throw new Error('腾讯文档已在别处变化，请重新生成修改建议并核对');
        if (command.state !== 'pending' || revision !== grantRevision || !saved.allowWrite || disposed || options.guard && !options.guard()) throw new Error('腾讯文档连接或修改权限已变化，未执行写入');
        command.state = 'executing'; await save();
        try { command.result = await call(command.tool, command.arguments, { signal: options.signal, guard: () => command.state === 'executing' && revision === grantRevision && saved.allowWrite && !disposed && (!options.guard || options.guard()) }); command.state = 'completed'; command.completedAt = new Date().toISOString(); await save(); return command; }
        catch (error) { command.state = error.notExecuted ? (revision === grantRevision ? 'pending' : 'account-changed') : 'outcome-unknown'; await save(); if (error.notExecuted) throw error; throw new Error('腾讯文档未返回明确写入结果。请先打开文档核对，本插件不会自动重复执行。'); }
      } finally { approving.delete(id); }
    };
    return command.sessionId ? inSession(command.sessionId, undefined, perform) : perform();
  };
  ctx.effect(() => () => { disposed = true; auth.dispose(); for (const active of operations.values()) for (const controller of active) controller.abort(); for (const close of [...streams]) close(); void disconnect(); });
  // Desktop's HTTP bridge otherwise attaches a streaming body to this GET.
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/tencent-docs/events', methods: ['GET'], requestBody: 'buffered', fetch(request) {
    const encoder = new TextEncoder(); let stop = () => {};
    const body = new ReadableStream({
      start(controller) {
        let closed = false, timer;
        const send = value => { if (!closed) { try { controller.enqueue(encoder.encode(value)); } catch { stop(); } } };
        const listener = value => send('event: changed\ndata: ' + JSON.stringify({ revision: value }) + '\n\n');
        stop = () => { if (closed) return; closed = true; clearInterval(timer); listeners.delete(listener); streams.delete(stop); request.signal.removeEventListener('abort', stop); try { controller.close(); } catch {} };
        listeners.add(listener); streams.add(stop); request.signal.addEventListener('abort', stop, { once: true });
        listener(revision); timer = setInterval(() => send(': keepalive\n\n'), 25000); timer.unref?.();
        if (request.signal.aborted || disposed) stop();
      },
      cancel() { stop(); },
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
  } }), 'tencent-docs: authenticated connector state events');
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/tencent-docs', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    try {
      const body = await request.json();
      const scoped = body.scope === 'session';
      if (scoped && (typeof body.sessionId !== 'string' || !body.sessionId || body.sessionId.length > 300)) throw new Error('请打开有效会话后使用腾讯文档连接器');
      const scopedCommand = id => {
        const command = saved.commands.find(item => item.id === id);
        if (scoped && command?.sessionId !== body.sessionId) throw new Error('腾讯文档修改不属于当前会话，请到连接器页面核对');
        return command;
      };
      switch (body.action) {
        case 'status': return Response.json({ connector: 'tencent-docs', authorized: !!(await auth.grant()), connected: !!client, connecting: !!connecting, toolCount: registered.size, conversationEnabled: scoped ? sessionEnabled(body.sessionId) : null, sessionToolCount: scoped && ctx.agents.get(body.sessionId) ? ctx.tools.schemas(ctx.agents.get(body.sessionId)).filter(tool => tool.name.startsWith('mcp__tencent_docs__')).length : 0, verified: saved.verified || null, allowWrite: !!saved.allowWrite, login: auth.publicPending(), error: auth.lastError || connectionError, otherPendingCount: scoped ? saved.commands.filter(command => command.state === 'pending' && command.sessionId !== body.sessionId).length : 0, commands: saved.commands.filter(command => !scoped || command.sessionId === body.sessionId).map(({ result, ...command }) => ({ ...command, sessionEnabled: command.sessionId ? sessionEnabled(command.sessionId) : null })) });
        case 'sessionConnection': {
          if (!scoped) throw new Error('请在会话内选择腾讯文档连接器');
          if (body.enabled !== true && body.enabled !== false) throw new Error('请选择是否在本会话使用腾讯文档');
          if (body.enabled && !(await auth.grant())) throw new Error('请先登录腾讯文档');
          if (sessionEnabled(body.sessionId) !== body.enabled) {
            if (body.enabled) saved.sessionConnections[body.sessionId] = true; else delete saved.sessionConnections[body.sessionId];
            invalidateSession(body.sessionId); await save();
          }
          if (body.enabled) await connect();
          return Response.json({ conversationEnabled: sessionEnabled(body.sessionId) });
        }
        case 'login': return Response.json({ login: await auth.begin() });
        case 'token': await auth.setPersonalToken(body.token); return Response.json({ ok: true });
        case 'logout': await auth.logout(); return Response.json({ ok: true });
        case 'allowWrite': if (!(await auth.grant())) throw new Error('请先登录腾讯文档'); saved.allowWrite = body.enabled === true; await save(); return Response.json({ allowWrite: saved.allowWrite });
        case 'discover': await connect(); return Response.json({ tools: definitions.filter(tool => !deletion(tool) && tool.execution?.taskSupport !== 'required').map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, readOnly: isReadOnly(tool) })) });
        case 'approve': scopedCommand(body.id); return Response.json({ command: await approve(body.id) });
        case 'reject': {
          const command = scopedCommand(body.id); if (!command || command.state !== 'pending') throw new Error('腾讯文档修改请求已处理'); command.state = 'rejected'; await save(); return Response.json({ ok: true });
        }
        case 'read': {
          const args = { file_id: documentId(body.fileId) };
          const result = scoped ? await inSession(body.sessionId, undefined, options => call('get_content', args, { ...options, readOnly: true })) : await read('get_content', args);
          return Response.json({ result, verified: saved.verified });
        }
        default: throw new Error('未知操作');
      }
    } catch (error) { const message = error.message.startsWith('腾讯文档') || error.message.startsWith('请') || error.message === '未知操作' ? error.message : '操作未完成，请检查输入或重新验证连接'; return Response.json({ error: message }, { status: 400 }); }
  } }), 'tencent-docs: authenticated local API');
  // Restore the agent tool bridge once on launch, without a reconnect loop.
  if (await auth.grant()) void connect().catch(() => {});
}
