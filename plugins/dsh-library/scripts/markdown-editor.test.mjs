// Pure Node tests: no Office, network, deployment, or generated build files.
// Crepe lifecycle/DOM are controlled; commands, plugin and selection objects use
// the installed Milkdown/ProseMirror version. The real slash menu and original
// heading schema are separately bundled in memory and exercised below.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Schema } from '@milkdown/kit/prose/model';
import { EditorState, TextSelection } from '@milkdown/kit/prose/state';

const directory = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const schema = new Schema({ nodes: {
  doc: { content: 'block+' }, text: { group: 'inline' },
  paragraph: { content: 'inline*', group: 'block' },
  heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
} });
const instances = [];
let failCreation = false;
const normalized = text => text.replace(/\r\n/g, '\n').trimEnd() + '\n';
const makeDoc = text => schema.node('doc', null, text.trimEnd().split('\n\n').map(line =>
  schema.node('paragraph', null, line ? schema.text(line) : null)));

class FakeCrepe {
  static Feature = Object.fromEntries(['CodeMirror', 'Latex', 'ImageBlock', 'AI', 'TopBar',
    'Placeholder', 'BlockEdit', 'Toolbar'].map(key => [key, key]));
  constructor(config) {
    this.config = config;
    this.markdown = normalized(config.defaultValue);
    this.pluginFactories = [];
    this.pluginViews = [];
    this.destroyCalls = 0;
    this.replaceCalls = 0;
    this.readonly = false;
    this.editor = {
      use: factory => { this.pluginFactories.push(factory); return this.editor; },
      action: action => action(this),
    };
    const document = new EventTarget();
    document.defaultView = new EventTarget();
    this.native = { anchorNode: null, focusNode: null, anchorOffset: 0, focusOffset: 0,
      rangeCount: 0, isCollapsed: true,
      getRangeAt: () => ({ getBoundingClientRect: () => ({ top: 20, left: 30, right: 130, bottom: 40 }) }),
      setBaseAndExtent: (anchorNode, anchorOffset, focusNode, focusOffset) => {
        Object.assign(this.native, { anchorNode, anchorOffset, focusNode, focusOffset,
          rangeCount: 1, isCollapsed: anchorNode.pos === focusNode.pos && anchorOffset === focusOffset });
      },
    };
    document.getSelection = () => this.native;
    const dom = new EventTarget();
    dom.ownerDocument = document;
    dom.getRootNode = () => document;
    dom.attributes = {};
    dom.setAttribute = (key, value) => { dom.attributes[key] = value; };
    dom.contains = node => Boolean(node?.editor === this.view);
    this.focused = false;
    this.view = {
      dom, state: EditorState.create({ schema, doc: makeDoc(this.markdown) }), editable: true,
      hasFocus: () => this.focused,
      focus: () => { this.focused = true; dom.dispatchEvent(new Event('focusin')); },
      coordsAtPos: pos => ({ top: 10, bottom: 25, left: 10 + pos, right: 11 + pos }),
      posAtDOM: (node, offset) => node.pos + offset,
      domAtPos: pos => ({ node: { editor: this.view, pos }, offset: 0 }),
      dispatch: tr => {
        const prev = this.view.state;
        this.view.state = prev.apply(tr);
        this.pluginViews.forEach(plugin => plugin.update?.(this.view, prev));
      },
    };
    instances.push(this);
  }
  on(register) { register({ markdownUpdated: fn => { this.onMarkdown = fn; } }); return this; }
  async create() {
    if (failCreation) throw new Error('controlled create failure');
    this.pluginViews = this.pluginFactories.map(factory => factory().spec.view(this.view));
    this.onMarkdown(null, this.markdown);
  }
  setReadonly(value) { this.readonly = value; this.view.editable = !value; return this; }
  async destroy() { this.destroyCalls++; this.pluginViews.forEach(plugin => plugin.destroy?.()); }
  replace(text) {
    this.replaceCalls++;
    this.markdown = normalized(text);
    this.view.state = EditorState.create({ schema, doc: makeDoc(this.markdown) });
    this.pluginViews.forEach(plugin => plugin.update?.(this.view));
    this.onMarkdown(null, this.markdown);
    queueMicrotask(() => this.onMarkdown(null, this.markdown));
  }
  userEdit(text) {
    this.markdown = normalized(text);
    this.view.state = EditorState.create({ schema, doc: makeDoc(this.markdown) });
    this.pluginViews.forEach(plugin => plugin.update?.(this.view));
    this.onMarkdown(null, this.markdown);
  }
}

