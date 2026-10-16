/**
 * Actual-browser schedule/Gantt regression, backed by ONE isolated API fixture.
 * No Desktop defaults, mocked persistence, synthetic pointer events or extra server.
 *
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-gantt.mjs
 * The shared harness validates isolation before launching Chromium or writing.
 */
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { makeTask, runSuite, isolatedConfig } from './e2e-redesign.mjs'
import { dateToDay, getSchedules } from '../dsh/schedule-model.js'

const EMPTY_HINT = '请备注起始和完成时间点'
const DAY_MS = 86400000
const FIXED_TIME = '2025-06-15T12:00:00.000Z'
const OLD_TIME = '2000-01-02T03:04:05.000Z'
const PLAN_FIELDS = ['planStartDate', 'planEndDate', 'planMode', 'assignee']
const addDays = (date, offset) => new Date(Date.parse(`${date}T00:00:00.000Z`) + offset * DAY_MS).toISOString().slice(0, 10)
const without = (task, fields) => Object.fromEntries(Object.entries(task).filter(([key]) => !fields.includes(key)))

// The suite itself has no filesystem fixture: domains carry metadata but no path.
function fixtureFor(today) {
  const date = offset => addDays(today, offset)
  const make = (id, title, status = 'todo', parentId = null, fields = {}) => makeTask(id, title, status, parentId, {
    note: `隔离甘特图笔记：${id}\n原有内容与身份不能因为排期而变化 ✓`,
    domain: { path: null, kind: 'code', workspaceId: 'gantt-fixture-workspace' },
    createdAt: '1999-01-01T00:00:00.000Z', updatedAt: OLD_TIME, settledAt: OLD_TIME, ...fields,
  })
  const tasks = [
    make('g-auto', '自动汇总项目', 'doing', null, { assignee: '林' }),
    make('g-bar', '完整排期子任务', 'doing', 'g-auto', { planStartDate: date(-12), planEndDate: date(-6), assignee: '安' }),
    make('g-point', '只有完成日期的任务', 'todo', 'g-auto', { planEndDate: date(2) }),
    make('g-start-only', '只有开始日期的任务', 'todo', 'g-auto', { planStartDate: date(-8) }),
    make('g-nested', '自动项目二级分支', 'ongoing', 'g-auto'),
    make('g-level3', '自动项目三级分支', 'todo', 'g-nested'),
    make('g-four', '自动项目四级任务', 'todo', 'g-level3', { planStartDate: date(3), planEndDate: date(5) }),
    make('g-deep-old-done', '往日完成的深层任务', 'done', 'g-nested', { planStartDate: date(-5), planEndDate: date(-4) }),
    make('g-manual', '手动边界项目', 'doing', null, { planStartDate: date(10), planEndDate: date(40), planMode: 'manual' }),
    make('g-manual-child', '受约束的直接子任务', 'todo', 'g-manual', { planStartDate: date(12), planEndDate: date(16) }),
    make('g-manual-middle', '手动项目自动中转', 'ongoing', 'g-manual'),
    make('g-manual-level3', '手动项目三级中转', 'doing', 'g-manual-middle'),
    make('g-manual-four', '受约束的四级任务', 'todo', 'g-manual-level3', { planStartDate: date(22), planEndDate: date(24) }),
    make('g-ongoing', '未排期持续性工作', 'ongoing'),
    make('g-one-day', '同日开始完成任务', 'todo', null, { planStartDate: date(6), planEndDate: date(6), assignee: '' }),
    make('g-old-done', '往日已完成一级任务', 'done', null, { planStartDate: date(-10), planEndDate: date(-8) }),
    make('g-old-dropped', '往日已废弃一级任务', 'dropped', null, { planEndDate: date(-2) }),
    make('g-move-origin', '待移动任务的原父级', 'todo'),
    make('g-move-branch', '将整棵移动的分支', 'doing', 'g-move-origin'),
    make('g-move-deep', '移动分支的越界深层任务', 'ongoing', 'g-move-branch', { planStartDate: date(60), planEndDate: date(65) }),
    make('g-no-owner', '没有负责人的分支', 'todo'),
    make('g-no-owner-child', '空白负责人子任务', 'todo', 'g-no-owner', { planStartDate: date(1), planEndDate: date(3), assignee: '   ' }),
    ...Array.from({ length: 10 }, (_, index) => make(`g-auto-filler-${index}`, `自动项目滚动子任务 ${index + 1}`, 'todo', 'g-auto', {
      planStartDate: date(0), planEndDate: date(2),
    })),
    ...Array.from({ length: 15 }, (_, index) => make(`g-root-filler-${index}`, `全局滚动任务 ${index + 1}`, 'todo', null, {
      planStartDate: date(-1), planEndDate: date(1),
    })),
  ]
  return tasks.map((task, sortIndex) => ({ ...task, sortIndex }))
}

