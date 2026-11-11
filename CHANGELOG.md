# 0.2.16

验证者独立复核本轮又找出 3 个真实 P1（council 未覆盖），连同上一轮 P1 一并修复：

- **P1-B follower 320ms 空转**：`pollRun` 的 follower 分支先 watchRun，而 `watchRun` 在 `streamStalls>=2` 时又 schedulePoll → poll → follower → … 永远 fetch 0 次、状态永不更新，follower UI 永久卡「运行中」。现在 follower **不排任何 poll**；看门狗/onerror 也只在 leader 时才转轮询；接管时由 `claim()` 补挂。
- **P1-C 跨会话串 run**：`openCouncilTab` 直接 `store.publish({sessionId})` 绕过 `switchSession`，会话 A 的 run 会继续往会话 B 投结论。现在统一走 `switchSession`。
- **P1-D 放弃后接不回**：`pollFailures>=8` 后保留 runId/run，而 `adoptRunningRun` 用 `runId!=='' && run!==null` 早退，导致该 tab 永远无法重新接回。现在只在 `running===true` 时早退。
- **P2**：404 用 `error.status` 判定；恢复的轮询清除自己写入的错误；`adoptRunningRun`/`restoreSessionState` 也清零计数器。
- `dev/verify-client.mjs` 新增断言：follower 分支不得 schedulePoll、adopt 不得跳过非活跃 tab、openCouncilTab 必须走 switchSession。

# 0.2.15

终审 6/6 项成立但因一个**真实 P1** 判不通过，本轮修复：

- **回投记账时机**（P1，阻断项）：`resumeRun` 原先在 leader 门禁**之前**就写 `feedbackRunId`。follower 先记账、随后接管 leader 时会被自己的去重守卫短路，结论**无人投递**（且 UI 还显示「另一标签已投递」）。现在 token 只在 POST 成功或 host 明确返回 `already-resumed` 之后才记账；POST 期间用进程内 `resumeInFlight` 防重入。
- **计数器跨 run 继承**（P1）：`adoptRunningRun` / `restoreSessionState` 进入 `watchRun` 前也清零 `pollFailures`/`streamStalls`。
- `dev/verify-client.mjs` 新增源码顺序断言：token 写入必须晚于 leader 门禁，且必须存在 `already-resumed` 分支与 `resumeInFlight`。

# 0.2.14

**意图识别根治**：源码包不再依赖意图词表。

同一个缺陷此前发作三次——「验收」（v0.2.5）、「终审」（本圈）都不在 `REVIEW_INTENT` 里，
于是 `codeState=off`，评审收到零源码，只能判「附件未覆盖」。逐次补词是打地鼠。

- 新增 `CODE_MENTION`：问题只要提到**源码文件/扩展名**（`client.js`、`index.js`、`main.py`…）
  或 **源码/代码/函数/实现/行号/调用链**，就判定需要源码包。
- `wantsSourcePack(question)` = `REVIEW_INTENT || CODE_MENTION`，三处调用点（工作区兜底 ×2、
  代码包开关）统一用它。
- `REVIEW_INTENT` 仍补了 复核/审核/终审/核验/判定。
- `dev/verify-host.mjs` 新增词汇鲁棒性断言：`终审：client.js …`、`核验 index.js …`、
  `请判定 main.py …`、`look at main.py` 都必须附源码；而 `今天天气怎么样` **不得**附源码
  （防止反向退化：什么都附代码）。

# 0.2.13

自我循环第 12 圈：客户端半复审「有条件通过」的整改 + 验收门自证漏洞修复。

## 按复审清单整改

- **409 收窄为结构化错误码**（P0→证伪后仍做）：host 三种 409 分别带
  `code: 'session-busy' | 'not-finished' | 'already-resumed'`；`fetchJson` 把 `status`/`code`/`runId`
  挂到抛出的错误上；`resumeRun` **只认 `already-resumed`** 为成功，其余 409 照常显示。
  用状态码或文案做判别都会吞掉真实失败。
