window.__ModuleLoader__.load({ id: '@local/dsh-tencent-docs/client', factory: require => {
  const R = require('react'), h = R.createElement, { createPortal } = require('react-dom');
  const CSS = `.tdMcp{height:100%;overflow:auto;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242629);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.tdMcp *{box-sizing:border-box}.tdMcp main{max-width:900px;margin:auto;padding:30px}.tdMcp header,.tdMcp .tdActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tdMcp header{justify-content:space-between;margin-bottom:24px}.tdMcp h1{font-size:24px;margin:0}.tdMcp h2{font-size:17px;margin:0 0 10px}.tdMcp h3{font-size:15px;margin:0}.tdMcp p{margin:8px 0}.tdMcp section{margin:18px 0;padding:22px;border:1px solid var(--dsw-alias-border-l2,#e3e5e8);border-radius:12px}.tdMcp button,.tdMcp .tdButton{font:inherit;border:1px solid var(--dsw-alias-border-l2,#ddd);background:transparent;color:inherit;border-radius:7px;padding:7px 12px;cursor:pointer;text-decoration:none}.tdMcp button:hover:not(:disabled),.tdMcp .tdButton:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}.tdMcp button:disabled{opacity:.45;cursor:default}.tdMcp .tdPrimary{background:var(--dsw-alias-label-primary,#242629);color:var(--dsw-alias-bg-base,#fff);border-color:transparent}.tdMcp .tdMuted{color:var(--dsw-alias-label-secondary,#72777f);font-size:13px}.tdMcp .tdError{color:var(--dsw-alias-state-error-primary,#ac3030)}.tdMcp input:not([type=checkbox]){width:100%;min-width:0;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:7px;padding:8px 10px;margin:8px 0}.tdMcp input[type=checkbox]{margin-right:7px}.tdMcp button:focus-visible,.tdMcp a:focus-visible,.tdMcp input:focus-visible,.tdMcp summary:focus-visible{outline:2px solid #527fc7;outline-offset:3px}.tdMcp pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;font:12px/1.6 ui-monospace,monospace;background:var(--dsw-alias-interactive-bg-hover,#f5f6f8);padding:14px;border-radius:7px}.tdMcp summary{cursor:pointer}.tdMcp details{margin:14px 0}.tdMcp .tdCommand{padding:16px 0;border-top:1px solid var(--dsw-alias-border-l2,#e3e5e8)}.tdMcp .tdOverlay{position:fixed;inset:0;z-index:1000;background:#0006;display:flex;align-items:center;justify-content:center;padding:24px}.tdMcp .tdDialog{margin:0;background:var(--dsw-alias-bg-base,#fff);max-width:760px;width:100%;max-height:90vh;overflow:auto}.tdMcp .tdExample{padding:10px 14px;border-left:2px solid var(--dsw-alias-border-l2,#ddd);margin:12px 0}.tdMcp .tdNotice{padding:10px 0}@media(max-width:600px){.tdMcp main{padding:18px}.tdMcp section{padding:16px}.tdMcp .tdOverlay{padding:12px}}`;

  const EXTRA = `.tdMcp.tdModalRoot{height:0;overflow:visible;background:transparent}.tdMcp.tdDock{height:auto;overflow:visible;background:transparent;width:calc(100% - 2 * var(--dsh-composer-side-clearance,0px));max-width:var(--dsh-composer-card-max-width,760px);margin:0 auto 7px}.tdDock main{padding:0}.tdDock .tdExpanded{max-height:360px;overflow:auto;margin-top:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:var(--dsw-alias-bg-base,#fff)}.tdDock section{margin:10px 0;padding:12px}.tdMcp .tdChip{padding:5px 9px;font-size:12px;border-radius:7px;display:inline-flex;align-items:center;gap:7px}.tdMcp .tdStateDot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary,#92969c)}.tdMcp .tdStateDot[data-ready=true]{background:#348363}.tdMcp .tdBadge{font-size:11px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:4px;padding:0 5px}.tdMcp .tdConnector{margin:0 0 20px;padding:20px;border:1px solid var(--dsw-alias-border-l2,#e3e5e8);border-radius:12px}.tdMcp .tdConnectorTitle{display:flex;gap:10px;align-items:center}.tdMcp .tdConnectorTitle h2{margin:0}.tdMcp .tdConnectorIcon{display:grid;place-items:center;background:#1685f00d;color:#1685d2;border:1px solid #1685f033;border-radius:8px;width:36px;height:36px;font-size:20px}.tdMcp .tdConnectorState{margin-left:auto;font-size:12px;color:var(--dsw-alias-label-secondary,#72777f)}.tdMcp .tdCapability{font-size:13px;color:var(--dsw-alias-label-secondary,#72777f)}.tdMcp .tdReturn{border:0;padding:4px 0;font-size:12px}.tdMcp .tdDialog{min-width:0}.tdDock .tdConnector{margin:0;border:0;padding:0}.tdDock .tdConnectorIcon{width:28px;height:28px;font-size:16px}.tdDock .tdConnectorTitle h2{font-size:15px}.tdMcp .tdSettings{border-top:1px solid var(--dsw-alias-border-l2,#e3e5e8);padding-top:12px;margin-top:16px}.tdMcp .tdPending{margin:12px 0 0}.tdMcp .tdPending .tdCommand:first-of-type{border-top:0}.tdMcp .tdCellSummary{padding:10px 12px;border-left:2px solid #1685d2;background:var(--dsw-alias-interactive-bg-hover,#f5f6f8)}.tdMcp .tdFooter{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:18px}`;
  let runtime = null;
  const api = async (action, args = {}, signal) => {
    const response = await fetch('/api/tencent-docs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, action }), signal });
    const value = await response.json();
    if (!response.ok || value.error) throw new Error(value.error || '腾讯文档操作未完成');
    return value;
  };
  const when = value => value ? new Date(value).toLocaleString() : '—';
  const stateName = state => ({ pending: '等待你确认', executing: '正在执行，请勿重复操作', completed: '已执行', rejected: '已拒绝', 'account-changed': '账号变化，已失效', 'outcome-unknown': '结果待核对，请勿重复执行' }[state] || state);
  function cellSummary(command) {
    const a = command.arguments;
    if (command.tool !== 'sheet.set_cell_value' || !Number.isInteger(a?.row) || !Number.isInteger(a?.col) || a.row < 0 || a.col < 0) return null;
    let n = a.col + 1, column = ''; while (n > 0) { n--; column = String.fromCharCode(65 + n % 26) + column; n = Math.floor(n / 26); }
    const value = ({ STRING: a.string_value, NUMBER: a.number_value, BOOL: a.bool_value, FORMULA: a.formula })[a.value_type];
    return '修改单元格 ' + column + (a.row + 1) + '：' + String(value ?? '');
  }
  async function conversation() {
    if (!runtime) throw new Error('连接器尚未就绪');
    const binding = runtime.uiSession.adapter.current.getSnapshot();
    if (binding.key) runtime.layout.selectPanel(null);
    else await runtime.uiWorkspace.startSession();
  }
  function Panel({ compact = false, sessionId = null } = {}) {
    const [status, setStatus] = R.useState(null), [busy, setBusy] = R.useState(''), [error, setError] = R.useState(''), [notice, setNotice] = R.useState('');
    const [token, setToken] = R.useState(''), [file, setFile] = R.useState(''), [result, setResult] = R.useState(null), [review, setReview] = R.useState(null), [expanded, setExpanded] = R.useState(!compact);
    const pending = R.useRef(false), alive = R.useRef(true), controllers = R.useRef(new Set()), dialog = R.useRef(null), previousFocus = R.useRef(null), writing = R.useRef(false), readRevision = R.useRef(0);
    const scope = compact ? { scope: 'session', sessionId } : {};
    const refresh = async signal => {
      const controller = signal ? null : new AbortController(), current = ++readRevision.current;
      if (controller) controllers.current.add(controller);
      try { const value = await api('status', scope, signal || controller.signal); if (alive.current && current === readRevision.current) setStatus(value); return value; }
      finally { if (controller) controllers.current.delete(controller); }
    };
    const run = async (label, work) => {
      if (pending.current) return;
      pending.current = true; setBusy(label); setError(''); setNotice('');
      const controller = new AbortController(); controllers.current.add(controller);
      try { await work(controller.signal); }
      catch (e) { if (alive.current && e.name !== 'AbortError') setError(e.message); }
      finally { controllers.current.delete(controller); pending.current = false; if (alive.current) setBusy(''); }
    };
    const act = (action, args = {}) => run('正在更新', async signal => {
      try {
        writing.current = action === 'approve';
        await api(action, { ...scope, ...args }, signal);
        if (alive.current) { setReview(null); setNotice(action === 'approve' ? '修改已执行。可在会话中让 AI 读回核对。' : '已更新。'); }
      } finally { writing.current = false; if (alive.current) { setToken(''); await refresh(signal); } }
    });
    R.useEffect(() => {
      alive.current = true;
      const invalidate = () => { void refresh().catch(e => { if (alive.current && e.name !== 'AbortError') setError(e.message); }); };
      invalidate(); window.addEventListener('focus', invalidate);
      const events = typeof EventSource === 'function' ? new EventSource('/api/tencent-docs/events') : null;
      events?.addEventListener('changed', invalidate);
      return () => { alive.current = false; readRevision.current++; for (const c of controllers.current) c.abort(); window.removeEventListener('focus', invalidate); events?.close(); };
    }, [sessionId]);
    const commands = status?.commands || [], outstanding = commands.filter(c => ['pending', 'executing', 'outcome-unknown'].includes(c.state));
    const pendingIds = outstanding.map(c => c.id).join('|');
    R.useEffect(() => { if (compact && pendingIds) setExpanded(true); }, [compact, pendingIds]);
    R.useEffect(() => {
      if (!review) return;
      previousFocus.current = document.activeElement;
      dialog.current?.querySelector('button')?.focus();
      window.addEventListener('keydown', dialogKey, true);
      return () => { window.removeEventListener('keydown', dialogKey, true); if (previousFocus.current?.isConnected) previousFocus.current.focus(); };
    }, [review]);
    const closeReview = () => { if (!writing.current) setReview(null); };
    const dialogKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReview(); }
      if (event.key !== 'Tab') return;
      const fields = [...(dialog.current?.querySelectorAll('button:not(:disabled),summary') || [])];
      if (!fields.length) return;
      const first = fields[0], last = fields.at(-1);
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const ready = status?.connected, label = ready ? '已连接' : status?.connecting ? '连接中' : status?.authorized ? '待重连' : '未连接';
    const login = () => run('准备授权', async signal => { await api('login', {}, signal); await refresh(signal); });
    const check = () => run('连接腾讯文档', async signal => { await api('discover', {}, signal); await refresh(signal); });
    const details = h('div', { className: compact ? 'tdExpanded' : '' },
      h('article', { className: 'tdConnector' },
        h('div', { className: 'tdConnectorTitle' }, h('span', { className: 'tdConnectorIcon', 'aria-hidden': true }, '文'), h('h2', null, '腾讯文档'), h('span', { className: 'tdConnectorState' }, label)),
        h('p', { className: 'tdCapability' }, '搜索与读取文档 · 在线表格 · 提出修改建议'),
        h('p', null, ready ? '已连接。把腾讯文档链接贴进会话，直接告诉 AI 要做什么。' : status?.authorized ? '授权已保存，连接成功后即可在会话中使用。' : '连接你的腾讯账号，在会话里读取文档或提出修改。'),
        h('div', { className: 'tdActions' },
          !status?.authorized && h('button', { className: 'tdPrimary', disabled: !!busy, onClick: login }, '连接腾讯文档'),
          status?.authorized && !ready && h('button', { className: 'tdPrimary', disabled: !!busy || status?.connecting, onClick: check }, '重新连接'),
          !compact && ready && h('button', { className: 'tdPrimary', disabled: !!busy, onClick: () => run('打开会话', conversation) }, '去会话'),
          h('a', { className: 'tdButton', href: 'https://docs.qq.com/desktop/', target: '_blank', rel: 'noreferrer' }, '打开官网')),
        status?.login && h('p', null, h('a', { className: 'tdButton tdPrimary', href: status.login.url, target: '_blank', rel: 'noreferrer' }, '在浏览器确认授权'), h('span', { className: 'tdMuted' }, ' 授权完成后自动连接，回到会话即可使用。')),
        status?.error && h('p', { className: 'tdError' }, status.error),
        h('p', { className: 'tdExample' }, '“读取这个腾讯文档链接，总结本周进展。”'),
        h('p', null, h('label', null, h('input', { type: 'checkbox', checked: !!status?.allowWrite, disabled: !!busy || !status?.authorized, onChange: e => act('allowWrite', { enabled: e.target.checked }) }), '允许 AI 提出修改建议')),
        h('p', { className: 'tdMuted' }, '修改先列出建议，审阅并确认后才写入。PPT、图片及原版式在官网查看。'),
        h('details', { className: 'tdSettings' }, h('summary', null, '连接设置'),
          h('div', { className: 'tdActions' },
            h('button', { disabled: !!busy, onClick: login }, status?.authorized ? '重新登录授权' : '登录并授权'),
            h('button', { disabled: !!busy || !status?.authorized, onClick: check }, '检查连接'),
            h('button', { disabled: !!busy, onClick: () => run('刷新状态', refresh) }, '刷新状态'),
            status?.authorized && h('button', { disabled: !!busy, onClick: () => act('logout') }, '断开连接')),
          h('p', { className: 'tdMuted' }, '腾讯官方 MCP' + (status?.toolCount ? ' · ' + status.toolCount + ' 个可用工具' : '') + '；文档权限以实际读取结果为准。'),
          h('details', null, h('summary', null, '检查某个文档的读取权限'), h('form', { onSubmit: e => { e.preventDefault(); void run('只读检查', async signal => { const value = await api('read', { fileId: file }, signal); if (alive.current) setResult(value.result); await refresh(signal); }); } },
            h('label', { htmlFor: 'td-read-link-' + (sessionId || 'global') }, '腾讯文档链接'), h('input', { id: 'td-read-link-' + (sessionId || 'global'), value: file, onChange: e => { setFile(e.target.value); setResult(null); }, placeholder: 'https://docs.qq.com/doc/…', disabled: !!busy }),
            h('button', { type: 'submit', disabled: !!busy || !file.trim() || !status?.authorized }, '只读检查')),
            result && h('div', null, h('p', null, '官方工具已返回内容，未调用模型。'), h('details', null, h('summary', null, '查看官方返回'), h('pre', null, JSON.stringify(result, null, 2))))),
          h('details', null, h('summary', null, '使用个人 Token（可选）'), h('label', { htmlFor: 'td-token-' + (sessionId || 'global') }, '腾讯官方个人 Token'), h('input', { id: 'td-token-' + (sessionId || 'global'), type: 'password', value: token, autoComplete: 'off', spellCheck: false, onChange: e => setToken(e.target.value) }),
            h('button', { disabled: !!busy || !token.trim(), onClick: () => act('token', { token }) }, '保存 Token 并连接')))),
      outstanding.length > 0 && h('section', { className: 'tdPending' }, h('h2', null, '待确认修改 · ' + outstanding.length),
        outstanding.map(command => h('article', { className: 'tdCommand', key: command.id }, h('h3', null, stateName(command.state)),
          h('p', null, cellSummary(command) || command.tool), h('p', { className: 'tdMuted' }, (command.fileId ? '文档 ' + command.fileId + ' · ' : '') + when(command.at)),
          command.state === 'pending' ? h('div', { className: 'tdActions' }, h('button', { disabled: !!busy || !status.allowWrite, onClick: () => setReview(command) }, '审阅修改'), h('button', { disabled: !!busy, onClick: () => act('reject', { id: command.id }) }, '拒绝')) : h('p', { className: 'tdMuted' }, '先让 AI 只读核对，连接器不会自动重试。')))),
      compact && status?.otherPendingCount > 0 && h('p', { className: 'tdMuted' }, '另有 ' + status.otherPendingCount + ' 条其他会话或早期修改建议。', h('button', { className: 'tdReturn', onClick: () => runtime.layout.selectPanel('tencent-docs') }, '到连接器页面查看')),
      !compact && h('details', null, h('summary', null, '最近处理记录'), commands.filter(c => !outstanding.includes(c)).slice(0, 10).map(command => h('p', { key: command.id }, stateName(command.state) + ' · ' + command.tool + ' · ' + when(command.completedAt || command.at)))),
      (busy || notice) && h('p', { role: 'status', className: 'tdNotice' }, busy || notice), error && h('p', { role: 'alert', className: 'tdError' }, error));
    const modal = review && h('div', { className: 'tdMcp tdModalRoot' }, h('div', { className: 'tdOverlay', onMouseDown: e => { if (e.target === e.currentTarget) closeReview(); } }, h('section', { ref: dialog, className: 'tdDialog', role: 'dialog', 'aria-modal': true, 'aria-label': '审阅腾讯文档修改' },
      h('header', null, h('h2', null, '审阅这一次修改'), h('button', { disabled: writing.current, onClick: closeReview }, '关闭')),
      cellSummary(review) && h('p', { className: 'tdCellSummary' }, cellSummary(review)),
      h('p', null, '官方工具：' + review.tool), h('p', null, review.fileId ? '目标文档：' + review.fileId : '请核对下方目标参数。'),
      h('h3', null, '将提交的完整参数'), h('pre', null, JSON.stringify(review.arguments, null, 2)),
      review.before && h('details', null, h('summary', null, '修改前读取的内容'), h('pre', null, JSON.stringify(review.before, null, 2))),
      h('p', { className: 'tdMuted' }, '只执行这一次修改。内容发生变化时停止；结果不明时不自动重试。'),
      h('div', { className: 'tdFooter' }, h('button', { disabled: writing.current, onClick: closeReview }, '暂不执行'), h('button', { className: 'tdPrimary', disabled: !!busy || !status?.allowWrite || !commands.some(c => c.id === review.id && c.state === 'pending'), onClick: () => act('approve', { id: review.id }) }, '确认写入腾讯文档')),
      error && h('p', { role: 'alert', className: 'tdError' }, error))));
    return h('div', { className: 'tdMcp' + (compact ? ' tdDock' : '') },
      h('main', null, compact ? h('button', { type: 'button', className: 'tdChip', 'aria-expanded': expanded, onClick: () => setExpanded(value => !value) }, h('span', { className: 'tdStateDot', 'data-ready': !!ready, 'aria-hidden': true }), '腾讯文档 · ' + label, outstanding.length > 0 && h('span', { className: 'tdBadge' }, outstanding.length + ' 项待确认')) : h('header', null, h('h1', null, '连接器'), h('p', { className: 'tdMuted' }, '连接账号，在会话中使用。')),
        expanded && details), modal && createPortal(modal, document.body));
  }
  function ConnectorDock({ sessionId }) { return h(Panel, { compact: true, sessionId, key: sessionId }); }
  function apply(ctx) {
    runtime = ctx;
    ctx.effect(() => { const style = document.createElement('style'); style.textContent = CSS + EXTRA; style.dataset.plugin = '@local/dsh-tencent-docs'; document.head.append(style); return () => { style.remove(); if (runtime === ctx) runtime = null; }; });
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'tencent-docs' }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'tencent-docs', order: 33, label: '连接器' }, () => h('span', { 'aria-hidden': true }, '↗')));
    ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'tencent-docs', order: 33, label: '腾讯文档连接器' }, props => props.view === 'summary' ? h('p', null, '连接腾讯账号后，在会话里读取文档、审阅修改。') : h(Panel)));
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'tencent-docs-connector', order: 16 }, ConnectorDock));
  }
  return { inject: ['slots', 'layout', 'uiSession', 'uiWorkspace'], apply };
}});
