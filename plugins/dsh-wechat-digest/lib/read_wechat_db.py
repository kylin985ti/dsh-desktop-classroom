"""Local SQLCipher read adapter. Only explicitly selected account-bound groups are queried.
Keys arrive over a private pipe; neither keys nor arbitrary SQL are an API output.
"""
import ctypes as C
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
import pwd, tempfile, stat, signal
BASE = Path(pwd.getpwuid(os.getuid()).pw_dir) / 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files'
FRAMEWORKS = Path(__file__).resolve().parent.parent / 'Frameworks'
SQLITE_READONLY = 1
class ReadError(Exception): pass

def library():
    lib = C.CDLL(str(FRAMEWORKS / 'libsqlcipher.dylib'))
    signatures = {
        'sqlite3_open_v2': ([C.c_char_p,C.POINTER(C.c_void_p),C.c_int,C.c_char_p],C.c_int),
        'sqlite3_close': ([C.c_void_p],C.c_int),
        'sqlite3_key': ([C.c_void_p,C.c_void_p,C.c_int],C.c_int),
        'sqlite3_exec': ([C.c_void_p,C.c_char_p,C.c_void_p,C.c_void_p,C.c_void_p],C.c_int),
        'sqlite3_busy_timeout': ([C.c_void_p,C.c_int],C.c_int),
        'sqlite3_prepare_v2': ([C.c_void_p,C.c_char_p,C.c_int,C.POINTER(C.c_void_p),C.c_void_p],C.c_int),
        'sqlite3_bind_int64': ([C.c_void_p,C.c_int,C.c_longlong],C.c_int),
        'sqlite3_bind_text': ([C.c_void_p,C.c_int,C.c_char_p,C.c_int,C.c_void_p],C.c_int),
        'sqlite3_step': ([C.c_void_p],C.c_int), 'sqlite3_finalize': ([C.c_void_p],C.c_int),
        'sqlite3_column_count': ([C.c_void_p],C.c_int),
        'sqlite3_column_name': ([C.c_void_p,C.c_int],C.c_char_p),
        'sqlite3_column_type': ([C.c_void_p,C.c_int],C.c_int),
        'sqlite3_column_int64': ([C.c_void_p,C.c_int],C.c_longlong),
        'sqlite3_column_double': ([C.c_void_p,C.c_int],C.c_double),
        'sqlite3_column_blob': ([C.c_void_p,C.c_int],C.c_void_p),
        'sqlite3_column_text': ([C.c_void_p,C.c_int],C.c_void_p),
        'sqlite3_column_bytes': ([C.c_void_p,C.c_int],C.c_int),
    }
    for name,(args,ret) in signatures.items():
        fn=getattr(lib,name);fn.argtypes=args;fn.restype=ret
    return lib

