# 0.2.0

可靠性、安全与「真读工作区」硬化。接口仍可能变化（`v1.0.0` 之前为 pre-release）。

## 修复（v0.1.0 之后的审查结论）

- **静默回投改成 `agent.inject()`**：结论作为上下文在下一次请求前注入，不再占用 inbox 队列、不唤醒主 Agent；「唤醒」仍是 `agent.followup()`。
- **席位超时对齐**：`SEAT_RESULT_TIMEOUT_MS` 120s → **240s**（此前比纯模型通道 300s 还短，慢通道反被更少预算）；降级配额 3 → 6（每席位最多一次）。
- **重试分类加词边界**：`TRANSIENT_FAILURE` 原 `5\d\d` 会把「5000 tokens」误判为 5xx 重试，改为 `\b5\d\d\b`。
- **路径附件允许清单**：新增 `config.attachRoots`；非空时附件只能落在工作区或这些根目录内（默认空 = 保持本机单用户行为，问题里显式写出的路径可读）。
- **文本文件覆盖面**：补 `.rb/.php/.cs/.kt/.kts/.swift/.scala/.lua/.sql/.vue/.svelte/.proto/.gradle`，以及无扩展名的 `Makefile/Dockerfile/LICENSE` 等。
- **文档纠错**：删除 README 中自相矛盾的「运行记录只在内存、重启即丢」；隐私提示写明**文件内容同样会发送给所选模型提供商**；`index.js` 头部 route 注释补齐。

## 稳定性

- 终态写一次（`finishRun()`）：取消/超时/完成竞态下，迟到结果不覆盖终态；watchdog 与 cancel 都会 dispose 活跃席位。
- 每 provider 全局 4 并发（多聊天/多标签页不放大）；瞬态失败退避重试最多 3 次；`max-tokens` 无正文自动翻倍重试。
- 同 `sessionId` 已有运行中评审时返回 409 + 现有 runId，前端自动接回。
- 运行注册表落盘 `${DSH_HOME:-~/.dsh}/council-runs.json`（20 条、500ms 防抖）：Host 重启后可查历史，中断的运行标注「Host 重启，运行中断」。
- 按会话隔离前端状态：不同聊天各开各的 run，切回来自动接回。

## 评审源码包

- 评审类问题自动附加真实源码（≤24 文件、单文件 4k、总预算 `codeMaxChars` 默认 40k，路径标注），提示词强制引用文件路径、未覆盖处标【推断】；快照 `codeState/codeFiles/codeChars`。
- **有工具的席位不塞源码**：`seatMode='subagent'` 时只给目录树 + 工作区根目录，要求席位自己 `read/grep/glob` 核验。

## 测试

- `npm run verify` = `dev/verify-client.mjs`（入口/开关/回投三元/部分失败/全失败/防重入/桥接/工作区提示）+ `dev/verify-host.mjs`（路径 typo 修复/`@mention` 穿越拒绝/密钥跳过/超时语义/并发窗口/重试词边界/允许清单/源码包与席位豁免）。

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
- 席位调度：subagent 只用于作答阶段，互评/主席走快速纯模型；席位启动 60s / 执行 240s 超时、失败自动降级纯模型；卡片显示「启动中/运行中 Ns」「完成（降级）」；整轮 30 分钟 watchdog；`GET /council/diag` 暴露运行与子代理诊断。
- 停止与接回：运行中显示「停止」；`GET /council/runs?sessionId=` 让页面刷新/重开后自动接回在跑的 run；`pagehide` 时用 `sendBeacon` 取消当前 run（关闭窗口不再留下失控后台运行）。
- 评审源码包：评审类问题自动附加真实源码（≤24 文件、单文件 4k、总预算 `codeMaxChars` 默认 40k，路径标注），提示词强制引用文件路径与【推断】标注；快照 `codeState/codeFiles/codeChars`，UI 显示「已附带源码 N 个文件」。
- 稳定性硬化：终态写一次（`finishRun`）；watchdog/cancel 统一 dispose 席位；每 provider 全局 4 并发 + 瞬态失败退避重试；每 run 降级配额 3；同会话单 run（409）+ 前端自动接回；运行注册表持久化到 `~/.dsh/council-runs.json`（Host 重启显示「运行中断」）。
- 安全硬化：`@mention` 拒绝工作区穿越；路径附件拒绝符号链接与密钥类文件（`.env`/`.pem`/`.key`/`.ssh`/`.aws`/`.kube` 等）；`npm run verify` 增加 host harness（路径/穿越/密钥/超时/并发窗口）。
- Skill 接入：只读席位可加载 skill（`skill-filesystem` + `tool-skill`）；`skillDirs` 配置/自动探测 `D:\agent-library\catalog`，实测席位成功加载 `office-xlsx` 并复述 `# Excel workbooks`；席位只读，不执行 skill 脚本。
- 体验：卡片显示席位当前动作（思考中/调用工具/工具返回/生成回复）与「等待响应」；互评/主席卡片按阶段出现；subagent 模式下正文占位说明「完成后出正文」；席位超时 120s、并发 3、失败自动降级纯模型。
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
