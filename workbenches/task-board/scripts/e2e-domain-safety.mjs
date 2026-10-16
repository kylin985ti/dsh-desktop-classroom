/** Browser file safety workflows backed by real files in a test-owned directory only. */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runSuite, isolatedConfig, makeTask } from './e2e-redesign.mjs'
const config = isolatedConfig()
const parent = await realpath(tmpdir())
const fixture = await mkdtemp(join(parent, '.domain-ui-fixture-'))
const intended = await realpath(fixture)
const file = name => join(fixture, name)
const original = '# 原始笔记\n\n磁盘原内容，不允许被同名新建覆盖。\n\n[不安全链接](javascript:window.__unsafeMarkdownExecuted=true)\n'
await writeFile(file('notes.md'), original)
await writeFile(file('other.md'), '# 另一份笔记\n\n另一份内容。\n')
await writeFile(file('main.ts'), 'const initial = 1\n')
try {
  await runSuite('domain-safety', async ({ page, root, reset, openDetail, overview, check, expectHttpFailure, screenshot, paint, state, openCreation }) => {
    const task = makeTask('domain-root', '工作域文件安全回归', 'doing', null, { domain: { path:fixture,kind:'md',workspaceId:null } })
    const child = makeTask('domain-child', '子任务工作域', 'todo', task.id, { domain: { path:fixture,kind:'md',workspaceId:null } })
    await reset([task, child]); await openDetail(task)
    const notes = root.locator('.tbFileBtn', {hasText:'notes.md'})
    await notes.waitFor({state:'visible'}); await notes.click()
    await root.locator('.tbDoc').getByRole('heading',{name:'原始笔记',exact:true}).waitFor()
    check('已登记的隔离工作域通过真实服务端读取磁盘内容', (await root.locator('.tbDoc').textContent()).includes('磁盘原内容'))
    check('Markdown 的脚本协议不会渲染成可执行链接',await root.locator('.tbDoc a[href^="javascript:"]').count()===0
      &&await page.evaluate(()=>window.__unsafeMarkdownExecuted===undefined))

    await root.getByRole('button',{name:'新建文件…',exact:true}).click()
    await root.getByLabel('新建文件名',{exact:true}).fill('notes.md')
    expectHttpFailure('/api/dsh-task-board/file',409)
    await root.locator('.tbDomain').getByRole('button',{name:'创建',exact:true}).click()
    await root.locator('.tbDomain').getByRole('alert').waitFor()
    check('同名新建明确提示失败并保留原文件字节', (await readFile(file('notes.md'),'utf8'))===original
      && (await root.locator('.tbDomain').getByRole('alert').textContent()).includes('已存在'))
    await root.locator('.tbDomain').getByRole('button',{name:'取消',exact:true}).click()

    await root.getByRole('button',{name:'编辑',exact:true}).click()
    const draft = '# 未保存的修改\n\n取消导航后必须仍在编辑器里。\n'
    await root.getByLabel('编辑 notes.md',{exact:true}).fill(draft)
    await root.getByRole('button',{name:'AI 会话',exact:true}).click()
    await root.locator('.tbChat').waitFor({state:'visible'})
    await root.getByRole('button',{name:'收起会话',exact:true}).click()
    check('打开/关闭原生会话抽屉不会重置文件草稿',await root.getByLabel('编辑 notes.md',{exact:true}).inputValue()===draft)
    await root.getByRole('button',{name:'← 总览',exact:true}).click()
    const dirtyDialog=root.getByRole('dialog',{name:'未保存的文件修改',exact:true})
    await dirtyDialog.waitFor({state:'visible'})
    await dirtyDialog.getByRole('button',{name:'取消',exact:true}).click()
    await dirtyDialog.waitFor({state:'hidden'})
    check('取消导航保留当前文件草稿且不写盘',await root.getByLabel('编辑 notes.md',{exact:true}).inputValue()===draft
      &&(await readFile(file('notes.md'),'utf8'))===original)

    await root.locator('.tbFileBtn',{hasText:'other.md'}).click()
    await dirtyDialog.waitFor({state:'visible'})
    await dirtyDialog.getByRole('button',{name:'取消',exact:true}).click()
    check('切换文件也必须处理未保存修改，取消不丢草稿',await root.getByLabel('编辑 notes.md',{exact:true}).inputValue()===draft)

    await root.getByRole('button',{name:'← 总览',exact:true}).click()
    await dirtyDialog.waitFor({state:'visible'})
    await dirtyDialog.getByRole('button',{name:'保存并继续',exact:true}).click()
    await root.locator('.tbGroups').waitFor({state:'visible'})
    check('保存并继续确实把完整文本写入隔离磁盘，再返回总览',(await readFile(file('notes.md'),'utf8'))===draft)
    await openDetail(task);await root.locator('.tbFileBtn',{hasText:'notes.md'}).click()
    await root.locator('.tbDoc').getByRole('heading',{name:'未保存的修改',exact:true}).waitFor()
    await root.getByRole('button',{name:'编辑',exact:true}).click()
    await root.getByLabel('编辑 notes.md',{exact:true}).fill('# 明确放弃的草稿\n')
    await root.getByRole('button',{name:'← 总览',exact:true}).click()
    await dirtyDialog.waitFor({state:'visible'})
    await dirtyDialog.getByRole('button',{name:'放弃修改',exact:true}).click()
    await root.locator('.tbGroups').waitFor({state:'visible'})
    check('只有明确放弃才能丢弃草稿，磁盘已保存内容不变',(await readFile(file('notes.md'),'utf8'))===draft)

    await openDetail(task);await root.locator('.tbFileBtn',{hasText:'notes.md'}).click()
    await root.locator('.tbDoc').waitFor();await root.getByRole('button',{name:'编辑',exact:true}).click()
    const submitted='# 提交快照\n\n正在保存的文本。\n', newer='# 更新的草稿\n\n保存等待期间继续键入。\n'
    await root.getByLabel('编辑 notes.md',{exact:true}).fill(submitted)
    let releaseSave, sawSaveResolve
    const saveGate = new Promise(resolve=>{releaseSave=resolve}), sawSave=new Promise(resolve=>{sawSaveResolve=resolve})
    const holdSave=async route=>{
      const request=route.request()
      if(request.method()!=='POST'||request.postDataJSON().path!==file('notes.md'))return route.fallback()
      assert.equal(request.postDataJSON().content,submitted)
      sawSaveResolve();await saveGate;await route.continue()
    }
    await page.route('**/api/dsh-task-board/file',holdSave,{times:1})
    const savedResponse = page.waitForResponse(response=>new URL(response.url()).pathname==='/api/dsh-task-board/file'&&response.request().method()==='POST')
    try {
      await root.getByRole('button',{name:'保存',exact:true}).click();await sawSave
      await root.getByLabel('编辑 notes.md',{exact:true}).fill(newer)
    } finally {releaseSave()}
    await savedResponse
    await root.getByRole('button',{name:'保存',exact:true}).waitFor({state:'visible'});await paint()
    check('异步保存只确认提交快照，不把之后输入误报已保存',(await readFile(file('notes.md'),'utf8'))===submitted
      &&await root.getByLabel('编辑 notes.md',{exact:true}).inputValue()===newer
      &&(await root.locator('.tbFileContent').textContent()).includes('未保存'))
    await root.getByRole('button',{name:'保存',exact:true}).click()
    await root.locator('.tbDoc').getByRole('heading',{name:'更新的草稿',exact:true}).waitFor()
    check('第二次保存才把后续草稿完整写入磁盘',(await readFile(file('notes.md'),'utf8'))===newer)

    let releaseOldRead, oldReadStarted, oldReadFinished
    const oldGate=new Promise(resolve=>{releaseOldRead=resolve}), started=new Promise(resolve=>{oldReadStarted=resolve}), finished=new Promise(resolve=>{oldReadFinished=resolve})
    const oldRoute=async route=>{
      const url=new URL(route.request().url())
      if(route.request().method()!=='GET'||url.searchParams.get('path')!==file('notes.md'))return route.fallback()
      const response=await route.fetch();oldReadStarted();await oldGate;await route.fulfill({response});oldReadFinished()
    }
    await page.route('**/api/dsh-task-board/file?*',oldRoute,{times:1})
    try{
      await notes.click();await started
      await root.locator('.tbFileBtn',{hasText:'other.md'}).click()
      await root.locator('.tbDoc').getByRole('heading',{name:'另一份笔记',exact:true}).waitFor()
    }finally{releaseOldRead()}
    await finished;await page.unroute('**/api/dsh-task-board/file?*',oldRoute);await paint()
    check('较早的文件读取响应不能覆盖后选中的文件',(await root.locator('.tbDoc').textContent()).includes('另一份内容')
      &&await root.locator('.tbFileBtn[aria-current="true"]').textContent().then(text=>text.includes('other.md')))

    await root.locator('.tbFileBtn',{hasText:'main.ts'}).click();await root.locator('.tbCodeBox').waitFor()
    await root.getByRole('button',{name:'编辑',exact:true}).click()
    const code='const saved = 42\n'
    await root.getByLabel('编辑 main.ts',{exact:true}).fill(code)
    await root.getByRole('button',{name:'保存',exact:true}).click();await root.locator('.tbCodeBox').waitFor()
    check('代码编辑也通过真实服务端保存精确字节',(await readFile(file('main.ts'),'utf8'))===code)
    await screenshot('real-file-editor')
    await overview()
    const beforeFailedCreation = await state()
    expectHttpFailure('/api/dsh-task-board/state/write',503)
    await page.route('**/api/dsh-task-board/state/write',route=>route.fulfill({status:503,json:{error:'故意失败的隔离创建请求'}}),{times:1})
    const creation = await openCreation()
    await creation.getByLabel('新任务标题',{exact:true}).fill('不会丢失的创建草稿')
    await creation.getByRole('button',{name:'创建',exact:true}).click()
    await creation.getByRole('alert').waitFor()
    check('失败的创建在对话框内明确提示，并保留标题草稿',
      (await creation.getByRole('alert').textContent()).includes('故意失败')
      &&await creation.getByLabel('新任务标题',{exact:true}).inputValue()==='不会丢失的创建草稿')
    await creation.getByRole('button',{name:'取消',exact:true}).click()
    check('失败创建/取消不覆盖磁盘上的既有任务',JSON.stringify(await state())===JSON.stringify(beforeFailedCreation))
    check('文件操作不改变原任务归属或根任务数量',await root.locator('.tbGroupCount').allTextContents().then(counts=>counts.reduce((sum,value)=>sum+Number(value),0)===1))
  })
} finally {
  if(resolve(fixture)!==intended||!intended.startsWith(parent+'/.domain-ui-fixture-'))throw Error('Refusing unexpected fixture cleanup')
  await rm(fixture,{recursive:true})
}
