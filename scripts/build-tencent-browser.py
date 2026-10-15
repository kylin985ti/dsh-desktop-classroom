#!/usr/bin/env python3
"""Build the opt-in document browser. Does not open websites, read accounts or cookies."""
import argparse,hashlib,json,plistlib,shutil,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--work',type=Path,required=True);p.add_argument('--arch',choices=['arm64','x86_64'],required=True);p.add_argument('--preview-home',type=Path);args=p.parse_args()
work=args.work.resolve();work.mkdir(parents=True,exist_ok=True)
name='DSH 腾讯文档浏览器 0.1.1' if not args.preview_home else 'DSH 腾讯文档浏览器验收'
app=work/args.arch/(name+'.app')
if app.exists():shutil.rmtree(app)
mac=app/'Contents/MacOS';mac.mkdir(parents=True);resources=app/'Contents/Resources';resources.mkdir()
sdk=subprocess.check_output(['xcrun','--sdk','macosx','--show-sdk-path'],text=True).strip()
command=['swiftc','-O','-parse-as-library','-sdk',sdk,'-target',args.arch+'-apple-macosx13.0','-file-prefix-map',str(ROOT)+'=/src/dsh-desktop-classroom','-debug-prefix-map',str(ROOT)+'=/src/dsh-desktop-classroom']
if args.preview_home:command+=['-D','DEBUG_PREVIEW']
subprocess.run([*command,str(ROOT/'plugins/dsh-tencent-docs/native/Browser.swift'),'-o',str(mac/'Browser')],check=True)
info={'CFBundleExecutable':'Browser','CFBundleIdentifier':'io.github.kylin985ti.dsh-classroom.tencent-browser'+('.preview' if args.preview_home else ''),'CFBundleName':name,'CFBundleShortVersionString':'0.1.1','CFBundleVersion':'0.1.1','CFBundlePackageType':'APPL','LSMinimumSystemVersion':'13.0','NSHighResolutionCapable':True,'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':False}}
if args.preview_home:info['DSHVerificationHome']=str(args.preview_home.resolve())
(app/'Contents/Info.plist').write_bytes(plistlib.dumps(info));shutil.copyfile(ROOT/'LICENSE',resources/'LICENSE-Classroom')
subprocess.run(['codesign','--force','--sign','-',str(app)],check=True);subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True)
if args.preview_home:print(json.dumps({'previewApp':str(app)}));raise SystemExit(0)
archive=work/('dsh-tencent-browser-0.1.1-'+('x64' if args.arch=='x86_64' else args.arch)+'.zip')
if archive.exists():archive.unlink()
subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(app),str(archive)],check=True)
print(json.dumps({'app':str(app),'filename':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}))
