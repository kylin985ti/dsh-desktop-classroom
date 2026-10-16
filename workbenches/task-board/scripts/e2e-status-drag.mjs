/**
 * Real-pointer status dragging, activation threshold, five-state status menus,
 * and root-level popover hit-testing. No synthetic DragEvent or dragAndDrop().
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-status-drag.mjs
 */
import { STATUSES, makeTask, runSuite } from './e2e-redesign.mjs'

await runSuite('status-drag', async ({
  page, root, rootCard, itemHead, group, statusMenu, check, reset, create,
  state, waitTasks, dragStatus, pointerStart, pointerTo, paint, screenshot, scrollTarget,
  boardViewport, boardLayout, setStatus,
}) => {
  await reset()
  const alpha = await create('任务甲')
  const beta = await create('任务乙')

  for (const status of ['doing', 'ongoing', 'done', 'ongoing', 'dropped', 'todo']) {
    await dragStatus(alpha, status)
    const task = (await state()).find((item) => item.id === alpha.id)
    check(`Real mouse drag moves root to ${STATUSES[status]} and persists it`, task.status === status
      && task.parentId === null && await group(status).locator(`.tbGroupBody > .tbCard[data-task-id="${alpha.id}"]`).isVisible(), task)
    check(`${STATUSES[status]} drop records the correct settlement timestamp`, ['done', 'dropped'].includes(status)
      ? Boolean(task.settledAt && Number.isFinite(Date.parse(task.settledAt))) : task.settledAt === null, task.settledAt)
  }

  await pointerStart(beta.id)
  try {
    await pointerTo(group('doing').locator('.tbGroupHead'))
    await root.locator('.tbGroupOver[data-status="doing"]').waitFor({ state: 'visible' })
    check('During dragging the source root has a raised/dragging state', await rootCard(beta.id).evaluate((element) => element.classList.contains('tbDragging')))
    check('Only the actual hovered group is highlighted', await root.locator('.tbGroupOver').count() === 1
      && await root.locator('.tbGroupOver').getAttribute('data-status') === 'doing')
    await screenshot('active-drag')
  } finally {
    await page.mouse.up()
  }
  await waitTasks([{ id: beta.id, status: 'doing', parentId: null }])
  await page.waitForFunction(() => !document.querySelector('.tbRoot .tbGroupOver, .tbRoot .tbDragging'))
  check('Drop clears both highlight and source dragging state', await root.locator('.tbGroupOver, .tbDragging').count() === 0)

  const beforeTap = await state()
  const writes = []
  const trackWrite = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request.url())
  }
  page.on('request', trackWrite)
  const handle = itemHead(beta.id).locator('.tbGrip')
  const grip = await scrollTarget(handle)
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 2, grip.y + grip.height / 2 + 2)
  await page.mouse.up()
  await paint()
  check('Sub-threshold grip tap changes neither state nor persistence', JSON.stringify(await state()) === JSON.stringify(beforeTap)
    && writes.length === 0 && await root.locator('.tbDragging, .tbGroupOver').count() === 0, writes)
  page.off('request', trackWrite)

  // The popover belongs to .tbRoot, not the card: scope all queries accordingly.
  const chip = itemHead(alpha.id).locator('.tbStatusChip')
  await scrollTarget(chip)
  await chip.focus()
  await page.keyboard.press('Enter')
  const menu = statusMenu()
  await menu.waitFor({ state: 'visible' })
  const radioStates = await menu.getByRole('menuitemradio').evaluateAll((items) => items.map((item) => ({
    label: item.textContent.trim(), checked: item.getAttribute('aria-checked'),
  })))
  check('Keyboard opens exactly five status radios with only the current status checked', radioStates.length === 5
    && JSON.stringify(radioStates.map((item) => item.label)) === JSON.stringify(Object.values(STATUSES))
    && radioStates.filter((item) => item.checked === 'true').length === 1
    && radioStates.find((item) => item.checked === 'true')?.label === '待办', radioStates)

  const geometry = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const bounds = element.closest('.tbRoot')?.getBoundingClientRect()
    const points = [[5, 5], [rect.width - 5, 5], [5, rect.height - 5], [rect.width - 5, rect.height - 5], [rect.width / 2, rect.height / 2]]
    const hits = points.map(([x, y]) => element.contains(document.elementFromPoint(rect.left + x, rect.top + y)))
    return {
      width: rect.width, height: rect.height, hits,
      insideRoot: Boolean(bounds && rect.left >= bounds.left - 2 && rect.right <= bounds.right + 2 && rect.top >= bounds.top - 2 && rect.bottom <= bounds.bottom + 2),
      insideViewport: rect.left >= 0 && rect.right <= innerWidth + 2 && rect.top >= 0 && rect.bottom <= innerHeight + 2,
      cardOrGroupAncestor: Boolean(element.closest('.tbCard, .tbChild, .tbGroup, .tbGroups')),
    }
  })
  check('Status menu center and all four corners are unobstructed', geometry.width > 0 && geometry.height > 0 && geometry.hits.every(Boolean), geometry)
  check('Status popover is outside clipping card/group ancestors and inside its frame', !geometry.cardOrGroupAncestor && geometry.insideRoot && geometry.insideViewport, geometry)
  await screenshot('status-menu')
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })
  check('Escape dismisses the status menu and restores chip focus', await chip.evaluate((element) => document.activeElement === element))

  await chip.click()
  await menu.waitFor({ state: 'visible' })
  await menu.getByRole('menuitemradio', { name: '废弃', exact: true }).click()
  await menu.waitFor({ state: 'hidden' })
  const tasks = await waitTasks([{ id: alpha.id, status: 'dropped', parentId: null }])
  check('Selecting status menu radio changes real server state without reparenting', tasks.find((task) => task.id === alpha.id)?.status === 'dropped'
    && await group('dropped').locator(`.tbGroupBody > .tbCard[data-task-id="${alpha.id}"]`).isVisible())

  await page.setViewportSize({ width: 500, height: 950 })
  const edgeTask = makeTask('edge-source', '真实指针边缘滚动源')
  await reset([edgeTask, makeTask('edge-ongoing', '持续性目标卡', 'ongoing'), makeTask('edge-dropped', '废弃目标卡', 'dropped')])
  const layout = await boardLayout()
  check('Narrow drag fixture has real internal overflow, never a stacked board', layout.oneRow && layout.minWidth && layout.mustOverflow && layout.noOuterOverflow, layout)
  const edgePoint = async (direction) => {
    const bounds = await boardViewport.evaluate((element) => {
      const rect = element.getBoundingClientRect(), header = element.querySelector('.tbGroupHead').getBoundingClientRect()
      return { left: rect.left + element.clientLeft, right: rect.left + element.clientLeft + element.clientWidth,
        y: header.top + header.height / 2, scroll: element.scrollLeft, max: element.scrollWidth - element.clientWidth }
    })
    return { ...bounds, x: direction === 'right' ? bounds.right - 6 : bounds.left + 6 }
  }
  const scrollIsStable = () => boardViewport.evaluate(async (element) => {
    const positions = [element.scrollLeft]
    for (let frame = 0; frame < 12; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      positions.push(element.scrollLeft)
    }
    return { positions, stable: positions.every((value) => Math.abs(value - positions[0]) <= 1) }
  })
  const waitForEdgeColumn = async (point, status, direction) => {
    await page.mouse.move(point.x, point.y, { steps: 12 })
    // No scrollLeft assignment, wheel event, scrollIntoView or pointer helper
    // occurs while waiting: runtime rAF must advance the board under the pointer.
    await page.waitForFunction(({ point, status, direction }) => {
      const viewport = document.querySelector('.tbBoardViewport')
      const target = document.elementFromPoint(point.x, point.y)?.closest('.tbGroup[data-status]')
      const moved = direction === 'right' ? viewport.scrollLeft > point.scroll + 30 : viewport.scrollLeft < point.scroll - 30
      return moved && target?.dataset.status === status && target.classList.contains('tbGroupOver')
    }, { point, status, direction }, { polling: 'raf' })
  }
  await boardViewport.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0 })
  await pointerStart(edgeTask.id)
  try {
    const point = await edgePoint('right')
    await waitForEdgeColumn(point, 'ongoing', 'right')
    check('An active real pointer at the right edge auto-scrolls into the ongoing column', await boardViewport.evaluate((element) => element.scrollLeft) > point.scroll + 30)
  } finally {
    await page.mouse.up()
  }
  await waitTasks([{ id: edgeTask.id, status: 'ongoing', parentId: null, settledAt: null }])
  await page.waitForFunction(() => !document.querySelector('.tbDragging,.tbGroupOver'))
  const afterRightRelease = await scrollIsStable()
  check('Releasing an edge drag clears indicators and stops scrolling before the boundary', afterRightRelease.stable
    && await boardViewport.evaluate((element) => element.scrollLeft < element.scrollWidth - element.clientWidth - 20), afterRightRelease)

  // Scroll to the last column before starting; source helper then centers the
  // actual ongoing source. Runtime alone must travel LEFT back into todo.
  await boardViewport.evaluate((element) => { element.scrollLeft = element.scrollWidth })
  await pointerStart(edgeTask.id)
  try {
    const point = await edgePoint('left')
    await waitForEdgeColumn(point, 'todo', 'left')
    check('An active real pointer also auto-scrolls left out of ongoing', await boardViewport.evaluate((element) => element.scrollLeft) < point.scroll - 30)
  } finally {
    await page.mouse.up()
  }
  await waitTasks([{ id: edgeTask.id, status: 'todo', parentId: null, settledAt: null }])

  for (const cancellation of ['Escape', 'blur']) {
    await boardViewport.evaluate((element) => { element.scrollLeft = 0; element.scrollTop = 0 })
    const beforeCancel = await state()
    writes.length = 0
    page.on('request', trackWrite)
    try {
      await pointerStart(edgeTask.id)
      const point = await edgePoint('right')
      try {
        await page.mouse.move(point.x, point.y, { steps: 12 })
        await page.waitForFunction((start) => document.querySelector('.tbBoardViewport').scrollLeft > start + 70, point.scroll, { polling: 'raf' })
        check(`${cancellation}: cancellation is exercised during real movement, not at a scroll boundary`, await boardViewport.evaluate((element) => element.scrollLeft > 0
          && element.scrollLeft < element.scrollWidth - element.clientWidth - 60))
        if (cancellation === 'Escape') await page.keyboard.press('Escape')
        else await page.evaluate(() => window.dispatchEvent(new Event('blur')))
        await page.waitForFunction(() => !document.querySelector('.tbDragging,.tbGroupOver,.tbDropPending,.tbDropInto,.tbDropBefore,.tbDropAfter'))
        const stopped = await scrollIsStable()
        check(`${cancellation}: cleanup removes every drag indicator and cancels edge-scroll frames`, stopped.stable, stopped)
      } finally {
        await page.mouse.up()
      }
      await paint()
      check(`${cancellation}: subsequent pointer release commits no status or tree change`, writes.length === 0 && JSON.stringify(await state()) === JSON.stringify(beforeCancel), writes)
    } finally {
      page.off('request', trackWrite)
    }
  }
  const afterEdges = await boardLayout()
  check('Edge scrolling never moves the toolbar, summary, outer scroller or document', afterEdges.noOuterOverflow, afterEdges.outer)
})
