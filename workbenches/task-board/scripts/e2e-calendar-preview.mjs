/** Production task-calendar visuals with synthetic task fixtures. */
import {runSuite,makeTask,isolatedConfig} from './e2e-redesign.mjs'
import {isDeepStrictEqual} from 'node:util'
isolatedConfig()
await runSuite('calendar-production',async({page,root,reset,state,check,paint,screenshot})=>{
  await page.setViewportSize({width:1800,height:1050})
  const local=new Date(),month=`${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,'0')}`
  const date=day=>`${month}-${String(day).padStart(2,'0')}`
  const tasks=[
    makeTask('month-audit','年度合规审查','doing',null,{assignee:'我',note:'合成展示：材料复核、审阅、交付的计划窗口。'}),
    makeTask('month-prepare','材料复核与底稿整理','doing','month-audit',{planStartDate:date(5),planEndDate:date(13),assignee:'我'}),
    makeTask('month-review','审查反馈与问题闭环','todo','month-audit',{planStartDate:date(14),planEndDate:date(19)}),
    makeTask('month-delivery','提交附件与交付','todo','month-audit',{planEndDate:date(23)}),
    makeTask('month-product','任务栏日历建设','doing',null,{planMode:'manual',planStartDate:date(8),planEndDate:date(25),assignee:'我'}),
    makeTask('month-ui','月历布局与任务投影','done','month-product',{planStartDate:date(8),planEndDate:date(12),settledAt:'2001-01-01T00:00:00Z'}),
    makeTask('month-navigation','连续跨月与年月快选','doing','month-product',{planStartDate:date(13),planEndDate:date(20)}),
    makeTask('month-safe','日期边界与任务范围验证','todo','month-product',{planStartDate:date(21),planEndDate:date(25)}),
    makeTask('month-follow','日常合规跟踪','ongoing',null,{assignee:'我'}),
    makeTask('month-start','后续调研：补充结束日期','todo',null,{planStartDate:date(18)}),
    makeTask('month-stop','已取消的供应商对接','dropped',null,{planStartDate:date(2),planEndDate:date(4),settledAt:'2001-01-01T00:00:00Z'}),
  ]
  await reset(tasks);const before=await state()
  await root.getByRole('navigation',{name:'任务栏视图',exact:true}).getByRole('button',{name:'日历',exact:true}).click()
  const cal=root.locator('.tbCalendar');await cal.waitFor();await paint()
  check('正式任务月历自动使用现有计划，保留多级、截止点、历史与未排期',await cal.locator('.tbCalendarBar[data-task-id="month-prepare"]').count()>=2&&await cal.locator('.tbCalendarBar[data-kind="deadline"]').count()===1&&await cal.locator('.tbCalendarUnplanned').count()===2)
  await screenshot('wide-task-only')
  await cal.getByLabel('显示父任务',{exact:true}).uncheck()
  await cal.locator('.tbCalendarBar[data-task-id="month-prepare"]').first().click();await paint();await screenshot('task-detail')
  const nav=await cal.getByRole('button',{name:'下个月',exact:true}).boundingBox(),drawer=await cal.locator('.tbCalendarDetail').boundingBox()
  check('非模态任务详情不遮挡月份工具条',nav&&drawer&&drawer.y>=nav.y+nav.height-1)
  await cal.getByRole('button',{name:'关闭日历详情',exact:true}).click()
  for(const width of [1280,900,500,360]){
    await page.setViewportSize({width,height:1050});await paint()
    const layout=await cal.evaluate(e=>({doc:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,root:e.closest('.tbRoot').scrollWidth,client:e.closest('.tbRoot').clientWidth}))
    check(`${width}px 正式月历不使宿主页面横向溢出`,layout.doc<=layout.width+2&&layout.root<=layout.client+2,layout)
    await screenshot(`width-${width}`)
  }
  await page.setViewportSize({width:1800,height:1050});await page.emulateMedia({colorScheme:'dark'});await paint();await screenshot('dark')
  check('深色、窄屏和任务详情切换保留所有原任务数据',isDeepStrictEqual(await state(),before))
})