class Database:
    def __init__(self,path,key):
        self.lib=library();self.handle=C.c_void_p()
        code=self.lib.sqlite3_open_v2(os.fsencode(path),C.byref(self.handle),SQLITE_READONLY,None)
        try:
            if code:raise ReadError('数据库只读打开失败')
            if not re.fullmatch(r'[0-9a-fA-F]{64}',key.get('key','')) or not re.fullmatch(r'[0-9a-fA-F]{32}',key.get('salt','')):raise ReadError('数据库密钥格式无效')
            hmac=key.get('hmac','')
            if hmac and not re.fullmatch(r'[0-9a-fA-F]{64}',hmac):raise ReadError('数据库密钥格式无效')
            blob=("x'"+key['key']+hmac+key['salt']+"'").encode()
            if self.lib.sqlite3_key(self.handle,blob,len(blob)):raise ReadError('数据库密钥设置失败')
            if self.lib.sqlite3_exec(self.handle,b'PRAGMA cipher_compatibility=4; PRAGMA query_only=ON; PRAGMA temp_store=MEMORY;',None,None,None):raise ReadError('数据库只读设置失败')
            self.lib.sqlite3_busy_timeout(self.handle,1500)
            if self.lib.sqlite3_exec(self.handle,b'BEGIN;',None,None,None):raise ReadError('数据库只读快照启动失败')
            self.query('SELECT count(*) AS count FROM sqlite_schema')
        except Exception:
            self.close();raise
    def close(self):
        if self.handle:self.lib.sqlite3_close(self.handle);self.handle=None
    def query(self,sql,params=(),limit=5000):
        stmt=C.c_void_p();buffers=[]
        if self.lib.sqlite3_prepare_v2(self.handle,sql.encode(),-1,C.byref(stmt),None):raise ReadError('数据库结构或密钥验证未通过')
        try:
            for i,value in enumerate(params,1):
                if isinstance(value,int):code=self.lib.sqlite3_bind_int64(stmt,i,value)
                else:
                    value=str(value).encode();buffers.append(value);code=self.lib.sqlite3_bind_text(stmt,i,value,len(value),None)
                if code:raise ReadError('数据库参数绑定失败')
            rows=[]
            while True:
                code=self.lib.sqlite3_step(stmt)
                if code==101:return rows
                if code!=100:raise ReadError('数据库正在变化或页校验失败，请稍后重试')
                row={}
                for i in range(self.lib.sqlite3_column_count(stmt)):
                    name=self.lib.sqlite3_column_name(stmt,i).decode();kind=self.lib.sqlite3_column_type(stmt,i)
                    if kind==1:value=self.lib.sqlite3_column_int64(stmt,i)
                    elif kind==2:value=self.lib.sqlite3_column_double(stmt,i)
                    elif kind==5:value=None
                    else:
                        length=self.lib.sqlite3_column_bytes(stmt,i)
                        if length>2*1024*1024:raise ReadError('单条消息超过读取限制')
                        pointer=(self.lib.sqlite3_column_blob if kind==4 else self.lib.sqlite3_column_text)(stmt,i);value=C.string_at(pointer,length) if pointer else b''
                        if kind==3:value=value.decode('utf-8','replace')
                    row[name]=value
                rows.append(row)
                if len(rows)>limit:raise ReadError('读取范围超过限制，请缩短时间段')
        finally:self.lib.sqlite3_finalize(stmt)
    def columns(self,table):return {row['name'].lower():row['name'] for row in self.query('SELECT name FROM pragma_table_info(?)',(table,))}

def decode(value,compressed=False):
    if value is None:return ''
    if isinstance(value,str):return value
    if compressed or value.startswith(b'\x28\xb5\x2f\xfd'):
        z=C.CDLL(str(FRAMEWORKS / 'libzstd.dylib'));z.ZSTD_decompress.argtypes=[C.c_void_p,C.c_size_t,C.c_void_p,C.c_size_t];z.ZSTD_decompress.restype=C.c_size_t;z.ZSTD_isError.argtypes=[C.c_size_t];z.ZSTD_isError.restype=C.c_uint
        out=C.create_string_buffer(2*1024*1024);n=z.ZSTD_decompress(out,len(out),value,len(value))
        if z.ZSTD_isError(n):raise ReadError('压缩消息暂时无法解析')
        value=out.raw[:n]
    try:return value.decode('utf-8')
    except UnicodeError:raise ReadError('消息编码暂时无法解析')