- **follower 轮询死循环**（真 P1）：非 leader 分支原先只重排、从不 fetch，640ms 无限循环，
  run 结束也不停。现在 follower 不轮询，只保留自己的 SSE；由选举接管时新 leader 重新挂轮询
  （`claim()` 里判断 `running && pollTimer === 0 && eventSource === null`）。
- **`pollFailures`/`streamStalls` 跨 run 泄漏**（真 P2）：`startRun` 与 `switchSession` 都清零，
  否则上一个 run 攒到 8 次后，新 run 第一次抖动就判死。
- **SSE 错误风暴**（P2）：`onerror` 现在也计入 stall；两次失败后本 run 固定走轮询。
- **非 leader 回投提示**（P1）：`feedbackNote: 'another-tab'` + `panel.feedbackOtherTab` 文案，
  不再静默；`feedbackRunId` 在**所有标签**都记，leader 迁移后不会重投。
- **`track()` 退役后立即 dispose**（P1）：teardown 之后注册的清理器不再永久泄漏。
- **轮询失败不再抹掉别的错误**（P2）：仅在达到阈值时写入，不再写空串。

## 验收门（`dev/tune-sampler.mjs`）

- **修自证漏洞**：`text.slice(indexOf('client.js'))` 会切到别的文件（甚至 gate 自己，而 gate 源码也在
  pack 内），断言字面量于是能匹配自身。改为按 `--- <路径> ---` 精确取块、按下一个路径头收尾。
- **拆分两个真问题用例**：deadline 问题验 index.js（4/4），client 问题验 client.js（9/9），
  覆盖 SSE、看门狗、选举租约、`closeLeaderChannel`、`schedulePollRetry`、Hook 拆分、resume 门禁。
- 采样器：簇跨度上限 80 行、区域按份额自适应裁剪（不再"宽区截断到只剩开头"）、
  入选簇 5 → 9、SCREAMING_SNAKE 常量补窗口。

# 0.2.12

自我循环第 11 圈：**客户端半首次被评审**，并修掉采样器的假定义缺陷。

## 客户端半（client.js）

- **多标签双投递 + 409 当错误**（P0）：事件流不受 leader 约束，每个标签挂载都会接回 run，
  done 时各自 POST `/resume`；输的那个把宿主 409「该结果已回投过」渲染成红色错误。
  现在 `resumeRun` 先过 `isPollLeader()`，并把 409 视为**成功**（宿主本来就 once-only）。
- **leader 选举实际失效**（P0）：`leaderSeenAt` 同时被对端消息和自己的 `postMessage` 刷新，
  `isPollLeader()` 退化成「最近 2.5s 内有动静」，两个标签大部分时间都自认 leader ⇒ 双份轮询。
  改为 `myClaimAt` 与自己比较：持有租约者每 800ms 续租、跟随者沉默满 2500ms 才接管，
  并加确定性 tie-break（tabId 字典序），旧 channel 用 `closeLeaderChannel()` 关闭。
- **一次网络抖动丢掉仍在跑的 run**（P0）：`pollRun` 的 catch 原来直接 `running:false, run:null`，
  run 在宿主继续跑、UI 却回到可再次发起。现在保留 runId/running，指数退避重试，连续 8 次才放弃；
  仅 404（宿主确实忘了该 run）立即终结。
- **SSE 半开永久卡 running**（P0）：流建立后不发消息也不断连时，onmessage/onerror 都不触发。
  新增 `STREAM_STALL_MS=8000` 看门狗：每帧重挂，超时即关闭并切到轮询。
- **切会话不停旧连接**（P1）：`switchSession` 先 `stopPolling()`+`stopEventStream()` 再切。
- **条件式 Hook 调用**（P0）：`props.useInput` 是否存在原先决定是否调用 Hook。
  改为按 **组件类型** 分支（`CouncilBridgeWithInput` / `CouncilBridgeStatic`），
  bridge 写入移进 `useEffect`，渲染期不再写模块单例。

## 采样器

- **假函数定义吞掉整簇**（P0）：`const runId = store.state.runId`、`const React = require('react')`
  被当成函数定义，def 窗口把 340 行关键词簇整块替换掉——正好是评审要看的 SSE/选举代码。
  现在 def 判定必须带形参表或为函数/箭头表达式，且 def 区**独立保留**、不替换簇区。
