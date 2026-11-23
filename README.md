# dsh-model-council

> 仓库：<https://github.com/sprw-li/dsh-model-council>
>
> **Status: alpha** — 接口与行为仍可能变化，正式版等外部反馈后再定。已发布到 npm 的只有 `0.1.0`；仓库源码为 `0.2.36`（见文末「版本与发布」）。

DeepSeek Harness 的多模型理事会插件：一个入口把问题交给多个模型并行作答、匿名互评，可选主席汇总，并可把结论回投主聊天。结果常驻右侧栏 tab。

已验证环境：**DSH `0.2.2-rc.1`**（`engines.dsh: >=0.2.2-rc.1 <0.3.0`）。

## 入口

| 入口 | 说明 |
| --- | --- |
| `/council` 命令 / 斜杠菜单「理事会评审」 | 打开右侧栏 tab；**不自动开始** |
| 选中文字浮动条「引用文本 \| 问 \| 执行 \| 理事会」 | 需要本地 `@local/quick-quote` 同装；点「理事会」把选中文字带进问题框 |
| 选中文字右键菜单「⚖ 交给理事会评审」 | 未装 quick-quote 时的兜底，行为相同 |

## 三个选项

| 选项 | 默认 | 作用 |
| --- | --- | --- |
| **接当前对话上下文** | 开 | 把当前会话最近约 6000 字可见文本附在问题前；失败自动降级为只发问题并提示。 |
| **自动附带问题里的本地路径** | 开 | 问题中出现的本地绝对路径（如 `D:\dev\项目`，也兼容 `D/dev/项目` 写法）会自动读取：目录树（深度 2）+ 关键文件（README/SKILL/CLAUDE/AGENTS/CHECKPOINT/pyproject/package.json/ARCHITECTURE/STATUS/DEFAULTS/RELEASE/DECISIONS 等，最多 6 个、单文件 8k 字、总 20k 字），跳过 `.git`/`node_modules`/`runs`/密钥类文件。**没写路径但问题提到「工作区/项目/仓库」时，自动改用当前会话工作区**（`SessionHeader.cwd` → workspace registry → Host cwd 兜底）；也支持 `@相对路径`。 |
| **结果回投**（三元） | 不做 | 运行结束后如何处置结论：<br>**不做** = 只留在右侧栏；<br>**静默放进上下文** = `agent.inject()`：结论作为上下文在下一次模型请求前注入，不占用 inbox 队列、不唤醒主 Agent、不会在当前 turn 中途插话；<br>**直接唤醒** = `followup()`（即 subagent parent 投递）：排一个普通后续 turn，立即让主 Agent 回复。 |
| **subagent 只读席位（混合）** | 关 | 开启后**前 N 个**委员是只读子代理（`spawn` + `council-readonly` Agent Preset：只读文件、搜索、加载 skill），其余走快速纯模型流式通道；`subagentSeats` 滑杆选 N（1–5，默认 2）。全关 = 全部纯模型。subagent 席位整轮结束才出正文，快速席位逐字流式。 |
| **主席汇总（关闭=无主）** | 开 | 关掉则只出各模型答案与匿名互评，不做主席结论。 |

参与模型 2–6 个，主席模型可选；选择与选项都记在浏览器 localStorage。

## 数据与费用

- 开启上下文时，**最近约 6000 字会话内容会发送至所选模型提供商**；回投会再向主 Agent 发一条消息。
- 单轮模型调用数：`2 × 参与模型数 + 主席(0/1) + 回投(0/1)`，开始按钮旁会显示预计次数。
- **静默注入**不产生额外模型调用（`agent.inject()` 把结论放进下一次模型请求前的上下文，**不排队、不唤醒**）；**直接唤醒**会额外触发一轮主 Agent 回复。
- 上下文上限可配置（见下），范围 500–50000 字。
- 插件不读取或记录 API Key；模型调用全部走 DSH 的 `ctx.llm`。

## 三阶段

1. **独立作答**：每个选中的模型同时回答；开启上下文时问题前附对话节选。
2. **匿名互评**：模型身份对评审隐藏（A/B/C…），各模型指出错误、遗漏并排序。
3. **主席汇总**（可关）：默认第一个选中的模型任主席，可改选；输出共识、分歧与盲点、建议与前提。

失败按席位隔离；全部失败显示错误态；运行中重复点击不会重复发起；关闭 tab **不会**取消运行（需显式点「取消」）。

## Host 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/council/models` | `{ providers, contextMaxChars, filesMaxChars }`，已过滤 embedding/rerank/图像/视频模型 |
| GET | `/council/workspace?sessionId=` | 工作区识别：`{ cwd, source: session-header \| workspace-registry \| process, workspaceId, name }` |
| POST | `/council/run` | `{ question, models, reviewers?, sessionId?, context?, attachFiles?, seatMode?: 'subagent' \| 'llm', useChairman?, chairman? }` → `{ runId }` |
| GET | `/council/runs?sessionId=` | 最近 5 个运行快照（含仍在跑的），用于页面刷新/重开后接回运行 |
| GET | `/council/run/<id>` | 快照：阶段、`contextChars/contextState`、`filesState/filesPaths/filesChars`、`workspace`、`structure`、`seatMode`、`resumed`、各席位文本与 `seat` 状态、互评、主席结论 |
| POST | `/council/run/<id>/resume` | `{ mode: 'silent' \| 'wake' }`：静默注入（`agent.inject`）或直接唤醒（`agent.followup`）；每个结果只接受一次 |
| GET | `/council/run/<id>/stream` | SSE 事件流：每个快照带递增 `seq`（`id:` 字段可断线续传），终态发 `event: end` 后关闭；断流时 client 自动回退 320ms 轮询 |
| POST | `/council/run/<id>/cancel` | 中止全部在途调用并 dispose 活跃席位 |

 运行记录保存在宿主内存（30 分钟过期、最多 `MAX_RUNS = 16` 条），并同步落盘到 `${DSH_HOME:-~/.dsh}/council-runs.json`（最多 20 条、500ms 防抖）；DSH 重启后仍能查到历史运行，重启前仍在跑的那条会标成「Host 重启，运行中断」。