class Reader:
    def __init__(self, secret, test_root=None):
        self.secret = secret
        self.root = Path(secret.get('accountRoot', '')).resolve()
        if test_root is None:
            if self.root.parent.parent != BASE.resolve() or self.root.name != 'db_storage':
                raise ReadError('账号目录不在当前用户允许范围')
        elif self.root != Path(test_root).resolve():
            raise ReadError('测试目录不匹配')
        if not self.root.is_dir(): raise ReadError('所选微信账号目录不可用')
        self.account_hash = hashlib.sha256(os.fsencode(self.root)).hexdigest()
        if secret.get('accountHash') != self.account_hash: raise ReadError('账号绑定不匹配')
        self.keys = secret.get('keys', {})
        if not isinstance(self.keys, dict) or not 1 <= len(self.keys) <= 32: raise ReadError('数据库密钥范围无效')
        groups = secret.get('approvedGroups', [])
        if not isinstance(groups, list) or len(groups) > 10: raise ReadError('授权群范围无效')
        self.approved = {g['id'] for g in groups if isinstance(g, dict) and isinstance(g.get('id'), str) and g['id'].endswith('@chatroom')}
        if len(self.approved) != len(groups): raise ReadError('授权群身份无效')
        self.snapshots = {}
        self.copy_bytes = 0
        self.temporary = tempfile.TemporaryDirectory(prefix='dsh-wechat-read-')
        os.chmod(self.temporary.name, 0o700)
    def close(self): self.temporary.cleanup()
    def validate(self):
        existing = {str(p.relative_to(self.root)) for p in (self.root/'message').glob('message_*.db') if re.fullmatch(r'message_\d+\.db', p.name)}
        if 'contact/contact.db' not in self.keys or not existing or existing - set(self.keys):
            raise ReadError('联系人或部分消息分片密钥未接通，请重新授权；未读取不完整记录')
        for relative in self.keys:
            db = self.database(relative); db.close()
        return {'ok': True, 'validatedDatabases': len(self.keys), 'chatRowsRead': 0}
    def snapshot(self, relative):
        if relative in self.snapshots: return self.snapshots[relative]
        source = self.root / relative
        destination = Path(self.temporary.name) / relative
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        def fingerprint(path):
            try:
                s = path.lstat()
                if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or path.resolve().parent != source.resolve().parent:
                    raise ReadError('数据库文件身份不匹配')
                return (s.st_ino, s.st_size, s.st_mtime_ns)
            except FileNotFoundError: return None
        for attempt in range(3):
            paths = [source, Path(str(source)+'-wal')]
            before = [fingerprint(p) for p in paths]
            if before[0] is None: raise ReadError('数据库文件不可用')
            if any(row and row[1] > 1024**3 for row in before): raise ReadError('单个数据库快照超过1 GB读取上限')
            for original, row in zip(paths, before):
                target = Path(str(destination) + ('-wal' if str(original).endswith('-wal') else ''))
                if target.exists(): target.unlink()
                if row is None: continue
                # Copy encrypted bytes from a no-follow descriptor, never open the live DB with SQLite.
                fd = os.open(original, os.O_RDONLY | os.O_NOFOLLOW)
                with os.fdopen(fd, 'rb') as stream:
                    info = os.fstat(stream.fileno())
                    if (info.st_ino, info.st_size, info.st_mtime_ns) != row or not stat.S_ISREG(info.st_mode):
                        raise ReadError('数据库在快照前发生变化，请重试')
                    cloned = False
                    if sys.platform == 'darwin':
                        system = C.CDLL('/usr/lib/libSystem.B.dylib')
                        system.fclonefileat.argtypes = [C.c_int, C.c_int, C.c_char_p, C.c_int]
                        cloned = system.fclonefileat(stream.fileno(), -2, os.fsencode(target), 0) == 0
                    if not cloned:
                        self.copy_bytes += row[1]
                        if self.copy_bytes > 4*1024**3: raise ReadError('本次快照复制超过4 GB限制')
                        out = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                        with os.fdopen(out, 'wb') as dest:
                            remaining = row[1]
                            while remaining:
                                chunk = stream.read(min(1024**2, remaining))
                                if not chunk: raise ReadError('数据库快照未完成')
                                dest.write(chunk); remaining -= len(chunk)
                os.chmod(target, 0o600)
            if before == [fingerprint(p) for p in paths]:
                self.snapshots[relative] = destination
                return destination
        raise ReadError('微信数据库正在变化，本次未读取；请稍后重试')
    def database(self, relative):
        if relative != 'contact/contact.db' and not re.fullmatch(r'message/message_(?:[0-9]|[12][0-9]|3[01])\.db', relative):
            raise ReadError('数据库不在允许范围')
        path = self.root / relative
        if path.is_symlink() or self.root not in path.resolve().parents or relative not in self.keys:
            raise ReadError('数据库路径或密钥范围无效')
        return Database(self.snapshot(relative), self.keys[relative])
    def groups(self):
        db = self.database('contact/contact.db')
        try:
            if not {'username','nick_name','remark'} <= set(db.columns('contact')): raise ReadError('联系人表结构尚未适配')
            rows = db.query("SELECT username,nick_name,remark FROM contact WHERE username LIKE '%@chatroom' ORDER BY username LIMIT 10001", limit=10001)
            if len(rows)>10000: raise ReadError('群列表超过读取上限')
            return [{'id':r['username'], 'name':str(r['remark'] or r['nick_name'] or '未命名群')[:160], 'identityHash':hashlib.sha256(r['username'].encode()).hexdigest()} for r in rows if isinstance(r['username'],str) and r['username'].endswith('@chatroom')]
        finally: db.close()
    def bound_name(self, group_id):
        if group_id not in self.approved: raise ReadError('该群尚未授权')
        db = self.database('contact/contact.db')
        try:
            rows = db.query('SELECT username,nick_name,remark FROM contact WHERE username=? LIMIT 2', (group_id,))
            if len(rows)!=1 or rows[0]['username']!=group_id: raise ReadError('所选群身份不可确认，请重新选择')
            return str(rows[0]['remark'] or rows[0]['nick_name'] or '未命名群')[:160]
        finally: db.close()
    def read(self,group_id,since=None):
        if group_id not in self.approved:raise ReadError('该群尚未授权，未读取消息')
        existing={str(p.relative_to(self.root)) for p in (self.root/'message').glob('message_*.db') if re.fullmatch(r'message_\d+\.db',p.name)}
        if existing-set(self.keys):raise ReadError('部分消息分片密钥尚未接入，未发布不完整记录')
        group=group_id;group_name=self.bound_name(group_id);digest=hashlib.md5(group.encode()).hexdigest();tables=['msg_'+digest,'chat_'+digest]
        since=int(since) if isinstance(since,(float,int)) else int(time.time())-86400
        if since < int(time.time())-86405 or since > int(time.time()):raise ReadError('只支持最近24小时内的读取范围')
        messages=[];shards=0;undecoded=0;output_size=0
        contact=self.database('contact/contact.db');display={}
        try:
            for relative in sorted(self.keys):
                if not re.fullmatch(r'message/message_\d+\.db',relative):continue
                db=self.database(relative)
                try:
                    found=db.query('SELECT name FROM sqlite_schema WHERE type=\'table\' AND lower(name) IN (?,?)',tables)
                    if not found:continue
                    shards+=1;table=found[0]['name'];cols=db.columns(table)
                    if not {'local_id','local_type','real_sender_id','create_time','message_content'}<=set(cols):raise ReadError('消息表结构尚未适配')
                    # Identifiers are obtained from an exact hash-name match, never user SQL.
                    if table.lower() not in tables:raise ReadError('群消息表范围不匹配')
                    optional=[cols[k] for k in ['compress_content','wcdb_ct_message_content','server_id'] if k in cols]
                    columns=['local_id','local_type','real_sender_id','create_time','message_content']+optional
                    sql='SELECT '+','.join('"'+x+'"' for x in columns)+' FROM "'+table+'" WHERE (create_time>=? AND create_time<=?) OR (create_time>=? AND create_time<=?) ORDER BY create_time DESC,local_id DESC LIMIT 1001'
                    rows=db.query(sql,(since,int(time.time()),since*1000,int(time.time())*1000),1001)
                    if len(rows)>1000:raise ReadError('当前时间范围消息较多，请缩短读取范围')
                    sender_ids=list({row['real_sender_id'] for row in rows if row.get('real_sender_id') is not None});senders={}
                    if sender_ids and db.columns('Name2Id'):
                        for i in range(0,len(sender_ids),200):
                            chunk=sender_ids[i:i+200]
                            for item in db.query('SELECT rowid,user_name FROM Name2Id WHERE rowid IN ('+','.join('?' for _ in chunk)+')',chunk):senders[item['rowid']]=item['user_name']
                    for row in rows:
                        kind=int(row['local_type'])&0xffffffff
                        if kind==10000:continue
                        sender=senders.get(row['real_sender_id']);sender=sender if sender!=group else None
                        try:
                            compressed=row.get('compress_content');value=compressed if compressed else row['message_content'];flag=row.get(cols.get('wcdb_ct_message_content',''))==4
                            content=decode(value,flag)
                        except ReadError:content='[内容暂时无法解析]';undecoded+=1
                        prefix=re.match(r'^([^:\n]{1,100}):(?:\n|(?=<\?xml|<msg))',content)
                        if prefix and (prefix[1]==sender or re.fullmatch(r'wxid_[A-Za-z0-9_-]+',prefix[1])):
                            sender=sender or prefix[1];content=content[prefix.end():]
                        if sender and sender not in display:
                            names=contact.query('SELECT remark,nick_name FROM contact WHERE username=? LIMIT 1',(sender,));display[sender]=(names[0]['remark'] or names[0]['nick_name']) if names else None
                        if kind!=1:
                            label={3:'图片',34:'语音，未转写',43:'视频',48:'位置',49:'文件或链接'}.get(kind,'非文字消息')
                            if kind==49 and '<' in content and not re.search(r'<!\s*(?:DOCTYPE|ENTITY)',content,re.I):
                                try:
                                    xml=ET.fromstring(content);title=xml.findtext('.//title');content='['+label+'] '+title if title else '['+label+']'
                                except ET.ParseError:content='['+label+']'
                            else:content='['+label+']'
                        timestamp=int(row['create_time']);timestamp=timestamp//1000 if timestamp>10**12 else timestamp
                        identity=str(row.get('server_id') or (relative+':'+str(row['local_id'])))+':'+str(timestamp)+':'+content
                        output_size+=len(content.encode())+512
                        if output_size>6*1024*1024:raise ReadError('读取结果过长，请缩短时间范围')
                        messages.append({'sourceId':hashlib.sha256(identity.encode()).hexdigest(),'timestamp':datetime.fromtimestamp(timestamp,timezone.utc).isoformat(),'sender':display.get(sender),'text':content,'_time':timestamp})
                finally:db.close()
        finally:contact.close()
        unique={row['sourceId']:row for row in messages};rows=sorted(unique.values(),key=lambda row:(row['_time'],row['sourceId']))
        if len(rows)>4000:raise ReadError('当前时间范围消息超过4000条，请缩短范围')
        for row in rows:row.pop('_time',None)
        return {'ok':True,'groupId':group,'targetGroup':group_name,'accountHash':self.account_hash,'groupIdentityHash':hashlib.sha256(group.encode()).hexdigest(),'messages':rows,'recordCount':len(rows),'targetShardCount':shards,'undecodedCount':undecoded,'since':since,'otherChatsQueried':False}

def main():
    def cancelled(*_): raise ReadError('本次读取已取消')
    signal.signal(signal.SIGTERM, cancelled)
    reader = None
    try:
        raw = sys.stdin.buffer.read(32769)
        if len(raw)>32768: raise ReadError('本地请求超出限制')
        request = json.loads(raw)
        reader = Reader(request['secret'])
        action = request.get('action')
        if action == 'validate': result = reader.validate()
        elif action == 'groups': result = {'ok':True, 'groups':reader.groups(), 'chatRowsRead':0}
        elif action == 'read': result = reader.read(request.get('groupId'), request.get('since'))
        else: raise ReadError('不支持的读取操作')
        print(json.dumps(result,ensure_ascii=False))
    except Exception as error:
        message = str(error) if isinstance(error,ReadError) else '本地数据库读取未完成，未输出聊天内容'
        print(json.dumps({'ok':False,'error':message},ensure_ascii=False));sys.exit(1)
    finally:
        if reader is not None: reader.close()
if __name__=='__main__': main()