const harnessKey = '__DSH_MARKDOWN_EDITOR_TEST__';
globalThis[harnessKey] = {
  Crepe: FakeCrepe, $prose: factory => factory,
  replaceAll: text => editor => editor.replace(text),
  getMarkdown: () => editor => editor.markdown,
};
const compiled = await build({
  absWorkingDir: directory, entryPoints: ['src/markdown-editor.js'], bundle: true,
  write: false, format: 'esm', platform: 'node', target: 'es2022',
  plugins: [{ name: 'controlled-lifecycle', setup(builder) {
    builder.onResolve({ filter: /^@milkdown\/crepe$/ }, () => ({ path: 'crepe', namespace: 'controlled' }));
    builder.onResolve({ filter: /^@milkdown\/kit\/utils$/ }, () => ({ path: 'utils', namespace: 'controlled' }));
    builder.onLoad({ filter: /.*/, namespace: 'controlled' }, ({ path }) => ({ contents:
      path === 'crepe' ? `export const Crepe = globalThis.${harnessKey}.Crepe;` :
        `export const { $prose, replaceAll, getMarkdown } = globalThis.${harnessKey};`, loader: 'js' }));
    builder.onResolve({ filter: /^@milkdown\/kit\/prose\/state$/ }, args => ({
      path: import.meta.resolve(args.path), external: true,
    }));
    builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'css' }));
    builder.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: 'export default "";', loader: 'js' }));
  } }],
});
const { mount } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const latest = () => instances.at(-1);
function select(instance, from, to, native = false) {
  instance.view.dispatch(instance.view.state.tr.setSelection(TextSelection.create(instance.view.state.doc, from, to)));
  if (native) {
    instance.native.setBaseAndExtent({ editor: instance.view, pos: from }, 0,
      { editor: instance.view, pos: to }, 0);
    instance.view.dom.ownerDocument.dispatchEvent(new Event('selectionchange'));
  }
}

test('three-argument mount and autosave suppress programmatic normalization/echo', async () => {
  const changes = [], api = await mount({}, '初始正文', text => changes.push(text));
  const instance = latest();
  api.setValue('初始正文');
  assert.equal(instance.replaceCalls, 0);
  api.setValue('外部正文  ');
  await tick();
  assert.equal(instance.replaceCalls, 1);
  assert.deepEqual(changes, []);
  api.setValue('外部正文  ');
  assert.equal(instance.replaceCalls, 1);
  instance.userEdit('用户编辑');
  assert.deepEqual(changes, ['用户编辑\n']);
  api.setValue('用户编辑\n');
  assert.equal(instance.replaceCalls, 1);
  await api.destroy();
});

test('readonly toggles keep the same document and do not autosave', async () => {
  const changes = [], reports = [];
  const api = await mount({}, '中文选区与正文', text => changes.push(text), {
    readOnly: true, onSelection: selection => reports.push(selection),
  });
  const instance = latest(), originalDoc = instance.view.state.doc;
  assert.equal(instance.readonly, true);
  assert.equal(instance.view.dom.attributes['aria-readonly'], 'true');
  select(instance, 1, 5, true);
  await tick();
  assert.equal(reports.at(-1).text, '中文选区');
  assert.equal(reports.at(-1).readOnly, true);
  assert.equal(reports.at(-1).active, true);
  assert.deepEqual(reports.at(-1).rect, { top: 20, left: 30, right: 130, bottom: 40, width: 100, height: 20 });
  api.setReadOnly(false);
  await tick();
  assert.equal(instance.view.state.doc, originalDoc);
  assert.equal(instance.readonly, false);
  assert.equal(reports.at(-1).readOnly, false);
  assert.deepEqual(changes, []);
  await api.destroy();
});

