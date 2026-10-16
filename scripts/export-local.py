#!/usr/bin/env python3
"""Explicit source allowlist. Public Tencent Docs and WeChat implementations is maintained in this repository and is never imported from a personal installation. Never export a DSH profile, storage or credentials."""
import argparse, json, shutil, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=Path.home() / 'Library/Application Support/dsh-desktop/harness/local-plugins')
parser.add_argument('--sidebar', type=Path)
parser.add_argument('--only', choices=['dsh-library'], help='Export only the library without replacing other public plugins')
args = parser.parse_args()
license_text = '''MIT License

Copyright (c) 2026 kylin985ti

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
'''
(ROOT / 'LICENSE').write_text(license_text)
allow = {
    'dsh-library': ['package.json', 'cordis.patch.yml', 'lib/*.mjs', 'lib/client.js', 'lib/reader.py', 'lib/licenses/*.txt', 'src/*.js', 'src/*.css', 'scripts/build-editor.mjs', 'scripts/*.test.mjs', 'README.md', 'package-lock.json'],
    'dsh-quote-context': ['package.json', 'cordis.patch.yml', 'lib/*.mjs', 'lib/client.js'],
    'dsh-mcp-manager': ['package.json', 'cordis.patch.yml', 'LICENSE', 'lib/*.js', 'lib/*.mjs'],
    'dsh-skill-manager': ['package.json', 'cordis.patch.yml', 'LICENSE', 'lib/*.js', 'lib/*.mjs'],
    'dsh-suggest-prompt': ['package.json', 'cordis.patch.yml', 'LICENSE', 'UPSTREAM.json', 'lib/**/*.js', 'lib/**/*.d.ts'],
}
own = {'dsh-library', 'dsh-quote-context', 'dsh-tencent-docs', 'dsh-wechat-digest'}
platform = '''// Resolve from the running Desktop, including user-owned ~/Applications installs.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export function officePython() {
  const anchor = fileURLToPath(import.meta.resolve('@deepseek-ai/schemastery'));
  const marker = anchor.indexOf('/app.asar/');
  const roots = [process.env.DSH_DESKTOP_RESOURCES, process.resourcesPath,
    marker >= 0 ? anchor.slice(0, marker) : null,
    join(dirname(process.execPath), '../Resources')].filter(Boolean);
  for (const root of roots) {
    const candidate = join(root, 'office-runtime/primary-runtime/dependencies/python/bin/python3');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('未找到 DSH Desktop 的 Office Python，请安装教学清单中的 Desktop 版本');
}
'''
for folder, patterns in allow.items():
    if args.only and folder != args.only:
        continue
    source, dest = args.source / folder, ROOT / 'plugins' / folder
    for pattern in patterns:
        matches = list(source.glob(pattern))
        if not matches:
            raise SystemExit('Missing required source pattern: ' + folder + '/' + pattern)
        for item in matches:
            if not item.is_file() or item.is_symlink():
                raise SystemExit('Source must be a regular file: ' + str(item))
            target = dest / item.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item, target)
    manifest = json.loads((dest / 'package.json').read_text())
    if folder in own:
        manifest['version'] = manifest['version'].split('-classroom.')[0] + '-classroom.1'
        manifest['license'] = 'MIT'
        manifest['files'] = ['lib', 'LICENSE', 'cordis.patch.yml']
        if folder == 'dsh-library':
            manifest['files'].append('README.md')
            manifest.setdefault('scripts', {})['test'] = 'node --test scripts/client-lifecycle.test.mjs scripts/library-model.test.mjs scripts/markdown-editor.test.mjs scripts/store.test.mjs scripts/ai-errors.test.mjs scripts/ai-context.test.mjs'
        if folder == 'dsh-wechat-digest':
            manifest['files'].append('native/LICENSE-WeChatBridge')
        (dest / 'LICENSE').write_text(license_text)
    (dest / 'package.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    if folder in {'dsh-library', 'dsh-wechat-digest'}:
        (dest / 'lib/platform.mjs').write_text(platform)
    if folder == 'dsh-library':
        lock_path = dest / 'package-lock.json'
        lock = json.loads(lock_path.read_text())
        lock['version'] = lock['packages']['']['version'] = manifest['version']
        lock['packages']['']['license'] = 'MIT'
        lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n')
        path = dest / 'lib/index.mjs'
        text = path.read_text().replace("const PYTHON = '/Applications/DSH Desktop.app/Contents/Resources/office-runtime/primary-runtime/dependencies/python/bin/python3';", "import { officePython } from './platform.mjs';")
        text = text.replace("const pdfReader = fileURLToPath(new URL('./pdf-text', import.meta.url));\n", '')
        text = text.replace('childJSON(PYTHON, [script, row.path])', "childJSON(officePython(), ['-I', '-B', script, row.path])")
        text = text.replace('childJSON(pdfReader, [row.path])', "childJSON(officePython(), ['-I', '-B', script, row.path])")
        path.write_text(text)
        path = dest / 'lib/reader.py'
        path.write_text(path.read_text().replace('LIMIT = 300000', "sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'vendor'))\nLIMIT = 300000"))

if args.only:
    print('Exported library source allowlist; other public plugins were preserved.')
    raise SystemExit(0)

# Exact prebuilt upstream sidebar snapshot, without local dependencies or build caches.
source = args.sidebar or args.source.parent / 'profiles/web/node_modules/dsh-better-sidebar'
dest = ROOT / 'plugins/dsh-better-sidebar'
for pattern in ['package.json', 'cordis.patch.yml', 'LICENSE', 'icon.svg', 'locale/*.json', 'lib/*.js', 'lib/**/*.d.ts']:
    for item in source.glob(pattern):
        if item.is_file() and not item.is_symlink():
            target = dest / item.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(item, target)

# A module source is allowed; its configuration/credential storage is never copied.
dest = ROOT / 'plugins/dsh-tavily'
(dest / 'lib').mkdir(parents=True, exist_ok=True)
shutil.copyfile(args.source.parent / 'profiles/web/plugins/tavily.mjs', dest / 'lib/index.mjs')
manifest = {'name': '@local/dsh-tavily', 'version': '0.1.0-classroom.1', 'type': 'module', 'license': 'MIT', 'main': 'lib/index.mjs', 'files': ['lib', 'LICENSE', 'LICENSE-DeepSeek', 'cordis.patch.yml'], 'dsh': {'bundle': {'patch': './cordis.patch.yml'}}, 'peerDependencies': {name: '*' for name in ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-credentials', '@deepseek-ai/dsh-launch-environment', '@deepseek-ai/dsh-web']}}
(dest / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
(dest / 'cordis.patch.yml').write_text("- insert:\n    - id: tavily\n      name: '@local/dsh-tavily'\n      config:\n        apiKeyEnv: TAVILY_API_KEY\n")
(dest / 'LICENSE').write_text(license_text)
print('Exported source allowlist. Run refresh and verify before publishing.')
