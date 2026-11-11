# CHECKPOINT — dsh-council 自我循环

**最后更新**：2026-11-12 01:40（Asia/Shanghai）
**仓库**：`D:\Documents\deepseek-harness\default-workspace\dsh-council`（package `dsh-model-council`）
**HEAD**：`626297af`（remote = local，MATCH=True）
**版本**：0.2.10 ／ host build `v40`

## 一句话状态

自我循环第一轮**收敛**：理事会终审从「不通过」翻为「**通过**」，四项 deadline 机制在附件中全部可指认且同源；验收门 19/19 + 真实验收问题 4/4 全绿。当前进入第二圈（客户端半 client.js 审查，首次被评审）。

## 循环记录

| 圈 | 版本 | 输入 | 产出 |
|---|---|---|---|
| 1 | 0.2.2 | 外部审计报告 | 附件 cwd 锚定、TRANSIENT_FAILURE 收紧、fallback 熔断、stopReason |
| 2 | 0.2.3 | 理事会「不通过」（证据口径） | 席位预算裁剪 deadline、工具超时缓冲、deadline 审计字段 |
| 3 | 0.2.4 | 验收门 a 条件 | `dev/verify-runtime.mjs` 真实 `callModel` 路径回归 |
| 4 | 0.2.5 | 复审不通过 | **REVIEW_INTENT 根因**（「验收」不触发源码包）、工具硬封顶、拒绝路径不静默回退 |
| 5 | 0.2.6 | 理事会长文缺口 | 关键区锚定采样（大文件实现区可见） |
| 6 | 0.2.7 | 单窗口只覆盖 1 簇 | 多簇采样（40 行容差聚类，top-6 按命中加权） |
| 7 | 0.2.8 | 函数体被份额截断 | 整函数保底（同缩进闭括号、变量命中不覆盖外层）、采样器验收门 |
| 8 | 0.2.9 | def 区被尾部 clamp 切掉 | 完整函数体区排序最前、永不尾切 |
| 9 | 0.2.9 | def 行落在簇区内被 `continue` 跳过 | def 窗口替换部分覆盖簇区、gate 同区正则、真实问题 hint 用例 |
| 10 | 0.2.10 | 终审**通过** | 三处席位裁剪统一现场 `remaining()`、gate 区内断言 |

## 终审结论（0.2.9, run 通过）

> 「**通过。** 功能同源、竞速封顶与可见终态/定时器清理均成立」

可指认要点：`runDeadlineOf` 唯一 deadline 公式（L156–158）；`callModel` 两处退避
`Math.min(800*(attempt+1), remaining())`（完整函数体区）；`callSeatSubagent` 三处席位裁剪；
`deadlineWall` 参与 `Promise.race` + `finishRun` 写终态 + `clearTimeout` 两处清理。
连续三轮零逻辑缺陷指认。

## 可执行验收（提交前必须 PASS）

```powershell
cd 'D:\Documents\deepseek-harness\default-workspace\dsh-council'
npm run syntax          # index.js + client.js 语法
npm run verify          # client + host + runtime + sampler 四个 harness
```

最近一次：`SYNTAX=0  VERIFY=0  sampler 19/19  real-question 4/4  chars=42112`

## 关键机制备忘

- **源码包**：`collectCodeContext` → `readCodeSegments`（hint 聚类 + 整函数保底）。
  整函数区标注「完整函数体」且排最前；主文件拿 55% 预算；`CODE_FILE_CHARS=10000`。
- **hot reload**：`plugin_manager set_plugin enabled false → true`（host 半）；client 半需刷新页面。
  `GET /council/` 返回的 `build` 字段可确认宿主实际加载的版本。
- **推送**：`git.exe` 连不上 github；用 `tmp/push-council.mjs`（REST 重放，SHA 保持）。
  `$env:GITHUB_TOKEN = gh auth token`，完成后比对 remote/main SHA == local HEAD。
- **勿在用户会话里跑测试 council**（污染聊天）：用带 `cwd` 的 subagent。

## 未做 / 后续

- npm 发布 0.2.x（需要新的 granular token；旧 token 已撤销）
- 客户端半审查（本圈进行中）
- 终审标【推断】的边界项：`finishRun` 内部幂等、墙胜出后 abort/dispose 在途调用、常量取值、
  reviews/chairman 阶段传参、`withProviderSlot` 排队是否受 deadline 裁剪
