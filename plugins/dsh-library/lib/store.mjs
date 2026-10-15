import { mkdir, readFile, writeFile, rename, realpath, stat, lstat, readdir, open, unlink, link } from 'node:fs/promises';
import { join, dirname, basename, extname, isAbsolute, relative, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const inside = (root, path) => { const rel = relative(root, path); return rel === '' || !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel); };
export const editable = path => ['.md', '.markdown', '.html', '.htm', '.txt', '.csv'].includes(extname(path).toLowerCase());
export class LibraryStore {
  constructor(root) { this.root = root; this.index = { files: [], roots: [] }; this.operations = Promise.resolve(); this.ready = this.init(); }
  async init() {
    const suppliedFiles = join(this.root, 'files');
    await mkdir(join(this.root, 'files'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'versions'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'conversations'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'drafts'), { recursive: true, mode: 0o700 });
    this.root = await realpath(this.root);
    try { const value = JSON.parse(await readFile(join(this.root, 'index.json'), 'utf8')); if (!Array.isArray(value.files) || !Array.isArray(value.roots)) throw new Error('资料库索引格式无效'); this.index = value; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const row of this.index.roots) if (row.path === suppliedFiles) row.path = join(this.root, 'files');
    if (!this.index.roots.some(row => row.path === join(this.root, 'files'))) this.index.roots.unshift({ id: randomUUID(), path: join(this.root, 'files'), title: '我的文档' });
  }
  exclusive(task) { const next = this.operations.then(() => this.ready).then(task); this.operations = next.catch(() => {}); return next; }
  async atomic(path, bytes, mode = 0o600) { const temp = path + '.' + randomUUID() + '.tmp'; try { await writeFile(temp, bytes, { mode, flag: 'wx' }); await rename(temp, path); } finally { await unlink(temp).catch(() => {}); } }
  saveIndex() { return this.atomic(join(this.root, 'index.json'), JSON.stringify(this.index)); }
  async canonical(path, kind) {
    if (typeof path !== 'string' || !isAbsolute(path) || path.length > 4096) throw new Error('请选择一个本地文件或文件夹');
    const actual = await realpath(path), info = await stat(actual);
    if (kind === 'directory' ? !info.isDirectory() : !info.isFile()) throw new Error(kind === 'directory' ? '这不是文件夹' : '这不是普通文件');
    return actual;
  }
  register(path, kind = 'file') { return this.exclusive(async () => {
    const actual = await this.canonical(path, kind), list = kind === 'directory' ? this.index.roots : this.index.files;
    let row = list.find(item => item.path === actual); if (row) return row;
    if (this.index.files.length + this.index.roots.length > 2000) throw new Error('资料库条目超过上限');
    row = { id: randomUUID(), path: actual, title: basename(actual), addedAt: new Date().toISOString() }; list.unshift(row); await this.saveIndex(); return row;
  }); }
  async listRoot(rootId, path, offset = 0) {
    await this.ready; const root = this.index.roots.find(item => item.id === rootId); if (!root) throw new Error('文件夹未加入资料库');
    const actual = await this.canonical(path || root.path, 'directory'); if (!inside(root.path, actual)) throw new Error('只能浏览已加入的文件夹');
    const entries = await readdir(actual, { withFileTypes: true });
    const rows = entries.filter(item => !item.name.startsWith('.') && !['node_modules', '__pycache__'].includes(item.name)).map(item => ({ title: item.name, path: join(actual, item.name), type: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'other' })).filter(item => item.type !== 'other').sort((a, b) => Number(b.type === 'directory') - Number(a.type === 'directory') || a.title.localeCompare(b.title, 'zh'));
    offset = Math.max(0, Math.floor(Number(offset) || 0)); return { root, path: actual, rows: rows.slice(offset, offset + 300), nextOffset: offset + 300 < rows.length ? offset + 300 : null, total: rows.length };
  }
  async locate(id) {
    await this.ready; const row = this.index.files.find(item => item.id === id); if (!row) throw new Error('文件未加入资料库');
    const info = await lstat(row.path); if (!info.isFile() || info.isSymbolicLink()) throw new Error('文件已移动或被替换，请重新选择');
    return { row, info };
  }
  async bytes(id, max = 32 * 1024 * 1024) {
    const { row, info } = await this.locate(id); if (info.size > max) throw new Error('文件超过当前读取上限，请用对应应用打开');
    const handle = await open(row.path, 'r'); try { const current = await handle.stat(); if (!current.isFile() || current.size > max) throw new Error('文件在读取时发生变化'); const data = await handle.readFile(); if (data.length > max) throw new Error('文件超过读取上限'); return { row, info: current, data, hash: sha(data) }; } finally { await handle.close(); }
  }
  write(id, text, expectedHash, automatic = false) { return this.exclusive(async () => {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('编辑内容超过 4 MB');
    const { row, info, data, hash } = await this.bytes(id, 4 * 1024 * 1024);
    if (!editable(row.path)) throw new Error('请用对应应用编辑这种文件');
    if (hash !== expectedHash) throw new Error('文件已在别处修改。当前草稿已保留，请重新读取并合并后保存。');
    if (sha(text) === hash) return { hash, savedAt: row.savedAt };
    let backup = row.previous;
    const coalesce = automatic && extname(row.path).toLowerCase() === '.md' && Date.now() - (row.autosaveGroupAt || 0) < 30000 && new RegExp('^' + id + '-[0-9a-f-]{36}\\.bak$').test(backup || '');
    if (!coalesce) { backup = id + '-' + randomUUID() + '.bak'; await this.atomic(join(this.root, 'versions', backup), data); row.autosaveGroupAt = automatic ? Date.now() : 0; }
    // Re-check after making the backup, immediately before the atomic replacement.
    if (sha(await readFile(row.path)) !== hash) throw new Error('文件刚被别处修改。请重新读取后合并。');
    await this.atomic(row.path, text, info.mode & 0o777);
    row.previous = backup; row.savedAt = new Date().toISOString(); row.draftCutoff = Date.now(); await this.saveIndex();
    await unlink(join(this.root, 'drafts', id + '.json')).catch(() => {});
    return { hash: sha(text), savedAt: row.savedAt };
  }); }
  undo(id, expectedHash) { return this.exclusive(async () => {
    const { row, info, data, hash } = await this.bytes(id, 4 * 1024 * 1024);
    if (!editable(row.path) || !row.previous || !new RegExp('^' + id + '-[0-9a-f-]{36}\\.bak$').test(row.previous)) throw new Error('没有可恢复的保存版本');
    if (hash !== expectedHash) throw new Error('文件已在别处修改，不能直接撤销');
    const restored = await readFile(join(this.root, 'versions', row.previous));
    const backup = id + '-' + randomUUID() + '.bak'; await this.atomic(join(this.root, 'versions', backup), data);
    if (sha(await readFile(row.path)) !== hash) throw new Error('文件刚被别处修改，请重新读取');
    await this.atomic(row.path, restored, info.mode & 0o777); row.previous = backup; row.autosaveGroupAt = 0; row.savedAt = new Date().toISOString(); row.draftCutoff = Date.now(); await this.saveIndex(); await unlink(join(this.root, 'drafts', id + '.json')).catch(() => {}); return { hash: sha(restored) };
  }); }
  validName(value) { const name = String(value || '').trim(); if (!name || /[\\/\0]/.test(name) || name.startsWith('.') || name.length > 120) throw new Error('文件名需要 1 至 120 个字符，不含路径符号'); return name; }
  async destination(rootId, directory) {
    const root = rootId ? this.index.roots.find(row => row.id === rootId) : this.index.roots.find(row => row.path === join(this.root, 'files'));
    if (!root) throw new Error('文件夹未加入资料库');
    const path = await this.canonical(directory || root.path, 'directory'); if (!inside(root.path, path)) throw new Error('只能在已加入的文件夹中创建'); return path;
  }
  create(title, options = {}) { return this.exclusive(async () => {
    const kind = options.kind || 'markdown', extension = { markdown: '.md', html: '.html', csv: '.csv', text: '.txt' }[kind];
    if (!extension) throw new Error('这种文档类型尚不支持新建');
    let name = this.validName(title || '未命名'); if (!name.toLowerCase().endsWith(extension)) name += extension;
    const path = join(await this.destination(options.rootId, options.directory), name), heading = name.slice(0, -extension.length);
    const initial = kind === 'markdown' ? '# ' + heading + '\n\n' : kind === 'csv' ? '名称,说明\n示例,在表格中编辑内容\n' : kind === 'html' ? '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + heading.replace(/[&<>"']/g, '') + '</title><style>body{max-width:800px;margin:60px auto;padding:0 24px;font:16px/1.8 system-ui;color:#263341}button{padding:8px 16px;cursor:pointer}</style></head><body><h1>' + heading.replace(/[&<>"']/g, '') + '</h1><p>在这里开始制作你的交互页面。</p><button onclick="this.textContent=\'交互正常\'">试一下</button></body></html>\n' : '';
    const text = typeof options.text === 'string' ? options.text : initial; if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('文本内容超过 4 MB');
    await writeFile(path, text, { flag: 'wx', mode: 0o600 });
    const row = { id: randomUUID(), path, title: name, addedAt: new Date().toISOString() }; this.index.files.unshift(row); await this.saveIndex(); return row;
  }); }
  folder(rootId, directory, title) { return this.exclusive(async () => { const path = join(await this.destination(rootId, directory), this.validName(title)); await mkdir(path, { mode: 0o700 }); return { path, title: basename(path), type: 'directory' }; }); }
  renameFile(id, title) { return this.exclusive(async () => {
    const { row, info } = await this.locate(id), name = this.validName(title), path = join(dirname(row.path), name); if (path === row.path) return row;
    await link(row.path, path);
    try { const target = await lstat(path), current = await lstat(row.path); if (target.ino !== info.ino || current.ino !== info.ino || target.dev !== info.dev || current.dev !== info.dev) throw new Error('文件在重命名时发生变化，请重新读取'); await unlink(row.path); } catch (error) { await unlink(path).catch(() => {}); throw error; }
    row.path = path; row.title = name; await this.saveIndex(); return row;
  }); }
  touch(id) { return this.exclusive(async () => { const { row } = await this.locate(id); row.openedAt = new Date().toISOString(); await this.saveIndex(); }); }
  updateConversation(id, change) { return this.exclusive(async () => { const rows = await this.conversation(id), value = await change(rows); await this.saveConversation(id, value); return value; }); }
  async assets(id, references) {
    const { row } = await this.locate(id); if (!['.html', '.htm', '.md', '.markdown'].includes(extname(row.path).toLowerCase())) throw new Error('这种文件不使用页面资源');
    if (!Array.isArray(references) || references.length > 80) throw new Error('页面资源超过 80 个');
    const root = dirname(row.path), output = []; let total = 0;
    for (const reference of [...new Set(references)]) {
      if (typeof reference !== 'string' || reference.length > 500 || /^(?:[a-z]+:|\/|#)/i.test(reference)) continue;
      let relativePath; try { relativePath = decodeURIComponent(reference.split(/[?#]/)[0]); } catch { continue; }
      if (relativePath.split(/[\\/]/).some(part => part.startsWith('.'))) continue;
      const candidate = join(root, relativePath);
      let actual; try { actual = await realpath(candidate); } catch { continue; }
      if (!inside(root, actual) || !['.css', '.js', '.json', '.csv', '.md', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2'].includes(extname(actual).toLowerCase())) continue;
      const info = await stat(actual); if (!info.isFile() || info.size > 4 * 1024 * 1024 || total + info.size > 12 * 1024 * 1024) continue;
      const data = await readFile(actual); total += data.length; output.push({ reference, extension: extname(actual).toLowerCase(), data: data.toString('base64') });
    }
    return output;
  }
  async conversation(id) { await this.locate(id); try { return JSON.parse(await readFile(join(this.root, 'conversations', id + '.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
  async saveConversation(id, rows) { await this.locate(id); await this.atomic(join(this.root, 'conversations', id + '.json'), JSON.stringify(rows.slice(-12))); }
  async draft(id) { await this.locate(id); try { return JSON.parse(await readFile(join(this.root, 'drafts', id + '.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
  clearDraft(id) { return this.exclusive(async () => { const { row } = await this.locate(id); row.draftCutoff = Date.now(); await this.saveIndex(); await unlink(join(this.root, 'drafts', id + '.json')).catch(error => { if (error.code !== 'ENOENT') throw error; }); }); }
  saveDraft(id, draft) { return this.exclusive(async () => {
    const { row } = await this.locate(id);
    if (!editable(row.path) || typeof draft?.text !== 'string' || Buffer.byteLength(draft.text) > 4 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(draft.baseHash) || !Number.isFinite(draft.stamp) || draft.stamp > Date.now() + 60000) throw new Error('编辑草稿格式无效');
    const current = await this.draft(id); if (draft.stamp <= (row.draftCutoff || 0) || current && draft.stamp < current.stamp) return;
    await this.atomic(join(this.root, 'drafts', id + '.json'), JSON.stringify(draft));
  }); }
}
