import test from 'node:test';
import assert from 'node:assert/strict';
import { TencentAuth, GRANT_KEY } from '../plugins/dsh-tencent-docs/lib/auth.mjs';
function fixture(payload = null) {
  let record = payload ? { kind: 'grant', payload } : null, grants = 0, client;
  const requests = [], keys = [];
  const auth = new TencentAuth({ credentials: { readRecord: async key => { keys.push(key); return record; }, modifyRecord: async (key, fn) => { keys.push(key); const next = await fn(record); if (next !== undefined) record = next; }, deleteRecord: async key => { keys.push(key); record = null; } }, client: { client_id: 'synthetic-public-client' }, saveClient: async value => client = value, onGrant: async () => grants++, fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ access_token: 'synthetic-access-new', expires_in: 3600 }) }; } });
  return { auth, requests, keys, record: () => record, grants: () => grants, client: () => client };
}
test('native credential namespace and OAuth bearer/personal raw header remain compatible', async () => {
  const f = fixture({ mode: 'oauth', accessToken: 'synthetic-access', expiresAt: Date.now() + 3600000 });
  assert.equal(await f.auth.authorization(), 'Bearer synthetic-access');
  await f.auth.setPersonalToken('synthetic-personal-token'); assert.equal(await f.auth.authorization(), 'synthetic-personal-token');
  assert.equal(f.grants(), 1); assert.ok(f.keys.every(key => key === GRANT_KEY)); assert.equal(f.requests.length, 0);
  await f.auth.logout(); assert.equal(f.record(), null); assert.equal(f.grants(), 2);
});
test('expired OAuth refreshes inside the credential store and preserves omitted refresh tokens', async () => {
  const f = fixture({ mode: 'oauth', accessToken: 'synthetic-old', refreshToken: 'synthetic-refresh', clientId: 'synthetic-public-client', expiresAt: 0 });
  assert.equal(await f.auth.authorization(), 'Bearer synthetic-access-new'); assert.equal(f.record().payload.refreshToken, 'synthetic-refresh'); assert.equal(f.requests.length, 1);
  const request = f.requests[0]; assert.equal(request.url, 'https://docs.qq.com/openapi/mcp/oauth/token'); assert.equal(request.options.redirect, 'error'); assert.equal(request.options.body.get('grant_type'), 'refresh_token');
  assert.equal(f.grants(), 0); await f.auth.authorization(); assert.equal(f.requests.length, 1);
});
function pending(auth) { const value = { state: 'synthetic-state', verifier: 'synthetic-pkce-verifier', url: 'https://docs.qq.com/synthetic-authorize', expiresAt: Date.now() + 60000, consumed: false, server: { close() {} } }; auth.pending = value; return value; }
function reply() { return { status: null, headers: null, body: '', writableEnded: false, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body = '') { this.body = body; this.writableEnded = true; } }; }
test('callback rejects foreign host/wrong state before any exchange and public state excludes the verifier', async () => {
  const f = fixture(), p = pending(f.auth);
  try {
    assert.equal('verifier' in f.auth.publicPending(), false);
    for (const [host, state] of [['example.com', 'synthetic-state'], ['127.0.0.1:43189', 'wrong-state']]) { const r = reply(); await f.auth.callback(p, { method: 'GET', headers: { host }, url: '/oauth/callback?code=synthetic-code&state=' + state }, r); assert.ok([400, 404].includes(r.status)); }
    assert.equal(f.requests.length, 0); assert.equal(f.record(), null);
  } finally { f.auth.dispose(); }
});
test('successful PKCE callback saves through native credentials and redirects without code/token exposure', async () => {
  const f = fixture(), p = pending(f.auth), r = reply();
  try {
    await f.auth.callback(p, { method: 'GET', headers: { host: '127.0.0.1:43189' }, url: '/oauth/callback?code=synthetic-code&state=synthetic-state' }, r);
    assert.equal(r.status, 303); assert.equal(r.headers.location, '/complete'); assert.equal(r.body, ''); assert.equal(f.record().kind, 'grant'); assert.equal(f.record().payload.mode, 'oauth'); assert.equal(f.grants(), 1);
    assert.equal(f.requests[0].options.body.get('code_verifier'), 'synthetic-pkce-verifier'); assert.equal(f.auth.publicPending(), null);
    const replay = reply(); await f.auth.callback(p, { method: 'GET', headers: { host: '127.0.0.1:43189' }, url: '/oauth/callback?code=synthetic-code&state=synthetic-state' }, replay); assert.equal(replay.status, 400); assert.equal(f.requests.length, 1);
  } finally { f.auth.dispose(); }
});
