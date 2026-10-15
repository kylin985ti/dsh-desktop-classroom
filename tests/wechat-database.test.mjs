import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSource, archiveId } from '../plugins/dsh-wechat-digest/lib/database-source.mjs';
const sha = s => createHash('sha256').update(s).digest('hex');
const group = { id:'synthetic-a@chatroom', name:'同名群', identityHash:sha('synthetic-a@chatroom') };
const current = () => ({ accountHash:sha('synthetic-account'),accountRoot:'/synthetic/db_storage',revision:'scope-1',approvedGroups:[group] });
const reply = c => ({ok:true,accountHash:c.accountHash,groupId:group.id,groupIdentityHash:group.identityHash,targetGroup:'同名群',otherChatsQueried:false,recordCount:1,messages:[{sourceId:sha('message'),text:'合成消息',timestamp:new Date().toISOString()}]});
async function fixture(fn) {
 const root=await mkdtemp(join(tmpdir(),'dsh-db-scope-'));let c=current(),calls=[],received=[],watched=[];
 const db=new DatabaseSource(root,v=>received.push(v),{connection:async()=>c,worker:async(action,args)=>{calls.push({action,args});return reply(c);},watch:(path,cb)=>{const w={path,cb,closed:false,close(){this.closed=true;},on(){}};watched.push(w);return w;}});
 try {await fn({db,calls,received,watched,get:()=>c,set:value=>c=value});} finally {await db.dispose();await rm(root,{recursive:true,force:true});}
}
test('fresh install stays off: no worker call, watch, keychain or database read',()=>fixture(async({db,calls,watched})=>{await db.start();assert.equal(db.config.enabled,false);await db.describe();assert.equal(calls.length,0);assert.equal(watched.length,0);await assert.rejects(db.sync(),/关闭/);}));
test('no selected group prevents enable and any database read',()=>fixture(async({db,calls,set,get})=>{set({...get(),approvedGroups:[]});await assert.rejects(db.configure(true),/选择群聊/);assert.equal(calls.length,0);}));
test('explicit enable reads exact selected ID, partitions archives, stops watchers on pause',()=>fixture(async({db,calls,received,watched})=>{await db.configure(true,1);assert.equal(calls[0].args.groupId,group.id);assert.equal(received.length,1);assert.equal(watched.length,2);await db.configure(false);assert.ok(watched.every(w=>w.closed));await assert.rejects(db.sync());assert.notEqual(archiveId('a','g','day'),archiveId('b','g','day'));assert.notEqual(archiveId('a','g','day'),archiveId('a','h','day'));}));
test('account or group change during in-flight read drops stale output',()=>fixture(async({db,set,get,received})=>{let resolveRead;db.workerOverride=()=>new Promise(r=>resolveRead=r);const task=db.configure(true);while(!resolveRead)await new Promise(r=>setImmediate(r));const old=get();set({...old,revision:'scope-2',accountHash:sha('other-account')});resolveRead(reply(old));await assert.rejects(task,/变化/);assert.equal(received.length,0);assert.equal(db.config.enabled,false);}));
test('scope-forged response never reaches local archive',()=>fixture(async({db,received})=>{db.workerOverride=async()=>({...reply(current()),groupId:'synthetic-b@chatroom'});await assert.rejects(db.configure(true),/范围校验/);assert.equal(received.length,0);assert.equal(db.config.enabled,false);}));
test('zero messages is a successful authorized sync, distinct from no grant',()=>fixture(async({db,get})=>{db.workerOverride=async()=>({...reply(get()),recordCount:0,messages:[]});await db.configure(true);assert.equal((await db.describe()).count,0);assert.equal(db.config.enabled,true);}));
test('scope-directory event pauses enabled stream, without polling',()=>fixture(async({db,set,get,watched})=>{await db.configure(true);set({...get(),revision:'scope-2'});watched[1].cb('rename','connection.json');await new Promise(r=>setTimeout(r,30));assert.equal(db.config.enabled,false);}));