- `CODE_MAX_CHARS` 40000 → 60000：整函数区与簇区并存后需要更多预算。
- 验收门升级：19 项 + 真实 deadline 问题 4/4 + **客户端问题 4/4**（新增假定义回归用例）。

## 测试

- `dev/verify-client.mjs`：fake React 现在有真正的 effect 调度器（`flushEffects`），
  旧实现 `useEffect(){}` 让「只在渲染期写状态」的组件也能蒙混过关。
  新增故障注入：`/resume` 返回 409 不得显示为错误；单次轮询失败不得丢弃运行中的 run。

# 0.2.11

**修复终审标【推断】的一条真实资源泄漏**（自我循环第 10 圈自检发现）：

- **deadline 墙胜出时不释放资源**：`Promise.race` 的墙分支原先只调 `finishRun` 写终态，随后 `finally`
  清掉 `run.watchdog`——于是 watchdog 里的 `controller.abort()` 与 `liveSeats` dispose **永远不会执行**。
  因为 `deadlineTimer` 按 `runDeadlineOf(run) - Date.now()` 计算、比 watchdog 早触发几毫秒，**这是常态路径而非边角**：
  在途 provider 调用会继续跑到自身超时（最长 300s），子代理会话也会泄漏。
- 新增 `terminateRun(run, message)`：写终态 + `controller.abort()` + dispose 全部 liveSeats；
  tool 与 HTTP 两处 watchdog、以及 deadline 墙分支统一走它。
- `dev/verify-host.mjs` 增加源码契约断言：`terminateRun` 必须包含三件事，两处 watchdog 必须调它，
  墙分支不得回退到裸 `finishRun(...)`。

# 0.2.10

**自我循环收敛：理事会终审通过。**

第 9 轮终审（runId cmwcdfl…，三模型 + 主席）：判定「通过」——四项 deadline 机制在附件中全部可指认且同源：
`runDeadlineOf` 唯一 deadline 公式、`callModel` 两处退避 `Math.min(800*(attempt+1), remaining())`、
`callSeatSubagent` 三处席位裁剪、`deadlineWall` 参与 `Promise.race` 并清理终态与定时器。
连续三轮至此零逻辑缺陷指认，此前所有「不通过」均为附件覆盖口径。

主席留下的唯一非否决整改项（本轮已修）：

- **三处席位裁剪全部改为现场 `remaining()`**：第一处原先复用 guard 前的 `left` 快照（功能同源但字面不同形）；现在守卫与裁剪都调用 `remaining()`，不存在过期快照窗口。
- **gate 改为区内断言**：新增 `inRegion(seatZeroGuard/seatCombined/seatStart/seatResult)`——三处裁剪必须**位于 `callSeatSubagent` 的完整函数体区域内**才计分。此前只在整个包里查字面量，截断片段也能过。验收门 19/19 + 真实验收问题 4/4。

# 0.2.9

self-loop 第 8 圈（def 区被尾部切掉的最后一修）：

- **完整函数区排序在最前**：上一版 def 区 push 在 regions 尾部，当簇文本总长超预算时最终 clamp 把尾部的 def 体切掉（理事会看到的 callSeatSubagent 只剩调用点）。现在完整函数区排最前、标注「完整函数体」，簇区在后填充。
- 采样器验收门升到 **11/11**（补 `runDeadlineOf` 公式与「完整函数体」标注计数）。
- 主席确认（第 8 圈结论）：可见片段内**无可指认的 deadline 逻辑缺陷**——不通过纯属附件覆盖口径。

# 0.2.8

self-loop 第 7 圈（采样器收敛为可执行验收）：

