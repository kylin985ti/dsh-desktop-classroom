import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { runSuite, makeTask, isolatedConfig } from './e2e-redesign.mjs'
isolatedConfig()
await runSuite('gantt-edit', async ({ page, root, reset, state, reload, paint, check, screenshot, waitTasks, expectHttpFailure }) => {
  await page.clock.setFixedTime(new Date('2030-02-15T12:00:00+08:00'))
  const tasks = [
    makeTask('project', '分支平移验收项目', 'doing', null, { planMode: 'manual', planStartDate: '2030-02-01', planEndDate: '2030-02-28' }),
    makeTask('child', '可拖动的子任务', 'doing', 'project', { planStartDate: '2030-02-10', planEndDate: '2030-02-13', assignee: '保留负责人', note: '保留笔记' }),
    makeTask('nested', '嵌套自动项目', 'todo', 'project', { planMode: 'auto' }),
    makeTask('deep', '三级子任务', 'todo', 'nested', { planStartDate: '2030-02-12', planEndDate: '2030-02-15' }),
    makeTask('hidden', '隐藏的已完成任务', 'done', 'project', { planStartDate: '2030-02-08', planEndDate: '2030-02-09', settledAt: '2000-01-01T00:00:00Z' }),
    makeTask('deadline', '仅截止任务', 'todo', null, { planEndDate: '2030-02-18' }),
    makeTask('unrelated', '无关任务', 'ongoing'),
  ]
  await reset(tasks)
  const initial = await state(), writes = []
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/state/write')) writes.push(request.postDataJSON()) })
  const chart = root.locator('.tbGantt'), row = id => chart.locator(`.tbGanttRow[data-task-id="${id}"]`)
  const bar = id => row(id).locator('.tbGanttBar,.tbGanttSummary,.tbGanttDeadline').first()
  const open = async () => { await root.getByRole('navigation', { name: '任务栏视图', exact: true }).getByRole('button', { name: '甘特图', exact: true }).click(); await chart.waitFor(); await paint() }
  const value = async id => (await state()).find(task => task.id === id)
  const dates = id => row(id).locator('time').evaluateAll(nodes => nodes.map(node => node.dateTime))
  const drag = async (target, days, { cancel = false, beforeDrop } = {}) => {
    await target.scrollIntoViewIfNeeded(); await paint()
    await target.evaluate(node => {
      if (!node.classList.contains('tbGanttResize') && !node.classList.contains('tbGanttDeadline')) return
      const rect = node.getBoundingClientRect(), viewport = node.closest('.tbGanttViewport'), frame = viewport.getBoundingClientRect()
      const frozen = node.closest('.tbGanttRow').querySelector('.tbGanttLeft').getBoundingClientRect()
      viewport.scrollLeft += rect.left + rect.width / 2 - (frozen.right + frame.right) / 2
    }); await paint()
    const point = await target.evaluate(node => {
      const rect = node.getBoundingClientRect(), viewport = node.closest('.tbGanttViewport').getBoundingClientRect()
      const left = node.closest('.tbGanttRow').querySelector('.tbGanttLeft').getBoundingClientRect().right
      return { x: (Math.max(rect.left, left + 30) + Math.min(rect.right, viewport.right - 40)) / 2, y: rect.top + rect.height / 2 }
    })
    await page.mouse.move(point.x, point.y); await page.mouse.down()
    await page.mouse.move(point.x + days * 30, point.y, { steps: 8 }); await paint()
    if (beforeDrop) await beforeDrop()
    if (cancel) await page.keyboard.press('Escape')
    await page.mouse.up(); await paint()
    if (!cancel && days) await chart.locator('.tbGanttEditFeedback').filter({ hasText: /已保存|无法|原计划/ }).waitFor()
  }
  await open()
  check('Stable outline and parent labels distinguish three hierarchy levels', /^\d+$/.test(await row('project').getAttribute('data-outline'))
    && await row('deep').getAttribute('data-depth') === '2' && (await row('deep').getAttribute('aria-label')).includes('嵌套自动项目')
    && await row('nested').locator('.tbGanttParentBadge').count() === 1)
  check('Branch rail and non-color connector accompany existing status semantics', await row('child').locator('.tbGanttBranch').count() === 1
    && await row('child').getAttribute('data-group') === await row('project').getAttribute('data-group')
    && await row('child').locator('.tbGanttStatusDot').getAttribute('aria-label') === '进行中')
  await chart.getByText('操作与层级示意', { exact: true }).click()
  check('Visible guide explains hierarchy, full-branch movement and parent bounds', await chart.locator('.tbGanttGuideBody').isVisible()
    && (await chart.locator('.tbGanttGuideBody').innerText()).includes('含隐藏的已完成任务'))
  await screenshot('hierarchy-guide-light'); await chart.getByText('操作与层级示意', { exact: true }).click()
  check('Opening chart and guide performs no task writes', writes.length === 0)
  await drag(bar('child'), 2, { beforeDrop: async () => {
    check('Pointer movement shows live preview without persisting before release', (await chart.locator('.tbGanttEditFeedback').innerText()).includes('2030-02-12') && writes.length === 0)
    check('Preview dates update the same row while task store is unchanged', isDeepStrictEqual(await dates('child'), ['2030-02-12', '2030-02-15']) && (await value('child')).planStartDate === '2030-02-10')
  } })
  await waitTasks([{ id: 'child', planStartDate: '2030-02-12', planEndDate: '2030-02-15' }])
  check('Release saves exactly one task write and does not accidentally open detail', writes.length === 1 && await chart.isVisible())
  const childAfter = await value('child')
  check('Moving a leaf preserves note, owner, status and actual timestamps', childAfter.assignee === initial[1].assignee && childAfter.note === initial[1].note && childAfter.status === initial[1].status && childAfter.settledAt === initial[1].settledAt)
  await row('child').locator('.tbGanttTaskTitle').click()
  const planSection = root.locator('.tbPlanSection')
  check('Detail immediately reflects the dragged plan from the same persisted record', (await planSection.innerText()).includes('2030-02-12') && (await planSection.innerText()).includes('2030-02-15'))
  await root.getByRole('button', { name: '← 返回甘特图', exact: true }).click(); await paint()
  await drag(row('child').locator('.tbGanttResize-start'), -1)
  check('Dragging the start endpoint changes only the start date', (await value('child')).planStartDate === '2030-02-11' && (await value('child')).planEndDate === '2030-02-15')
  await drag(row('child').locator('.tbGanttResize-end'), 1)
  check('Dragging the end endpoint changes only the end date', (await value('child')).planStartDate === '2030-02-11' && (await value('child')).planEndDate === '2030-02-16')
  const beforeParent = await state(), countBeforeParent = writes.length
  await drag(bar('project'), 2)
  await waitTasks([{ id: 'project', planStartDate: '2030-02-03' }, { id: 'hidden', planStartDate: '2030-02-10' }])
  check('Parent movement shifts the whole branch, including nested AUTO projects and hidden completed plans',
    (await value('child')).planStartDate === '2030-02-13' && (await value('deep')).planEndDate === '2030-02-17'
    && (await value('hidden')).settledAt === beforeParent.find(task => task.id === 'hidden').settledAt
    && (await value('nested')).planMode === 'auto' && !Object.hasOwn(await value('nested'), 'planStartDate') && await row('hidden').count() === 0)
  check('Whole branch saves atomically once and leaves unrelated records untouched', writes.length === countBeforeParent + 1 && isDeepStrictEqual(await value('unrelated'), beforeParent.find(task => task.id === 'unrelated')))
  const resize = row('project').locator('.tbGanttResize-end'), childBeforeResize = await value('child')
  await resize.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter'); await paint()
  await waitTasks([{ id: 'project', planEndDate: '2030-02-28' }])
  check('Parent endpoint resize keeps descendant dates unchanged', isDeepStrictEqual(await value('child'), childBeforeResize))
  const boundaryBefore = await state(), boundaryWrites = writes.length
  await resize.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft')
  check('Parent boundary conflict is visible during preview', (await chart.locator('.tbGanttEditFeedback').innerText()).includes('无法保存'))
  await page.keyboard.press('Enter'); await paint()
  check('Invalid shrink is rejected without a partial write or child displacement', writes.length === boundaryWrites && isDeepStrictEqual(await state(), boundaryBefore))
  await drag(bar('child'), 1, { cancel: true })
  check('Escape during a real pointer drag cancels without saving', writes.length === boundaryWrites && isDeepStrictEqual(await state(), boundaryBefore))
  await drag(bar('child'), 0)
  check('A no-motion bar click retains ordinary detail navigation', await root.locator('.tbDetailTitleLine').isVisible())
  await root.getByRole('button', { name: '← 返回甘特图', exact: true }).click(); await paint()
  await bar('child').focus(); await page.keyboard.press('Alt+ArrowRight'); await page.keyboard.press('Escape'); await paint()
  check('Keyboard move preview also supports Escape without persisting', writes.length === boundaryWrites)
  const autoStart = row('nested').locator('.tbGanttResize-start')
  await autoStart.focus(); await page.keyboard.press('ArrowLeft')
  check('Resizing an AUTO parent explicitly previews conversion to manual plan', (await chart.locator('.tbGanttEditFeedback').innerText()).includes('改为手动计划'))
  await page.keyboard.press('Enter'); await waitTasks([{ id: 'nested', planMode: 'manual', planStartDate: '2030-02-13', planEndDate: '2030-02-17' }])
  check('Automatic-to-manual conversion persists exact effective dates without shifting its child', (await value('deep')).planStartDate === '2030-02-14')
  await drag(bar('deadline'), 1)
  check('Deadline-only diamond can move without inventing a start date', (await value('deadline')).planEndDate === '2030-02-19' && !Object.hasOwn(await value('deadline'), 'planStartDate'))
  const failedBefore = await state()
  expectHttpFailure('/api/dsh-task-board/state/write', 500)
  await page.route('**/api/dsh-task-board/state/write', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '隔离验收：模拟保存失败' }) }), { times: 1 })
  await drag(row('child').locator('.tbGanttResize-end'), -1)
  check('Save failure rolls back visible dates and persisted state together', isDeepStrictEqual(await state(), failedBefore) && isDeepStrictEqual(await dates('child'), [failedBefore[1].planStartDate, failedBefore[1].planEndDate])
    && (await chart.locator('.tbGanttEditFeedback').innerText()).includes('原计划已保留'))
  await screenshot('editable-gantt-light')
  await page.emulateMedia({ colorScheme: 'dark' }); await screenshot('editable-gantt-dark')
  await page.setViewportSize({ width: 680, height: 950 }); await paint(); await screenshot('editable-gantt-narrow')
  check('Narrow layout keeps the chart bounded with a single scroll surface', await chart.locator('.tbGanttViewport').count() === 1 && await chart.evaluate(node => node.getBoundingClientRect().right <= innerWidth + 1))
  await reload(); await open()
  check('Reload reads the same successfully persisted dates and keeps completed plans hidden', isDeepStrictEqual(await dates('child'), [failedBefore[1].planStartDate, failedBefore[1].planEndDate]) && await row('hidden').count() === 0)
})
