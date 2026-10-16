// Pure Node data tests; no DOM, disk reads, network, Office, or build writes.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReference, referenceStale, libraryQuotePayload, extractHeadings } from '../src/library-model.js';

const doc = {
  id: 'file-a', path: '/资料/项目说明.md', title: '项目说明.md',
  editable: true, hash: 'hash-a', text: '# 第一章\n\n本地完整正文，仅供比较。',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test('selection reference is frozen, exact and anchored to editable draft/hash', () => {
  const draft = '# 第一章\n\n尚未保存的草稿。';
  const ref = createReference(doc, { scope: 'selection', text: ' 草稿。\n', draft, hash: 'hash-a', chapter: '第一章' });
  assert.equal(Object.isFrozen(ref), true);
  assert.match(ref.id, uuid);
  assert.equal(ref.fileId, doc.id);
  assert.equal(ref.path, doc.path);
  assert.equal(ref.label, doc.title);
  assert.equal(ref.text, ' 草稿。\n');
  assert.equal(ref.sourceText, draft);
  assert.equal(ref.chapter, '第一章');
  assert.equal(ref.baseHash, 'hash-a');
  assert.ok(Number.isFinite(Date.parse(ref.createdAt)));
  assert.equal(ref.summary, '草稿。');
  assert.notEqual(createReference(doc, { scope: 'selection', text: '草稿' }).id, ref.id);
  assert.throws(() => { ref.text = '修改'; }, TypeError);
});

test('selection limit rejects overflow without trimming or truncation', () => {
  const text = '字'.repeat(12000), ref = createReference(doc, { scope: 'selection', text });
  assert.equal(ref.text, text);
  assert.throws(() => createReference(doc, { scope: 'selection', text: text + ' ' }), /12000/);
  assert.throws(() => createReference(doc, { scope: 'selection', text: '😀'.repeat(6001) }), /12000/);
  assert.throws(() => createReference(doc, { scope: 'selection', text: ' \n\t' }), /选区/);
  assert.throws(() => createReference(doc, { scope: 'selection' }), /选区/);
  assert.throws(() => createReference(doc, { scope: 'all', text: '正文' }), /范围/);
});

test('file reference stores only a local preview and emits no document text', () => {
  const source = 'LOCAL_DOCUMENT_SECRET\n' + '正文 '.repeat(1000);
  const ref = createReference({ ...doc, text: source }, {
    scope: 'file', text: source, draft: source, hash: doc.hash,
  });
  assert.equal(ref.text, '');
  assert.equal(ref.sourceText, source);
  assert.ok(ref.summary.length <= 300);
  assert.equal(ref.summary.includes('\n'), false);
  assert.equal(ref.chapter, null);
  const payload = libraryQuotePayload(ref, 'session-a', '请查看这个文件');
  assert.deepEqual(Object.keys(payload).sort(), ['version', 'id', 'sessionId', 'label', 'path', 'turn', 'nodeKey', 'comment'].sort());
  assert.equal(Object.hasOwn(payload, 'text'), false);
  assert.equal(Object.hasOwn(payload, 'sourceText'), false);
  assert.equal(Object.hasOwn(payload, 'summary'), false);
  assert.equal(JSON.stringify(payload).includes('LOCAL_DOCUMENT_SECRET'), false);
  assert.equal(payload.path, doc.path);
  assert.equal(payload.id, ref.id);
});

test('selection quote payload is an exact compatibility whitelist', () => {
  const ref = createReference(doc, { scope: 'selection', text: '明确选中的句子', draft: 'UNSENT_LOCAL_DRAFT' });
  const maliciousExtras = { ...ref, sourceText: 'UNSENT_LOCAL_DRAFT', summary: 'UNSENT_SUMMARY',
    chapter: 'UNSENT_CHAPTER', turn: 'forged-turn', nodeKey: 'forged-node', arbitrary: 'UNSENT_EXTRA' };
  const payload = libraryQuotePayload(maliciousExtras, 'session-a', '用户评论');
  assert.deepEqual(payload, {
    version: 1, id: ref.id, sessionId: 'session-a', text: '明确选中的句子',
    label: doc.title, path: doc.path, turn: null, nodeKey: null, comment: '用户评论',
  });
  assert.equal(/UNSENT_/.test(JSON.stringify(payload)), false);
  const noLocalAccess = { ...ref };
  Object.defineProperty(noLocalAccess, 'sourceText', { get() { throw new Error('must never read local source'); } });
  Object.defineProperty(noLocalAccess, 'summary', { get() { throw new Error('must never read local preview'); } });
  assert.equal(libraryQuotePayload(noLocalAccess, 'session-a').text, ref.text);
});

test('payload validation rejects malformed, oversized and implicit file excerpts', () => {
  const ref = createReference(doc, { scope: 'selection', text: '正文' });
  assert.equal(libraryQuotePayload(ref, 'session-a', '评'.repeat(4000)).comment.length, 4000);
  assert.throws(() => libraryQuotePayload(ref, 'session-a', '评'.repeat(4001)), /4000/);
  assert.throws(() => libraryQuotePayload(ref, 'session-a', null), /评论/);
  assert.throws(() => libraryQuotePayload(ref, ''), /会话/);
  assert.throws(() => libraryQuotePayload(ref, 's'.repeat(257)), /256/);
  assert.throws(() => libraryQuotePayload({ ...ref, id: 'not-a-uuid' }, 'session-a'), /引用数据/);
  assert.throws(() => libraryQuotePayload({ ...ref, scope: 'other' }, 'session-a'), /范围/);
  assert.throws(() => libraryQuotePayload({ ...ref, scope: 'file', text: doc.text }, 'session-a'), /不能包含正文/);
  assert.throws(() => libraryQuotePayload({ ...ref, text: '字'.repeat(12001) }, 'session-a'), /12000/);
  assert.throws(() => libraryQuotePayload({ ...ref, path: '' }, 'session-a'), /路径/);
  assert.throws(() => createReference({ ...doc, path: '/a' + 'b'.repeat(2048) }, { scope: 'file' }), /2048/);
});

test('staleness checks local identity/path/hash and editable draft snapshot only', () => {
  const draft = '未保存的正文', ref = createReference(doc, { scope: 'selection', text: '正文', draft });
  assert.equal(referenceStale(ref, doc, draft), false);
  assert.equal(referenceStale(ref, { ...doc }, draft), false);
  assert.equal(referenceStale(ref, { ...doc, id: 'file-b' }, draft), true);
  assert.equal(referenceStale(ref, { ...doc, path: '/资料/已移动.md' }, draft), true);
  assert.equal(referenceStale(ref, { ...doc, hash: 'hash-b' }, draft), true);
  assert.equal(referenceStale(ref, doc, draft + '新输入'), true);
  assert.equal(referenceStale(ref, doc, ''), true);
  assert.equal(referenceStale(ref, null, draft), true);
  assert.equal(referenceStale({}, doc, draft), true);
  assert.equal(referenceStale(ref, doc, null), true);
  const fallback = createReference(doc, { scope: 'file' });
  assert.equal(referenceStale(fallback, doc), false);
  assert.equal(referenceStale(fallback, { ...doc, text: doc.text + '变化' }), true);
  const outdated = createReference(doc, { scope: 'file', draft, hash: 'old-hash' });
  assert.equal(referenceStale(outdated, doc, draft), true);
});

test('noneditable or textless files use only supplied path/hash for staleness', () => {
  const media = { id: 'image-a', path: '/图片/示意图.png', editable: false, hash: null, text: null };
  const ref = createReference(media, { scope: 'file', draft: 'unrelated UI draft' });
  assert.equal(ref.sourceText, '');
  assert.equal(ref.summary, '');
  assert.equal(ref.label, '示意图.png');
  assert.equal(ref.baseHash, null);
  assert.equal(referenceStale(ref, media, 'changed irrelevant draft'), false);
  assert.equal(referenceStale(ref, { ...media, hash: 'new-hash' }), true);
  assert.equal(libraryQuotePayload(ref, 'session-a').path, media.path);
});

test('ATX ToC has H1–H3 only, stable source-line keys and unique duplicates', () => {
  const markdown = '\uFEFF# 一级\r\n## 二级 ##\r\n### 三级\r\n#### 四级\r\n# 一级\r\n#无空格\r\n    # 缩进代码\r\n   ## 三空格\r\n\n### C#\n#\n标题\n====';
  const headings = extractHeadings(markdown);
  assert.deepEqual(headings, [
    { text: '一级', level: 1, key: 'heading-1' },
    { text: '二级', level: 2, key: 'heading-2' },
    { text: '三级', level: 3, key: 'heading-3' },
    { text: '一级', level: 1, key: 'heading-5' },
    { text: '三空格', level: 2, key: 'heading-8' },
    { text: 'C#', level: 3, key: 'heading-10' },
  ]);
  assert.equal(new Set(headings.map(heading => heading.key)).size, headings.length);
  assert.deepEqual(extractHeadings(markdown), headings);
  assert.deepEqual(extractHeadings(''), []);
  assert.throws(() => extractHeadings(null), /Markdown/);
});

test('ToC skips backtick/tilde fences and requires a matching long-enough close', () => {
  const markdown = [
    '# 可见', '````js', '# 代码标题', '```', '## 仍在代码内', '~~~~', '### 仍在代码内',
    '````', '## 可见二', '   ~~~ language', '# 代码内', '```', '### 仍在tilde内',
    '   ~~~~', '### 可见三', '```', '# 未闭合代码', '## 仍不可见',
  ].join('\n');
  assert.deepEqual(extractHeadings(markdown), [
    { text: '可见', level: 1, key: 'heading-1' },
    { text: '可见二', level: 2, key: 'heading-9' },
    { text: '可见三', level: 3, key: 'heading-15' },
  ]);
  assert.deepEqual(extractHeadings('``` invalid`info\n# 非fence后标题'), [
    { text: '非fence后标题', level: 1, key: 'heading-2' },
  ]);
});
