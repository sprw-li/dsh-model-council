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
| **结果回投**（三元） | 不做 | 运行结束后如何处置结论：<br>**不做** = 只留在右侧栏；<br>**静默注入** = 按 subagent 的 turn 边界语义 `send(msg, 'next-turn', false)`：结论排到**下一轮**，不唤醒主 Agent，也不会在当前 turn 中途插话；<br>**直接唤醒** = `followup()`（即 subagent parent 投递）：排一个普通后续 turn，立即让主 Agent 回复。 |
| **subagent 只读席位** | 开 | 每个委员是一个真正的只读子代理（`spawn` + `council-readonly` Agent Preset：只读文件、搜索、加载 skill、时间上下文，无写/编辑/执行工具），继承当前会话工作区 cwd，可以自己查证代码；关闭则退回纯模型调用。subagent 席位更慢，且会在子代理侧栏出现子会话。 |
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
| POST | `/council/run/<id>/cancel` | 中止全部在途调用 |

运行记录保存在宿主内存：30 分钟过期、最多 16 条，DSH 重启即丢。

## 工作区与结构（对齐 subagent / group / workflow）

council 不再只靠正则猜路径，而是按 Harness 自己的结构解析：

| 概念 | council 里的映射 |
| --- | --- |
| **工作区识别** | `SessionHeader.cwd`（权威）→ `ctx.workspaceRegistry.list()` 的 Workspace 实体（id/name/path/sessionIds）→ `process.cwd()` 兜底；`GET /council/workspace` 暴露给 UI，tab 里显示「当前会话工作区」。 |
| **subagent 参与者** | 每个席位 `{ provider, model }`（等价 subagent 的 `agentOptions`）；默认以只读 Agent Preset 从 spawn 后端起一个真正的子代理（带工作区 cwd），结果回投沿用 subagent 的 `next-turn`/`wake` 投递语义，而不是另造一套。 |
| **group 角色组** | `structure.roles = { answerers, reviewers, arbiter }`；`POST /council/run` 可传 `reviewers` 子集（缺省=全部作答模型），arbiter 即主席。 |
| **workflow 阶段** | `structure.stages = ['answers','reviews','synthesize']`（无主席时省略末段），每个阶段对一组角色执行，快照 `structure` 即节点图。 |

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

## 已知限制

- `ctx.agents.get(sessionId).session.snapshotEvents()` 是 DSH 内部接口，已用 try/catch 降级为“只发问题”，UI 会标注「上下文读取失败」；升级 DSH 后请重新验证。
- 左键选中的浮动条由内置 `quote` 交互独占（先注册先赢），理事会条目依赖 quick-quote 的渲染器；未装 quick-quote 时只留右键菜单。
- 「结果回投」的**直接唤醒**会让主 Agent 立即回复（有意行为）；**静默注入**与 subagent 的投递边界一致：`send(msg, 'next-turn', false)` 只排队、不唤醒，结论在**下一轮用户消息**的 turn 边界进入上下文，不会打断当前 turn。
- 上下文只取可见文本，不含工具调用与附件；路径附件只读文本类文件（1 MB 内），不读二进制、不跟随符号链接。
- **运行中可停止**：运行中显示「停止」按钮；页面刷新/重新打开后会自动从 `GET /council/runs` 接回正在跑的 run（仍可点停止）。直接关闭浏览器窗口/标签页时，client 用 `navigator.sendBeacon` 通知 host 取消当前 run（`pagehide`），不会把后台运行留在无人看管状态。**关闭右侧栏 tab 不终止运行**（设计如此：重开 tab 可接回），要终止请点「停止」或关闭页面。
- **subagent 席位只在作答阶段**：互评与主席走快速纯模型通道，避免 6 席 × 多阶段各开一整轮子代理导致假死；单席有启动 60s / 执行 240s 上限，超时或失败自动降级纯模型（卡片标「完成（降级）」），整轮另有 30 分钟 watchdog。卡片在运行中显示「启动中/运行中 Ns」。
- **subagent 模式下路径附件默认关闭**：委员自己用只读工具读工作区，避免重复注入 20k 字；如需同时注入，走 API 显式传 `attachFiles: true`。
- **subagent 席位较慢**：每席是一轮完整子代理（带工具），比纯模型调用慢数倍；子会话会出现在子代理侧栏。`council-readonly` preset 依赖 DSH 的 `dsh-persona`/`dsh-tool-fs`/`dsh-tool-fs-search`/`dsh-skill-filesystem`/`dsh-tool-skill` 模块名，升级 DSH 后若改名会注册失败并自动退回纯模型模式（UI 会提示）。
- **输出预算**：作答/互评/主席各 16384 tokens、单次调用超时 300s；推理模型若把预算烧光且无正文，会自动用 32768 重试一次。仍有极小概率失败，属模型侧限制。
- 未做跨 profile / 卸载依赖 / 旧 DSH 版本的真实多环境验证。

## 安装

已发布到 npm：<https://www.npmjs.com/package/dsh-model-council>（dist-tags `latest` / `alpha` = `0.1.0`）。

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

## 发布记录与后续

- GitHub：<https://github.com/sprw-li/dsh-model-council>，首个 release `v0.1.0-alpha`（pre-release，含可安装 tarball）。
- npm：<https://www.npmjs.com/package/dsh-model-council>（`latest` / `alpha` = `0.1.0`；`0.0.0-stage` 是 npm staged publishing 的过渡占位版本，已 deprecate）。

发新版本：更新 `CHANGELOG.md` 与 `package.json` 版本 → `npm run verify` → commit/tag → `npm publish --tag alpha`（npm 新包首次发布会进入 staged 审核，通常几分钟内变为可安装）→ `npm pack` + `gh release create vX.Y.Z --prerelease --notes-file CHANGELOG.md <tarball>`。
