/** Real geometry / visual checks for the production redesign. Isolated host only. */
import { BOARD_WIDTHS, STATUSES, runSuite, makeTask, ROOT_CARDS } from './e2e-redesign.mjs'
await runSuite('card-layout', async ({ page, root, rootCard, childRow, itemHead, boardViewport, reset, paint, check, screenshot, expand, setStatus, statusMenu, openDetail, overflow, boardLayout, scrollTarget }) => {
  const openStatus = async (id, {keyboard=false}={}) => {
    const trigger=itemHead(id).locator('.tbStatusChip')
    await scrollTarget(trigger)
    if(keyboard){await trigger.focus();await page.keyboard.press('Enter')}else await trigger.click()
    await statusMenu().waitFor({state:'visible'});return statusMenu()
  }
  await reset([
    makeTask('layout-todo','整理资料'), makeTask('layout-doing','中互金审计','doing'),
    makeTask('layout-ongoing','长期核对','ongoing'),
    makeTask('layout-done','核对凭证','done'), makeTask('layout-dropped','取消旧计划','dropped'),
    makeTask('layout-long','季度内控审计报告与业务交付安排 / QuarterlyAudit_2026_10_VeryLongIdentifier_without_spaces_ABC123','doing'),
    makeTask('layout-child','自我审计用印','doing','layout-doing'), makeTask('layout-grandchild','申请盖章','todo','layout-child'),
  ])
  for (const width of BOARD_WIDTHS) {
    await page.setViewportSize({width,height:950}); await paint()
    const layout = await boardLayout()
    check(`${width}px：五列保持同顶单行、最少250px并按可用空间增长`, layout.exists && layout.canonical && layout.oneRow && layout.minWidth && layout.fillsAvailable, layout)
    check(`${width}px：仅可聚焦的内部看板区域按需滚动，外层不溢出`, layout.accessible && layout.groupsInside && layout.scrollable && layout.overflowAsNeeded && layout.noOuterOverflow && layout.footerHint, layout)
    const cards = await root.locator(ROOT_CARDS).evaluateAll(elements => elements.map(card => {
      const title = card.querySelector(':scope > .tbCardHead > .tbCardTitle')
      const chip = card.querySelector(':scope > .tbCardHead .tbStatusChip')
      const t = title.getBoundingClientRect(), s = chip.getBoundingClientRect()
      return { id:card.dataset.taskId, aligned:Math.abs(t.top-s.top)<3, titleWidth:t.width,
        tagWidth:s.width, tagHeight:s.height, titleHeight:t.height, cardHeight:card.getBoundingClientRect().height,
        persistentOldActions:!!card.querySelector(':scope > .tbCardActions') }
    }))
    check(`${width}px：任务名与五档状态均在同一首行`, cards.length===6&&cards.every(card=>card.aligned),cards)
    check(`${width}px：长标题独立换行，状态保持完整`,cards.every(card=>card.titleWidth>=60&&card.tagWidth>=45&&card.tagHeight<=26),cards)
    check(`${width}px：普通折叠任务不再堆叠常驻按钮`,cards.filter(card=>card.id!=='layout-long').every(card=>card.cardHeight<92&&!card.persistentOldActions),cards)
    const metrics=await overflow()
    check(`${width}px：看板和整个宿主页面没有横向溢出`,metrics.overflowing.length===0&&metrics.document.scroll<=metrics.document.client+2,metrics)
    await screenshot(`overview-${width}`)
  }
  await page.setViewportSize({width:1512,height:950}); await paint()
  await expand('layout-doing')
  await expand('layout-child')
  check('二级与三级任务均可见且保留拖拽手柄',await childRow('layout-child').isVisible()&&await childRow('layout-grandchild').isVisible()
    &&await childRow('layout-grandchild').locator('.tbGrip').isVisible())
  check('根卡的折叠入口只有一个，标题区没有重复控件',await rootCard('layout-doing').locator('.tbTaskMeta > .tbFold').count()===1
    &&await rootCard('layout-doing').locator(':scope > .tbCardHead .tbFold').count()===0)
  await screenshot('expanded-hierarchy')

  const menu=await openStatus('layout-dropped',{keyboard:true})
  const labels = await menu.getByRole('menuitemradio').allTextContents()
  check('右侧菜单包含五个规范顺序的状态选项', labels.length === 5 && JSON.stringify(labels.map(label=>label.trim())) === JSON.stringify(Object.values(STATUSES)), labels)
  const bounds=await menu.evaluate(element=>{
    const r=element.getBoundingClientRect(),root=element.closest('.tbRoot').getBoundingClientRect()
    return {rootLevel:element.parentElement.classList.contains('tbRoot'),inside:r.left>=root.left&&r.right<=root.right&&r.top>=root.top&&r.bottom<=root.bottom,
      hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}
  })
  check('右侧状态菜单在根容器内且可点击，无嵌套裁剪',bounds.rootLevel&&bounds.inside&&bounds.hit,bounds)
  await page.keyboard.press('Escape')
  await setStatus({id:'layout-dropped'},'doing')
  check('根卡状态变更仍会持久化并移动到正确列',await rootCard('layout-dropped').evaluate(element=>element.closest('.tbGroup').dataset.status)==='doing')

  const fixedBefore = await root.evaluate(element=>['.tbBar','.tbViewBar','.tbFooter'].map(selector=>{
    const node=element.querySelector(selector),rect=node.getBoundingClientRect()
    return {selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height}
  }))
  await page.evaluate(()=>{
    const scroll=document.querySelector('.tbBoardViewport'),chip=document.querySelector('[data-task-id="layout-todo"] .tbStatusChip')
    const space=document.createElement('div');space.setAttribute('data-layout-spacer','');space.style.height='1800px';space.style.flexShrink='0'
    chip.closest('.tbGroup').querySelector('.tbGroupBody').prepend(space)
    scroll.scrollLeft=0
    scroll.scrollTop+=chip.getBoundingClientRect().bottom-scroll.getBoundingClientRect().bottom+36
  })
  await paint()
  const vertical = await boardLayout()
  const fixedAfter = await root.evaluate(element=>['.tbBar','.tbViewBar','.tbFooter'].map(selector=>{
    const node=element.querySelector(selector),rect=node.getBoundingClientRect()
    return {selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height}
  }))
  check('高列只在内部看板纵向滚动，工具栏、摘要、页脚与页面不移动', await boardViewport.evaluate(element=>element.scrollTop>0 && element.scrollHeight>element.clientHeight)
    && vertical.noOuterOverflow && JSON.stringify(fixedBefore)===JSON.stringify(fixedAfter), {vertical,fixedBefore,fixedAfter})
  const flipped=await openStatus('layout-todo')
  const flipGeometry=await flipped.evaluate(element=>{
    const r=element.getBoundingClientRect(),root=element.closest('.tbRoot'),bounds=root.getBoundingClientRect()
    const chip=root.querySelector('[data-task-id="layout-todo"] .tbStatusChip').getBoundingClientRect()
    return {up:element.classList.contains('tbStatusMenuUp'),above:r.bottom<=chip.top+1,
      contained:r.top>=bounds.top&&r.bottom<=bounds.bottom}
  })
  check('底部状态菜单真实向上翻转且完整可见',flipGeometry.up&&flipGeometry.above&&flipGeometry.contained,flipGeometry)
  await page.keyboard.press('Escape');await page.evaluate(()=>{
    document.querySelector('[data-layout-spacer]')?.remove()
    document.querySelector('.tbBoardViewport').scrollTop=0
  })
  await openDetail({id:'layout-doing',title:'中互金审计'})
  check('正式详情采用子任务/工作域双栏且保留全部子级',await root.locator('.tbDetailGrid').count()===1&&await childRow('layout-child').isVisible())
  await openDetail({id:'layout-child',title:'自我审计用印',parentId:'layout-doing'})
  check('子任务详情继续显示更深一级',await childRow('layout-grandchild').isVisible())
  await screenshot('detail-deep')
  await page.emulateMedia({colorScheme:'dark'})
  const dark=await root.evaluate(element=>({canvas:getComputedStyle(element).getPropertyValue('--tb-canvas').trim(),ink:getComputedStyle(element).color}))
  check('深色系统主题有独立的可读配色，而非白底白字',dark.canvas==='#191c25',dark)
  await screenshot('detail-dark')
})
