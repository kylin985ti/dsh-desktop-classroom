/** Reproduce a new client against an old in-memory server before Desktop restart, without mutating user data. */
import { runSuite, makeTask } from './e2e-redesign.mjs'
await runSuite('protocol',async({page,root,reset,reload,state,check,paint})=>{
  await reset([makeTask('protocol','隔离协议保护','ongoing',null,{planStartDate:'2030-01-01',planEndDate:'2030-01-10',assignee:'保留'})])
  const before=await state(),writes=[]
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/dsh-task-board/state/write')writes.push(request)})
  await page.route('**/api/dsh-task-board/state',async route=>{
    const response=await route.fetch(),body=await response.json();delete body.scheduleProtocol
    await route.fulfill({response,json:body})
  })
  await reload()
  const alert=root.getByRole('alert')
  await alert.waitFor({state:'visible'})
  check('A new client on an old capability response explicitly requests full Desktop restart',(await alert.textContent()).includes('⌘Q')&&(await alert.textContent()).includes('当前禁止保存'))
  check('Mixed-version load failure keeps all task-creation controls disabled',await root.getByRole('button',{name:'新建任务',exact:true}).isDisabled())
  check('No old-service hydration is treated as an empty task store',writes.length===0&&JSON.stringify(await state())===JSON.stringify(before))
  await root.getByRole('navigation',{name:'任务栏视图',exact:true}).getByRole('button',{name:'甘特图',exact:true}).click()
  await paint()
  check('Scheduling/AI stays disabled rather than dropping unsupported fields',await root.getByRole('button',{name:/^AI\s*辅助排期$/}).isDisabled()&&writes.length===0)
  await page.unroute('**/api/dsh-task-board/state')
  await root.getByRole('button',{name:'重新加载',exact:true}).click()
  await root.getByRole('alert').waitFor({state:'hidden'})
  await root.locator('.tbGanttRow[data-task-id="protocol"]').waitFor({state:'visible'})
  check('Explicit retry on the matching service restores all plan fields without migration',JSON.stringify(await state())===JSON.stringify(before)&&await root.locator('.tbGanttRow[data-task-id="protocol"]').getAttribute('data-plan-kind')==='bar')
  check('Read capability checks and retries produce zero task writes',writes.length===0)
})
