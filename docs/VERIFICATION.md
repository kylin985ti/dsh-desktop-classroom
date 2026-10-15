# 0.1.0 验证记录

日期：2026-10-15。环境：macOS Apple Silicon，Desktop 0.11.1。下面区分安装、自动化测试和实际使用；不把本机测试当作所有学员设备的验收。

| 检查 | 结果 | 范围 |
| --- | --- | --- |
| 全新临时 DSH home | 9 个插件通过原生 generation 安装与版本检查 | 不使用维护者运行中的 home |
| 原生配置组合 | 通过 | CLI dump 模式，包含 web 核心和 9 个插件，未挂载服务、未调用模型 |
| 同一套内容重复安装 | 9 个全部 unchanged，desired generation 指针保持一致 | 本地安装回执与 native registry 核对 |
| 用户状态保留 | 合成的账号配置、默认模型、草稿文件内容一致 | 不读取真实账号/聊天/草稿 |
| Node 测试 | 6 项通过 | 发布文件/许可/版本、JS 语法、校验和拒绝、凭据值检测、数据库默认关闭、资料库冲突/边界/持久化 |
| Python 解析 | 通过 | 合成 PDF、DOCX、XLSX、PPTX、2 条聊天记录；拒绝 XML 外部实体和 ZIP 越界路径 |
| 隐私扫描 | 通过 | 源文件白名单、个人路径/文档链接/群绑定排查；无 profile 或 storage 导出 |
| 新下载的原始 App 与首次安装 | 待最终下载验证 | Release ZIP SHA256、bundle ID、版本与代码签名检查 |
| Intel 真机 | 未验证 | 有固定 x64 下载包和纯 Python PDF 解析器 |
| 真实 Desktop 界面与个人账号 | 留给学员首次使用验收 | 看 docs/ACCEPTANCE.md；无需上传真实凭据或内容 |

每次提交的文档、校验和、版本和源文件检查见本仓库的 [GitHub Actions](https://github.com/kylin985ti/dsh-desktop-classroom/actions)。CI 不登录任何个人账号，也不读取微信数据库。
