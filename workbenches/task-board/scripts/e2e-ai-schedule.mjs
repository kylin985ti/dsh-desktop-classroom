/** AI UI uses controlled JSON suggestions, NEVER calls a model, clipboard, native picker or real workspace. */
import { runSuite, makeTask } from './e2e-redesign.mjs'
await runSuite('ai-schedule', async ({ page, root, reset, state, waitTasks, check, screenshot, paint, expectHttpFailure }) => {
  const fixtures = [
    makeTask('ai-root', '合成项目硬边界', 'doing', null, { planMode:'manual', planStartDate:'2030-01-01', planEndDate:'2030-12-31', assignee:'不可外传的负责人', domain:{path:'/not-shared-ui-fixture-path',kind:'md',workspaceId:null} }),
    makeTask('ai-auto','自动汇总阶段','doing','ai-root',{planMode:'auto'}),
    makeTask('ai-leaf','可排期叶任务','todo','ai-auto',{planStartDate:'2030-02-01',planEndDate:'2030-02-02',assignee:'保留的负责人',note:'合成工作说明，非用户数据。'}),
    makeTask('ai-ongoing','未设截止的持续维护','ongoing','ai-auto'),
    makeTask('ai-settled','已完成的历史步骤','done','ai-root',{settledAt:'2020-01-01T00:00:00Z',planStartDate:'2030-01-02',planEndDate:'2030-01-03'}),
    makeTask('ai-outside','其他项目不可默认带入','todo',null,{note:'OUTSIDE-SCOPE-SECRET'}),
  ]
  await reset(fixtures)
  const writes=[]
  const track=request=>{if(new URL(request.url()).pathname==='/api/dsh-task-board/state/write'&&request.method()==='POST')writes.push(request)}
  page.on('request',track)
  const nav=root.getByRole('navigation',{name:'任务栏视图',exact:true})
  await nav.getByRole('button',{name:'甘特图',exact:true}).click()
  await root.locator('.tbGantt').waitFor({state:'visible'})
  await root.getByRole('button',{name:/^AI\s*辅助排期$/}).click()
  const panel=root.getByRole('dialog',{name:'AI 辅助排期',exact:true})
  await panel.waitFor({state:'visible'})
  const before=await state()
  check('AI panel opens without saving dates, sending prompts or expanding task scope',writes.length===0 && JSON.stringify(await state())===JSON.stringify(before))
  check('Global entry defaults to one explicit branch, never all tasks',await panel.getByLabel('排期范围',{exact:false}).inputValue()==='branch:ai-root')
  check('Ongoing scheduling permission is initially unchecked',!await panel.getByRole('checkbox', { name: '本次明确允许为未设截止的持续性工作建议日期（默认不允许）', exact: true }).isChecked())
  await panel.getByRole('button',{name:'预览本次上下文',exact:true}).click()
  const promptBox=panel.getByLabel('本次 AI 排期上下文与提示词',{exact:true})
  const prompt=await promptBox.inputValue()
  const requestIdFrom=text=>JSON.parse(text.match(/```json\n([\s\S]*?)\n```$/)[1]).requestId
  const context={requestId:requestIdFrom(prompt)}
  const taskIds=[...prompt.matchAll(/^任务编号：([^\n]+)$/gm)].map(match=>match[1])
  check('Readable context contains branch descendants including history, but never unrelated roots',taskIds.join()==='ai-root,ai-auto,ai-leaf,ai-ongoing,ai-settled'&&!prompt.includes('OUTSIDE-SCOPE-SECRET'))
  check('Prepared context excludes responsible names, work-domain paths and file contents',!prompt.includes('不可外传的负责人')&&!prompt.includes('保留的负责人')&&!prompt.includes('/not-shared-ui-fixture-path'))
  check('AI instructions forbid tool use and automatic changes; context remains selectable readonly',prompt.includes('不要读取文件')&&prompt.includes('本次只生成提案')&&await promptBox.getAttribute('readonly')!==null)
  check('Parents, settled tasks and open-ended ongoing tasks are not AI-editable',[...prompt.matchAll(/任务编号：([^\n]+)[\s\S]*?允许建议日期：(是|否)/g)].filter(match=>match[2]==='是').map(match=>match[1]).join()==='ai-leaf')
  check('No AI request, native send, task write or implicit schedule is triggered by context preview',writes.length===0&&JSON.stringify(await state())===JSON.stringify(before))
  const draftButton=panel.getByRole('button',{name:'放入当前工作台会话草稿',exact:true})
  check('Empty isolated profile cannot silently write an unowned native session',await draftButton.isDisabled())
  await panel.getByRole('button',{name:'打开原生会话',exact:true}).click()
  const dock=root.locator('.tbAIDock')
  await dock.waitFor({state:'visible'})
  check('Manual native-chat handoff minimizes the panel instead of blocking the composer',await root.locator('.tbAIShade').count()===0&&await root.locator('.tbChat').isVisible()&&writes.length===0)
  await root.getByRole('button',{name:'收起会话',exact:true}).click()
  await dock.getByRole('button',{name:'返回 AI 排期预览',exact:true}).click()
  await panel.waitFor({state:'visible'})
  check('Returning from native chat preserves exact local request and prompt',await promptBox.inputValue()===prompt)
  const proposalBox=panel.getByLabel('本次提案 JSON（仅作为数据校验，不执行内容）',{exact:true})
  const baseChange={id:'ai-leaf',planStartDate:'2030-02-03',planEndDate:'2030-02-07',reason:'受控合成建议，只供 UI 回归。',estimatedDurationDays:3,assumptions:['测试工期为估计，不是已知工作量。']}
  const makeProposal=(changes=[baseChange],extra={})=>({version:1,requestId:context.requestId,changes,assumptions:[],conflicts:[],...extra})
  const importJSON=async value=>{
    await proposalBox.fill(typeof value==='string'?value:JSON.stringify(value))
    await panel.getByRole('button',{name:'校验并预览 JSON 提案',exact:true}).click();await paint()
  }
  const assertBlocked=async label=>{
    const apply=panel.getByRole('button',{name:/^确认应用/})
    check(label,await panel.getByRole('alert').count()>0&&(await apply.count()===0||await apply.isDisabled())&&writes.length===0&&JSON.stringify(await state())===JSON.stringify(before))
  }
  await importJSON('<img src=x onerror="window.__AI_INJECTED__=true">')
  await assertBlocked('Non-JSON/HTML suggestion is rejected as data, not executed')
  check('HTML suggestion executed no browser code',await page.evaluate(()=>window.__AI_INJECTED__===undefined))
  for(const [label,changes]of[
    ['Out-of-scope IDs cannot be applied',[{...baseChange,id:'ai-outside'}]],
    ['AI cannot alter a parent boundary',[{...baseChange,id:'ai-root'}]],
    ['AI cannot replan settled history',[{...baseChange,id:'ai-settled'}]],
    ['Ongoing task remains unplanned without explicit permission',[{...baseChange,id:'ai-ongoing'}]],
    ['Invalid calendar dates are rejected',[{...baseChange,planEndDate:'2030-02-30'}]],
    ['Inverted dates are rejected',[{...baseChange,planEndDate:'2030-02-01'}]],
    ['All manual ancestors constrain suggestions',[{...baseChange,planEndDate:'2031-02-07'}]],
    ['Duplicate task changes are rejected',[baseChange,baseChange]],
    ['Extra assignee field cannot overwrite responsibility',[{...baseChange,assignee:'模型编造名字'}]],
  ]){await importJSON(makeProposal(changes));await assertBlocked(label)}
  await importJSON(makeProposal([baseChange],{requestId:'not-the-prepared-request'}));await assertBlocked('Wrong request correlation is rejected')
  await importJSON(makeProposal([baseChange],{conflicts:['AI 报告了尚未解决的冲突']}));await assertBlocked('AI-reported conflicts block application')
  await importJSON(makeProposal())
  const apply=panel.getByRole('button',{name:'确认应用 1 项日期变更',exact:true})
  check('Valid suggestion shows before/after, estimation assumptions and derived-parent impact',await apply.isEnabled()&&(await panel.locator('.tbAIProposal').textContent()).includes('2030-02-07')&&await panel.locator('.tbAIParentChanges').count()>0)
  check('Even a valid preview does not write task data until confirmation',writes.length===0&&JSON.stringify(await state())===JSON.stringify(before))
  for(const width of [1512,500,360]){
    await page.setViewportSize({width,height:950});await paint()
    const headerBefore=await panel.locator('.tbAIHeader').boundingBox()
    await panel.locator('.tbAIProposal').scrollIntoViewIfNeeded();await paint()
    const geometry=await panel.evaluate(element=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
      const body=element.querySelector('.tbAIBody'),header=element.querySelector('.tbAIHeader'),shade=element.closest('.tbAIShade'),root=element.closest('.tbRoot')
      return {panel:rect(element),header:rect(header),shade:rect(shade),root:rect(root),bodyY:getComputedStyle(body).overflowY,doc:document.documentElement.scrollWidth,view:document.documentElement.clientWidth}
    })
    check(`${width}px AI dialog keeps the close header fixed and all overflow inside its body`,geometry.panel.y>=geometry.shade.y-1&&geometry.panel.bottom<=geometry.shade.bottom+1&&Math.abs(geometry.header.y-headerBefore.y)<=1&&geometry.header.bottom<=geometry.panel.bottom&&geometry.doc<=geometry.view+2&&['auto','scroll'].includes(geometry.bodyY),geometry)
    await screenshot(`proposal-width-${width}`)
  }
  await page.setViewportSize({width:1512,height:950});await paint()
  await panel.locator('.tbAIProposal').scrollIntoViewIfNeeded();await paint();await screenshot('proposal-preview')
  expectHttpFailure('/api/dsh-task-board/state/write',503)
  await page.route('**/api/dsh-task-board/state/write',route=>route.fulfill({status:503,json:{error:'Isolated AI proposal save failure'}}),{times:1})
  await apply.click()
  await panel.getByRole('alert').waitFor({state:'visible'})
  check('Failed AI save rolls back dates and keeps proposal available for explicit retry',JSON.stringify(await state())===JSON.stringify(before)&&await proposalBox.inputValue()===JSON.stringify(makeProposal())&&await apply.isEnabled())
  const failedWriteCount=writes.length
  await apply.click()
  await waitTasks([{id:'ai-leaf',planStartDate:'2030-02-03',planEndDate:'2030-02-07'}])
  await panel.getByRole('button',{name:'本提案已应用',exact:true}).waitFor({state:'visible'})
  const saved=await state(),leafBefore=before.find(task=>task.id==='ai-leaf'),leafAfter=saved.find(task=>task.id==='ai-leaf')
  check('One confirmed proposal retry produces exactly one full-state commit',writes.length===failedWriteCount+1)
  check('Confirmed proposal changes only leaf planned dates and update timestamp',JSON.stringify({...leafAfter,planStartDate:leafBefore.planStartDate,planEndDate:leafBefore.planEndDate,updatedAt:leafBefore.updatedAt})===JSON.stringify(leafBefore))
  check('Owners, status, settlement, root manual bounds, auto-parent bytes and unrelated tasks remain unchanged',before.filter(task=>task.id!=='ai-leaf').every(task=>JSON.stringify(saved.find(value=>value.id===task.id))===JSON.stringify(task)))
  check('Applied proposal cannot be accidentally applied twice',await panel.getByRole('button',{name:'本提案已应用',exact:true}).isDisabled())
  await panel.getByRole('button',{name:'预览本次上下文',exact:true}).click()
  const refreshed={requestId:requestIdFrom(await promptBox.inputValue())}
  await importJSON({version:1,requestId:refreshed.requestId,changes:[],assumptions:[],conflicts:[]})
  const stableWriteCount=writes.length
  check('No-op proposal is visible but cannot cause a write',await panel.getByRole('button',{name:'确认应用 0 项日期变更',exact:true}).isDisabled()&&writes.length===stableWriteCount)
  // A real in-app edit while the request is parked must invalidate its baseline.
  const staleProposal={version:1,requestId:refreshed.requestId,changes:[{...baseChange,planEndDate:'2030-02-09'}],assumptions:[],conflicts:[]}
  await importJSON(staleProposal)
  await panel.getByRole('button',{name:'打开原生会话',exact:true}).click()
  await root.getByRole('button',{name:'收起会话',exact:true}).click()
  await root.locator('.tbGanttRow[data-task-id="ai-leaf"] .tbGanttTaskTitle').click()
  const editor=root.locator('.tbPlanSection')
  await editor.getByRole('button',{name:'编辑可排期叶任务的计划',exact:true}).click()
  await editor.getByLabel('计划完成日期',{exact:true}).fill('2030-02-08')
  await editor.getByRole('button',{name:'保存计划',exact:true}).click()
  await waitTasks([{id:'ai-leaf',planEndDate:'2030-02-08'}])
  const afterManual=await state(),manualWrites=writes.length
  await dock.getByRole('button',{name:'返回 AI 排期预览',exact:true}).click()
  await panel.waitFor({state:'visible'})
  check('Task edits during native-chat handoff invalidate an old proposal',await panel.getByRole('alert').count()>0&&await panel.getByRole('button',{name:/^确认应用/}).isDisabled()&&JSON.stringify(await state())===JSON.stringify(afterManual)&&writes.length===manualWrites)
  await panel.getByRole('button',{name:'关闭 AI 排期',exact:true}).click()
  check('Closing unapplied local context requires an explicit discard choice',await panel.getByRole('button',{name:'丢弃本地草稿并关闭',exact:true}).isVisible())
  await panel.getByRole('button',{name:'丢弃本地草稿并关闭',exact:true}).click()
  await panel.waitFor({state:'hidden'})
  check('Discarding AI local draft never reverts committed task dates',JSON.stringify(await state())===JSON.stringify(afterManual))
  page.off('request',track)
})
