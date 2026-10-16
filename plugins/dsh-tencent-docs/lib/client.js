window.__ModuleLoader__.load({ id: '@local/dsh-tencent-docs/client', factory: require => {
  const R = require('react'), h = R.createElement;
  const CSS = `.tdMcp{height:100%;overflow:auto;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#242629);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}.tdMcp *{box-sizing:border-box}.tdMcp main{max-width:900px;margin:auto;padding:30px}.tdMcp header,.tdMcp .tdActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.tdMcp header{justify-content:space-between;margin-bottom:24px}.tdMcp h1{font-size:24px;margin:0}.tdMcp h2{font-size:17px;margin:0 0 10px}.tdMcp h3{font-size:15px;margin:0}.tdMcp p{margin:8px 0}.tdMcp section{margin:18px 0;padding:22px;border:1px solid var(--dsw-alias-border-l2,#e3e5e8);border-radius:12px}.tdMcp button,.tdMcp .tdButton{font:inherit;border:1px solid var(--dsw-alias-border-l2,#ddd);background:transparent;color:inherit;border-radius:7px;padding:7px 12px;cursor:pointer;text-decoration:none}.tdMcp button:hover:not(:disabled),.tdMcp .tdButton:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}.tdMcp button:disabled{opacity:.45;cursor:default}.tdMcp .tdPrimary{background:var(--dsw-alias-label-primary,#242629);color:var(--dsw-alias-bg-base,#fff);border-color:transparent}.tdMcp .tdMuted{color:var(--dsw-alias-label-secondary,#72777f);font-size:13px}.tdMcp .tdError{color:var(--dsw-alias-state-error-primary,#ac3030)}.tdMcp input:not([type=checkbox]){width:100%;min-width:0;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:7px;padding:8px 10px;margin:8px 0}.tdMcp input[type=checkbox]{margin-right:7px}.tdMcp button:focus-visible,.tdMcp a:focus-visible,.tdMcp input:focus-visible,.tdMcp summary:focus-visible{outline:2px solid #527fc7;outline-offset:3px}.tdMcp pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;font:12px/1.6 ui-monospace,monospace;background:var(--dsw-alias-interactive-bg-hover,#f5f6f8);padding:14px;border-radius:7px}.tdMcp summary{cursor:pointer}.tdMcp details{margin:14px 0}.tdMcp .tdCommand{padding:16px 0;border-top:1px solid var(--dsw-alias-border-l2,#e3e5e8)}.tdMcp .tdOverlay{position:fixed;inset:0;z-index:1000;background:#0006;display:flex;align-items:center;justify-content:center;padding:24px}.tdMcp .tdDialog{margin:0;background:var(--dsw-alias-bg-base,#fff);max-width:760px;width:100%;max-height:90vh;overflow:auto}.tdMcp .tdExample{padding:10px 14px;border-left:2px solid var(--dsw-alias-border-l2,#ddd);margin:12px 0}.tdMcp .tdNotice{padding:10px 0}@media(max-width:600px){.tdMcp main{padding:18px}.tdMcp section{padding:16px}.tdMcp .tdOverlay{padding:12px}}`;
  const api = async (action, args = {}, signal) => {
    const response = await fetch('/api/tencent-docs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, action }), signal });
    const value = await response.json();
    if (!response.ok || value.error) throw new Error(value.error || '腾讯文档操作未完成');
    return value;
  };
  const when = value => value ? new Date(value).toLocaleString() : '—';
  const stateName = state => ({ pending: '等待你确认', executing: '正在执行，请勿重复操作', completed: '已执行', rejected: '已拒绝', 'account-changed': '账号变化，已失效', 'outcome-unknown': '结果待核对，请勿重复执行' }[state] || state);
  function Panel() {
    const [status, setStatus] = R.useState(null), [busy, setBusy] = R.useState(''), [error, setError] = R.useState(''), [notice, setNotice] = R.useState('');
    const [token, setToken] = R.useState(''), [file, setFile] = R.useState(''), [result, setResult] = R.useState(null), [review, setReview] = R.useState(null);
    const pending = R.useRef(false), alive = R.useRef(true), controllers = R.useRef(new Set()), dialog = R.useRef(null), previousFocus = R.useRef(null);
    const refresh = async signal => { const value = await api('status', {}, signal); if (alive.current) setStatus(value); return value; };
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
        await api(action, args, signal);
        if (alive.current) { setReview(null); setNotice(action === 'approve' ? '官方 MCP 已返回执行结果。可在会话中要求 AI 读回核对。' : '已更新。'); }
      } finally { if (alive.current) { setToken(''); await refresh(signal); } }
    });
    R.useEffect(() => {
      alive.current = true;
      const focus = () => { if (!pending.current) void run('读取状态', refresh); };
      focus(); window.addEventListener('focus', focus);
      return () => { alive.current = false; for (const c of controllers.current) c.abort(); window.removeEventListener('focus', focus); };
    }, []);
    R.useEffect(() => {
      if (!review) return;
      previousFocus.current = document.activeElement;
      dialog.current?.querySelector('button')?.focus();
      return () => { if (previousFocus.current?.isConnected) previousFocus.current.focus(); };
    }, [review]);
    const closeReview = () => { if (!pending.current) setReview(null); };
    const dialogKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeReview(); }
      if (event.key !== 'Tab') return;
      const fields = [...(dialog.current?.querySelectorAll('button:not(:disabled),summary') || [])];
      if (!fields.length) return;
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const commands = status?.commands || [], outstanding = commands.filter(c => ['pending', 'executing', 'outcome-unknown'].includes(c.state));
    return h('div', { className: 'tdMcp' }, h('main', null,
      h('header', null, h('h1', null, '腾讯文档'), h('a', { className: 'tdButton', href: 'https://docs.qq.com/desktop/', target: '_blank', rel: 'noreferrer' }, '打开腾讯文档官网')),
      h('section', null, h('h2', null, '在会话里直接使用'), h('p', null, '完成授权后，将文档链接贴进 DSH 会话，告诉 AI 要读取什么或怎样修改。文档读写通过腾讯官方 MCP 完成。'),
        h('p', { className: 'tdExample' }, '“读取这个腾讯文档链接，总结本周进展。”'), h('p', { className: 'tdExample' }, '“把这个表格中本周已完成的事项改为完成，先提出具体修改供我确认。”'),
        h('p', { className: 'tdMuted' }, '表格请说明工作表和范围。PPT、图片及排版在官网查看；AI 能读取的内容取决于官方工具返回和账号权限。')),
      h('section', null, h('h2', null, status?.authorized ? '账号已授权' : '连接你的账号'),
        h('p', { className: 'tdMuted' }, status?.connected ? '官方 MCP 已连接 · ' + status.toolCount + ' 个可用工具' : status?.authorized ? '授权已保存，点击“检查连接”核对官方 MCP 工具。' : '在腾讯官方页面完成本人登录和授权，账号信息只保存在本机。'),
        h('div', { className: 'tdActions' },
          h('button', { className: 'tdPrimary', disabled: !!busy, onClick: () => run('准备授权', async signal => { await api('login', {}, signal); await refresh(signal); }) }, status?.authorized ? '重新登录授权' : '登录并授权'),
          h('button', { disabled: !!busy || !status?.authorized, onClick: () => run('检查官方 MCP', async signal => { const value = await api('discover', {}, signal); await refresh(signal); if (alive.current) setNotice('已发现 ' + value.tools.length + ' 个官方工具；文档读取权限需单独检查。'); }) }, '检查连接'),
          h('button', { disabled: !!busy, onClick: () => run('刷新状态', refresh) }, '刷新状态'),
          status?.authorized && h('button', { disabled: !!busy, onClick: () => act('logout') }, '断开连接')),
        status?.login && h('p', null, h('a', { className: 'tdButton', href: status.login.url, target: '_blank', rel: 'noreferrer' }, '在浏览器确认授权'), h('span', { className: 'tdMuted' }, ' 完成后回到这里刷新状态。')),
        status?.error && h('p', { className: 'tdError' }, status.error),
        h('p', null, h('label', null, h('input', { type: 'checkbox', checked: !!status?.allowWrite, disabled: !!busy || !status?.authorized, onChange: e => act('allowWrite', { enabled: e.target.checked }) }), '允许 AI 提出修改建议')),
        h('p', { className: 'tdMuted' }, '开启后每次仍须在下方逐笔审阅并确认，AI 不能直接执行修改。重新授权会关闭此开关并使旧提案失效。'),
        h('details', null, h('summary', null, '检查某个文档的读取权限'), h('form', { onSubmit: e => { e.preventDefault(); void run('只读检查', async signal => { const value = await api('read', { fileId: file }, signal); if (alive.current) setResult(value.result); await refresh(signal); }); } },
          h('label', { htmlFor: 'td-read-link' }, '腾讯文档链接'), h('input', { id: 'td-read-link', value: file, onChange: e => { setFile(e.target.value); setResult(null); }, placeholder: 'https://docs.qq.com/doc/…', disabled: !!busy }),
          h('button', { type: 'submit', disabled: !!busy || !file.trim() || !status?.authorized }, '只读检查')),
          result && h('div', null, h('p', null, '官方工具已返回内容，未调用模型。'), h('details', null, h('summary', null, '查看官方返回'), h('pre', null, JSON.stringify(result, null, 2))))),
        h('details', null, h('summary', null, '使用个人 Token（可选）'), h('label', { htmlFor: 'td-token' }, '腾讯官方个人 Token'), h('input', { id: 'td-token', type: 'password', value: token, autoComplete: 'off', spellCheck: false, onChange: e => setToken(e.target.value) }),
          h('button', { disabled: !!busy || !token.trim(), onClick: () => act('token', { token }) }, '保存 Token 并连接'))),
      h('section', null, h('h2', null, '待确认修改' + (outstanding.length ? ' · ' + outstanding.length : '')),
        !outstanding.length && h('p', { className: 'tdMuted' }, '暂无待确认修改。让 AI 先提出修改建议，再回到这里审阅。'),
        outstanding.map(command => h('article', { className: 'tdCommand', key: command.id }, h('h3', null, stateName(command.state)), h('p', null, command.tool), h('p', { className: 'tdMuted' }, (command.fileId ? '文档 ' + command.fileId + ' · ' : '') + when(command.at)),
          command.state === 'pending' ? h('div', { className: 'tdActions' }, h('button', { className: 'tdPrimary', disabled: !!busy || !status.allowWrite, onClick: () => setReview(command) }, '审阅修改'), h('button', { disabled: !!busy, onClick: () => act('reject', { id: command.id }) }, '拒绝')) : h('p', { className: 'tdMuted' }, '请打开官网或让 AI 只读核对。本插件不会自动重试。'))),
        h('details', null, h('summary', null, '最近处理记录'), commands.filter(c => !outstanding.includes(c)).slice(0, 10).map(command => h('p', { key: command.id }, stateName(command.state) + ' · ' + command.tool + ' · ' + when(command.completedAt || command.at))))),
      (busy || notice) && h('p', { role: 'status', className: 'tdNotice' }, busy || notice), error && h('p', { role: 'alert', className: 'tdError' }, error)),
      review && h('div', { className: 'tdOverlay', onMouseDown: e => { if (e.target === e.currentTarget) closeReview(); } }, h('section', { ref: dialog, className: 'tdDialog', role: 'dialog', 'aria-modal': true, 'aria-label': '审阅腾讯文档修改', onKeyDown: dialogKey },
        h('header', null, h('h2', null, '审阅这一次修改'), h('button', { disabled: !!busy, onClick: closeReview }, '关闭')),
        h('p', null, '官方工具：' + review.tool), h('p', null, review.fileId ? '目标文档：' + review.fileId : '此工具的目标由下方参数确定，请逐项核对。'),
        h('h3', null, '将提交的完整参数'), h('pre', null, JSON.stringify(review.arguments, null, 2)),
        review.before && h('details', null, h('summary', null, '修改前读取的内容'), h('pre', null, JSON.stringify(review.before, null, 2))),
        h('p', { className: 'tdMuted' }, '确认只执行此项。已有文档会先检查是否变化；不确定的执行结果不会自动重试。'),
        h('div', { className: 'tdActions' }, h('button', { className: 'tdPrimary', disabled: !!busy || !status?.allowWrite || !commands.some(c => c.id === review.id && c.state === 'pending'), onClick: () => act('approve', { id: review.id }) }, '确认写入腾讯文档'), h('button', { disabled: !!busy, onClick: closeReview }, '暂不执行')),
        error && h('p', { role: 'alert', className: 'tdError' }, error))));
  }
  function apply(ctx) {
    ctx.effect(() => { const style = document.createElement('style'); style.textContent = CSS; style.dataset.plugin = '@local/dsh-tencent-docs'; document.head.append(style); return () => style.remove(); });
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'tencent-docs' }, Panel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'tencent-docs', order: 33, label: '腾讯文档' }, () => h('span', { 'aria-hidden': true }, '文')));
    ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'tencent-docs', order: 33, label: '腾讯文档' }, props => props.view === 'summary' ? h('p', null, '腾讯官方 MCP 读写、本人授权、逐笔确认修改。') : h(Panel)));
  }
  return { inject: ['slots'], apply };
}});
