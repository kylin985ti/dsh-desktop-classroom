# 给本机 AI 助手的安装说明

目标：为当前学员安装或更新这套 macOS 教学环境。此文件是公开安装规范，不包含个人账号配置。执行前先读本文件、README 和脚本；下载一个固定提交的完整快照后再执行，避免更新中混用文件。

## 1. 获取同一个提交的完整快照

需要可执行本机终端的助手。用 macOS 自带工具即可，不需要先安装 Git、Node.js 或 Python：

```bash
TASK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-classroom-download.XXXXXX")"
curl --fail --location --retry 3 --proto '=https' \
  'https://api.github.com/repos/kylin985ti/dsh-desktop-classroom/commits/main' \
  -o "$TASK_DIR/commit.json"
REVISION="$(plutil -extract sha raw -o - "$TASK_DIR/commit.json")"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || exit 1
curl --fail --location --retry 3 --proto '=https' \
  "https://codeload.github.com/kylin985ti/dsh-desktop-classroom/tar.gz/$REVISION" \
  -o "$TASK_DIR/pack.tar.gz"
tar -xzf "$TASK_DIR/pack.tar.gz" -C "$TASK_DIR"
PACK_DIR="$TASK_DIR/dsh-desktop-classroom-$REVISION"
```

读取这个快照的 `README.md`、`classroom.json`、`scripts/bootstrap.sh` 和 `scripts/install-pack.mjs`，再执行：

```bash
/bin/bash "$PACK_DIR/scripts/bootstrap.sh"
```

命令需在同一个终端会话运行，或保留输出的临时路径。网络失败应报告具体下载阶段，不改用不明镜像、不跳过 SHA256、不关闭 Gatekeeper。GitHub API 限流可稍后重试，或用学员已有的 GitHub 登录工具读取同一提交。

## 2. 安装行为与边界

- macOS 12+；自动识别 arm64 或 x64。Apple Silicon 是主要验证平台；Intel 尚未真机验收。
- 优先复用 `/Applications/DSH Desktop.app`，其次 `~/Applications/DSH Desktop.app`。新安装放 `~/Applications`，不需要管理员权限。
- 新下载使用清单固定的上游 ZIP 和 SHA256，验证 bundle ID、版本和代码签名，不修改 App 包。
- 原始 ZIP 缓存在本机 `~/Library/Caches/dsh-desktop-classroom`；每次使用均重算 SHA256。缓存校验失败时只处理对应下载文件，不关闭校验，也不删除应用数据。
- 已有不同版本 Desktop 会停止，不自动覆盖、降级、退出或重启。若用户正在运行任务，插件安装后保留“待空闲重启”状态即可。
- 使用安装包内的 Node 和 Desktop 原生 generation API。不会安装全局运行时，不复制教师 profile，不覆盖学生默认模型、凭据或资料。
- 本地回执记录教学包版本和各插件 generation。失败时说明已完成与未完成的项；保留已安装插件，供重试，不删除 DSH home。
- macOS 13+ 同时安装固定 SHA256 的微信数据库连接器（自带 SQLCipher/zstd），默认不开启、不启动、不申请授权、不扫描。macOS 12 只保留手动导入。微信系统分享扩展仍不分发。
- 腾讯文档仅安装官方 MCP 适配插件，不再下载独立文档浏览器。旧版浏览器、网页登录数据和本机网页接收箱保留，不自动迁移、删除或加入会话。
- 如 DSH 使用非默认 home 或非标准 App 路径，先从本人设置确认再传 `--dsh-home` / `--app`；不要猜测并读其他用户的目录。

## 3. 首次启动与本人授权

安装器只安装，不自动启动或重启。如果是首次安装，引导学员在访达打开 DSH Desktop；若已运行，等待全部任务结束后由本人从 Harness 菜单重启。使用可用的原生 UI 工具协助时也不得强制退出。

按需引导用户在 DSH 中连接个人模型账号：Ollama Cloud、OpenAI 订阅或其他 provider。登录、验证码、Apple/Google 登录和系统权限由本人完成；不要让用户把密码、Token 或 Cookie 粘贴进聊天。不要复制执行助手自身的订阅凭据到 DSH。

辅助模型默认 `ollama-cloud/deepseek-v4.1-flash`。若账号没有这个型号，在插件设置选择本人可用的模型并报告；不要宣称连接已通过。主会话模型由学员选择，安装器不设置它。

腾讯文档：打开插件，点击“登录并授权”，再点击“在浏览器确认授权”，在腾讯官方页面完成本人授权；回 DSH 刷新并检查连接。将文档链接贴到会话，要求 AI 使用腾讯官方 MCP 读取。需要改动时先开启“允许 AI 提出修改建议”，让 AI 生成具体提案，再在插件中核对目标和完整参数，确认该项后才写入。原版式、PPT 与图片在官网查看；不承诺官方未返回的内容可被模型读取。详见 [腾讯文档说明](docs/TENCENT_DOCS.md)。未经本人同意，不创建验收文档、不改真实表格。

Tavily：通过 DSH 凭据/设置界面配置自己的 `TAVILY_API_KEY`，将原生 web 搜索 provider 设为 `tavily`。插件只注册 provider，不暗中改现有搜索选择，不自动产生付费调用。

资料库：选择本人用于学习的目录，Markdown 打开即可编辑。AI 选区默认“仅这段”，需要全文时主动选择“结合全文”；建议先审阅再接受。已知工具栏定位限制见 [资料库说明](docs/LIBRARY.md)。群聊简报默认关闭数据库接收；要使用自动读取，按 [微信说明](docs/WECHAT.md) 由本人完成系统授权、选账号、选群、明确开启。默认用合成记录测试；不要代替用户选择真实群或复用任何教师配置。实际内容只有在学员点击 AI 操作后才发给所选模型。

## 4. 验收和交付

```bash
/bin/bash "$PACK_DIR/scripts/bootstrap.sh" --doctor
```

这是只读安装检查，不能替代界面与账号调用验收。按 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) 检查，分别报告：已安装、待重启、本人授权、实际调用和未完成项。不可把一项成功推断为全套验收通过。

安装完成、回执核对后可删除本次 `$TASK_DIR`；插件已经复制到本机 DSH home 下稳定的 `classroom/packs/<hash>`，不会依赖临时目录。不要删除该 packs 目录或原生 generations。

## 更新

下次仍使用 README 中同一句提示词，重新获取 main 的提交快照，再运行安装脚本。插件清单和 README 随仓库提交同步。应用版本不匹配时先报告，等待教学包适配；不自行更改下载 pin。

只更新腾讯文档、保留其他插件版本：

```bash
/bin/bash "$PACK_DIR/scripts/bootstrap.sh" --only @local/dsh-tencent-docs
```

单插件回执的 `scope` 会记录包名，不代表其他插件同步到了清单版本；仍须空闲重启后验收。

只更新资料库、保留其他插件版本：

```bash
/bin/bash "$PACK_DIR/scripts/bootstrap.sh" --only @local/dsh-library
```

该命令按清单将原资料库升级为 0.4.3-classroom.1，保留已有文件索引、草稿和协作历史；不导入维护者资料。安装后保留正在运行的任务，空闲时由本人重启，再按资料库说明核对入口图标、直接编辑及 AI 范围。

## 可选：任务栏工作台源码

`classroom.json.workbenches` 另列任务栏工作台 1.8.1，源码与必要前端构建产物位于 `workbenches/task-board`；默认插件安装器不会安装或启用它。需要时按 [单独构建与安装](docs/TASK_BOARD.md) 操作，不改用户现有任务、profile 或运行中的 DSH。
