window.__ModuleLoader__.load({
  id: '@local/dsh-tencent-docs/client',
  factory: require => {
    const React = require('react'), h = React.createElement;
    const CSS = `
      .tdocs{height:100%;overflow:auto;padding:32px;color:var(--dsw-alias-label-primary);font:14px/1.65 system-ui;box-sizing:border-box}
      .tdocs *{box-sizing:border-box}.tdocs h1{font-size:24px;margin:0}.tdocs h2{font-size:17px;margin:0 0 12px}.tdocs p{margin:6px 0}.tdocs .muted{color:var(--dsw-alias-label-tertiary)}
      .tdocs header{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:28px}.tdocs .body{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:28px}
      .tdocs .card{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;padding:22px;margin-bottom:18px}.tdocs .status{border-left:4px solid var(--dsw-alias-state-business-primary,#48766c)}
      .tdocs button,.tdocs input,.tdocs textarea,.tdocs .button{font:inherit;color:inherit;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);padding:8px 12px;text-decoration:none}
      .tdocs button,.tdocs .button{cursor:pointer;display:inline-block}.tdocs button:disabled{opacity:.5;cursor:default}.tdocs input:not([type=checkbox]),.tdocs textarea{width:100%}.tdocs textarea{min-height:78px}
      .tdocs button:focus-visible,.tdocs a:focus-visible,.tdocs input:focus-visible,.tdocs textarea:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#527fc4);outline-offset:2px}
      .tdocs .primary{background:var(--dsw-alias-state-business-primary,#48766c);color:#fff}.tdocs .tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.tdocs label{display:block;margin:12px 0 5px}
      .tdocs .error{padding:12px;margin-bottom:16px;color:var(--dsw-alias-state-error-primary,#a22929);background:var(--dsw-alias-interactive-bg-hover);border-radius:8px}.tdocs pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto;font:13px/1.75 system-ui;margin:12px 0}
      .tdocs details{margin-top:18px}.tdocs summary{cursor:pointer}.tdocs small{font-size:12px}.tdocs .success{color:var(--dsw-alias-state-success-primary,#397666)}
      @media(max-width:850px){.tdocs{padding:20px}.tdocs .body{grid-template-columns:1fr}.tdocs header{flex-direction:column}}
    `;
    const api = async (action, args = {}, signal) => {
      const response = await fetch('/api/tencent-docs', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...args }), signal });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '腾讯文档操作失败'); return data;
    };
    const resultText = result => (result?.content || []).filter(item => item.type === 'text').map(item => { try { return JSON.stringify(JSON.parse(item.text), null, 2); } catch { return item.text; } }).join('\n') || JSON.stringify(result?.structuredContent || {}, null, 2);
    const resultData = result => { for (const item of result?.content || []) if (item.type === 'text') { try { return JSON.parse(item.text); } catch {} } return result?.structuredContent || null; };
    const resultRows = result => { const value = resultData(result); if (!value) return []; for (const key of ['spaces', 'children', 'files', 'items', 'results']) if (Array.isArray(value[key])) return value[key]; return Array.isArray(value.data?.files) ? value.data.files : []; };
    function Panel() {
      const [status, setStatus] = React.useState(null), [busy, setBusy] = React.useState(''), [error, setError] = React.useState('');
      const [query, setQuery] = React.useState(''), [fileId, setFileId] = React.useState(''), [token, setToken] = React.useState(''), [result, setResult] = React.useState(null), [advanced, setAdvanced] = React.useState('{}');
      const controllers = React.useRef(new Set()), pending = React.useRef(false);
      React.useEffect(() => { const controller = new AbortController(); api('status', {}, controller.signal).then(setStatus).catch(error => { if (error.name !== 'AbortError') setError(error.message); }); return () => { controller.abort(); for (const item of controllers.current) item.abort(); }; }, []);
      const run = async (label, action, args = {}) => {
        if (pending.current) return; pending.current = true; setBusy(label); setError(''); const controller = new AbortController(); controllers.current.add(controller);
        try { const data = await api(action, args, controller.signal); if (data.result) setResult(data.result); setStatus(await api('status', {}, controller.signal)); if (action === 'token') setToken(''); }
        catch (error) { if (error.name !== 'AbortError') setError(error.message); }
        finally { pending.current = false; controllers.current.delete(controller); setBusy(''); }
      };
      const label = !status?.authorized ? '尚未登录' : status?.verified?.level === 'document-read' ? '文档读取已验证' : status?.verified?.level === 'space-access' ? '目录访问已验证' : '已授权 · 等待验证文档权限';
      const verify = () => { try { const args = JSON.parse(advanced); if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(); void run('验证中', 'verify', { arguments: args }); } catch { setError('目录参数需要有效的 JSON 对象'); } };
      return h('div', { className: 'tdocs' },
        h('header', null, h('div', null, h('h1', null, '腾讯文档'), h('p', { className: 'muted' }, '用你的微信或 QQ 账号授权，搜索资料并交给 DSH 继续处理。')), h('button', { disabled: !!busy, onClick: () => run('刷新状态', 'status') }, '刷新状态')),
        (error || status?.error) && h('div', { className: 'error', role: 'alert' }, error || status.error),
        h('div', { className: 'body' },
          h('aside', null,
            h('section', { className: 'card status' }, h('h2', null, label), status?.identity?.nick && h('p', null, '已验证账号：' + status.identity.nick), h('p', { className: 'muted' }, status?.verified ? '上次验证：' + new Date(status.verified.at).toLocaleString() : '完成扫码授权后，点击验证连接；读取一份文档后再确认可用。'),
              h('div', { className: 'tools' }, h('button', { className: 'primary', disabled: !!busy, onClick: () => run('准备登录', 'login') }, status?.authorized ? '重新登录' : '登录腾讯文档'), status?.authorized && h('button', { disabled: !!busy, onClick: () => run('退出登录', 'logout') }, '退出登录')),
              status?.login && h('div', { style: { marginTop: 16 } }, h('a', { className: 'button primary', href: status.login.url, target: '_blank', rel: 'noreferrer' }, '打开腾讯授权页面'), h('p', { className: 'muted' }, '在浏览器完成扫码与授权后，回到这里刷新状态。授权请求十分钟内有效。'))),
            h('section', { className: 'card' }, h('h2', null, 'AI 使用权限'), h('label', null, h('input', { type: 'checkbox', checked: !!status?.allowWrite, disabled: !!busy || !status?.authorized, onChange: event => run('保存权限', 'allowWrite', { enabled: event.target.checked }) }), ' 允许 AI 创建或修改腾讯文档'), h('p', { className: 'muted' }, '默认只读取。开启后，AI 先生成修改清单；由你确认后才写入。'),
              h('details', null, h('summary', null, '使用个人 Token 连接'), h('p', { className: 'muted' }, '扫码授权不可用时，可从腾讯官方管理页取得个人 Token，并只在这里输入。'), h('a', { href: 'https://docs.qq.com/open/auth/mcp.html', target: '_blank', rel: 'noreferrer' }, '打开腾讯官方 Token 管理页'), h('input', { type: 'password', 'aria-label': '腾讯文档个人 Token', autoComplete: 'off', value: token, onChange: event => setToken(event.target.value) }), h('button', { disabled: !!busy || !token.trim(), style: { marginTop: 8 }, onClick: () => run('保存授权', 'token', { token }) }, '保存并等待验证')))),
          h('main', null,
            h('section', { className: 'card' }, h('h2', null, '验证与查找资料'), h('div', { className: 'tools' }, h('button', { className: 'primary', disabled: !!busy || !status?.authorized, onClick: verify }, busy === '验证中' ? busy : '验证连接')),
              h('details', null, h('summary', null, '目录查询参数'), h('textarea', { 'aria-label': '目录查询参数', value: advanced, onChange: event => setAdvanced(event.target.value) })),
              h('label', { htmlFor: 'td-search' }, '搜索文档'), h('input', { id: 'td-search', value: query, placeholder: '输入文档标题或关键词', onChange: event => setQuery(event.target.value) }), h('button', { disabled: !!busy || !status?.authorized || !query.trim(), style: { marginTop: 8 }, onClick: () => run('搜索中', 'search', { query }) }, '搜索'),
              h('label', { htmlFor: 'td-file' }, '读取文档'), h('input', { id: 'td-file', value: fileId, placeholder: '粘贴腾讯文档链接或 file_id', onChange: event => setFileId(event.target.value) }), h('button', { disabled: !!busy || !status?.authorized || !fileId.trim(), style: { marginTop: 8 }, onClick: () => run('读取中', 'read', { fileId: fileId.trim() }) }, '读取并验证权限')),
            h('section', { className: 'card' }, h('h2', null, '文档内容与查询结果'), resultRows(result).map((row, i) => h('div', { key: i, style: { padding: '12px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' } }, h('strong', null, row.title || row.name || row.file_name || '资料'), h('div', { className: 'tools' }, row.space_id ? h('button', { disabled: !!busy, onClick: () => run('读取空间', 'browse', { spaceId: row.space_id }) }, '打开空间') : (row.file_id || row.node_id || row.id) && h('button', { disabled: !!busy, onClick: () => { const id = String(row.file_id || row.node_id || row.id); setFileId(id); run('读取中', 'read', { fileId: id }); } }, '读取文档')))), result ? h('details', { open: !resultRows(result).length }, h('summary', null, '查看正文与详细结果'), h('pre', null, resultText(result))) : h('p', { className: 'muted' }, '登录成功后，在这里查看你的目录和文档。AI 会话可使用同一授权读取资料。'), status?.verified?.level === 'document-read' && h('p', { className: 'success' }, '已通过实际文档读取验证。')),
            h('section', { className: 'card' }, h('h2', null, '修改清单'), h('p', { className: 'muted' }, '在 AI 会话中提出创建或修改要求。建议会先到这里，确认后才写入腾讯文档。'), !(status?.commands || []).length && h('p', null, '还没有待确认的修改。'), (status?.commands || []).map(command => h('div', { key: command.id, style: { borderTop: '1px solid var(--dsw-alias-border-l2)', marginTop: 16, paddingTop: 12 } }, h('strong', null, ({ pending: '等待确认', executing: '执行中', completed: '已完成', rejected: '已忽略', 'outcome-unknown': '结果待核对', 'account-changed': '授权已变化' })[command.state]), h('p', { className: 'muted' }, command.tool + (command.fileId ? ' · 文档 ' + command.fileId : ' · 新建操作')), h('details', null, h('summary', null, '查看具体修改内容'), h('pre', null, JSON.stringify(command.arguments, null, 2))), command.before && h('details', null, h('summary', null, '查看修改前正文'), h('pre', null, resultText(command.before))), command.state === 'pending' && h('div', { className: 'tools' }, h('button', { className: 'primary', disabled: !!busy || !status?.allowWrite, onClick: () => run('确认修改', 'approve', { id: command.id }) }, '确认写入腾讯文档'), h('button', { disabled: !!busy, onClick: () => run('忽略修改', 'reject', { id: command.id }) }, '忽略')), command.state === 'outcome-unknown' && h('p', { className: 'muted' }, '请打开腾讯文档核对结果，再决定是否提出新修改。')))))));
    }
    function apply(ctx) {
      ctx.effect(() => { const style = document.createElement('style'); style.textContent = CSS; style.dataset.plugin = '@local/dsh-tencent-docs'; document.head.appendChild(style); return () => style.remove(); });
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'tencent-docs' }, Panel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'tencent-docs', order: 33, label: '腾讯文档' }, () => h('span', { 'aria-hidden': true }, '文')));
      ctx.slots.inject('plugins.item', () => ctx.slots.register({ name: 'plugins.item', id: 'tencent-docs', order: 33, label: '腾讯文档' }, props => props.view === 'summary' ? h('p', null, '扫码授权、真实文档权限验证与 AI 文档操作。') : h(Panel)));
    }
    return { inject: ['slots'], apply };
  }
});