## 工作区与结构（对齐 subagent / group / workflow）

council 不再只靠正则猜路径，而是按 Harness 自己的结构解析：

| 概念 | council 里的映射 |
| --- | --- |
| **工作区识别** | `SessionHeader.cwd`（权威）→ `ctx.workspaceRegistry.list()` 的 Workspace 实体（id/name/path/sessionIds）→ `process.cwd()` 兜底；`GET /council/workspace` 暴露给 UI，tab 里显示「当前会话工作区」。 |
| **subagent 参与者** | 每个席位 `{ provider, model }`（等价 subagent 的 `agentOptions`）；开启席位时前 N 个从 spawn 后端起只读子代理（带工作区 cwd），结果回投用 `agent.inject()`（静默）与 `followup()`（唤醒）的组合，而不是另造一套。 |
| **group 角色组** | `structure.roles = { answerers, reviewers, arbiter }`；`POST /council/run` 可传 `reviewers` 子集（缺省=全部作答模型），arbiter 即主席。 |
| **workflow 阶段** | `structure.stages = ['answers','reviews','synthesize']`（无主席时省略末段），每个阶段对一组角色执行，快照 `structure` 即节点图。 |

## 供 Agent 调用：`council_review` 工具

council 不只是 Web UI——host 侧注册了**全局工具 `council_review`**，任何 agent（主 Lead、迭代中的 subagent、workflow 步骤）都能编程调用，拿回理事会结论：

```
council_review({
  question: "评审 xxx 的实现，指出两个最值得先修的问题",
  models: [{provider, model}, ...],   // 可选；缺省自动挑 ≤3 个跨 provider 模型
  chairman: true,                     // 可选，默认 true
  attachFiles: true,                  // 可选，默认 true：附调用方工作区（树/关键文件/源码包）
})
→ { conclusion, runId, models }
```

要点：
- **工作区归属调用方**：用 `exec.agent` 的会话解析 cwd，subagent 在自己工作区里评审自己改的东西；
- **取消联动**：工具转发 `exec.signal`，调用方中断 → run 立即取消并 dispose；
- **超时**：工具声明 `RUN_TIMEOUT_MS`（30 分钟）为协作上限；
- **返回值**：结论文本末尾带「（参与模型：…；runId: c…）」行；结构化字段 `conclusion/runId/models` 全部 required；
- **自动挑模型保证异构**：每 provider 一个、模型名不重复（≤3 个跨 provider）；
- **自反馈循环**：边改边评审的标准姿势——改完一批，spawn 一个 subagent 让它带着改动上下文调 `council_review`，读回结论决定下一步；council 自身的很多修复就是这么被理事会指出的。

## Skill 接入（agent-library / DSH）

`council-readonly` 席位里装了 `skill-filesystem` + `tool-skill`，所以委员**能只读加载 skill**（列在它的 catalog 里、能看到 `skill` 工具）。

扫描根（由 `skill-filesystem` 决定，`includeDefaultRoots` 默认开）：

| 优先级 | 来源 | 路径 |
|---|---|---|
| 100 | 项目 DSH | `<项目根>/.dsh/skills` |
| 200 | 项目 agents | `<项目根>/.agents/skills` |
| 300 | 自定义 | `config.skillDirs` / 自动探测的 `D:\agent-library\catalog`（或 `$AGLIB_STORE/catalog`） |
| 400 | 用户 DSH | `~/.dsh/skills`（跳过 `.system`） |
| 500 | 用户 agents | `~/.agents/skills` |
| 600 | bundled | DSH 内置 skill 目录 |

用法：
- **委员自己调用**：问题里点名即可，例如「先用 skill 工具加载 `office-xlsx`，再按它评审表格产物」；席位看到 catalog 后自行调用 `skill` 工具。
- **只读**：席位没有写/执行工具，skill 只用于读指令；skill 里的脚本不会被执行（要执行请让主 Agent 做）。
- **主会话里的 DSH skill**：模型自动调用 `skill` 工具，或用户输入 `/skill-name`（`user-invocable` 的 skill）显式注入；council 席位不响应 `/name`，只在问题里点名或用 `skill` 工具。

配置示例（profile 插件行）：

```yaml
- id: council
  name: dsh-model-council
  config:
    contextMaxChars: 6000
    filesMaxChars: 20000
    codeMaxChars: 40000
    skillDirs:
      - D:\agent-library\catalog
```

不配 `skillDirs` 时，会自动探测 `$AGLIB_STORE/catalog`，否则 `D:\agent-library\catalog`（存在才加）。

## 配置

两种方式。**推荐用设置页**（改完立即生效，不必重启插件）：

**设置 → 理事会**

本插件有**两个入口**，各自独立开关（一个关掉不影响另一个）：

| 设置项 | 管什么 |
|---|---|
| `toolEnabled` | **内置工具入口**（agent 侧）：`council_review`。关闭后模型调用它会被拒绝，并在工具结果里说明原因 |
| `panelEnabled` | **外部入口**（用户侧）：侧栏面板与 `/council` 命令，以及 `POST /council/run`、`/resume`、`/cancel`。关闭后无法发起/恢复/取消评审，**只读查询（`/council/runs`、`/council/models`、运行详情）仍然可用** |
| `defaultModels` | 内置工具未显式传 `models` 时的默认评审模型。**选项来自 Host 的实时模型目录**（`GET /council/models`），模型下线后会标为"已保存但当前不可用"而不是静默改写 |
| `defaultChairman` | 未显式传 chairman 时的默认主席；必须同时在参与者名单内，否则回退首位 |
| `providerConcurrency` | **每 provider 并发槽位，默认 5**。同一 provider 的席位数 N > 槽位 M 时每阶段要跑 `ceil(N/M)` 波（三阶段串行，波数直接乘墙钟）；5 席名单在默认 5 槽下**每阶段一波**。多标签/多会话不会放大它（计数在 Host 全局）。**提高并发会提高瞬时请求数**，provider 限流时把它调回 4 |
| `answerMaxTokens` | 作答席位输出预算，默认 16384。调低可提速，但过低的预算会让长答案被截断（有 4096 下限保护） |
| `reviewMaxTokens` | 互评席位输出预算，默认 16384 |
| `chairmanMaxTokens` | 主席输出预算，默认 16384 |
| `runBudgetMs` | **整轮预算**，默认 1800000（30 分钟）；**只可下调**（下限 5 分钟），上限仍是 30 分钟。三阶段按 45% / 35% / 20% 分配子预算 |
| `optMember` | 不在设置页：`council_review` 的**可选入参**。opt 阶段 7 逐成员评审时标记本次运行服务于哪个成员（留空 = 非 opt 流程）；写入后**不可改写**，见下文"运行记录的可核对性" |

