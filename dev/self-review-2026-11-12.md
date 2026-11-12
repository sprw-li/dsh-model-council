# 自审记录 — dsh-council 自我循环（12:4x）

本轮（0.2.26）自审结论：**未发现未解决的缺陷**（NO_DEFECTS）。

## 已收敛的两个半区

Host 半：理事会终审 0.2.10 **通过**（runId 见 CHANGELOG）。四项 deadline 机制可指认且同源：
- index.js:156-158 `runDeadlineOf` 唯一公式
- index.js:1142-1246 `callModel` 两处退避 `Math.min(800 * (attempt + 1), remaining())`
- index.js:1449-1518 `callSeatSubagent` 三处席位裁剪
- index.js:1917-1930 `deadlineWall` + `terminateRun` 清理终态与定时器

Client 半：理事会签发 0.2.25 **通过**（runId cmwd1evxwicvds）。六项机制全部可指认：
- client.js:644-653 `releaseOnPageHide` 不取消运行
- client.js:798-837 两个调度器自身拒绝非 leader
- client.js:1040-1045 `openCouncilTab` 先 switchSession 再 publish question
- client.js:954-988 `resumeRun` token 仅在成功后写入
- client.js:1186-1225 `CouncilBridge` 组件类型分流 + 三个 effect 写入点
- client.js:1562-1576 `track()` 退役后立即 dispose

## 本轮修复（复审遗留 P2）

- client.js:644-668 `pageshow` 恢复：重建选举 + 重接 run（此前 bfcache 返回会冻结面板）
- client.js:1318-1323 `estimatedCalls` 不再把交付计入模型调用
- client.js:352-386 `useStore` 浅比较门控，避免无关 publish 触发整树重渲染

## 可执行验收

`npm run syntax` → exit 0
`npm run verify` → exit 0（client + host + runtime + sampler；sampler 19/19、deadline 问题 4/4、client 问题 9/9）
`remote/main == local HEAD` → True（981fae9f）

## 剩余（非缺陷，属发布/边界）

- npm 发布需要新的 granular token（旧 token 已撤销）
- 终审标【推断】的附件外边界：`finishRun` 内部幂等、reviews/chairman 传参、`withProviderSlot` 排队裁剪
- 成本：单次评审源码附件最大 12 万字，可用 profile `codeMaxChars` 调小
