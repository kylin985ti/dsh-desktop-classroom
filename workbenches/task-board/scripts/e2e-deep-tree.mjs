/**
 * Arbitrarily deep tasks remain visible, directly editable and draggable.
 * Titles are accessible buttons; destructive operations live in task menus.
 * Real pointer protocol only; no synthetic DragEvent or dragAndDrop().
 * DSH_E2E_ISOLATED=1 DSH_BASE=http://127.0.0.1:PORT DSH_TOKEN=... \
 *   node scripts/e2e-deep-tree.mjs
 */
import { ROOT_CARDS, STATUSES, makeTask, runSuite } from './e2e-redesign.mjs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

await runSuite('deep-tree', async ({
  page, root, rootCard, childRow, check, reset, expand, state, waitTasks,
  statusMenu, openActions, actionMenu, addChild, dragStatus, counts, reload, screenshot, config,
}) => {
  if (process.env.DSH_DEEP_TRACE === '1' && config.artifacts) {
    const trace = [], summarize = tasks => tasks?.map(({id,status,parentId})=>({id,status,parentId}))
    const record = entry => { trace.push({...entry,at:Date.now()});writeFileSync(join(config.artifacts,'deep-tree-network.json'),JSON.stringify(trace,null,2)) }
    page.on('request',request=>{if(new URL(request.url()).pathname==='/api/dsh-task-board/state/write')record({kind:'write',tasks:summarize(request.postDataJSON()?.tasks)})})
    page.on('response',async response=>{if(new URL(response.url()).pathname==='/api/dsh-task-board/state'){
      try{const body=await response.json();record({kind:'read',tasks:summarize(body.tasks)})}catch{record({kind:'read-error'})}
    }})
  }
  const first = makeTask('deep-1', '一级任务')
  const second = makeTask('deep-2', '二级任务', 'todo', first.id)
  const third = makeTask('deep-3', '三级任务', 'todo', second.id)
  const fourth = makeTask('deep-4', '四级任务', 'todo', third.id)
  await reset([first, second, third, fourth])
  check('Deep fixtures render as one root card, not orphan roots', await root.locator(ROOT_CARDS).count() === 1 && await rootCard(first.id).isVisible())

  await expand(first.id)
  await childRow(second.id).waitFor({ state: 'visible' })
  check('Second-level task is visible after expanding the root', await childRow(second.id).getByRole('button', { name: `打开子任务：${second.title}`, exact: true }).isVisible())
  await expand(second.id)
  await childRow(third.id).waitFor({ state: 'visible' })
  check('Third-level task is retained and reachable', await childRow(third.id).getByRole('button', { name: `打开子任务：${third.title}`, exact: true }).isVisible())
  await expand(third.id)
  await childRow(fourth.id).waitFor({ state: 'visible' })
  check('Fourth-level task is retained and reachable', await childRow(fourth.id).getByRole('button', { name: `打开子任务：${fourth.title}`, exact: true }).isVisible())

  for (const task of [second, third, fourth]) {
    const row = childRow(task.id)
    check(`${task.title}: own drag grip, status chip, direct-add plus and actions menu are available`, await row.locator('.tbGrip').count() === 1
      && await row.locator('.tbStatusChip').count() === 1
      && await row.getByRole('button', { name: `添加子任务：${task.title}`, exact: true }).count() === 1
      && await row.getByRole('button', { name: `更多操作：${task.title}`, exact: true }).count() === 1)
    check(`${task.title}: title button contains its own text and has no persistent delete button`, await row.locator('button.tbRowBtn .tbRowTitle').textContent() === task.title
      && await row.getByRole('button', { name: /^(删除|删除任务|删除子任务：)/ }).count() === 0)
  }
  const actions = await openActions(second.id, second.title)
  check('Nested destructive operation remains explicitly labeled inside actions menu', await actions.getByRole('menuitem', { name: '删除任务', exact: true }).isVisible())
  await page.keyboard.press('Escape')
  await actionMenu().waitFor({ state: 'hidden' })

  await childRow(second.id).locator('.tbStatusChip').click()
  const menu = statusMenu()
  await menu.waitFor({ state: 'visible' })
  const labels = await menu.getByRole('menuitemradio').allTextContents()
  check('Nested status picker exposes all five states at root popover level', labels.length === 5 && JSON.stringify(labels.map((label) => label.trim())) === JSON.stringify(Object.values(STATUSES))
    && await menu.evaluate((element) => Boolean(element.closest('.tbRoot')) && !element.closest('.tbCard, .tbChild')), labels)
  await menu.getByRole('menuitemradio', { name: '持续性工作', exact: true }).click()
  await menu.waitFor({ state: 'hidden' })
  let tasks = await waitTasks([{ id: second.id, status: 'ongoing', parentId: first.id, settledAt: null }])
  check('Nested ongoing selection persists without losing deeper descendants', tasks.find((task) => task.id === second.id)?.status === 'ongoing'
    && tasks.find((task) => task.id === third.id)?.parentId === second.id
    && await childRow(fourth.id).isVisible(), { second: tasks.find(task=>task.id===second.id), third: tasks.find(task=>task.id===third.id), fourthVisible: await childRow(fourth.id).isVisible() })

  await dragStatus(third, 'ongoing')
  tasks = await waitTasks([{ id: third.id, status: 'ongoing', parentId: second.id, settledAt: null }])
  check('Real pointer drag enters the ongoing column for a third-level task without settling or reparenting', tasks.find((task) => task.id === third.id)?.status === 'ongoing'
    && tasks.find((task) => task.id === third.id)?.settledAt === null && tasks.find((task) => task.id === third.id)?.parentId === second.id)
  await dragStatus(third, 'done')
  // Wait for the persistence boundary, not one potentially in-flight GET snapshot.
  tasks = await waitTasks([{ id: third.id, status: 'done', parentId: second.id }])
  check('Real mouse drag changes the third-level task to completed', tasks.find((task) => task.id === third.id)?.status === 'done', tasks.find(task => task.id === third.id))
  check('Nested drag preserves parent links and deeper child ownership', tasks.find((task) => task.id === third.id)?.parentId === second.id
    && tasks.find((task) => task.id === fourth.id)?.parentId === third.id
    && await childRow(fourth.id).isVisible())
  check('Descendant statuses never inflate status-group root counts', JSON.stringify(await counts()) === JSON.stringify({ todo: 1, doing: 0, ongoing: 0, done: 0, dropped: 0 }), await counts())

  const fifth = await addChild(fourth, '五级：由行内加号直接创建')
  check('Direct plus also creates under a fourth-level parent', fifth.parentId === fourth.id
    && await childRow(fifth.id).getByRole('button', { name: `打开子任务：${fifth.title}`, exact: true }).isVisible())
  await screenshot('five-levels')
  await reload()
  for (const task of [first, second, third, fourth]) await expand(task.id)
  await childRow(fifth.id).waitFor({ state: 'visible' })
  tasks = await state()
  check('Reload preserves the complete five-level hierarchy and edited statuses', tasks.length === 5
    && tasks.find((task) => task.id === second.id)?.status === 'ongoing'
    && tasks.find((task) => task.id === third.id)?.status === 'done'
    && [second, third, fourth, fifth].every((task) => tasks.find((item) => item.id === task.id)?.parentId === task.parentId)
    && await root.locator('.tbChild').count() === 4)
})
