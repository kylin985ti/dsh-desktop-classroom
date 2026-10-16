/**
 * Linear compact + Todoist board contract, exercised in a real Chromium.
 * This file also supplies the import-safe harness for the other browser suites.
 *
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-redesign.mjs
 * Optional: DSH_E2E_ARTIFACTS=/absolute/output/directory
 * Suites replace isolated task state; NEVER point them at the Desktop instance.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

export const STATUSES = { todo: '待办', doing: '进行中', ongoing: '持续性工作', done: '完成', dropped: '废弃' }
export const BOARD_WIDTHS = [1512, 1300, 1280, 1100, 900, 680, 500, 360]
export const ROOT_CARDS = '.tbGroups > .tbGroup[data-status] .tbGroupBody > .tbCard.tbItem[data-task-id]'

/** Validate BEFORE launching a browser, making requests, or writing artifacts. */
export function isolatedConfig(env = process.env, argv = process.argv) {
  const token = env.DSH_TOKEN || argv[2]
  if (env.DSH_E2E_ISOLATED !== '1' || !env.DSH_BASE || !token) {
    throw new Error('Explicit DSH_E2E_ISOLATED=1, isolated DSH_BASE and DSH_TOKEN are required; there is no default server.')
  }
  const url = new URL(env.DSH_BASE)
  if (!['http:', 'https:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !url.port || url.port === '43129'
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('DSH_BASE must be a loopback origin with an explicit isolated port, never Desktop port 43129.')
  }
  return {
    base: url.origin,
    token,
    artifacts: env.DSH_E2E_ARTIFACTS ? resolve(env.DSH_E2E_ARTIFACTS) : null,
    executablePath: env.DSH_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }
}

export function makeTask(id, title, status = 'todo', parentId = null, extra = {}) {
  const now = new Date().toISOString()
  return {
    id, title, status, parentId, note: '', domain: null, sortIndex: null,
    createdAt: now, updatedAt: now, settledAt: ['done', 'dropped'].includes(status) ? now : null,
    ...extra,
  }
}

export async function runSuite(name, run, options = {}) {
  const config = isolatedConfig()
  const results = []
  const errors = []
  const expectedHttpFailures = []
  const expectedErrorEvents = []
  const expectHttpFailure = (pathname, status) => {
    assert.ok(pathname.startsWith('/api/dsh-task-board/') && Number.isInteger(status) && status >= 400 && status <= 599, 'Expected HTTP failure must identify a task-board API and an error status')
    const expectation = { url: new URL(pathname, config.base).href, status, responses: 0, consoles: 0 }
    expectedHttpFailures.push(expectation)
    return expectation
  }
  let browser
  let page
  let failure
  const check = (label, condition, detail = undefined) => {
    const pass = Boolean(condition)
    results.push({ label, pass, ...(detail === undefined ? {} : { detail }) })
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${label}${pass || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
    assert.ok(pass, label)
  }
  try {
    browser = await chromium.launch({ executablePath: config.executablePath, headless: true })
    const context = await browser.newContext({
      viewport: options.viewport || { width: 1512, height: 950 }, locale: 'zh-CN',
      reducedMotion: 'reduce',
    })
    page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.setDefaultNavigationTimeout(30000)
    page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const expected = expectedHttpFailures.find((item) => item.url === message.location().url && item.consoles === 0
        && /Failed to load resource/.test(message.text()) && message.text().includes(String(item.status)))
      if (expected) {
        expected.consoles += 1
        expectedErrorEvents.push(`Expected console diagnostic: ${message.text()}`)
      } else errors.push(`console: ${message.text()}`)
    })
    page.on('response', (response) => {
      if (response.status() < 400) return
      const expected = expectedHttpFailures.find((item) => item.url === response.url() && item.status === response.status() && item.responses === 0)
      if (expected) {
        expected.responses += 1
        expectedErrorEvents.push(`Expected HTTP ${response.status()}: ${response.url()}`)
      } else errors.push(`Unexpected HTTP ${response.status()}: ${response.url()}`)
    })
    const app = createHarness(page, config, name)
    await run({ ...app, page, context, check, errors, config, expectHttpFailure })
    if (expectedHttpFailures.length) check('Every declared HTTP failure was observed exactly once', expectedHttpFailures.every((item) => item.responses === 1), expectedHttpFailures)
    check('No unexpected browser exceptions, console errors or HTTP error responses', errors.length === 0, errors)
  } catch (error) {
    failure = error
    process.exitCode = 1
    console.error(`\n${name} aborted: ${error.stack || error}`)
    if (page && config.artifacts) {
      try {
        await mkdir(config.artifacts, { recursive: true })
        await page.screenshot({ path: resolve(config.artifacts, `${name}-failure.png`), fullPage: true })
      } catch (artifactError) {
        console.error(`Failure screenshot unavailable: ${artifactError.message}`)
      }
    }
  } finally {
    try {
      if (browser) await browser.close()
    } catch (error) {
      failure ||= error
      process.exitCode = 1
      console.error(`Browser cleanup failed: ${error.message}`)
    }
    if (config.artifacts) {
      try {
        await mkdir(config.artifacts, { recursive: true })
        await writeFile(resolve(config.artifacts, `${name}-results.json`), JSON.stringify({
          suite: name, executedChecks: results.length, results, errors, expectedErrorEvents,
          completed: !failure, failure: failure ? String(failure.stack || failure) : null,
        }, null, 2))
      } catch (error) {
        process.exitCode = 1
        failure ||= error
        console.error(`Artifact report failed: ${error.message}`)
      }
    }
    const passed = results.filter((result) => result.pass).length
    console.log(`\n${name}: ${passed}/${results.length} executed checks passed${failure ? '; workflow FAILED before completion' : '; workflow completed'}.`)
  }
}