> 早先版本用单个 `enabled` 只关工具、面板照跑，字段名会让人以为整个插件停了。现在拆成两个显式开关。

`defaultModels` 只要求"与模型目录同步"（解析成功、去重、≤6 条）；**不强制异构性** —— 同一 provider 的多个模型是用户的显式选择。异构性（单 provider、模型名互不相同、≤3）只在**自动挑选**分支强制。

实现要点：这些字段在 `Config` 里声明为 `.volatile()`，并由 `ctx.configForms.get('council')` 绑定。函数式插件的 `config` 默认是**激活时的快照**，只有 volatile 字段会原地更新（`cordis-plugin-loader` 的 `_commitVolatile` → `updateVolatile` 写回同一个 ref，不重启插件），所以插件侧必须用 `config.field.get()` 读。

> **Unreleased（拟 0.2.37）新增的 5 个可调项**（`answerMaxTokens` / `reviewMaxTokens` / `chairmanMaxTokens` / `providerConcurrency` / `runBudgetMs`）也是 `.volatile()`：改了**下一次 run 就生效**，不必重启插件。它们会在每次运行开始时**冻结到该 run 上**——所以一次运行的中途改设置不会让快照里的计划与真实行为不一致。**这 5 个的默认值全部等于本次变更之前的硬编码常量**，升级本身不会让任何一次作答变短或变慢。

也可以直接在 profile 的插件行传 `config`（静态默认值，改普通字段会重启插件）：

```yaml
- id: council
  name: dsh-model-council
  config:
    toolEnabled: true
    panelEnabled: true
    defaultModels: []
    defaultChairman: ''
    contextMaxChars: 6000
    filesMaxChars: 20000
    # Unreleased（拟 0.2.37）：延迟/预算可调项（全部是 .volatile()，改了下一次 run 生效）
    providerConcurrency: 5        # 每 provider 并发槽位；5 席名单一波。限流时调回 4
    answerMaxTokens: 16384        # 作答席位输出预算
    reviewMaxTokens: 16384        # 互评席位输出预算
    chairmanMaxTokens: 16384      # 主席输出预算
    runBudgetMs: 1800000          # 整轮预算（只可下调，下限 300000）
    # 附件许可：默认只允许会话工作区 + 调用方目录。
    attachRoots: []              # 额外允许的根目录，例如 ["D:\\dev\\Project6"]
    allowExternalPaths: false    # 逃生舱：true = 恢复"问题里任意本机路径可读"（0.2.27 前行为）
```

> `@deepseek-ai/schemastery` 是 peerDependency（`^3.18.5`，`.volatile()` 从该版本起提供）。

## 对话内工具卡片（0.2.32 新增）

`council_review` 现在在对话里有自己的卡片，而不是塌成裸 JSON 输入。

- 注册在 **`tool.call.toolview`**，`key` 必须**精确等于 wire 工具名** `council_review`（官方文档原话 "a typo never renders"——写错不报错、只是永远不渲染，退回通用行）。同时声明 `locale`，否则框架不注入 `t`。
- 三个阶段各自渲染：`preparing`（单行，不 dump 不完整参数）→ `start`（问题摘要可展开、参与模型、主席开关、附件提示 + **实时阶段、每席位状态，以及可展开的实时思考与正文**）→ `result`（成功渲染输出文本；失败渲染 `name · code`）。
- **实时思考（0.2.35）**：provider 把思维链作为独立的 `reasoning-delta` 流推送，且**先于正文**到达。快照里每个席位带 `reasoning`（尾部窗口，最多 4000 字）与 `reasoningChars`（真实总字数）；`reasoningChars > reasoning.length` 时客户端明确写「仅显示最近 N 字（共 M 字）」，**不假装是全文**。展开席位即可看到流动的思考并在新内容到达时自动跟随（用户手动上滚则不抢）。实测这条链路的推理阶段可达 200+ 秒，所以「思考中…」不等于卡死。
- **两个易错契约**（实测自 `dsh-client-ui-tool/lib/client.js` 与 `packages/util/values/src/partial-json.ts`）：
  - `block.args` 是**懒读器 `PartialArguments`，不是普通对象** → 必须 `.text(key)` / `.value(key)`，`block.args.question` 取不到值。
  - `result` 的 `block.call` 只有 `{ name, argsRaw }`（或 `null`），**没有 `.args`**；参数视图始终是 `block.args`。`preparing` 的 block **没有 `argsRaw`**。

## 运维注意：重载插件会杀掉在途运行

`council_review` 是在**插件根**上注册的。禁用→启用插件会销毁该实例，随之：

- `runs` Map 全丢，每个在途运行落盘为 **`Host 重启，运行中断`**；
- 正在调用 `council_review` 的 agent 手里那个工具**不再能解析**（同一个 turn 里再调会失败）。

**实测**：一次对话里重载两次，杀掉 3 个运行，并让调用方在同一个 turn 里失去了工具绑定。

所以重载前先查：