- **函数定义保底**：问题点名的函数（`callModel`/`callSeatSubagent` 等）其**完整函数体**无条件进入附件——同缩进 `}` 界定窗口、不按份额截断、变量形式命中不覆盖外层函数定义（该 bug 曾把 callModel 体切掉）。主文件（hint 命中最高的）获得 55% 总预算。
- **采样器验收门**：新增 `dev/tune-sampler.mjs`——对真实插件目录跑一次验收式采样，断言 9 个 deadline 标识符（两函数定义、退避/席位/尝试钳制、硬封顶、零预算守卫）**全部**出现在 index.js 块中，exit code 验收。已接入 `npm run verify` 与 CI。
- 大写蛇形标识符（`SEAT_RESULT_TIMEOUT_MS`）从问题文本进入 hint；`runDeadlineOf` 导出公式供测试直接断言。

# 0.2.7

self-loop 第 6 圈（终审附件采样回归修复）：

- **多簇采样**：v0.2.6 的单窗口锚定在终审 run 里只把 deadlineWall 段（L1772–1865）放进附件，deadline 四项实现分布在 5 个簇（L1028/1088/1336/1446/1795），单窗口必然漏 3 项——验证 subagent 交叉确认「采样回归，非实现缺失」。现在 `readCodeSegments` 将命中按 40 行容差聚类，取 top-6 簇按命中权重分配 75% 预算，每簇独立标注行号区间。实测：`deadlineAt / attemptTimeout / callModel 函数体 / callSeatSubagent / deadlineWall / Seat budgets clamp 注释` 全部入包。
- 回归断言新增多簇覆盖用例（三个相距 400 行的簇必须全部出现）。

# 0.2.6

self-loop 第 5 圈（源码包可视性根因修复）：

- **关键区锚定采样**：大文件（如 2246 行的 index.js）此前只截头部 4000 字——评审永远只见常量区，实现区（deadline/重试/席位裁剪）不可见，导致验收连续三轮「证据不足不通过」。现在 `readCodeSegments` 按问题关键词定位命中行（index.js 命中 43–52 处、密集于实现区），取「头部 + 命中最密集窗口」，并标注行号区间与命中数。实测：`deadlineAt / attemptTimeout / Math.min(CALL_TIMEOUT_MS / backoff 裁剪` 全部进入附件。
- **预算保留**：每个入选文件保有保留份额，先来的大文件不再把后面的文件饿成空 `--- path ---` 块。
- 回归断言更新为锚定语义（关键区必须包含 hint 命中行）。

# 0.2.5

self-loop 第 4 圈（复审「不通过」的整改）。理事会与验证 subagent 联合定位出**两个真缺陷**：

- **「验收」类问题不附源码包（根因修复）**：`REVIEW_INTENT` 只匹配 评审/审查/审计/review/audit，验收题用的是「验收/复审」——不命中 → 源码包静默关闭（实测 `codeState=off, 0/0`，理事会因此看不到任何代码）。现在「验收/复审/检查/acceptance」也触发源码包与工作区兜底，并有回归断言钉住（「验收题必须附源码包」）。
- **工具外显等待硬封顶**：`council_review` 增加 `deadlineWall`（`Promise.race` 到 `run.createdAt + RUN_TIMEOUT_MS`）——`timeoutMs` 的 +30s 只是执行器清理宽限，**对外可见等待绝不超过 remainingMs**（理事会第 5 高风险项的验收判据）。
- **拒绝路径不静默回退**：问题点名了 allowlist 之外的路径时，不再悄悄换成工作区附件（会误导「评审了别处」）。
- runtime harness 头注释与正文对齐（声称的 zero-budget 情况改为不变量断言），取消传播用例补齐。

# 0.2.4

self-loop 第 3 圈：真实代码路径回归（验收门 a 条件闭环）：

- **`dev/verify-runtime.mjs`**：用 fake Cordis context 直接驱动 `apply()`，从注册的 `council_review` 工具走**真实 `callModel`**——健康往返、瞬态 503 恰好一次重试后恢复（answer 重试 + review 各计一次）、非瞬态失败零重试快速失败。不再只是算术模拟。
- **`npm run verify`** 串联三个 harness（client / host / runtime）。
- **CI**：`.github/workflows/verify.yml` 从只跑 client 扩为三个全跑（推送需要 `workflow` scope，见 README）。

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
