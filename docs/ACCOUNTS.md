# 学员自己的账号与模型

安装器不导入教师账号，也不复用执行安装的 AI 助手账号。DSH 的连接与每位学员的权限、套餐有关，需要本人完成。

## Ollama Cloud

在 DSH 的模型/服务设置创建自己的 Ollama Cloud 连接，登录或填写本人在 Ollama 获得的 API Key。参考 [Ollama 官方 Cloud 文档](https://docs.ollama.com/cloud)。如使用 OpenAI 兼容服务类型，服务地址为 `https://ollama.com/v1`，见 [官方兼容说明](https://docs.ollama.com/api/openai-compatibility)；不要误用本机 `localhost:11434` 作为云服务。

本教学包的辅助任务默认路由为 provider ID `ollama-cloud`、模型 `deepseek-v4.1-flash`。可选模型资料：[DeepSeek-V4.1-Flash](https://ollama.com/library/deepseek-v4.1-flash)、[GLM-5.3-Flash](https://ollama.com/library/glm-5.3-flash)。云 API 模型 ID 与本机 CLI 的 `:cloud` 标签可能不同，以服务实际返回为准。

如果 DSH 为新连接分配了其他 provider ID，进入预测、资料库、引用上下文、群聊简报的各自设置，选择本人刚创建的连接与模型。不要为了匹配默认字符串修改或删除其他服务。主会话模型另外选择，安装器不会替你选择。

连接后，由本人同意发一条合成问候来验收。账号里出现模型名、保存 API Key 或能打开官网，都不等于调用已通过。遇到模型不存在/套餐限制，应选择该账号实际可用的型号并记录。

## OpenAI 订阅

使用 DSH 自带的 OpenAI/Codex 订阅登录入口，按浏览器提示由本人完成登录和授权。没有对应入口时先检查是否安装了清单固定版本，不能从别的桌面助手复制 Token、Cookie 或本地授权文件。

可用模型以 DSH 在这个账号下实际列出的为准。教学包不承诺把其他产品的所有内部模型名称加入 DSH，也不把 OpenAI API Key 与订阅登录混为一项。若连接失败，保留错误摘要，在不泄露授权信息的前提下排查。

## 腾讯文档与 Tavily

腾讯文档在插件内发起登录，确认本人账号后授权；本地回调使用 `127.0.0.1:43189`。若端口被占用先定位自己的重复登录窗口，不结束其他应用。文档的可读/可写范围仍取决于本人权限与腾讯 API 能力。

Tavily 需要自己的 [Tavily API Key](https://app.tavily.com/)。通过 DSH 的凭据或插件设置保存 `TAVILY_API_KEY`，再将原生 web 搜索 provider 选择为 `tavily`。本仓库只带 provider 代码，不带任何已付费额度、Key 或强制搜索设置。

所有账号验收使用合成内容。不要把密钥、密码、验证码、完整错误配置、真实聊天或 OAuth 回调 URL 提交到 GitHub issue。

## 微信数据库（自选）

在群聊简报的连接设置打开本机连接器，使用本人的 macOS 系统授权；选账号、勾选群并明确开启。密钥仅存本机钥匙串，默认不接入任何群，不复制老师的账号或群配置。步骤和兼容边界见 [微信说明](WECHAT.md)。