```powershell
(Invoke-WebRequest http://127.0.0.1:<port>/council/ -UseBasicParsing).Content | ConvertFrom-Json | Select toolEnabled, panelEnabled, runningRuns
```

`runningRuns = 0` 才安全。这个字段就是为这件事加的——**让"能不能重载"在动手前可查，而不是事后只能看到 `运行中断`**。

## 跨模型：council 用 llm 模式，不受 subagent 路由策略限制

DSH 的 `subagent` 工具有一条**会话级路由白名单**（`@deepseek-ai/dsh-tool-subagent/lib/model-selection-settings.js` 的 `subagentModelSelection` 服务，`enabled` 默认 **false**、`allowedModels` 默认 **[]**）：

```js
if (policy === undefined)
  allowed = provider === parent.provider && model === parent.model   // 无策略：只允许父路由自己
else
  allowed = policy.routes.some(r => r.provider === provider && r.model === model)
```

也就是说**未配置策略时，subagent 只能继承父会话同一条路由**；指定别的模型会得到
`child LLM route "x/y" is not allowed for this Session`。要在 subagent 里跨模型，必须把该服务
`enabled: true` 且 `allowedModels` 填上允许的路由——而且策略是在**会话第一帧**写进 session projection 的，
**改完要新开会话才生效**。

**council 的默认 `seatMode` 是 `llm`，走 `ctx.llm.stream({provider, model})`，完全不经过这条策略**，
所以跨模型评审不需要动 `subagentModelSelection`。`seatMode: 'subagent'` 才会撞上它；
那种情况下 council 会逐席降级回 llm 模式（`seat.fallbackFrom = 'subagent'`），不会让整轮失败，
但**降级后的席位就不再是子代理了**——快照里能看出来。

> 实测（2026-11-21，`providerA` 的 `modelA` + `modelB` + `modelD`，3 个不同模型）：
> `status=done`，三席全部产出，耗时 383 秒。同一时期 `providerC` 的席位报
> `余额不足（QUOTA）`——那是账号余额，不是插件问题。

## 运行状态浮窗

调用 `council_review`（或面板发起）时，对话区右下角会出现一个浮动状态卡：阶段（作答／互评／主席）、已完成席位比例、每个席位（模型名 + 运行/完成/失败）、问题摘要与错误。

- 渲染在 `conversation.input.overlay`（与官方命令弹窗、斜杠菜单、反馈对话框同一个位），并按该 slot 的契约 **portal 到 `document.body`**。
- **只读**：它不写运行状态、不投递结论、不取消运行；投递仍然只走 leader 的 stream/poll 路径。
- **心跳（0.2.33）**：流只在状态变化时推数据，一次模型调用要几分钟——**实测 25 秒才 1 个事件**，而客户端 8 秒无消息就判流卡死。所以 Host 每 3 秒推一条**具名**事件 `event: beat`。具名是刻意的：`EventSource` 把具名事件交给 `addEventListener`、**不会**进 `onmessage`，所以只处理 `onmessage` 的客户端不可能把心跳当成快照。客户端收到 `beat` **只重排看门狗、不 publish**（它只是 liveness 信号）。
- **看门狗超时后的分流**：leader 转轮询；**非 leader 重建只读流**——否则流被关掉、轮询又不排（轮询只有 leader 能做），那张标签页就永久变黑，卡片停在收养时的快照。实测过这个症状：卡片 `0/5 全部运行中`，而 Host 快照已是 `3/5 完成`。
- **发现机制（0.2.32 修正）**：agent 发起的 `council_review` 只会创建 Host 侧运行，客户端原本不知道，所以浮窗挂载时会 `adoptRunningRun()` 并每 4 秒重查 `GET /council/runs`。**旧实现在两处提前 `return`（挂载时非 leader、或回调时非 leader），于是那张标签页永久失明** —— 现在定时器**恒排恒重排**，只把"发请求"这一步做 leader 门控。
  > 这不等于 0.2.16 修掉的空转缺陷：follower 只有一个本地 4s 定时器、**零 HTTP**（旧缺陷是 320ms 周期反复 fetch）。保留定时器正是 follower 接管租约后能立刻开始发现的前提。
  > **每 4 秒的持续轮询是既有行为**（旧版 leader 找不到运行时同样继续重排），本次未放宽也未收紧。

## 已验证（2026-11-11，本机 DSH 0.2.2-rc.1）

- **路径附件**：问题写 `D/dev/workspace-project`（原样 typo）跑通，`filesState=ok`、`filesChars=23614`，模型回答里出现只有读到文件才知道的 `condopt` 架构 / 18 算法 / 18 门禁细节。
  > **2026-11-16 起需注意**：那是**工作区之外**的路径。默认已收紧为 fail-closed（只允许工作区与调用方目录），复现这条需要先把该目录加进 `attachRoots`，或临时置 `allowExternalPaths: true`。见下方「附件安全」。
- **工作区识别**：问题不写路径、只说「总览当前工作区项目」，`GET /council/workspace` 从 `SessionHeader.cwd` 解析出 `workspaceId`，自动附带当前工作区（`filesChars=20182`），模型正确说出工作区里的真实内容；快照 `structure` 输出 `roles.answerers/reviewers/arbiter` 与 `stages=['answers','reviews']`。
- **只读 subagent 席位**：`seatMode='subagent'` 实测 `status=done`，两个席位都真的用工具读了工作区的 `README.md`、`grep`、`glob` 后才作答（不是靠注入文本）。
- **断线修复**：此前在 6 模型评审中因 max-tokens/超时失败的 `providerA/modelA`（modelA）与 `providerA/modelD`（modelD），现在纯模型模式各返回 239 / 238 字有效答案。
- **客户端 harness**：`node dev/verify-client.mjs` 覆盖入口/开关/回投三元/部分失败/全失败/防重入/选中文字桥接/工作区提示。

## 可靠性、安全与并发（v0.2 硬化）

