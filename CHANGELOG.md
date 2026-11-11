# 0.2.3

理事会验收（self-loop 第 2 圈）整改——本轮「不通过」判定点出的真实盲点全部修复：

- **席位预算纳入整轮 deadline**：`callSeatSubagent` 的启动/执行/组合超时全部 `Math.min(自身预算, remaining)`，到期即拒启（此前席位可越过整轮 deadline）。
- **工具超时加缓冲**：`council_review` 的 `timeoutMs` = run deadline + 30s——run 自己的 watchdog 先结算并给出精确 `stopReason`，工具超时只作兜底，消除归因竞态。
- **deadline 可审计**：快照新增 `deadlineAt` / `remainingMs`。
- **回归补齐**：`clampAttempt`/`clampSeat` 边界断言（过期=0 不为负、席位窗口随剩余预算裁剪、无 deadline 保持全量）。

# 0.2.2

理事会自评审（self-loop）整改——本轮缺陷全部由「cwd 在插件目录的 subagent 调 `council_review`」的评审发现：

- **附件锚定修复（P0 级）**：工具的 `attachFiles` 此前以会话工作区根为基准——subagent 在 `dsh-council/` 里评审自己时，附件却是工作区杂项（24 个文件无一来自插件，目录树还在 120 项处截断把插件目录挤掉）。现在附件锚定**调用方的实际工作目录**（`workingDirectory` 投影 → session header → registry 兜底），复测：`paths=dsh-council`、`codeFiles=4/4`、主席结论全部引用真实常量与文件路径。
- **`TRANSIENT_FAILURE` 收紧**：原正则的裸 `\b5\d\d\b` 与无边界 `timeout` 会把「500 字」「timeoutMs」误判为瞬态失败（理事会指出的真缺陷）；改为锚定 HTTP/status 上下文 + 显式 errno/网络词，回归断言补 6 个负例（`500 字`/`5000 tokens`/`timeoutMs`/`500 毫秒`/`2500 chars` 等）。
- **降级配额改为熔断语义**：`MAX_FALLBACKS_PER_RUN` 6 → 3，刻意低于 `MAX_MODELS = 6`（原值=席位数使保护分支在满员时永不触发）；触发时报错注明「疑似 provider 故障」。
- **终止原因可观测**：快照新增 `stopReason`（completed/watchdog/cancelled/stage-error），工具结论文本带「（原因：…）」，不再让「已取消」吞掉超时/手动/阶段失败的区分。

# 0.2.1

外部审查报告（2026-11-11）整改：

- **P0 补验收**：报告指出「最后一次修改没有完成验收」（seq 5206 中断）。本版完成全量验收：`npm run syntax` / `dev/verify-host.mjs` / `dev/verify-client.mjs` 三条 exit code 0。
- **P1 文档漂移修复**：README 三处——静默回投改为描述 `agent.inject()`（删掉 `send(next-turn)` 旧语义）；npm 段明确「已发布 0.1.0 / 本仓库 0.2.x 未发布」（不再混称）；subagent 席位默认关与代码一致。
- **P1 文档测试升级为行为契约断言**：verify-host 现在断言 README 必须含 `agent.inject()`、禁止出现 `send(msg,'next-turn',false)`、反馈默认=不做、席位默认=关、npm 版本二分表述——不再只查数字。
- **P2 附件覆盖率报告**：源码包头部自带「发现 N / 选取 M / 未附约 K / 抽样初审非全项目审查」声明；快照新增 `codeDiscovered/codeTruncated`。
- **P2 安全边界文档化**：`attachRoots` 为空时的本机行为（显式路径可读）在 README 中明示；部署到共享环境时应配置白名单。

# 0.2.0

可靠性、安全与「真读工作区」硬化。接口仍可能变化（`v1.0.0` 之前为 pre-release）。

## 修复（v0.1.0 之后的审查结论）

- **静默回投改成 `agent.inject()`**：结论作为上下文在下一次请求前注入，不再占用 inbox 队列、不唤醒主 Agent；「唤醒」仍是 `agent.followup()`。
- **席位超时对齐**：`SEAT_RESULT_TIMEOUT_MS` 120s → **240s**（此前比纯模型通道 300s 还短，慢通道反被更少预算）；降级配额 3 → 6（每席位最多一次）。
- **重试分类加词边界**：`TRANSIENT_FAILURE` 原 `5\d\d` 会把「5000 tokens」误判为 5xx 重试，改为 `\b5\d\d\b`。
- **路径附件允许清单**：新增 `config.attachRoots`；非空时附件只能落在工作区或这些根目录内（默认空 = 保持本机单用户行为，问题里显式写出的路径可读）。
- **文本文件覆盖面**：补 `.rb/.php/.cs/.kt/.kts/.swift/.scala/.lua/.sql/.vue/.svelte/.proto/.gradle`，以及无扩展名的 `Makefile/Dockerfile/LICENSE` 等。
- **文档纠错**：删除 README 中自相矛盾的「运行记录只在内存、重启即丢」；隐私提示写明**文件内容同样会发送给所选模型提供商**；`index.js` 头部 route 注释补齐。

## P1/P2（本轮新增）

- **`council_review` 全局工具**：任何 agent（含 subagent/workflow）可编程调用理事会，拿回 `{conclusion, runId, models}`（三个字段全部 required，结论末尾带参与模型与 runId 括注行）；工作区按调用方会话解析、`exec.signal` 联动取消；自动挑模型保证异构（每 provider 一个、模型名不重复）。实测三轮：subagent 调用 → 3 模型作答/互评/主席汇总返回；元数据缺失缺陷由测试 subagent 报告并修复；同名重复缺陷（DeepSeek-V4.1-Flash ×2）同样由测试 subagent 抓出并修复，复测 3 个不同模型零重复。
- **SSE 事件流**：`GET /council/run/<id>/stream`，快照带递增 `seq`、终态 `event: end`；client 优先用 EventSource，断流自动回退 320ms 轮询。实测 16 事件、`seq=13` 结束。
- **多标签选主**：`BroadcastChannel` 每会话一个 leader，只有 leader 轮询/回投/关页取消；失联 2.5s 接管。
- **混合席位**：`subagentSeats`（1–5，默认 2）个只读 subagent + 其余快速流式；快照 `subagentSeats` 与 UI 滑杆；有快速席位时源码包照常附带。
- **每席指标**：`seat.ttftMs/elapsedMs` + 卡片「首字 Xs · 总 Ys」。
- **文档/常量一致性门禁**：`verify-host` 断言 README 引用的超时/并发/降级配额数字与代码常量相等（首跑即抓到 README 写 3、常量是 6 的漂移）。

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
