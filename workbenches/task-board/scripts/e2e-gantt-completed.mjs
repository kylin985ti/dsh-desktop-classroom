/** Completed-project visibility, using only synthetic tasks in an isolated DSH host. */
import { isDeepStrictEqual } from 'node:util'
import { runSuite, makeTask, isolatedConfig } from './e2e-redesign.mjs'

isolatedConfig()
await runSuite('gantt-completed', async ({ page, root, reset, reload, state, check, paint, screenshot, waitTasks }) => {
  await page.clock.setFixedTime(new Date('2030-02-15T12:00:00+08:00'))
  const plan = { planStartDate: '2030-02-05', planEndDate: '2030-02-08' }
  const tasks = [
    makeTask('daily-project', '日常进行中的项目', 'doing', null, { planMode: 'manual', planStartDate: '2030-02-01', planEndDate: '2030-02-28' }),
    makeTask('daily-child', '尚未完成的下级', 'doing', 'daily-project', plan),
    makeTask('completed-child', '已完成的下级', 'done', 'daily-project', { ...plan, settledAt: '2000-01-01T00:00:00Z' }),
    makeTask('today-completed', '今天刚完成的项目', 'done', null, { ...plan, settledAt: '2030-02-15T04:00:00Z' }),
    makeTask('old-project', '历史已完成项目', 'done', null, { planMode: 'auto' }),
    makeTask('old-child', '已完成项目下仍保留状态的下级', 'doing', 'old-project', { planStartDate: '1990-01-01', planEndDate: '1990-01-04', assignee: '仅历史项目的负责人' }),
    makeTask('old-grandchild', '历史项目深层下级', 'todo', 'old-child', { planStartDate: '1990-01-02', planEndDate: '1990-01-03' }),
    makeTask('ongoing-undated', '未排期的持续性工作', 'ongoing'),
    makeTask('cancelled-project', '废弃任务保持原有口径', 'dropped', null, plan),
    makeTask('summary-project', '仅下级已完成的自动父任务', 'doing'),
    makeTask('summary-completed', '自动汇总中的历史计划', 'done', 'summary-project', plan),
  ]
  await reset(tasks)
  const initial = await state(), writes = []
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request)
  })
  const nav = root.getByRole('navigation', { name: '任务栏视图', exact: true })
  const chart = () => root.locator('.tbGantt')
  const row = id => chart().locator(`.tbGanttRow[data-task-id="${id}"]`)
  const ids = () => chart().locator('.tbGanttRow').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  const toggle = () => chart().getByRole('button', { name: '显示已完成', exact: true })
  const open = async () => { await nav.getByRole('button', { name: '甘特图', exact: true }).click(); await chart().waitFor(); await paint() }
  const back = async () => { await root.getByRole('button', { name: '← 返回甘特图', exact: true }).click(); await chart().waitFor(); await paint() }
  const activeIds = ['daily-project', 'daily-child', 'ongoing-undated', 'cancelled-project', 'summary-project']

  await open()
  check('Completed visibility is off by default, including tasks completed today', await toggle().getAttribute('aria-pressed') === 'false' && await row('today-completed').count() === 0)
  check('Default Gantt omits completed rows and the complete historical project branch', isDeepStrictEqual(new Set(await ids()), new Set(activeIds)))
  check('Incomplete children under an active project remain visible with their original hierarchy', await row('daily-child').getAttribute('data-depth') === '1' && await row('daily-child').getAttribute('data-status') === 'doing')
  check('Unscheduled ongoing work and the existing dropped-task rule are preserved', await row('ongoing-undated').getAttribute('data-plan-kind') === 'empty' && await row('cancelled-project').getAttribute('data-status') === 'dropped')
  check('Hidden completed projects do not stretch the daily time axis or create an owner column', !await chart().locator('.tbGanttRange').textContent().then(text => text.includes('1990')) && await chart().getAttribute('data-has-owners') === 'false')
  check('Toolbar and footer counts describe the filtered tasks and disclose hidden descendants', (await chart().locator('.tbGanttCount').innerText()).trim() === '5 项' && (await chart().locator('.tbGanttFooter').innerText()).includes('已隐藏 6 项'))
  const summaryDates = await row('summary-project').locator('time').evaluateAll(nodes => nodes.map(node => node.dateTime))
  check('Filtering never recalculates an auto parent from an incomplete task subset', isDeepStrictEqual(summaryDates, ['2030-02-05', '2030-02-08']) && await row('summary-project').getAttribute('data-auto') === 'true')
  check('A parent with only hidden completed children has no empty expand control', await row('summary-project').locator('.tbGanttFold').count() === 0)
  await screenshot('daily-default')

  await toggle().focus(); await page.keyboard.press('Space'); await paint()
  check('Keyboard activation reveals every original task, including deep descendants of completed projects', await toggle().getAttribute('aria-pressed') === 'true' && isDeepStrictEqual(new Set(await ids()), new Set(tasks.map(task => task.id))))
  check('Historical plans, owner metadata and the expanded count return only when requested', await chart().getAttribute('data-has-owners') === 'true' && (await chart().locator('.tbGanttCount').innerText()).trim() === '11 项' && await row('old-grandchild').getAttribute('data-depth') === '2')
  check('Completed-only children regain their normal expand control when history is shown', await row('summary-project').locator('.tbGanttFold').count() === 1)
  await screenshot('show-completed')
  await row('daily-project').getByRole('button', { name: '折叠日常进行中的项目的下级任务', exact: true }).click()
  await toggle().click(); await toggle().click(); await paint()
  check('Visibility toggling preserves independent project fold state', await row('daily-child').count() === 0 && await row('daily-project').getByRole('button', { name: '展开日常进行中的项目的下级任务', exact: true }).count() === 1)
  await row('daily-project').getByRole('button', { name: '展开日常进行中的项目的下级任务', exact: true }).click()

  await row('daily-project').locator('.tbGanttTaskTitle').click()
  await root.locator('.tbPlanSection').getByRole('button', { name: '查看甘特图', exact: true }).click()
  await root.locator('.tbGantt[data-scope="daily-project"]').waitFor()
  check('A newly opened project scope defaults to hiding completed children independently of global history', await toggle().getAttribute('aria-pressed') === 'false' && isDeepStrictEqual(new Set(await ids()), new Set(['daily-project', 'daily-child'])))
  await toggle().click(); await row('completed-child').locator('.tbGanttTaskTitle').click(); await back()
  check('Opening a historical task and returning keeps the chosen scope and completed visibility', await chart().getAttribute('data-scope') === 'daily-project' && await toggle().getAttribute('aria-pressed') === 'true' && await row('completed-child').count() === 1)
  await chart().getByRole('button', { name: '返回全部任务甘特图', exact: true }).click(); await paint()
  check('Returning globally restores the global completed-visibility choice', await chart().getAttribute('data-scope') === 'all' && await toggle().getAttribute('aria-pressed') === 'true')
  await row('old-project').locator('.tbGanttTaskTitle').click()
  await root.locator('.tbPlanSection').getByRole('button', { name: '查看甘特图', exact: true }).click()
  await root.locator('.tbGantt[data-scope="old-project"]').waitFor()
  check('A completed-only scope explains the filter instead of falsely saying the task was deleted', (await ids()).length === 0 && (await chart().locator('.tbGanttNoTasks').innerText()).includes('点击“显示已完成”查看') && !await chart().locator('.tbGanttNoTasks').innerText().then(text => text.includes('已被删除')))
  await toggle().click(); await paint()
  check('The empty-scope toggle reveals the completed project and all original descendant states', (await ids()).length === 3 && await row('old-child').getAttribute('data-status') === 'doing')
  await open(); await toggle().click(); await paint()
  check('Browsing, history toggles, folds and scope changes produce zero task writes', writes.length === 0 && isDeepStrictEqual(await state(), initial))

  await row('daily-child').locator('.tbGanttTaskTitle').click()
  await root.locator('.tbDetailTitleLine').getByRole('button', { name: '修改尚未完成的下级的状态：进行中', exact: true }).click()
  await root.getByRole('menu', { name: '选择状态', exact: true }).getByRole('menuitemradio', { name: '完成', exact: true }).click()
  await waitTasks([{ id: 'daily-child', status: 'done' }]); await back()
  check('A task just completed through the real UI disappears from daily Gantt immediately on return', await toggle().getAttribute('aria-pressed') === 'false' && await row('daily-child').count() === 0)
  const afterCompletion = await state()
  check('The explicit completion is the only write, leaving all task plans and unrelated records intact', writes.length === 1 && afterCompletion.every((task, index) => task.id === 'daily-child'
    ? isDeepStrictEqual({ ...task, status: initial[index].status, updatedAt: initial[index].updatedAt, settledAt: initial[index].settledAt }, initial[index])
    : isDeepStrictEqual(task, initial[index])))
  await toggle().click()
  check('The completed task is recoverable through the display toggle with its original dates', await row('daily-child').getAttribute('data-status') === 'done' && isDeepStrictEqual(await row('daily-child').locator('time').evaluateAll(nodes => nodes.map(node => node.dateTime)), ['2030-02-05', '2030-02-08']))

  await page.setViewportSize({ width: 360, height: 720 }); await paint()
  const bounds = await toggle().boundingBox()
  check('The completed-visibility button remains reachable in a narrow viewport', bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 362 && bounds.y + bounds.height <= 720)
  await toggle().focus(); await page.keyboard.press('Enter'); await paint()
  check('Keyboard Enter hides completed rows again on narrow screens without writes', await toggle().getAttribute('aria-pressed') === 'false' && await row('daily-child').count() === 0 && writes.length === 1)
  await screenshot('narrow-default')
  await toggle().click(); await reload(); await open()
  check('A fresh application load resets daily visibility to hidden rather than persisting history-on', await toggle().getAttribute('aria-pressed') === 'false' && await row('daily-child').count() === 0 && await row('old-project').count() === 0)
  check('Reload and display preferences never rewrite the acknowledged task state', writes.length === 1 && isDeepStrictEqual(await state(), afterCompletion))
})
