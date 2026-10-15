import { Crepe } from '@milkdown/crepe';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose, replaceAll, getMarkdown } from '@milkdown/kit/utils';
import frame from '@milkdown/crepe/theme/common/style.css';
import theme from '@milkdown/crepe/theme/frame.css';
export const styles = frame + '\n' + theme;

/**
 * options: { readOnly?: boolean, onSelection?: (selection | null) => void }.
 * Selection positions are ProseMirror positions, NOT Markdown string offsets.
 * rect uses viewport coordinates (for a position:fixed host-owned floating menu).
 * On the quote button's pointerdown/mousedown call captureSelection(event), then
 * use snapshot.text on click. restoreSelection(snapshot) can refocus the range;
 * it returns false after any document change or destroy. These tools never edit
 * the document, save a file, or contact a model.
 */
export async function mount(root, markdown, onChange, options = {}) {
  let applying = false, ready = false, destroyed = false, destroyPromise;
  let value = markdown, incoming = markdown, view, currentDoc, revision = 0;
  let readOnly = Boolean(options.readOnly), queued = false, selectionKey;
  const snapshots = new WeakMap(), cleanups = [];
  const crepe = new Crepe({ root, defaultValue: markdown, features: {
    [Crepe.Feature.CodeMirror]: false, [Crepe.Feature.Latex]: false,
    [Crepe.Feature.ImageBlock]: false, [Crepe.Feature.AI]: false, [Crepe.Feature.TopBar]: false,
  }, featureConfigs: {
    [Crepe.Feature.Placeholder]: { text: '输入正文，或输入 / 选择段落、标题、列表…' },
    // Crepe 7.22 supports flat heading items. Hide H4+ only in this menu;
    // leave the CommonMark schema/parser/serializer intact for existing files.
    [Crepe.Feature.BlockEdit]: {
      textGroup: {
        label: '基础', text: { label: '正文' },
        h1: { label: 'H1 一级标题' }, h2: { label: 'H2 二级标题' }, h3: { label: 'H3 三级标题' },
        h4: null, h5: null, h6: null,
        quote: { label: '引用块' }, divider: { label: '分割线' },
      },
      listGroup: {
        label: '列表', bulletList: { label: '无序列表' },
        orderedList: { label: '有序列表' }, taskList: { label: '待办列表' },
      },
      advancedGroup: {
        label: '更多', codeBlock: { label: '代码块' }, table: { label: '表格' },
        image: { label: '图片' }, math: { label: '数学公式' },
      },
    },
    [Crepe.Feature.Toolbar]: {
      boldLabel: '加粗', italicLabel: '斜体', strikethroughLabel: '删除线',
      codeLabel: '行内代码', linkLabel: '链接', latexLabel: '行内公式',
    },
  } });

  function syncRevision() {
    if (currentDoc && currentDoc !== view.state.doc) revision++;
    currentDoc = view.state.doc;
  }

  function getSelection() {
    if (!ready || destroyed || !view) return null;
    syncRevision();
    const doc = view.state.doc, domRoot = view.dom.getRootNode();
    const native = domRoot.getSelection?.() ?? view.dom.ownerDocument.getSelection?.();
    const inside = Boolean(native?.anchorNode && native?.focusNode &&
      view.dom.contains(native.anchorNode) && view.dom.contains(native.focusNode));
    let selection = view.state.selection, rect;
    // Read mode also supports native browser selections, without requiring focus
    // or dispatching a transaction merely to report the user's highlighted text.
    if (readOnly && inside) {
      try {
        const anchor = view.posAtDOM(native.anchorNode, native.anchorOffset);
        const head = view.posAtDOM(native.focusNode, native.focusOffset);
        selection = TextSelection.between(doc.resolve(anchor), doc.resolve(head));
      } catch { /* A replaced/detached DOM endpoint: use the current editor state. */ }
    }
    const { from, to, anchor, head, empty } = selection;
    if (empty) return null;
    const text = doc.textBetween(from, to, '\n');
    if (!text) return null;
    if (inside && native.rangeCount && !native.isCollapsed) {
      try { rect = native.getRangeAt(0).getBoundingClientRect(); } catch { /* Detached range. */ }
    }
    if (!rect) {
      try {
        const start = view.coordsAtPos(from), end = view.coordsAtPos(to);
        rect = {
          top: Math.min(start.top, end.top), bottom: Math.max(start.bottom, end.bottom),
          left: Math.min(start.left, end.left), right: Math.max(start.right, end.right),
        };
      } catch { /* Some non-text node views have no measurable text coordinates. */ }
    }
    const bounds = rect ? Object.freeze({
      top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
      width: rect.right - rect.left, height: rect.bottom - rect.top,
    }) : null;
    const snapshot = Object.freeze({
      text, from, to, anchor, head, rect: bounds, readOnly,
      focused: view.hasFocus(), active: inside || view.hasFocus(), revision,
      positionType: 'prosemirror',
    });
    snapshots.set(snapshot, { doc, selection });
    return snapshot;
  }

  function notifySelection() {
    queued = false;
    if (!ready || destroyed || !options.onSelection) return;
    const selection = getSelection(), key = JSON.stringify(selection);
    if (key === selectionKey) return;
    selectionKey = key;
    options.onSelection(selection);
  }

  function scheduleSelection() {
    if (queued || destroyed) return;
    queued = true;
    // Listener.selectionUpdated runs before EditorView updates. A plugin view
    // plus a microtask observes the finished state/DOM, not the old selection.
    queueMicrotask(notifySelection);
  }

  crepe.editor.use($prose(() => new Plugin({
    view(editorView) {
      view = editorView;
      syncRevision();
      return { update(updatedView) {
        view = updatedView;
        syncRevision();
        scheduleSelection();
      } };
    },
  })));
  crepe.on(listener => listener.markdownUpdated((_ctx, text) => {
    if (ready && !destroyed && !applying && text !== value) {
      incoming = value = text;
      onChange(text);
    }
  }));

  function setReadOnly(next) {
    if (destroyed) return;
    readOnly = Boolean(next);
    crepe.setReadonly(readOnly);
    view.dom.setAttribute('aria-readonly', String(readOnly));
    scheduleSelection();
  }

  function restoreSelection(snapshot) {
    if (destroyed || !ready || !snapshot) return false;
    const saved = snapshots.get(snapshot);
    if (!saved || saved.doc !== view.state.doc) return false;
    view.dispatch(view.state.tr.setSelection(saved.selection).setMeta('addToHistory', false));
    view.focus();
    // EditorView.focus alone does not always restore a native readonly range.
    const native = view.dom.getRootNode().getSelection?.() ?? view.dom.ownerDocument.getSelection?.();
    if (native?.setBaseAndExtent) {
      const anchor = view.domAtPos(snapshot.anchor), head = view.domAtPos(snapshot.head);
      native.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    }
    scheduleSelection();
    return true;
  }

  function destroy() {
    if (destroyPromise) return destroyPromise;
    destroyed = true;
    ready = false;
    cleanups.splice(0).forEach(cleanup => cleanup());
    destroyPromise = crepe.destroy();
    return destroyPromise;
  }

  try {
    await crepe.create();
    value = crepe.editor.action(getMarkdown());
    view.dom.setAttribute('aria-label', 'Markdown 正文');
    view.dom.setAttribute('role', 'textbox');
    view.dom.setAttribute('aria-multiline', 'true');
    view.dom.setAttribute('tabindex', '0');
    setReadOnly(readOnly);
    const listen = (target, name, capture = false) => {
      target.addEventListener(name, scheduleSelection, capture);
      cleanups.push(() => target.removeEventListener(name, scheduleSelection, capture));
    };
    listen(view.dom.ownerDocument, 'selectionchange');
    listen(view.dom, 'focusin');
    listen(view.dom, 'focusout');
    listen(view.dom.ownerDocument, 'scroll', true);
    const win = view.dom.ownerDocument.defaultView;
    if (win) listen(win, 'resize');
    ready = true;
    scheduleSelection();
  } catch (error) {
    await destroy().catch(() => {});
    throw error;
  }

  return {
    setValue(text) {
      if (destroyed || text === incoming) return;
      applying = true;
      incoming = text;
      try {
        crepe.editor.action(replaceAll(text));
        value = crepe.editor.action(getMarkdown());
      } finally { applying = false; }
    },
    setReadOnly,
    getSelection,
    captureSelection(event) {
      const selection = getSelection();
      if (selection) event?.preventDefault?.();
      return selection;
    },
    restoreSelection,
    destroy,
  };
}

export { readCSV, writeCSV, changes, htmlReferences, prepareHTML, applyVisualEdit } from './document-tools.js';
