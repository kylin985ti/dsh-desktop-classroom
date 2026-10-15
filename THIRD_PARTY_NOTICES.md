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
| WeChat merged-forward text format reference | https://github.com/freestylefly/WeChatBridge/tree/0b00e3f89ace0e8f5d9c17478b2c966d0e2b890e | MIT, Copyright 2026 qzz0518; format reference in Python parser, full text in digest/native/LICENSE-WeChatBridge; no native bridge or scanner binaries shipped |

Other npm dependencies declared by upstream plugins are resolved by Desktop's pnpm installer, with their original license metadata in the installed package tree. Prebuilt upstream bundles retain their original embedded notices. Do not strip these files when creating a reduced distribution.

The library, quote context, Tencent Docs, digest classroom wrappers and installer are MIT (Copyright 2026 kylin985ti), with the third-party terms above applying to included components. No WeChat database scanner or native bridge code is included in this default pack.
