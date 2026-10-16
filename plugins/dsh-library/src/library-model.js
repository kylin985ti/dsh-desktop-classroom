// Browser/Node pure data helpers. No DOM, filesystem, transport or model calls.
import { SELECTION_LIMIT } from '../lib/ai-context.mjs';
const COMMENT_LIMIT = 4000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkedString(value, limit, label, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.includes('\0')) {
    throw new Error(label + '无效');
  }
  if (value.length > limit) throw new Error(label + '超过 ' + limit + ' 字符上限');
  return value;
}

function checkedScope(scope) {
  if (scope !== 'selection' && scope !== 'file') throw new Error('引用范围无效');
  return scope;
}

function checkedHash(hash) {
  return hash == null ? null : checkedString(hash, 256, '文件版本');
}

function sourceSnapshot(doc, draft) {
  if (doc.editable === true && draft !== undefined) {
    if (typeof draft !== 'string') throw new Error('编辑草稿无效');
    return draft;
  }
  return typeof doc.text === 'string' ? doc.text : '';
}

function checkedReference(ref) {
  if (!ref || typeof ref !== 'object' || !uuidPattern.test(ref.id)) throw new Error('引用数据无效');
  checkedScope(ref.scope);
  checkedString(ref.fileId, 256, '文件标识');
  checkedString(ref.path, 2048, '文件路径');
  checkedString(ref.label, 150, '引用标题');
  checkedHash(ref.baseHash);
  if (ref.scope === 'selection') checkedString(ref.text, SELECTION_LIMIT, '引用选区');
  // A malformed/modified file reference must not turn into an implicit excerpt.
  else if (ref.text !== '') throw new Error('整文件引用不能包含正文');
  return ref;
}

/**
 * Create a local, immutable reference. sourceText is an exact local comparison
 * snapshot, never model context. Lengths use JS UTF-16 units, matching the
 * quote-context source. Selection text is preserved exactly; overflow is rejected.
 */
export function createReference(doc, { text, scope, chapter, draft, hash } = {}) {
  if (!doc || typeof doc !== 'object') throw new Error('文件信息无效');
  checkedScope(scope);
  const fileId = checkedString(doc.id, 256, '文件标识');
  const path = checkedString(doc.path, 2048, '文件路径');
  const fileName = path.split(/[\\/]/).filter(Boolean).at(-1) || '文件';
  const label = String(doc.title || fileName).replace(/[\r\n]/g, ' ').slice(0, 150);
  checkedString(label, 150, '引用标题');
  const selectedText = scope === 'selection' ? checkedString(text, SELECTION_LIMIT, '引用选区') : '';
  const sourceText = sourceSnapshot(doc, draft);
  if (chapter != null) checkedString(chapter, 300, '章节标题');
  const reference = {
    id: globalThis.crypto.randomUUID(), fileId, path, label, text: selectedText, scope,
    baseHash: checkedHash(hash === undefined ? doc.hash : hash), sourceText,
    createdAt: new Date().toISOString(), chapter: chapter ?? null,
    // Display-only metadata. This is deliberately not projected by libraryQuotePayload.
    summary: (scope === 'file' ? sourceText : selectedText).replace(/\s+/g, ' ').trim().slice(0, 300),
  };
  return Object.freeze(reference);
}

/** Compare only supplied metadata and the current editable draft; never read disk. */
export function referenceStale(ref, doc, draft) {
  try {
    checkedReference(ref);
    if (!doc || typeof doc !== 'object') return true;
    if (ref.fileId !== doc.id || ref.path !== doc.path || ref.baseHash !== checkedHash(doc.hash)) return true;
    return doc.editable === true && (typeof ref.sourceText !== 'string' || ref.sourceText !== sourceSnapshot(doc, draft));
  } catch { return true; }
}

/**
 * Exact quote-context v1 whitelist. A file reference contains a path, not an
 * expanded document: even the `text` property is omitted for scope=file.
 * Never serialize/spread the local reference directly into transport context.
 */
export function libraryQuotePayload(ref, sessionId, comment = '') {
  checkedReference(ref);
  checkedString(sessionId, 256, '目标会话');
  checkedString(comment, COMMENT_LIMIT, '引用评论', true);
  return {
    version: 1, id: ref.id, sessionId,
    ...(ref.scope === 'selection' ? { text: ref.text } : {}),
    label: ref.label, path: ref.path, turn: null, nodeKey: null, comment,
  };
}

/** Minimal ATX ToC. key is a unique 1-based source-line key, not a DOM heading id. */
export function extractHeadings(markdown) {
  if (typeof markdown !== 'string') throw new Error('Markdown 正文无效');
  const headings = [];
  let fence = null;
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  lines.forEach((line, index) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = null;
      return;
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && (open[1][0] !== '`' || !open[2].includes('`'))) {
      fence = { marker: open[1][0], length: open[1].length };
      return;
    }
    const heading = line.match(/^ {0,3}(#{1,3})(?:[ \t]+(.*)|[ \t]*)$/);
    if (!heading) return;
    const text = (heading[2] || '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
    if (text) headings.push({ text, level: heading[1].length, key: 'heading-' + (index + 1) });
  });
  return headings;
}
