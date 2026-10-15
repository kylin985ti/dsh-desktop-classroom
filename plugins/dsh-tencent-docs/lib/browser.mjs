import { mkdir, readdir, lstat, readFile, writeFile, rename, unlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { documentURL } from './workspace.mjs';
const ID=/^[a-f0-9-]{36}$/i;
export class DocumentBrowser {
 constructor(home){this.home=home;this.root=join(home,'storages/tencent_docs/web-inbox');}
 async list(){
  await mkdir(this.root,{recursive:true,mode:0o700});const rows=[];
  for(const name of await readdir(this.root)){
   if(!ID.test(name.replace(/\.json$/,''))||!name.endsWith('.json'))continue;
   const path=join(this.root,name),info=await lstat(path);
   if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>100000)continue;
   try{const row=JSON.parse(await readFile(path,'utf8'));const url=documentURL(row.url);
    if(!ID.test(row.id)||row.id+'.json'!==name||!['selection','document'].includes(row.kind)||typeof row.text!=='string'||row.text.length>11000||typeof row.comment!=='string'||row.comment.length>4000||typeof row.title!=='string'||row.title.length>160||!Number.isFinite(Date.parse(row.receivedAt))||row.kind==='selection'&&!row.text.trim())continue;
    rows.push({...row,url});
   }catch{}
  }
  return rows.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,50);
 }
 async dismiss(id){if(!ID.test(id||''))throw Error('请使用有效的选区编号');try{await unlink(join(this.root,id+'.json'));}catch(error){if(error.code!=='ENOENT')throw error;}}
 async installedApp(){
  const path=join(this.home,'classroom/tencent-browser.json'),s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>8192)throw Error('请重新安装腾讯文档浏览窗口');
  const value=JSON.parse(await readFile(path,'utf8')),app=join(homedir(),'Applications/dsh-classroom-tencent','0.1.1','DSH 腾讯文档浏览器 0.1.1.app');
  if(value.version!=='0.1.1'||value.app!==app||await realpath(app)!==app)throw Error('请运行新版教学安装器，安装腾讯文档浏览窗口');
  return app;
 }
 async describe(){try{await this.installedApp();return {available:true,separateWindow:true,minimumMacOS:'13.0'};}catch{return {available:false,separateWindow:true,minimumMacOS:'13.0'};}}
 async open(url){
  if(process.platform!=='darwin')throw Error('腾讯文档浏览窗口当前仅支持 macOS');
  const target=documentURL(url||'https://docs.qq.com/desktop/',{home:true});
  const app=await this.installedApp();
  await mkdir(this.root,{recursive:true,mode:0o700});
  const pending=join(this.root,'browser-request.json'),temporary=pending+'.tmp';
  await writeFile(temporary,JSON.stringify({url:target,home:this.home,requestedAt:new Date().toISOString()}),{mode:0o600});await rename(temporary,pending);
  await new Promise((done,reject)=>{const child=spawn('/usr/bin/open',['-n',app,'--args','--request',pending],{stdio:'ignore'});child.on('error',reject);child.on('close',code=>code===0?done():reject(Error('腾讯文档浏览窗口未能打开')));});
 }
}
