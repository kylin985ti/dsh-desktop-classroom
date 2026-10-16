/**
 * Real-pointer nesting and sorting, hover confirmation/no-op, cycle protection,
 * pointer cancellation and the accessible move dialog (including back to root).
 * No synthetic DragEvent, copied temporary script, or dragAndDrop() shortcut.
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-reparent.mjs
 */
import { makeTask, runSuite } from './e2e-redesign.mjs'

await runSuite('reparent', async ({
  page, root, rootCard, childRow, group, check, reset, expand, state, waitTasks,
  pointerStart, pointerTo, paint, openActions, actionMenu, counts, reload, screenshot,
}) => {
  const first = makeTask('move-root', '一级')
  const a = makeTask('move-a', '二级A', 'doing', first.id)
  const b = makeTask('move-b', '二级B', 'done', first.id)
  const c = makeTask('move-c', '二级C', 'todo', first.id)
  const x = makeTask('move-x', '三级X', 'dropped', a.id)
  await reset([first, a, b, c, x])
  await expand(first.id)
  await expand(a.id)
  await childRow(x.id).waitFor({ state: 'visible' })

  const writes = []
  const trackWrite = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request.postDataJSON())
  }
  page.on('request', trackWrite)
  const initial = await state()
  await pointerStart(x.id)
  try {
    await pointerTo(childRow(b.id))
    await root.locator(`.tbChild[data-task-id="${b.id}"].tbDropPending`).waitFor({ state: 'visible' })
    check('Center hover first shows pending reparent, not a completed drop', await root.locator(`.tbChild[data-task-id="${b.id}"].tbDropInto`).count() === 0)
  } finally {
    // Release while the visible pending state is still unconfirmed (<500ms).
    await page.mouse.up()
  }
  await paint()
  check('Unconfirmed center release is a full no-op, not sorting or a status change', JSON.stringify(await state()) === JSON.stringify(initial) && writes.length === 0, writes)

  await pointerStart(x.id)
  try {
    await pointerTo(childRow(b.id))
    await root.locator(`.tbChild[data-task-id="${b.id}"].tbDropInto`).waitFor({ state: 'visible' })
    check('Confirmed hover targets the innermost child row rather than its root card', await root.locator('.tbDropInto').count() === 1
      && await root.locator('.tbDropInto').getAttribute('data-task-id') === b.id)
    await screenshot('confirmed-reparent')
  } finally {
    await page.mouse.up()
  }
  let tasks = await waitTasks([{ id: x.id, parentId: b.id, status: 'dropped' }])
  check('Real mouse reparent moves the third-level task under 二级B', tasks.find((task) => task.id === x.id)?.parentId === b.id, tasks.map((task) => ({ id: task.id, parentId: task.parentId, status: task.status })))
  check('Reparent preserves independent statuses of dragged node, parent and root', tasks.find((task) => task.id === x.id)?.status === 'dropped'
    && tasks.find((task) => task.id === b.id)?.status === 'done'
    && tasks.find((task) => task.id === first.id)?.status === 'todo')
  check('A tree reparent does not create an extra board root', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 0, ongoing: 0, done: 0, dropped: 0 }), await counts())
  await expand(b.id)
  await childRow(x.id).waitFor({ state: 'visible' })
  check('Moved node is rendered beneath its new parent', await childRow(x.id).evaluate((row, parentId) => row.parentElement.parentElement.closest('[data-task-id]')?.dataset.taskId === parentId, b.id)
    && await root.locator(`.tbChild[data-task-id="${a.id}"] .tbChild[data-task-id="${x.id}"]`).count() === 0)

  // Sort siblings with different statuses. A row's descendants must not enlarge
  // the measured before/after hotspot into an entire subtree.
  const beforeSort = await state()
  const displayedBeforeSort = await rootCard(first.id).evaluate((card) => [...card.querySelectorAll('.tbChild[data-task-id]')]
    .filter((element) => element.parentElement.closest('[data-task-id]') === card).map((element) => element.dataset.taskId))
  check('Mixed-status sibling fixture exposes all three distinct tasks before the drag', displayedBeforeSort.length === 3
    && new Set(displayedBeforeSort).size === 3 && [a.id, b.id, c.id].every((id) => displayedBeforeSort.includes(id)), displayedBeforeSort)
  // Preserve the actual rendered order of unrelated siblings. Do not assume raw
  // fixture-array order or reproduce the UI's initial mixed-status comparator.
  const expectedSiblingOrder = displayedBeforeSort.filter((id) => id !== b.id)
  expectedSiblingOrder.splice(expectedSiblingOrder.indexOf(a.id), 0, b.id)
  check('Dragging B immediately before A is a non-trivial sibling reorder', JSON.stringify(expectedSiblingOrder) !== JSON.stringify(displayedBeforeSort), { before: displayedBeforeSort, expected: expectedSiblingOrder })
  await pointerStart(b.id)
  try {
    await pointerTo(childRow(a.id), 0.1)
    await root.locator(`.tbChild[data-task-id="${a.id}"].tbDropBefore`).waitFor({ state: 'visible' })
    check('Sibling sorting identifies the dedicated row’s top edge', await root.locator('.tbDropBefore').getAttribute('data-task-id') === a.id)
  } finally {
    await page.mouse.up()
  }
  await page.waitForFunction(({ parentId, expected }) => {
    const card = document.querySelector(`.tbCard[data-task-id="${parentId}"]`)
    if (!card) return false
    const ids = [...card.querySelectorAll('.tbChild[data-task-id]')]
      .filter((element) => element.parentElement.closest('[data-task-id]') === card).map((element) => element.dataset.taskId)
    return JSON.stringify(ids) === JSON.stringify(expected)
  }, { parentId: first.id, expected: expectedSiblingOrder })
  tasks = await waitTasks(expectedSiblingOrder.map((id, sortIndex) => ({ id, parentId: first.id, sortIndex })))
  const persistedSiblings = tasks.filter((task) => task.parentId === first.id).sort((left, right) => left.sortIndex - right.sortIndex)
  const ordered = persistedSiblings.map((task) => task.id)
  const renderedOrder = await rootCard(first.id).evaluate((card) => [...card.querySelectorAll('.tbChild[data-task-id]')]
    .filter((element) => element.parentElement.closest('[data-task-id]') === card).map((element) => element.dataset.taskId))
  check('Pointer sibling sort persists the exact derived order with continuous indices', JSON.stringify(ordered) === JSON.stringify(expectedSiblingOrder)
    && JSON.stringify(renderedOrder) === JSON.stringify(expectedSiblingOrder)
    && persistedSiblings.every((task, index) => task.sortIndex === index), { expected: expectedSiblingOrder, rendered: renderedOrder, persisted: persistedSiblings.map(({ id, sortIndex }) => ({ id, sortIndex })) })
  check('Sibling sorting preserves each task’s own status and parent', beforeSort.every((task) => tasks.find((item) => item.id === task.id)?.status === task.status
    && tasks.find((item) => item.id === task.id)?.parentId === task.parentId))

  const beforeCycle = await state()
  writes.length = 0
  await pointerStart(b.id)
  try {
    await pointerTo(childRow(x.id))
    // A deliberate hover-window observation, not a render/network timing sleep.
    const since = await page.evaluate(() => performance.now())
    await page.waitForFunction((since) => performance.now() - since >= 550, since, { polling: 'raf' })
    check('Dragging a parent into its own descendant never confirms a cyclic drop', await root.locator('.tbDropInto, .tbDropPending').count() === 0)
  } finally {
    await page.mouse.up()
  }
  await paint()
  check('Cycle rejection preserves the whole task graph and makes no write', JSON.stringify(await state()) === JSON.stringify(beforeCycle) && writes.length === 0, writes)

  const beforeEscape = await state()
  writes.length = 0
  await pointerStart(x.id)
  try {
    await pointerTo(group('doing').locator('.tbGroupHead'))
    await root.locator('.tbGroupOver[data-status="doing"]').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.tbRoot .tbDragging, .tbRoot .tbGroupOver, .tbRoot .tbDropInto, .tbRoot .tbDropPending'))
    check('Escape cancels an active pointer drag and removes every drop indicator', await root.locator('.tbDragging, .tbGroupOver, .tbDropInto, .tbDropPending').count() === 0)
  } finally {
    await page.mouse.up()
  }
  await paint()
  check('Pointerup after Escape does not commit the canceled move', JSON.stringify(await state()) === JSON.stringify(beforeEscape) && writes.length === 0, writes)
  page.off('request', trackWrite)

  await openActions(b.id, b.title)
  await actionMenu().getByRole('menuitem', { name: '移动到…', exact: true }).click()
  const dialog = root.getByRole('dialog', { name: '移动任务', exact: true })
  await dialog.waitFor({ state: 'visible' })
  const parentSelect = dialog.getByLabel('新父级任务', { exact: true })
  const destinations = await parentSelect.locator('option').evaluateAll((options) => options.filter((option) => !option.disabled).map((option) => option.value))
  check('Move dialog excludes both the task itself and all descendants as parents', !destinations.includes(b.id) && !destinations.includes(x.id) && destinations.includes(a.id), destinations)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })

  await openActions(x.id, x.title)
  await actionMenu().getByRole('menuitem', { name: '移动到…', exact: true }).click()
  await dialog.waitFor({ state: 'visible' })
  await parentSelect.selectOption({ label: '一级任务（无父级）' })
  const beforeCancel = await state()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  check('Canceling move leaves task ownership and statuses unchanged', JSON.stringify(await state()) === JSON.stringify(beforeCancel))
  await openActions(x.id, x.title)
  await actionMenu().getByRole('menuitem', { name: '移动到…', exact: true }).click()
  await dialog.waitFor({ state: 'visible' })
  await parentSelect.selectOption({ label: '一级任务（无父级）' })
  await dialog.getByRole('button', { name: '移动', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  tasks = await waitTasks([{ id: x.id, parentId: null, status: 'dropped' }])
  await rootCard(x.id).waitFor({ state: 'visible' })
  check('Move menu restores a descendant to a root without resetting its status', tasks.find((task) => task.id === x.id)?.parentId === null
    && await group('dropped').locator(`.tbGroupBody > .tbCard[data-task-id="${x.id}"]`).isVisible())
  check('Root-only counts update exactly once after moving back to root', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 0, ongoing: 0, done: 0, dropped: 1 }), await counts())
  await reload()
  await expand(first.id)
  tasks = await state()
  const reloadedOrder = await rootCard(first.id).evaluate((card) => [...card.querySelectorAll('.tbChild[data-task-id]')]
    .filter((element) => element.parentElement.closest('[data-task-id]') === card).map((element) => element.dataset.taskId))
  const reloadedSiblings = tasks.filter((task) => task.parentId === first.id).sort((left, right) => left.sortIndex - right.sortIndex)
  check('Reparent, derived sibling order and continuous indices persist through reload', await rootCard(x.id).isVisible()
    && tasks.find((task) => task.id === x.id)?.parentId === null
    && tasks.find((task) => task.id === x.id)?.status === 'dropped'
    && JSON.stringify(reloadedOrder) === JSON.stringify(expectedSiblingOrder)
    && JSON.stringify(reloadedSiblings.map((task) => task.id)) === JSON.stringify(expectedSiblingOrder)
    && reloadedSiblings.every((task, index) => task.sortIndex === index), { expected: expectedSiblingOrder, rendered: reloadedOrder, persisted: reloadedSiblings.map(({ id, sortIndex }) => ({ id, sortIndex })) })
})
