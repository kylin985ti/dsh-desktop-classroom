window.__ModuleLoader__.load({
  id: '@local/dsh-quote-context/client',
  factory: require => {
    const React = require('react'), h = React.createElement;
    const { MarkdownText } = require('@deepseek-ai/dsh-client-ui-primitives');
    const KIND = 'quote-context-question', TYPE = '@local/dsh-quote-context/question';
    const SOURCE = 'quote-context', TOKEN = /⟦dsh-quote-v1:([A-Za-z0-9+/=]+)⟧/g;
    const EXCLUDED = '.dshQuoteToolbar,.dshQuoteQuestion,.dshQuoteCards,button,input,textarea,select,[role="toolbar"],[data-conversation-region="composer"],[inert]';
    let runtime = null;
    async function api(action, body = {}, signal) {
      const response = await fetch('/api/dsh-quote-context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }), signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '选区操作未完成');
      return value;
    }
    function normalize(value) {
      const row = { text: typeof value?.text === 'string' ? value.text.trim() : '', label: String(value?.label || '所选内容').replace(/[\r\n]/g, ' ').slice(0, 150),
        path: typeof value?.path === 'string' ? value.path.slice(0, 2048) : null, turn: value?.turn ?? null, nodeKey: value?.nodeKey || null };
      if (!row.text && !row.path) throw new Error('请选择要引用的文字');
      if (row.text.length > 12000) throw new Error('选区超过 12000 字，请缩小范围');
      return row;
    }
    function payload(value, sessionId, id = window.crypto.randomUUID()) {
      const row = normalize(value);
      return { version: 1, id, sessionId, ...row, comment: typeof value?.comment === 'string' ? value.comment.slice(0, 4000) : '' };
    }
    function parseReference(ref) {
      if (typeof ref !== 'string' || ref.length > 100000) throw new Error('引用数据无效，请重新选择');
      const value = JSON.parse(ref);
      if (value.version !== 1 || !/^[a-f0-9-]{36}$/i.test(value.id) || typeof value.sessionId !== 'string') throw new Error('引用数据无效，请重新选择');
      return payload(value, value.sessionId, value.id);
    }
    function clipboard(value) {
      const bytes = new TextEncoder().encode(JSON.stringify(value)); let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return '⟦dsh-quote-v1:' + window.btoa(binary) + '⟧';
    }
    function fromClipboard(encoded) {
      if (encoded.length > 140000) throw new Error('引用数据过长，请重新选择');
      const binary = window.atob(encoded), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      return parseReference(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    }
    function modelText(value) {
      // The display card is a native atomic reference. Only the model projection expands the original and comment.
      const context = { source: value.label, ...(value.path ? { file: '@' + JSON.stringify(value.path) } : {}),
        ...(value.turn == null ? {} : { turn: value.turn }), excerpt: value.text,
        ...(value.comment.trim() ? { userComment: value.comment } : {}) };
      const encoded = JSON.stringify(context).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
      return '\n\n' + (value.path ? '文件引用：@' + JSON.stringify(value.path) + '\n' : '') + '<dsh-quote-v1>' + encoded + '</dsh-quote-v1>\n\n';
    }
    function splitQuotes(text) {
      const quotes = [];
      const pattern = /⟦dsh-quote-v1:([A-Za-z0-9+/=]+)⟧|(?:文件引用：(@[^\n]+)\n)?<dsh-quote-v1>([^\n]*?)<\/dsh-quote-v1>/g;
      const main = text.replace(pattern, (whole, encoded, file, json) => {
        try {
          let value;
          if (encoded) value = fromClipboard(encoded);
          else {
            const item = JSON.parse(json);
            if (typeof item.excerpt !== 'string' || typeof item.source !== 'string') return whole;
            let path = null;
            if (typeof item.file === 'string' && item.file.startsWith('@')) {
              try { path = JSON.parse(item.file.slice(1)); } catch { return whole; }
              if (typeof path !== 'string' || file && file !== item.file) return whole;
            } else if (file) return whole;
            value = normalize({ text: item.excerpt, path, label: item.source, turn: item.turn });
            value.comment = typeof item.userComment === 'string' ? item.userComment.slice(0, 4000) : '';
          }
          quotes.push(value); return '';
        } catch { return whole; }
      });
      return { main, quotes };
    }
    function SentQuotes({ rows }) {
      return h('div', { className: 'dshQuoteSent', 'aria-label': '引用与评论' }, rows.map((value, index) =>
        h('article', { className: 'dshQuoteCard', key: index },
          h('div', { className: 'dshQuoteCardTop' }, h('span', { className: 'dshQuoteGlyph', 'aria-hidden': true }, '❝'),
            h('span', { className: 'dshQuoteCardSource' }, value.label)),
          h('p', { className: 'dshQuoteSnippet' }, value.text || value.path),
          h('details', { className: 'dshQuoteOriginal' }, h('summary', null, '查看原文'), h('blockquote', null, value.text || value.path)),
          value.comment && h('p', { className: 'dshQuoteSentComment' }, value.comment))));
    }
    function messageRenderer(Base) {
      return function QuotedMessage(props) {
        const rows = [], content = props.node.data.content.map(block => {
          if (block.type !== 'text') return block;
          const parsed = splitQuotes(block.text); rows.push(...parsed.quotes);
          return parsed.quotes.length ? { ...block, text: parsed.main.trim() } : block;
        });
        if (!rows.length) return h(Base, props);
        return h(Base, { ...props, node: { ...props.node, data: { ...props.node.data, content } },
          messageFooter: h(React.Fragment, null, h(SentQuotes, { rows }), props.messageFooter) });
      };
    }

    function bindingFor(sessionId) {
      if (!runtime) throw new Error('引用插件尚未就绪');
      const binding = runtime.ctx.uiSession.adapter.current.getSnapshot();
      if (!binding.key || binding.key !== sessionId) throw new Error('当前会话已切换，请在目标会话重新选择');
      if (!binding.hooks.input || !binding.props.inputActions?.captureInsertion || !binding.ctx?.bail) throw new Error('当前会话输入框尚未就绪');
      return binding;
    }
    function editable(binding) {
      const input = binding.hooks.input.getSnapshot();
      if (input.phase !== 'plain') throw new Error('输入框正在处理命令，请稍后编辑引用');
      return input;
    }
    const detectOffset = (input, clipboardOffset) => clipboardOffset - (input.occurrences || [])
      .filter(item => item.offset < clipboardOffset).reduce((sum, item) => sum + item.length - 1, 0);
    function insertCard(binding, value, start, end = start) {
      const input = editable(binding), actions = binding.props.inputActions;
      const reference = { source: SOURCE, ref: JSON.stringify(value), label: '引用 · ' + (value.text || value.label).replace(/\s+/g, ' ').slice(0, 36), appearance: 'session', clipboardText: clipboard(value) };
      const span = { ...actions.captureInsertion(), start, end };
      if (binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', { reference, span }) !== true) throw new Error('草稿刚刚变化，请重新点击引用');
      return input;
    }
    function append(row, sessionId) {
      const binding = bindingFor(sessionId), input = editable(binding);
      if ((input.occurrences || []).filter(item => item.source === SOURCE).length >= 10) throw new Error('一轮最多附加 10 条引用');
      insertCard(binding, payload(row, sessionId), detectOffset(input, input.draft.length));
      runtime.ctx.layout.selectPanel(null);
      const editor = [...document.querySelectorAll('[data-conversation-session]')]
        .find(el => el.dataset.conversationSession === sessionId && !el.closest('[hidden],[inert]'))
        ?.querySelector('[data-conversation-region="composer"] [contenteditable="true"]');
      editor?.focus({ preventScroll: true });
      return true;
    }
    function locateCard(sessionId, id) {
      const binding = bindingFor(sessionId), input = editable(binding);
      const occurrence = input.occurrences.find(item => {
        if (item.source !== SOURCE) return false;
        try { return parseReference(item.ref).id === id; } catch { return false; }
      });
      if (!occurrence) throw new Error('这条引用已移除');
      return { binding, input, occurrence, at: detectOffset(input, occurrence.offset) };
    }
    function updateComment(sessionId, id, comment) {
      const { binding, occurrence, at } = locateCard(sessionId, id);
      const value = parseReference(occurrence.ref);
      insertCard(binding, { ...value, comment: comment.slice(0, 4000) }, at, at + 1);
    }
    function removeCard(sessionId, id) {
      const { binding, at } = locateCard(sessionId, id), actions = binding.props.inputActions;
      if (!actions.insertText('', { ...actions.captureInsertion(), start: at, end: at + 1 })) throw new Error('草稿刚刚变化，请重新移除');
    }
    function restoreCards(sessionId) {
      const binding = bindingFor(sessionId);
      // Native draft persistence uses a clipboard projection. Decode our self-contained tokens before paint.
      // Re-read after each CAS edit so lengths of other native file references cannot shift our next range.
      for (let index = 0; index < 10; index++) {
        const input = editable(binding);
        const match = [...input.draft.matchAll(new RegExp(TOKEN.source, 'g'))].find(match =>
          !input.occurrences.some(item => match.index >= item.offset && match.index < item.offset + item.length));
        let found = match, value;
        if (found) value = fromClipboard(found[1]);
        else {
          found = /【引用 · ([^\n]{1,150})】\n((?:文件引用：@[^\n]+\n)?(?:> [^\n]*\n)*)【引用结束】/.exec(input.draft);
          if (!found) return;
          let text = found[2], path = null;
          if (text.startsWith('文件引用：@')) {
            const newline = text.indexOf('\n');
            try { path = JSON.parse(text.slice('文件引用：@'.length, newline)); } catch { return; }
            if (typeof path !== 'string') return;
            text = text.slice(newline + 1);
          }
          text = text.replace(/> /g, (whole, index) => index === 0 || text[index - 1] === '\n' ? '' : whole).replace(/\n$/, '');
          value = payload({ label: found[1], path, text }, sessionId);
        }
        const start = detectOffset(input, found.index), end = detectOffset(input, found.index + found[0].length);
        insertCard(binding, { ...value, sessionId }, start, end);
      }
    }
    function QuoteCard({ value, sessionId, disabled }) {
      const [commentOpen, setCommentOpen] = React.useState(false), [error, setError] = React.useState('');
      const field = React.useRef(null);
      React.useEffect(() => {
        const focus = event => { if (event.detail?.id === value.id) { setCommentOpen(true); setTimeout(() => field.current?.focus(), 0); } };
        window.addEventListener('dsh:quote-comment', focus);
        return () => window.removeEventListener('dsh:quote-comment', focus);
      }, [value.id]);
      const run = fn => { try { fn(); setError(''); } catch (error) { setError(error.message); } };
      const addComment = () => { setCommentOpen(true); setTimeout(() => field.current?.focus(), 0); };
      return h('article', { className: 'dshQuoteCard', 'data-dsh-quote-id': value.id },
        h('div', { className: 'dshQuoteCardTop' },
          h('span', { className: 'dshQuoteGlyph', 'aria-hidden': true }, '❝'),
          h('span', { className: 'dshQuoteCardSource', title: value.path || value.label }, value.label),
          h('button', { type: 'button', className: 'dshQuoteRemove', disabled, 'aria-label': '移除引用 ' + value.label, title: '移除引用', onClick: () => run(() => removeCard(sessionId, value.id)) }, '×')),
        h('p', { className: 'dshQuoteSnippet' }, value.text || value.path),
        h('div', { className: 'dshQuoteCardActions' },
          !commentOpen && h('button', { type: 'button', className: 'dshQuoteTextButton', disabled, onClick: addComment }, value.comment ? '编辑评论' : '添加评论'),
          h('details', { className: 'dshQuoteOriginal' },
            h('summary', null, '查看原文'),
            h('blockquote', null, value.text || value.path))),
        value.comment && !commentOpen && h('p', { className: 'dshQuoteSavedComment' }, value.comment),
        commentOpen && h('div', { className: 'dshQuoteComment' },
          h('textarea', { ref: field, rows: 2, value: value.comment, maxLength: 4000, disabled,
            'aria-label': '评论 · ' + value.label, placeholder: '针对这段内容添加评论…',
            onChange: event => run(() => updateComment(sessionId, value.id, event.target.value)),
            onKeyDown: event => event.stopPropagation() }),
          h('div', { className: 'dshQuoteCommentActions' }, h('small', null, '评论会随这条引用一起发送'), h('button', { type: 'button', className: 'dshQuoteTextButton', onClick: () => setCommentOpen(false) }, '完成'))),
        error && h('p', { className: 'dshQuoteError', role: 'alert' }, error));
    }
    function QuotesDock({ sessionId, useInput }) {
      const input = useInput(value => value), [error, setError] = React.useState('');
      React.useLayoutEffect(() => {
        if (!runtime || input.phase !== 'plain') return;
        try { restoreCards(sessionId); setError(''); } catch (error) { setError(error.message); }
      }, [sessionId, input.draft, input.draftRev, input.phase]);
      const rows = [];
      for (const occurrence of input.occurrences || []) if (occurrence.source === SOURCE) {
        try { rows.push(parseReference(occurrence.ref)); } catch {}
      }
      if (!rows.length && !error) return null;
      return h('section', { className: 'dshQuoteCards', 'aria-label': '本轮引用', onKeyDown: event => event.stopPropagation() },
        rows.map(value => h(QuoteCard, { key: value.id, value, sessionId, disabled: input.phase !== 'plain' })),
        error && h('p', { className: 'dshQuoteError', role: 'alert' }, error));
    }
    function QuestionTab({ sessionId, useTabInfo }) {
      const { tab } = useTabInfo(), id = tab.navigation.params?.contextId;
      return h(Question, { key: id || 'empty', id, sessionId, lifetime: tab.signal });
    }
    function Question({ id, sessionId, lifetime }) {
      const [data, setData] = React.useState(null), [question, setQuestion] = React.useState(''),
        [busy, setBusy] = React.useState(false), [error, setError] = React.useState('');
      const request = React.useRef(null), alive = React.useRef(true), textarea = React.useRef(null), history = React.useRef(null);
      const stop = () => {
        if (!request.current) return;
        request.current.abort(); request.current = null;
        void api('cancel', { id, sessionId }).catch(() => {});
        if (alive.current) { setBusy(false); setError('已停止回答，问题仍可编辑后重试'); }
      };
      React.useEffect(() => {
        alive.current = true;
        const controller = new AbortController();
        if (!id) { setError('请在 AI 回复或资料中选择文字，再点“在侧边栏提问”'); return () => { alive.current = false; }; }
        api('load', { id, sessionId }, controller.signal).then(value => {
          if (controller.signal.aborted || !alive.current) return;
          setData(value); textarea.current?.focus();
        }).catch(error => { if (!controller.signal.aborted && alive.current) setError(error.message); });
        const cancel = () => { controller.abort(); stop(); };
        lifetime?.addEventListener('abort', cancel, { once: true });
        if (lifetime?.aborted) cancel();
        return () => { alive.current = false; controller.abort(); stop(); lifetime?.removeEventListener('abort', cancel); };
      }, [id, sessionId, lifetime]);
      React.useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [data?.thread?.history.length, busy]);
      const send = async event => {
        event?.preventDefault(); event?.stopPropagation();
        if (request.current || !question.trim() || !data) return;
        const controller = new AbortController(); request.current = controller; setBusy(true); setError('');
        try {
          const value = await api('ask', { id, sessionId, question }, controller.signal);
          if (!alive.current || controller.signal.aborted) return;
          setData(value); setQuestion('');
        } catch (error) { if (alive.current && !controller.signal.aborted) setError(error.message); }
        finally { if (request.current === controller) { request.current = null; if (alive.current) setBusy(false); } }
      };
      const copyAnswer = row => {
        try { append({ label: '侧边栏回答 · ' + data.thread.context.label, text: row.answer }, sessionId); runtime.message('回答已引用至当前草稿'); }
        catch (error) { setError(error.message); }
      };
      const context = data?.thread?.context;
      return h('section', { className: 'dshQuoteQuestion', 'aria-label': '选区提问', onKeyDown: event => event.stopPropagation() },
        h('header', null, h('strong', null, '围绕选区提问'), h('span', null, '不打断当前会话')),
        context && h('details', { className: 'dshQuoteContext', open: true },
          h('summary', null, context.label), h('blockquote', null, context.text)),
        h('div', { className: 'dshQuoteHistory', ref: history, role: 'log', 'aria-live': 'polite' },
          !data && !error && h('p', { role: 'status' }, '正在载入引用…'),
          data && !data.thread.history.length && h('p', { className: 'dshQuoteHint' }, '你想了解这段内容的哪一点？'),
          data?.thread.history.map(row => h('article', { key: row.id },
            h('p', { className: 'dshQuoteUser' }, row.question),
            h('div', { className: 'dshQuoteAnswer' }, h(MarkdownText, { text: row.answer, streaming: false })),
            h('button', { type: 'button', className: 'dshQuoteTextButton', onClick: () => copyAnswer(row) }, '引用回答至当前会话'))),
          busy && h('p', { role: 'status' }, '正在思考…')),
        error && h('p', { className: 'dshQuoteError', role: 'alert' }, error),
        h('form', { onSubmit: send },
          h('textarea', { ref: textarea, value: question, maxLength: 4000, disabled: busy || !data,
            'aria-label': '针对选区提问', placeholder: '针对这段内容提问…',
            onChange: event => setQuestion(event.target.value),
            onKeyDown: event => { event.stopPropagation(); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) send(event); } }),
          h('div', { className: 'dshQuoteFormActions' },
            h('small', null, 'DeepSeek V4.1 Flash · 仅发送选区与提问'),
            busy ? h('button', { type: 'button', onClick: stop }, '停止回答') :
              h('button', { type: 'submit', disabled: !data || !question.trim() }, '发送提问'))));
    }
    const css = [
      '.dshQuoteToolbar{position:fixed;z-index:10000;display:flex;align-items:center;gap:2px;padding:4px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 4px 20px #0002;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;-webkit-app-region:no-drag}',
      '.dshQuoteToolbar[hidden],.dshQuoteToast[hidden]{display:none!important}.dshQuoteToolbar button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;border-radius:6px;padding:8px 10px;white-space:nowrap}.dshQuoteToolbar button+button{border-left:1px solid var(--dsw-alias-border-l2,#ddd)}',
      '.dshQuoteToolbar button:hover,.dshQuoteToolbar button:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#eee);outline:2px solid transparent}.dshQuoteToolbar button:focus-visible{outline-color:#377dde}.dshQuoteToolbar button:disabled{opacity:.45;cursor:wait}',
      '.dshQuoteToast{position:fixed;bottom:24px;right:24px;max-width:min(420px,85vw);z-index:10001;padding:10px 16px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#ddd);background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#222);box-shadow:0 4px 18px #0001;font:13px/1.5 -apple-system,sans-serif}',
      '.dshQuoteQuestion{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;box-sizing:border-box;padding:18px;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-alias-bg-base,#fff);font:14px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;overflow:hidden}',
      '.dshQuoteQuestion header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.dshQuoteQuestion header span,.dshQuoteHint,.dshQuoteQuestion small{font-size:12px;color:var(--dsw-alias-label-tertiary,#777)}',
      '.dshQuoteContext{flex:none;max-height:30%;overflow:auto;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;padding:10px 12px;font-size:13px}.dshQuoteContext summary{cursor:pointer;font-weight:500;overflow-wrap:anywhere}.dshQuoteContext blockquote{white-space:pre-wrap;margin:8px 0 0;padding:0 0 0 10px;border-left:2px solid var(--dsw-alias-border-l2,#ddd);overflow-wrap:anywhere}',
      '.dshQuoteHistory{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere}.dshQuoteHistory article+article{margin-top:24px}.dshQuoteUser{background:var(--dsw-alias-interactive-bg-hover,#f4f4f4);border-radius:10px;padding:8px 12px;white-space:pre-wrap}.dshQuoteAnswer{user-select:text}.dshQuoteTextButton{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:12px;padding:4px 0;cursor:pointer}.dshQuoteTextButton:hover{text-decoration:underline}',
      '.dshQuoteQuestion form{flex:none;display:flex;flex-direction:column;gap:8px}.dshQuoteQuestion textarea{resize:vertical;min-height:76px;max-height:180px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:transparent;color:inherit;padding:10px;box-sizing:border-box;width:100%;font:inherit;outline-offset:2px}.dshQuoteFormActions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.dshQuoteFormActions button{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-interactive-bg-hover,#f3f3f3);color:inherit;padding:6px 12px;cursor:pointer;font:inherit}.dshQuoteFormActions button:disabled{opacity:.4;cursor:default}.dshQuoteError{flex:none;max-height:90px;overflow:auto;color:var(--dsw-alias-state-error-primary,#b22929);font-size:13px;margin:0}',

      '.dshQuoteCards{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,0px));max-width:var(--dsh-composer-card-max-width,760px);max-height:280px;overflow:auto;overscroll-behavior:contain;margin:0 auto 8px;display:flex;flex-direction:column;gap:6px;font:13px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;color:var(--dsw-alias-label-primary,#292b30)}',
      '[data-conversation-content]:has(.dshQuoteCards) [data-composer-chip="quote-context"]{display:none}',
      '.dshQuoteCard{position:relative;flex:none;min-width:0;border:1px solid var(--dsw-alias-border-l2,#dedfe3);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-interactive-bg-hover,#f7f8fa);box-sizing:border-box}.dshQuoteCardTop{display:flex;align-items:center;gap:7px;min-width:0}.dshQuoteGlyph{color:var(--dsw-alias-label-tertiary,#8c9099);font-size:18px;line-height:16px;flex:none}.dshQuoteCardSource{color:var(--dsw-alias-label-secondary,#737882);font-size:11px;line-height:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
      '.dshQuoteRemove{margin-left:auto;flex:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,#8c9099);width:23px;height:23px;line-height:21px;font:18px/1 -apple-system,sans-serif;cursor:pointer;border-radius:5px;display:grid;place-items:center}.dshQuoteRemove:hover{background:var(--dsw-alias-interactive-bg-hover-solid,#e9ebef);color:var(--dsw-alias-label-primary,#292b30)}.dshQuoteRemove:focus-visible,.dshQuoteCard summary:focus-visible,.dshQuoteCard button:focus-visible{outline:2px solid #3978dc;outline-offset:2px}',
      '.dshQuoteSnippet{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap;margin:4px 0 3px;font-size:13px;line-height:19px}.dshQuoteCardActions{display:flex;align-items:baseline;gap:14px}.dshQuoteCard .dshQuoteTextButton,.dshQuoteOriginal summary{font:12px/20px -apple-system,sans-serif;color:var(--dsw-alias-label-secondary,#747983);padding:0;cursor:pointer}.dshQuoteOriginal summary{list-style:none}.dshQuoteOriginal summary::-webkit-details-marker{display:none}.dshQuoteOriginal summary:hover,.dshQuoteTextButton:hover{color:var(--dsw-alias-label-primary,#292b30)}.dshQuoteOriginal[open]{flex:1;min-width:0}.dshQuoteOriginal blockquote{max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 -apple-system,sans-serif;margin:6px 0 0;border-left:2px solid var(--dsw-alias-border-l2,#d8dce3);padding:0 0 0 10px}',
      '.dshQuoteComment{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2,#e2e4e8)}.dshQuoteComment textarea{display:block;box-sizing:border-box;width:100%;min-height:48px;max-height:140px;resize:vertical;border:0;outline:0;background:transparent;color:inherit;font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;padding:0 2px;caret-color:var(--dsw-alias-label-primary,#292b30)}.dshQuoteComment textarea:focus{outline:none}.dshQuoteComment:focus-within{border-top-color:var(--dsw-alias-state-business-primary,#5d83be)}.dshQuoteComment small{display:block;text-align:right;color:var(--dsw-alias-label-tertiary,#9397a0);font-size:10px;line-height:16px}.dshQuoteCard button:disabled,.dshQuoteComment textarea:disabled{opacity:.5;cursor:default}',
      '.dshQuoteSent{display:flex;flex-direction:column;gap:6px;max-width:100%;margin:8px 0 2px;text-align:left;white-space:normal}.dshQuoteSent .dshQuoteCard{padding:8px 10px;background:color-mix(in srgb,var(--dsw-alias-bg-base,#fff) 55%,transparent)}.dshQuoteSentComment{font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l2,#ddd)}',
      '[data-dsh-quote-echo]{font-size:0!important;line-height:0!important}[data-dsh-quote-echo]>*{display:none!important}[data-dsh-quote-echo]::after{content:attr(data-dsh-quote-echo);font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap}',
      '.dshQuoteSavedComment{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0;padding-top:7px;border-top:1px solid var(--dsw-alias-border-l2,#ddd);font:13px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.dshQuoteCommentActions{display:flex;align-items:center;justify-content:space-between;gap:10px}.dshQuoteCommentActions small{text-align:left}.dshQuoteCommentActions button{flex:none}',
    ].join('\n');
    function apply(ctx) {
      ctx.effect(() => ctx.inputTriggers.registerSource({
        name: SOURCE, trigger: '@', showGroupTitle: false, candidates: async () => [],
        onPick: () => undefined,
        openReference(_session, { ref }) {
          try { const value = parseReference(ref); window.dispatchEvent(new CustomEvent('dsh:quote-comment', { detail: { id: value.id } })); return true; }
          catch { return false; }
        },
        codec: { clipboardText: ref => clipboard(parseReference(ref)), serialize: async ref => modelText(parseReference(ref)) },
      }));
      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock', id: 'quote-context-cards', order: 18,
      }, QuotesDock)));
      // Shadow only the two native user-message seats, delegating all controls/attachments to the original component.
      ctx.effect(() => ctx.slots.inject('conversation.chat.node', () => {
        const originals = ctx.slots.entriesOfSlot('conversation.chat.node').filter(entry => ['user', 'steering'].includes(entry.options.key));
        const disposers = originals.map(entry => ctx.slots.register({
          name: 'conversation.chat.node', key: entry.options.key, priority: (entry.options.priority || 0) - 10,
          ...(entry.locale ? { locale: entry.locale } : {}), ...(entry.inject ? { inject: entry.inject } : {}),
        }, messageRenderer(entry.component)));
        return () => { for (const dispose of disposers) dispose(); };
      }));
      ctx.effect(() => ctx.sidebarRightTabs.register({ id: TYPE, kind: KIND, title: () => '选区提问', keepMounted: true }));
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TYPE }, QuestionTab)));
      ctx.effect(() => {
        window.__DSH_QUOTE_CONTEXT__ = true;
        const style = document.createElement('style'); style.dataset.plugin = '@local/dsh-quote-context'; style.textContent = css; document.head.append(style);
        const toolbar = document.createElement('div'); toolbar.className = 'dshQuoteToolbar'; toolbar.hidden = true;
        toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', '选区操作');
        const quoteButton = document.createElement('button'), askButton = document.createElement('button');
        quoteButton.type = askButton.type = 'button'; quoteButton.textContent = '引用至当前会话'; askButton.textContent = '在侧边栏提问';
        toolbar.append(quoteButton, askButton); document.body.append(toolbar);
        const toast = document.createElement('div'); toast.className = 'dshQuoteToast'; toast.hidden = true; toast.setAttribute('role', 'status'); document.body.append(toast);
        let candidate = null, timer, selectionTimer, disposed = false, opening = null;
        const message = text => { if (disposed) return; toast.textContent = text; toast.hidden = false; clearTimeout(timer); timer = setTimeout(() => { toast.hidden = true; }, 3500); };
        runtime = { ctx, message };
        const binding = () => ctx.uiSession.adapter.current.getSnapshot();
        const hide = () => { toolbar.hidden = true; candidate = null; };
        const visible = el => {
          for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
            if (node.hidden || node.hasAttribute('inert')) return false;
            const s = window.getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return false;
          }
          return true;
        };
        const select = () => {
          if (disposed || !toolbar.hidden && toolbar.contains(document.activeElement)) return;
          const selection = window.getSelection();
          if (!selection?.rangeCount || selection.isCollapsed) { hide(); return; }
          const range = selection.getRangeAt(0), node = range.commonAncestorContainer,
            element = node.nodeType === 1 ? node : node.parentElement;
          if (!element || element.closest(EXCLUDED)) { hide(); return; }
          const assistant = element.closest('[data-chat-flow-kind="assistant-step"]');
          const library = element.closest('.dlib .document[data-dsh-source-path]');
          const preview = element.closest('[data-textpreview-body]')?.closest('[data-textpreview-state="text"][data-textpreview-url]');
          const source = assistant || library || preview;
          if (!source || !visible(source) || !source.contains(selection.anchorNode) || !source.contains(selection.focusNode)) { hide(); return; }
          // A range spanning from an allowed reply into the composer or toolbar must never capture either.
          for (const excluded of source.querySelectorAll(EXCLUDED)) { if (range.intersectsNode(excluded)) { hide(); return; } }
          const sessionId = binding().key;
          const sourceSession = source.closest('[data-conversation-session]')?.dataset.conversationSession ||
            source.closest('[data-sidebar-right-session]')?.dataset.sidebarRightSession;
          if (!sessionId || sourceSession && sourceSession !== sessionId) { hide(); return; }
          const text = selection.toString().trim(); if (!text || text.length > 12000) { hide(); if (text.length > 12000) message('选区超过 12000 字，请缩小范围'); return; }
          let path = library?.dataset.dshSourcePath || null, label;
          if (preview) {
            try {
              const address = preview.dataset.textpreviewUrl;
              if (!address.startsWith('dsh-resource://file/session/')) { hide(); return; }
              const [owner, ...parts] = address.slice('dsh-resource://file/session/'.length).split('/');
              if (decodeURIComponent(owner) !== sessionId) { hide(); return; }
              path = parts.map(decodeURIComponent).join('/');
            } catch { hide(); return; }
          }
          label = path?.split('/').at(-1) || 'AI 回复' + (assistant?.dataset.chatTurn ? ' · 第 ' + assistant.dataset.chatTurn + ' 轮' : '');
          candidate = { ...normalize({ text, path, label, turn: assistant?.dataset.chatTurn || null, nodeKey: assistant?.dataset.chatNodeKey || null }), sessionId };
          toolbar.hidden = false;
          const rect = range.getBoundingClientRect(), box = toolbar.getBoundingClientRect();
          const width = box.width || 310, height = box.height || 42;
          toolbar.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
          toolbar.style.top = Math.max(8, Math.min(rect.bottom + 8 + height <= window.innerHeight ? rect.bottom + 8 : rect.top - height - 8, window.innerHeight - height - 8)) + 'px';
        };
        const schedule = event => {
          if (event?.target?.closest?.('.dshQuoteToolbar')) return;
          clearTimeout(selectionTimer); selectionTimer = setTimeout(select, 20);
        };
        toolbar.addEventListener('mousedown', event => event.preventDefault());
        quoteButton.onclick = () => {
          const row = candidate; if (!row) return;
          try { append(row, row.sessionId); hide(); window.getSelection()?.removeAllRanges(); message('已添加引用，可附加评论'); }
          catch (error) { message(error.message); hide(); }
        };
        askButton.onclick = async () => {
          const row = candidate; if (!row || opening) return;
          opening = new AbortController(); const controller = opening;
          askButton.disabled = true;
          try {
            if (binding().key !== row.sessionId) throw new Error('当前会话已切换，请重新选择');
            const value = await api('create', { sessionId: row.sessionId, context: row }, controller.signal);
            if (disposed || controller.signal.aborted) return;
            if (binding().key !== row.sessionId || ctx.sidebarRight.mounted.getSnapshot() !== row.sessionId) throw new Error('当前会话已切换，请在原会话重新选择');
            ctx.layout.selectPanel(null);
            ctx.sidebarRight.openTab(KIND, { params: { contextId: value.thread.id } });
            hide(); window.getSelection()?.removeAllRanges();
          } catch (error) { if (!controller.signal.aborted) message(error.message); }
          finally { if (opening === controller) opening = null; askButton.disabled = false; }
        };
        const keydown = event => {
          if (event.key === 'Escape' && !toolbar.hidden) { hide(); event.preventDefault(); event.stopPropagation(); }
          else if (event.key === 'ArrowRight' && toolbar.contains(event.target)) { askButton.focus(); event.preventDefault(); }
          else if (event.key === 'ArrowLeft' && toolbar.contains(event.target)) { quoteButton.focus(); event.preventDefault(); }
          else if (event.key === 'Tab' && !toolbar.hidden && !toolbar.contains(event.target) && event.shiftKey === false) { quoteButton.focus(); event.preventDefault(); event.stopPropagation(); }
        };
        const external = event => {
          try { append(normalize(event.detail), binding().key); message('已引用至当前草稿'); }
          catch (error) { message(error.message); }
        };
        const outside = event => { if (!toolbar.contains(event.target)) hide(); };
        document.addEventListener('pointerdown', outside);
        document.addEventListener('mouseup', schedule); document.addEventListener('keyup', schedule);
        document.addEventListener('selectionchange', schedule); document.addEventListener('keydown', keydown, true);
        window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide);
        window.addEventListener('dsh:quote-to-prompt', external);
        const pendingEchoes = () => {
          for (const row of document.querySelectorAll('[data-submission-echo]')) {
            const bubble = row.querySelector('[class*="_bubble"]');
            if (!bubble) continue;
            const parsed = splitQuotes(bubble.textContent || '');
            if (parsed.quotes.length) {
              bubble.dataset.dshQuoteEcho = (parsed.main.trim().slice(0, 180) + (parsed.main.trim() ? '\n' : '') + '正在发送 · ' + parsed.quotes.length + ' 条引用' + (parsed.quotes.some(value => value.comment) ? '与评论' : ''));
              bubble.setAttribute('aria-label', bubble.dataset.dshQuoteEcho);
            } else if (bubble.hasAttribute('data-dsh-quote-echo')) {
              bubble.removeAttribute('data-dsh-quote-echo'); bubble.removeAttribute('aria-label');
            }
          }
        };
        const observer = new MutationObserver(pendingEchoes);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        pendingEchoes();
        const offSession = ctx.uiSession.adapter.current.subscribe(hide);
        return () => {
          disposed = true; opening?.abort(); observer.disconnect(); for (const el of document.querySelectorAll('[data-dsh-quote-echo]')) { el.removeAttribute('data-dsh-quote-echo'); el.removeAttribute('aria-label'); } runtime = null; delete window.__DSH_QUOTE_CONTEXT__;
          clearTimeout(timer); clearTimeout(selectionTimer); style.remove(); toolbar.remove(); toast.remove();
          document.removeEventListener('pointerdown', outside);
          document.removeEventListener('mouseup', schedule); document.removeEventListener('keyup', schedule);
          document.removeEventListener('selectionchange', schedule); document.removeEventListener('keydown', keydown, true);
          window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide);
          window.removeEventListener('dsh:quote-to-prompt', external); offSession();
        };
      });
    }
    return { inject: ['slots', 'uiSession', 'layout', 'sidebarRight', 'sidebarRightTabs', 'inputTriggers'], apply };
  },
});
