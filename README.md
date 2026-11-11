# dsh-model-council

> 仓库：<https://github.com/sprw-li/dsh-model-council>
>
> **Status: alpha (`v0.1.0-alpha`)** — 接口与行为仍可能变化，正式版等外部反馈后再定。

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
- **静默注入**不产生额外模型调用（结论进入 inbox，等下一次对话才被消费）；**直接唤醒**会额外触发一轮主 Agent 回复。
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

在 profile 的插件行上传 `config`（无需构建）：

```yaml
- id: council
  name: dsh-model-council
  config:
    contextMaxChars: 6000
    filesMaxChars: 20000
```

## 已验证（2026-11-11，本机 DSH 0.2.2-rc.1）

- **路径附件**：问题写 `D/dev/Project6-skill-Opt_of_Cpndition`（原样 typo）跑通，`filesState=ok`、`filesChars=23614`，模型回答里出现只有读到文件才知道的 `condopt` 架构 / 18 算法 / 18 门禁细节。
- **工作区识别**：问题不写路径、只说「总览当前工作区项目」，`GET /council/workspace` 从 `SessionHeader.cwd` 解析出 `workspaceId`，自动附带当前工作区（`filesChars=20182`），模型正确说出工作区里的真实内容；快照 `structure` 输出 `roles.answerers/reviewers/arbiter` 与 `stages=['answers','reviews']`。
- **只读 subagent 席位**：`seatMode='subagent'` 实测 `status=done`，两个席位都真的用工具读了工作区的 `README.md`、`grep`、`glob` 后才作答（不是靠注入文本）。
- **断线修复**：此前在 6 模型评审中因 max-tokens/超时失败的 `bohrium/hy4`（Hunyuan 4）与 `bohrium/kimi-k3`（Kimi K3），现在纯模型模式各返回 239 / 238 字有效答案。
- **客户端 harness**：`node dev/verify-client.mjs` 覆盖入口/开关/回投三元/部分失败/全失败/防重入/选中文字桥接/工作区提示。

## 可靠性、安全与并发（v0.2 硬化）

- **终态只写一次**：`finishRun()` 是唯一终态入口；取消/超时/正常完成竞态下，迟到的阶段结果不会覆盖「已取消/已超时」；watchdog 与 cancel 都会 dispose 活跃席位。
- **并发上收到 Host**：每 provider 全局 4 并发槽（多聊天/多标签页不会放大）；429/5xx/超时/ECONN 等瞬态失败退避重试（最多 3 次）；`max-tokens` 无正文自动翻倍重试。
- **降级熔断 3**：每个 run 最多降级 3 席（超时/失败 → 纯模型）——刻意低于 `MAX_MODELS = 6`，因为连续多席失败通常意味着 provider 故障而非单席偶发，继续降级只会放大负载；触发熔断时整轮报错并注明原因。`seat.fallback/fallbackFrom` 与 `run.fallbacks/fallbackLimit` 可在快照里审计。
- **单会话单 run**：同一 `sessionId` 已有运行中的评审时，`POST /council/run` 返回 409 + 现有 runId，前端改为接回而不是再开一份。
- **运行注册表持久化**：写入 `${DSH_HOME:-~/.dsh}/council-runs.json`（最多 20 条，500ms 防抖）；Host 重启后仍能查到历史运行，重启前仍在跑的被标注为「Host 重启，运行中断」。
- **源码包（评审必读）**：问题含 `评审/审查/review/audit` 等意图时，除目录树与关键文档外，还会自动打包**真实源码**：最多 24 个源码文件、单文件 4k 字、总预算 `codeMaxChars`（默认 40k），路径全部标注；提示词要求结论必须引用具体文件、附件未覆盖的内容标注【推断】。快照新增 `codeState/codeFiles/codeChars` 与**覆盖率** `codeDiscovered/codeTruncated`（发现数 vs 附带数、截断数），UI 显示「已附带源码 N 个文件（X 字）」——**这是抽样初审，不是全项目审查**；附件头部自带覆盖率声明。
- **附件安全**：`@mention` 只解析到工作区内（拒绝 `..` 穿越）；路径附件拒绝符号链接、密钥类文件（`.env`/`.pem`/`.key`/`.ssh`/`.aws`/`.kube`/`id_rsa` 等）、二进制与 >1MB 文件；skill 只读加载、脚本不执行。
- **自动化回归**：`npm run verify` 现在同时跑 host 与 client harness（路径修复/穿越拒绝/密钥跳过/超时语义/并发窗口）。

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
- **输出预算**：作答/互评/主席各 16384 tokens、单次调用超时 300s；推理模型若把预算烧光且无正文，会自动用 32768 重试一次。仍有极小概率失败，属模型侧限制。
- 未做跨 profile / 卸载依赖 / 旧 DSH 版本的真实多环境验证。

## 安装

npm 上的发布版本为 **0.1.0**（dist-tags `latest` / `alpha`）；本仓库源码版本 **0.2.0** 尚未发布到 npm——发布 0.2.x 需要新的 granular token（旧的已吊销）。

```sh
# 从 npm
npx --yes @deepseek-ai/dsh@latest plugin --profile <name> add dsh-model-council@alpha

# 或从 GitHub Release 的 tarball
npx --yes @deepseek-ai/dsh@latest plugin --profile <name> add `
  https://github.com/sprw-li/dsh-model-council/releases/download/v0.1.0-alpha/dsh-model-council-0.1.0.tgz
```

安装或升级后刷新 DSH Web 页面；Host 半场可用插件行 disable → enable 重载。

## 开发与测试

```sh
npm run verify    # 离线客户端 harness：入口、开关、回投、部分失败、全失败、防重入、桥接
npm run syntax    # node --check 两个入口
```

CI：`.github/workflows/verify.yml`（文件已随目录保留；当前仓库 token 无 `workflow` scope 时 GitHub 会拒绝推送该文件，执行 `gh auth refresh -s workflow` 后 `git add .github/workflows/verify.yml && git push` 即可补上。本地等价的检查是 `npm run verify`）。

## 推送到 GitHub（本机沙箱的可用路径）

本机 `git.exe` 连不上 github.com（连接被重置），但 REST API 可用，所以用「API 增量推送」而不是 `git push`：

```powershell
$env:GITHUB_TOKEN = gh auth token
node <workspace>\tmp\push-council.mjs <本目录> sprw-li/dsh-model-council main
```

这个脚本只推送远端还没有的本地 commit，并且**用原始的 tree / parent / 作者与时间重建提交**，因此远端 SHA 与本地 SHA 完全相同——不会出现两条分叉历史。首次对齐用 `tmp\align-history.mjs`（重放整条链，SHA 不等就拒绝移动 ref）。

网络恢复后可直接改用原生 git：`git fetch origin && git reset --hard origin/main`（现在两端 commit 已一致，无需 reset）。

## 发布记录与后续

- GitHub：<https://github.com/sprw-li/dsh-model-council>，首个 release `v0.1.0-alpha`（pre-release，含可安装 tarball）。
- npm：<https://www.npmjs.com/package/dsh-model-council>（已发布 `0.1.0`；**0.2.0 未发布**——`0.0.0-stage` 是 npm staged publishing 的过渡占位版本，已 deprecate）。

发新版本：更新 `CHANGELOG.md` 与 `package.json` 版本 → `npm run verify` → commit/tag → `npm publish --tag alpha`（npm 新包首次发布会进入 staged 审核，通常几分钟内变为可安装）→ `npm pack` + `gh release create vX.Y.Z --prerelease --notes-file CHANGELOG.md <tarball>`。
