/** Real browser task-calendar acceptance. Uses synthetic task data in an isolated host. */
import {isDeepStrictEqual} from 'node:util'
import {runSuite,makeTask,isolatedConfig} from './e2e-redesign.mjs'
isolatedConfig()
await runSuite('calendar',async({page,root,reset,state,openDetail,overview,check,paint,screenshot,expectHttpFailure,waitTasks})=>{
  await page.clock.setFixedTime(new Date('2030-02-15T04:00:00Z'))
  const calls=[],writes=[]
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/dsh-task-board/calendar/'))calls.push(request.url())})
  const tasks=[
    makeTask('cal-project','月历合成项目','doing',null,{createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z',note:'原任务笔记，不能被日历修改'}),
    makeTask('cal-span','跨周准备材料','doing','cal-project',{planStartDate:'2030-02-06',planEndDate:'2030-02-16',assignee:'我'}),
    makeTask('cal-deadline','只有截止日','todo','cal-project',{planEndDate:'2030-02-18'}),
    makeTask('cal-start','只有开始日期','todo','cal-project',{planStartDate:'2030-02-03'}),
    makeTask('cal-ongoing','长期跟进不猜期限','ongoing'),
    makeTask('cal-done','往日已完成仍可见','done','cal-project',{planStartDate:'2030-02-01',planEndDate:'2030-02-02',settledAt:'2000-01-01T00:00:00Z'}),
    makeTask('cal-next','跨月交付','todo',null,{planStartDate:'2030-02-27',planEndDate:'2030-03-04'}),
    makeTask('cal-other','不属于项目的任务','todo',null,{planStartDate:'2030-02-08',planEndDate:'2030-02-09'}),
    ...Array.from({length:8},(_,i)=>makeTask(`cal-many-${i}`,`拥挤日期任务${i+1}`,'todo','cal-project',{planStartDate:'2030-02-14',planEndDate:'2030-02-14'})),
  ]
  await reset(tasks);const initial=await state();calls.length=0
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/dsh-task-board/state/write')writes.push(request.postDataJSON())})
  const calendar=()=>root.locator('.tbCalendar'),detail=()=>calendar().locator('.tbCalendarDetail')
  const openCalendar=async()=>{await root.getByRole('navigation',{name:'任务栏视图',exact:true}).getByRole('button',{name:'日历',exact:true}).click();await calendar().waitFor({state:'visible'});await paint()}
  const bar=id=>calendar().locator(`.tbCalendarBar[data-task-id="${id}"]`)
  const close=async()=>{await detail().getByRole('button',{name:'关闭日历详情',exact:true}).click();await detail().waitFor({state:'hidden'})}
  await openCalendar()
  check('Task calendar opens directly in local planning month with all-history scope',await calendar().getAttribute('data-month')==='2030-02'&&await calendar().getAttribute('data-scope')==='all')
  check('Task calendar makes no local-calendar requests and offers no connection entry',calls.length===0&&await calendar().locator('.tbCalendarConnection,.tbCalendarNativeActions,[data-calendar-id]').count()===0&&await calendar().getByText('macOS 系统日历',{exact:true}).count()===0)
  check('Calendar opening derives plans without any task-state write',writes.length===0&&isDeepStrictEqual(await state(),initial))
  check('A multiweek plan renders distinct continuation strips',await bar('cal-span').count()===2&&await bar('cal-span').first().getAttribute('data-kind')==='bar')
  check('Only-end plans stay deadline points, not fabricated start/end bars',await bar('cal-deadline').getAttribute('data-kind')==='deadline'&&await bar('cal-deadline').locator('.tbCalendarDiamond').count()===1)
  check('Start-only and ongoing tasks remain unplanned rather than gaining a finish',await bar('cal-start').count()===0&&await bar('cal-ongoing').count()===0&&await calendar().locator('.tbCalendarUnplanned[data-task-id="cal-start"]').count()===1&&await calendar().locator('.tbCalendarUnplanned[data-task-id="cal-ongoing"]').count()===1)
  check('Historical settled task retains its planned dates independently of settlement time',await bar('cal-done').count()===1&&await bar('cal-done').getAttribute('data-status')==='done')
  check('Auto parent is a derived summary and remains the same underlying task identity',await bar('cal-project').first().getAttribute('data-auto')==='true'&&writes.length===0)
  await calendar().getByLabel('显示父任务',{exact:true}).uncheck()
  check('Hiding parent tasks reduces duplicate summary strips without changing task data',await bar('cal-project').count()===0&&await bar('cal-span').count()===2&&isDeepStrictEqual(await state(),initial))
  await calendar().getByLabel('显示父任务',{exact:true}).check()
  await calendar().getByLabel('按任务状态筛选',{exact:true}).selectOption('done')
  check('Status filter does not change history or create events',await bar('cal-done').count()===1&&await bar('cal-span').count()===0&&calls.length===0)
  await calendar().getByLabel('按任务状态筛选',{exact:true}).selectOption('all')
  const more=calendar().locator('.tbCalendarOverflow').filter({hasText:/\+/}).first();await more.click()
  check('Overflow opens the complete day list rather than losing hidden task strips',await detail().locator('.tbCalendarDayItem').count()>=8)
  await close()
  await bar('cal-span').first().click();await detail().locator('.tbCalendarOpenTask[data-task-id="cal-span"]').click()
  await root.locator('input.tbDetailTitle').waitFor()
  check('A calendar task opens its original task detail with return navigation',await root.locator('input.tbDetailTitle').inputValue()==='跨周准备材料'&&await root.getByRole('button',{name:'← 返回日历',exact:true}).count()===1)
  await root.getByRole('button',{name:'← 返回日历',exact:true}).click();await calendar().waitFor()
  check('Returning to calendar preserves the original global month',await calendar().getAttribute('data-month')==='2030-02'&&await calendar().getAttribute('data-scope')==='all')
  await root.getByRole('navigation',{name:'任务栏视图',exact:true}).getByRole('button',{name:'总览',exact:true}).click()
  await root.locator('.tbGroups').waitFor();await openDetail(tasks[0]);await root.getByRole('button',{name:'查看日历',exact:true}).click();await calendar().waitFor()
  check('Detail calendar scopes to the selected task and all descendants only',await calendar().getAttribute('data-scope')==='cal-project'&&await bar('cal-other').count()===0&&await bar('cal-span').count()===2)
  await calendar().getByRole('button',{name:'返回全部任务日历',exact:true}).click();await paint()
  if(await detail().isVisible()){
    const navBounds=await calendar().getByRole('button',{name:'下个月',exact:true}).boundingBox(),drawerBounds=await detail().boundingBox()
    check('Restored nonmodal details leave month navigation fully reachable',drawerBounds.y>=navBounds.y+navBounds.height-1)
  }
  await calendar().getByRole('button',{name:'下个月',exact:true}).click();await paint()
  check('Month navigation continues cross-month strips without changing source dates',await calendar().getAttribute('data-month')==='2030-03'&&await bar('cal-next').count()===2&&writes.length===0)
  await calendar().getByRole('button',{name:'回到今天',exact:true}).click();await paint()
  const day=calendar().locator('button[data-calendar-date="2030-02-15"]');await day.focus();await page.keyboard.press('ArrowRight')
  check('Calendar day keyboard navigation moves a real focus target',await calendar().locator('button[data-calendar-date="2030-02-16"]').evaluate(element=>element===document.activeElement))
  await page.keyboard.press('PageDown');await paint()
  check('PageDown navigates month without task writes or system reads',await calendar().getAttribute('data-month')==='2030-03'&&writes.length===0&&calls.length===0)
  await calendar().getByRole('button',{name:'回到今天',exact:true}).click();await paint();await screenshot('task-month')
  check('Task-calendar browsing preserves all original task fields and makes no calendar API requests',writes.length===0&&calls.length===0&&isDeepStrictEqual(await state(),initial))
  for(const width of [900,680,360,1512]){
    await page.setViewportSize({width,height:950});await paint()
    const geometry=await calendar().evaluate(element=>{const root=element.closest('.tbRoot'),view=element.querySelector('.tbCalendarViewport');return {doc:document.documentElement.scrollWidth,page:document.documentElement.clientWidth,root:root.clientWidth,rootScroll:root.scrollWidth,overflow:getComputedStyle(view).overflowX,width:view.clientWidth,scroll:view.scrollWidth}})
    check(`${width}px calendar keeps all horizontal overflow within its own viewport`,geometry.doc<=geometry.page+2&&geometry.rootScroll<=geometry.root+2&&['auto','scroll'].includes(geometry.overflow),geometry)
    await screenshot(`width-${width}`)
  }
  await calendar().locator('.tbCalendarUnplanned[data-task-id="cal-start"]').click()
  await detail().locator('.tbCalendarEditPlan[data-task-id="cal-start"]').click();await root.locator('.tbPlanForm').waitFor()
  check('Unplanned task date editing reuses original explicit editor without auto-save',await root.getByLabel('计划开始日期',{exact:true}).inputValue()==='2030-02-03'&&writes.length===0)
  await root.getByLabel('计划完成日期',{exact:true}).fill('2030-02-04')
  await root.getByRole('button',{name:'保存计划',exact:true}).click();await waitTasks([{id:'cal-start',planStartDate:'2030-02-03',planEndDate:'2030-02-04'}])
  await root.getByRole('button',{name:'← 返回日历',exact:true}).click();await bar('cal-start').first().waitFor()
  const after=await state(),changed=after.find(task=>task.id==='cal-start'),original=initial.find(task=>task.id==='cal-start')
  check('Explicit plan save appears immediately in calendar and is the only task write',writes.length===1&&await bar('cal-start').count()===2&&await bar('cal-start').first().getAttribute('data-kind')==='bar'&&changed.status===original.status&&changed.settledAt===original.settledAt)
  check('All unrelated tasks remain byte-equivalent records after explicit plan save',after.filter(task=>task.id!=='cal-start').every(task=>isDeepStrictEqual(task,initial.find(old=>old.id===task.id))))
})
