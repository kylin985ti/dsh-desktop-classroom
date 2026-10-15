import { readFile, writeFile, mkdir, rename, lstat, realpath } from 'node:fs/promises';
import { watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
const sha = text => createHash('sha256').update(text).digest('hex');
export function archiveId(account, group, day) {
  const h = sha(account + '\0' + group + '\0' + day);
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
async function privateJSON(path, limit = 65536) {
  const s = await lstat(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > limit || s.uid !== process.getuid() || (s.mode & 0o077)) throw Error('本地连接文件身份或权限无效');
  return JSON.parse(await readFile(path, 'utf8'));
}
export class DatabaseSource {
  config = { enabled: false, hours: 24, revision: null, cursors: {} };
  state = { busy: false, error: null }; epoch = 0; watchers = []; child = null; running = null; timer = null;
  constructor(root, receive = async () => {}, options = {}) {
    this.root = root; this.home = options.home || resolve(root || '.', '../../..'); this.receive = receive;
    this.workerOverride = options.worker; this.connectionOverride = options.connection; this.watch = options.watch || watch;
  }
  async save() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temp = join(this.root, randomUUID() + '.tmp');
    await writeFile(temp, JSON.stringify(this.config), { mode: 0o600 }); await rename(temp, join(this.root, 'sync.json'));
  }
  async connection() {
    if (this.connectionOverride) return this.connectionOverride();
    try { return await privateJSON(join(this.root, 'connection.json')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async helper() {
    const receipt = await privateJSON(join(this.home, 'classroom/wechat-bridge.json'));
    const expected = join(homedir(), 'Applications/dsh-classroom-wechat', receipt.version || '', 'DSH 微信群连接 ' + receipt.version + '.app');
    if (receipt.version !== '0.2.0' || receipt.app !== expected || await realpath(expected) !== expected) throw Error('请重新运行教学包安装器以安装微信连接器');
    return { app: expected, worker: join(expected, 'Contents/MacOS/wechat-db-worker') };
  }
  async call(action, args = {}) {
    if (this.workerOverride) return this.workerOverride(action, args);
    const { worker } = await this.helper();
    return new Promise((done, reject) => {
      const child = spawn(worker, [action], { detached: true, stdio: ['pipe','pipe','ignore'], env: { ...process.env, DSH_HOME: this.home } });
      this.child = child; const bytes = []; let size = 0, finished = false;
      const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
      const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); if (this.child === child) this.child = null; error ? reject(error) : done(value); };
      const timer = setTimeout(() => { stop(); finish(Error('本机读取超时，已停止此次同步')); }, 55000);
      child.stdout.on('data', b => { size += b.length; if (size > 8*1024*1024) { stop(); finish(Error('读取结果超过限制')); } else bytes.push(b); });
      child.on('error', () => finish(Error('本机读取组件未就绪，请重新运行安装器')));
      child.stdin.on('error', () => {});
      child.on('close', code => {
        if (finished) return;
        try { const result = JSON.parse(Buffer.concat(bytes)); if (code !== 0 || !result.ok) throw Error(result.error || '本机读取未完成'); finish(null, result); }
        catch (error) { finish(Error(error instanceof SyntaxError ? '本机读取已取消或未返回结果' : error.message)); }
      });
      child.stdin.end(JSON.stringify(args));
    });
  }
  halt() {
    this.epoch++; clearTimeout(this.timer); this.timer = null;
    for (const watcher of this.watchers) watcher.close(); this.watchers = [];
    if (this.child) { try { process.kill(-this.child.pid, 'SIGTERM'); } catch {} }
  }
  async start() {
    if (!this.root) return;
    try { const saved = await privateJSON(join(this.root,'sync.json')); this.config = { ...this.config, ...saved, enabled: saved.enabled === true }; }
    catch (error) { if (error.code !== 'ENOENT') this.state.error = '自动接收配置不可用，请重新选择范围'; }
    if (this.config.enabled) {
      try { const current = await this.connection(); this.check(current); await this.listen(current); await this.sync(); }
      catch (error) { await this.pause(error.message); }
    }
  }
  check(current) {
    if (!current || !Array.isArray(current.approvedGroups) || !current.approvedGroups.length || current.approvedGroups.length > 10 || !/^[a-f0-9]{64}$/.test(current.accountHash || '')) throw Error('请先授权本人账号并选择群聊');
    if (this.config.revision && current.revision !== this.config.revision) throw Error('账号或群范围已变化，已暂停；请重新开启');
    if (current.approvedGroups.some(g => typeof g.id !== 'string' || !g.id.endsWith('@chatroom') || g.identityHash !== sha(g.id))) throw Error('群身份配置无效，请重新选择');
  }
  async listen(current) {
    const schedule = () => {
      if (this.timer) return; this.timer = setTimeout(() => { this.timer = null; this.sync().catch(() => {}); }, 2000); this.timer.unref?.();
    };
    const watcher = this.watch(join(current.accountRoot, 'message'), schedule);
    this.watchers.push(watcher);
    watcher.on?.('error', () => { void this.pause('数据库目录监听中断，请检查连接后重新开启').catch(() => {}); });
    const scope = this.watch(this.root, (_, filename) => {
      if (!filename || filename === 'connection.json') void this.connection().then(value => { if (value?.revision !== this.config.revision) return this.pause('账号或群范围已变化，已暂停'); }).catch(() => this.pause('本地连接不可用，已暂停')).catch(() => {});
    });
    this.watchers.push(scope);
    scope.on?.('error', () => { void this.pause('授权范围监听中断，已暂停').catch(() => {}); });
  }
  async pause(error = null) { this.halt(); this.config.enabled = false; this.state.error = error; if (this.root) await this.save(); }
  async configure(enabled, hours = 24) {
    await this.pause(); if (this.running) await this.running.catch(() => {});
    if (enabled !== true) return;
    if (![1,6,24].includes(hours)) throw Error('请选择最近1、6或24小时');
    const current = await this.connection(); this.config.revision = null; this.check(current);
    this.config = { ...this.config, enabled: true, hours, revision: current.revision };
    await this.save();
    try { await this.listen(current); await this.sync(); } catch (error) { await this.pause(error.message); throw error; }
  }
  async groups() { const c = await this.connection(); if (!c) throw Error('请先完成账号授权'); return (await this.call('groups',{revision:c.revision})).groups; }
  async select(groupIds) {
    await this.pause(); if (this.running) await this.running.catch(() => {});
    const c = await this.connection(); if (!c) throw Error('请先完成账号授权');
    await this.call('select',{revision:c.revision, groupIds}); this.config.revision = null; await this.save();
  }
  async open() {
    await this.pause(); if (this.running) await this.running.catch(() => {});
    const { app } = await this.helper();
    await new Promise((done,reject) => {
      const child = spawn('/usr/bin/open',['-n',app,'--args','--dsh-home',this.home],{stdio:'ignore'});
      child.on('error',reject); child.on('close',code => code === 0 ? done() : reject(Error('无法打开本机连接器')));
    });
  }
  async disconnect() {
    await this.pause(); if (this.running) await this.running.catch(() => {});
    const c = await this.connection(); if (c) await this.call('disconnect',{revision:c.revision});
    this.config = { enabled:false, hours:24, revision:null, cursors:{} }; await this.save();
  }
  async describe() {
    const c = await this.connection(); let installed = !!this.workerOverride;
    if (!installed) { try { await this.helper(); installed = true; } catch {} }
    if (this.config.enabled && c?.revision !== this.config.revision) await this.pause('账号或群范围已变化，已暂停');
    return { available:installed, connected:!!c, revision:c?.revision || null, enabled:this.config.enabled, busy:this.state.busy, hours:this.config.hours, accountLabel:c?.accountLabel || '', groups:c?.approvedGroups || [], label:this.state.error ? '连接需检查' : this.config.enabled ? '自动接收中' : '已暂停', error:this.state.error, lastSync:this.state.lastSync || null, count:this.state.count ?? null, reason:'本人授权后选择1至10个群；只读最近24小时。同步只保存本地，整理时才调用模型。' };
  }
  sync() {
    if (!this.config.enabled) return Promise.reject(Error('自动接收已关闭，请选择群并明确开启'));
    if (this.running) return this.running;
    this.running = this.performSync(this.epoch).catch(async error => { await this.pause(error.message); throw error; }).finally(() => { this.state.busy = false; this.running = null; }); return this.running;
  }
  async performSync(epoch) {
    this.state.busy = true; this.state.error = null; let total = 0;
    const c = await this.connection(); this.check(c);
    const valid = async () => { if (epoch !== this.epoch || !this.config.enabled || (await this.connection())?.revision !== c.revision) throw Error('连接范围已变化，本次读取已取消'); };
    for (const group of c.approvedGroups) {
      await valid(); const partition = c.accountHash + ':' + group.identityHash;
      const start = Math.max(Math.floor(Date.now()/1000) - this.config.hours*3600, (this.config.cursors[partition] || 0) - 300);
      const result = await this.call('read',{revision:c.revision,groupId:group.id,since:start});
      await valid();
      if (result.accountHash !== c.accountHash || result.groupId !== group.id || result.groupIdentityHash !== group.identityHash || result.otherChatsQueried !== false || !Array.isArray(result.messages) || result.messages.length !== result.recordCount || result.messages.length > 4000) throw Error('读取结果范围校验失败，未接收记录');
      const byDay = new Map();
      for (const row of result.messages) {
        if (!/^[a-f0-9]{64}$/.test(row.sourceId || '') || typeof row.text !== 'string' || !Number.isFinite(Date.parse(row.timestamp)) || row.text.length > 2*1024*1024) throw Error('消息格式校验未通过');
        const day = new Date(row.timestamp).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
        if (!byDay.has(day)) byDay.set(day,[]); byDay.get(day).push(row);
      }
      for (const [day,rows] of byDay) { await valid(); await this.receive({ id:archiveId(c.accountHash,group.identityHash,day),day,rows,groupName:result.targetGroup || group.name,groupIdentityHash:group.identityHash,accountHash:c.accountHash }); }
      await valid(); this.config.cursors[partition] = Math.floor(Date.now()/1000); total += result.recordCount;
    }
    await valid(); this.state.lastSync = new Date().toISOString(); this.state.count = total; await this.save();
  }
  async dispose() { this.halt(); if (this.running) await this.running.catch(() => {}); }
}
