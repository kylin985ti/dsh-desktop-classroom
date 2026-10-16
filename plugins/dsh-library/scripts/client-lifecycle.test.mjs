import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../src/library-model.js';
import { collaborationInput } from '../lib/ai-context.mjs';

const source = await readFile(new URL('../src/client-base.js', import.meta.url), 'utf8');
function localFunction(begin, end, names, values) {
  const a=source.indexOf(begin),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,'reviewed production function boundaries exist');
  const expression=source.slice(a,b).trim().replace(/^const\s+\w+\s*=\s*/,'').replace(/;\s*$/,'');
  return Function(...names, 'return ('+expression+');')(...values);
}
function sample(text='原文与选区') {
  return {id:'test-file',title:"O'Brien.md",path:"/workspace/O'Brien.md",kind:'markdown',editable:true,hash:'a'.repeat(64),text};
}
function prepareHarness({dirty=true}={}) {
  const id='test-file',doc=sample(),ref={current:{doc,draft:doc.text,baseHash:doc.hash,dirty,conflict:false,selection:'选区',ai:false,prompt:'',target:'new'}};
  const paneDrafts=new Map();let alive=true,writes=0,release;
  const saved=new Promise(resolve=>release=resolve);
  const patch=localFunction('const patch = (value) => {','    const announce =', ['ref','paneDrafts','id','alive','setS'], [ref,paneDrafts,id,{get current(){return alive}},()=>{}]);
  // The production patch reads alive.current; no component state is written after unmount.
  const saveFile=async()=>{writes++;await saved;ref.current={...ref.current,doc:{...doc,hash:'b'.repeat(64),text:doc.text},baseHash:'b'.repeat(64),dirty:false};};
  const prepare=localFunction('const prepareReference=','    const locateReference=', ['ref','T','saveFile','patch','paneDrafts','id','window','article'],[ref,T,saveFile,patch,paneDrafts,id,{getSelection:()=>null},{current:null}]);
  return {ref,paneDrafts,prepare,release,unmount:()=>{alive=false},writes:()=>writes};
}

test('preparing a dirty quote survives unmount while autosave is in flight',async()=>{
  const h=prepareHarness(),pending=h.prepare('selection');
  const initial=h.paneDrafts.get('test-file').reference;
  assert.equal(initial.text,'选区');assert.equal(h.writes(),1);
  h.unmount();h.release();await pending;
  const restored=h.paneDrafts.get('test-file').reference;
  assert.equal(restored.id,initial.id);assert.equal(restored.sourceText,'原文与选区');assert.equal(restored.baseHash,'b'.repeat(64));
  assert.equal(T.referenceStale(restored,h.ref.current.doc,h.ref.current.draft),false);
});

test('oversized quote fails before requesting any save',async()=>{
  const h=prepareHarness();await assert.rejects(h.prepare('selection','x'.repeat(12001)),/12000/);assert.equal(h.writes(),0);assert.equal(h.paneDrafts.size,0);
});

function askHarness() {
  const doc=sample(),reference=T.createReference(doc,{scope:'selection',text:'选区',draft:doc.text,hash:doc.hash});
  const ref={current:{doc,draft:doc.text,baseHash:doc.hash,prompt:'解释这段',reference,aiScope:'selection'}},calls=[];
  const ask=localFunction('const ask = (mode) =>','    const resolveProposal =',
    ['safely','commitVisual','ref','T','saveFile','api','patch','id'],
    [(_label,fn)=>fn(new AbortController().signal),async()=>{},ref,{...T,collaborationInput},async()=>{},async(action,args)=>{calls.push({action,...args});return{history:[]}},value=>Object.assign(ref.current,value),doc.id]);
  return {ref,calls,ask};
}

test('AI submits only the visible reference and explicit context choice, never a hidden live selection',async()=>{
  const h=askHarness();h.ref.current.selection='其他不可见选段';await h.ask('question');
  assert.equal(h.calls[0].selection,'选区');assert.equal(h.calls[0].contextScope,'selection');assert.equal(h.calls[0].expectedHash,h.ref.current.doc.hash);
  h.ref.current.aiScope='document';h.ref.current.prompt='结合全文';await h.ask('question');assert.equal(h.calls[1].contextScope,'document');
  h.ref.current.reference=null;h.ref.current.prompt='处理整篇';await h.ask('question');assert.equal(h.calls[2].selection,'');
});

test('a stale visible AI reference cannot submit either a question or an edit',async()=>{
  const h=askHarness();h.ref.current.draft+='正文有新修改';
  await assert.rejects(h.ask('question'),/正文已变化/);await assert.rejects(h.ask('edit'),/正文已变化/);assert.equal(h.calls.length,0);assert.equal(h.ref.current.prompt,'解释这段');
});

function snapshot(value){const listeners=new Set();return{getSnapshot:()=>value,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},set:v=>{value=v;for(const f of [...listeners])f()},listeners};}
function readinessHarness(){
  const actions={captureInsertion:()=>({start:0,end:0,draftRev:1})},input=snapshot({phase:'plain'}),binding={key:'test-session',ctx:{bail(){}},hooks:{input},props:{inputActions:actions}},current=snapshot(binding);
  const inputSeats=new Map([['test-session',{inputActions:actions,ready:false}]]),seatListeners=new Set(),runtime={uiSession:{adapter:{current}}};
  const wait=localFunction('function waitForInput(sessionId, signal) {','  async function transferReference(',['runtime','inputSeats','seatListeners'],[runtime,inputSeats,seatListeners]);
  return{wait,current,input,inputSeats,seatListeners,actions};
}

test('plain input is insufficient before the mounted composer readiness gate',async()=>{
  const h=readinessHarness(),abort=new AbortController();let resolved=false;
  const pending=h.wait('test-session',abort.signal).then(()=>resolved=true);
  await Promise.resolve();assert.equal(resolved,false);
  h.inputSeats.get('test-session').ready=true;for(const f of [...h.seatListeners])f();await pending;
  assert.equal(resolved,true);assert.equal(h.current.listeners.size,0);assert.equal(h.input.listeners.size,0);assert.equal(h.seatListeners.size,0);
});

test('readiness gate waits for editable phase and cleans up on cancellation',async()=>{
  const h=readinessHarness(),abort=new AbortController();h.input.set({phase:'claimed'});h.inputSeats.get('test-session').ready=true;
  const pending=h.wait('test-session',abort.signal);abort.abort();await assert.rejects(pending,/取消/);
  assert.equal(h.current.listeners.size,0);assert.equal(h.input.listeners.size,0);assert.equal(h.seatListeners.size,0);
});

test('a seat from another composer identity never authorizes insertion',async()=>{
  const h=readinessHarness(),abort=new AbortController();h.inputSeats.set('test-session',{inputActions:{},ready:true});let resolved=false;
  const pending=h.wait('test-session',abort.signal).then(()=>resolved=true);await Promise.resolve();assert.equal(resolved,false);abort.abort();await assert.rejects(pending,/取消/);
});
