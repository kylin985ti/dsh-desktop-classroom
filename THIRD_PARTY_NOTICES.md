# Third-party notices

This is an independent classroom distribution, not an official DeepSeek, DataElement, Tencent or Ollama product. It downloads unmodified upstream Desktop releases. Names identify interoperability and provenance.

| Component | Source / reference | License and local changes |
| --- | --- | --- |
| DSH Desktop 0.11.1 | https://github.com/dataelement/dsh-desktop/tree/v0.11.1 | MIT, Copyright 2026 DataElement; original release downloaded, no application code redistributed here |
| dsh-better-sidebar 0.26.0 | https://github.com/omdsh-dev/DSH-better-sidebar/tree/v0.26.0 (9323f48d0946432ffd94655df1c115a1cd89f34c) | MIT, Copyright 2026 dsh-external; unmodified prebuilt package source subset, LICENSE in plugin |
| dsh-suggest-prompt | https://github.com/studyzy/dsh-suggest-prompt (b766d30b55ced7194fdf4d1e9eb4eb398bba90ac, upstream 1.2.2) | MIT, Copyright 2026 studyzy; local Desktop 1.2.2-desktop.2 adaptation, provenance in UPSTREAM.json, LICENSE in plugin |
| MCP / Skills managers | https://github.com/Yinxe/deepseek-harness-plugins | MIT, Copyright 2026 Yinxe; Desktop wrapper around upstream host/client, LICENSE in each plugin. Exact historical adaptation base was not recorded; do not infer it from current upstream HEAD |
| Tavily provider | https://github.com/deepseek-ai/deepseek-harness | MIT, Copyright 2026 DeepSeek; provider adapted to Tavily and Desktop, official MIT text retained in LICENSE-DeepSeek |
| Milkdown / Crepe | https://github.com/Milkdown/milkdown | MIT; included in library browser bundle, full text in lib/licenses/Milkdown-Crepe.txt |
| PapaParse | https://github.com/mholt/PapaParse | MIT; included in library browser bundle, full text in lib/licenses/PapaParse.txt |
| jsdiff | https://github.com/kpdecker/jsdiff | BSD-3-Clause; included in library browser bundle, full text in lib/licenses/jsdiff.txt |
| pypdf 6.20.1 | https://pypi.org/project/pypdf/6.20.1/ | BSD-3-Clause; pure Python vendored in library/lib/vendor, full LICENSE-pypdf and wheel SHA256 in UPSTREAM.json |
| WeChat merged-forward text format reference | https://github.com/freestylefly/WeChatBridge/tree/0b00e3f89ace0e8f5d9c17478b2c966d0e2b890e | MIT, Copyright 2026 qzz0518; format reference in Python parser, full text in digest/native/LICENSE-WeChatBridge; system share bridge not shipped |

| WCDB Config.Cipher layout | https://github.com/sunfeihu007/wechat-cli/tree/8ba897b0cf80dd8bd3545f3c5b32547cbbba55c2 and https://github.com/beijinguang/wechat-cli/tree/44c7e9591aded0c44ce0ac4517b8297939bdea16 | Apache-2.0; LICENSE-WeChatConfigCipher and NOTICE-WeChatConfigCipher; generic per-user scope, FIFO transfer, signature checks, bounded read-only scanning; no re-signing |
| Raw key/salt matcher | https://github.com/raclen/wechat-suite/tree/68235fb4308d71b1462e78e533850162849562a1 | MIT; LICENSE-WeChatDBScanner; 96/160 hex matching and exact salt scope |
| SQLCipher 4.19.0 | https://github.com/sqlcipher/sqlcipher/tree/c4b275a47932888216bade83aff2bbc73df0ff85 | BSD-3-Clause plus SQLite public-domain notices; CommonCrypto build in helper; full upstream LICENSE.md copied as LICENSE-SQLCipher in helper Resources |
| zstd 1.5.7 | https://github.com/facebook/zstd/tree/v1.5.7 | BSD license option; full LICENSE copied as LICENSE-zstd in helper Resources |

Other npm dependencies declared by upstream plugins are resolved by Desktop's pnpm installer, with their original license metadata in the installed package tree. Prebuilt upstream bundles retain their original embedded notices. Do not strip these files when creating a reduced distribution.

The library, quote context, Tencent Docs, digest classroom wrappers and installer are MIT (Copyright 2026 kylin985ti), with the third-party terms above applying to included components. The opt-in database helper is source-built and distributed as separate pinned Release assets; it never includes account state. The system-share extension is not included.

The optional task-board workbench 1.7.1 is MIT, attributed to xudingsheng as declared in its package metadata; its LICENSE is retained in workbenches/task-board. React and ReactDOM are host-provided externals, not bundled copies. Esbuild and Playwright are development-only dependencies. The existing workbench identity is preserved solely for host compatibility.
