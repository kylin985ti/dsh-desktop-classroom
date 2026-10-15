import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {documentURL,documentKind,fileList,documentText,sheetTabs,sheetBounds,sheetCells} from '../plugins/dsh-tencent-docs/lib/workspace.mjs';
import {DocumentBrowser} from '../plugins/dsh-tencent-docs/lib/browser.mjs';
test('document URL allowlist removes grants and rejects foreign origins and login pages',()=>{
 assert.equal(documentURL('https://docs.qq.com/sheet/synthetic?tab=test&access_token=discard&state=discard#private'),'https://docs.qq.com/sheet/synthetic?tab=test');
 for(const url of ['http://docs.qq.com/doc/test','https://docs.qq.com.attacker.test/doc/test','https://u:p@docs.qq.com/doc/test','https://docs.qq.com:444/doc/test','https://docs.qq.com/openapi/mcp/oauth/authorize','file:///private/synthetic'])assert.throws(()=>documentURL(url));
 assert.equal(documentURL('https://docs.qq.com/desktop',{home:true}),'https://docs.qq.com/desktop/');
});
test('recent/search/folder metadata yields document rows without exposing raw API blocks',()=>{
 const result={content:[{type:'text',text:JSON.stringify({data:{files:[{file_info:{file_id:'synthetic-doc',title:'同名文档',file_type:'doc',creator:{nickname:'合成学员'}}},{file_id:'synthetic-sheet',title:'同名文档',file_url:'https://docs.qq.com/sheet/synthetic-sheet?tab=test'},{folder_id:'synthetic-folder',title:'资料',file_type:'folder'}],has_next:false}})}]};
 const {rows,hasMore}=fileList(result);assert.equal(rows.length,3);assert.equal(rows[0].owner,'合成学员');assert.equal(rows[0].url,'https://docs.qq.com/doc/synthetic-doc');assert.equal(rows[1].url,'https://docs.qq.com/sheet/synthetic-sheet?tab=test');assert.equal(rows[2].type,'folder');assert.equal(hasMore,false);assert.equal(fileList({structuredContent:{files:[]}}).rows.length,0);assert.throws(()=>fileList({content:[{type:'text',text:'unrecognized'}]}),/格式/);
});
test('plain document content renders text, including nested paragraphs, not transport JSON',()=>{
 assert.equal(documentText({content:[{type:'text',text:JSON.stringify({content:'合成正文',trace_id:'not-content'})}]}),'合成正文');
 assert.equal(documentText({content:[{type:'text',text:JSON.stringify({data:{blocks:[{text:'第一段'},{content:'第二段'}]}})}]}),'第一段\n\n第二段');
 assert.throws(()=>documentText({content:[{type:'text',text:'a'.repeat(300001)}]}),/较长/);
});
test('web inbox accepts only private exact document captures; dismiss leaves other records intact',async()=>{
 const home=await fs.mkdtemp(join(tmpdir(),'tencent-inbox-'));const browser=new DocumentBrowser(home),id='00000000-0000-4000-a000-000000000001';
 try{
  const root=join(home,'storages/tencent_docs/web-inbox');await fs.mkdir(root,{recursive:true});
  const row={id,kind:'selection',url:'https://docs.qq.com/doc/synthetic?access_token=discard',title:'合成文档',text:'仅此选区',comment:'附加评论',receivedAt:new Date().toISOString()};
  await fs.writeFile(join(root,id+'.json'),JSON.stringify(row),{mode:0o600});
  let rows=await browser.list();assert.equal(rows.length,1);assert.equal(rows[0].comment,'附加评论');assert.equal(rows[0].url,'https://docs.qq.com/doc/synthetic');
  const bad='00000000-0000-4000-a000-000000000002';await fs.writeFile(join(root,bad+'.json'),JSON.stringify({...row,id:bad,url:'https://example.com/doc/private'}),{mode:0o600});
  const symlink='00000000-0000-4000-a000-000000000003';await fs.symlink(join(root,id+'.json'),join(root,symlink+'.json'));assert.equal((await browser.list()).length,1);
  await assert.rejects(browser.dismiss('../connection'));await browser.dismiss(id);assert.equal((await browser.list()).length,0);await fs.access(join(root,bad+'.json'));
 }finally{await fs.rm(home,{recursive:true,force:true});}
});

test('typed sheet preview preserves data and bounds large reads',()=>{
 const wrap=x=>({structuredContent:x});const tabs=sheetTabs(wrap({sheets:[{sheet_id:'tab1',sheet_name:'合成表',row_count:1000,col_count:26},{sheet_id:'hidden',hidden:true,row_count:10,col_count:10}]}));assert.equal(tabs.length,1);const bounds=sheetBounds(tabs[0],40,12);assert.deepEqual(bounds,{startRow:40,startCol:12,endRow:79,endCol:23});assert.throws(()=>sheetBounds(tabs[0],-1),/范围/);
 const cells=sheetCells(wrap({cells:[{row:40,col:12,value_type:'NUMBER',number_value:0},{row:40,col:13,value_type:'BOOL',bool_value:false},{row:41,col:12,value_type:'STRING',string_value:'重复'},{row:41,col:13,value_type:'STRING',string_value:'重复'},{row:100,col:20,value_type:'STRING',string_value:'超出范围'}]}),bounds);assert.deepEqual(cells.map(c=>c.text),['0','false','重复','重复']);assert.equal(documentKind('https://docs.qq.com/document/synthetic'),'document');assert.equal(documentText(wrap({paragraphs:[{text:'重复'},{text:'重复'},{value:0},{value:false}]})),'重复\n\n重复\n\n0\n\nfalse');
});
test('image inbox validates private PNG ownership, dimensions and exact filename; dismiss removes only that capture',async()=>{
 const home=await fs.mkdtemp(join(tmpdir(),'tencent-image-')),browser=new DocumentBrowser(home),id='00000000-0000-4000-a000-000000000011',root=browser.root;
 try{await fs.mkdir(root,{recursive:true});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPhsAAAAASUVORK5CYII=','base64');const record={id,kind:'visual',url:'https://docs.qq.com/slide/synthetic',title:'合成幻灯片',text:'',comment:'请分析',receivedAt:new Date().toISOString(),image:{filename:id+'.png',width:1,height:1,bytes:png.length}};
 await fs.writeFile(join(root,id+'.png'),png,{mode:0o600});await fs.writeFile(join(root,id+'.json'),JSON.stringify(record),{mode:0o600});assert.equal((await browser.list()).length,1);const image=await browser.image(id);assert.equal(image.base64,png.toString('base64'));assert.equal(image.mimeType,'image/png');await assert.rejects(browser.image('../connection'));
 await fs.chmod(join(root,id+'.png'),0o644);assert.equal((await browser.list()).length,0);await assert.rejects(browser.image(id));await fs.chmod(join(root,id+'.png'),0o600);
 record.image.filename='../connection.json';await fs.writeFile(join(root,id+'.json'),JSON.stringify(record),{mode:0o600});assert.equal((await browser.list()).length,0);await browser.dismiss(id);await assert.rejects(fs.access(join(root,id+'.png')));
 }finally{await fs.rm(home,{recursive:true,force:true});}
});
