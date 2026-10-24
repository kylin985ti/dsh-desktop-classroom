import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function filesIn(directory, root = directory) {
  const files = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '__pycache__', '.venv'].includes(item.name)) continue;
    const path = join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error('Symlink in published payload: ' + relative(root, path));
    if (item.isDirectory()) files.push(...await filesIn(path, root));
    else if (item.isFile()) files.push(relative(root, path).split('\\').join('/'));
  }
  return files.sort();
}
export async function payloadHashes(root) {
  const result = {};
  for (const path of await filesIn(root)) {
    if (path === 'checksums.json') continue;
    result[path] = createHash('sha256').update(await fs.readFile(join(root, path))).digest('hex');
  }
  return result;
}
export async function verifyPayload(root) {
  const expected = JSON.parse(await fs.readFile(join(root, 'checksums.json'), 'utf8'));
  const actual = await payloadHashes(root);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Payload differs from checksums.json. Maintainer: run node scripts/refresh.mjs.');
  const config = JSON.parse(await fs.readFile(join(root, 'classroom.json'), 'utf8'));
  const names = new Set();
  for (const p of config.plugins) {
    if (!/^plugins\/[a-z0-9-]+$/.test(p.path) || names.has(p.name)) throw new Error('Unsafe or duplicate plugin manifest');
    names.add(p.name);
    const pkg = JSON.parse(await fs.readFile(join(root, p.path, 'package.json'), 'utf8'));
    if (pkg.name !== p.name || pkg.version !== p.version) throw new Error('Plugin version table is stale: ' + p.path);
    await fs.access(join(root, p.path, 'LICENSE'));
  }
  const npmPlugins = config.npmPlugins ?? [];
  if (!Array.isArray(npmPlugins)) throw new Error('Invalid npm plugin manifest');
  for (const p of npmPlugins) {
    if (typeof p.name !== 'string' || !/^(?:@[a-z0-9-]+\/)?[a-z0-9.-]+$/.test(p.name) || names.has(p.name)) throw new Error('Unsafe or duplicate npm plugin manifest');
    if (typeof p.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(p.version)) throw new Error('Invalid npm plugin version');
    names.add(p.name);
  }
  const workbenches = config.workbenches || [];
  if (!Array.isArray(workbenches)) throw new Error('Invalid workbench manifest');
  for (const p of workbenches) {
    if (!/^workbenches\/[a-z0-9-]+$/.test(p.path) || names.has(p.name) || p.distribution !== 'source-only') throw new Error('Unsafe or duplicate optional workbench manifest');
    names.add(p.name);
    const pkg = JSON.parse(await fs.readFile(join(root, p.path, 'package.json'), 'utf8'));
    if (pkg.name !== p.name || pkg.version !== p.version) throw new Error('Workbench version table is stale: ' + p.path);
    await fs.access(join(root, p.path, 'LICENSE'));
  }
  for (const asset of Object.values(config.desktop.assets)) if (!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid Desktop SHA256');
  if (config.wechatBridge.defaultEnabled !== false) throw new Error('WeChat must be opt-in');
  for (const asset of Object.values(config.wechatBridge.assets)) { if (!/^[a-f0-9]{64}$/.test(asset.sha256) || /^0+$/.test(asset.sha256)) throw new Error('Invalid WeChat SHA256'); }
  // Match credential values and personal state, not config field names.
  const secrets = [/[s]k-(?:proj-|ant-)?[A-Za-z0-9_-]{28,}/, /[t]vly-[A-Za-z0-9_-]{20,}/,
    /[g]h[pousr]_[A-Za-z0-9]{30,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /[w]xid_[a-zA-Z0-9]{6,}/];
  for (const path of Object.keys(actual)) {
    if (/(^|\/)(?:credentials|storages|sessions|\.env)(?:\/|$)/.test(path) || /\.(?:jsonl|sqlite|db|dmg|zip|exe|pyc|tsbuildinfo|map)$/.test(path)) throw new Error('Private/runtime/binary file in public payload: ' + path);
    const bytes = await fs.readFile(join(root, path));
    if (bytes.includes(0)) throw new Error('Unexpected binary: ' + path);
    const text = bytes.toString('utf8');
    if (secrets.some(pattern => pattern.test(text))) throw new Error('Potential credential/account value: ' + path);
  }
  return { ok: true, files: Object.keys(actual).length, plugins: config.plugins.length, npmPlugins: npmPlugins.length, workbenches: workbenches.length };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyPayload(resolve(fileURLToPath(new URL('..', import.meta.url))))));
}
