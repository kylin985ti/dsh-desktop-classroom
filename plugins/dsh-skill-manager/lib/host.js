import * as upstream from './upstream-host.mjs';
import { Readable } from 'node:stream';
import { mkdir, cp, realpath, lstat } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
export const name = upstream.name;
export const Config = upstream.Config;
export const inject = ['connection', 'settings'];
export const __test = upstream.__test;
const TYPE = 'skill-manager';
export function apply(ctx, config) {
 const home = process.env.DSH_HOME || join(homedir(), 'Library/Application Support/dsh-desktop/harness');
 const patchPath = resolve(process.env.DSH_PROFILE_DIR || join(home,'profiles/web'),'cordis.patch.yml');
 const routes = new Map(); let mutations = Promise.resolve();
 const invoke = async (route, request, bytes) => {
   let status=200, headers={}, output='';
   const req=Readable.from(bytes.length ? [bytes] : []); req.headers=Object.fromEntries(request.headers);req.headers.host ||=new URL(request.url).host;req.url=new URL(request.url).pathname+new URL(request.url).search;req.method=request.method;
   const res={writeHead(code, values){status=code;headers=values;},end(value){output=value||'';}};
   await route.handler(req,res); return new Response(output,{status,headers});
 };
 const bridge = { register(route) {
   routes.set(route.path,route);
   const native=ctx.connection.fetch.register({path:route.path,methods:['GET','POST'],requestBody:'buffered',async fetch(request){
     try {
       const bytes=Buffer.from(await request.arrayBuffer()); if(bytes.length>1048576)return Response.json({ok:false,error:'请求超过1 MB限制'},{status:413});
       const suffix=route.path.split('/').at(-1), body=bytes.length?JSON.parse(bytes):{};
       if(TYPE==='mcp-manager' && suffix==='config' && body.patchFile && resolve(body.patchFile)!==patchPath)throw new Error('只能管理当前 DSH Desktop profile 的 MCP 配置');
       if(TYPE==='skill-manager' && request.method==='POST' && suffix!=='config' && Object.values(body).includes('global-agents'))throw new Error('共享 Skills 仅供查看，请复制到 DSH Desktop 专属目录后编辑');
       const operation=async()=>{
         if(TYPE==='skill-manager' && ['update','toggle','remove','transfer'].includes(suffix)){
           const stateRoute=routes.get('/ext/dshp-skill-manager/state');
           const state=await (await invoke(stateRoute,new Request(request.url,{headers:request.headers}),Buffer.alloc(0))).json();
           const entry=state.state?.skills.find(x=>x.rootId===(body.rootId||body.fromRootId)&&x.name===(body.name||body.fromName));
           if(entry){
             const root=state.state.roots.find(x=>x.id===entry.rootId), realRoot=await realpath(root.path), path=await realpath(entry.entryPath);
             if(!path.startsWith(realRoot+sep))throw new Error('技能路径超出根目录');
             const from=entry.kind==='bundle'?dirname(path):path, stat=await lstat(from);if(stat.isSymbolicLink())throw new Error('不修改符号链接技能');
             const backup=join(home,'storages/skill_manager/backups',randomUUID());await mkdir(backup,{recursive:true,mode:0o700});await cp(from,join(backup,entry.dirName),{recursive:true,dereference:false,errorOnExist:true});
           }
         }
         return invoke(route,request,bytes);
       };
       if(request.method==='GET')return await operation();
       const next=mutations.then(operation);mutations=next.catch(()=>{});return await next;
     }catch(error){return Response.json({ok:false,error:String(error.message).slice(0,300)},{status:400});}
   }});
   return ()=>{routes.delete(route.path);native();};
 }};
 const adapter=new Proxy(ctx,{get(target,key){if(key==='webServer')return bridge;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 const configOriginal=config;
 if(TYPE==='mcp-manager')config={...config,patchFile:{get:()=>{const value=configOriginal.patchFile.get();if(value&&resolve(value)!==patchPath)throw new Error('MCP patch 必须属于当前 profile');return patchPath;}}};
 upstream.apply(adapter,config);
}