// Explicitly guard before runSuite as well: this file is intentionally executable,
// never an instruction to discover, launch or mutate a normal Desktop instance.
isolatedConfig()
await runSuite('gantt', async ({
  page, root, check, enter, reset, reload, state, waitTasks, openDetail, counts, paint, screenshot,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_TIME))
  await enter()
  const localToday = () => page.evaluate(() => {
    const now = new Date(), pad = value => String(value).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  })
  const firstToday = await localToday()
  const date = offset => addDays(firstToday, offset)
  const fixture = fixtureFor(firstToday)
  const byId = new Map(fixture.map(task => [task.id, task]))
  // ONLY authorized fixture replacement in this suite. Every later write is a UI action.
  await reset(fixture)
  const initial = await state()
  check('One isolated fixture preserves original task identities, notes, domains, chronology and optional-field absence',
    isDeepStrictEqual(initial, fixture))

  const nav = root.getByRole('navigation', { name: '任务栏视图', exact: true })
  const chart = () => root.locator('.tbGantt')
  const viewport = () => chart().locator('.tbGanttViewport')
  const rows = () => chart().locator('.tbGanttRow[data-task-id]')
  const row = id => chart().locator(`.tbGanttRow[data-task-id="${id}"]`)
  const planSection = () => root.locator('.tbPlanSection[aria-label="计划与负责人"]')
  const planForm = () => planSection().locator('form.tbPlanForm')
  const planInput = label => planSection().getByLabel(label, { exact: true })
  const unsavedDialog = () => root.getByRole('dialog', { name: '未保存的计划修改', exact: true })
  const writes = []
  const trackWrite = request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/dsh-task-board/state/write') writes.push(request.postDataJSON())
  }
  page.on('request', trackWrite)

  const globalGantt = async () => {
    await nav.getByRole('button', { name: '甘特图', exact: true }).click()
    await root.locator('.tbGantt[data-scope="all"]').waitFor({ state: 'visible' })
    await paint()
    const completed = chart().getByRole('button', { name: '显示已完成', exact: true })
    if (await completed.getAttribute('aria-pressed') !== 'true') await completed.click()
  }
  const detailFromChart = async id => {
    await row(id).locator('button.tbGanttTaskTitle').click()
    await planSection().waitFor({ state: 'visible' })
    assert.equal(await planSection().getAttribute('data-plan-task'), id)
    assert.equal(await root.getByLabel('任务标题', { exact: true }).inputValue(), byId.get(id).title)
  }
  const beginPlan = async id => {
    if (!await planForm().isVisible()) await planSection().getByRole('button', { name: `编辑${byId.get(id).title}的计划`, exact: true }).click()
    await planForm().waitFor({ state: 'visible' })
  }
  const cancelPlan = async () => {
    await planSection().getByRole('button', { name: '取消', exact: true }).click()
    await planForm().waitFor({ state: 'hidden' })
  }
  const returnToChart = async scope => {
    await root.getByRole('button', { name: '← 返回甘特图', exact: true }).click()
    await chart().waitFor({ state: 'visible' })
    assert.equal(await chart().getAttribute('data-scope'), scope ?? 'all')
    await paint()
  }
  const fillPlan = async fields => {
    if (Object.hasOwn(fields, 'planMode')) await planInput('父任务排期方式').selectOption(fields.planMode)
    if (Object.hasOwn(fields, 'planStartDate')) await planInput('计划开始日期').fill(fields.planStartDate)
    if (Object.hasOwn(fields, 'planEndDate')) await planInput('计划完成日期').fill(fields.planEndDate)
    if (Object.hasOwn(fields, 'assignee')) await planInput('负责人').fill(fields.assignee)
  }
  const assertOnlyPlanChanged = (label, before, after, id) => {
    const changed = after.find(task => task.id === id), previous = before.find(task => task.id === id)
    check(label, after.length === before.length && after.every((task, index) => task.id === before[index].id && (
      task.id === id ? isDeepStrictEqual(without(task, [...PLAN_FIELDS, 'updatedAt']), without(before[index], [...PLAN_FIELDS, 'updatedAt']))
        : isDeepStrictEqual(task, before[index]))) && changed?.updatedAt !== previous?.updatedAt
      && Number.isFinite(Date.parse(changed?.updatedAt)), { before: previous, after: changed })
  }
  const savePlan = async (id, fields, label) => {
    const before = await state(), beforeWrites = writes.length
    await fillPlan(fields)
    await planSection().getByRole('button', { name: '保存计划', exact: true }).click()
    await planForm().waitFor({ state: 'hidden' })
    const after = await waitTasks([{ id, ...fields }], { total: fixture.length })
    check(`${label}: exactly one real full-state API write`, writes.length === beforeWrites + 1 && writes.at(-1).tasks.length === fixture.length, writes.slice(beforeWrites))
    assertOnlyPlanChanged(`${label}: untouched tasks and every unrelated target field remain byte-value equivalent`, before, after, id)
    return after
  }
  const rejectPlan = async (id, fields, expectedText, label) => {
    const before = await state(), beforeWrites = writes.length
    await fillPlan(fields)
    await planSection().getByRole('button', { name: '保存计划', exact: true }).click()
    await planSection().locator('.tbErr[role="alert"]').waitFor({ state: 'visible' })
    const errors = (await root.getByRole('alert').allTextContents()).join('\n')
    check(`${label}: named actionable conflict is visible`, expectedText.every(part => errors.includes(part)) && /调整|修改|早于/.test(errors), errors)
    check(`${label}: no POST and API snapshot is unchanged`, writes.length === beforeWrites && isDeepStrictEqual(await state(), before), writes.slice(beforeWrites))
    check(`${label}: failed proposal stays editable with the exact dates/owner retained`, await planForm().isVisible()
      && await planSection().getAttribute('data-plan-task') === id
      && (!Object.hasOwn(fields, 'planStartDate') || await planInput('计划开始日期').inputValue() === fields.planStartDate)
      && (!Object.hasOwn(fields, 'planEndDate') || await planInput('计划完成日期').inputValue() === fields.planEndDate)
      && (!Object.hasOwn(fields, 'assignee') || await planInput('负责人').inputValue() === fields.assignee))
  }
  const scrollPosition = () => viewport().evaluate(element => ({ left: element.scrollLeft, top: element.scrollTop }))
  const scrollChart = async (left, top) => {
    await viewport().evaluate((element, position) => { element.scrollLeft = position.left; element.scrollTop = position.top }, { left, top })
    await paint()
    return scrollPosition()
  }
  const chartGeometry = () => chart().evaluate(element => {
    const viewport = element.querySelector('.tbGanttViewport'), head = element.querySelector('.tbGanttHeader')
    const leftHead = element.querySelector('.tbGanttLeftHead'), calendar = element.querySelector('.tbGanttCalendar')
    const box = target => {
      const rect = target.getBoundingClientRect()
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    const bounds = viewport.getBoundingClientRect(), headerBounds = head.getBoundingClientRect()
    const visible = [...element.querySelectorAll('.tbGanttRow')].find(row => {
      const rect = row.getBoundingClientRect()
      return rect.top >= headerBounds.bottom && rect.bottom <= bounds.bottom
    })
    const outer = [document.documentElement, document.body, ...document.querySelectorAll('.dshWbCustomFrame'),
      element.closest('.tbRoot'), element.closest('.tbRoot').querySelector('.tbBar'), element.parentElement, element,
      element.querySelector('.tbGanttToolbar'), element.querySelector('.tbGanttFooter')]
      .filter(node => node && node.getClientRects().length).map(node => ({
        name: node.className || node.tagName, width: node.clientWidth, scroll: node.scrollWidth,
        height: node.clientHeight, scrollHeight: node.scrollHeight, left: node.scrollLeft, top: node.scrollTop,
      }))
    const style = getComputedStyle(viewport)
    return {
      viewport: { ...box(viewport), clientWidth: viewport.clientWidth, clientHeight: viewport.clientHeight,
        clientLeft: viewport.clientLeft, clientTop: viewport.clientTop, scrollWidth: viewport.scrollWidth,
        scrollHeight: viewport.scrollHeight, left: viewport.scrollLeft, top: viewport.scrollTop,
        overflowX: style.overflowX, overflowY: style.overflowY },
      head: box(head), leftHead: box(leftHead), calendar: box(calendar),
      leftRow: visible ? box(visible.querySelector('.tbGanttLeft')) : null,
      today: box(element.querySelector('.tbGanttTodayLine')), todayHeader: box(element.querySelector('.tbGanttTodayMarker')),
      outer, doc: { width: document.documentElement.scrollWidth, client: innerWidth,
        height: document.documentElement.scrollHeight, clientHeight: innerHeight,
        left: document.scrollingElement.scrollLeft, top: document.scrollingElement.scrollTop },
    }
  })

  try {
    const expectedCounts = Object.fromEntries(['todo', 'doing', 'ongoing', 'done', 'dropped'].map(status => [status,
      fixture.filter(task => !task.parentId && task.status === status && !['done', 'dropped'].includes(task.status)).length]))
    check('Board root counts remain root-only and hide historical settlements independently of planning',
      isDeepStrictEqual(await counts(), expectedCounts) && await root.locator('.tbCard[data-task-id="g-old-done"],.tbCard[data-task-id="g-old-dropped"]').count() === 0)
    await globalGantt()
    const allIds = await rows().evaluateAll(elements => elements.map(element => element.dataset.taskId))
    check('Explicit historical Gantt includes ALL task IDs, every depth, old done and dropped records exactly once',
      allIds.length === fixture.length && new Set(allIds).size === fixture.length && fixture.every(task => allIds.includes(task.id)), allIds)
    check('Fourth-level tasks retain hierarchy depth, independent status and all historical descendants',
      await row('g-four').getAttribute('data-depth') === '3' && await row('g-manual-four').getAttribute('data-depth') === '3'
      && await row('g-deep-old-done').getAttribute('data-status') === 'done' && await row('g-old-dropped').getAttribute('data-status') === 'dropped')
    check('Global scope is explicitly historical and its count is not a board root counter',
      await chart().getByRole('heading', { name: '范围：全部任务', exact: true }).isVisible()
      && (await chart().locator('.tbGanttCount').textContent()).trim() === `${fixture.length} 项`
      && (await chart().locator('.tbGanttRange').textContent()).includes('含全部历史记录'))
    check('Fixed daily time axis has a today line and no day/week/month mode switch',
      await chart().getByRole('columnheader', { name: '每日时间轴', exact: true }).count() === 1
      && await chart().locator('.tbGanttTodayLine').count() === 1
      && await chart().locator('.tbGanttActions').getByRole('button', { name: /^(日|周|月|按日|按周|按月|日视图|周视图|月视图)$/ }).count() === 0
      && (await chart().locator('.tbGanttFooter').textContent()).includes('每日时间轴'))
    check('One-day complete plans are bars, end-only plans are diamonds without manufactured starts',
      await row('g-one-day').getAttribute('data-plan-kind') === 'bar' && await row('g-one-day').locator('.tbGanttBar').count() === 1
      && await row('g-point').getAttribute('data-plan-kind') === 'deadline' && await row('g-point').locator('.tbGanttDeadline .tbGanttDiamond').count() === 1
      && await row('g-point').locator('.tbGanttDates time').count() === 1
      && await row('g-point').locator('.tbGanttDates time').getAttribute('datetime') === date(2))
    for (const id of ['g-start-only', 'g-ongoing']) check(`${byId.get(id).title}: no end means no bar/deadline and the exact actionable hint`,
      await row(id).getAttribute('data-plan-kind') === 'empty'
      && await row(id).locator('.tbGanttBar,.tbGanttSummary,.tbGanttDeadline').count() === 0
      && (await row(id).locator('.tbGanttTimeline').textContent()).trim() === EMPTY_HINT
      && await row(id).getByRole('button', { name: `${EMPTY_HINT}：${byId.get(id).title}`, exact: true }).count() === 1)
    check('Only nonempty owner text is shown; missing/blank owners never gain an unassigned placeholder',
      (await row('g-bar').locator('.tbGanttOwner').textContent()).trim() === '安'
      && (await row('g-point').locator('.tbGanttOwner').textContent()).trim() === ''
      && (await row('g-no-owner-child').locator('.tbGanttOwner').textContent()).trim() === ''
      && await chart().getByText('未分配', { exact: true }).count() === 0)
    const barSizes = await chart().evaluate(element => ({
      day: parseFloat(element.style.getPropertyValue('--tb-gantt-day')),
      one: element.querySelector('[data-task-id="g-one-day"] .tbGanttBar').getBoundingClientRect().width,
      seven: element.querySelector('[data-task-id="g-bar"] .tbGanttBar').getBoundingClientRect().width,
      diamond: getComputedStyle(element.querySelector('[data-task-id="g-point"] .tbGanttDiamond')).transform,
    }))
    check('Bar widths include both endpoint days and the deadline marker is actually rotated', barSizes.one > 10
      && Math.abs(barSizes.seven - barSizes.one - 6 * barSizes.day) < 1 && barSizes.diamond !== 'none', barSizes)
    check('AUTO parents are visibly derived summaries with the correct missing-plan count',
      await row('g-auto').getAttribute('data-auto') === 'true' && await row('g-auto').locator('.tbGanttSummary').count() === 1
      && await row('g-auto').locator('.tbGanttDates time').evaluateAll(elements => elements.map(element => element.dateTime)).then(dates => isDeepStrictEqual(dates, [date(-12), date(5)]))
      && await row('g-auto').locator('.tbGanttPartialBadge').getAttribute('aria-label') === '1 个下级任务尚未形成排期')

    const beforeFold = await state(), beforeFoldWrites = writes.length
    const autoDescendants = getSchedules(beforeFold).get('g-auto').descendantCount
    await row('g-auto').getByRole('button', { name: '折叠自动汇总项目的下级任务', exact: true }).click()
    check('Collapsing a tree row hides every descendant but keeps the root and raw total',
      await rows().count() === fixture.length - autoDescendants && await row('g-bar').count() === 0
      && (await chart().locator('.tbGanttCount').textContent()).trim() === `${fixture.length} 项`)
    await row('g-auto').getByRole('button', { name: '展开自动汇总项目的下级任务', exact: true }).click()
    check('Expanding restores all levels without a write or changing root-count data',
      await rows().count() === fixture.length && isDeepStrictEqual(await state(), beforeFold) && writes.length === beforeFoldWrites)

    // Scope is reached through the actual detail action, never a direct component mount.
    await detailFromChart('g-auto')
    await planSection().getByRole('button', { name: '查看甘特图', exact: true }).click()
    await root.locator('.tbGantt[data-scope="g-auto"]').waitFor({ state: 'visible' })
    await chart().getByRole('button', { name: '显示已完成', exact: true }).click()
    const scopedIds = new Set(['g-auto', ...fixture.filter(task => task.id.startsWith('g-auto-filler-')).map(task => task.id),
      'g-bar', 'g-point', 'g-start-only', 'g-nested', 'g-level3', 'g-four', 'g-deep-old-done'])
    check('Detail Gantt scopes to the current branch and ALL descendants, excluding unrelated roots',
      await rows().count() === scopedIds.size && (await rows().evaluateAll(elements => elements.map(element => element.dataset.taskId))).every(id => scopedIds.has(id))
      && await row('g-four').count() === 1 && await row('g-old-done').count() === 0)
    await row('g-nested').getByRole('button', { name: '折叠自动项目二级分支的下级任务', exact: true }).click()
    check('Scoped tree folding is local and leaves the scoped total intact', await row('g-four').count() === 0
      && (await chart().locator('.tbGanttCount').textContent()).trim() === `${scopedIds.size} 项`)
    const scopedPosition = await scrollChart(250, 200)
    const visibleBarId = await viewport().evaluate(element => {
      const bounds = element.getBoundingClientRect(), head = element.querySelector('.tbGanttHeader').getBoundingClientRect()
      const frozenRight = element.querySelector('.tbGanttLeftHead').getBoundingClientRect().right
      return [...element.querySelectorAll('.tbGanttRow')].find(row => {
        const bar = row.querySelector('button.tbGanttBar')
        if (!bar) return false
        const rect = bar.getBoundingClientRect()
        return rect.top >= head.bottom + 1 && rect.bottom < bounds.bottom - 2
          && rect.left >= frozenRight + 2 && rect.right < bounds.right - 2
      })?.dataset.taskId || null
    })
    check('A real bar is fully visible for the chart-to-detail pointer interaction', Boolean(visibleBarId) && scopedPosition.left > 0 && scopedPosition.top > 0, { visibleBarId, scopedPosition })
    await row(visibleBarId).locator('button.tbGanttBar').click()
    await planSection().waitFor({ state: 'visible' })
    check('Clicking an actual timeline bar opens the matching task detail and return breadcrumb',
      await planSection().getAttribute('data-plan-task') === visibleBarId && await root.getByRole('button', { name: '← 返回甘特图', exact: true }).isVisible())
    await returnToChart('g-auto')
    const restoredScope = await scrollPosition()
    check('Returning from task detail restores branch scope, fold state and BOTH chart scroll axes',
      Math.abs(restoredScope.left - scopedPosition.left) <= 2 && Math.abs(restoredScope.top - scopedPosition.top) <= 2
      && await row('g-four').count() === 0, { before: scopedPosition, after: restoredScope })
    await globalGantt()
    check('Global and branch folds are independent, and global historical tasks remain present',
      await row('g-four').count() === 1 && await row('g-old-done').count() === 1 && await rows().count() === fixture.length)
    await detailFromChart('g-no-owner')
    await planSection().getByRole('button', { name: '查看甘特图', exact: true }).click()
    await root.locator('.tbGantt[data-scope="g-no-owner"]').waitFor({ state: 'visible' })
    check('Owner-free scopes omit the whole owner column rather than showing blank placeholders',
      await rows().count() === 2 && await chart().getAttribute('data-has-owners') === 'false'
      && await chart().locator('.tbGanttOwner,.tbGanttOwnerHead').count() === 0 && await chart().getByText('未分配', { exact: true }).count() === 0)
    await chart().getByRole('button', { name: '返回全部任务甘特图', exact: true }).click()
    await root.locator('.tbGantt[data-scope="all"]').waitFor({ state: 'visible' })
    check('Scope-all action returns to the complete global task graph without writing',
      await rows().count() === fixture.length && isDeepStrictEqual(await state(), initial) && writes.length === 0)

    await chart().getByRole('button', { name: '今天', exact: true }).click()
    await paint()
    check('Today navigation reveals the local calendar day; it never updates task schedules',
      await chart().locator(`.tbGanttDayToday[data-date="${firstToday}"]`).count() === 1 && isDeepStrictEqual(await state(), initial) && writes.length === 0)
    const dayLabels = await chart().locator('.tbGanttDay[data-date]').evaluateAll(elements => elements.map(element => element.dataset.date))
    check('Visible calendar ticks are truly consecutive daily dates, not a weekly/monthly substituted axis',
      dayLabels.length > 3 && dayLabels.slice(1).every((value, index) => dateToDay(value) - dateToDay(dayLabels[index]) === 1), dayLabels)
    const beforeGeometry = await scrollChart(100, 80)
    const baseGeometry = await chartGeometry()
    await scrollChart(beforeGeometry.left + 240, beforeGeometry.top + 180)
    const movedGeometry = await chartGeometry()
    check('One bounded, accessible Gantt viewport owns both scroll axes',
      ['auto', 'scroll'].includes(movedGeometry.viewport.overflowX) && ['auto', 'scroll'].includes(movedGeometry.viewport.overflowY)
      && movedGeometry.viewport.scrollWidth > movedGeometry.viewport.clientWidth && movedGeometry.viewport.scrollHeight > movedGeometry.viewport.clientHeight
      && await viewport().getAttribute('role') === 'region' && await viewport().getAttribute('tabindex') === '0', movedGeometry)
    check('Date header stays vertically fixed and task/date columns stay horizontally frozen while scrolling',
      Math.abs(movedGeometry.head.y - baseGeometry.head.y) <= 1 && Math.abs(movedGeometry.leftHead.x - baseGeometry.leftHead.x) <= 1
      && Math.abs(movedGeometry.head.y - movedGeometry.viewport.y - movedGeometry.viewport.clientTop) <= 1
      && movedGeometry.leftRow && Math.abs(movedGeometry.leftRow.x - movedGeometry.leftHead.x) <= 1
      && Math.abs((movedGeometry.calendar.x - baseGeometry.calendar.x) + movedGeometry.viewport.left - baseGeometry.viewport.left) <= 1, { before: baseGeometry, after: movedGeometry })
    check('Today marker aligns between sticky header and timeline and outer document never scrolls sideways',
      Math.abs(movedGeometry.today.x - movedGeometry.todayHeader.x) <= 1
      && movedGeometry.outer.every(item => item.scroll <= item.width + 2 && item.scrollHeight <= item.height + 2 && item.left === 0 && item.top === 0)
      && movedGeometry.doc.width <= movedGeometry.doc.client + 2 && movedGeometry.doc.height <= movedGeometry.doc.clientHeight + 2
      && movedGeometry.doc.left === 0 && movedGeometry.doc.top === 0, movedGeometry)
    await scrollChart(100, 0)
    await viewport().focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('.tbGanttViewport')?.scrollLeft > 100)
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction(() => document.querySelector('.tbGanttViewport')?.scrollTop > 0)
    check('Focused chart is genuinely keyboard-scrollable in both axes without document overflow', (await scrollPosition()).left > 100 && (await scrollPosition()).top > 0)
    await chart().getByRole('button', { name: '定位排期', exact: true }).click()
    await paint()
    check('Locate-plan control exposes the earliest scheduled day without changing data',
      await chart().locator(`.tbGanttDay[data-date="${date(-12)}"]`).count() === 1 && writes.length === 0 && isDeepStrictEqual(await state(), initial))
    // Settle intentional scrolling BEFORE pointer hover: onScroll may dismiss a
    // pointer tooltip, so Playwright's implicit hover auto-scroll is not a stable
    // way to inspect its contents. Keep native focus auto-scroll separate below.
    const historicalTitle = row('g-old-done').locator('button.tbGanttTaskTitle')
    await historicalTitle.scrollIntoViewIfNeeded()
    await paint()
    await historicalTitle.hover()
    await chart().getByRole('tooltip').waitFor({ state: 'visible' })
    const doneTip = await chart().getByRole('tooltip').textContent()
    check('Historical done tooltip shows planned dates, not the independent actual settlement timestamp',
      doneTip.includes(date(-10)) && doneTip.includes(date(-8)) && doneTip.includes('3 天（含首尾）') && !doneTip.includes('2000-01-02'), doneTip)
    await page.keyboard.press('Escape')
    await chart().getByRole('tooltip').waitFor({ state: 'hidden' })

    // Native HTMLElement focus MUST work for an initially offscreen row. Do not
    // pre-scroll it, synthesize FocusEvent, or hide the actual auto-scroll race.
    await page.mouse.move(0, 0)
    const focusTitle = row('g-root-filler-14').locator('button.tbGanttTaskTitle')
    const beforeFocus = await focusTitle.evaluate(element => {
      const viewport = element.closest('.tbGanttViewport'), bounds = viewport.getBoundingClientRect()
      const header = viewport.querySelector('.tbGanttHeader').getBoundingClientRect(), target = element.getBoundingClientRect()
      return { scrollTop: viewport.scrollTop, targetTop: target.top, targetBottom: target.bottom,
        viewportTop: header.bottom, viewportBottom: bounds.bottom,
        offscreen: target.top >= bounds.bottom || target.bottom <= header.bottom }
    })
    check('Keyboard-tooltip regression starts with the target genuinely outside the chart viewport', beforeFocus.offscreen, beforeFocus)
    await focusTitle.focus()
    await paint()
    await chart().getByRole('tooltip').waitFor({ state: 'visible' })
    const afterFocus = await focusTitle.evaluate(element => {
      const viewport = element.closest('.tbGanttViewport'), bounds = viewport.getBoundingClientRect()
      const header = viewport.querySelector('.tbGanttHeader').getBoundingClientRect(), target = element.getBoundingClientRect()
      const root = viewport.closest('.tbGantt'), chart = root.getBoundingClientRect(), tooltip = root.querySelector('[role="tooltip"]')
      const tip = tooltip?.getBoundingClientRect()
      return { focused: document.activeElement === element, describedBy: element.getAttribute('aria-describedby'),
        tooltipId: tooltip?.id, tooltipText: tooltip?.textContent, scrollTop: viewport.scrollTop,
        visible: target.top >= header.bottom - 1 && target.bottom <= bounds.bottom + 1,
        bounded: Boolean(tip && tip.left >= chart.left && tip.right <= chart.right && tip.top >= chart.top && tip.bottom <= chart.bottom),
        reanchored: Boolean(tip && Math.min(Math.abs(tip.top - target.bottom - 7), Math.abs(tip.bottom - target.top + 7)) <= 12),
        targetTop: target.top, targetBottom: target.bottom, tooltipTop: tip?.top, tooltipBottom: tip?.bottom }
    })
    check('Native focus auto-scroll retains focus, visible tooltip and its exact aria-describedby association',
      afterFocus.focused && afterFocus.visible && afterFocus.scrollTop !== beforeFocus.scrollTop
      && Boolean(afterFocus.describedBy) && afterFocus.describedBy === afterFocus.tooltipId
      && afterFocus.tooltipText.includes(byId.get('g-root-filler-14').title), { before: beforeFocus, after: afterFocus })
    check('The focused tooltip is re-anchored to the post-scroll target and remains inside the chart', afterFocus.bounded && afterFocus.reanchored, afterFocus)
    await viewport().focus()
    await paint()
    await chart().getByRole('tooltip').waitFor({ state: 'hidden' })
    check('Real focus blur removes both the tooltip and the stale description association',
      await focusTitle.getAttribute('aria-describedby') === null && await viewport().evaluate(element => document.activeElement === element))
    await focusTitle.focus()
    await paint()
    await chart().getByRole('tooltip').waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await chart().getByRole('tooltip').waitFor({ state: 'hidden' })
    check('Escape closes the focused tooltip without moving focus or keeping a dangling aria-describedby',
      await focusTitle.evaluate(element => document.activeElement === element) && await focusTitle.getAttribute('aria-describedby') === null
      && writes.length === 0 && isDeepStrictEqual(await state(), initial))
    await viewport().focus()
    await screenshot('global-daily-chart')

    for (const width of [900, 680, 360, 300, 1512]) {
      await page.setViewportSize({ width, height: 950 })
      await paint()
      await scrollChart(180, 120)
      const geometry = await chartGeometry()
      check(`${width}px: chart is bounded, daily timeline remains reachable and all horizontal overflow stays inside it`,
        geometry.viewport.clientWidth > 40 && geometry.viewport.clientHeight > 100 && geometry.leftHead.width < geometry.viewport.clientWidth - 20
        && geometry.viewport.scrollWidth > geometry.viewport.clientWidth && geometry.viewport.left > 0
        && geometry.outer.every(item => item.scroll <= item.width + 2 && item.scrollHeight <= item.height + 2 && item.left === 0 && item.top === 0)
        && geometry.doc.width <= geometry.doc.client + 2 && geometry.doc.height <= geometry.doc.clientHeight + 2
        && geometry.doc.left === 0 && geometry.doc.top === 0, geometry)
      check(`${width}px: sticky date header and left task pane remain geometrically aligned`,
        Math.abs(geometry.head.y - geometry.viewport.y - geometry.viewport.clientTop) <= 1
        && Math.abs(geometry.leftHead.x - geometry.viewport.x - geometry.viewport.clientLeft) <= 1
        && geometry.leftRow && Math.abs(geometry.leftRow.x - geometry.leftHead.x) <= 1, geometry)
      if (width === 300) await screenshot('narrow-300')
    }
    check('Scope, fold, scroll, hover, locate and narrow-layout interactions have made zero task writes', writes.length === 0 && isDeepStrictEqual(await state(), initial))

    // Read/open/cancel/default/cross-day behavior is measured against actual API snapshots.
    await detailFromChart('g-ongoing')
    const ongoingBeforeEdit = (await state()).find(task => task.id === 'g-ongoing')
    check('Opening an unscheduled task never automatically opens or persists a date editor',
      !await planForm().isVisible() && PLAN_FIELDS.every(field => !Object.hasOwn(ongoingBeforeEdit, field))
      && writes.length === 0)
    await beginPlan('g-ongoing')
    check('Only explicit edit seeds the LOCAL today start; end/owner remain empty and API data is still untouched',
      await planInput('计划开始日期').inputValue() === firstToday && await planInput('计划完成日期').inputValue() === ''
      && await planInput('负责人').inputValue() === '' && await planInput('负责人').getAttribute('maxlength') === '100'
      && writes.length === 0 && isDeepStrictEqual(await state(), initial))
    await cancelPlan()
    await page.clock.setFixedTime(new Date(Date.parse(FIXED_TIME) + DAY_MS))
    await reload()
    const secondToday = await localToday()
    check('Crossing a local day and reopening the application does not create dates, change timestamps or write tasks',
      secondToday === addDays(firstToday, 1) && writes.length === 0 && isDeepStrictEqual(await state(), initial))
    await openDetail(byId.get('g-ongoing'))
    const ongoingAfterMidnight = (await state()).find(task => task.id === 'g-ongoing')
    check('Reading detail after midnight still leaves an old unscheduled task undated', !await planForm().isVisible()
      && PLAN_FIELDS.every(field => !Object.hasOwn(ongoingAfterMidnight, field)))
    await beginPlan('g-ongoing')
    check('A new explicit edit after midnight defaults to the new local day, never the previous canceled draft', await planInput('计划开始日期').inputValue() === secondToday)
    await cancelPlan()
    await globalGantt()
    await row('g-ongoing').getByRole('button', { name: `${EMPTY_HINT}：未排期持续性工作`, exact: true }).click()
    await planForm().waitFor({ state: 'visible' })
    check('The exact missing-plan hint opens the matching task detail AND its editor through the real callback',
      await planSection().getAttribute('data-plan-task') === 'g-ongoing' && await planInput('计划开始日期').inputValue() === secondToday && writes.length === 0)
    await cancelPlan()
    await beginPlan('g-ongoing')
    let after = await savePlan('g-ongoing', { planStartDate: date(-2), planEndDate: date(4), assignee: '排期负责人 A' }, 'Explicit full plan save')
    const savedOngoing = after.find(task => task.id === 'g-ongoing')
    check('Schedule save retains ongoing status and historical actual settlement independently',
      savedOngoing.status === 'ongoing' && savedOngoing.settledAt === OLD_TIME && savedOngoing.planMode === 'manual')
    const beforePlanReloadWrites = writes.length
    await reload()
    await openDetail(byId.get('g-ongoing'))
    check('Saved plan and owner are readable after a full reload',
      (await planSection().textContent()).includes(`${date(-2)} → ${date(4)}`) && (await planSection().textContent()).includes('负责人：排期负责人 A'))
    await beginPlan('g-ongoing')
    check('Re-editing a saved plan does not replace its old start with today', await planInput('计划开始日期').inputValue() === date(-2))
    await planSection().getByRole('button', { name: '清除日期', exact: true }).click()
    check('Clear-dates is still only a draft until Save is explicitly chosen',
      await planInput('计划开始日期').inputValue() === '' && await planInput('计划完成日期').inputValue() === ''
      && writes.length === beforePlanReloadWrites && isDeepStrictEqual((await state()).find(task => task.id === 'g-ongoing'), savedOngoing))
    await cancelPlan()
    await page.clock.setFixedTime(new Date(Date.parse(FIXED_TIME) + 2 * DAY_MS))
    await reload()
    check('A saved plan remains stable over another day/reload; canceling Clear never writes',
      writes.length === beforePlanReloadWrites && isDeepStrictEqual((await state()).find(task => task.id === 'g-ongoing'), savedOngoing))
    await openDetail(byId.get('g-ongoing'))
    await beginPlan('g-ongoing')
    await planSection().getByRole('button', { name: '清除日期', exact: true }).click()
    after = await savePlan('g-ongoing', { planStartDate: '', planEndDate: '', assignee: '排期负责人 A' }, 'Explicit date clearing')
    check('Clearing dates preserves owner, actual status and actual settlement', after.find(task => task.id === 'g-ongoing').status === 'ongoing'
      && after.find(task => task.id === 'g-ongoing').settledAt === OLD_TIME)
    await globalGantt()
    check('Cleared ongoing task returns to an empty timeline instead of a fake recurring/date bar',
      await row('g-ongoing').getAttribute('data-plan-kind') === 'empty' && (await row('g-ongoing').locator('.tbGanttTimeline').textContent()).trim() === EMPTY_HINT)
    await row('g-point').getByRole('button', { name: '补充开始日期：只有完成日期的任务', exact: true }).click()
    await planForm().waitFor({ state: 'visible' })
    check('Deadline-only supplement opens the editor but never silently fills/saves the missing start in stored data',
      await planSection().getAttribute('data-plan-task') === 'g-point' && !Object.hasOwn((await state()).find(task => task.id === 'g-point'), 'planStartDate'))
    await cancelPlan()

    // AUTO derivation is visible but must never mutate the raw parent or its timestamp.
    await globalGantt()
    await detailFromChart('g-auto')
    await beginPlan('g-auto')
    const rawAuto = (await state()).find(task => task.id === 'g-auto')
    check('AUTO parent edit exposes an explicit mode and disabled derived dates, without adding raw dates',
      await planInput('父任务排期方式').inputValue() === 'auto' && await planInput('计划开始日期').isDisabled()
      && await planInput('计划完成日期').isDisabled() && await planInput('计划开始日期').inputValue() === date(-12)
      && await planInput('计划完成日期').inputValue() === date(5)
      && !Object.hasOwn(rawAuto, 'planStartDate') && !Object.hasOwn(rawAuto, 'planEndDate'))
    await cancelPlan()
    await returnToChart()
    await detailFromChart('g-bar')
    await beginPlan('g-bar')
    after = await savePlan('g-bar', { planEndDate: date(9) }, 'Child plan extension under AUTO')
    check('Saving a child extends only the derived parent summary, never raw parent dates/mode/timestamp',
      isDeepStrictEqual(after.find(task => task.id === 'g-auto'), rawAuto)
      && getSchedules(after).get('g-auto').end === date(9))
    await returnToChart()
    check('AUTO summary redraws immediately and still identifies the one unscheduled descendant',
      await row('g-auto').locator('.tbGanttDates time').evaluateAll(elements => elements.map(element => element.dateTime)).then(dates => isDeepStrictEqual(dates, [date(-12), date(9)]))
      && await row('g-auto').locator('.tbGanttPartialBadge').getAttribute('aria-label') === '1 个下级任务尚未形成排期')
    await detailFromChart('g-start-only')
    await beginPlan('g-start-only')
    after = await savePlan('g-start-only', { planEndDate: date(2) }, 'Completing the previously start-only child')
    await returnToChart()
    check('Deadline-only descendants still keep AUTO partial after empty-plan count reaches zero',
      getSchedules(after).get('g-auto').unscheduledCount === 0 && getSchedules(after).get('g-auto').partial
      && (await row('g-auto').locator('.tbGanttPartialBadge').textContent()).trim() === '不完整'
      && await row('g-auto').locator('.tbGanttPartialBadge').getAttribute('aria-label') === '下级任务排期不完整'
      && isDeepStrictEqual(after.find(task => task.id === 'g-auto'), rawAuto))
    const beforeAutoReloadWrites = writes.length
    await reload()
    await globalGantt()
    check('Derived AUTO range and partial state survive reload without persisting synthesized parent dates',
      writes.length === beforeAutoReloadWrites && isDeepStrictEqual((await state()).find(task => task.id === 'g-auto'), rawAuto)
      && await row('g-auto').locator(`time[datetime="${date(9)}"]`).count() === 1 && await row('g-auto').getAttribute('data-auto') === 'true')

    // Invalid proposals are rejected before optimistic state changes or POSTs.
    await detailFromChart('g-manual-child')
    await beginPlan('g-manual-child')
    await rejectPlan('g-manual-child', { planEndDate: date(41), assignee: '被拒绝但保留的负责人' },
      [byId.get('g-manual-child').title, byId.get('g-manual').title, date(40)], 'Direct child exceeds manual parent')
    await cancelPlan()
    await globalGantt()
    await detailFromChart('g-manual-four')
    await beginPlan('g-manual-four')
    await rejectPlan('g-manual-four', { planEndDate: date(41) },
      [byId.get('g-manual-four').title, byId.get('g-manual').title, date(40)], 'Great-grandchild exceeds manual ancestor through AUTO parents')
    await cancelPlan()
    await globalGantt()
    await detailFromChart('g-manual')
    await beginPlan('g-manual')
    check('Explicit manual parent dates remain editable as hard bounds', await planInput('父任务排期方式').inputValue() === 'manual'
      && await planInput('计划开始日期').isEnabled() && await planInput('计划完成日期').isEnabled())
    await rejectPlan('g-manual', { planEndDate: date(15) },
      [byId.get('g-manual').title, byId.get('g-manual-child').title, date(15)], 'Shrinking manual parent validates the existing whole subtree')
    await cancelPlan()
    await globalGantt()
    await detailFromChart('g-one-day')
    await beginPlan('g-one-day')
    await rejectPlan('g-one-day', { planStartDate: date(7) }, [byId.get('g-one-day').title, '早于'], 'Start after end is rejected locally')
    await cancelPlan()
    await globalGantt()
    await detailFromChart('g-move-branch')
    await root.locator('.tbDetailTitleLine').getByRole('button', { name: `更多操作：${byId.get('g-move-branch').title}`, exact: true }).click()
    await root.getByRole('menu', { name: '任务操作', exact: true }).getByRole('menuitem', { name: '移动到…', exact: true }).click()
    const moveDialog = root.getByRole('dialog', { name: '移动任务', exact: true })
    await moveDialog.waitFor({ state: 'visible' })
    await moveDialog.getByLabel('新父级任务', { exact: true }).selectOption('g-manual')
    const beforeMove = await state(), beforeMoveWrites = writes.length
    await moveDialog.getByRole('button', { name: '移动', exact: true }).click()
    await moveDialog.getByRole('alert').filter({ hasText: byId.get('g-move-deep').title }).waitFor({ state: 'visible' })
    const moveError = await moveDialog.getByRole('alert').textContent()
    check('Move-to-parent checks the moved branch’s deepest scheduled descendants against the target manual ancestor',
      moveError.includes(byId.get('g-move-deep').title) && moveError.includes(byId.get('g-manual').title) && moveError.includes(date(40)), moveError)
    check('Rejected reparent retains the destination draft, complete API snapshot and zero POSTs',
      await moveDialog.getByLabel('新父级任务', { exact: true }).inputValue() === 'g-manual'
      && isDeepStrictEqual(await state(), beforeMove) && writes.length === beforeMoveWrites)
    await moveDialog.getByRole('button', { name: '取消', exact: true }).click()
    await moveDialog.waitFor({ state: 'hidden' })
    await globalGantt()
    check('Rejected move never silently extends the manual parent or changes its raw dates',
      await row('g-manual').getAttribute('data-auto') === 'false'
      && await row('g-manual').locator('.tbGanttDates time').evaluateAll(elements => elements.map(element => element.dateTime)).then(dates => isDeepStrictEqual(dates, [date(10), date(40)])))

    // Navigation guard: cancel retains draft; only explicit discard loses it;
    // save-and-continue persists atomically, whereas an invalid save cannot leave.
    await detailFromChart('g-one-day')
    await beginPlan('g-one-day')
    await fillPlan({ planEndDate: date(8), assignee: '取消导航必须保留草稿' })
    const beforeDirty = await state(), beforeDirtyWrites = writes.length
    await nav.getByRole('button', { name: '甘特图', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'visible' })
    await unsavedDialog().getByRole('button', { name: '取消', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'hidden' })
    check('Canceling dirty-plan navigation leaves the user in the editor with every draft value and zero writes',
      await planForm().isVisible() && await planInput('计划完成日期').inputValue() === date(8)
      && await planInput('负责人').inputValue() === '取消导航必须保留草稿'
      && writes.length === beforeDirtyWrites && isDeepStrictEqual(await state(), beforeDirty))
    await root.getByRole('button', { name: '← 返回甘特图', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'visible' })
    await page.keyboard.press('Escape')
    await unsavedDialog().waitFor({ state: 'hidden' })
    check('Escape from the same guard also cancels navigation instead of discarding the draft',
      await planInput('负责人').inputValue() === '取消导航必须保留草稿' && writes.length === beforeDirtyWrites)
    await planSection().getByRole('button', { name: '查看甘特图', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'visible' })
    await unsavedDialog().getByRole('button', { name: '放弃修改', exact: true }).click()
    await root.locator('.tbGantt[data-scope="g-one-day"]').waitFor({ state: 'visible' })
    check('Explicit discard proceeds to the requested scoped Gantt without persisting anything',
      writes.length === beforeDirtyWrites && isDeepStrictEqual(await state(), beforeDirty))
    await detailFromChart('g-one-day')
    await beginPlan('g-one-day')
    check('Discarded dates/owner never leak into a reopened editor', await planInput('计划完成日期').inputValue() === date(6) && await planInput('负责人').inputValue() === '')
    await fillPlan({ planEndDate: date(8), assignee: '保存后继续的负责人' })
    const beforeGuardSave = await state(), beforeGuardWrites = writes.length
    await nav.getByRole('button', { name: '甘特图', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'visible' })
    await unsavedDialog().getByRole('button', { name: '保存并继续', exact: true }).click()
    await root.locator('.tbGantt[data-scope="all"]').waitFor({ state: 'visible' })
    after = await waitTasks([{ id: 'g-one-day', planStartDate: date(6), planEndDate: date(8), assignee: '保存后继续的负责人' }])
    check('Save-and-continue performs one real write then completes the originally requested navigation', writes.length === beforeGuardWrites + 1)
    assertOnlyPlanChanged('Save-and-continue preserves all unrelated fields, actual dates, statuses and siblings', beforeGuardSave, after, 'g-one-day')
    await detailFromChart('g-manual-four')
    await beginPlan('g-manual-four')
    await fillPlan({ planEndDate: date(41), assignee: '无效导航保存仍需保留' })
    const beforeInvalidGuard = await state(), invalidGuardWrites = writes.length
    await nav.getByRole('button', { name: '甘特图', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'visible' })
    await unsavedDialog().getByRole('button', { name: '保存并继续', exact: true }).click()
    await unsavedDialog().waitFor({ state: 'hidden' })
    await planSection().locator('.tbErr[role="alert"]').waitFor({ state: 'visible' })
    check('Invalid Save-and-continue blocks navigation and retains the entire editable draft',
      await chart().count() === 0 && await planForm().isVisible() && await planInput('计划完成日期').inputValue() === date(41)
      && await planInput('负责人').inputValue() === '无效导航保存仍需保留'
      && writes.length === invalidGuardWrites && isDeepStrictEqual(await state(), beforeInvalidGuard))
    await cancelPlan()
    await globalGantt()
    const finalBeforeReload = await state(), finalWrites = writes.length
    await screenshot('saved-and-validated')
    await reload()
    await globalGantt()
    check('Final full reload preserves every acknowledged task and introduces no extra default/read write',
      writes.length === finalWrites && isDeepStrictEqual(await state(), finalBeforeReload))
    check('Explicit historical Gantt still includes historical done/dropped and empty ongoing after all successful/rejected workflows',
      await rows().count() === fixture.length && await row('g-old-done').getAttribute('data-status') === 'done'
      && await row('g-old-dropped').getAttribute('data-status') === 'dropped'
      && await row('g-ongoing').getAttribute('data-plan-kind') === 'empty')
    const envelope = await page.evaluate(async () => (await fetch('/api/dsh-task-board/state', { credentials: 'same-origin' })).json())
    check('Browser scheduling uses the original state API/schema version 1, not a parallel storage format', envelope.version === 1 && isDeepStrictEqual(envelope.tasks, finalBeforeReload))
  } finally {
    page.off('request', trackWrite)
  }
})
