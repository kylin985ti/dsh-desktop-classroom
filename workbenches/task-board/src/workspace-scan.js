/** Explicit, bounded reads through the existing registered-workspace file API. */
export const WORKSPACE_SCAN_LIMITS = Object.freeze({ listed: 400, index: 120, files: 12, perFile: 4000, content: 16000, context: 24000, fileBytes: 1024 * 1024 })
const abort = signal => signal?.throwIfAborted()
const privateName = /(?:^|[._-])(?:secrets?|credentials?|passwords?|tokens?|private|id_rsa|id_ed25519)(?:[._-]|$)/i
const excludedDirectory = /^(?:node_modules|vendor|dist|build|coverage|target|__pycache__)$/i
export function scannableRelative(value) {
  if (typeof value !== 'string' || !value || value.length > 1000 || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false
  const parts = value.split('/')
  return parts.every(part => part && part !== '.' && part !== '..' && !part.startsWith('.') && !privateName.test(part) && !excludedDirectory.test(part))
    && !/\.(?:pem|key|p12|pfx|cer|crt|lock)$/i.test(value) && !/(?:^|\/)package-lock\.json$/i.test(value)
}
const priority = name => /(?:^|\/)(?:readme|agents|roadmap|progress|todo|requirements|spec|design)(?:[._-]|$)/i.test(name) ? 0 : /^(?:docs|specs|notes)\//i.test(name) ? 1 : /\.(?:md|markdown|txt)$/i.test(name) ? 2 : 3
const request = async (fetcher, url, signal) => {
  abort(signal)
  const response = await fetcher(url, { credentials: 'same-origin', signal })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) throw new Error(data?.error || `工作域读取失败（HTTP ${response.status}）。`)
  abort(signal)
  return data
}

export async function scanWorkspace(root, { fetcher = globalThis.fetch, signal, onProgress } = {}) {
  if (typeof root !== 'string' || !root.startsWith('/') || root.includes('\0')) throw new Error('请选择已绑定的本机工作域。')
  const listing = await request(fetcher, `/api/dsh-task-board/files?path=${encodeURIComponent(root)}`, signal)
  if (!Array.isArray(listing.files) || listing.files.length > WORKSPACE_SCAN_LIMITS.listed) throw new Error('工作域文件索引格式不正确，未读取正文。')
  const candidates = [], seen = new Set()
  let skipped = 0
  for (const entry of listing.files) {
    if (!entry || !scannableRelative(entry.relative) || seen.has(entry.relative) || !Number.isSafeInteger(entry.size) || entry.size < 0) { skipped++; continue }
    seen.add(entry.relative); candidates.push({ relative: entry.relative, size: entry.size })
  }
  candidates.sort((a, b) => priority(a.relative) - priority(b.relative) || a.relative.localeCompare(b.relative))
  const files = [], documents = [], warnings = []
  let indexUnits = 0
  for (const file of candidates) {
    if (files.length >= WORKSPACE_SCAN_LIMITS.index || indexUnits + file.relative.length > 4000) break
    files.push({ ...file }); indexUnits += file.relative.length
  }
  let used = 0, attempted = 0
  for (const file of files) {
    abort(signal)
    if (attempted >= WORKSPACE_SCAN_LIMITS.files || used >= WORKSPACE_SCAN_LIMITS.content) break
    if (file.size > WORKSPACE_SCAN_LIMITS.fileBytes) { skipped++; continue }
    attempted++
    onProgress?.({ attempted, read: documents.length, relative: file.relative })
    try {
      // Never trust a returned absolute filename: resolve only its safe relative
      // name under the explicitly selected registered root (including root aliases).
      const path = `${root.replace(/\/+$/, '')}/${file.relative}`
      const result = await request(fetcher, `/api/dsh-task-board/file?path=${encodeURIComponent(path)}`, signal)
      if (typeof result.content !== 'string' || result.content.includes('\0')) { warnings.push(`${file.relative}：不是可分析的文本，已跳过。`); continue }
      const limit = Math.min(WORKSPACE_SCAN_LIMITS.perFile, WORKSPACE_SCAN_LIMITS.content - used)
      let content = result.content.slice(0, limit)
      // Do not split a UTF-16 surrogate pair at a content boundary.
      if (/[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1)
      documents.push({ relative: file.relative, content, truncated: result.content.length > content.length })
      used += content.length
    } catch (problem) {
      abort(signal)
      if (problem?.name === 'AbortError') throw problem
      warnings.push(`${file.relative}：读取失败，未加入正文。`)
    }
  }
  // Legacy listing deliberately omits hidden/noise/unreadable directories and
  // caps rows. Never promote this to a complete filesystem or code audit.
  return { protocol: 'workspace-scan/1', root, scannedAt: new Date().toISOString(),
    files, documents, coverage: { listed: listing.files.length, eligible: candidates.length, indexed: files.length,
      read: documents.length, attempted, characters: used, skipped, listingMayBeLimited: listing.files.length >= WORKSPACE_SCAN_LIMITS.listed,
      complete: false }, warnings }
}

/** Copy a strict, path-free whitelist into the model prompt. */
export function workspacePromptContext(scan) {
  if (scan?.protocol !== 'workspace-scan/1' || !Array.isArray(scan.files) || !Array.isArray(scan.documents)
    || scan.files.length > WORKSPACE_SCAN_LIMITS.index || scan.documents.length > WORKSPACE_SCAN_LIMITS.files) throw new Error('请先完成并检查本次工作域扫描。')
  const files = scan.files.map(file => {
    if (!scannableRelative(file.relative) || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('工作域索引包含无效条目。')
    return { relative: file.relative, bytes: file.size }
  })
  let units = 0
  const documents = scan.documents.map(file => {
    if (!files.some(entry => entry.relative === file.relative) || typeof file.content !== 'string' || file.content.length > WORKSPACE_SCAN_LIMITS.perFile || typeof file.truncated !== 'boolean') throw new Error('工作域正文格式不正确。')
    units += file.content.length
    return { relative: file.relative, content: file.content, truncated: file.truncated }
  })
  if (units > WORKSPACE_SCAN_LIMITS.content) throw new Error('工作域正文超过本次上下文上限。')
  const result = { kind: 'explicit-workspace-scan', complete: false, scannedAt: scan.scannedAt,
    description: '递归浏览已绑定工作域的可读文本索引；跳过隐藏、常见凭据、依赖和构建文件。最多返回 400 个索引候选、120 个文件名、12 篇正文；未读取或截断的内容不能视为已审阅。',
    files, documents, listedCount: scan.coverage?.listed, readCount: documents.length,
    listingMayBeLimited: scan.coverage?.listingMayBeLimited === true,
    warnings: Array.isArray(scan.warnings) ? scan.warnings.slice(0, 12).map(value => String(value).slice(0, 200)) : [] }
  if (JSON.stringify(result).length > WORKSPACE_SCAN_LIMITS.context) throw new Error('工作域索引与正文过长，请取消部分文件或缩小工作域后重新扫描。')
  return result
}
