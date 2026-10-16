// Runs on the installed Electron Node runtime, with the real Cordis and stream
// assembler. Only the provider is controlled; no credentials or cloud calls.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerHostModuleFallback } from '/Applications/DSH Desktop.app/Contents/Resources/host-module-fallback.mjs';
registerHostModuleFallback('/Applications/DSH Desktop.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js');
const { Context } = await import('@deepseek-ai/cordis');
const plugin = await import('../lib/index.mjs');

test('native library AI preserves provider failures, releases pending requests and protects files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-library-ai-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  const ctx = new Context(), routes = new Map(), calls = [];
  let behavior = 'success';
  ctx.provide('connection', { fetch: { register: route => {
    routes.set(route.path, route);
    return () => routes.delete(route.path);
  } } });
  ctx.provide('llm', { async *stream(options) {
    calls.push(options);
    if (behavior === 'unsupported' && options.reasoningEffort !== undefined) {
      yield { type: 'finish', reason: { kind: 'error', failure: {
        code: 'UNSUPPORTED_REASONING_EFFORT', message: 'private provider diagnostics',
      } } };
      return;
    }
    if (behavior === 'auth') {
      yield { type: 'finish', reason: { kind: 'error', failure: {
        code: 'MISSING_CREDENTIAL', message: 'Bearer private-test-value',
      } } };
      return;
    }
    if (behavior === 'network') throw Object.assign(new Error('Bearer private-test-value'), { code: 'ECONNRESET' });
    if (behavior === 'timeout') throw new DOMException('private timeout detail', 'TimeoutError');
    if (behavior === 'unknown') throw new Error('文件 Bearer private-test-value');
    yield { type: 'text-delta', index: 0, text: '合成 Markdown 提问成功' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } });
  const fiber = ctx.plugin(plugin, { provider: 'ollama-cloud', model: 'deepseek-v4.1-flash' });
  const request = async (action, args = {}) => {
    const response = await routes.get('/api/dsh-library').fetch(new Request('http://localhost/api/dsh-library', {
      method: 'POST', body: JSON.stringify({ action, ...args }),
    }));
    return { status: response.status, body: await response.json() };
  };
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    if (fiber.error) throw fiber.error;
    const { row } = (await request('create', { title: 'AI 回归样本', kind: 'markdown' })).body;
    const bytes = await readFile(row.path, 'utf8');
    const ask = () => request('ask', { id: row.id, prompt: '请回答标题', mode: 'question' });
    await t.test('question success appends history without modifying Markdown', async () => {
      const result = await ask();
      assert.equal(result.status, 200);
      assert.equal(result.body.row.answer, '合成 Markdown 提问成功');
      assert.equal(await readFile(row.path, 'utf8'), bytes);
    });
    for (const [mode, code] of [['auth', 'AI_AUTHENTICATION'], ['network', 'AI_CONNECTION'],
      ['timeout', 'AI_TIMEOUT'], ['unknown', 'AI_REQUEST_FAILED']]) {
      await t.test(mode + ' failure returns a safe AI error and preserves history', async () => {
        behavior = mode;
        const result = await ask();
        assert.equal(result.status, 400);
        assert.equal(result.body.code, code);
        assert.ok(!JSON.stringify(result.body).includes('private-test-value'));
        assert.ok(!result.body.error.includes('文件和读取权限'));
        assert.equal((await request('read', { id: row.id })).body.history.length, 1);
        assert.equal(await readFile(row.path, 'utf8'), bytes);
      });
    }
    await t.test('unsupported reasoning retries once without the unsupported option', async () => {
      behavior = 'unsupported';
      const before = calls.length, result = await ask();
      assert.equal(result.status, 200);
      assert.equal(calls.length - before, 2);
      assert.equal(calls.at(-2).reasoningEffort, 'off');
      assert.ok(!('reasoningEffort' in calls.at(-1)));
    });
    await t.test('a request after failure succeeds and file errors remain file errors', async () => {
      behavior = 'success';
      assert.equal((await ask()).status, 200);
      const result = await request('ask', { id: 'missing-file', prompt: 'test' });
      assert.equal(result.status, 400);
      assert.ok(!result.body.code?.startsWith('AI_'));
      assert.equal(await readFile(row.path, 'utf8'), bytes);
    });
  } finally {
    await ctx.fiber.dispose();
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    await rm(directory, { recursive: true, force: true });
  }
});
