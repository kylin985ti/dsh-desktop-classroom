/** Capture the actual release UI with synthetic data, never the user's task file. */
import { mkdir, mkdtemp, writeFile, rm, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runSuite, makeTask, isolatedConfig } from './e2e-redesign.mjs'
isolatedConfig()
const parent = await realpath(tmpdir())
const base=await mkdtemp(join(parent,'.release-preview-'))
const intended=await realpath(base)
const domain=join(base,'审计工作域')
await mkdir(domain)
await writeFile(join(domain,'审计交付清单.md'),'# 审计交付清单\n\n本次交付按以下顺序推进：\n\n- [x] 完成自我审计与材料核对\n- [ ] 提交申请并完成用印\n- [ ] 整理交付附件并发送邮件\n')
await writeFile(join(domain,'checklist.ts'),'const completed = ["材料核对"]\nconst pending = ["申请用印", "邮件交付"]\n')
try{
  await runSuite('production',async({page,root,reset,expand,openDetail,check,screenshot,paint})=>{
    const audit=makeTask('preview-audit','中互金审计','doing',null,{sortIndex:0,note:'围绕本次审计整理材料、完成用印与邮件交付。\n先完成自我审计，再推进申请用印与最终发送。',domain:{path:domain,kind:'md',workspaceId:null}})
    const stamp=makeTask('preview-stamp','自我审计用印','doing',audit.id,{sortIndex:1})
    const tasks=[
      makeTask('preview-todo1','整理审计材料','todo',null,{sortIndex:0,domain:{path:domain,kind:'md',workspaceId:null}}),
      makeTask('preview-todo2','完成工作域绑定','todo',null,{sortIndex:1}),
      makeTask('preview-todo3','整理项目模板','todo',null,{sortIndex:2}),
      audit,makeTask('preview-dsh','DSH 改造','doing',null,{sortIndex:3}),
      makeTask('preview-ongoing','日常合规跟踪','ongoing',null,{sortIndex:4,note:'长期保留的持续性工作，不自动生成周期任务。',createdAt:'2025-01-01T00:00:00Z',updatedAt:'2025-01-01T00:00:00Z'}),
      makeTask('preview-done1','核对凭证','done',null,{sortIndex:4}),
      makeTask('preview-done2','同步交付清单','done',null,{sortIndex:5}),
      makeTask('preview-dropped','取消旧流程','dropped',null,{sortIndex:6}),
      makeTask('preview-self','自我审计','done',audit.id,{sortIndex:0}),stamp,
      makeTask('preview-mail','发邮箱','todo',audit.id,{sortIndex:2}),
      makeTask('preview-apply','提交用印申请','doing',stamp.id,{sortIndex:0}),
      makeTask('preview-fetch','领取签章文件','todo',stamp.id,{sortIndex:1}),
    ]
    await page.setViewportSize({width:1800,height:950})
    await reset(tasks);await expand(audit.id);await expand(stamp.id)
    const columns=await root.locator('.tbGroups > .tbGroup').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().top))
    check('正式构建宽屏始终单排五列，含持续性工作与展开的层级',columns.length===5&&columns.every(top=>Math.abs(top-columns[0])<2)
      &&await root.locator('.tbChild').count()===5)
    await page.mouse.move(25,25);await screenshot('wide')
    for(const width of [1512,1300,1100,500]){
      await page.setViewportSize({width,height:950});await paint()
      await root.locator('.tbBoardViewport').evaluate(element=>{element.scrollLeft=0})
      const boxes=await root.locator('.tbGroups > .tbGroup').evaluateAll(elements=>elements.map(element=>({top:element.getBoundingClientRect().top,width:element.getBoundingClientRect().width})))
      check(`${width}px 仍为单排五列，卡片不被挤窄`,boxes.length===5&&boxes.every(box=>Math.abs(box.top-boxes[0].top)<2&&box.width>=249))
      await screenshot(`board-${width}`)
    }
    await root.locator('.tbBoardViewport').evaluate(element=>{element.scrollLeft=element.scrollWidth})
    await paint();await screenshot('board-narrow-right')
    await page.setViewportSize({width:1800,height:950});await paint()
    await root.locator('.tbBoardViewport').evaluate(element=>{element.scrollLeft=0})
    await root.locator('[data-task-id="preview-audit"] > .tbCardHead .tbMenuTrigger').click()
    await root.getByRole('menu',{name:'任务操作',exact:true}).waitFor()
    await screenshot('actions');await page.keyboard.press('Escape')
    await openDetail(audit)
    await root.locator('.tbFileBtn',{hasText:'审计交付清单.md'}).click()
    await root.locator('.tbDoc').getByRole('heading',{name:'审计交付清单',exact:true}).waitFor()
    check('正式详情展示笔记、子任务与真实工作域文件',await root.locator('.tbDetailGrid').count()===1&&await root.locator('.tbDoc').isVisible())
    await screenshot('detail')
    await root.getByRole('button',{name:'AI 会话',exact:true}).click()
    await root.locator('.tbChat').waitFor({state:'visible'})
    await screenshot('native-drawer')
    await root.getByRole('button',{name:'收起会话',exact:true}).click()
    await page.setViewportSize({width:500,height:950});await paint();await screenshot('detail-narrow')
  })
}finally{
  if(resolve(base)!==intended||!intended.startsWith(parent+'/.release-preview-'))throw Error('Refusing unexpected preview cleanup')
  await rm(base,{recursive:true})
}
