import { mkdir, readdir, lstat, readFile, writeFile, rename, unlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { documentURL } from './workspace.mjs';
const ID=/^[a-f0-9-]{36}$/i;
const MAX_IMAGE=8*1024*1024;
export class DocumentBrowser {
 constructor(home){this.home=home;this.root=join(home,'storages/tencent_docs/web-inbox');}
 async list(){
  await mkdir(this.root,{recursive:true,mode:0o700});const rows=[];
  for(const name of await readdir(this.root)){
   if(!ID.test(name.replace(/\.json$/,''))||!name.endsWith('.json'))continue;
   const path=join(this.root,name),info=await lstat(path);
   if(!info.isFile()||info.isSymbolicLink()||info.uid!==process.getuid()||(info.mode&0o077)||info.size>100000)continue;
   try{const row=JSON.parse(await readFile(path,'utf8'));const url=documentURL(row.url);
    if(!ID.test(row.id)||row.id+'.json'!==name||!['selection','document','visual'].includes(row.kind)||typeof row.text!=='string'||row.text.length>11000||typeof row.comment!=='string'||row.comment.length>4000||typeof row.title!=='string'||row.title.length>160||!Number.isFinite(Date.parse(row.receivedAt))||row.kind==='selection'&&!row.text.trim())continue;
    if(row.kind==='visual')await this.imageFile(row);
    rows.push({id:row.id,kind:row.kind,title:row.title,text:row.text,comment:row.comment,receivedAt:row.receivedAt,url,...(row.kind==='visual'?{image:{width:row.image.width,height:row.image.height,bytes:row.image.bytes}}:{})});
   }catch{}
  }
  return rows.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,50);
 }
 async imageFile(row){
  const image=row.image;
  if(!image||image.filename!==row.id+'.png'||!Number.isInteger(image.bytes)||image.bytes<33||image.bytes>MAX_IMAGE||![image.width,image.height].every(v=>Number.isInteger(v)&&v>0&&v<=8192)||image.width*image.height>16000000)throw Error('请重新框选图片');
  const path=join(this.root,image.filename),s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size!==image.bytes)throw Error('请重新接收图片');
  return path;
 }
 async image(id){
  if(!ID.test(id||''))throw Error('请使用有效的选区编号');
  const row=(await this.list()).find(r=>r.id===id&&r.kind==='visual');if(!row)throw Error('请重新接收图片');
  const full={...row,image:{...row.image,filename:id+'.png'}},data=await readFile(await this.imageFile(full));
  if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.toString('ascii',12,16)!=='IHDR'||data.readUInt32BE(16)!==row.image.width||data.readUInt32BE(20)!==row.image.height)throw Error('请重新框选有效图片');
  return {base64:data.toString('base64'),mimeType:'image/png',name:'腾讯文档选区-'+id.slice(0,8)+'.png',width:row.image.width,height:row.image.height};
 }
 async dismiss(id){if(!ID.test(id||''))throw Error('请使用有效的选区编号');for(const ext of ['.json','.png'])try{await unlink(join(this.root,id+ext));}catch(error){if(error.code!=='ENOENT')throw error;}}
 async installedApp(){
  const path=join(this.home,'classroom/tencent-browser.json'),s=await lstat(path);
  if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o077)||s.size>8192)throw Error('请重新安装腾讯文档浏览窗口');
  const value=JSON.parse(await readFile(path,'utf8')),app=join(homedir(),'Applications/dsh-classroom-tencent','0.2.0','DSH 腾讯文档浏览器 0.2.0.app');
  if(value.version!=='0.2.0'||value.app!==app||await realpath(app)!==app)throw Error('请运行新版教学安装器，安装腾讯文档浏览窗口');
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
