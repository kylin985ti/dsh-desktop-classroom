# 维护与课堂更新

仓库是独立的公开分发源；不连接教师运行中的 DSH，不操作旧 Personal Workbench，也不轮询任务状态。

## 常规更新

1. 在插件源码做改动并更新该插件 `package.json` 版本；同步 `classroom.json` 的版本、功能边界、日期和教学包版本。改变安装协议也应更新 `INSTALL.md`。
2. 更新 `CHANGELOG.md`。维护相关许可和 `THIRD_PARTY_NOTICES.md`。
3. 执行 `npm run refresh && npm test`。README、下载 pin 和逐文件校验清单会一起刷新；CI 拦截不同步提交。
4. 对影响安装或宿主接口的变更，在全新临时 DSH home 用真实 Desktop 的 Node 测试一次安装和重复安装。不要把临时 home 用于启动教师的 Desktop 窗口。界面验收另按清单记录。
5. 提交并推送到 GitHub。发布后同一句安装提示词会取 main 最新提交；不需要更改给学员的提示词，也不需要后台轮询。

## 从维护者本机导出

```bash
python3 scripts/export-local.py --source "$HOME/Library/Application Support/dsh-desktop/harness/local-plugins"
npm run refresh
npm test
git diff --stat
```

导出器只有明确文件白名单，不导出 profiles、storages、sessions、credentials、`.env`、聊天、钥匙串或资料库内容。它将个人机器路径改为运行时路径，腾讯文档和微信公开适配源码由本仓库独立维护，这两项不从个人安装导出。运行前确认本机源码确实是准备分发的版本；运行后审查 diff，不直接提交整个 DSH home。已经删除的文件不会自动清理，应由维护者核对后在仓库内显式删除。

`pypdf` 是资料库随包携带的纯 Python 依赖。来源与 SHA256 在其 `lib/vendor/UPSTREAM.json`，保留 BSD 许可。重新导出不覆盖 vendor。上游更新须另行下载、验证 SHA256、审查版本并重跑 PDF 测试；不能写入 Desktop 应用资源。

## 兼容版本升级

从 `dataelement/dsh-desktop` 上游 Release 核对两个 macOS ZIP 的 SHA256，更新 `classroom.json`，运行 refresh。不要把 latest URL 作为固定 pin。分别验证原生 generation API、前端注入、Office Python 路径和实际启动；未测平台如实标注。

安装脚本不替换已有 App。需要升级的学员先完成当前任务，自行安装对应上游版本，再运行教学包。不要加入 `killall`、强制退出、关闭 Gatekeeper、复制授权或批量删除数据的“修复”命令。

## 故障与恢复

先看本机 `classroom/install-receipt.json`、原生插件管理日志和 doctor。只导出不含隐私的错误摘要用于 issue。不要上传完整 DSH home。失败的单个安装可原样重试；原生 generation 保留旧版本，使用 Desktop 的插件/恢复界面选择旧版。

改变某个现有插件的名字会被视为新增插件，须避免双份运行。引用、预测等插件的已保存用户状态不得随代码更新删除。

## 微信连接器 Release

学生机器不要求编译工具。维护者需 Python 3.12+ 与 macOS Command Line Tools，按固定源码 SHA256 编译两个架构：

```bash
python3 -B scripts/build-wechat-helper.py --work /private/tmp/dsh-wechat-build --arch arm64
python3 -B scripts/build-wechat-helper.py --work /private/tmp/dsh-wechat-build --arch x86_64
python3 -B tests/wechat-reader.py --app '/private/tmp/dsh-wechat-build/arm64/DSH 微信群连接 0.2.0.app'
```

构建脚本只编译，不启动连接器、不读取微信或钥匙串。发布对应 Release ZIP，核对下载后的 SHA256 并同步 `classroom.json.wechatBridge`，再 refresh/test；不要替换已发布版本的资产，代码变化须升版本和 pin。保留 helper Resources 内的许可证。用新临时 home 和合成数据库验收，不复用维护者账号或连接配置。连接器尚未公证，Intel 真机未验收，须保留公开说明。

## 腾讯文档 MCP 更新

0.5.0 起以腾讯文档连接器交付：保留包名、插件 ID、凭据 namespace、存储目录和官方工具名，侧边栏“连接器”管理账号，原生 `conversation.input.dock` 承载当前会话的状态和确认。导航使用 `layout.selectPanel(null)` / `uiWorkspace.startSession()`，不操作或自动发送草稿。提案的 SessionId 只读取 `execution.agent.session.id`，子会话不推断为父会话；历史无归属项留在管理页。事件端点仅推送失效版本号，不包含凭据、文档内容或会话 ID。

腾讯文档只维护 `plugins/dsh-tencent-docs` 的官方 MCP 适配、本人授权和修改确认；不发布独立浏览器资产，不复制腾讯或 WorkBuddy 的私有协议。OAuth 保留既有凭据 namespace；断开/换账号会关闭修改建议并使旧提案失效。新工具默认需确认，明确只读工具才直接调用，删除工具不注册。不要添加一个可绕过提案确认的通用写入 API。

修改后测试授权刷新、业务错误、并发确认/拒绝/断开、文档冲突和结果不明不重试。使用临时 home 检查原生 generation 安装和重复安装。维护者本机只以 `--only @local/dsh-tencent-docs` 安装，核对其他 generation 和配置哈希不变；资料库等独立开发中的插件不从本仓库覆盖或降级。

真实 UI 需本人给出空闲窗口，不能轮询任务或强制重启。测试真实文档默认只读，不自动调用模型；实际写入仍需对具体参数取得本人确认。旧浏览器和 web-inbox 的本机数据保留，不混入公开包。历史构建源码可在 Git 历史查看。