test('integrated quote and AI toolbar actions preserve the exact selection and respect readonly', async () => {
  const quotes = [], ai = [], changes = [];
  const api = await mount({}, '选中的原文与后文', text => changes.push(text), {
    onQuote: range => quotes.push(range), onCollaborate: range => ai.push(range),
  });
  const instance = latest(), items = new Map(), doc = instance.view.state.doc;
  assert.equal(instance.readonly, false, 'the document is directly editable on open');
  const group = { addItem(key, value) { items.set(key, value); return group; } };
  instance.config.featureConfigs.Toolbar.buildToolbar({ addGroup: () => group });
  select(instance, 1, 7, true); await tick();
  items.get('library-quote').onRun(); items.get('library-collaborate').onRun();
  assert.equal(quotes[0].text, '选中的原文与');
  assert.equal(ai[0].text, quotes[0].text);
  assert.equal(instance.view.state.doc, doc); assert.deepEqual(changes, []);
  api.setReadOnly(true); items.get('library-quote').onRun(); assert.equal(quotes.length, 1);
  api.setReadOnly(false); instance.view.composing = true;
  items.get('library-collaborate').onRun(); assert.equal(ai.length, 1);
  instance.view.composing = false; await api.destroy();
  items.get('library-quote').onRun(); assert.equal(quotes.length, 1);
});

test('readonly native range is reportable even before ProseMirror updates', async () => {
  const api = await mount({}, '中文选区与正文', () => {}, { readOnly: true });
  const instance = latest();
  assert.equal(instance.view.state.selection.empty, true);
  instance.native.setBaseAndExtent({ editor: instance.view, pos: 5 }, 0,
    { editor: instance.view, pos: 1 }, 0);
  const snapshot = api.getSelection();
  assert.equal(snapshot.text, '中文选区');
  assert.equal(snapshot.anchor, 5);
  assert.equal(snapshot.head, 1);
  assert.equal(instance.view.state.selection.empty, true, 'reporting must not dispatch');
  assert.equal(api.restoreSelection(snapshot), true);
  assert.equal(instance.view.state.selection.anchor, 5);
  assert.equal(instance.native.anchorNode.pos, 5);
  await api.destroy();
});

test('quote tools preserve the range; cross-editor, stale and forged snapshots fail closed', async () => {
  const changes = [], reports = [];
  const api = await mount({}, '第一段\n\n第二段', text => changes.push(text), {
    onSelection: selection => reports.push(selection),
  });
  const instance = latest();
  select(instance, 1, 9);
  await tick();
  assert.equal(reports.at(-1).text, '第一段\n第二段');
  assert.equal(reports.at(-1).positionType, 'prosemirror');
  assert.equal(Object.isFrozen(reports.at(-1)), true);
  let prevented = 0;
  const snapshot = api.captureSelection({ preventDefault() { prevented++; } });
  assert.equal(prevented, 1);
  assert.equal(instance.view.state.selection.from, 1);
  assert.equal(instance.view.state.selection.to, 9);
  select(instance, 1, 1);
  await tick();
  assert.equal(reports.at(-1), null);
  assert.equal(api.restoreSelection(snapshot), true, 'saved range survives blur/collapse');
  assert.equal(instance.view.state.selection.to, 9);
  assert.deepEqual(changes, []);
  assert.equal(api.restoreSelection({ ...snapshot }), false);
  const other = await mount({}, '另一个编辑器', () => {});
  assert.equal(other.restoreSelection(snapshot), false);
  api.setValue('替换后的正文');
  assert.equal(api.restoreSelection(snapshot), false);
  assert.ok(api.getSelection() === null || api.getSelection().revision > snapshot.revision);
  instance.userEdit('用户修改');
  assert.equal(api.restoreSelection(snapshot), false);
  await api.destroy();
  assert.equal(api.getSelection(), null);
  assert.equal(api.restoreSelection(snapshot), false);
  await other.destroy();
});

