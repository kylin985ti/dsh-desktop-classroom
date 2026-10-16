import { pickWorkspaceDirectory } from './native-directory.js'

/** Stable file pane: drafts survive board updates, and navigation never silently discards them. */
export function createDomainPanel(React, { renderMarkdown, highlightCode }) {
  const h = React.createElement
  return function DomainPanel({ service, task, commit, Icon, disabled, registerGuard, requestUnsaved }) {
    const [files, setFiles] = React.useState([]), [active, setActive] = React.useState(null)
    const [content, setContent] = React.useState(''), [baseline, setBaseline] = React.useState(''), [mode, setMode] = React.useState('read')
    const contentRef = React.useRef(''), baselineRef = React.useRef(''), activeRef = React.useRef(null)
    const [notice, setNotice] = React.useState(''), [ok, setOk] = React.useState(''), [operation, setOperation] = React.useState('')
    const operationRef = React.useRef(''), mounted = React.useRef(true), binding = React.useRef(false)
    const [path, setPath] = React.useState(task.domain?.path || ''), pathRef = React.useRef(path)
    pathRef.current = path
    const [naming, setNaming] = React.useState(null)
    const fileGeneration = React.useRef(0), folderGeneration = React.useRef(0)
    const setBusy = value => { operationRef.current = value; setOperation(value) }
    const setText = value => { contentRef.current = value; setContent(value) }
    const resetFile = () => {
      fileGeneration.current++
      activeRef.current = null; setActive(null); setText(''); baselineRef.current = ''; setBaseline(''); setMode('read'); setOk('')
    }
    const icon = name => h(Icon, { name })
    const request = async (url, options) => {
      const response = await fetch(url, { credentials: 'same-origin', ...options })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`)
      return data
    }
    React.useEffect(() => {
      mounted.current = true
      return () => { mounted.current = false; fileGeneration.current++; folderGeneration.current++ }
    }, [])
    React.useEffect(() => {
      if (!binding.current && (task.domain?.path || '') !== pathRef.current) {
        resetFile(); setPath(task.domain?.path || '')
      }
    }, [task.domain?.path])
    const refresh = async (root = pathRef.current) => {
      const ticket = ++folderGeneration.current
      if (!root) { setFiles([]); return }
      if (!operationRef.current) setBusy('listing')
      try {
        const data = await request(`/api/dsh-task-board/files?path=${encodeURIComponent(root)}`)
        if (!mounted.current || ticket !== folderGeneration.current || root !== pathRef.current) return
        setFiles(Array.isArray(data.files) ? data.files : []); setNotice('')
      } catch (problem) {
        if (mounted.current && ticket === folderGeneration.current) { setFiles([]); setNotice(problem.message) }
      } finally { if (mounted.current && ticket === folderGeneration.current && operationRef.current === 'listing') setBusy('') }
    }
    React.useEffect(() => { refresh(path); return () => { folderGeneration.current++ } }, [path])
    const writeFile = (file, text, create = false) => request('/api/dsh-task-board/file', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: file, content: text, ...(create ? { create: true } : {}) }),
    })
    const saveFile = async () => {
      const file = activeRef.current, submitted = contentRef.current
      if (!file || operationRef.current === 'saving') return false
      setBusy('saving'); setOk('')
      try {
        await writeFile(file.path, submitted)
        if (!mounted.current || activeRef.current?.path !== file.path) return false
        baselineRef.current = submitted; setBaseline(submitted); setNotice('')
        if (contentRef.current === submitted) { setMode('read'); setOk('已保存。') }
        else { setMode('edit'); setOk('已保存提交内容；仍有新的未保存修改。') }
        return contentRef.current === submitted
      } catch (problem) { if (mounted.current) setNotice(problem.message); return false }
      finally { if (mounted.current) setBusy('') }
    }
    const guard = async () => {
      if (['saving','binding','creating'].includes(operationRef.current)) { setNotice('操作正在进行，请完成后再切换。'); return false }
      if (!activeRef.current || contentRef.current === baselineRef.current) return true
      const choice = await requestUnsaved()
      if (choice === 'save') return saveFile()
      if (choice === 'discard') { setText(baselineRef.current); return true }
      return false
    }
    React.useEffect(() => registerGuard(guard), [registerGuard, content, baseline, operation, active])
    React.useEffect(() => {
      if (content === baseline) return
      const beforeUnload = event => { event.preventDefault(); event.returnValue = '' }
      window.addEventListener('beforeunload', beforeUnload)
      return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [content, baseline])

    const pickDomain = async () => {
      if (!await guard()) return
      setBusy('binding'); binding.current = true
      try {
        const selected = await pickWorkspaceDirectory(service)
        if (!selected || !mounted.current) return
        let workspaceId = null
        try { workspaceId = (await service.ctx.workspaces.create({ path: selected }))?.workspaceId || null } catch { /* existing workspace is still a valid domain */ }
        if (!mounted.current) return
        const success = await commit(list => list.map(item => item.id === task.id ? { ...item,
          domain: { path: selected, kind: item.domain?.kind === 'code' ? 'code' : 'md', workspaceId }, updatedAt: new Date().toISOString() } : item))
        if (!mounted.current) return
        if (success) {
          resetFile(); pathRef.current = selected; setPath(selected); setNotice(''); await refresh(selected)
        } else setNotice('绑定工作域保存失败，原绑定未改变。')
      } catch (problem) { if (mounted.current) setNotice(problem.message || '选择目录失败。') }
      finally { binding.current = false; if (mounted.current) setBusy('') }
    }
    const unbind = async () => {
      if (!await guard()) return
      setBusy('binding'); binding.current = true
      const success = await commit(list => list.map(item => item.id === task.id ? { ...item, domain: null, updatedAt: new Date().toISOString() } : item))
      if (mounted.current) {
        if (success) { resetFile(); pathRef.current = ''; setPath(''); setFiles([]) }
        else setNotice('解除绑定失败，原绑定仍保留。')
        binding.current = false; setBusy('')
      }
    }
    const openFile = async file => {
      if (!await guard()) return
      const ticket = ++fileGeneration.current, root = pathRef.current
      setBusy('reading'); setOk('')
      try {
        const data = await request(`/api/dsh-task-board/file?path=${encodeURIComponent(file.path)}`)
        if (!mounted.current || ticket !== fileGeneration.current || root !== pathRef.current) return
        activeRef.current = file; setActive(file)
        const text = typeof data.content === 'string' ? data.content : ''
        setText(text); baselineRef.current = text; setBaseline(text); setMode('read'); setNotice('')
      } catch (problem) { if (mounted.current && ticket === fileGeneration.current) setNotice(problem.message) }
      finally { if (mounted.current && ticket === fileGeneration.current) setBusy('') }
    }
    const createFile = async event => {
      event.preventDefault()
      const name = (naming || '').trim(), root = pathRef.current
      if (!name || !root) return
      if (/[\\/]/.test(name) || name === '.' || name === '..' || /^[A-Za-z]:/.test(name)) { setNotice('请输入当前工作域内的文件名，不包含路径或上级目录。'); return }
      if (!await guard()) return
      setBusy('creating')
      try {
        await writeFile(`${root.replace(/\/$/, '')}/${name}`, '', true)
        if (!mounted.current) return
        setNaming(null); setNotice(''); setOk('文件已创建。'); await refresh(root)
      } catch (problem) { if (mounted.current) setNotice(problem.message) }
      finally { if (mounted.current) setBusy('') }
    }
    const blockActions = disabled || ['saving','binding','creating'].includes(operation)
    const isCode = active ? !/\.(md|markdown)$/i.test(active.name) : false
    const dirty = content !== baseline
    return h('div', { className: 'tbCard tbDomain', 'data-domain-task': task.id },
      h('div', { className: 'tbDomainHeader' }, h('span', { className: 'tbFolderTile' }, icon('folder')),
        h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { className: 'tbDomainName' }, path ? path.split(/[\\/]/).filter(Boolean).pop() : '工作域未绑定'),
          h('div', { className: 'tbDomainPath', title: path }, path || '由你选择文件夹后开始'))),
      notice ? h('div', { className: 'tbErr', role: 'alert' }, notice) : null,
      ok ? h('div', { className: 'tbOk', role: 'status' }, ok) : null,
      h('div', { className: 'tbDomainControls' },
        h('button', { className: 'tbBtn', type: 'button', disabled: blockActions, onClick: pickDomain }, icon('folder'), path ? '更换文件夹…' : '选择文件夹…'),
        path ? h('button', { className: 'tbBtn', type: 'button', disabled: blockActions, onClick: () => setNaming('') }, icon('plus'), '新建文件…') : null,
        path ? h('button', { className: 'tbBtn tbGhost', type: 'button', disabled: blockActions, onClick: () => refresh() }, '刷新') : null,
        path ? h('button', { className: 'tbBtn tbGhost', type: 'button', disabled: blockActions, onClick: unbind }, '解除绑定') : null),
      naming !== null ? h('form', { className: 'tbWrap', onSubmit: createFile },
        h('input', { className: 'tbInput', style: { flex: '1 1 120px' }, autoFocus: true, value: naming, disabled: blockActions,
          'aria-label': '新建文件名', placeholder: 'notes.md 或 main.ts', onChange: event => setNaming(event.target.value) }),
        h('button', { type: 'submit', className: 'tbBtn tbBtnPrimary', disabled: blockActions || !naming.trim() }, '创建'),
        h('button', { type: 'button', className: 'tbBtn tbGhost', disabled: blockActions, onClick: () => setNaming(null) }, '取消')) : null,
      !path ? h('p', { className: 'tbHelp' }, '选择一个文件夹作为这个任务的工作域，就能阅读、编辑 Markdown 和代码。取消选择不会创建目录或改变绑定。') : null,
      files.length ? h('div', { className: 'tbFileList', 'aria-label': '工作域文件' }, files.map(file => h('button', {
        key: file.path, className: 'tbFileBtn', type: 'button', disabled: blockActions, 'aria-current': active?.path === file.path,
        title: file.path, onClick: () => openFile(file),
      }, icon('file'), h('span', { className: 'tbName' }, file.relative || file.name)))) : path && !operation ? h('span', { className: 'tbHelp' }, '这里还没有 Markdown 或代码文件，可以用「新建文件…」创建。') : null,
      operation === 'reading' || operation === 'listing' ? h('span', { className: 'tbHelp', role: 'status' }, '正在读取…') : null,
      active ? h('section', { className: 'tbFileContent' },
        h('div', { className: 'tbTabs' }, h('span', { className: 'tbSub tbName', style: { flex: 1 } }, `${active.name}${dirty ? ' · 未保存' : ''}`),
          h('button', { className: 'tbTab', type: 'button', 'aria-selected': mode === 'read', onClick: () => setMode('read') }, isCode ? '查看' : '阅读'),
          h('button', { className: 'tbTab', type: 'button', 'aria-selected': mode === 'edit', onClick: () => setMode('edit') }, '编辑'),
          mode === 'edit' || dirty ? h('button', { className: 'tbBtn tbBtnPrimary', type: 'button', disabled: blockActions, onClick: saveFile }, operation === 'saving' ? '保存中…' : '保存') : null),
        mode === 'edit' ? h('textarea', { className: 'tbEditor', value: content, 'aria-label': `编辑 ${active.name}`, spellCheck: false, onChange: event => setText(event.target.value) })
          : isCode ? h('pre', { className: 'tbCodeBox', dangerouslySetInnerHTML: { __html: highlightCode(content) } })
            : h('div', { className: 'tbDoc', dangerouslySetInnerHTML: { __html: renderMarkdown(content) } }),
      ) : null,
    )
  }
}
