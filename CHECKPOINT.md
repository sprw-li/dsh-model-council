# CHECKPOINT — dsh-council 自我循环

**最后更新**：2026-11-12 02:0x（Asia/Shanghai）
**仓库**：`D:\Documents\deepseek-harness\default-workspace\dsh-council`（package `dsh-model-council`）
**HEAD**：`e0e2d3e9`（remote = local 待推，v0.2.17）
**版本**：0.2.17 ／ host build `v47`

## 一句话状态

deadline 机制已**终审通过**；随后自检+客户端首审又捞出 5 个真缺陷并全部修复。
下一步：让理事会复审客户端半（需先确认工作区定版，且客户端改动刷新页面后才生效）。

## 循环记录

| 圈 | 版本 | 输入 | 产出 |
|---|---|---|---|
| 1 | 0.2.2 | 外部审计报告 | 附件 cwd 锚定、TRANSIENT_FAILURE 收紧、fallback 熔断、stopReason |
| 2 | 0.2.3 | 理事会「不通过」（证据口径） | 席位预算裁剪 deadline、工具超时缓冲、deadline 审计字段 |
| 3 | 0.2.4 | 验收门 a 条件 | `dev/verify-runtime.mjs` 真实 `callModel` 路径回归 |
| 4 | 0.2.5 | 复审不通过 | **REVIEW_INTENT 根因**（「验收」不触发源码包）、工具硬封顶、拒绝路径不静默回退 |
| 5 | 0.2.6 | 理事会长文缺口 | 关键区锚定采样（大文件实现区可见） |
| 6 | 0.2.7 | 单窗口只覆盖 1 簇 | 多簇采样（40 行容差聚类） |
| 7 | 0.2.8 | 函数体被份额截断 | 整函数保底 + 采样器验收门 |
| 8 | 0.2.9 | def 区被尾部 clamp 切掉 | 完整函数体区排序最前、永不尾切 |
| 9 | 0.2.9 | def 行落在簇区内被跳过 | def 窗口不再跳过、gate 同区正则、真实问题 hint 用例 |
| 10 | 0.2.10 | **终审通过** | 三处席位裁剪统一现场 `remaining()`、gate 区内断言 |
| 11 | 0.2.11 | 自检（终审标【推断】项） | **deadline 墙不释放资源**→ `terminateRun`（abort + dispose seats） |
| 12 | 0.2.12 | 客户端半首次评审 | 4 个 P0：双投递/409、leader 租约失效、轮询抖动丢 run、SSE 半开；+ 采样器假定义吞簇 |

## 可执行验收（提交前必须 PASS）

```powershell
cd 'D:\Documents\deepseek-harness\default-workspace\dsh-council'
npm run syntax          # index.js + client.js 语法
npm run verify          # client + host + runtime + sampler
```

最近一次：`SYNTAX=0  VERIFY=0`；sampler 19/19、真实 deadline 问题 4/4、客户端问题 4/4。

## 已知待办（下一圈候选）

- 客户端半复审（v0.2.12 定版后）；客户端改动需刷新页面才生效
- 验证者指出的剩余 P1/P2：`track()` 不查 retired、`useStore((s)=>s)` 全量订阅、
  `estimatedCalls` 把 silent 也算一次调用、`pagehide` 的 sendBeacon 返回值未处理、
  `CouncilTab` 空依赖 effect 读首帧快照、`startRun` 跨会话竞态
- 终审标【推断】的边界项：`finishRun` 内部幂等、reviews/chairman 阶段传参、
  `withProviderSlot` 排队是否受 deadline 裁剪
- npm 发布 0.2.x（需要新的 granular token；旧 token 已撤销）