test('native events reposition once, and destroy removes listeners and queued callbacks', async () => {
  const reports = [], api = await mount({}, '正文可选', () => {}, {
    onSelection: selection => reports.push(selection),
  });
  const instance = latest();
  await tick();
  select(instance, 1, 3);
  await tick();
  const before = reports.length;
  instance.view.dom.ownerDocument.dispatchEvent(new Event('scroll'));
  instance.view.dom.ownerDocument.defaultView.dispatchEvent(new Event('resize'));
  await tick();
  assert.equal(reports.length, before, 'identical snapshots are deduplicated');
  instance.view.coordsAtPos = () => ({ top: 40, bottom: 60, left: 2, right: 5 });
  instance.view.dom.ownerDocument.dispatchEvent(new Event('scroll'));
  await tick();
  assert.equal(reports.at(-1).rect.top, 40);
  select(instance, 2, 4);
  const count = reports.length, firstDestroy = api.destroy();
  assert.equal(api.destroy(), firstDestroy);
  await firstDestroy;
  instance.view.dom.ownerDocument.dispatchEvent(new Event('selectionchange'));
  instance.view.dom.ownerDocument.defaultView.dispatchEvent(new Event('resize'));
  api.setValue('销毁后不会替换');
  api.setReadOnly(true);
  await tick();
  assert.equal(instance.destroyCalls, 1);
  assert.equal(instance.replaceCalls, 0);
  assert.equal(reports.length, count);
});

test('failed creation destroys the partial editor and emits no callbacks', async () => {
  failCreation = true;
  try { await assert.rejects(mount({}, '正文', () => assert.fail('unexpected change')), /controlled create failure/); }
  finally { failCreation = false; }
  assert.equal(latest().destroyCalls, 1);
});

test('installed Crepe 7.22.3 flat menu uses Chinese presets and retains H4–H6 schema', async () => {
  const version = JSON.parse(await readFile(new URL('../node_modules/@milkdown/crepe/package.json', import.meta.url), 'utf8')).version;
  assert.equal(version, '7.22.3');
  const actual = await build({
    absWorkingDir: directory, stdin: { resolveDir: directory, sourcefile: 'installed-menu-check.js', contents: `
      export { getGroups } from './node_modules/@milkdown/crepe/src/feature/block-edit/menu/config.ts';
      export { headingSchema, clearTextInCurrentBlockCommand, setBlockTypeCommand } from '@milkdown/kit/preset/commonmark';
      export { commandsCtx, schemaCtx } from '@milkdown/kit/core';
    ` }, bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent',
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', actual.outputFiles[0].text)(require, module, module.exports);
  const { getGroups, headingSchema, commandsCtx, schemaCtx, clearTextInCurrentBlockCommand, setBlockTypeCommand } = module.exports;
  const api = await mount({}, '正文', () => {});
  const config = latest().config.featureConfigs.BlockEdit;
  const result = getGroups(undefined, config), items = result.groups.flatMap(group => group.items);
  assert.deepEqual(items.slice(0, 4).map(item => [item.key, item.label]), [
    ['text', '正文'], ['h1', 'H1 一级标题'], ['h2', 'H2 二级标题'], ['h3', 'H3 三级标题'],
  ]);
  assert.equal(items.some(item => ['h4', 'h5', 'h6'].includes(item.key)), false);
  assert.equal(items.some(item => item.children || item.submenu), false);
  assert.equal(result.groups.every(group => /[\u4e00-\u9fff]/u.test(group.label)), true);
  assert.deepEqual(getGroups('h2', config).groups.flatMap(group => group.items).map(item => item.key), ['h2']);
  for (const level of [1, 2, 3]) {
    const calls = [], commands = { call: (key, args) => calls.push({ key, args }) };
    items.find(item => item.key === `h${level}`).onRun({ get: key => {
      if (key === commandsCtx) return commands;
      if (key === schemaCtx) return schema;
      return key._defaultValue;
    } });
    assert.equal(calls[0].key, clearTextInCurrentBlockCommand.key);
    assert.equal(calls[1].key, setBlockTypeCommand.key);
    assert.equal(calls[1].args.nodeType, schema.nodes.heading);
    assert.equal(calls[1].args.attrs.level, level);
  }
  // Read the installed schema factory rather than imposing a reduced schema.
  const spec = headingSchema.key._defaultValue({ get: key => key._defaultValue });
  assert.deepEqual(spec.parseDOM.map(rule => rule.tag), ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  for (const level of [4, 5, 6]) {
    const parsed = [], serialized = [], state = target => ({
      openNode: (...args) => target.push(args), next() {}, closeNode() {},
    });
    spec.parseMarkdown.runner(state(parsed), { type: 'heading', depth: level, children: [] }, schema.nodes.heading);
    assert.equal(parsed[0][1].level, level);
    spec.toMarkdown.runner(state(serialized), schema.nodes.heading.create({ level }));
    assert.equal(serialized[0][2].depth, level);
  }
  await api.destroy();
});