- **终态只写一次**：`finishRun()` 是唯一终态入口；取消/超时/正常完成竞态下，迟到的阶段结果不会覆盖「已取消/已超时」；watchdog 与 cancel 都会 dispose 活跃席位。
- **并发上收到 Host**：每 provider 全局 5 并发槽（多聊天/多标签页不会放大）；429/5xx/超时/ECONN 等瞬态失败退避重试（最多 3 次）；`max-tokens` 无正文自动翻倍重试。
- **降级熔断 3**：每个 run 最多降级 3 席（超时/失败 → 纯模型）——刻意低于 `MAX_MODELS = 6`，因为连续多席失败通常意味着 provider 故障而非单席偶发，继续降级只会放大负载；触发熔断时整轮报错并注明原因。`seat.fallback/fallbackFrom` 与 `run.fallbacks/fallbackLimit` 可在快照里审计。
- **单会话单 run**：同一 `sessionId` 已有运行中的评审时，`POST /council/run` 返回 409 + 现有 runId，前端改为接回而不是再开一份。
- **运行注册表持久化**：写入 `${DSH_HOME:-~/.dsh}/council-runs.json`（最多 20 条，500ms 防抖）；Host 重启后仍能查到历史运行，重启前仍在跑的被标注为「Host 重启，运行中断」。
- **源码包（评审必读）**：问题含 `评审/审查/review/audit` 等意图时，除目录树与关键文档外，还会自动打包**真实源码**：单文件 ≤ `CODE_FILE_CHARS`（12000 字）、总预算 `codeMaxChars`（默认 120000 字，即 `CODE_MAX_CHARS`），遍历条目上限 `CODE_WALK_ENTRIES`（2000）；主文件拿 80% 预算，大文件按问题关键词锚定采样（完整函数体 → 命名符号窗口 → 关键词簇），路径全部标注；提示词要求结论必须引用具体文件、附件未覆盖的内容标注【推断】。快照新增 `codeState/codeFiles/codeChars` 与**覆盖率** `codeDiscovered/codeTruncated`（发现数 vs 附带数、截断数），UI 显示「已附带源码 N 个文件（X 字）」——**这是抽样初审，不是全项目审查**；附件头部自带覆盖率声明。
  - **判据（0.2.32 收窄）**：源码包只在**问题确实关于代码**时附带。`CODE_MENTION` 的扩展名列表里有 `md`，而 `REVIEW_INTENT` 对任何评审词都成立，于是"评审一份 `.md` 方案文档"被判成代码评审，从兜底目录附了 **90k 字源码（24 个文件）**——实测一次 17 分钟的运行，评审者读的多是无关代码。现在：点名的产物**全是文档**（`.md`/`.txt`/`.pdf`/`.docx`/`.csv`…）且没有任何源码文件被点名时，**不附源码包**；点名了源码文件、或什么都没点名（工作区评审）时**照旧附**；`README.md`/`SKILL.md`/`AGENTS.md`/`package.json` 等契约文件视为代码相邻，仍附。
- **点名的文档会真的被附上（0.2.32 新增）**：相对路径（`` `评审/04_方案步骤与决策手册.md` ``）以前**完全不进候选**——`candidatePaths` 只接受绝对路径，而 `@mention` 的字符类不含非 ASCII，所以 `@评审/...` 也匹配不到。实测：一次评审点名了手册，附件里却只有目录树，评审者看不到评审对象（提问者当时已学会在问题里补一句"若附件未包含该文件…"）。现在带**目录部分**的相对路径会解析到工作区内并作为候选；`@mention` 支持中文路径。裸文件名（`client.js`）仍交给目录兜底，因为同名文件有歧义。
- **附件安全**：`@mention` 只解析到工作区内（拒绝 `..` 穿越）；路径附件拒绝符号链接、密钥类文件（`.env`/`.pem`/`.key`/`.ssh`/`.aws`/`.kube`/`id_rsa` 等）、二进制与 >1MB 文件；skill 只读加载、脚本不执行。
  - **fail-closed 路径许可（0.2.28）**：默认只允许**会话工作区**与**调用方目录**。问题里写出的其他绝对路径会被拒绝，除非列在 `attachRoots` 里，或置 `allowExternalPaths: true`（逃生舱，恢复 0.2.27 之前"任意本机路径可读"的行为）。
    > 收紧前实测：默认配置下，问题里写一个工作区外的绝对路径，其内容**真的进入附件**（canary 命中）。原因是 `permitted` 写成 `attachRoots.length === 0 || ...` —— 空 allowlist 等于不做限制。对 agent 生成的问题，这是一条无需要用户有意的间接外发通道。
  - **内容级密钥扫描（0.2.28）**：文件名规则（`SECRET_NAME`）只挡名字自曝的文件，挡不住粘在 README / notebook 里的密钥。出站前按 `sk-` / `ghp_` / `github_pat_` / `AKIA` / `xox[baprs]-` / `AIza` / `-----BEGIN … PRIVATE KEY` / `token=「长字面量」` 扫描并**脱敏**为 `[已脱敏:<模式>]`，附件头部与快照 `filesRedactions` 如实报出被脱敏的文件与模式。
    > 选择脱敏而非拒读：整份丢弃会破坏"只是记录密钥格式"的合法评审，且被拒文件对评审者同样不可见。但脱敏**不静默** —— 评审者会知道哪一处不可见。
  - **reparse point（junction/符号链接）**：工作区内的 junction 指向工作区外时**不会被跟进**。
    走查向来拒绝树内的链接，但**根节点**曾经没有守卫——`statSafe` 用 `stat`（跟随），
    于是把 `ws/link-out` 这类路径写进问题就会被当成 root，其中的"普通文件"随即被读取。
    实测该路径会真的把工作区外文件送进附件（Windows 建 junction 不需要管理员权限）。
    现在接受候选前会 `lstat` 拒绝链接根并在 `realpath` 解析后的真实路径空间复核包含关系。
    > **硬链接不在此列**（也不该）：它没有 reparse point，是同一份数据的第二个真实目录项，
    > `lstat` 就是普通文件；要创建它就必须已经能访问目标，因此不提供额外能力。
  - **出站清单确认**：面板里的「预览附件」调用 `POST /council/preview`（只读、不受 `panelEnabled` 影响），
    列出**将要**附带哪些文件、字符数、源码包覆盖情况、以及被脱敏的位置。确认后才启动，
    运行记录 `manifestConfirmed`。**确认是 fail-closed 的一次性授权**：预览失败/无清单/换问题/换会话都会失效。
    工具路径（agent 发起）没有人可以确认，因此恒为 `false` —— 不假装有。
  - **仍缺**：多卷/网络驱动器上的 reparse point 行为未测（junction 不能跨卷，理论影响面有限）。
