# CHECKPOINT — dsh-council 自我循环

**最后更新**：2026-11-12 12:30（Asia/Shanghai）
**仓库**：`D:\Documents\deepseek-harness\default-workspace\dsh-council`（package `dsh-model-council`）
**HEAD**：`03cc0b5a`（0.2.25，remote = local，MATCH=True，tree clean）
**版本**：0.2.25 ／ host build `v55`
**Web GUI**：`http://127.0.0.1:55736`

## 一句话状态

**两个半区都已通过理事会签发。**

- Host 半（`index.js` deadline 机制）：0.2.10 终审**通过**（四项机制同源、竞速封顶、终态清理）。
- Client 半（`client.js`）：0.2.25 签发**通过**（六项机制全部可指认，无 P0/P1，runId `cmwd1evxwicvds`）。

## 循环记录（13 圈）

| 圈 | 版本 | 输入 | 产出 |
|---|---|---|---|
| 1 | 0.2.2 | 外部审计报告 | 附件 cwd 锚定、TRANSIENT_FAILURE 收紧、fallback 熔断、stopReason |
| 2 | 0.2.3 | 理事会「不通过」（证据口径） | 席位预算裁剪 deadline、工具超时缓冲、deadline 审计字段 |
| 3 | 0.2.4 | 验收门 a 条件 | `dev/verify-runtime.mjs` 真实 `callModel` 路径回归 |
| 4 | 0.2.5 | 复审不通过 | **REVIEW_INTENT 根因**（「验收」不触发源码包）、工具硬封顶、不静默回退 |
| 5 | 0.2.6 | 理事会长文缺口 | 关键区锚定采样（大文件实现区可见） |
| 6 | 0.2.7 | 单窗口只覆盖 1 簇 | 多簇采样（40 行容差聚类） |
| 7 | 0.2.8 | 函数体被份额截断 | 整函数保底 + 采样器验收门 |
| 8 | 0.2.9 | def 区被尾部 clamp 切掉 | 完整函数体区排序最前、永不尾切 |
| 9 | 0.2.9 | def 行落在簇区内被跳过 | def 窗口不再跳过、gate 同区正则、真实问题 hint 用例 |
| 10 | 0.2.10 | **host 终审通过** | 三处席位裁剪统一现场 `remaining()`、gate 区内断言 |
| 11 | 0.2.11 | 自检（终审标【推断】项） | **deadline 墙不释放资源** → `terminateRun`（abort + dispose seats） |
| 12 | 0.2.12 | 客户端半首次评审 | 4 个 P0：双投递/409、leader 租约失效、轮询抖动丢 run、SSE 半开；采样器假定义吞簇 |
| 13 | 0.2.13–0.2.17 | 客户端复审多轮 | follower 轮询死循环、跨会话串 run、放弃后接不回、token 记账时机、EventSource catch 门禁 |
| 14 | 0.2.18 | 签发复审判出 P0 | **pagehide 取消运行**与「刷新后接回」契约冲突 → `releaseOnPageHide` |
| 15 | 0.2.19 | 「附件为空」根因 | 问题里的 `/cancel` 被当作路径候选，抑制了工作区兜底 |
| 16 | 0.2.20 | 附件选错项目 | 目录遍历改为**命中关键词者优先** |
| 17 | 0.2.21 | 全称命题卡门 | `schedulePoll`/`schedulePollRetry` 自身拒绝非 leader（局部不变量） |
| 18 | 0.2.22 | 点名目录被 callerCwd 抢先 | 顺序改为 点名目录 → callerCwd → workspace；关键文档头+尾采样 |
| 19 | 0.2.23 | 宽簇挤掉精确证据 | 区域排序：整函数体 → 点名符号窗口 → 关键词簇 |
| 20 | 0.2.24 | 同名子串抢占 | `schedulePollRetry` 含 `schedulePoll`，窗口被抢 → 长标识符遮挡则跳过 |
| 21 | 0.2.25 | **六项无法同时可见** | `CODE_MAX_CHARS` 60k→**120k**，主文件份额 0.8 → 签发**通过** |

## 可执行验收（提交前必须 PASS）

```powershell
cd 'D:\Documents\deepseek-harness\default-workspace\dsh-council'
npm run syntax          # index.js + client.js 语法
npm run verify          # client + host + runtime + sampler 四个 harness
```

最近一次：`SYNTAX=0  VERIFY=0`；sampler 19/19、deadline 问题 4/4、客户端问题 9/9。

## 关键机制备忘

- **源码包**：`collectCodeContext` → `collectSourceFiles`（命中关键词的目录优先）→ `readCodeSegments`
  （整函数体 → 点名符号窗口 → 关键词簇，依次排序，尾部裁剪先切宽簇）。
  预算：`CODE_MAX_CHARS=120000`、主文件 80%、`CODE_FILE_CHARS=12000`；关键文档头 55%+尾 45%。
- **触发条件**：`wantsSourcePack()` = 评审词 **或** `CODE_MENTION`（文件名/扩展名/源码/函数/实现/行号）。
- **hot reload**：`plugin_manager set_plugin enabled false → true`；`GET /council/` 的 `build` 字段确认版本。
  客户端改动需刷新页面（Ctrl+R）。
- **推送**：`git.exe` 连不上 github，用 `tmp/push-council.mjs`（REST 重放，SHA 保持）。
  完成后比对 `remote/main == local HEAD`。

## 已知待办

- npm 发布 0.2.x（需要新的 granular token；旧 token 已撤销）
- 终审标【推断】的边界项：`finishRun` 内部幂等、reviews/chairman 阶段传参、
  `withProviderSlot` 排队是否受 deadline 裁剪
- 复审遗留 P2：`useStore((s)=>s)` 全量订阅、`pageshow/bfcache` 恢复、`estimatedCalls` 把 silent 计一次
- 成本：单次评审附件最大 12 万字；需要省 token 时用 profile 配置 `codeMaxChars` 调小
