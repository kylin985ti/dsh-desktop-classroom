import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import { TencentAuth, ORIGIN } from './auth.mjs';
import { documentURL, documentKind, fileList, documentText, sheetTabs, sheetBounds, sheetCells } from './workspace.mjs';
import { DocumentBrowser } from './browser.mjs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';

export const name = 'tencent-docs';
export const inject = ['connection', 'credentials', 'tools'];
const SAFE_TOOLS = new Set(['query_space_node', 'query_space_list', 'get_user_info', 'manage.search_file', 'manage.recent_online_file', 'manage.folder_list', 'manage.query_file_info', 'search_space_file', 'get_content', 'slide_get_info', 'slide_get_page_info', 'slide_get_shape_info', 'slide_get_text', 'slide_get_chart_info', 'smartcanvas.get_element_info', 'smartcanvas.get_page_info', 'smartcanvas.get_top_level_pages', 'smartsheet.list_tables', 'smartsheet.list_views', 'smartsheet.list_fields', 'smartsheet.list_records']);
export const isReadOnly = tool => tool.annotations?.readOnlyHint === true || SAFE_TOOLS.has(tool.name) || /(?:^|\.)(?:get|list|query|search|read)(?:_|$)/.test(tool.name);
const deletion = tool => /(?:^|\.)(?:delete|remove)(?:_|$)/.test(tool.name);
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
  if (result.isError) throw new Error('腾讯文档工具调用失败，请检查文档权限或重新授权');
  for (const content of result.content || []) if (content.type === 'text') {
    try { const value = JSON.parse(content.text); const code = value.code ?? value.error_code ?? value.ret;
      if ([400006, 400007].includes(Number(code))) throw new Error(Number(code) === 400006 ? '腾讯文档授权失效，请重新登录' : '腾讯文档返回额度或会员权限限制');
      if (code !== undefined && Number.isFinite(Number(code)) && Number(code) !== 0 && (value.msg !== undefined || value.message !== undefined || value.error !== undefined || value.ret !== undefined || value.retcode !== undefined || value.error_code !== undefined)) throw new Error('腾讯文档返回错误 ' + code + '，操作尚未完成');
      if (typeof value.error === 'string' && value.error.trim() && (value.trace_id !== undefined || value.has_next !== undefined)) throw new Error('腾讯文档操作未完成，请检查文档权限和输入');
    } catch (error) { if (error.message.startsWith('腾讯文档')) throw error; }
  }
  return result;
}
export async function apply(ctx) {
  const root = join(process.env.DSH_HOME || join(homedir(), 'Library/Application Support/dsh-desktop/harness'), 'storages/tencent_docs');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const browser = new DocumentBrowser(process.env.DSH_HOME || join(homedir(), 'Library/Application Support/dsh-desktop/harness'));
  const path = join(root, 'connection.json');
  let saved = {}; try { saved = JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let saving = Promise.resolve();
  const save = () => { const text = JSON.stringify(saved); const task = saving.then(async () => { const temp = path + '.' + randomUUID(); await writeFile(temp, text, { mode: 0o600 }); await rename(temp, path); }); saving = task.catch(() => {}); return task; };
  saved.commands ||= []; for (const command of saved.commands) if (command.state === 'executing') command.state = 'outcome-unknown';
  if (saved.commands.some(command => command.state === 'outcome-unknown')) await save();
  let client = null, transport = null, connecting = null, authorization = '', definitions = [], disposers = [], disposed = false;
  const disconnect = async () => { for (const dispose of disposers) dispose(); disposers = []; definitions = []; const old = client; client = null; transport = null; authorization = ''; if (old) await old.close().catch(() => {}); };
  const auth = new TencentAuth({ credentials: ctx.credentials, client: saved.client, saveClient: async value => { saved.client = value; await save(); }, onGrant: async () => { await disconnect(); delete saved.verified; delete saved.identity; saved.allowWrite = false; for (const command of saved.commands) if (command.state === 'pending') command.state = 'account-changed'; await save(); } });
  const connect = async () => {
    if (disposed) throw new Error('插件已关闭');
    const header = await auth.authorization(); if (client && header === authorization) return client;
    if (connecting) { await connecting; return connect(); }
    connecting = (async () => {
      await disconnect();
      const next = new Client({ name: 'dsh-desktop-tencent-docs', version: '0.3.0' });
      const wire = new StreamableHTTPClientTransport(new URL(ORIGIN + '/openapi/mcp'), { requestInit: { headers: { Authorization: header } } });
      try {
        await next.connect(wire, { timeout: 20000 });
        const list = await next.listTools(undefined, { timeout: 20000 });
        if (disposed) throw new Error('插件已关闭');
        client = next; transport = wire; authorization = header; definitions = list.tools;
        for (const tool of definitions) {
          if (tool.execution?.taskSupport === 'required' || deletion(tool)) continue;
          const cleaned = tool.name.replace(/[^A-Za-z0-9_-]/g, '_');
          const publicName = ('mcp__tencent_docs__' + cleaned).slice(0, 50) + '_' + createHash('sha256').update(tool.name).digest('hex').slice(0, 8);
          const definition = createMcpToolDefinition(ctx, { name: publicName, rawName: tool.name, description: (tool.description || tool.name) + (isReadOnly(tool) ? '' : '\n此操作只生成待确认修改；用户在腾讯文档插件审阅并确认后才真正执行，确认前不可声称已修改。'), inputSchema: nativeInputSchema(tool.inputSchema), outputSchema: isReadOnly(tool) ? tool.outputSchema : undefined, call: async (args, execution) => {
            if (!isReadOnly(tool)) {
              const command = await propose(tool.name, args);
              return { content: [{ type: 'text', text: JSON.stringify({ status: 'pending-user-confirmation', operationId: command.id, tool: command.tool, message: '修改尚未执行，请用户到腾讯文档插件审阅并确认。' }) }] };
            }
            const ready = await connect(); return checkedResult(await ready.callTool({ name: tool.name, arguments: args }, { signal: execution.signal, timeout: 60000, toolDefinition: tool }));
          } });
          disposers.push(ctx.tools.register(definition));
        }
        return next;
      } catch { await next.close().catch(() => {}); await disconnect(); throw new Error('腾讯文档连接失败：请检查登录授权、网络或可用额度'); }
    })().finally(() => { connecting = null; });
    return connecting;
  };
  const call = async (toolName, args) => { const ready = await connect(), tool = definitions.find(tool => tool.name === toolName); if (!tool) throw new Error('腾讯文档未提供所需工具'); return checkedResult(await ready.callTool({ name: toolName, arguments: args }, { timeout: 60000, toolDefinition: tool })); };
  const digest = result => {
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => !['request_id', 'requestId', 'trace_id', 'traceId'].includes(key)).map(([key, item]) => [key, stable(item)])) : value;
    const content = (result.content || []).map(item => {
      if (item.type !== 'text') return item;
      try { const value = JSON.parse(item.text); return stable(value.data ?? value.content ?? value); } catch { return item.text; }
    });
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
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
  const readBefore = async plan => {
    if (!plan.length) return null;
    const snapshots = []; for (const item of plan) snapshots.push({ name: item.name, result: await call(item.name, item.arguments) });
    return snapshots.length === 1 ? snapshots[0].result : { content: snapshots.flatMap(item => [{ type: 'text', text: item.name }, ...item.result.content]) };
  };
  const propose = async (toolName, args) => {
    if (!saved.allowWrite) throw new Error('腾讯文档写入尚未开启，请在腾讯文档插件中开启后再修改');
    const snapshot = JSON.parse(JSON.stringify(args)); if (Buffer.byteLength(JSON.stringify(snapshot)) > 512000) throw new Error('腾讯文档修改内容过长，请分批处理');
    if (saved.commands.filter(command => command.state === 'pending').length >= 40) throw new Error('腾讯文档待确认修改较多，请先处理现有清单');
    const fileId = ['file_id', 'doc_id', 'document_id'].map(key => snapshot[key]).find(value => typeof value === 'string') || null;
    // Existing-document changes require a successful read for a conflict check.
    const readPlan = beforePlan(toolName, snapshot, fileId);
    const before = await readBefore(readPlan);
    const command = { id: randomUUID(), tool: toolName, arguments: snapshot, fileId, readPlan, before, beforeHash: before ? digest(before) : null, state: 'pending', at: new Date().toISOString() };
    saved.commands.unshift(command); saved.commands = saved.commands.filter((command, index) => command.state === 'pending' || command.state === 'executing' || command.state === 'outcome-unknown' || index < 50); await save(); return command;
  };
  const approving = new Set();
  const approve = async id => {
    const command = saved.commands.find(command => command.id === id);
    if (!command || command.state !== 'pending' || approving.has(id)) throw new Error('腾讯文档修改请求已处理或正在执行');
    if (!saved.allowWrite) throw new Error('腾讯文档写入尚未开启');
    approving.add(id);
    try {
      if (command.fileId && digest(await readBefore(command.readPlan || [{ name: 'get_content', arguments: { file_id: command.fileId } }])) !== command.beforeHash) throw new Error('腾讯文档已在别处变化，请重新生成修改建议并核对');
      command.state = 'executing'; await save();
      try { command.result = await call(command.tool, command.arguments); command.state = 'completed'; command.completedAt = new Date().toISOString(); await save(); return command; }
      catch (error) { command.state = 'outcome-unknown'; await save(); throw new Error('腾讯文档未返回明确写入结果。请先打开文档核对，本插件不会自动重复执行。'); }
    } finally { approving.delete(id); }
  };
  ctx.effect(() => () => { disposed = true; auth.dispose(); void disconnect(); });
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/tencent-docs', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    try {
      const body = await request.json();
      switch (body.action) {
        case 'status': return Response.json({ authorized: !!(await auth.grant()), connected: !!client, toolCount: definitions.length, verified: saved.verified || null, identity: saved.identity || null, allowWrite: !!saved.allowWrite, login: auth.publicPending(), error: auth.lastError, commands: saved.commands, browser: await browser.describe() });
        case 'login': return Response.json({ login: await auth.begin() });
        case 'token': await auth.setPersonalToken(body.token); return Response.json({ ok: true });
        case 'logout': await auth.logout(); return Response.json({ ok: true });
        case 'allowWrite': saved.allowWrite = body.enabled === true; await save(); return Response.json({ allowWrite: saved.allowWrite });
        case 'openBrowser': await browser.open(body.url); return Response.json({ ok: true });
        case 'webInbox': return Response.json({ rows: await browser.list() });
        case 'webImage': return Response.json({ image: await browser.image(body.id) });
        case 'dismissWeb': await browser.dismiss(body.id); return Response.json({ ok: true });
        case 'workspace': {
          if (!(await auth.grant())) return Response.json({ authorized: false, rows: [], hasMore: false });
          const page = Number(body.page ?? 1); if (!Number.isInteger(page) || page < 1 || page > 100) throw new Error('请使用有效的列表页码');
          const section = body.section === 'mine' ? 'mine' : 'recent';
          const result = section === 'mine' ? await call('manage.folder_list', { start: (page - 1) * 20, ...(body.folderId ? { folder_id: String(body.folderId).slice(0,300) } : {}) }) : await call('manage.recent_online_file', { num: page, count: 20, order_by: 0 });
          return Response.json({ authorized: true, section, page, ...fileList(result) });
        }
        case 'preview': {
          const fileId = documentId(body.fileId),kind=documentKind(body.fileId)||body.kind;
          if(kind==='sheet') {
            const tabs=sheetTabs(await call('sheet.get_sheet_info',{file_id:fileId}));
            if(!tabs.length)throw Error('腾讯文档没有返回可读取的工作表，请打开原网页');
            let requested=body.sheetId;try{requested ||= new URL(body.fileId).searchParams.get('tab');}catch{}
            const sheet=tabs.find(s=>s.id===requested)||tabs[0],bounds=sheetBounds(sheet,body.startRow??0,body.startCol??0);
            const result=await call('sheet.get_cell_data',{file_id:fileId,sheet_id:sheet.id,start_row:bounds.startRow,end_row:bounds.endRow,start_col:bounds.startCol,end_col:bounds.endCol,include_formula:true,return_csv:false});
            saved.verified={at:new Date().toISOString(),level:'sheet-range-read',tools:definitions.length};await save();
            return Response.json({fileId,kind:'sheet',tabs,sheet,bounds,cells:sheetCells(result,bounds),text:'',verified:saved.verified});
          }
          const result = await call('get_content', { file_id: fileId });
          const text = documentText(result); if (!text.trim()) throw new Error('腾讯文档没有返回可引用的正文，请打开网页查看或选择文字');
          saved.verified = { at: new Date().toISOString(), level: 'document-read', tools: definitions.length }; await save();
          return Response.json({ fileId, kind:kind||'doc', text, verified: saved.verified });
        }
        case 'documentLink': return Response.json({ url: documentURL(body.url) });
        case 'discover': await connect(); return Response.json({ tools: definitions.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, readOnly: isReadOnly(tool) })) });
        case 'approve': return Response.json({ command: await approve(body.id) });
        case 'reject': {
          const command = saved.commands.find(command => command.id === body.id); if (!command || command.state !== 'pending') throw new Error('腾讯文档修改请求已处理'); command.state = 'rejected'; await save(); return Response.json({ ok: true });
        }
        case 'verify': {
          await connect();
          // Discovery alone is not evidence of the account's document permission.
          const identity = definitions.some(tool => tool.name === 'get_user_info') ? await call('get_user_info', {}) : null;
          if (identity) { try { const value = JSON.parse(identity.content.find(item => item.type === 'text').text); saved.identity = { nick: String(value.nick || value.name || '').slice(0, 120) }; } catch {} }
          const hasSpaceList = definitions.some(tool => tool.name === 'query_space_list');
          const result = hasSpaceList && !body.arguments?.space_id ? await call('query_space_list', { num: 0 }) : await call('query_space_node', body.arguments || {});
          saved.verified = { at: new Date().toISOString(), level: 'space-access', tools: definitions.length }; await save();
          return Response.json({ result, identity, verified: saved.verified, tools: definitions.filter(isReadOnly).map(tool => ({ name: tool.name, inputSchema: tool.inputSchema })) });
        }
        case 'browse': return Response.json({ result: await call('query_space_node', { space_id: String(body.spaceId || ''), ...(body.parentId ? { parent_id: String(body.parentId) } : {}), num: Number(body.page || 0) }) });
        case 'search': {
          if (typeof body.query !== 'string' || !body.query.trim()) throw new Error('请输入文档标题或搜索关键词');
          await connect(); const name = definitions.some(tool => tool.name === 'manage.search_file') ? 'manage.search_file' : 'search_space_file';
          const properties = definitions.find(tool => tool.name === name)?.inputSchema?.properties || {};
          const field = ['query', 'keyword', 'search_key', 'search_string', 'q'].find(key => key in properties);
          if (!field) throw new Error('腾讯文档搜索参数发生变化，请在 AI 会话中使用搜索工具');
          const result = await call(name, { ...(body.arguments || {}), [field]: String(body.query || '').slice(0, 200) });
          return Response.json({ result, ...fileList(result) });
        }
        case 'read': {
          const result = await call('get_content', { file_id: documentId(body.fileId) });
          saved.verified = { at: new Date().toISOString(), level: 'document-read', tools: definitions.length }; await save();
          return Response.json({ result, verified: saved.verified });
        }
        default: throw new Error('未知操作');
      }
    } catch (error) { const message = error.message.startsWith('腾讯文档') || error.message.startsWith('请') || error.message === '未知操作' ? error.message : '操作未完成，请检查输入或重新验证连接'; return Response.json({ error: message }, { status: 400 }); }
  } }), 'tencent-docs: authenticated local API');
  // Restore the agent tool bridge once on launch, without a reconnect loop.
  if (await auth.grant()) void connect().catch(() => {});
}
