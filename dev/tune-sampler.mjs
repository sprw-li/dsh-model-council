/**
 * Sampler coverage gate: asserts the source pack for an acceptance-style
 * question contains ALL deadline implementation identifiers (function
 * definitions, clamp expressions, the hard wall) in the index.js block.
 * This is the executable acceptance criterion for the sampling work: a
 * reviewer must be able to see every mechanism the question names.
 *
 * Usage: node dev/tune-sampler.mjs   (exit 0 = fully covered)
 */
import { collectCodeContext } from '../index.js'

const ROOT = 'D:\\Documents\\deepseek-harness\\default-workspace\\dsh-council'
const HINTS = ['deadline', 'callmodel', 'attempttimeout', 'callseatsubagent', 'deadlinewall', 'rundeadlineof']

const MUST = {
  backoffClamp: '800 * (attempt + 1), remaining',
  attemptTimeout: 'attemptTimeout',
  callModelDef: 'async function callModel',
  callSeatDef: 'async function callSeatSubagent',
  seatClampStart: 'Math.min(SEAT_START_TIMEOUT_MS, remaining())',
  seatClampResult: 'Math.min(SEAT_RESULT_TIMEOUT_MS, remaining())',
  deadlineWall: 'Promise.race([execute(run, routes), deadlineWall])',
  zeroBudget: 'if (left <= 0)',
  fullClamp: 'Math.min(CALL_TIMEOUT_MS, left)',
  runDeadlineFormula: 'return run.createdAt + RUN_TIMEOUT_MS',
}

/**
 * Extract one file's block from a pack by its exact header. `indexOf('x.js')`
 * is NOT safe: it can land inside another file's text (or inside this gate's
 * own source, which the pack may also contain), making the assertion
 * self-proving. Anchor on the `--- <path> ---` header and stop at the next one.
 */
function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function blockOf(packText, fileName) {
  /* Files in this repo are CRLF; normalize so line matching works. */
  const text = String(packText || '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  /* A file header is a PATH line. The pack also contains `--- 头部 ---` and
     `--- 关键区（第 … 行） ---` markers, so stopping at "the next --- line"
     returned only the header itself (147 chars) and silently disabled every
     assertion. Match a real path header and stop at the next one. */
  const isFileHeader = (line) => /^--- .*[\\/].* ---$/.test(line) && !/^--- 关键区/.test(line)
  const start = lines.findIndex((line) => isFileHeader(line) && line.endsWith('/' + fileName + ' ---'))
  if (start === -1) {
    const fallback = lines.findIndex((line) => isFileHeader(line) && line.includes(fileName + ' ---'))
    if (fallback === -1) return ''
    const next = lines.findIndex((line, index) => index > fallback && isFileHeader(line))
    return lines.slice(fallback, next === -1 ? lines.length : next).join('\n')
  }
  const next = lines.findIndex((line, index) => index > start && isFileHeader(line))
  return lines.slice(start, next === -1 ? lines.length : next).join('\n')
}

const code = await collectCodeContext([ROOT], 60000, HINTS)
const block = blockOf(code.text, 'index.js')
/* Every function the acceptance question names must appear as a labeled
   whole-function region — not merely "at least one label exists" (the
   council flagged that weaker check as a coverage hole). */
const labeled = (block.match(/完整函数体/g) || []).length
/* Whole-function regions: the labeled header and the function definition
   must be in the SAME region (a label elsewhere in the pack must not
   satisfy a wholeFn check — the council flagged that cross-region match). */
const wholeFor = {
  callModel: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*async function callModel/.test(block),
  callSeatSubagent: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*(\/\*\*[\s\S]{0,400}?)?\s*async function callSeatSubagent/.test(block),
  runDeadlineOf: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*(\/\*\*[\s\S]{0,300}?)?\s*(export )?function runDeadlineOf/.test(block),
  /* The wall is inline code inside the tool handler, not a function of its
     own: assert the whole sequence is readable rather than pinning a region
     header's distance to it. */
  deadlineWallBlock: [
    'const left = runDeadlineOf(run) - Date.now()',
    'Promise.race([execute(run, routes), deadlineWall])',
    "terminateRun(run, '整轮预算耗尽')",
    'clearTimeout(run.deadlineTimer)',
  ].every((fragment) => block.includes(fragment)),
}
let wholePass = 0
for (const [name, ok] of Object.entries(wholeFor)) {
  if (ok) wholePass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  wholeFn(${name})`)
}
const labelOk = labeled >= 3
console.log(`${labelOk ? 'PASS' : 'MISS'}  wholeFunctionLabels(${labeled})`)
let pass = wholePass + (labelOk ? 1 : 0)

/* Region-scoped assertion: the three seat clamps must all sit INSIDE the
   callSeatSubagent whole-function region. Checking the literals anywhere in
   the pack let a truncated fragment pass while the body was cut. */
function wholeRegion(headerRe) {
  const match = headerRe.exec(block)
  if (match === null) return undefined
  const start = match.index
  const next = block.indexOf('\n--- 关键区（', start + 10)
  return block.slice(start, next === -1 ? block.length : next)
}
const seatRegion = wholeRegion(/关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*(\/\*\*[\s\S]{0,400}?)?\s*async function callSeatSubagent/)
const seatClampsInRegion = seatRegion === undefined ? {
  seatZeroGuard: false, seatCombined: false, seatStart: false, seatResult: false,
} : {
  seatZeroGuard: seatRegion.includes('整轮预算耗尽，不再启动席位'),
  seatCombined: seatRegion.includes('AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining()))'),
  seatStart: seatRegion.includes('Math.min(SEAT_START_TIMEOUT_MS, remaining())'),
  seatResult: seatRegion.includes('Math.min(SEAT_RESULT_TIMEOUT_MS, remaining())'),
}
for (const [name, ok] of Object.entries(seatClampsInRegion)) {
  if (ok) pass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  inRegion(${name})`)
}

