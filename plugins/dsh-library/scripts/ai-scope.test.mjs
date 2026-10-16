// Real plugin, Cordis, filesystem and stream assembler; controlled model only.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { registerHostModuleFallback } from '/Applications/DSH Desktop.app/Contents/Resources/host-module-fallback.mjs';
registerHostModuleFallback('/Applications/DSH Desktop.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js');
const { Context } = await import('@deepseek-ai/cordis');
const plugin = await import('../lib/index.mjs');

test('AI scope is enforced at the real API boundary and edit protection is preserved', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-library-scope-'));
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = directory;
  const ctx = new Context(), routes = new Map(), calls = [];
  ctx.provide('connection', { fetch: { register: route => { routes.set(route.path, route); return () => routes.delete(route.path); } } });
  ctx.provide('llm', { async *stream(options) {
    const input = JSON.parse(options.messages[0].content[0].text);
    calls.push(input);
    yield { type: 'text-delta', index: 0, text: options.system.includes('JSON对象') ? JSON.stringify({ replacement: '修改后的选区', note: '合成建议' }) : '只依据所给内容回答' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } });
  const fiber = ctx.plugin(plugin, { provider: 'controlled', model: 'controlled' });
  const request = async (action, args = {}) => {
    const response = await routes.get('/api/dsh-library').fetch(new Request('http://localhost/api/dsh-library', { method: 'POST', body: JSON.stringify({ action, ...args }) }));
    return { status: response.status, ...(await response.json()) };
  };
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    if (fiber.error) throw fiber.error;
    const { row } = await request('create', { title: '范围测试', kind: 'markdown' });
    let { doc } = await request('read', { id: row.id });
    const selection = '  唯一的选区原文  ', long = '# 范围测试\n\n绝不能送给仅选区模型\n\n' + '合成长段落。'.repeat(18000) + '\n\n' + selection + '\n\n保留尾段。\n';
    ({ doc } = await request('save', { id: row.id, text: long, expectedHash: doc.hash }));
    const ask = args => request('ask', { id: row.id, prompt: '仅处理选区', mode: 'question', sourceText: doc.text, selection, expectedHash: doc.hash, contextScope: 'selection', ...args });
    await t.test('a short selection from an actual >300 KB file reaches the model alone', async () => {
      assert.ok(Buffer.byteLength(doc.text) > 300000);
      const result = await ask({});
      assert.equal(result.status, 200);
      assert.equal(calls.at(-1).content, selection);
      assert.ok(!JSON.stringify(calls.at(-1)).includes('绝不能送给'));
      assert.equal(result.row.contextScope, 'selection');
      assert.equal(await readFile(row.path, 'utf8'), long);
    });
    await t.test('choosing full context for that long file is rejected before the model', async () => {
      const before = calls.length, result = await ask({ contextScope: 'document' });
      assert.equal(result.status, 400); assert.match(result.error, /300000/);
      assert.equal(calls.length, before);
    });
    await t.test('selection edit preserves whitespace, prefix, suffix and review-before-write', async () => {
      const result = await ask({ mode: 'edit' });
      assert.equal(result.status, 200);
      assert.equal(result.row.proposal.selectedText, selection);
      assert.equal(result.row.proposal.baseText, long);
      assert.equal(result.row.proposal.replacement, long.replace(selection, '修改后的选区'));
      assert.equal(await readFile(row.path, 'utf8'), long);
      const rejected = await request('proposal', { id: row.id, proposalId: result.row.id, decision: 'reject' });
      assert.equal(rejected.status, 200); assert.equal(await readFile(row.path, 'utf8'), long);
    });
    await t.test('stale disk version, oversized selection and missing selection never call the model', async () => {
      for (const args of [{ expectedHash: 'stale' }, { selection: 'x'.repeat(12001) }, { selection: '' }, { contextScope: 'other' }]) {
        const before = calls.length, result = await ask(args);
        assert.equal(result.status, 400); assert.equal(calls.length, before);
        assert.ok(!result.error.includes('文件和读取权限'));
      }
    });
    const small = '# 范围测试\n\n保留前文。\n\n' + selection + '\n\n保留后文。\n';
    ({ doc } = await request('save', { id: row.id, text: small, expectedHash: doc.hash }));
    await t.test('explicit full context includes the body but still edits only the selected range', async () => {
      const result = await ask({ contextScope: 'document', mode: 'edit' });
      assert.equal(result.status, 200);
      assert.equal(calls.at(-1).content, small); assert.equal(calls.at(-1).selectedText, selection);
      assert.equal(result.row.proposal.replacement, small.replace(selection, '修改后的选区'));
      const accepted = await request('proposal', { id: row.id, proposalId: result.row.id, decision: 'accept', currentText: small, expectedHash: doc.hash });
      assert.equal(accepted.status, 200); doc = accepted.doc;
      assert.equal(await readFile(row.path, 'utf8'), small.replace(selection, '修改后的选区'));
    });
    await t.test('repeated and cross-format edit selections cannot modify a guessed range', async () => {
      for (const [sourceText, selected] of [['重复段 重复段', '重复段'], ['**选中**正文', '选中正文']]) {
        const before = calls.length, result = await ask({ sourceText, selection: selected, mode: 'edit' });
        assert.equal(result.status, 400); assert.match(result.error, /唯一定位/); assert.equal(calls.length, before);
      }
    });
    await t.test('manual changes and external writes still prevent accepting an outdated proposal', async () => {
      const currentText = doc.text, result = await ask({ sourceText: currentText, selection: '修改后的选区', mode: 'edit' });
      assert.equal(result.status, 200);
      assert.equal((await request('proposal', { id: row.id, proposalId: result.row.id, decision: 'accept', currentText: currentText + '手工新增', expectedHash: doc.hash })).status, 400);
      await writeFile(row.path, '外部变更必须保留');
      assert.equal((await request('proposal', { id: row.id, proposalId: result.row.id, decision: 'accept', currentText, expectedHash: doc.hash })).status, 400);
      assert.equal(await readFile(row.path, 'utf8'), '外部变更必须保留');
    });
  } finally {
    await ctx.fiber.dispose();
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome;
    await rm(directory, { recursive: true, force: true });
  }
});
