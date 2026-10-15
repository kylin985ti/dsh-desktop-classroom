import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {File} from 'node:buffer';
const source=await readFile(new URL('../plugins/dsh-tencent-docs/lib/client.js',import.meta.url),'utf8');
function fixture(options={}){
 let plugin,Panel,cursor=0,tape=[],activeTape=tape,actions=[],inserted=[],selectedSession='synthetic-session';
 const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(v=>v!=null&&v!==false)}),Fragment:'fragment',useState:initial=>{const index=cursor++;if(!(index in activeTape))activeTape[index]=initial;const target=activeTape;return[target[index],v=>target[index]=typeof v==='function'?v(target[index]):v];},useRef:value=>{const i=cursor++;return activeTape[i] ||= {current:value};},useEffect(){}};
 const input={phase:'plain',draft:'保留已有文字 @sample.txt 以及附件',occurrences:[{source:'file',offset:7,length:11,ref:'/synthetic/sample.txt'}]};
 const attachments=[],released=[],files=[];
 const binding={get key(){return selectedSession;},hooks:{input:{getSnapshot:()=>input}},props:{inputActions:{captureInsertion:()=>({rev:'native-rev'}),addAttachments:ids=>{attachments.push(...ids);return true;},removeAttachment:id=>{const i=attachments.indexOf(id);if(i>=0)attachments.splice(i,1);}}},ctx:{bail(_ctx,event,args){if(options.rejectInsert)return false;inserted.push({event,args});return true;}}};
 const ctx={conversation:{async createDrafts(id,uploads){files.push(...uploads);if(options.switchDuringImage)selectedSession='other-session';return[{id:'synthetic-image'}];},releaseDraftAttachments:drafts=>released.push(...drafts)},uiSession:{adapter:{current:{getSnapshot:()=>binding}}},layout:{selectPanel:value=>actions.push({layout:value})},effect(){},slots:{inject:(_slot,f)=>f(),register:(options,component)=>{if(options.key==='tencent-docs')Panel=component;}}};
 const context={window:{__ModuleLoader__:{load:value=>plugin=value.factory(name=>name==='react'?React:{MarkdownText:'markdown'})},__DSH_QUOTE_CONTEXT__:true,crypto:{randomUUID},dispatchEvent(){},atob:v=>Buffer.from(v,'base64').toString('binary'),btoa:v=>Buffer.from(v,'binary').toString('base64')},fetch:async(_url,{body})=>{const q=JSON.parse(body);actions.push(q);return{ok:true,json:async()=>q.action==='preview'?{text:'合成文档正文。未选择的其他段落。'}:{ok:true,rows:[]}};},File,TextEncoder,Uint8Array,AbortController,Event,requestAnimationFrame:fn=>setImmediate(fn)};
 vm.runInNewContext(source,context);plugin.apply(ctx);
 function render(){cursor=0;activeTape=tape;return Panel();}
 let tree=render();tape[0]={authorized:true,browser:{available:true}};tape[2]=[{id:'synthetic-doc',title:'合成计划',url:'https://docs.qq.com/doc/synthetic',owner:'合成学员'}];tree=render();
 const nodes=v=>v&&typeof v==='object'?[v,...v.children.flatMap(nodes)]:[];
 const text=v=>v&&typeof v==='object'?v.children.map(text).join(''):String(v??'');
 const button=(label,root=tree)=>{const b=nodes(root).find(n=>n.type==='button'&&text(n)===label);assert.ok(b,label);return b;};
 return {input,actions,inserted,tape,attachments,released,files,nodes,text,component(node,state=[]){cursor=0;activeTape=state;return node.type(node.props);},render,button,setSession:v=>selectedSession=v,tree:()=>tree,async read(){await button('加入会话').props.onClick();tree=render();return nodes(tree).find(n=>typeof n.type==='function'&&n.props.data)?.props;},preview(props,{selected='',comment='合成评论'}={}){const state=[comment,selected];cursor=0;activeTape=state;const component=nodes(tree).find(n=>typeof n.type==='function'&&n.props.data).type;return component(props);}};
}
test('workspace starts on document list; settings and raw API JSON are not the entry screen',()=>{
 const f=fixture(),tree=f.tree();assert.ok(f.button('加入会话'));assert.ok(f.button('打开腾讯文档'));assert.ok(!JSON.stringify(tree).includes('个人 Token 连接'));assert.equal(f.actions.length,0);
});
test('quote carries selected content and comment in an atomic native reference; draft and attachments stay intact',async()=>{
 const f=fixture(),before=JSON.stringify(f.input),props=await f.read(),dialog=f.preview(props,{selected:'只选这一句',comment:'请分析这句'});
 await f.button('将选区加入当前草稿',dialog).props.onClick();assert.equal(f.inserted.length,1);const {event,args}=f.inserted[0];assert.equal(event,'slash/input-insert-reference');assert.equal(args.reference.source,'quote-context');const value=JSON.parse(args.reference.ref);assert.equal(value.text,'只选这一句\n\n来源：https://docs.qq.com/doc/synthetic');assert.equal(value.comment,'请分析这句');assert.equal(value.sessionId,'synthetic-session');assert.equal(args.span.start,f.input.draft.length-10);assert.equal(args.span.start,args.span.end);assert.equal(JSON.stringify(f.input),before);assert.deepEqual(f.actions.filter(a=>a.action).map(a=>a.action),['preview','webInbox']);
});
test('switching sessions after preview refuses the old target',async()=>{
 const f=fixture(),props=await f.read(),dialog=f.preview(props);f.setSession('other-session');await f.button('加入当前草稿',dialog).props.onClick();assert.equal(f.inserted.length,0);
});
test('oversized full document cannot be silently truncated into a quote',async()=>{
 const f=fixture(),props=await f.read();props.data.text='a'.repeat(11001);const dialog=f.preview(props,{comment:''});assert.equal(f.button('加入当前草稿',dialog).props.disabled,true);assert.equal(f.inserted.length,0);
});

