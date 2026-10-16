# 任务栏工作台 1.7.1

源码位于 [workbenches/task-board](../workbenches/task-board)，使用和能力见其 [README](../workbenches/task-board/README.md)，验证范围见 [当前版本摘要](../workbenches/task-board/docs/CURRENT-VERSION.md)。

本工作台作为可选源码同步；默认教学安装器仍安装 `classroom.json.plugins` 中的九个插件，不自动启用 `workbenches`。本次 GitHub 同步没有修改维护者运行中的 DSH、任务、模型或账号。

## 单独构建与安装

使用 Node.js 22+ 与 pnpm 10.34.5，在工作台目录执行：

```bash
cd workbenches/task-board
pnpm install --frozen-lockfile
pnpm build
pnpm check:package
pnpm pack
```

将生成的 `dsh-task-board-1.7.1.tgz` 通过学员本机 Desktop 原生插件安装入口或原生 CLI 加到本人确认的 web profile。不要复制维护者 DSH home、profile、任务文件或任何凭据，不使用旧 Personal Workbench 的安装方式。安装工作台与安装/更新默认九插件是独立动作。

工作台身份继续保留为 `xudingsheng/dsh-task-board`，以保持既有宿主身份和状态兼容；此字符串不是当前源码托管地址。不要只为调整 GitHub 路径而改变这个标识。

安装不等于界面及模型验收；若宿主要求重载，等待本人确认的空闲窗口，不中断正在运行的任务。采用合成任务与合成工作域验收，不申请系统日历权限或读取真实日程。

## 1.7.1 能力边界

- 甘特图可拖动整段或端点，任务详情计划同步；父分支平移带动全部下级，调整边界会校验冲突。
- 完成项目及其下级默认隐藏，可主动显示；编号、树形和连线表达父子层级。
- AI 可主动扫描所选工作域；本地预览后放入空白原生草稿，不覆盖已有文字或自动发送。
- 原生回复一键导入后，先预览新增任务、子任务与已有叶任务日期差异，再一次确认应用。父级显示根据完整候选树汇总，已有父记录不写回日期。
- 图上 AI 差异叠加、逐项接受及撤销属于下一版产品设计，本仓库没有把它们标为 1.7.1 已实现。

## 开发检查

在仓库根安装资料库固定依赖及工作台锁定依赖后运行 `npm test`。工作台部分包括 139 项定向检查及包自检；浏览器 E2E 需要另行创建隔离宿主、显式端口和合成数据，不能指向正式 Desktop。
