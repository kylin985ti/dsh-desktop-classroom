#!/usr/bin/env python3
"""Build source-pinned helper assets. Does not open WeChat, scan memory or use Keychain."""
import argparse, hashlib, json, os, plistlib, shutil, subprocess, tarfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / 'plugins/dsh-wechat-digest/native'
VERSION = '0.2.0'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--work', type=Path, required=True)
p.add_argument('--arch', choices=['arm64', 'x86_64'], required=True)
args = p.parse_args()
work = args.work.resolve(); work.mkdir(parents=True, exist_ok=True)
def run(command, cwd=None):
    subprocess.run([str(x) for x in command], cwd=cwd, check=True, stdout=subprocess.DEVNULL)
sources = {}
for name, info in json.loads((NATIVE/'dependencies.json').read_text()).items():
    archive = work / (name + '.tar.gz')
    if not archive.exists():
        with urllib.request.urlopen(info['url'], timeout=120) as stream, archive.open('wb') as dest: shutil.copyfileobj(stream, dest)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != info['sha256']: raise SystemExit('Source hash mismatch: ' + name)
    with tarfile.open(archive) as tar:
        top = tar.getnames()[0].split('/')[0]
        source = work / top
        if not source.exists(): tar.extractall(work, filter='data')
    sources[name] = source
sql = sources['sqlcipher']; zstd = sources['zstd']
if not (sql/'sqlite3.c').exists():
    run(['./configure', '--disable-tcl', '--with-tempstore=yes', '--enable-threadsafe'], cwd=sql)
    run(['make', 'sqlite3.c'], cwd=sql)
app = work / args.arch / ('DSH 微信群连接 ' + VERSION + '.app')
if app.exists(): shutil.rmtree(app)
contents = app/'Contents'; mac = contents/'MacOS'; resources = contents/'Resources'; frameworks = contents/'Frameworks'
for directory in [mac, resources, frameworks]: directory.mkdir(parents=True)
sdk = subprocess.check_output(['xcrun', '--sdk', 'macosx', '--show-sdk-path'], text=True).strip()
flags = ['-arch', args.arch, '-isysroot', sdk, '-mmacosx-version-min=13.0', '-O2', '-ffile-prefix-map='+str(ROOT)+'=/src/dsh-desktop-classroom', '-ffile-prefix-map='+str(work)+'=/build']
print('Building SQLCipher, zstd and helper for ' + args.arch, flush=True)
run(['clang', *flags, '-dynamiclib', '-DNDEBUG', '-DSQLITE_HAS_CODEC', '-DSQLCIPHER_CRYPTO_CC', '-DSQLITE_TEMP_STORE=2', '-DSQLITE_THREADSAFE=1', '-DSQLITE_OMIT_LOAD_EXTENSION', '-DSQLITE_EXTRA_INIT=sqlcipher_extra_init', '-DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown', '-install_name', '@rpath/libsqlcipher.dylib', sql/'sqlite3.c', '-framework', 'Security', '-framework', 'Foundation', '-o', frameworks/'libsqlcipher.dylib'])
zfiles = sorted([* (zstd/'lib/common').glob('*.c'), * (zstd/'lib/compress').glob('*.c'), * (zstd/'lib/decompress').glob('*.c')])
run(['clang', *flags, '-dynamiclib', '-DZSTD_DISABLE_ASM', '-install_name', '@rpath/libzstd.dylib', *zfiles, '-o', frameworks/'libzstd.dylib'])
run(['clang', *flags, '-Wall', '-Wextra', '-Werror', NATIVE/'config_scan.c', '-framework', 'Security', '-framework', 'CoreFoundation', '-o', resources/'wechat-config-scan'])
swift = ['swiftc', '-O', '-sdk', sdk, '-target', args.arch + '-apple-macosx13.0', '-file-prefix-map', str(ROOT)+'=/src/dsh-desktop-classroom', '-debug-prefix-map', str(ROOT)+'=/src/dsh-desktop-classroom', NATIVE/'BridgeCore.swift']
run([*swift, NATIVE/'Worker.swift', '-o', mac/'wechat-db-worker'])
run([*swift, NATIVE/'Connect.swift', '-o', mac/'Connect'])
shutil.copyfile(ROOT/'plugins/dsh-wechat-digest/lib/read_wechat_db.py', resources/'read_wechat_db.py')
for name, source in [('SQLCipher', sql/'LICENSE.md'), ('zstd', zstd/'LICENSE'), ('WeChatConfigCipher', NATIVE/'LICENSE-WeChatConfigCipher'), ('WeChatDBScanner', NATIVE/'LICENSE-WeChatDBScanner')]: shutil.copyfile(source, resources/('LICENSE-'+name))
shutil.copyfile(NATIVE/'NOTICE-WeChatConfigCipher', resources/'NOTICE-WeChatConfigCipher')
shutil.copyfile(ROOT/'LICENSE', resources/'LICENSE-Classroom')
info = {'CFBundleExecutable': 'Connect', 'CFBundleIdentifier': 'io.github.kylin985ti.dsh-classroom.wechat', 'CFBundleName': 'DSH 微信群连接', 'CFBundleShortVersionString': VERSION, 'CFBundleVersion': VERSION, 'CFBundlePackageType': 'APPL', 'LSMinimumSystemVersion': '13.0', 'NSHighResolutionCapable': True}
(contents/'Info.plist').write_bytes(plistlib.dumps(info))
for binary, suffix in [(frameworks/'libsqlcipher.dylib','sqlcipher'), (frameworks/'libzstd.dylib','zstd'), (resources/'wechat-config-scan','scanner'), (mac/'wechat-db-worker','worker')]:
    ident = 'io.github.kylin985ti.dsh-classroom.wechat.'+suffix
    run(['codesign', '--force', '--sign', '-', '--identifier', ident, '-r', '=designated => identifier "'+ident+'"', binary])
run(['codesign', '--force', '--sign', '-', app])
run(['codesign', '--verify', '--deep', '--strict', app])
filename = 'dsh-wechat-bridge-'+VERSION+'-'+('x64' if args.arch == 'x86_64' else 'arm64')+'.zip'
archive = work/filename
if archive.exists(): archive.unlink()
run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, archive])
print(json.dumps({'app': str(app), 'filename': filename, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}))
