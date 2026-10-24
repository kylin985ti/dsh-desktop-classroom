import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Module, { createRequire, registerHooks, syncBuiltinESMExports } from 'node:module';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyPayload } from './verify.mjs';
import { installWeChatBridge } from './install-wechat.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('Missing ' + name);
  return resolve(args[index + 1]);
};
const app = option('--app', '/Applications/DSH Desktop.app');
const home = option('--dsh-home', join(homedir(), 'Library/Application Support/dsh-desktop/harness'));
const resources = join(app, 'Contents/Resources');
const appRoot = join(resources, 'app.asar');
const manifest = JSON.parse(await fs.readFile(join(root, 'classroom.json'), 'utf8'));
const onlyIndex = args.indexOf('--only');
const onlyName = onlyIndex < 0 ? null : args[onlyIndex + 1];
if (onlyIndex >= 0 && (!onlyName || onlyName.startsWith('--'))) throw new Error('Missing --only plugin name');
const plugins = onlyName ? manifest.plugins.filter(p => p.name === onlyName) : manifest.plugins;
const npmPlugins = onlyName ? (manifest.npmPlugins ?? []).filter(p => p.name === onlyName) : (manifest.npmPlugins ?? []);
if (!plugins.length && !npmPlugins.length) throw new Error('Unknown --only plugin: ' + onlyName);
const appInfo = JSON.parse(await fs.readFile(join(appRoot, 'package.json'), 'utf8'));
if (appInfo.version !== manifest.desktop.version) throw new Error(`Desktop ${appInfo.version} is outside the tested pin ${manifest.desktop.version}; no changes made.`);
await verifyPayload(root);
const dshEntryPath = join(appRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const { registerHostModuleFallback } = await import(pathToFileURL(join(resources, 'host-module-fallback.mjs')));
registerHostModuleFallback(dshEntryPath);
// The native peer validator uses createRequire too. ASAR cannot be the target of
// an OS directory symlink, so resolve host singletons against the app anchor in
// this installer process; never materialize a duplicate React/runtime tree.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (/^(?:@deepseek-ai\/|react(?:-dom)?(?:\/|$))/.test(specifier)) {
    return nextResolve(specifier, { ...context, parentURL: pathToFileURL(dshEntryPath).href });
  }
  return nextResolve(specifier, context);
} });
const hostRequire = createRequire(dshEntryPath);
// Electron's ASAR require.resolve path bypasses Node resolve hooks. Give the
// native validator the same exact host anchor through its public createRequire
// API, in this process only. Required peers are still checked by the native
// validator against the running host entry; no validation is skipped.
const nativeCreateRequire = Module.createRequire;
Module.createRequire = (...parameters) => {
  const require = nativeCreateRequire(...parameters);
  const nativeResolve = require.resolve;
  require.resolve = (specifier, options) => /^(?:@deepseek-ai\/|react(?:-dom)?(?:\/|$))/.test(specifier)
    ? hostRequire.resolve(specifier, options) : nativeResolve(specifier, options);
  require.resolve.paths = specifier => /^(?:@deepseek-ai\/|react(?:-dom)?(?:\/|$))/.test(specifier)
    ? hostRequire.resolve.paths(specifier) : nativeResolve.paths(specifier);
  return require;
};
syncBuiltinESMExports();
const nativeRoot = join(appRoot, 'node_modules/dsh-desktop-market-installer/generations');
const { readDesired, listGenerations, withRegistryLock } = await import(pathToFileURL(join(nativeRoot, 'registry.mjs')));
const { publishGenerationManifest } = await import(pathToFileURL(join(nativeRoot, 'projection.mjs')));
const { createGenerationPackageBackend } = await import(pathToFileURL(join(nativeRoot, 'package-backend.mjs')));
const selected = await readDesired(home);
let generations = await listGenerations(home);
const report = { desktop: appInfo.version, pack: manifest.version, scope: onlyName || 'all', activation: 'restart-required-when-idle', plugins: [] };
if (args.includes('--doctor')) {
  for (const p of plugins) {
    const g = generations.find(g => selected.includes(g.id) && g.pluginName === p.name && g.version === p.version);
    report.plugins.push({ name: p.name, expected: p.version, installed: !!g });
  }
  for (const p of npmPlugins) {
    const g = generations.find(g => selected.includes(g.id) && g.pluginName === p.name && g.version === p.version);
    report.plugins.push({ name: p.name, expected: p.version, installed: !!g, source: 'npm' });
  }
  try { const receipt = JSON.parse(await fs.readFile(join(home, 'classroom/wechat-bridge.json'), 'utf8')); report.wechatBridge = { installed: receipt.version === manifest.wechatBridge.version && existsSync(receipt.app), expected: manifest.wechatBridge.version, authorization: 'student-owned; not inspected' }; } catch { report.wechatBridge = { installed: false, minimumMacOS: manifest.wechatBridge.minimumMacOS }; }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.plugins.every(p => p.installed) ? 0 : 2);
}
if (plugins.some(p => p.name === '@local/dsh-wechat-digest')) {
  console.log('Installing opt-in WeChat connector; no authorization or database scan is performed.');
  report.wechatBridge = await installWeChatBridge(manifest, home);
}
if (!existsSync(join(home, 'profiles/web/package.json'))) {
  // The CLI's dump mode creates the shipped profile template without mounting
  // plugins, starting a web server, logging in, or generating model traffic.
  const init = spawnSync(process.execPath, [dshEntryPath, '--profile', 'web', '--dump-default-config'], {
    env: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'ignore', timeout: 30000,
  });
  if (init.status !== 0) throw new Error('Native web profile initialization failed.');
}
const checksums = JSON.parse(await fs.readFile(join(root, 'checksums.json'), 'utf8'));
const pluginEntries = Object.entries(checksums).filter(([name]) => name.startsWith('plugins/'));
const packHash = createHash('sha256').update(JSON.stringify(pluginEntries)).digest('hex');
const packRoot = join(home, 'classroom/packs', packHash);
await fs.mkdir(dirname(packRoot), { recursive: true, mode: 0o700 });
try {
  await fs.mkdir(packRoot, { mode: 0o700 });
  await fs.cp(join(root, 'plugins'), join(packRoot, 'plugins'), { recursive: true, errorOnExist: true, force: false });
  await fs.writeFile(join(packRoot, 'complete.json'), JSON.stringify({ packHash }));
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  if (!existsSync(join(packRoot, 'complete.json'))) throw new Error('Incomplete pack directory. Keep it for diagnosis; retry with a clean staging location.');
}
for (const [name, expected] of pluginEntries) {
  const data = await fs.readFile(join(packRoot, name));
  if (createHash('sha256').update(data).digest('hex') !== expected) throw new Error('Stored pack hash mismatch: ' + name);
}
const backend = createGenerationPackageBackend({
  dshHome: home, dshEntryPath, nodeExecutablePath: process.execPath,
  pnpmEntryPath: join(dirname(hostRequire.resolve('pnpm')), 'bin/pnpm.cjs'),
  environment: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1' },
});
const receiptPath = join(home, 'classroom/install-receipt.json');
let previous = {}; try { previous = JSON.parse(await fs.readFile(receiptPath, 'utf8')); } catch {}
const progress = new Map((previous.plugins || []).map(p => [p.name, p]));
const saveReceipt = async status => {
  await fs.mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
  const temporary = receiptPath + '.' + process.pid + '.tmp';
  await fs.writeFile(temporary, JSON.stringify({ ...report, plugins: [...progress.values()], status, packHash, installedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temporary, receiptPath);
};
for (const p of plugins) {
  const sourceHash = createHash('sha256').update(JSON.stringify(pluginEntries.filter(([path]) => path.startsWith(p.path + '/')))).digest('hex');
  const current = (await readDesired(home));
  generations = await listGenerations(home);
  const installed = generations.find(g => current.includes(g.id) && g.pluginName === p.name && g.version === p.version);
  if ((progress.get(p.name)?.sourceHash === sourceHash || previous.packHash === packHash) && installed) {
    const row = { name: p.name, version: p.version, sourceHash, generation: installed.id, action: 'unchanged' };
    report.plugins.push(row); progress.set(p.name, row);
    console.log('Unchanged: ' + p.name); continue;
  }
  const path = join(packRoot, p.path);
  console.log('Installing: ' + p.name + '@' + p.version);
  const result = await backend.install({ kind: 'path', path, spec: 'file:' + path,
    expectedName: p.name, expectedVersion: p.version, autoInstallPeers: false, minimumReleaseAge: 1440 });
  if (result?.packageResult?.exitCode !== 0 || result.bundle !== p.name) {
    await result?.rollback?.();
    throw new Error('Native installation failed for ' + p.name + '. See local native plugin-manager logs; output is not uploaded.');
  }
  const next = await readDesired(home);
  const g = (await listGenerations(home)).find(g => next.includes(g.id) && g.pluginName === p.name && g.version === p.version);
  if (!g) { await result.rollback?.(); throw new Error('Native generation verification failed: ' + p.name); }
  result.commit?.();
  const row = { name: p.name, version: p.version, sourceHash, generation: g.id, action: 'installed' };
  report.plugins.push(row); progress.set(p.name, row);
  await saveReceipt('installing');
}
for (const p of npmPlugins) {
  const sourceHash = createHash('sha256').update('npm:' + p.name + '@' + p.version).digest('hex');
  const current = await readDesired(home);
  generations = await listGenerations(home);
  const installed = generations.find(g => current.includes(g.id) && g.pluginName === p.name && g.version === p.version);
  if (installed) {
    const row = { name: p.name, version: p.version, sourceHash, generation: installed.id, action: 'unchanged', source: 'npm' };
    report.plugins.push(row); progress.set(p.name, row);
    console.log('Unchanged: ' + p.name); continue;
  }
  console.log('Installing: ' + p.name + '@' + p.version + ' from npm');
  const result = await backend.install({ kind: 'registry', spec: p.name + '@' + p.version,
    expectedName: p.name, expectedVersion: p.version, autoInstallPeers: false, minimumReleaseAge: 1440 });
  if (result?.packageResult?.exitCode !== 0 || result.bundle !== p.name) {
    await result?.rollback?.();
    throw new Error('Native installation failed for ' + p.name + ' (npm). See local native plugin-manager logs; output is not uploaded.');
  }
  const next = await readDesired(home);
  const g = (await listGenerations(home)).find(g => next.includes(g.id) && g.pluginName === p.name && g.version === p.version);
  if (!g) { await result.rollback?.(); throw new Error('Native generation verification failed: ' + p.name); }
  result.commit?.();
  const row = { name: p.name, version: p.version, sourceHash, generation: g.id, action: 'installed', source: 'npm' };
  report.plugins.push(row); progress.set(p.name, row);
  await saveReceipt('installing');
}
// Use the native projection to declare installed bundles, preserving unrelated selections.
await withRegistryLock(home, () => publishGenerationManifest(home, 'web', { syncBundles: true }));
await saveReceipt('installed');
console.log(JSON.stringify(report, null, 2));
console.log('插件已安装。请保留正在运行的任务；空闲后手动重启 DSH Desktop，再完成个人账号登录和界面验收。');
