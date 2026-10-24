import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyPayload, payloadHashes, filesIn } from '../scripts/verify.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
test('public payload hashes, licenses and plugin versions agree', async () => {
  const result = await verifyPayload(root);
  assert.equal(result.plugins, 9);
  assert.equal(result.npmPlugins, 1);
  assert.equal(result.workbenches, 1);
});
test('task-board source stays optional and retains the existing host identity', async () => {
  const config = JSON.parse(await fs.readFile(join(root, 'classroom.json'), 'utf8'));
  const workbench = config.workbenches.find(p => p.name === 'dsh-task-board');
  assert.equal(workbench.version, '1.8.1');
  assert.equal(workbench.distribution, 'source-only');
  assert.ok(!config.plugins.some(p => p.name === workbench.name));
  const pkg = JSON.parse(await fs.readFile(join(root, workbench.path, 'package.json'), 'utf8'));
  assert.equal(pkg.repository.url, 'https://github.com/xudingsheng/dsh-task-board');
  const client = await fs.readFile(join(root, workbench.path, 'src/client.js'), 'utf8');
  assert.ok(client.includes(pkg.repository.url));
});
test('all distributed JavaScript parses without installing host dependencies', async () => {
  for (const file of await filesIn(root)) if (/\.(mjs|js)$/.test(file)) {
    const r = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    assert.equal(r.status, 0, file + ': ' + r.stderr);
  }
});
test('checksum rejects an altered payload; privacy check rejects a newly added credential value', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'dsh-pack-test-'));
  try {
    await fs.cp(root, dir, { recursive: true, filter: path => !path.split('/').includes('.git') && !path.split('/').includes('node_modules') });
    await fs.writeFile(join(dir, 'unexpected.txt'), 'unreviewed source');
    await assert.rejects(verifyPayload(dir), /differs/);
    const fake = String.fromCharCode(115, 107, 45) + 'a'.repeat(40);
    await fs.writeFile(join(dir, 'unexpected.txt'), fake);
    await fs.writeFile(join(dir, 'checksums.json'), JSON.stringify(await payloadHashes(dir)));
    await assert.rejects(verifyPayload(dir), /Potential credential/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
test('portable runtime source excludes the former architecture-specific PDF executable', async () => {
  const source = await fs.readFile(join(root, 'plugins/dsh-library/lib/index.mjs'), 'utf8');
  assert.ok(source.includes('officePython()'));
  assert.ok(!source.includes("'./pdf-text'"));
  await assert.rejects(fs.access(join(root, 'plugins/dsh-library/lib/pdf-text')));
});