for (const [name, literal] of Object.entries(MUST)) {
  const ok = block.includes(literal)
  if (ok) pass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  ${name}`)
}
const total = Object.keys(MUST).length + Object.keys(wholeFor).length + 1 + Object.keys(seatClampsInRegion).length
console.log(`\n${pass}/${total} covered | chars=${code.chars}`)

/* Re-run the sampler with the hint set derived from the REAL acceptance
   question — hand-picked hints are not the same geometry the host produces,
   and that difference hid callModel's definition once. */
const REVIEW_QUESTION = '客户端半复审（v0.2.12 定版）。请在附件源码中逐条核验以下修复是否真实成立，并给出结论「通过 / 不通过 / 有条件通过」：'
  + '(1) CouncilBridge 不再条件式调用 Hook（拆成 WithInput/Static 两个组件类型），且 draftBridge 写入移入 useEffect 而非渲染期；'
  + '(2) resumeRun 受 leader 门禁，且把 409「该结果已回投过」视为成功而非错误；'
  + '(3) leader 选举用 myClaimAt/leaderSeenAt 比较，续租周期 < 租约期，且旧 BroadcastChannel 会被 close；'
  + '(4) pollRun 单次失败不再把 running 置 false、不丢弃 runId，按指数退避重试；'
  + '(5) watchRun 有 STREAM_STALL_MS 看门狗处理 SSE 半开；'
  + '(6) switchSession 在切换时停掉旧的轮询与 EventSource。'

/** Same derivation the host uses, so the gate cannot drift from production. */
function hintsOf(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'code', 'review', 'project', 'please', 'audit', 'into', 'your', 'docs', 'test', 'file', 'files'])
  const hints = []
  for (const token of String(text || '').split(/[^A-Za-z0-9_.\-]+/)) {
    const value = token.toLowerCase()
    if (value.length < 3 || stop.has(value)) continue
    if (!hints.includes(value)) hints.push(value)
  }
  for (const match of String(text || '').matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
    const value = match[0].toLowerCase()
    if (value.length >= 6 && !hints.includes(value)) hints.push(value)
  }
  return hints
}

const DEADLINE_QUESTION = '终审验收 deadline 机制。附件应含标注「完整函数体」的区域：callModel（含退避裁剪 800*(attempt+1) 与 remaining() 同源）、'
  + 'callSeatSubagent（含三处席位预算裁剪）、runDeadlineOf、deadlineWall 硬封顶。请逐项核对并判定通过 / 不通过。'

const deadlineHints = hintsOf(DEADLINE_QUESTION)
const realPack = await collectCodeContext([ROOT], 60000, deadlineHints)
const realBlock = blockOf(realPack.text, 'index.js')
const realChecks = {
  realCallModelWhole: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*async function callModel/.test(realBlock),
  realSeatClamps: realBlock.includes('Math.min(SEAT_START_TIMEOUT_MS, remaining())')
    && realBlock.includes('Math.min(SEAT_RESULT_TIMEOUT_MS, remaining())'),
  realBackoff: realBlock.includes('800 * (attempt + 1), remaining'),
  realWall: realBlock.includes('Promise.race([execute(run, routes), deadlineWall])'),
}
let realPass = 0
for (const [name, ok] of Object.entries(realChecks)) {
  if (ok) realPass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  ${name}`)
}
console.log(`deadline-question pack: ${realPass}/${Object.keys(realChecks).length} | chars=${realPack.chars}`)

/* Client question: EVERY mechanism it names must be readable, not just
   "client.js appears somewhere" — the leader lease was once cut mid-region. */
const clientQuestionHints = hintsOf('客户端半 client.js 复审：核验 CouncilBridge Hook 拆分、resumeRun 的 leader 门禁与 409、'
  + 'leader 选举租约与 BroadcastChannel 关闭、pollRun 退避重试、watchRun 的 SSE 半开看门狗、switchSession 停旧连接。')
const clientPack = await collectCodeContext([ROOT], 60000, clientQuestionHints)
const clientBlock = blockOf(clientPack.text, 'client.js')
const clientChecks = {
  clientSSE: clientBlock.includes('new window.EventSource('),
  /* Behavioral marker: the watchdog may be inlined or named, so accept the
     constant or the helper. A gate that pins one identifier is brittle. */
  clientStall: clientBlock.includes('STREAM_STALL_MS') || clientBlock.includes('armStreamWatchdog'),
  clientLeaderLease: clientBlock.includes('myClaimAt') && clientBlock.includes('leaderSeenAt'),
  clientLeaderClose: clientBlock.includes('closeLeaderChannel'),
  clientLeaderChannel: clientBlock.includes('BroadcastChannel(`dsh-council-'),
  clientRetry: clientBlock.includes('schedulePollRetry'),
  clientHookSplit: clientBlock.includes('CouncilBridgeWithInput') && clientBlock.includes('CouncilBridgeStatic'),
  clientResume: clientBlock.includes('isPollLeader() !== true') && clientBlock.includes('already-resumed'),
  clientCoverage: clientBlock.length > 12000,
}
let clientPass = 0
for (const [name, ok] of Object.entries(clientChecks)) {
  if (ok) clientPass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  ${name}`)
}
console.log(`client-question pack: ${clientPass}/${Object.keys(clientChecks).length} | chars=${clientBlock.length}`)

const everythingGreen = pass === total
  && realPass === Object.keys(realChecks).length
  && clientPass === Object.keys(clientChecks).length
process.exit(everythingGreen ? 0 : 1)