- **自动化回归**：`npm run verify` 现在同时跑 host 与 client harness（路径修复/穿越拒绝/密钥跳过/超时语义/并发窗口）。

## 延迟、预算与降级（Unreleased，拟 0.2.37）

实测背景：本机 8 次 5 席调用耗时 **11m45s–27m46s**，其中一次在**主席阶段**硬失败
（`整轮预算耗尽：调用超时（89s 内未完成）`）。三个成因与对策：

| 成因 | 本次变更（Unreleased，拟 0.2.37）的做法 |
|---|---|
| 每席 16384 tokens × 5 席 × 3 阶段 | 改成设置（`answerMaxTokens` / `reviewMaxTokens` / `chairmanMaxTokens`），**默认值不变**——想快就自己调低，升级不会偷偷缩短答案 |
| `providerConcurrency = 4` → 5 席同 provider = 每阶段 `ceil(5/4)=2` 波、三阶段≈5 波 | 默认提到 **5**：5 席名单每阶段**一波**（≈3 波，实测等效 −40% 墙钟），**不改变单次调用质量**；6 席仍 2 波。提高并发会提高瞬时请求数，遇限流调回 4 |
| 主席是最后一阶段，只吃 30 分钟预算的**剩余量** | 三阶段子预算 **45% / 35% / 20%**：作答、互评被硬封顶，主席由构造保证 ≥20%；仍不足 120s 时**优雅跳过**而不是硬失败 |

- **子预算与波次是可见的**：快照新增两个字段（名字冻结）——
  - `providerWaves`：`{concurrency, maxWaves, advice, stages:{answers|reviews|chairman:{seats, slots, waves, byProvider:[{provider, providerName, seats, slots, waves}]}}}`，即"这轮每个阶段要跑几波"，以及一行可执行的 `advice`（同 provider 超额时给出"掺入第二 provider 可降为一波"）；
  - `budgetPlan`：`{startedAt, totalMs, elapsedMs, remainingMs, stages:{answers|reviews|chairman:{share, budgetMs, usedMs, startedAt, endedAt, deadlineAt, capped, cappedReason}}}`，主席另带 `floorMs/skipped/reason`。
  两者**永远存在**（从磁盘恢复的历史 run 会按其名单与默认预算现场算一份）；阶段关闭后 `usedMs` 冻结，不随快照刷新增长。
- **降级一律显式**：主席被跳过时 `stopReason = "chairman-budget-skipped"`、`status` 仍是 `done`、`error` 为空，`budgetPlan.stages.chairman.reason` 写明"剩余 Ns、下限 Ms"，整轮按**无主席模式**产出结论；阶段用满子预算时该阶段 `capped=true` + `cappedReason`。这些以及同 provider 波次建议都会以 `注意：…` 一行写进 `council_review` 的**工具结论文本**，调用方与用户都看得见。
- **阶段预算耗尽不再冒充整轮**：以前任何预算耗尽都写"整轮预算耗尽"，即使整轮还剩几分钟；现在按阶段分别写"作答阶段/互评阶段/主席阶段预算耗尽"。
- **想更快 / 想更稳**：更快 → 调低三个 token 预算（单次输出短），或把名单拆到两个 provider（每阶段都是一波）；更稳 → `runBudgetMs` 下调（例如 20 分钟，早失败早返回），或 `providerConcurrency` 调回 4（限流时）。

## 运行记录的可核对性（Unreleased，拟 0.2.37）

- **工具发起的 run 不会被重复回投**：`POST /council/run/<id>/resume` 对 `toolRun === true` 的 run **默认拒绝**（409 + `code: "tool-run"`，说明"结论已作为工具结果交回调用方"）。重复投递不能只靠客户端自觉——任何过期标签页/复活页面都拿不到第二份。
  - 显式逃生门：`?force=1`（或 body `force: true`）放行，并把 run 记为 `resumed: "wake(forced)"`（而不是普通的 `wake`），所以"强行重复投递"**可审计**而不是静默。逃生门只解除 tool-run 这一条，同一次投递的第二次仍 409 `already-resumed`。
  - 面板 run（`toolRun !== true`）行为与响应体**逐字不变**。
- **`optMember` 成员标签（write-once）**：`council_review` 新增可选入参 `optMember`，用途是 opt 阶段 7 逐成员评审时标注"本次运行服务于哪个成员"（留空 = 非 opt 流程）。它落到 run 上并进入快照 `optMember`，也会出现在工具结论的元信息行：`（参与模型：…；runId: cxxx；optMember: rev-01）`。
  - **一旦写入不可改写**：无标签的调用不会清空已有标签，同值重复是幂等，**不同值直接报错**（`该运行已标注为 opt 成员 "X"，不能改写为 "Y"`）。这样一个 `runId` 只能对应一个成员——下游记录里"同一 runId × 8 个成员"不再可能，而"8 条记录来自 8 次独立运行"才有机械依据。
  - **面板无法注入**：`POST /council/run` body 里的 `optMember` 会被忽略（面板 run 的快照恒为 `''`），因为标签可信的前提是只有文档化的工具路径能写它。

## 已知限制

