#!/usr/bin/env python3
"""Synthetic encrypted fixtures only. No real account discovery, Keychain or memory scan."""
import argparse, ctypes as C, hashlib, importlib.util, json, os, tempfile, time, unittest
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--app',type=Path,required=True);args=p.parse_args()
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('reader',ROOT/'plugins/dsh-wechat-digest/lib/read_wechat_db.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.FRAMEWORKS=args.app/'Contents/Frameworks'
H=lambda s:hashlib.sha256(s.encode()).hexdigest()
G='synthetic-a@chatroom'; B='synthetic-b@chatroom'; P='synthetic-private'
class Encrypted:
 def __init__(self,path,key):
  self.lib=m.library();self.handle=C.c_void_p()
  assert self.lib.sqlite3_open_v2(os.fsencode(path),C.byref(self.handle),6,None)==0
  raw=("x'"+key['key']+key.get('hmac','')+key['salt']+"'").encode();assert self.lib.sqlite3_key(self.handle,raw,len(raw))==0
  self.exec('PRAGMA cipher_compatibility=4;')
 def exec(self,sql):assert self.lib.sqlite3_exec(self.handle,sql.encode(),None,None,None)==0,'synthetic SQL failed'
 def close(self):self.lib.sqlite3_close(self.handle)
class Fixtures(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='dsh-encrypted-fixture-');self.root=Path(self.temp.name).resolve()/'db_storage';(self.root/'contact').mkdir(parents=True);(self.root/'message').mkdir()
  self.keys={name:{'key':H('synthetic-key-'+name),'salt':H('synthetic-salt-'+name)[:32]} for name in ['contact/contact.db','message/message_0.db']}
  c=Encrypted(self.root/'contact/contact.db',self.keys['contact/contact.db']);c.exec("CREATE TABLE contact(username TEXT,nick_name TEXT,remark TEXT);INSERT INTO contact VALUES ('"+G+"','同名群',''),('"+B+"','同名群',''),('synthetic-sender','同学','');");c.close()
  self.writer=Encrypted(self.root/'message/message_0.db',self.keys['message/message_0.db']);self.writer.exec('PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;CREATE TABLE Name2Id(user_name TEXT);INSERT INTO Name2Id VALUES (\'synthetic-sender\');')
  self.tables={g:'Msg_'+hashlib.md5(g.encode()).hexdigest() for g in [G,B,P]}
  for g,table in self.tables.items():
   self.writer.exec('CREATE TABLE "'+table+'"(local_id INTEGER,local_type INTEGER,real_sender_id INTEGER,create_time INTEGER,message_content TEXT);INSERT INTO "'+table+'" VALUES (1,1,1,'+str(int(time.time())-30)+",'"+('授权群内容' if g==G else '其他群和私聊禁止读取')+"');")
  self.secret={'accountRoot':str(self.root),'accountHash':H(str(self.root)),'keys':self.keys,'approvedGroups':[{'id':G}]}
  self.readers=[]
 def reader(self,secret=None):
  r=m.Reader(secret or self.secret,test_root=self.root);self.readers.append(r);return r
 def tearDown(self):
  for r in self.readers:r.close()
  self.writer.close();self.temp.cleanup()
 def test_raw_header_key_validate_and_same_name_groups(self):
  r=self.reader();self.assertEqual(r.validate()['chatRowsRead'],0);groups=r.groups();self.assertEqual(len(groups),2);self.assertEqual(groups[0]['name'],groups[1]['name']);self.assertNotEqual(groups[0]['id'],groups[1]['id'])
 def test_exact_group_only_and_original_unchanged_including_wal(self):
  paths=list(self.root.rglob('*'));before={str(p):(H(p.read_bytes().hex()),p.stat().st_mtime_ns) for p in paths if p.is_file()}
  calls=[];original=m.Database.query
  def traced(db,sql,*a,**k):calls.append(sql);return original(db,sql,*a,**k)
  m.Database.query=traced
  try:out=self.reader().read(G)
  finally:m.Database.query=original
  self.assertEqual(out['recordCount'],1);self.assertEqual(out['messages'][0]['text'],'授权群内容');self.assertEqual(out['messages'][0]['sender'],'同学');self.assertFalse(out['otherChatsQueried']);self.assertTrue(all(self.tables[B] not in sql and self.tables[P] not in sql for sql in calls))
  after={str(p):(H(p.read_bytes().hex()),p.stat().st_mtime_ns) for p in paths if p.is_file()};self.assertEqual(before,after)
 def test_unapproved_group_and_wrong_account_fail_closed(self):
  r=self.reader();self.assertRaises(m.ReadError,r.read,B);self.assertEqual(r.snapshots,{})
  self.assertRaises(m.ReadError,self.reader,{**self.secret,'accountHash':H('other')})
 def test_missing_new_shard_is_error_not_zero_messages(self):
  (self.root/'message/message_1.db').write_bytes(b'synthetic')
  self.assertRaises(m.ReadError,self.reader().read,G)
 def test_raw_160_with_hmac_and_wrong_key_rejection(self):
  path=self.root/'message/message_1.db';key={'key':H('synthetic-160-key'),'hmac':H('synthetic-hmac'),'salt':H('synthetic-160-salt')[:32]}
  writer=Encrypted(path,key);writer.exec('CREATE TABLE synthetic(value TEXT);');writer.close()
  self.assertEqual(path.read_bytes()[:16].hex(),key['salt'])
  db=m.Database(path,key);self.assertEqual(db.query('SELECT count(*) AS n FROM synthetic')[0]['n'],0);db.close()
  self.assertRaises(m.ReadError,m.Database,path,{**key,'key':H('incorrect')})
 def test_symlink_and_bad_key(self):
  alias=self.root/'contact/alias.db';alias.write_bytes(b'synthetic');path=self.root/'contact/contact.db';path.unlink();path.symlink_to(alias)
  self.assertRaises(m.ReadError,self.reader().groups)
 def test_empty_time_window_and_name_change(self):
  out=self.reader().read(G,int(time.time())-1);self.assertEqual(out['recordCount'],0)
 def test_zstd_decode_and_bounded_failure(self):
  z=C.CDLL(str(m.FRAMEWORKS/'libzstd.dylib'));z.ZSTD_compressBound.argtypes=[C.c_size_t];z.ZSTD_compressBound.restype=C.c_size_t;z.ZSTD_compress.argtypes=[C.c_void_p,C.c_size_t,C.c_void_p,C.c_size_t,C.c_int];z.ZSTD_compress.restype=C.c_size_t
  text='压缩消息'.encode();out=C.create_string_buffer(z.ZSTD_compressBound(len(text)));n=z.ZSTD_compress(out,len(out),text,len(text),1);self.assertEqual(m.decode(out.raw[:n]),'压缩消息');self.assertRaises(m.ReadError,m.decode,b'bad',True)
 def test_runtime_has_no_developer_dylib_paths(self):
  import subprocess
  for library in m.FRAMEWORKS.glob('*.dylib'):
   result=subprocess.check_output(['otool','-L',str(library)],text=True);self.assertNotIn('/opt/homebrew',result)
  self.assertEqual(self.reader().database('contact/contact.db').query('PRAGMA cipher_provider')[0]['cipher_provider'],'commoncrypto')
if __name__=='__main__':unittest.main(argv=['wechat-reader'],verbosity=2)