function createHarness(page, config, suiteName) {
  const frame = page.locator('.dshWbCustomFrame')
  const root = frame.locator('.tbRoot')
  const boardViewport = root.locator('.tbScroll.tbBoardScroll .tbBoardViewport')
  const group = (status) => root.locator(`.tbGroups > .tbGroup[data-status="${status}"]`)
  const rootCard = (id) => root.locator(`${ROOT_CARDS}[data-task-id="${id}"]`)
  const childRow = (id) => root.locator(`.tbChild[data-task-id="${id}"] > .tbRow`)
  const itemHead = (id) => root.locator(`.tbCard.tbItem[data-task-id="${id}"] > .tbCardHead, .tbChild[data-task-id="${id}"] > .tbRow`)
  const childForm = (parentId) => root.locator(`form.tbAddChild[data-parent-id="${parentId}"]`)
  const actionMenu = () => root.getByRole('menu', { name: '任务操作', exact: true })
  const statusMenu = () => root.getByRole('menu', { name: '选择状态', exact: true })
  const creationDialog = () => root.getByRole('dialog', { name: '新建任务', exact: true })
  const paint = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))

  const state = () => page.evaluate(async () => {
    const response = await fetch('/api/dsh-task-board/state', { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error(`State read failed: HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data.tasks)) throw new Error('State response has no tasks array')
    return data.tasks
  })

  // Poll the real API, not an arbitrary delay or a networkidle heuristic.
  const waitTasks = async (expected = [], { total = null, absent = [] } = {}) => {
    const handle = await page.waitForFunction(async ({ expected, total, absent }) => {
      const response = await fetch('/api/dsh-task-board/state', { credentials: 'same-origin', cache: 'no-store' })
      if (!response.ok) throw new Error(`State polling failed: HTTP ${response.status}`)
      const { tasks } = await response.json()
      if (!Array.isArray(tasks)) throw new Error('State response has no tasks array')
      const matched = (total === null || tasks.length === total)
        && absent.every((id) => !tasks.some((task) => task.id === id))
        && expected.every((wanted) => tasks.some((task) =>
          Object.entries(wanted).every(([key, value]) => JSON.stringify(task[key]) === JSON.stringify(value))))
      return matched ? tasks : false
    }, { expected, total, absent }, { polling: 120, timeout: 15000 })
    // Return exactly the API snapshot satisfying the predicate. A separate GET
    // after polling can race an in-flight read and is not the validated result.
    const matchedTasks = await handle.jsonValue()
    await handle.dispose()
    return matchedTasks
  }

  // At compact widths the native sidebar may hide its switcher while the
  // persisted workbench is already mounted. Accept that visible real root OR
  // the visible native entry, without resizing or bypassing the host UI.
  const waitForWorkbenchEntry = () => root.or(page.locator('.dshWbModeSwitch'))
    .filter({ visible: true }).first().waitFor({ state: 'visible' })
  const openWorkbench = async () => {
    await waitForWorkbenchEntry()
    if (!await root.isVisible()) {
      await page.locator('.dshWbModeSwitch').filter({ visible: true }).first().click()
      const entry = page.locator('.dshWbModeMenu button, .dshWbModeMenu [role="menuitem"]', { hasText: '任务栏' }).first()
      await entry.waitFor({ state: 'visible' })
      await entry.click()
    }
    await root.waitFor({ state: 'visible' })
    assert.equal(await frame.count(), 1, 'Only one custom frame must be mounted')
    assert.equal(await root.count(), 1, 'Only one task-board root must be mounted')
    await root.getByText('正在读取任务…', { exact: true }).waitFor({ state: 'hidden' })
  }

  const enter = async () => {
    const url = new URL('/', config.base)
    url.searchParams.set('token', config.token)
    await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    await waitForWorkbenchEntry()
  }
  const reload = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openWorkbench()
  }
  const reset = async (tasks = []) => {
    if (page.url() === 'about:blank') await enter()
    await page.evaluate(async (tasks) => {
      const response = await fetch('/api/dsh-task-board/state/write', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      })
      if (!response.ok) throw new Error(`Isolated fixture write failed: HTTP ${response.status}: ${await response.text()}`)
    }, tasks)
    await reload()
    await root.locator('.tbGroups').waitFor({ state: 'visible' })
    await waitTasks(tasks.map(({ id, title, status, parentId }) => ({ id, title, status, parentId })), { total: tasks.length })
  }

  const openCreation = async ({ column = null } = {}) => {
    const button = column
      ? group(column).getByRole('button', { name: `添加${STATUSES[column]}任务`, exact: true })
      : root.getByRole('button', { name: '新建任务', exact: true })
    await button.click()
    await creationDialog().waitFor({ state: 'visible' })
    return creationDialog()
  }
  const create = async (title, { status = 'todo', parentId = '', column = null } = {}) => {
    const dialog = await openCreation({ column })
    if (column) assert.equal(await dialog.getByLabel('新任务状态', { exact: true }).inputValue(), column, 'Column add must preset its own status')
    await dialog.getByLabel('新任务标题', { exact: true }).fill(title)
    await dialog.getByLabel('作为子任务归属于', { exact: true }).selectOption(parentId)
    await dialog.getByLabel('新任务状态', { exact: true }).selectOption(status)
    await dialog.getByRole('button', { name: '创建', exact: true }).click()
    await creationDialog().waitFor({ state: 'hidden' })
    const tasks = await waitTasks([{ title, status, parentId: parentId || null }])
    const task = tasks.find((item) => item.title === title)
    assert.ok(task, `Created task is persisted: ${title}`)
    if (!parentId) await rootCard(task.id).waitFor({ state: 'visible' })
    return task
  }

  const openActions = async (id, title, { keyboard = false } = {}) => {
    const trigger = itemHead(id).getByRole('button', { name: `更多操作：${title}`, exact: true })
    await scrollTarget(trigger)
    if (keyboard) {
      await trigger.focus()
      await page.keyboard.press('Enter')
    } else await trigger.click()
    await actionMenu().waitFor({ state: 'visible' })
    return actionMenu()
  }
  const expand = async (id) => {
    const tasks = await state()
    const task = tasks.find((item) => item.id === id)
    assert.ok(task, `Persisted task required for expansion: ${id}`)
    const count = tasks.filter((item) => item.parentId === id).length
    const owner = task.parentId ? childRow(id) : rootCard(id)
    const label = `${task.title}的 ${count} 个${task.parentId ? '下级任务' : '子任务'}`
    const control = owner.getByRole('button', { name: `展开${label}`, exact: true })
      .or(owner.getByRole('button', { name: `折叠${label}`, exact: true }))
    assert.equal(await control.count(), 1, `One own fold control expected for ${id}`)
    if (await control.getAttribute('aria-expanded') !== 'true') await control.click()
    assert.equal(await control.getAttribute('aria-expanded'), 'true')
  }
  const openChildEditor = async (parent, { viaMenu = false } = {}) => {
    const form = childForm(parent.id)
    if (await form.isVisible()) return form
    const isRoot = !parent.parentId
    if (viaMenu) {
      const menu = await openActions(parent.id, parent.title)
      await menu.getByRole('menuitem', { name: '添加子任务', exact: true }).click()
    } else {
      let button = (isRoot ? rootCard(parent.id) : childRow(parent.id))
        .getByRole('button', { name: `添加子任务：${parent.title}`, exact: true })
      if (isRoot && !await button.isVisible()) {
        const tasks = await state()
        if (tasks.some((item) => item.parentId === parent.id)) {
          await expand(parent.id)
          button = rootCard(parent.id).getByRole('button', { name: `添加子任务：${parent.title}`, exact: true })
        }
      }
      if (isRoot && !await button.isVisible()) {
        const menu = await openActions(parent.id, parent.title)
        await menu.getByRole('menuitem', { name: '添加子任务', exact: true }).click()
      } else await button.click()
    }
    await form.waitFor({ state: 'visible' })
    return form
  }
  const addChild = async (parent, title, options) => {
    const form = await openChildEditor(parent, options)
    await form.getByLabel('添加子任务', { exact: true }).fill(title)
    await form.getByRole('button', { name: '添加', exact: true }).click()
    const tasks = await waitTasks([{ title, parentId: parent.id, status: 'todo' }])
    const task = tasks.find((item) => item.title === title)
    await childRow(task.id).waitFor({ state: 'visible' })
    return task
  }
  const setStatus = async (task, status) => {
    const trigger = itemHead(task.id).locator('.tbStatusChip')
    await scrollTarget(trigger)
    await trigger.click()
    const menu = statusMenu()
    await menu.waitFor({ state: 'visible' })
    assert.equal(await menu.getByRole('menuitemradio').count(), 5, 'Status picker exposes exactly five radio choices')
    assert.deepEqual(await menu.getByRole('menuitemradio').allTextContents().then((labels) => labels.map((label) => label.trim())), Object.values(STATUSES), 'Status choices retain canonical order')
    await menu.getByRole('menuitemradio', { name: STATUSES[status], exact: true }).click()
    await menu.waitFor({ state: 'hidden' })
    return waitTasks([{ id: task.id, status }])
  }
  const openDetail = async (task) => {
    const owner = task.parentId ? childRow(task.id) : rootCard(task.id)
    await owner.getByRole('button', { name: `${task.parentId ? '打开子任务' : '打开任务'}：${task.title}`, exact: true }).click()
    await root.getByLabel('任务标题', { exact: true }).waitFor({ state: 'visible' })
    assert.equal(await root.getByLabel('任务标题', { exact: true }).inputValue(), task.title)
  }
  const overview = async () => {
    await root.getByRole('button', { name: '← 总览', exact: true }).click()
    await root.locator('.tbGroups').waitFor({ state: 'visible' })
  }
  const counts = () => root.locator('.tbGroups > .tbGroup').evaluateAll((groups) => Object.fromEntries(groups.map((element) => [
    element.dataset.status, Number(element.querySelector('.tbGroupCount')?.textContent.trim()),
  ])))

  const screenshot = async (label) => {
    if (!config.artifacts) return
    await mkdir(config.artifacts, { recursive: true })
    await page.screenshot({ path: resolve(config.artifacts, `${suiteName}-${label}.png`), fullPage: false })
  }
  const overflow = () => page.evaluate(() => {
    // The board viewport is the ONLY deliberate overflow owner. Inspect it
    // separately instead of silently exempting the outer business scroller.
    // .tbGroups is a visible-overflow content plane, NOT a scrolling ancestor;
    // its five min-width tracks are intentionally wider than its CSS grid box.
    const selectors = ['.dshWbCustomFrame', '.tbRoot', '.tbBar', '.tbBarActions', '.tbViewBar', '.tbScroll', '.tbDetailGrid', '.tbFooter']
    const elements = selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((element) => ({
      selector, client: element.clientWidth, scroll: element.scrollWidth,
      visible: Boolean(element.getClientRects().length),
    })))
    const viewport = document.querySelector('.tbScroll.tbBoardScroll .tbBoardViewport')
    return {
      elements,
      overflowing: elements.filter((item) => item.visible && item.scroll > item.client + 2),
      viewport: viewport ? { client: viewport.clientWidth, scroll: viewport.scrollWidth, left: viewport.scrollLeft,
        clientHeight: viewport.clientHeight, scrollHeight: viewport.scrollHeight, top: viewport.scrollTop } : null,
      document: { scroll: document.documentElement.scrollWidth, client: innerWidth, left: document.scrollingElement.scrollLeft },
    }
  })
  const boardLayout = () => root.evaluate((element, statuses) => {
    const viewport = element.querySelector('.tbScroll.tbBoardScroll .tbBoardViewport')
    const groups = element.querySelector('.tbGroups')
    if (!viewport || !groups) return { exists: false }
    const columns = [...groups.querySelectorAll(':scope > .tbGroup')]
    const boxes = columns.map((column) => {
      const box = column.getBoundingClientRect()
      return { status: column.dataset.status, x: box.left, y: box.top, width: box.width, right: box.right }
    })
    const style = getComputedStyle(groups), viewportStyle = getComputedStyle(viewport)
    const gap = parseFloat(style.columnGap) || 0
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    const viewportPadding = (parseFloat(viewportStyle.paddingLeft) || 0) + (parseFloat(viewportStyle.paddingRight) || 0)
    const minimum = statuses.length * 250 + (statuses.length - 1) * gap + padding + viewportPadding
    const mustOverflow = minimum > viewport.clientWidth + 2
    const doesOverflow = viewport.scrollWidth > viewport.clientWidth + 2
    const outer = [document.documentElement, document.body,
      ...document.querySelectorAll('.dshWbCustomFrame'), element,
      ...element.querySelectorAll('.tbBar,.tbBarActions,.tbViewBar,.tbScroll.tbBoardScroll,.tbFooter')]
      .filter((node) => node.getClientRects().length).map((node) => ({
        selector: node.className || node.tagName, client: node.clientWidth, scroll: node.scrollWidth,
        height: node.clientHeight, scrollHeight: node.scrollHeight, left: node.scrollLeft, top: node.scrollTop,
      }))
    return {
      exists: true, boxes, minimum, available: viewport.clientWidth, content: viewport.scrollWidth,
      canonical: JSON.stringify(boxes.map((box) => box.status)) === JSON.stringify(statuses),
      oneRow: boxes.length === statuses.length && boxes.every((box) => Math.abs(box.y - boxes[0].y) <= 1)
        && boxes.every((box, index) => index === 0 || box.x > boxes[index - 1].x && box.x >= boxes[index - 1].right - 1),
      minWidth: boxes.length === statuses.length && boxes.every((box) => box.width >= 249.5),
      fillsAvailable: boxes.length === statuses.length && boxes.at(-1).right - boxes[0].x + padding + viewportPadding >= viewport.clientWidth - 2,
      overflowAsNeeded: mustOverflow === doesOverflow, mustOverflow, doesOverflow,
      accessible: element.querySelectorAll('.tbBoardViewport').length === 1 && viewport.getAttribute('role') === 'region'
        && viewport.getAttribute('aria-label') === '任务看板（可横向滚动）' && viewport.tabIndex === 0,
      groupsInside: groups.parentElement === viewport,
      scrollable: ['auto', 'scroll'].includes(viewportStyle.overflowX) && ['auto', 'scroll'].includes(viewportStyle.overflowY),
      footerHint: [...element.querySelectorAll('.tbFooter span')].some((node) => node.textContent.includes('横向滚动查看全部列') && node.getClientRects().length > 0),
      noOuterOverflow: outer.every((node) => node.scroll <= node.client + 2 && node.scrollHeight <= node.height + 2 && node.left === 0 && node.top === 0),
      outer,
    }
  }, Object.keys(STATUSES))

  // Scroll FIRST, paint, and only THEN obtain geometry. Both the source and
  // target may be in different offscreen columns at narrow widths. The return
  // value is their visible intersection, not a stale offscreen bounding box.
  const scrollTarget = async (locator) => {
    await locator.waitFor({ state: 'visible' })
    await locator.scrollIntoViewIfNeeded()
    await locator.evaluate((element) => {
      if (element.closest('.tbBoardViewport')) element.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' })
    })
    await paint()
    const rect = await locator.evaluate((element) => {
      const box = element.getBoundingClientRect(), owner = element.closest('.tbBoardViewport')
      const clip = owner?.getBoundingClientRect()
      const left = Math.max(box.left, clip ? clip.left + owner.clientLeft : 0, 0)
      const right = Math.min(box.right, clip ? clip.left + owner.clientLeft + owner.clientWidth : innerWidth, innerWidth)
      const top = Math.max(box.top, clip ? clip.top + owner.clientTop : 0, 0)
      const bottom = Math.min(box.bottom, clip ? clip.top + owner.clientTop + owner.clientHeight : innerHeight, innerHeight)
      return { x: left, y: top, width: right - left, height: bottom - top }
    })
    assert.ok(rect.width > 0 && rect.height > 0, 'Scrolled target must intersect its owning viewport')
    return rect
  }
  const pointerClick = async (locator) => {
    const rect = await scrollTarget(locator)
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    assert.ok(await locator.evaluate((element, point) => element.contains(document.elementFromPoint(point.x, point.y)), point), 'Pointer target must pass hit-testing after scrolling')
    await page.mouse.click(point.x, point.y)
  }

  // Real pointer protocol only. No DragEvent dispatch or dragAndDrop shortcut.
  const pointerStart = async (id) => {
    const rect = await scrollTarget(itemHead(id).locator('.tbGrip'))
    const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 8, start.y, { steps: 3 })
    await paint()
    return start
  }
  const pointerTo = async (locator, fraction = 0.5) => {
    const rect = await scrollTarget(locator)
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height * fraction }
    const viewport = page.viewportSize()
    assert.ok(point.x > 0 && point.x < viewport.width && point.y > 0 && point.y < viewport.height, 'Drop point must be inside the viewport')
    await page.mouse.move(point.x, point.y, { steps: 14 })
    await paint()
    return point
  }
  const dragStatus = async (task, status) => {
    await pointerStart(task.id)
    try {
      // A genuine header target, never a card-reparent hotspot. Scrolling here,
      // DURING the active pointer session, avoids scrolling the source back out.
      await pointerTo(group(status).locator('.tbGroupHead'))
      await root.locator(`.tbGroupOver[data-status="${status}"]`).waitFor({ state: 'visible' })
    } finally {
      await page.mouse.up()
    }
    await waitTasks([{ id: task.id, status }])
    await page.waitForFunction(() => !document.querySelector('.tbRoot .tbGroupOver, .tbRoot .tbDragging'))
  }

  return {
    frame, root, boardViewport, group, rootCard, childRow, itemHead, childForm, actionMenu, statusMenu, creationDialog,
    paint, state, waitTasks, enter, reset, reload, openWorkbench, openCreation, create,
    openActions, expand, openChildEditor, addChild, setStatus, openDetail, overview,
    counts, screenshot, overflow, boardLayout, scrollTarget, pointerClick, pointerStart, pointerTo, dragStatus,
  }
}

async function redesign(app) {
  const {
    page, root, frame, group, rootCard, childRow, itemHead, childForm, actionMenu, statusMenu,
    creationDialog, check, state, waitTasks, reset, reload, create, openCreation, openActions,
    expand, openChildEditor, addChild, setStatus, openDetail, overview, counts, paint, screenshot, overflow,
    expectHttpFailure, boardLayout, scrollTarget,
  } = app
  await reset()
  check('Board root has a semantic host header as its first child', await root.evaluate((element) => element.firstElementChild?.tagName === 'HEADER'))
  check('Five status columns render once in canonical order', JSON.stringify(await root.locator('.tbGroups > .tbGroup').evaluateAll((groups) => groups.map((element) => element.dataset.status))) === JSON.stringify(Object.keys(STATUSES)))
  check('Creation form is not permanently embedded in the board', await root.getByLabel('新任务标题', { exact: true }).count() === 0 && await root.getByRole('button', { name: '新建任务', exact: true }).count() === 1)
  check('Exactly one AI drawer is mounted and hidden by default', await root.locator('.tbChat').count() === 1 && !await root.locator('.tbChat').isVisible() && await root.getByRole('button', { name: 'AI 会话', exact: true }).isVisible())

  const canceled = await openCreation()
  check('Create dialog exposes labeled title, parent and five-state status controls', await canceled.getByLabel('新任务标题', { exact: true }).isVisible()
    && await canceled.getByLabel('作为子任务归属于', { exact: true }).isVisible()
    && await canceled.getByLabel('新任务状态', { exact: true }).locator('option').count() === 5
    && await canceled.getByRole('button', { name: '创建', exact: true }).isDisabled())
  await canceled.getByLabel('新任务标题', { exact: true }).fill('取消后不得保存')
  await canceled.getByRole('button', { name: '取消', exact: true }).click()
  await creationDialog().waitFor({ state: 'hidden' })
  check('Canceling task creation leaves API state and board empty', (await state()).length === 0 && await root.locator(ROOT_CARDS).count() === 0)

  let parent = await create('整理审计资料')
  const roots = [parent]
  for (const status of ['doing', 'ongoing', 'done', 'dropped']) {
    const task = await create(`列内新增：${STATUSES[status]}`, { status, column: status })
    roots.push(task)
    check(`${STATUSES[status]} column add presets and persists its status`, await group(status).locator(`.tbGroupBody > .tbCard[data-task-id="${task.id}"]`).isVisible())
  }
  const todoDialog = await openCreation({ column: 'todo' })
  check('Todo column add also presets its status', await todoDialog.getByLabel('新任务状态', { exact: true }).inputValue() === 'todo')
  await todoDialog.getByRole('button', { name: '取消', exact: true }).click()
  await creationDialog().waitFor({ state: 'hidden' })

  const cardContract = await rootCard(parent.id).evaluate((card) => {
    const head = card.querySelector(':scope > .tbCardHead')
    return {
      title: head?.querySelector('button.tbCardTitle')?.getAttribute('aria-label'),
      status: Boolean(head?.querySelector('.tbStatusChip')),
      actions: head?.querySelector('.tbMenuTrigger')?.getAttribute('aria-label'),
      permanentActions: [...card.querySelectorAll('button')].filter((button) => ['打开任务', '删除', '删除任务'].includes(button.textContent.trim())).length,
    }
  })
  check('Card head owns title, status and actions trigger without persistent open/delete buttons', cardContract.title === `打开任务：${parent.title}` && cardContract.status && cardContract.actions === `更多操作：${parent.title}` && cardContract.permanentActions === 0, cardContract)

  const child = await addChild(parent, '直接添加第二级', { viaMenu: true })
  const grandchild = await addChild(child, '直接添加第三级')
  const greatGrandchild = await addChild(grandchild, '直接添加第四级')
  check('Direct inline additions persist distinct parents through four levels', [child, grandchild, greatGrandchild].every((task, index) => task.parentId === [parent, child, grandchild][index].id)
    && await childRow(greatGrandchild.id).isVisible())
  check('Child title is a button with its dedicated title span and accessible action', await childRow(child.id).locator('button.tbRowBtn .tbRowTitle').textContent() === child.title
    && await childRow(child.id).getByRole('button', { name: `打开子任务：${child.title}`, exact: true }).count() === 1)
  const canceledChildForm = await openChildEditor(child)
  await canceledChildForm.getByLabel('添加子任务', { exact: true }).fill('取消的行内任务')
  await canceledChildForm.getByRole('button', { name: '取消', exact: true }).click()
  await childForm(child.id).waitFor({ state: 'hidden' })
  check('Inline child editor cancellation creates no task', !(await state()).some((task) => task.title === '取消的行内任务'))
  const retainedDraft = await openChildEditor(parent)
  const draftTitle = '未提交的根行内草稿'
  await retainedDraft.getByLabel('添加子任务', { exact: true }).fill(draftTitle)
  await childRow(child.id).getByRole('button', { name: `折叠${child.title}的 1 个下级任务`, exact: true }).click()
  await expand(child.id)
  check('Expanding another node preserves the inline add draft and editor focusability', await retainedDraft.getByLabel('添加子任务', { exact: true }).inputValue() === draftTitle)
  await root.getByRole('button', { name: 'AI 会话', exact: true }).click()
  await root.locator('.tbChat').waitFor({ state: 'visible' })
  await root.getByRole('button', { name: '收起会话', exact: true }).click()
  await root.locator('.tbChat').waitFor({ state: 'hidden' })
  check('Opening and closing chat preserves an unfinished inline draft without saving it', await retainedDraft.getByLabel('添加子任务', { exact: true }).inputValue() === draftTitle
    && !(await state()).some((task) => task.title === draftTitle))
  await retainedDraft.getByRole('button', { name: '取消', exact: true }).click()
  await childForm(parent.id).waitFor({ state: 'hidden' })
  const footerAdd = rootCard(parent.id).getByRole('button', { name: `添加子任务：${parent.title}`, exact: true })
  check('Expanded root exposes its dedicated footer add-child button', await footerAdd.count() === 1 && await footerAdd.isVisible())
  await footerAdd.click()
  await childForm(parent.id).waitFor({ state: 'visible' })
  check('Root footer opens exactly the editor for that parent', await childForm(parent.id).count() === 1 && await childForm(parent.id).getByLabel('添加子任务', { exact: true }).isVisible())
  await childForm(parent.id).getByRole('button', { name: '取消', exact: true }).click()
  await childForm(parent.id).waitFor({ state: 'hidden' })

  const pickerDialog = await openCreation()
  const options = await pickerDialog.getByLabel('作为子任务归属于', { exact: true }).locator('option').evaluateAll((items) => items.map((item) => item.value))
  check('Modal parent picker includes every node, not only roots', [parent, ...roots.slice(1), child, grandchild, greatGrandchild].every((task) => options.includes(task.id)), options)
  await pickerDialog.getByRole('button', { name: '取消', exact: true }).click()
  await creationDialog().waitFor({ state: 'hidden' })
  const modalChild = await create('模态框归入第四级', { parentId: greatGrandchild.id, status: 'ongoing' })
  await expand(greatGrandchild.id)
  await childRow(modalChild.id).waitFor({ state: 'visible' })
  check('Modal can create under a non-root parent with the selected status', modalChild.parentId === greatGrandchild.id && modalChild.status === 'ongoing')
  check('Nested additions never inflate root-only column counts', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 1, dropped: 1 }), await counts())

  // Inspect checked semantics and actual persistence at BOTH tree levels.
  for (const task of [parent, child]) {
    for (const status of Object.keys(STATUSES)) {
      await setStatus(task, status)
      const persisted = (await state()).find((item) => item.id === task.id)
      await itemHead(task.id).locator('.tbStatusChip').click()
      const radios = statusMenu().getByRole('menuitemradio')
      const checkedNames = await radios.evaluateAll((items) => items.filter((item) => item.getAttribute('aria-checked') === 'true').map((item) => item.textContent.trim()))
      check(`${task.parentId ? 'Child' : 'Root'} status ${status} persists with one checked menu radio`, persisted.status === status && checkedNames.length === 1 && checkedNames[0] === STATUSES[status], checkedNames)
      await page.keyboard.press('Escape')
      await statusMenu().waitFor({ state: 'hidden' })
    }
    await setStatus(task, 'todo')
  }
  check('Changing descendant statuses does not move roots or duplicate counts', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 1, dropped: 1 }), await counts())

  const trigger = itemHead(parent.id).getByRole('button', { name: `更多操作：${parent.title}`, exact: true })
  await itemHead(parent.id).locator('.tbStatusChip').click()
  await statusMenu().waitFor({ state: 'visible' })
  await trigger.click()
  await actionMenu().waitFor({ state: 'visible' })
  check('Opening task actions replaces rather than duplicates the status popover', await statusMenu().count() === 0 && await root.getByRole('menu').count() === 1)
  await itemHead(parent.id).locator('.tbStatusChip').click()
  await statusMenu().waitFor({ state: 'visible' })
  check('Opening status also replaces the actions popover', await actionMenu().count() === 0 && await root.getByRole('menu').count() === 1)
  await page.keyboard.press('Escape')
  await statusMenu().waitFor({ state: 'hidden' })
  let menu = await openActions(parent.id, parent.title, { keyboard: true })
  const expectedActions = ['打开任务', '添加子任务', '标记完成', '移动到…', '删除任务']
  const offeredActions = await Promise.all(expectedActions.map((name) => menu.getByRole('menuitem', { name, exact: true }).count()))
  check('Keyboard opens one global actions menu with all task operations', await actionMenu().count() === 1
    && await menu.getByRole('menuitem').count() === expectedActions.length && offeredActions.every((count) => count === 1), await menu.getByRole('menuitem').allTextContents())
  const focusedBefore = await page.evaluate(() => document.activeElement?.textContent)
  await page.keyboard.press('ArrowDown')
  check('Arrow navigation moves focus within the task actions menu', await menu.evaluate((element) => element.contains(document.activeElement))
    && await page.evaluate((before) => document.activeElement?.textContent !== before, focusedBefore))
  await page.keyboard.press('Escape')
  await actionMenu().waitFor({ state: 'hidden' })
  check('Escape dismisses actions and returns focus to its trigger', await trigger.evaluate((element) => document.activeElement === element))
  await openActions(parent.id, parent.title)
  await root.locator(':scope > header').click({ position: { x: 4, y: 4 } })
  await actionMenu().waitFor({ state: 'hidden' })
  check('Outside pointer dismisses the task menu without changing state', (await state()).find((task) => task.id === parent.id)?.status === 'todo')
  menu = await openActions(parent.id, parent.title)
  await menu.getByRole('menuitem', { name: '标记完成', exact: true }).click()
  await waitTasks([{ id: parent.id, status: 'done' }])
  menu = await openActions(parent.id, parent.title)
  check('Settled task menu offers restore rather than mark-complete', await menu.getByRole('menuitem', { name: '恢复为待办', exact: true }).count() === 1 && await menu.getByRole('menuitem', { name: '标记完成', exact: true }).count() === 0)
  await menu.getByRole('menuitem', { name: '恢复为待办', exact: true }).click()
  await waitTasks([{ id: parent.id, status: 'todo', settledAt: null }])

  await openActions(child.id, child.title, { keyboard: true })
  await actionMenu().getByRole('menuitem', { name: '打开任务', exact: true }).focus()
  await page.keyboard.press('Enter')
  await root.getByLabel('任务标题', { exact: true }).waitFor({ state: 'visible' })
  check('Child action menu supports keyboard opening of its detail view', await root.getByLabel('任务标题', { exact: true }).inputValue() === child.title)
  await root.getByRole('button', { name: '↑ 父级', exact: true }).click()
  await root.getByLabel('任务标题', { exact: true }).waitFor({ state: 'visible' })
  check('Parent navigation returns to the actual parent', await root.getByLabel('任务标题', { exact: true }).inputValue() === parent.title)

  const writes = []
  const recordWrite = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request.postDataJSON())
  }
  page.on('request', recordWrite)
  const titleField = root.getByLabel('任务标题', { exact: true })
  const noteField = root.getByLabel('任务笔记', { exact: true })
  const renamed = `${parent.title}（失焦保存）`
  const note = '第一行：背景与决定\n第二行：失焦后保存，不在每次键入时写盘。'
  writes.length = 0
  await titleField.fill(renamed)
  await paint()
  check('Typing in title does not persist or send per-keystroke writes', (await state()).find((task) => task.id === parent.id)?.title === parent.title && writes.length === 0, writes)
  await root.getByRole('button', { name: 'AI 会话', exact: true }).click()
  await root.locator('.tbChat').waitFor({ state: 'visible' })
  await waitTasks([{ id: parent.id, title: renamed }])
  check('Title commits on blur with one write and survives the chat rerender', writes.length === 1 && await titleField.inputValue() === renamed, writes.length)
  await root.getByRole('button', { name: '收起会话', exact: true }).click()
  await root.locator('.tbChat').waitFor({ state: 'hidden' })
  parent = { ...parent, title: renamed }
  writes.length = 0
  await titleField.fill(`${renamed} + Enter`)
  await titleField.press('Enter')
  await waitTasks([{ id: parent.id, title: `${renamed} + Enter` }])
  check('Title also commits on Enter without duplicate writes', writes.length === 1, writes.length)
  parent = { ...parent, title: `${renamed} + Enter` }
  await noteField.focus()
  await paint()
  check('Blurring a title already committed by Enter does not write it twice', writes.length === 1, writes.length)
  writes.length = 0
  await noteField.fill(note)
  await paint()
  check('Note edits remain local while textarea retains focus', (await state()).find((task) => task.id === parent.id)?.note === '' && writes.length === 0, writes)
  await childRow(child.id).locator('button.tbFold').click()
  await waitTasks([{ id: parent.id, note }])
  await expand(child.id)
  check('Note commits on blur once and survives child-fold rerenders', writes.length === 1 && await noteField.inputValue() === note, writes.length)
  page.off('request', recordWrite)
  const detailLayout = await root.locator('.tbDetailGrid').evaluate((grid) => {
    const note = grid.querySelector('textarea[aria-label="任务笔记"]')
    const domain = grid.querySelector('.tbDomain')
    const nr = note?.getBoundingClientRect(), dr = domain?.getBoundingClientRect()
    return { hasNote: Boolean(note), hasDomain: Boolean(domain), twoColumns: Boolean(nr && dr && nr.right <= dr.left + 2) }
  })
  check('Wide detail grid keeps notes/children left and DomainPanel right', detailLayout.hasNote && detailLayout.hasDomain && detailLayout.twoColumns, detailLayout)
  check('Unbound directory picker keeps its existing accessible label', await root.getByRole('button', { name: '选择文件夹…', exact: true }).isVisible())

  for (const view of ['detail', 'overview']) {
    if (view === 'overview') await overview()
    check(`${view}: host header remains first and drawer is not duplicated`, await root.evaluate((element) => element.firstElementChild?.tagName === 'HEADER') && await root.locator('.tbChat').count() === 1)
    await root.getByRole('button', { name: 'AI 会话', exact: true }).click()
    await root.locator('.tbChat').waitFor({ state: 'visible' })
    check(`${view}: AI drawer opens once with an accessible close control`, await root.locator('.tbChat').count() === 1 && await root.getByRole('button', { name: '收起会话', exact: true }).isVisible())
    await root.getByRole('button', { name: '收起会话', exact: true }).click()
    await root.locator('.tbChat').waitFor({ state: 'hidden' })
    check(`${view}: drawer closes and AI entry remains available`, await root.getByRole('button', { name: 'AI 会话', exact: true }).isVisible() && await root.locator('.tbChat').count() === 1)
  }
  await reload()
  await openDetail(parent)
  check('Reload restores committed title and multiline note', await titleField.inputValue() === parent.title && await noteField.inputValue() === note)
  await overview()
  await expand(parent.id)
  await expand(child.id)
  await expand(grandchild.id)
  await expand(greatGrandchild.id)

  const beforeDelete = await state()
  const branchIds = [child, grandchild, greatGrandchild, modalChild].map((task) => task.id)
  await openActions(child.id, child.title)
  await actionMenu().getByRole('menuitem', { name: '删除任务', exact: true }).click()
  const deleteDialog = root.getByRole('dialog')
  await deleteDialog.waitFor({ state: 'visible' })
  check('Delete opens an explicit confirmation dialog identifying the task', (await deleteDialog.textContent()).includes(child.title))
  await deleteDialog.getByRole('button', { name: '取消', exact: true }).click()
  await deleteDialog.waitFor({ state: 'hidden' })
  check('Canceling delete preserves the entire branch and state', JSON.stringify(await state()) === JSON.stringify(beforeDelete))
  await openActions(child.id, child.title)
  await actionMenu().getByRole('menuitem', { name: '删除任务', exact: true }).click()
  await deleteDialog.waitFor({ state: 'visible' })
  await deleteDialog.getByRole('button', { name: '删除', exact: true }).click()
  await deleteDialog.waitFor({ state: 'hidden' })
  const afterDelete = await waitTasks([{ id: parent.id }], { absent: branchIds, total: beforeDelete.length - branchIds.length })
  check('Confirmed delete recursively removes every descendant and preserves other roots', branchIds.every((id) => !afterDelete.some((task) => task.id === id)) && roots.every((task) => afterDelete.some((item) => item.id === task.id)))
  await reload()
  check('Recursive removal survives reload without orphan child rows', branchIds.every((id) => !afterDelete.some((task) => task.id === id)) && await root.locator('.tbChild').count() === 0)

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 2)
  yesterday.setHours(12, 0, 0, 0)
  const historical = [
    makeTask('redesign-old-done', '历史完成根任务', 'done', null, { settledAt: yesterday.toISOString() }),
    makeTask('redesign-old-dropped', '历史废弃根任务', 'dropped', null, { settledAt: yesterday.toISOString() }),
    makeTask('redesign-old-child', '历史子任务不计组头', 'done', parent.id, { settledAt: yesterday.toISOString() }),
  ]
  await reset([...await state(), ...historical])
  check('Default view excludes historical settled roots but counts only visible roots', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 1, dropped: 1 })
    && await rootCard('redesign-old-done').count() === 0 && await rootCard('redesign-old-dropped').count() === 0, await counts())
  await root.getByRole('button', { name: '查询历史', exact: true }).click()
  await rootCard('redesign-old-done').waitFor({ state: 'visible' })
  await rootCard('redesign-old-dropped').waitFor({ state: 'visible' })
  check('History reveals old roots without counting their descendant tasks again', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 2, dropped: 2 }), await counts())
  await root.getByRole('button', { name: '隐藏往日结算', exact: true }).click()
  await rootCard('redesign-old-done').waitFor({ state: 'hidden' })
  check('Hiding history restores live root counts', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 1, dropped: 1 }), await counts())
  const historyState = await state()
  check('Historical records remain persisted when not displayed', historical.every((task) => historyState.some((item) => item.id === task.id)))

  const longTitle = `审计交付与季度任务安排 / ${'Long_UnbrokenIdentifier_ABC123_'.repeat(9)}`
  const longRoot = await create(longTitle, { status: 'doing' })
  const longChild = await addChild(longRoot, `长子任务 ${'Nested_Identifier_'.repeat(8)}`, { viaMenu: true })
  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({ width, height: 950 })
    await paint()
    const layout = await boardLayout()
    check(`${width}px: all five >=250px columns stay ordered in one horizontal row`, layout.exists && layout.canonical && layout.oneRow && layout.minWidth && layout.fillsAvailable, layout)
    check(`${width}px: only the accessible inner board viewport owns overflow`, layout.accessible && layout.groupsInside && layout.scrollable && layout.overflowAsNeeded && layout.noOuterOverflow && layout.footerHint, layout)
    await scrollTarget(rootCard(longRoot.id).locator(':scope > .tbCardHead'))
    const metrics = await overflow()
    check(`${width}px: frame, board and document have no horizontal overflow`, metrics.overflowing.length === 0 && metrics.document.scroll <= metrics.document.client + 2, metrics)
    const head = await rootCard(longRoot.id).locator(':scope > .tbCardHead').evaluate((element) => {
      const title = element.querySelector('button.tbCardTitle')?.getBoundingClientRect()
      const status = element.querySelector('.tbStatusChip')?.getBoundingClientRect()
      const actions = element.querySelector('.tbMenuTrigger')?.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      return { titleWidth: title?.width, within: Boolean(title && status && actions && title.left >= bounds.left - 2 && actions.right <= bounds.right + 2),
        nonoverlap: Boolean(title && status && actions && title.right <= status.left + 2 && status.right <= actions.left + 2) }
    })
    check(`${width}px: long title leaves usable space for inline status and actions`, head.titleWidth >= 64 && head.within && head.nonoverlap, head)
    check(`${width}px: nested long-title row stays accessible`, await childRow(longChild.id).getByRole('button', { name: `打开子任务：${longChild.title}`, exact: true }).isVisible())
    if (width === 1512 || width === 360) await screenshot(`board-${width}`)
    if (width === 360) {
      for (const type of ['status', 'actions']) {
        if (type === 'status') await itemHead(longRoot.id).locator('.tbStatusChip').click()
        else await openActions(longRoot.id, longRoot.title)
        const popover = type === 'status' ? statusMenu() : actionMenu()
        await popover.waitFor({ state: 'visible' })
        const bounds = await popover.evaluate((element) => {
          const rect = element.getBoundingClientRect(), root = element.closest('.tbRoot').getBoundingClientRect()
          return {
            contained: rect.left >= root.left - 2 && rect.right <= root.right + 2 && rect.top >= root.top - 2 && rect.bottom <= root.bottom + 2,
            hit: element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
            hasCardAncestor: Boolean(element.closest('.tbCard, .tbChild, .tbGroup')),
          }
        })
        check(`360px: ${type} popover stays inside the frame and is not clipped`, bounds.contained && bounds.hit && !bounds.hasCardAncestor, bounds)
        await page.keyboard.press('Escape')
        await popover.waitFor({ state: 'hidden' })
      }
    }
  }
  await openDetail(longRoot)
  const narrowDetail = await overflow()
  check('Narrow detail grid has no horizontal overflow', narrowDetail.overflowing.length === 0 && narrowDetail.document.scroll <= narrowDetail.document.client + 2, narrowDetail)
  await root.getByRole('button', { name: 'AI 会话', exact: true }).click()
  await root.locator('.tbChat').waitFor({ state: 'visible' })
  const drawerBounds = await root.locator('.tbChat').evaluate((drawer) => {
    const rect = drawer.getBoundingClientRect(), bounds = drawer.closest('.tbRoot').getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      contained: rect.left >= bounds.left - 2 && rect.right <= bounds.right + 2 && rect.top >= bounds.top && rect.bottom <= bounds.bottom + 2 }
  })
  check('Narrow drawer is confined to its custom frame without a duplicate conversation', drawerBounds.contained && await frame.locator('.tbChat').count() === 1, drawerBounds)
  await screenshot('detail-narrow-drawer')
  await root.getByRole('button', { name: '收起会话', exact: true }).click()
  await page.setViewportSize({ width: 1512, height: 950 })

  // Negative hydration path: first hold the GET pending, then inject exactly one
  // known 503. The harness accounts for this one response/console diagnostic,
  // never suppresses other errors, and reports the expected fault separately.
  const beforeLoadFailure = await state()
  const expectedFailure = expectHttpFailure('/api/dsh-task-board/state', 503)
  let releaseHydration
  let blockedReads = 0
  const hydrationGate = new Promise((resolve) => { releaseHydration = resolve })
  await page.route('**/api/dsh-task-board/state', async (route) => {
    blockedReads += 1
    await hydrationGate
    await route.fulfill({ status: 503, json: { error: 'Isolated E2E hydration fault' } })
  }, { times: 1 })
  writes.length = 0
  page.on('request', recordWrite)
  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('.dshWbModeSwitch').first().waitFor({ state: 'visible' })
    if (!await root.isVisible()) {
      await page.locator('.dshWbModeSwitch').first().click()
      await page.locator('.dshWbModeMenu button, .dshWbModeMenu [role="menuitem"]', { hasText: '任务栏' }).first().click()
    }
    await root.waitFor({ state: 'visible' })
    await paint()
    const pendingCreation = await root.getByRole('button', { name: /^(新建任务|添加待办任务|添加进行中任务|添加持续性工作任务|添加完成任务|添加废弃任务)$/ }).evaluateAll((buttons) => buttons.map((button) => ({
      label: button.getAttribute('aria-label') || button.textContent.trim(), disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
    })))
    check('Pending initial hydration disables every visible creation entry and sends no writes', blockedReads === 1
      && pendingCreation.length === 6 && pendingCreation.every((button) => button.disabled) && writes.length === 0 && await creationDialog().count() === 0, pendingCreation)
  } finally {
    releaseHydration()
  }
  await root.getByRole('button', { name: '重新加载', exact: true }).waitFor({ state: 'visible' })
  const failureAlert = root.getByRole('alert')
  await failureAlert.waitFor({ state: 'visible' })
  const failedCreation = await root.getByRole('button', { name: /^(新建任务|添加待办任务|添加进行中任务|添加持续性工作任务|添加完成任务|添加废弃任务)$/ }).evaluateAll((buttons) => buttons.map((button) => button.disabled || button.getAttribute('aria-disabled') === 'true'))
  check('Failed hydration exposes retry and keeps all creation controls non-writable', expectedFailure.responses === 1
    && (await failureAlert.textContent()).includes('503') && failedCreation.length === 6 && failedCreation.every(Boolean)
    && await root.getByLabel('新任务标题', { exact: true }).count() === 0, failedCreation)
  check('Read failure cannot overwrite existing tasks with an empty list', writes.length === 0 && JSON.stringify(await state()) === JSON.stringify(beforeLoadFailure), writes)
  await screenshot('hydration-failed')
  await root.getByRole('button', { name: '重新加载', exact: true }).click()
  await rootCard(longRoot.id).waitFor({ state: 'visible' })
  check('Retry recovers original tasks and only then enables task creation', await root.getByRole('button', { name: '新建任务', exact: true }).isEnabled()
    && JSON.stringify(await state()) === JSON.stringify(beforeLoadFailure) && writes.length === 0)
  page.off('request', recordWrite)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runSuite('redesign', redesign)
}