test('retrying an already inserted web capture at the quote limit does not duplicate it',async()=>{
 const f=fixture(),props=await f.read(),id='0506f54b-2f20-4a60-8f44-17e6e96d7001';props.data.inboxId=id;
 f.input.occurrences.push(...Array.from({length:10},(_,i)=>({source:'quote-context',offset:i,length:1,ref:JSON.stringify({id:i===0?id:'other-'+i})})));
 const dialog=f.preview(props);await f.button('加入当前草稿',dialog).props.onClick();assert.equal(f.inserted.length,0);assert.ok(f.actions.some(a=>a.action==='dismissWeb'&&a.id===id));
});
test('command input phase refuses a reference without clearing existing text or attachments',async()=>{
 const f=fixture(),props=await f.read();f.input.phase='command';const before=JSON.stringify(f.input),dialog=f.preview(props);await f.button('加入当前草稿',dialog).props.onClick();assert.equal(f.inserted.length,0);assert.equal(JSON.stringify(f.input),before);
});

const image={base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPhsAAAAASUVORK5CYII=',mimeType:'image/png',name:'synthetic.png',width:1,height:1};
test('visual quote creates a real PNG image draft plus comment/source card, without sending',async()=>{
 const f=fixture(),props=await f.read(),before=JSON.stringify(f.input);Object.assign(props.data,{image,kind:'visual'});
 const dialog=f.preview(props);await f.button('将图片加入当前草稿',dialog).props.onClick();
 assert.equal(f.files.length,1);assert.equal(f.files[0].type,'image/png');assert.equal((await f.files[0].arrayBuffer()).byteLength,Buffer.from(image.base64,'base64').length);assert.deepEqual(f.attachments,['synthetic-image']);assert.equal(f.inserted.length,1);assert.equal(f.released.length,0);assert.equal(JSON.stringify(f.input),before);assert.equal(f.actions.some(a=>/send|submit/.test(a.action||'')),false);
});
test('failed quote insertion rolls back only newly created image drafts',async()=>{
 const f=fixture({rejectInsert:true}),props=await f.read();Object.assign(props.data,{image,kind:'visual'});
 await f.button('将图片加入当前草稿',f.preview(props)).props.onClick();assert.equal(f.inserted.length,0);assert.deepEqual(f.attachments,[]);assert.equal(f.released.length,1);
});
test('session change while preparing an image releases the draft without attaching or inserting',async()=>{
 const f=fixture({switchDuringImage:true}),props=await f.read();Object.assign(props.data,{image,kind:'visual'});
 await f.button('将图片加入当前草稿',f.preview(props)).props.onClick();assert.equal(f.inserted.length,0);assert.deepEqual(f.attachments,[]);assert.equal(f.released.length,1);
});
test('spreadsheet range quote keeps row/column labels, repeated cells, zero and false',async()=>{
 const f=fixture(),props=await f.read();Object.assign(props.data,{kind:'sheet',text:'',tabs:[{id:'tab1',title:'合成表'}],sheet:{id:'tab1',title:'合成表',rows:2,columns:2},bounds:{startRow:0,endRow:1,startCol:0,endCol:1},cells:[{row:0,col:0,text:'重复'},{row:0,col:1,text:'重复'},{row:1,col:0,text:'0'},{row:1,col:1,text:'false'}]});
 const dialog=f.preview(props),grid=f.nodes(dialog).find(n=>typeof n.type==='function'&&n.props.view);assert.ok(grid);let selected;grid.props.onSelect=v=>selected=v;const tree=f.component(grid);await f.button('选择当前页',tree).props.onClick();assert.match(selected,/合成表 · A1:B2/);assert.match(selected,/\| 1 \| 重复 \| 重复 \|/);assert.match(selected,/\| 2 \| 0 \| false \|/);
});