- `ctx.agents.get(sessionId).session.snapshotEvents()` 是 DSH 内部接口，已用 try/catch 降级为“只发问题”，UI 会标注「上下文读取失败」；升级 DSH 后请重新验证。
- 左键选中的浮动条由内置 `quote` 交互独占（先注册先赢），理事会条目依赖 quick-quote 的渲染器；未装 quick-quote 时只留右键菜单。
- 「结果回投」的**直接唤醒**会让主 Agent 立即回复（有意行为）；**静默放进上下文**用 `agent.inject()`：结论不排队、不唤醒，在下一次模型请求的 pre-step 进入上下文，不会打断当前 turn。
- 上下文只取可见文本，不含工具调用与附件；路径附件只读文本类文件（1 MB 内），不读二进制、不跟随符号链接。
- **运行中可停止**：运行中显示「停止」按钮；页面刷新/重新打开后会自动从 `GET /council/runs` 接回正在跑的 run（仍可点停止）。**关闭页面或刷新都不会取消运行**——`pagehide` 在刷新时同样触发，早期版本用 `sendBeacon` 取消会让「刷新后接回」永远失效；现在关页只释放本页连接，run 交由宿主 watchdog 兜底（30 分钟），要终止请点「停止」。**关闭右侧栏 tab 不终止运行**（设计如此：重开 tab 可接回）。
- **多标签页**：同会话多标签用 `BroadcastChannel` 选主，只有一个标签轮询/回投；leader 每 800ms 续租、跟随者沉默满 2.5s 才接管（确定性 tie-break）。无 BroadcastChannel 的环境退化为各自轮询。
- **每席指标**：快照 `seat.ttftMs/elapsedMs`，卡片显示「首字 Xs · 总 Ys」，用于定位慢席位（subagent 席位 TTFT 高是正常的——它整轮结束才出正文）。
- **subagent 席位只在作答阶段**：互评与主席走快速纯模型通道，避免 6 席 × 多阶段各开一整轮子代理导致假死；单席有启动 60s / 执行 240s 上限（`SEAT_START_TIMEOUT_MS` / `SEAT_RESULT_TIMEOUT_MS`，与本节一致），超时或失败自动降级纯模型（卡片标「完成（降级）」），整轮另有 30 分钟 watchdog。卡片在运行中显示「启动中/运行中 Ns」。
- **subagent 模式下路径附件默认关闭**：委员自己用只读工具读工作区，避免重复注入 20k 字；如需同时注入，走 API 显式传 `attachFiles: true`。
- **subagent 席位较慢**：每席是一轮完整子代理（带工具），比纯模型调用慢数倍；子会话会出现在子代理侧栏。`council-readonly` preset 依赖 DSH 的 `dsh-persona`/`dsh-tool-fs`/`dsh-tool-fs-search`/`dsh-skill-filesystem`/`dsh-tool-skill` 模块名，升级 DSH 后若改名会注册失败并自动退回纯模型模式（UI 会提示）。
- **输出预算**：作答/互评/主席各 16384 tokens（可用 `answerMaxTokens` / `reviewMaxTokens` / `chairmanMaxTokens` 调低提速）、单次调用超时 600s（`CALL_TIMEOUT_MS`，且始终被整轮预算钳制）；推理模型若把预算烧光且无正文，会自动用 32768 重试一次。仍有极小概率失败，属模型侧限制。
- 未做跨 profile / 卸载依赖 / 旧 DSH 版本的真实多环境验证。

## 安装

npm 上的发布版本**停在 `0.1.0`**（dist-tags `latest` / `alpha`）——发布 0.2.x 需要新的 granular token（旧的已吊销）。
所以 **npm 这条路拿到的是 0.1.0**：它没有 0.2.x 的安全硬化（附件 fail-closed、内容级密钥脱敏、
junction 逃逸修复、出站清单确认）与可靠性修复（SSE 心跳、超时可重试、终态只写一次）。**不要从 npm 装。**

当前源码版本 **0.2.36**；可安装的最新构建在 GitHub Releases 上：

```sh
# 推荐：从 GitHub Release 的 tarball 装最新构建（当前 v0.2.36）
npx --yes @deepseek-ai/dsh@latest plugin --profile <name> add `
  https://github.com/sprw-li/dsh-model-council/releases/download/v0.2.36/dsh-model-council-0.2.36.tgz

# 不推荐：npm 上的 0.1.0（见上）
npx --yes @deepseek-ai/dsh@latest plugin --profile <name> add dsh-model-council@alpha
```

> 每次发版都会把对应 tarball 传到 Releases（资产名 `dsh-model-council-<版本>.tgz`）。装之前先看一眼
> <https://github.com/sprw-li/dsh-model-council/releases> 的最新 tag，把上面命令里的版本号换成它——
> 本 README 引用的源码版本由 `npm run verify` 的文档契约断言守着（`dev/verify-host.mjs` 会比对 `package.json`）。

安装或升级后刷新 DSH Web 页面；Host 半场可用插件行 disable → enable 重载——**重载前先查 `GET /council/` 的
`runningRuns`，非 0 就不要重载**（重载会杀掉在途运行并使调用方当轮失去工具绑定，见上文「运维注意」）。

## 开发与测试

```sh
npm install       # 必需：index.js 导入 @deepseek-ai/schemastery（声明 Config 用），
                  # harness 跑在普通 node 下，没有它 dev/verify-host.mjs 会 ERR_MODULE_NOT_FOUND
npm run verify    # 客户端 + host + runtime + sampler 四个 harness
npm run syntax    # node --check 两个入口
```

> `@deepseek-ai/schemastery` 同时声明为 `peerDependencies`（运行期：DSH 给 linked 插件装的路由层
> 要求祖先 package.json 声明它，否则回落 native 解析）与 `devDependencies`（普通 node 跑 harness）。
> 干净检出必须先 `npm install`。

### CI：已启用

`.github/workflows/verify.yml` 已进入版本控制，每个 push / PR 自动跑：

```
ubuntu-latest / node 22
  1 actions/checkout@v4
  2 actions/setup-node@v4
  3 npm install --no-save --no-package-lock     ← 没有它 verify-host 会 ERR_MODULE_NOT_FOUND
  4 node --check index.js && node --check client.js
  5 node dev/verify-client.mjs
  6 node dev/verify-host.mjs
  7 node dev/verify-runtime.mjs
  8 node dev/tune-sampler.mjs
