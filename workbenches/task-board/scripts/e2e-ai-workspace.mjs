import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { runSuite, makeTask, isolatedConfig } from './e2e-redesign.mjs'
const config = isolatedConfig()
if (!config.artifacts) throw new Error('Owned artifact directory is required for workspace fixtures')
const fixture = await mkdtemp(join(config.artifacts, '.workspace-fixture-'))
const domain = join(fixture, 'domain'), other = join(fixture, 'other')
await Promise.all([mkdir(join(domain, 'docs'), { recursive: true }), mkdir(join(domain, 'src'), { recursive: true }), mkdir(other)])
const sources = {
  'README.md': '# 工作域目标\n整体推进：先验证，再交付。\n<script>window.__workspaceExecuted=true</script>\n',
  'docs/plan.md': '# 里程碑正文专用标记\n需要 3 天完成原型验证。\n',
  'src/main.js': 'export const evidence = "源代码标记"\n',
  '.env': 'HIDDEN_SECRET=never-send\n',
  'credentials.json': '{"token":"NEVER_SEND_CREDENTIAL"}\n',
}
await Promise.all(Object.entries(sources).map(([name, content]) => writeFile(join(domain, name), content)))
await writeFile(join(other, 'outside.md'), 'OUTSIDE_DOMAIN_NEVER_READ\n')
await symlink(join(other, 'outside.md'), join(domain, 'escape.md'))
try {
  await runSuite('ai-workspace', async ({ page, root, reset, state, check, screenshot, paint }) => {
    await reset([
      makeTask('domain-root', '工作域扫描验收项目', 'doing', null, { domain: { path: domain, files: [] }, planMode: 'auto' }),
      makeTask('domain-child', '工作域子任务', 'todo', 'domain-root', { planStartDate: '2030-02-10', planEndDate: '2030-02-12' }),
      makeTask('other-root', '另一工作域项目', 'todo', null, { domain: { path: other, files: [] } }),
    ])
    const before = await state(), reads = [], writes = [], sends = []
    page.on('request', request => {
      const url = new URL(request.url())
      if (request.method() === 'GET' && ['/api/dsh-task-board/files', '/api/dsh-task-board/file'].includes(url.pathname)) reads.push(url)
      if (request.method() === 'POST' && url.pathname.startsWith('/api/dsh-task-board/')) writes.push(url.pathname)
      if (/\/messages\/.*send|\/chat\/completions|\/responses$/.test(url.pathname)) sends.push(url.pathname)
    })
    await root.getByRole('navigation', { name: '任务栏视图', exact: true }).getByRole('button', { name: '甘特图', exact: true }).click()
    await root.getByRole('button', { name: 'AI辅助排期', exact: true }).click()
    const panel = root.getByRole('dialog', { name: 'AI 辅助排期', exact: true })
    const optIn = panel.getByRole('checkbox', { name: '读取工作域辅助排期（可选）', exact: true })
    const promptBox = panel.getByLabel('本次 AI 排期上下文与提示词', { exact: true })
    const requestIdFrom = text => JSON.parse(text.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId
    check('Opening AI panel defaults workspace scanning off and performs no file reads', !await optIn.isChecked() && reads.length === 0)
    await panel.getByRole('button', { name: '预览本次上下文', exact: true }).click()
    check('Default task-only prompt excludes bound path and all filesystem context', !(await promptBox.inputValue()).includes('## 工作域资料') && !(await promptBox.inputValue()).includes(domain) && reads.length === 0)
    await optIn.check(); await paint()
    check('Opt-in alone reveals scope and limits without scanning automatically', reads.length === 0 && await panel.getByRole('combobox', { name: '扫描工作域', exact: true }).inputValue() === domain)
    await panel.getByRole('button', { name: '预览本次上下文', exact: true }).click()
    check('Preparing a workspace prompt before explicit scan is blocked without implicit reads', (await panel.locator('.tbAIIssues').innerText()).includes('主动扫描') && reads.length === 0)
    await panel.getByRole('button', { name: '扫描工作域', exact: true }).click()
    await panel.locator('.tbAIWorkspaceResult').waitFor(); await paint()
    check('Explicit scan uses real registered-domain list/read APIs and displays exact coverage', reads.filter(url => url.pathname.endsWith('/files')).length === 1 && reads.filter(url => url.pathname.endsWith('/file')).length === 3
      && (await panel.locator('.tbAIWorkspaceResult').innerText()).includes('读取 3 篇正文'))
    check('Hidden credentials and symlink escape are never read for the AI scan', reads.every(url => !/credentials|\.env|escape|outside/.test(url.searchParams.get('path'))) && !await panel.locator('.tbAIFileIndex').innerText().then(text => /credentials|\.env|escape/.test(text)))
    await panel.getByText('检查文件索引与已读取正文', { exact: true }).click()
    await panel.locator('.tbAIWorkspaceDocument').filter({ hasText: 'README.md' }).locator('summary').click()
    check('Scanned content is previewed as inert text, without executing embedded markup', (await panel.locator('.tbAIWorkspaceDocument pre').first().innerText()).includes('<script>') && await page.evaluate(() => window.__workspaceExecuted === undefined))
    const planDoc = panel.locator('.tbAIWorkspaceDocument').filter({ hasText: 'docs/plan.md' })
    await planDoc.locator('summary').click(); await planDoc.getByRole('checkbox', { name: '加入正文：docs/plan.md', exact: true }).uncheck()
    await panel.getByRole('button', { name: '预览本次上下文', exact: true }).click()
    const prompt = await promptBox.inputValue()
    check('User can exclude individual document bodies while retaining inspected relative index', [...prompt.matchAll(/^相对文件名：/gm)].length === 2 && prompt.includes('docs/plan.md（') && !prompt.includes('里程碑正文专用标记'))
    check('Prepared workspace prompt includes selected evidence, no absolute root, and explicit incomplete coverage', prompt.includes('整体推进') && prompt.includes('源代码标记') && !prompt.includes(domain) && prompt.includes('扫描不能证明全部文件已审阅'))
    check('Workspace bodies keep real line breaks instead of escaped JSON strings', prompt.includes('# 工作域目标\n整体推进') && !prompt.includes('# 工作域目标\\n整体推进'))
    const proposal = { version: 1, requestId: requestIdFrom(prompt), changes: [], assumptions: [], conflicts: [], workspaceSuggestions: ['依据 README.md 先完成验证，再安排交付。'] }
    const readableReply = `## 排期建议\n本次没有日期变更。\n\n## 工作域建议\n依据 README.md 先完成验证，再安排交付。\n\n## 工作台导入数据\n\n\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``
    await panel.getByLabel('本次提案 JSON（仅作为数据校验，不执行内容）', { exact: true }).fill(readableReply)
    await panel.getByRole('button', { name: '校验并预览 JSON 提案', exact: true }).click()
    check('Workspace advice imports as read-only suggestions without creating tasks or editing files', (await panel.innerText()).includes('依据 README.md 先完成验证') && writes.length === 0 && isDeepStrictEqual(await state(), before))
    await screenshot('workspace-preview-light')
    await panel.getByLabel('排期范围', { exact: true }).selectOption('branch:other-root'); await paint()
    check('Changing task scope clears previous workspace content and requires a fresh explicit scan', await panel.locator('.tbAIWorkspaceResult').count() === 0 && await promptBox.count() === 0 && await panel.getByRole('combobox', { name: '扫描工作域', exact: true }).inputValue() === other)
    const readCount = reads.length
    await panel.getByLabel('排期范围', { exact: true }).selectOption('branch:domain-root'); await paint()
    check('Returning to a prior scope does not reuse private scanned content or trigger background reads', await panel.locator('.tbAIWorkspaceResult').count() === 0 && reads.length === readCount)
    let releaseList, listStarted
    const gate = new Promise(resolve => { releaseList = resolve }), started = new Promise(resolve => { listStarted = resolve })
    await page.route('**/api/dsh-task-board/files?*', async route => { listStarted(); await gate; try { await route.continue() } catch { /* Aborted by explicit cancel. */ } }, { times: 1 })
    await panel.getByRole('button', { name: '扫描工作域', exact: true }).click(); await started
    await panel.getByRole('button', { name: '取消扫描', exact: true }).click(); releaseList()
    await panel.getByText('已取消扫描，没有加入 AI 上下文。', { exact: true }).waitFor()
    check('Cancel aborts in-flight scan and prevents late results becoming AI context', await panel.locator('.tbAIWorkspaceResult').count() === 0 && await promptBox.count() === 0)
    await optIn.uncheck(); await panel.getByRole('button', { name: '预览本次上下文', exact: true }).click()
    check('Turning workspace option off returns to task-only prompt with no retained file bodies', !(await promptBox.inputValue()).includes('## 工作域资料') && !(await promptBox.inputValue()).includes('整体推进'))
    await page.emulateMedia({ colorScheme: 'dark' }); await screenshot('workspace-default-dark')
    await page.setViewportSize({ width: 680, height: 950 }); await paint(); await screenshot('workspace-narrow')
    check('All scan, review and advice steps issue no AI sends, task writes or file writes', sends.length === 0 && writes.length === 0 && isDeepStrictEqual(await state(), before))
    check('Fixture bytes remain unchanged after recursive reads and preview', (await Promise.all(Object.entries(sources).map(async ([name, content]) => (await readFile(join(domain, name), 'utf8')) === content))).every(Boolean))
  })
} finally { await rm(fixture, { recursive: true, force: true }) }
