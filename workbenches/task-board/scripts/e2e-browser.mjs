/**
 * Host-loader, real task persistence, detail navigation, responsive layout and
 * preserved DomainPanel controls. Directory-picker cancellation and file-editor
 * transport are explicitly mocked; task state uses the isolated server's real API.
 *
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-browser.mjs
 * Optional screenshots/reports: DSH_E2E_ARTIFACTS=/absolute/output/directory
 */
import { ROOT_CARDS, runSuite } from './e2e-redesign.mjs'

await runSuite('browser', async ({
  page, root, frame, rootCard, childRow, check, enter, reset, reload, openWorkbench,
  create, addChild, openDetail, overview, state, counts, paint, overflow, boardLayout, screenshot, config,
}) => {
  // Actual packaged-host seam (not File System Access or input.webkitdirectory):
  // UiWorkspaceService.pickDirectory -> remote.directoryPicker.pick -> Connection
  // POST /api/directoryPicker/pick. A documented user cancellation is a successful
  // null result, inside a correlated server-response envelope. Mock ONLY that
  // carrier boundary so no operating-system picker ever reaches the Host.
  const pickerEndpoint = `${config.base}/api/directoryPicker/pick`
  const pickerRequests = []
  await page.route(pickerEndpoint, async (route) => {
    const request = route.request()
    let message
    try {
      message = request.postDataJSON()
    } catch {
      message = null
    }
    const valid = request.method() === 'POST' && message?.type === 'client-request'
      && message.method === 'directoryPicker/pick' && typeof message.rpcId === 'string' && message.rpcId.length > 0
      && message.payload?.args !== null && typeof message.payload?.args === 'object'
      && !Array.isArray(message.payload.args) && Object.keys(message.payload.args).length === 0
    pickerRequests.push({ method: request.method(), message, valid })
    if (!valid) {
      return route.fulfill({ status: 400, json: { error: 'Unexpected directory-picker RPC contract' } })
    }
    await route.fulfill({
      json: { type: 'server-response', rpcId: message.rpcId, result: { ok: true, value: null } },
    })
  })
  await enter()
  const api = await page.evaluate(async () => (await fetch('/api/dsh-task-board/state')).status)
  check('Workbench state API is registered in the real host', api === 200, api)
  const bootGraph = await page.evaluate(() => Boolean(window.__DSH_BOOT__ && JSON.stringify(window.__DSH_BOOT__).includes('dsh-task-board')))
  check('Host boot graph includes dsh-task-board', bootGraph)
  await page.locator('.dshWbModeSwitch').first().click()
  const entry = page.locator('.dshWbModeMenu button, .dshWbModeMenu [role="menuitem"]', { hasText: '任务栏' }).first()
  await entry.waitFor({ state: 'visible' })
  check('Host mode switcher exposes the task-board entry', await page.locator('.dshWbSidebarSwitcher').first().isVisible() && await entry.isVisible())
  await screenshot('mode-switcher')
  await entry.click()
  await openWorkbench()
  await reset()

  const independent = await page.evaluate(() => {
    const root = document.querySelector('.dshWbCustomFrame .tbRoot')
    return {
      bodyHidden: document.querySelector('.dshWbBody')?.hasAttribute('hidden'),
      rootWidth: root?.getBoundingClientRect().width || 0,
      viewport: innerWidth,
      headerFirst: root?.firstElementChild?.tagName === 'HEADER',
    }
  })
  check('Custom frame hides split host body and owns the main content area', independent.bodyHidden === true && independent.rootWidth > independent.viewport * 0.6, independent)
  check('Semantic host header is the first task-board child', independent.headerFirst)
  check('Overview has five groups and one modal creation entry', await root.locator('.tbGroups > .tbGroup').count() === 5
    && await root.getByRole('button', { name: '新建任务', exact: true }).count() === 1
    && await root.getByLabel('新任务标题', { exact: true }).count() === 0)
  await screenshot('board-empty')

  const task = await create('浏览器端到端任务')
  check('Modal creation renders a real root task card', await rootCard(task.id).isVisible()
    && await rootCard(task.id).getByRole('button', { name: `打开任务：${task.title}`, exact: true }).isVisible())
  check('Created task is persisted by the actual server', (await state()).some((item) => item.id === task.id && item.title === task.title && item.parentId === null))
  await reload()
  check('Reload reopens the real workbench with the persisted task', await rootCard(task.id).isVisible() && await root.locator(ROOT_CARDS).count() === 1)

  await openDetail(task)
  check('Detail view renders editable task heading and the preserved DomainPanel', await root.getByLabel('任务标题', { exact: true }).inputValue() === task.title
    && await root.locator('.tbDetailGrid').count() === 1
    && await root.getByRole('button', { name: '选择文件夹…', exact: true }).isVisible())
  const child = await addChild(task, '子任务：浏览器验证')
  check('Detail inline form creates a child through the real server', child.parentId === task.id && await childRow(child.id).isVisible())
  await openDetail(child)
  check('Child detail has the correct task heading and parent navigation', await root.getByLabel('任务标题', { exact: true }).inputValue() === child.title
    && await root.getByRole('button', { name: '↑ 父级', exact: true }).isVisible())
  await root.getByRole('button', { name: '↑ 父级', exact: true }).click()
  await root.getByLabel('任务标题', { exact: true }).waitFor({ state: 'visible' })
  check('Parent navigation restores the actual parent, not just any detail view', await root.getByLabel('任务标题', { exact: true }).inputValue() === task.title)
  await screenshot('task-detail')
  await overview()
  const countAudit = await counts()
  check('All five group counts together count only roots, never children', JSON.stringify(countAudit) === JSON.stringify({ todo: 1, doing: 0, ongoing: 0, done: 0, dropped: 0 })
    && Object.values(countAudit).reduce((sum, count) => sum + count, 0) === 1, countAudit)

  // Actual Tab traversal, rather than merely checking tabindex attributes.
  await page.evaluate(() => document.activeElement?.blur())
  const reached = new Set()
  let tabSteps = 0
  for (; tabSteps < 100 && reached.size < 4; tabSteps += 1) {
    await page.keyboard.press('Tab')
    const target = await page.evaluate(() => {
      const active = document.activeElement
      if (!active?.closest('.tbRoot')) return null
      if (active.matches('.tbBoardViewport')) return 'boardViewport'
      if (active.matches('button.tbCardTitle')) return 'title'
      if (active.matches('.tbStatusChip')) return 'status'
      if (active.matches('.tbMenuTrigger')) return 'actions'
      return null
    })
    if (target) reached.add(target)
  }
  check('Keyboard traversal reaches the board scroll region, root title, status and task-actions controls', reached.size === 4, { reached: [...reached], tabSteps, limit: 100 })

  for (const width of [500, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await paint()
    const metrics = await overflow()
    check(`${width}px: custom frame, business scroller and document do not overflow horizontally`, metrics.overflowing.length === 0
      && metrics.document.scroll <= metrics.document.client + 2, metrics)
    const layout = await boardLayout()
    check(`${width}px: five >=250px groups stay in one row inside their accessible scroll region`, layout.exists && layout.canonical && layout.oneRow && layout.minWidth && layout.fillsAvailable
      && layout.accessible && layout.groupsInside && layout.scrollable && layout.overflowAsNeeded && layout.noOuterOverflow && layout.footerHint && await rootCard(task.id).isVisible(), layout)
    await screenshot(`overview-${width}`)
  }

  await openDetail(task)
  const beforePicker = await state()
  const pickerButton = root.getByRole('button', { name: '选择文件夹…', exact: true })
  const [pickerResponse] = await Promise.all([
    page.waitForResponse((response) => response.url() === pickerEndpoint && response.request().method() === 'POST'),
    pickerButton.click(),
  ])
  // Trial click waits for the original button to become enabled after the
  // correlated cancellation resolves; it does not invoke a second picker.
  await pickerButton.click({ trial: true })
  check('Directory picker uses the documented correlated null-cancellation RPC (mocked transport)', pickerResponse.status() === 200
    && pickerRequests.length === 1 && pickerRequests[0].valid, pickerRequests)
  const afterPicker = await state()
  check('Canceled directory picker does not bind a domain or modify any task data', !afterPicker.find((item) => item.id === task.id)?.domain?.path
    && JSON.stringify(afterPicker) === JSON.stringify(beforePicker) && await pickerButton.isEnabled())
  await screenshot('picker-canceled')

  // Exercise unchanged file labels/flows without reading or writing host files.
  const domainPath = '/__dsh_isolated_browser_fixture__'
  const contents = new Map([
    [`${domainPath}/notes.md`, '# 原始笔记\n\n原始正文。'],
    [`${domainPath}/main.ts`, 'const original = 1\n'],
  ])
  const writes = []
  await page.route('**/api/dsh-task-board/file**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/dsh-task-board/files') {
      if (url.searchParams.get('path') !== domainPath) return route.fallback()
      return route.fulfill({ json: { files: [...contents.entries()].map(([path, content]) => ({
        path, name: path.split('/').at(-1), relative: path.split('/').at(-1), size: Buffer.byteLength(content),
      })) } })
    }
    if (url.pathname !== '/api/dsh-task-board/file') return route.fallback()
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      if (!contents.has(body.path)) return route.fallback()
      writes.push(body)
      contents.set(body.path, body.content)
      return route.fulfill({ json: { path: body.path, ok: true } })
    }
    const path = url.searchParams.get('path')
    if (!contents.has(path)) return route.fallback()
    return route.fulfill({ json: { path, content: contents.get(path) } })
  })
  await reset(afterPicker.map((item) => item.id === task.id ? { ...item, domain: { path: domainPath, kind: 'md', workspaceId: null } } : item))
  await openDetail(task)
  const markdownFile = root.locator('.tbFileBtn', { hasText: 'notes.md' })
  await markdownFile.waitFor({ state: 'visible' })
  check('Bound DomainPanel preserves folder, file-creation and unbind action labels', await root.getByRole('button', { name: '更换文件夹…', exact: true }).isVisible()
    && await root.getByRole('button', { name: '新建文件…', exact: true }).isVisible()
    && await root.getByRole('button', { name: '解除绑定', exact: true }).isVisible())
  await markdownFile.click()
  await root.locator('.tbDoc').getByRole('heading', { name: '原始笔记', exact: true }).waitFor({ state: 'visible' })
  check('Markdown read mode renders file content through the existing reader', await root.getByRole('button', { name: '阅读', exact: true }).isVisible())
  await root.getByRole('button', { name: '编辑', exact: true }).click()
  const markdown = '# 修改后的笔记\n\n浏览器真实编辑控件；文件传输使用隔离 mock。'
  await root.getByLabel('编辑 notes.md', { exact: true }).fill(markdown)
  await root.getByRole('button', { name: '保存', exact: true }).click()
  await root.locator('.tbDoc').getByRole('heading', { name: '修改后的笔记', exact: true }).waitFor({ state: 'visible' })
  check('Markdown editor preserves its accessible label and saves exact text (mocked file transport)', writes.length === 1
    && writes[0].path === `${domainPath}/notes.md` && writes[0].content === markdown && contents.get(`${domainPath}/notes.md`) === markdown)
  await root.locator('.tbFileBtn', { hasText: 'main.ts' }).click()
  await root.locator('.tbCodeBox').waitFor({ state: 'visible' })
  check('Code read mode remains available with syntax-rendered source', (await root.locator('.tbCodeBox').textContent()).includes('const original = 1')
    && await root.getByRole('button', { name: '查看', exact: true }).isVisible())
  await root.getByRole('button', { name: '编辑', exact: true }).click()
  const code = 'const changed = 42\n'
  await root.getByLabel('编辑 main.ts', { exact: true }).fill(code)
  await root.getByRole('button', { name: '保存', exact: true }).click()
  await root.locator('.tbCodeBox').waitFor({ state: 'visible' })
  check('Code editor preserves its accessible label and exact save payload (mocked file transport)', writes.length === 2
    && writes[1].path === `${domainPath}/main.ts` && writes[1].content === code
    && (await root.locator('.tbCodeBox').textContent()).includes('const changed = 42'))
  check('Detail file interactions retain one drawer and the semantic host header', await frame.locator('.tbChat').count() === 1
    && await root.evaluate((element) => element.firstElementChild?.tagName === 'HEADER'))
  await screenshot('file-editor')
}, { viewport: { width: 1280, height: 850 } })
