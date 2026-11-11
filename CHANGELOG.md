# 0.1.0-alpha

首个公开 alpha。接口与行为仍可能变化（`v1.0.0` 之前为 pre-release）。

## 功能

- `/council` 命令 + 斜杠菜单条目（带图标）：打开右侧栏「理事会」tab，不自动开始。
- 输入框选中文字的浮动条（依赖本地 `@local/quick-quote`）：`引用文本 | 问 | 执行 | 理事会`。
- 未装 quick-quote 时的右键菜单兜底：「⚖ 交给理事会评审」。
- 三阶段：独立作答 → 匿名互评 → 主席汇总（可关，即「无主」）。
- 三个选项：接当前对话上下文、自动附带问题里的本地路径、结果回投（不做 / 静默注入 / 直接唤醒 三元）、主席汇总。
- 路径附件：问题中出现的本地绝对路径（兼容 `D/dev/...` 写法）会读取目录树 + 关键文件（README/SKILL/pyproject/ARCHITECTURE 等，最多 6 个、单文件 8k 字、总 20k 字，可配置 `filesMaxChars`），跳过 `.git`/`node_modules`/`runs`/密钥文件，让模型可以评审真实代码与文档。
- 工作区识别与结构化：按 Harness 结构解析会话工作区（`SessionHeader.cwd` → `workspaceRegistry` → Host cwd），`GET /council/workspace` 暴露给 UI；未写路径但提到工作区/项目时自动附带当前工作区；支持 `@相对路径`；快照新增 `workspace` 与 `structure`（`roles: answerers/reviewers/arbiter`，`stages: answers/reviews/synthesize`），与 subagent 的 `agentOptions`/投递语义、group 的角色组、workflow 的阶段图对齐。
- 只读 subagent 席位（默认开）：注册 `council-readonly` Agent Preset（persona + 只读 fs + fs-search + skill + time-context），每个席位从 spawn 后端起一个真正的子代理并继承会话 cwd，可自行读文件/搜索/加载 skill；无写、编辑、执行工具。快照新增 `seatMode`，preset 注册失败时自动退回纯模型模式并在 UI 提示。
- 修复推理模型「断线」：作答 16384 tokens、单次调用超时 300s；流以 max-tokens 收尾且无正文时自动翻倍到 32768 重试一次。
- 三元回投对齐 subagent 的 turn 边界：`silent` 走 `agent.send(msg, 'next-turn', false)`（不唤醒，下一轮用户消息的 turn 才进入上下文），`wake` 走 `agent.followup()`（立即触发主 Agent 回复）；每个结果只回投一次，重复回投返回 409。
- 主席模型可选；参与模型 2–6 个；选择与选项持久化在浏览器 localStorage。
- 隐私/费用提示：上下文约 6000 字发送至所选模型提供商；开始前显示预计调用数。
- 失败隔离：单模型失败标红并继续；全部失败显示错误态；上下文读取失败降级为只发问题。
- 防重入：运行中重复点击只会发起一轮。

## 已知限制

- 已验证 DSH `0.2.2-rc.1`；`ctx.agents.get(sessionId).session.snapshotEvents()` 为 DSH 内部接口，升级可能失效，已做降级（只发问题）与 UI 提示。
- 左键浮动条由内置 `quote` 交互独占；理事会条目依赖 quick-quote 替换渲染器。未装 quick-quote 时只有右键菜单。
- 关闭右侧栏 tab **不会**取消进行中的运行；需要显式点「取消」。运行记录在宿主内存中，30 分钟过期，DSH 重启丢失。
- 「结果回投主聊天」会提交一条用户消息并唤醒主 Agent（额外一次模型调用）；这是有意行为，定位为 feature。
- 上下文只取最近约 6000 字可见文本（`config.contextMaxChars` 可调，500–50000），不含工具调用与附件。
- 未做跨 profile、卸载依赖、旧 DSH 版本的真实多环境验证。

## 安装

```sh
npx --yes @deepseek-ai/dsh@latest plugin --profile <name> add <包目录或 tarball>
```

安装后刷新 DSH Web 页面。
