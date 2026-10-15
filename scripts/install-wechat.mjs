import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw Error('微信连接器校验失败：' + cmd);
  return result.stdout.trim();
};
export async function installWeChatBridge(manifest, home, options = {}) {
  if (process.platform !== 'darwin') throw Error('微信数据库连接器仅支持 macOS');
  const major = Number(run('/usr/bin/sw_vers', ['-productVersion']).split('.')[0]);
  if (major < 13) return { installed: false, reason: '微信连接器需要 macOS 13+；手动导入仍可用' };
  const info = manifest.wechatBridge;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64', asset = info.assets[arch];
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256) || !/^\d+\.\d+\.\d+$/.test(info.version)) throw Error('微信连接器下载清单无效');
  const cache = options.cache || join(homedir(), 'Library/Caches/dsh-desktop-classroom');
  await fs.mkdir(cache, { recursive: true, mode: 0o700 });
  const zip = options.archive || join(cache, asset.filename);
  let bytes;
  try { bytes = await fs.readFile(zip); } catch (error) {
    if (error.code !== 'ENOENT' || options.archive) throw error;
    const url = new URL(asset.url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.startsWith('/kylin985ti/dsh-desktop-classroom/releases/download/')) throw Error('微信连接器下载地址不在本仓库 Release');
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error('微信连接器下载失败 HTTP ' + response.status);
    const length = Number(response.headers.get('content-length'));
    if (length > 30 * 1024 * 1024) throw Error('微信连接器下载过大');
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 30 * 1024 * 1024 || hash(bytes) !== asset.sha256) throw Error('微信连接器下载 SHA256 不匹配');
    await fs.writeFile(zip, bytes, { mode: 0o600, flag: 'wx' });
  }
  if (hash(bytes) !== asset.sha256) throw Error('微信连接器缓存 SHA256 不匹配，请移走对应缓存后重试：' + zip);
  const applications = options.applications || join(homedir(), 'Applications/dsh-classroom-wechat');
  await fs.mkdir(applications, { recursive: true, mode: 0o700 });
  const directory = join(applications, info.version), app = join(directory, 'DSH 微信群连接 ' + info.version + '.app');
  let installed = false;
  try {
    const previous = JSON.parse(await fs.readFile(join(directory, 'asset.json'), 'utf8'));
    if (previous.sha256 !== asset.sha256) throw Error('已有同版本连接器与当前清单不同，请保留现场并报告维护者');
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]); installed = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!installed) {
    const stage = join(applications, '.stage-' + randomUUID()); await fs.mkdir(stage, { mode: 0o700 });
    try {
      run('/usr/bin/ditto', ['-x', '-k', zip, stage]);
      const staged = join(stage, 'DSH 微信群连接 ' + info.version + '.app');
      run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged]);
      const plist = join(staged, 'Contents/Info.plist');
      if (run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist]) !== 'io.github.kylin985ti.dsh-classroom.wechat' || run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]) !== info.version) throw Error('微信连接器版本或 bundle ID 不匹配');
      run(join(staged, 'Contents/MacOS/wechat-db-worker'), ['--self-test']);
      await fs.writeFile(join(stage, 'asset.json'), JSON.stringify({ sha256: asset.sha256, version: info.version }), { mode: 0o600 });
      await fs.rename(stage, directory);
    } catch (error) { await fs.rm(stage, { recursive: true, force: true }); throw error; }
  }
  const receipt = { version: info.version, app, sha256: asset.sha256, installed: true, defaultEnabled: false, authorizationsImported: 0 };
  await fs.mkdir(join(home, 'classroom'), { recursive: true, mode: 0o700 });
  const temporary = join(home, 'classroom/wechat-bridge.' + randomUUID() + '.tmp');
  await fs.writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 }); await fs.rename(temporary, join(home, 'classroom/wechat-bridge.json'));
  return receipt;
}
