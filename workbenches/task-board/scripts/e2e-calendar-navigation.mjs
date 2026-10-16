import assert from 'node:assert/strict'
import {runSuite,makeTask,isolatedConfig} from './e2e-redesign.mjs'
import {getCalendarWindow} from '../src/calendar-window-model.js'
isolatedConfig()
await runSuite('calendar-navigation',async({page,root,check,reset,state,paint,screenshot})=>{
 await page.clock.setFixedTime(new Date('2030-02-15T12:00:00+08:00'))
 const tasks=[
  {...makeTask('window-long','跨月项目：一月至四月'),planStartDate:'2030-01-20',planEndDate:'2030-04-20',planMode:'manual'},
  {...makeTask('window-child','跨月执行阶段','doing','window-long'),planStartDate:'2030-01-27',planEndDate:'2030-04-07',planMode:'manual'},
  {...makeTask('window-deadline','三月截止点'),planEndDate:'2030-03-21',planMode:'manual'},
  makeTask('window-unplanned','持续性工作不猜测结束日','ongoing'),
 ]
 const writes=[],native=[]
 page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/api/dsh-task-board/state/write')writes.push(request);if(path.startsWith('/api/dsh-task-board/calendar/'))native.push(path)})
 await reset(tasks);const initial=await state();writes.length=0
 await root.getByRole('button',{name:'日历',exact:true}).click()
 const cal=root.locator('.tbCalendar'),viewport=cal.locator('.tbCalendarViewport')
 await cal.waitFor();await paint()
 const getMonth=()=>cal.getAttribute('data-month')
 const waitMonth=async month=>page.waitForFunction(value=>document.querySelector('.tbCalendar')?.dataset.month===value,month)
 check('Calendar initially aligns current month inside a deduplicated three-month scroll window',await getMonth()==='2030-02'&&await viewport.evaluate(el=>el.scrollTop>0)&&Number(await cal.getAttribute('data-window-weeks'))>=13)
 const dates=await cal.locator('button[data-calendar-date]').evaluateAll(nodes=>nodes.map(node=>node.dataset.calendarDate))
 check('Each displayed date has exactly one real focus target across month boundaries',new Set(dates).size===dates.length&&dates[0]===getCalendarWindow('2030-02').firstDate)
 const stripMonths=await cal.locator('.tbCalendarWeek').evaluateAll(weeks=>weeks.filter(week=>week.querySelector('[data-task-id="window-long"]')).map(week=>week.dataset.labelMonth))
 check('One original project renders continuous January, February and March plan segments',new Set(stripMonths).has('2030-01')&&new Set(stripMonths).has('2030-02')&&new Set(stripMonths).has('2030-03'))
 check('Month transitions are labeled and week rows are deduplicated',await cal.locator('.tbCalendarWeek[data-month-transition="true"]').count()>=3&&await cal.locator('.tbCalendarWeek').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.weekStart)).size===nodes.length))
 await cal.getByRole('button',{name:'选择年月',exact:true}).click()
 const picker=cal.getByRole('dialog',{name:'快速选择月份',exact:true}),year=picker.getByLabel('年份',{exact:true})
 await year.fill('10000');check('Quick picker rejects out-of-domain years without navigating',await picker.locator('button[data-month-option]:enabled').count()===0&&await getMonth()==='2030-02')
 await year.fill('2031');await picker.locator('[data-month-option="2031-09"]').click();await waitMonth('2031-09')
 check('Year and month picker jumps directly across years and closes accessibly',await picker.count()===0&&await cal.getByRole('button',{name:'选择年月',exact:true}).evaluate(el=>el===document.activeElement))
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await year.fill('2030');await picker.locator('[data-month-option="2030-02"]').click();await waitMonth('2030-02')
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await page.keyboard.press('Escape')
 check('Escape closes quick selection and restores focus without leaving calendar',await picker.count()===0&&await cal.isVisible())
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await picker.getByRole('button',{name:'下一年',exact:true}).click()
 check('Year arrows update the real picker year',await year.inputValue()==='2031')
 await picker.getByRole('button',{name:'上一年',exact:true}).click();await year.fill('2032');await year.press('Enter');await waitMonth('2032-02')
 check('Enter in the year input applies the same calendar month in the chosen year',await picker.count()===0)
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await year.fill('2030');await picker.locator('[data-month-option="2030-01"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await waitMonth('2030-02')
 check('Month keyboard arrows and Enter activate actual focus targets',await picker.count()===0)
 const position=await viewport.evaluate(el=>el.scrollTop),bounds=await viewport.boundingBox()
 await page.mouse.move(bounds.x+bounds.width*.45,bounds.y+bounds.height*.6);await page.mouse.wheel(0,24)
 // Chromium dispatches wheel before its compositor commits the scroll. Wait
 // for the observed movement, then check its magnitude and the month label.
 await page.waitForFunction(before=>document.querySelector('.tbCalendarViewport')?.scrollTop!==before,position,{timeout:3000})
 await paint()
 const smallWheel={before:position,after:await viewport.evaluate(el=>el.scrollTop),month:await getMonth()}
 check('Small wheel gestures scroll naturally instead of jumping a whole month',smallWheel.after>position&&smallWheel.after-position<=26&&smallWheel.month==='2030-02',smallWheel)
 await viewport.evaluate(view=>{
  const capture=()=>{const top=view.getBoundingClientRect().top+29;const row=[...view.querySelectorAll('.tbCalendarWeek')].find(el=>el.getBoundingClientRect().bottom>top);return {month:view.closest('.tbCalendar').dataset.month,week:row?.dataset.weekStart,offset:row?row.getBoundingClientRect().top-top:null}}
  view.__calendarCapture=capture;view.__calendarScrollSamples=[]
  view.addEventListener('scroll',()=>view.__calendarScrollSamples.push(capture()),{passive:true})
 })
 const months=[]
 for(let step=0;step<4;step++){
  const count=await viewport.evaluate(el=>el.__calendarScrollSamples.length)
  await page.mouse.wheel(0,900)
  await page.waitForFunction(before=>document.querySelector('.tbCalendarViewport').__calendarScrollSamples.length>before,count)
  await paint();await paint();months.push(await getMonth())
  const anchors=await viewport.evaluate((el,before)=>({scrolled:el.__calendarScrollSamples[before],settled:el.__calendarCapture()}),count)
  check(`Month rebase ${step+1} preserves the visible week and pixel offset`,anchors.scrolled.week===anchors.settled.week&&Math.abs(anchors.scrolled.offset-anchors.settled.offset)<=1,anchors)
 }
 check('Wheel continues across successive month boundaries rather than stopping at current month',months.at(-1)>'2030-04'&&new Set(months).size>=3,months)
 const boundary=await viewport.evaluate(el=>({top:el.scrollTop,height:el.scrollHeight,client:el.clientHeight}))
 check('Rolling month rebasing keeps a bounded scroll window instead of growing DOM forever',Number(await cal.getAttribute('data-window-weeks'))<=15&&boundary.height<2600&&boundary.top>0)
 for(let step=0;step<4;step++){await page.mouse.wheel(0,-900);await paint();await paint()}
 check('Reverse wheel also crosses months and remains in task calendar',await getMonth()<months.at(-1)&&await cal.isVisible())
 const outer=await cal.evaluate(el=>({root:el.closest('.tbRoot').scrollTop,body:document.body.scrollTop,document:document.documentElement.scrollTop,over:document.documentElement.scrollWidth>innerWidth+1}))
 check('Calendar scrolling never scrolls or horizontally expands the application shell',outer.root===0&&outer.body===0&&outer.document===0&&!outer.over,outer)
 await cal.getByRole('button',{name:'回到今天',exact:true}).click();await waitMonth('2030-02')
 const todayVisible=await cal.locator('button[data-calendar-date="2030-02-15"]').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.tbCalendarViewport').getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom})
 check('Today returns the actual current date into the visible scroll viewport',todayVisible)
 await screenshot('continuous-window')
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await year.fill('1');await picker.locator('[data-month-option="0001-01"]').click();await waitMonth('0001-01')
 check('Year-one boundary retains valid dates without an impossible preceding month',await cal.locator('button[data-calendar-date^="0000"]').count()===0&&Number(await cal.getAttribute('data-window-weeks'))<=15)
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await year.fill('9999');await picker.locator('[data-month-option="9999-12"]').click();await waitMonth('9999-12')
 check('Year9999 boundary never fabricates a five-digit next year',await cal.locator('button[data-calendar-date^="10000"]').count()===0)
 await page.setViewportSize({width:360,height:640});await page.clock.setFixedTime(new Date('2030-01-31T12:00:00+08:00'))
 await cal.getByRole('button',{name:'选择年月',exact:true}).click();await year.fill('2030')
 const pickerBounds=await picker.boundingBox(),calendarBounds=await cal.boundingBox()
 check('Quick picker remains visible and operable in a narrow short viewport',pickerBounds.x>=calendarBounds.x&&pickerBounds.x+pickerBounds.width<=calendarBounds.x+calendarBounds.width&&pickerBounds.y+pickerBounds.height<=640,{pickerBounds,calendarBounds})
 await screenshot('month-picker-360')
 await picker.locator('[data-month-option="2030-01"]').click();await waitMonth('2030-01');await cal.getByRole('button',{name:'回到今天',exact:true}).click();await paint()
 const lateToday=await cal.locator('button[data-calendar-date="2030-01-31"]').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.tbCalendarViewport').getBoundingClientRect();return a.top>=b.top+29&&a.bottom<=b.bottom})
 check('Today reveals January31 rather than month start even in a short viewport',lateToday)
 await screenshot('today-january31-short')
 check('Cross-month rolling and quick selection make zero local-calendar requests',native.length===0,native)
 assert.deepEqual(await state(),initial)
 check('Quick selection and long cross-month scrolling preserve every original task byte and make zero task writes',writes.length===0)
})
