import assert from 'node:assert/strict'
import { loadTasks, saveTasks } from '../src/task-api.js'
let passed=0
const check=(label,condition)=>{assert.ok(condition,label);console.log(`ok ${++passed} - ${label}`)}
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}})
const legacy=[{id:'old',title:'旧任务',note:'保留'}]
let calls=[]
const good=async(url,options)=>{calls.push({url,options});return reply({scheduleProtocol:1,version:1,tasks:legacy})}
const normalized=await loadTasks(good)
check('New service capability permits legacy tasks without adding schedule defaults',normalized[0].status==='todo'&&!Object.hasOwn(normalized[0],'planStartDate')&&!Object.hasOwn(normalized[0],'assignee'))
check('Client normalization does not mutate original records',!Object.hasOwn(legacy[0],'status'))
check('Load uses same-origin credentials and has no writes',calls.length===1&&calls[0].url==='/api/dsh-task-board/state'&&calls[0].options.credentials==='same-origin'&&!calls[0].options.method)
for(const protocol of [undefined,null,0,2,'1']){
  let error
  try{await loadTasks(async()=>reply({...protocol===undefined?{}:{scheduleProtocol:protocol},tasks:legacy}))}catch(problem){error=problem}
  check(`Missing/incompatible service ${String(protocol)} fails closed before hydration`,error?.message.includes('⌘Q')&&error.message.includes('当前禁止保存'))
}
let shapeError
try{await loadTasks(async()=>reply({scheduleProtocol:1,tasks:{}}))}catch(problem){shapeError=problem}
check('Invalid task shape is never converted to an empty snapshot',shapeError?.message.includes('禁止以空列表覆盖'))
let jsonError
try{await loadTasks(async()=>new Response('not json',{status:200}))}catch(problem){jsonError=problem}
check('Malformed successful response remains a load error',jsonError?.message.includes('数据格式异常'))
let httpError
try{await loadTasks(async()=>reply({error:'isolated read problem'},503))}catch(problem){httpError=problem}
check('Read failure retains server diagnosis and HTTP status',httpError?.message==='isolated read problem（HTTP 503）')
const tasks=[{id:'t',status:'ongoing',planStartDate:null,planEndDate:'2030-12-31',assignee:'我',note:'原记录'}]
let writeCalls=[]
const result=await saveTasks(tasks,async(url,options)=>{writeCalls.push({url,options});return reply({ok:true,count:1})})
check('Save uses one POST with every optional field preserved exactly',writeCalls.length===1&&writeCalls[0].options.method==='POST'&&JSON.stringify(JSON.parse(writeCalls[0].options.body).tasks)===JSON.stringify(tasks))
check('Save keeps source records unchanged and returns acknowledgment',tasks[0].planStartDate===null&&result.ok&&result.count===1)
let writeError
try{await saveTasks(tasks,async()=>reply({error:'isolated save problem'},503))}catch(problem){writeError=problem}
check('Save errors retain diagnosis plus HTTP status for retry UI',writeError?.message==='isolated save problem（HTTP 503）')
let nullError
try{await saveTasks(tasks,async()=>reply(null,400))}catch(problem){nullError=problem}
check('Null save-error JSON yields an actionable fallback rather than TypeError',nullError?.message==='保存任务失败（HTTP 400）')
console.log(`\n${passed}/${passed} client transport checks passed; no actual requests or task files.`)
