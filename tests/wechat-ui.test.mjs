// Component contract test: render the shipped client with fake React/API; no desktop UI or personal state.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../plugins/dsh-wechat-digest/lib/client.js',import.meta.url),'utf8');
function mount(automatic) {
 let cursor=0,states=[],panel,plugin,calls=[];const R={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity).filter(x=>x!==false&&x!=null)}),useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useRef:value=>({current:value}),useEffect(){}};
 const context={window:{__ModuleLoader__:{load:value=>plugin=value.factory(()=>R)}},fetch:async(_,{body})=>{const args=JSON.parse(body);calls.push(args);return {ok:true,json:async()=>args.action==='list'?{rows:[],automatic}:args.action==='databaseGroups'?{groups:[{id:'synthetic-a@chatroom',name:'同名群'},{id:'synthetic-b@chatroom',name:'同名群'}],automatic}:{automatic}};},AbortController,Uint8Array,Set,Date,Number};
 vm.runInNewContext(source,context);
 plugin.apply({effect(){},slots:{inject:(_name,callback)=>callback(),register:(_spec,component)=>{if(_spec.key==='wechat-digest')panel=component;}}});
 function render(){cursor=0;return panel();}
 let tree=render();states[3]=automatic;
 const nodes = node => typeof node==='object'&&node ? [node,...node.children.flatMap(nodes)] : [];
 const text = node => typeof node==='object'&&node ? node.children.map(text).join('') : String(node??'');
 function button(label){const found=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(found,label);return found;}
 function update(){tree=render();return tree;}
 async function click(label){await button(label).props.onClick();await new Promise(r=>setImmediate(r));update();}
 return {click,button,update,nodes:()=>nodes(tree),text:()=>text(tree),calls};
}
test('client exposes staged authorization and separate exact-ID checkboxes; no implicit sync',async()=>{
 const automatic={available:true,connected:true,enabled:false,accountLabel:'合成账号',revision:'test-scope',groups:[],reason:'合成说明'};const ui=mount(automatic);ui.update();await ui.click('自动接收 · 已暂停');
 assert.ok(ui.text().includes('本人授权'));assert.equal(ui.button('开启所选群自动接收').props.disabled,true);assert.equal(ui.calls.length,0);
 await ui.click('加载 / 刷新群列表');assert.deepEqual(ui.calls.map(x=>x.action),['databaseGroups']);const boxes=ui.nodes().filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(boxes.length,2);assert.ok(ui.text().includes('synthetic-a@chatroom'));assert.ok(ui.text().includes('synthetic-b@chatroom'));
 boxes[0].props.onChange({target:{checked:true}});ui.update();await ui.click('保存所选群并暂停同步');assert.deepEqual(ui.calls.find(x=>x.action==='selectDatabaseGroups').groupIds,['synthetic-a@chatroom']);assert.ok(!ui.calls.some(x=>x.action==='syncDatabase'||x.action==='configureDatabase'));
});
