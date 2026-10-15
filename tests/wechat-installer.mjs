// Runs against a locally built helper ZIP; never opens the GUI or WeChat.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { installWeChatBridge } from '../scripts/install-wechat.mjs';
const archive=resolve(process.argv[2]);
const manifest=JSON.parse(await fs.readFile(new URL('../classroom.json',import.meta.url)));
const arch=process.arch==='arm64'?'arm64':'x64';manifest.wechatBridge.assets[arch].sha256=createHash('sha256').update(await fs.readFile(archive)).digest('hex');
const root=await fs.mkdtemp(join(tmpdir(),'dsh-helper-install-'));
try {
 const home=join(root,'home'),options={archive,applications:join(root,'Applications'),cache:join(root,'cache')};
 const first=await installWeChatBridge(manifest,home,options);assert.equal(first.defaultEnabled,false);assert.equal(first.authorizationsImported,0);
 const state=join(home,'storages/wechat_digest/database');await fs.mkdir(state,{recursive:true});const fixture=JSON.stringify({account:'synthetic-student',groups:['synthetic@chatroom']});await fs.writeFile(join(state,'synthetic-student-state.json'),fixture);
 const second=await installWeChatBridge(manifest,home,options);assert.equal(first.sha256,second.sha256);assert.equal(await fs.readFile(join(state,'synthetic-student-state.json'),'utf8'),fixture);
 const corrupted=join(root,'corrupted.zip');await fs.writeFile(corrupted,'synthetic-invalid-download');await assert.rejects(installWeChatBridge(manifest,home,{...options,archive:corrupted}),/SHA256/);
 await assert.rejects(fs.access(join(state,'connection.json')));await assert.rejects(fs.access(join(state,'sync.json')));
 console.log('PASS helper installation/repeat/hash rejection/state preservation; no GUI, account authorization, Keychain or database reads.');
} finally {await fs.rm(root,{recursive:true,force:true});}
