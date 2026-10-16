/**
 * Single-row, internally scrollable five-column board and persistent ongoing work.
 * Lossless root/child folding, five-state creation/pickers, history and save rollback.
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-new-features.mjs
 * Optional screenshots/reports: DSH_E2E_ARTIFACTS=/absolute/output/directory
 */
import { BOARD_WIDTHS, ROOT_CARDS, STATUSES, makeTask, runSuite } from './e2e-redesign.mjs'

await runSuite('new-features', async ({
  page, root, rootCard, childRow, childForm, itemHead, boardViewport, check, reset, create, addChild,
  openChildEditor, expand, state, counts, paint, screenshot, overflow, boardLayout, pointerClick, scrollTarget,
  reload, setStatus, statusMenu, openActions, actionMenu, openCreation, creationDialog, waitTasks, expectHttpFailure,
}) => {
  await reset()
  const audit = await create('季度审计')
  const documentation = await create('文档改版')
  const ongoing = await create('每周核对但不自动重复建单', { status: 'ongoing', column: 'ongoing' })
  const dropped = await create('已取消的旧提案', { status: 'dropped', column: 'dropped' })
  const sample = await addChild(audit, '抽样凭证', { viaMenu: true })
  const report = await addChild(audit, '出报告')
  const attachment = await addChild(sample, '凭证附件')
  const before = await state()

  const wide = await boardLayout()
  check('Wide board has five ordered, non-overlapping columns in one row', wide.exists && wide.oneRow && wide.canonical && wide.minWidth, wide)
  check('Four roots count once despite three descendants', await root.locator(ROOT_CARDS).count() === 4
    && JSON.stringify(await counts()) === JSON.stringify({ todo: 2, doing: 0, ongoing: 1, done: 0, dropped: 1 }), await counts())

  const rootFold = rootCard(audit.id).getByRole('button', { name: `折叠${audit.title}的 2 个子任务`, exact: true })
  const childFold = childRow(sample.id).getByRole('button', { name: `折叠${sample.title}的 1 个下级任务`, exact: true })
  check('Root and nested folds expose exact counts and expanded state', await rootFold.getAttribute('aria-expanded') === 'true'
    && await childFold.getAttribute('aria-expanded') === 'true')
  await childFold.click()
  await childRow(attachment.id).waitFor({ state: 'hidden' })
  check('Collapsing one child hides only that child’s descendants', await childRow(sample.id).isVisible()
    && await childRow(report.id).isVisible() && !await childRow(attachment.id).isVisible())
  await expand(sample.id)
  await childRow(attachment.id).waitFor({ state: 'visible' })
  check('Nested re-expansion restores the grandchild without losing records', JSON.stringify(await state()) === JSON.stringify(before))

  const form = await openChildEditor(audit)
  await form.getByLabel('添加子任务', { exact: true }).fill('未提交的草稿')
  await rootFold.click()
  await childRow(sample.id).waitFor({ state: 'hidden' })
  await childForm(audit.id).waitFor({ state: 'hidden' })
  check('Root collapse hides child rows and the inline editor', !await childRow(sample.id).isVisible()
    && !await childRow(report.id).isVisible() && !await childForm(audit.id).isVisible())
  check('Collapsed root exposes one count-bearing expand control', await rootCard(audit.id).getByRole('button', { name: `展开${audit.title}的 2 个子任务`, exact: true }).count() === 1)
  check('Folding neither saves an unfinished draft nor changes persisted tree data', JSON.stringify(await state()) === JSON.stringify(before))
  await expand(audit.id)
  await childRow(sample.id).waitFor({ state: 'visible' })
  await childRow(report.id).waitFor({ state: 'visible' })
  const directChildren = await rootCard(audit.id).evaluate((card) => [...card.querySelectorAll('.tbChild[data-task-id]')]
    .filter((child) => child.parentElement.closest('[data-task-id]') === card).map((child) => child.dataset.taskId))
  check('Re-expansion restores both direct children with no duplicates', JSON.stringify(directChildren) === JSON.stringify([sample.id, report.id]), directChildren)
  await expand(sample.id)
  await childRow(attachment.id).waitFor({ state: 'visible' })
  check('The full nested tree remains available after root folding', await childRow(attachment.id).getByRole('button', { name: `打开子任务：${attachment.title}`, exact: true }).isVisible())
  await screenshot('wide-expanded')

  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({ width, height: 950 })
    await boardViewport.evaluate((element) => { element.scrollLeft = 0 })
    await paint()
    const layout = await boardLayout()
    check(`${width}px: five canonical columns keep the same top and increasing non-overlapping x`, layout.exists && layout.canonical && layout.oneRow && layout.minWidth && layout.fillsAvailable, layout)
    check(`${width}px: the labeled keyboard region alone owns horizontal/vertical scrolling`, layout.accessible && layout.groupsInside && layout.scrollable && layout.overflowAsNeeded && layout.noOuterOverflow && layout.footerHint, layout)
    const metrics = await overflow()
    check(`${width}px: toolbar, summary, outer scroller and document never overflow horizontally`, metrics.overflowing.length === 0 && metrics.document.scroll <= metrics.document.client + 2 && metrics.document.left === 0, metrics)
    if (width === 500) {
      await boardViewport.focus()
      await page.keyboard.press('Home')
      await paint()
      check('Keyboard Home reaches the first column while focus remains on the board region', await boardViewport.evaluate((element) => document.activeElement === element && element.scrollLeft === 0))
      await page.keyboard.press('ArrowRight')
      await paint()
      const right = await boardViewport.evaluate((element) => element.scrollLeft)
      await page.keyboard.press('ArrowLeft')
      await paint()
      check('Focused board ArrowRight/ArrowLeft move only its horizontal viewport', right > 0 && await boardViewport.evaluate((element, initial) => element.scrollLeft < initial, right))
      await page.keyboard.press('End')
      await paint()
      check('Keyboard End reaches the last column without scrolling the page', await boardViewport.evaluate((element) => element.scrollLeft > 0 && element.scrollLeft >= element.scrollWidth - element.clientWidth - 1)
        && (await boardLayout()).noOuterOverflow)
      await page.keyboard.press('Home')
      await paint()
    }

    for (const task of [ongoing, dropped]) {
      // Scroll the actual card into its dedicated viewport, THEN measure/hit-test
      // and send real mouse input; an offscreen isVisible() check is insufficient.
      await pointerClick(itemHead(task.id).locator('.tbStatusChip'))
      const menu = statusMenu()
      await menu.waitFor({ state: 'visible' })
      const scrolled = await boardViewport.evaluate((element) => element.scrollLeft)
      const menuBounds = await menu.evaluate((element) => {
        const bounds = element.getBoundingClientRect(), owner = element.closest('.tbRoot').getBoundingClientRect()
        return { inside: bounds.left >= owner.left - 1 && bounds.right <= owner.right + 1 && bounds.top >= owner.top - 1 && bounds.bottom <= owner.bottom + 1,
          hit: element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
          rootLevel: !element.closest('.tbBoardViewport,.tbGroups,.tbGroup,.tbCard,.tbChild') }
      })
      check(`${width}px: scrolling reaches the ${task.status} card and its five-radio menu is clickable`, (!layout.mustOverflow || scrolled > 0)
        && await menu.getByRole('menuitemradio').count() === 5 && menuBounds.inside && menuBounds.hit && menuBounds.rootLevel, { scrolled, menuBounds })
      await pointerClick(menu.getByRole('menuitemradio', { name: STATUSES[task.status], exact: true }))
      await menu.waitFor({ state: 'hidden' })
      const actions = await openActions(task.id, task.title)
      check(`${width}px: actions for a horizontally scrolled ${task.status} card remain interactive`, await actions.getByRole('menuitem', { name: '打开任务', exact: true }).isVisible())
      await page.keyboard.press('Escape')
      await actionMenu().waitFor({ state: 'hidden' })
    }
    const afterScroll = await boardLayout()
    check(`${width}px: reaching the last column does not scroll a parent or mutate task records`, afterScroll.noOuterOverflow && JSON.stringify(await state()) === JSON.stringify(before), afterScroll.outer)
    await scrollTarget(itemHead(audit.id))
    check(`${width}px: folded-tree controls and nested tasks remain reachable in the same row`, await rootCard(documentation.id).isVisible()
      && await childRow(sample.id).isVisible() && await childRow(attachment.id).isVisible())
    if (width === 1512 || width === 360) await screenshot(`one-row-${width}`)
  }

  await page.setViewportSize({ width: 1512, height: 950 })
  await paint()
  const restored = await boardLayout()
  check('Widening retains five columns and all existing task data', restored.oneRow && restored.canonical && restored.minWidth && JSON.stringify(await state()) === JSON.stringify(before))

  // Ongoing work is a nonterminal record, not a daily recurring-template system.
  // Old timestamps prove persistence across days without clock mocks or timers.
  const old = new Date()
  old.setDate(old.getDate() - 5)
  old.setHours(12, 0, 0, 0)
  const oldTime = old.toISOString()
  const oldTask = (id, title, status, parentId = null) => makeTask(id, title, status, parentId, {
    createdAt: oldTime, updatedAt: oldTime, settledAt: ['done', 'dropped'].includes(status) ? oldTime : null,
    note: `保留原始记录：${id}`, sortIndex: 0,
  })
  const legacy = [
    oldTask('ongoing-legacy-todo', '原有待办记录', 'todo'),
    oldTask('ongoing-legacy-doing', '原有进行中记录', 'doing'),
    oldTask('ongoing-legacy-done', '原有完成历史', 'done'),
    oldTask('ongoing-legacy-dropped', '原有废弃历史', 'dropped'),
  ]
  const oldOngoing = oldTask('ongoing-old-root', '多日前的持续性工作', 'ongoing')
  const oldNested = oldTask('ongoing-old-child', '多日前的持续性子任务', 'ongoing', legacy[0].id)
  await reset([...legacy, oldOngoing, oldNested])
  const baseline = await state()
  check('Reading the upgraded state preserves the exact four-state legacy records', legacy.every((task) => {
    const stored = baseline.find((item) => item.id === task.id)
    return stored && Object.keys(stored).length === Object.keys(task).length && Object.entries(task).every(([key, value]) => JSON.stringify(stored[key]) === JSON.stringify(value))
  }), baseline)
  const writes = []
  const recordWrite = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request.postDataJSON())
  }
  page.on('request', recordWrite)
  try {
    for (let pass = 1; pass <= 2; pass += 1) {
      await reload()
      await expand(legacy[0].id)
      check(`Read-only reload ${pass}: old ongoing roots and descendants stay visible with history OFF`, await rootCard(oldOngoing.id).isVisible() && await childRow(oldNested.id).isVisible()
        && await rootCard(legacy[2].id).count() === 0 && await rootCard(legacy[3].id).count() === 0
        && JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 0, dropped: 0 }), await counts())
      await root.getByRole('button', { name: '查询历史', exact: true }).click()
      await rootCard(legacy[2].id).waitFor({ state: 'visible' })
      await rootCard(legacy[3].id).waitFor({ state: 'visible' })
      check(`History ${pass}: old completion/drop records remain available and ongoing counts roots only`, JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 1, done: 1, dropped: 1 }), await counts())
      await root.getByRole('button', { name: '隐藏往日结算', exact: true }).click()
      await rootCard(legacy[2].id).waitFor({ state: 'hidden' })
      const read = await state()
      check(`Read-only pass ${pass}: no timestamp updates, duplicate/recurring tasks or writes`, read.length === 6 && JSON.stringify(read) === JSON.stringify(baseline) && writes.length === 0, writes)
    }
  } finally {
    page.off('request', recordWrite)
  }

  const createdOngoing = await create('新建持续性根任务', { status: 'ongoing', column: 'ongoing' })
  const nestedOngoing = await create('新建第三级持续性工作', { status: 'ongoing', parentId: oldNested.id })
  await expand(legacy[0].id)
  await expand(oldNested.id)
  check('Modal creates root and deep nested ongoing tasks with no settlement timestamp', createdOngoing.status === 'ongoing' && createdOngoing.settledAt === null
    && nestedOngoing.status === 'ongoing' && nestedOngoing.parentId === oldNested.id && nestedOngoing.settledAt === null && await childRow(nestedOngoing.id).isVisible())
  check('Ongoing descendants never inflate the root-only ongoing count', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 2, done: 0, dropped: 0 }), await counts())
  for (const task of [createdOngoing, nestedOngoing]) {
    await setStatus(task, 'done')
    let persisted = (await state()).find((item) => item.id === task.id)
    check(`${task.parentId ? 'Nested' : 'Root'} ongoing → done settles the task`, persisted.status === 'done' && Boolean(persisted.settledAt) && Number.isFinite(Date.parse(persisted.settledAt)), persisted)
    await setStatus(task, 'ongoing')
    persisted = (await state()).find((item) => item.id === task.id)
    check(`${task.parentId ? 'Nested' : 'Root'} done → ongoing clears settledAt without changing parent or creation time`, persisted.status === 'ongoing' && persisted.settledAt === null && persisted.parentId === task.parentId && persisted.createdAt === task.createdAt, persisted)
  }
  const ongoingActions = await openActions(createdOngoing.id, createdOngoing.title)
  check('Ongoing task actions are nonterminal: mark-complete, never restore', await ongoingActions.getByRole('menuitem', { name: '标记完成', exact: true }).count() === 1
    && await ongoingActions.getByRole('menuitem', { name: '恢复为待办', exact: true }).count() === 0)
  await page.keyboard.press('Escape')
  await actionMenu().waitFor({ state: 'hidden' })
  const savedOngoing = await state()
  await reload()
  await expand(legacy[0].id)
  await expand(oldNested.id)
  check('Reload preserves both newly created ongoing tasks and the complete nested tree', JSON.stringify(await state()) === JSON.stringify(savedOngoing)
    && await rootCard(createdOngoing.id).isVisible() && await childRow(nestedOngoing.id).isVisible())

  // One precisely declared failed save; neither discard the draft nor silently
  // treat the optimistic card as successfully persisted. A real retry must work.
  const beforeFailedSave = await state()
  const dialog = await openCreation({ column: 'ongoing' })
  const retryTitle = '持续性任务保存失败后重试'
  await dialog.getByLabel('新任务标题', { exact: true }).fill(retryTitle)
  const expectedFailure = expectHttpFailure('/api/dsh-task-board/state/write', 503)
  await page.route('**/api/dsh-task-board/state/write', (route) => route.fulfill({ status: 503, json: { error: 'Isolated ongoing creation save fault' } }), { times: 1 })
  const [failedResponse] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/dsh-task-board/state/write' && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: '创建', exact: true }).click(),
  ])
  await dialog.getByRole('alert').waitFor({ state: 'visible' })
  check('Failed ongoing save is exactly HTTP 503 and retains the complete creation draft', failedResponse.status() === 503 && expectedFailure.responses === 1
    && await dialog.getByLabel('新任务标题', { exact: true }).inputValue() === retryTitle && await dialog.getByLabel('新任务状态', { exact: true }).inputValue() === 'ongoing'
    && (await dialog.getByRole('alert').textContent()).includes('503'))
  check('A failed save rolls back optimistic ongoing creation without touching old data', JSON.stringify(await state()) === JSON.stringify(beforeFailedSave)
    && await root.locator(ROOT_CARDS).filter({ hasText: retryTitle }).count() === 0)
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await creationDialog().waitFor({ state: 'hidden' })
  const retried = await waitTasks([{ title: retryTitle, status: 'ongoing', settledAt: null }], { total: beforeFailedSave.length + 1 })
  check('Retry creates one ongoing task, without duplicate recurrence or descendant counts', retried.filter((task) => task.title === retryTitle).length === 1
    && JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 1, ongoing: 3, done: 0, dropped: 0 }), await counts())
}, { viewport: { width: 1440, height: 900 } })