```

首次运行（探针分支）：**run 43903527781，49 秒，全绿**。
查看：<https://github.com/sprw-li/dsh-model-council/actions>

本地等价检查：`npm run verify`（一条命令跑完四套 harness）。

#### 排查记录：为什么曾经以为"开不了"

先前写下"CI 卡在凭据上、需要你授权"是**错的**。错因是排查只覆盖了 OAuth 系路径：

| 推 workflow 文件的路径 | 结果 |
|---|---|
| `git push` over **HTTPS**（OAuth App token / `gh` 登录态） | ✗ `refusing to allow an OAuth App ... without 'workflow' scope` |
| REST（`POST /git/trees` 带该路径） | ✗ **404**（scope 不足时 GitHub 用 404 而非 403） |
| `git push` over **SSH** | ✓ **成功** |

**该限制只针对 OAuth App，SSH 密钥不受限** —— 所以不需要 `gh auth refresh`，也不需要 fine-grained PAT。

同一时期还实测到 git over **HTTPS** 到 `github.com:443` 会整段超时
（8/8 失败、~10.6 s），而 `api.github.com` 8/8 正常、SSH 正常、对照站正常。
所以 `origin` 已改为 SSH（`git@github.com:sprw-li/dsh-model-council.git`）。

## 推送到 GitHub（本机沙箱的可用路径）

**先试 `git push`。** 2026-11-16 实测本机 `git.exe` **可以**直连 github.com：
`git ls-remote` 成功、真实推送成功（认证走 Git Credential Manager，`credential.helper = manager`）。
早期"连接被重置"的结论已不成立——那次是当时的网络状态，不是长期限制。

```powershell
git push origin main          # 常规路径；实测 1 文件提交 ≈40s（首次 34s，删分支 10.6s，dry-run 0.2s）
```

**只有 `git push` 真的失败**（连接重置 / 超时 / 认证修不好）才走 REST 回退：

```powershell
$env:GITHUB_TOKEN = gh auth token
node <workspace>\tmp\push-council.mjs <本目录> sprw-li/dsh-model-council main
```

这个脚本只推送远端还没有的本地 commit，并且**用原始的 tree / parent / 作者与时间重建提交**，因此远端 SHA 与本地 SHA 完全相同——不会出现两条分叉历史。首次对齐用 `tmp\align-history.mjs`（重放整条链，SHA 不等就拒绝移动 ref）。

**为什么两条路径都慢**：本机单次 `api.github.com` 往返约 **2.5 s**。REST 回退把"一次 packfile 传输"拆成十几次**串行** HTTP（1 取 ref + 变更文件数逐个 blob + 每个目录一次 trees + 1 commit + 1 ref PATCH），一次 6 文件提交约 **30–35 s**；`git push` 真实推送实测 **10.6–39.7 s**（两次 39.7 / 14.5，随链路抖动）。**量级相同——换路径不会变快**；选 `git push` 是为了正确性与可维护性（标准协议、无 SHA 重放），不是为了提速。

**`gh` 的写操作在本机会挂住**（实测 `gh release create` 240 s 无输出）。建 tag / release 用 REST 直连：
`gh api -X POST repos/<o>/<r>/git/refs -f ref=refs/tags/vX.Y.Z -f sha=<commit>`，
资产上传用 `tmp/release-council.mjs`（POST `uploads.github.com`）。

> 这套排障与回退流程已收进 skill `git-push-workflow`（agent-library catalog），含实测耗时与诊断阶梯。

## 发布记录与后续

- GitHub：<https://github.com/sprw-li/dsh-model-council>。每个版本都有对应的 pre-release 与 tarball 资产
  （当前最新 `v0.2.36`，资产名 `dsh-model-council-0.2.36.tgz`）——**这是目前唯一可安装的路径**，见上文「安装」。
- npm：<https://www.npmjs.com/package/dsh-model-council>。`latest` / `alpha` 都停在 **`0.1.0`**，
  仓库源码 `0.2.36` **尚未发布**。`0.0.0-stage` 是 npm staged publishing 的过渡占位版本，已 deprecate。

### 发布到 npm（当前受阻：需要新 token）

**实测（2026-11-22）**：`~/.npmrc` 里那个 `//registry.npmjs.org/:_authToken` 已经失效——
`npm whoami --registry=https://registry.npmjs.org` 返回 `E401 Unauthorized`。所以 0.2.x 一直没上去。
换一个新 granular token 之后是三条命令：

```powershell
# 1. 本机默认 registry 是镜像（registry.npmmirror.com），发布必须显式指向官方 registry，否则必然失败
npm publish --registry=https://registry.npmjs.org --tag alpha

# 2. 让不带 tag 的安装也拿到最新版（否则 `npm i dsh-model-council` 仍是 0.1.0）
npm dist-tag add dsh-model-council@0.2.36 latest --registry=https://registry.npmjs.org

# 3. 核对
npm view dsh-model-council dist-tags --registry=https://registry.npmjs.org --json
```

> 账户若开了 2FA，第 1 条会要 OTP（追加 `--otp=<6 位>`）。
> **发布后必须同步 README 的 npm 段落**：`dev/check-release.mjs` 会直接拉官方 registry 的 dist-tags 比对，
> 落后或说错都会变红（registry 不可达时记 SKIP，不算失败——环境失败 ≠ 逻辑失败）。

常规发版流程：更新 `CHANGELOG.md` 与 `package.json` 版本 → `npm run verify` → `node dev/check-release.mjs`
→ commit/tag → 上面的三条 npm 命令 → `npm pack` + 建 release 传资产 → 更新 README 的 npm 段落。
