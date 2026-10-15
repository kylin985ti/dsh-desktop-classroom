import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const sources={
 '@modelcontextprotocol/client':`export class Client { constructor(){this.fixture=globalThis.__tencentApiFixture;}async connect(){}async close(){}async listTools(){return{tools:this.fixture.tools};}async callTool(query){this.fixture.calls.push(query);return this.fixture.answer(query);} } export class StreamableHTTPClientTransport {}`,
 '@deepseek-ai/dsh-mcp-client':`export const createMcpToolDefinition=(_ctx,value)=>value;`,
};
const hook=registerHooks({resolve(specifier,context,next){return sources[specifier]?{url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true}:next(specifier,context);}});
const {apply,isReadOnly}=await import('../plugins/dsh-tencent-docs/lib/index.mjs');hook.deregister();
async function fixture(granted){
 const home=await fs.mkdtemp(join(tmpdir(),'dsh-tencent-api-')),previous=process.env.DSH_HOME;process.env.DSH_HOME=home;
 const fixture={calls:[],tools:['manage.recent_online_file','manage.folder_list','manage.search_file','get_content'].map(name=>({name,inputSchema:{type:'object',properties:name==='manage.search_file'?{search_key:{type:'string'}}:{}}})),answer(query){return{content:[{type:'text',text:JSON.stringify(query.name==='get_content'?{content:'合成正文，供选区引用。'}:{data:{file_list:[{file_id:'synthetic',title:'合成文档',file_type:'doc'}],has_more:false}})}]};}};
 globalThis.__tencentApiFixture=fixture;let route;const cleanup=[];
 try{await apply({effect:fn=>{const value=fn();if(typeof value==='function')cleanup.push(value);},credentials:{readRecord:async()=>granted?{kind:'grant',payload:{mode:'personal-token',accessToken:'synthetic-only'}}:null},tools:{register:()=>()=>{}},connection:{fetch:{register:options=>{route=options;return()=>{};}}}});}finally{if(previous===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previous;}
 return {calls:fixture.calls,async request(value){const response=await route.fetch(new Request('http://localhost/api/tencent-docs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)}));return{status:response.status,value:await response.json()};},async close(){for(const fn of cleanup.reverse())fn();delete globalThis.__tencentApiFixture;await fs.rm(home,{recursive:true,force:true});}};
}
test('workspace without an API grant returns an unconnected list and never calls Tencent',async()=>{
 const f=await fixture(false);try{const r=await f.request({action:'workspace'});assert.equal(r.status,200);assert.equal(r.value.authorized,false);assert.deepEqual(r.value.rows,[]);assert.equal(f.calls.length,0);}finally{await f.close();}
});
test('recent and folder workspace use the verified paging schemas and only read tools',async()=>{
 const f=await fixture(true);try{let r=await f.request({action:'workspace',section:'recent',page:2});assert.equal(r.status,200);assert.equal(r.value.rows[0].title,'合成文档');assert.deepEqual(f.calls.at(-1),{name:'manage.recent_online_file',arguments:{num:2,count:20,order_by:0}});r=await f.request({action:'workspace',section:'mine',page:3,folderId:'synthetic-folder'});assert.equal(r.status,200);assert.deepEqual(f.calls.at(-1),{name:'manage.folder_list',arguments:{start:40,folder_id:'synthetic-folder'}});assert.ok(f.calls.every(q=>isReadOnly({name:q.name})));const count=f.calls.length;r=await f.request({action:'workspace',page:-1});assert.equal(r.status,400);assert.equal(f.calls.length,count);}finally{await f.close();}
});
test('preview reads plain content; search uses its discovered key and source links lose grants',async()=>{
 const f=await fixture(true);try{let r=await f.request({action:'preview',fileId:'https://docs.qq.com/doc/synthetic'});assert.equal(r.status,200);assert.equal(r.value.text,'合成正文，供选区引用。');r=await f.request({action:'search',query:'合成'});assert.equal(r.status,200);assert.deepEqual(f.calls.at(-1),{name:'manage.search_file',arguments:{search_key:'合成'}});r=await f.request({action:'documentLink',url:'https://docs.qq.com/sheet/synthetic?tab=demo&access_token=synthetic#secret'});assert.equal(r.value.url,'https://docs.qq.com/sheet/synthetic?tab=demo');const count=f.calls.length;for(const fileId of ['https://example.com/doc/synthetic','https://docs.qq.com:8443/doc/synthetic','https://user:pass@docs.qq.com/doc/synthetic']){r=await f.request({action:'preview',fileId});assert.equal(r.status,400);assert.equal(f.calls.length,count);}}finally{await f.close();}
});
