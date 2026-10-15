import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export const ORIGIN = 'https://docs.qq.com';
export const CALLBACK = 'http://127.0.0.1:43189/oauth/callback';
export const GRANT_KEY = 'tencent-docs/personal';
const nonce = () => randomBytes(32).toString('base64url');
const equal = (left, right) => typeof left === 'string' && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const freshGrant = data => {
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('腾讯文档没有返回有效授权');
  return { accessToken: data.access_token, refreshToken: data.refresh_token || null, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000, scope: data.scope || 'docs:read docs:write' };
};

/** Public PKCE client; grants remain in the native owner-only credential store. */
export class TencentAuth {
  constructor({ credentials, client, saveClient, fetch = globalThis.fetch, onGrant = () => {} }) {
    Object.assign(this, { credentials, client, saveClient, fetch, onGrant });
    this.pending = null; this.lastError = ''; this.closed = false;
  }
  async request(path, body, json = false) {
    const response = await this.fetch(ORIGIN + path, { method: 'POST', redirect: 'error', headers: { 'content-type': json ? 'application/json' : 'application/x-www-form-urlencoded' }, body: json ? JSON.stringify(body) : new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
    let value;
    try { value = await response.json(); } catch { throw new Error('腾讯文档授权接口没有返回有效结果'); }
    if (!response.ok || value.error) throw new Error('腾讯文档授权失败：' + (value.error || 'HTTP ' + response.status));
    return value;
  }
  async ensureClient() {
    if (this.client?.client_id) return this.client;
    const value = await this.request('/openapi/mcp/oauth/register', {
      client_name: 'DSH Desktop Tencent Docs Local Plugin', redirect_uris: [CALLBACK],
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
    }, true);
    if (typeof value.client_id !== 'string' || value.client_secret) throw new Error('腾讯文档没有注册公共客户端');
    this.client = { client_id: value.client_id, redirect_uris: [CALLBACK] }; await this.saveClient(this.client); return this.client;
  }
  async begin() {
    if (this.closed) throw new Error('插件已关闭');
    if (this.pending && !this.pending.consumed && Date.now() < this.pending.expiresAt) return this.publicPending();
    this.cancel(); this.lastError = '';
    const client = await this.ensureClient(), verifier = nonce(), state = nonce();
    const url = new URL(ORIGIN + '/scenario/open-claw.html?authType=2');
    for (const [key, value] of Object.entries({ client_id: client.client_id, response_type: 'code', redirect_uri: CALLBACK, scope: 'docs:read docs:write', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
    const pending = { verifier, state, url: url.href, expiresAt: Date.now() + 10 * 60000, server: null, timer: null, consumed: false };
    const server = createServer((request, response) => void this.callback(pending, request, response)); pending.server = server;
    await new Promise((resolve, reject) => { server.once('error', () => reject(new Error('登录回调端口 43189 被占用，请关闭另一处腾讯文档登录后重试'))); server.listen(43189, '127.0.0.1', resolve); });
    this.pending = pending; pending.timer = setTimeout(() => this.cancel(), 10 * 60000); pending.timer.unref(); server.unref();
    return this.publicPending();
  }
  publicPending() { return this.pending && !this.pending.consumed ? { url: this.pending.url, expiresAt: this.pending.expiresAt } : null; }
  async callback(pending, request, response) {
    const reply = (status, text) => { response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'referrer-policy': 'no-referrer' }); response.end('<!doctype html><meta charset=utf-8><title>DSH 腾讯文档登录</title><body style="font:18px system-ui;padding:48px"><p>' + text + '</p></body>'); };
    try {
      const url = new URL(request.url, CALLBACK);
      if (request.method === 'GET' && request.headers.host === '127.0.0.1:43189' && url.pathname === '/complete' && pending.finished) {
        reply(200, pending.finished === 'success' ? '腾讯文档授权已保存。请回到 DSH 验证连接和文档权限。' : '腾讯文档授权未完成。请回到 DSH 查看状态并重试。');
        clearTimeout(pending.timer); pending.server.close(); if (this.pending === pending) this.pending = null; return;
      }
      if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:43189' || url.pathname !== '/oauth/callback') return reply(404, '页面不存在');
      if (pending !== this.pending || pending.consumed || Date.now() >= pending.expiresAt || !equal(url.searchParams.get('state'), pending.state)) return reply(400, '登录校验失败，请回到 DSH 重新登录。');
      pending.consumed = true;
      if (url.searchParams.has('error')) throw new Error('腾讯文档登录已取消或拒绝');
      const code = url.searchParams.get('code'); if (!code || code.length > 4096) throw new Error('腾讯文档没有返回授权码');
      const data = await this.request('/openapi/mcp/oauth/token', { grant_type: 'authorization_code', client_id: this.client.client_id, code, code_verifier: pending.verifier, redirect_uri: CALLBACK });
      if (this.closed || pending !== this.pending) throw new Error('登录请求已关闭');
      const grant = { ...freshGrant(data), clientId: this.client.client_id, mode: 'oauth' };
      await this.credentials.modifyRecord(GRANT_KEY, () => ({ kind: 'grant', payload: grant }));
      this.lastError = ''; await this.onGrant();
      pending.finished = 'success';
    } catch (error) { this.lastError = error.message; if (!pending.consumed) return reply(400, '腾讯文档登录校验未通过。请回到 DSH 重试。'); pending.finished = 'error'; }
    if (pending.finished && !response.writableEnded) {
      response.writeHead(303, { location: '/complete', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); response.end();
      clearTimeout(pending.timer); pending.timer = setTimeout(() => this.cancel(), 30000); pending.timer.unref();
    }
  }
  async grant() { const record = await this.credentials.readRecord(GRANT_KEY); return record?.kind === 'grant' ? record.payload : null; }
  async authorization() {
    let grant = await this.grant(); if (!grant?.accessToken) throw new Error('请先登录腾讯文档');
    if (grant.mode === 'oauth' && grant.expiresAt <= Date.now() + 60000) {
      await this.credentials.modifyRecord(GRANT_KEY, async record => {
        const current = record?.payload;
        if (!current?.accessToken) throw new Error('腾讯文档已退出登录');
        if (current.expiresAt > Date.now() + 60000) return undefined;
        if (!current.refreshToken) throw new Error('腾讯文档授权已过期，请重新登录');
        const value = await this.request('/openapi/mcp/oauth/token', { grant_type: 'refresh_token', client_id: current.clientId, refresh_token: current.refreshToken });
        return { kind: 'grant', payload: { ...current, ...freshGrant(value), refreshToken: value.refresh_token || current.refreshToken } };
      });
      grant = await this.grant();
    }
    return grant.mode === 'oauth' ? 'Bearer ' + grant.accessToken : grant.accessToken;
  }
  async setPersonalToken(value) {
    if (typeof value !== 'string' || value.length < 10 || value.length > 12000 || /[\r\n]/.test(value)) throw new Error('Token 格式无效');
    await this.credentials.modifyRecord(GRANT_KEY, () => ({ kind: 'grant', payload: { mode: 'personal-token', accessToken: value.trim(), refreshToken: null, expiresAt: null, scope: null } })); await this.onGrant();
  }
  cancel() { const pending = this.pending; this.pending = null; if (pending) { clearTimeout(pending.timer); pending.server?.close(); } }
  async logout() { this.cancel(); await this.credentials.deleteRecord(GRANT_KEY); await this.onGrant(); }
  dispose() { this.closed = true; this.cancel(); }
}
