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

const code = await collectCodeContext([ROOT], 40000, HINTS)
const block = code.text.slice(code.text.indexOf('index.js'))
/* Every function the acceptance question names must appear as a labeled
   whole-function region — not merely "at least one label exists" (the
   council flagged that weaker check as a coverage hole). */
const labeled = (block.match(/完整函数体/g) || []).length
/* Whole-function regions: the labeled header and the function definition
   must be in the SAME region (a label elsewhere in the pack must not
   satisfy a wholeFn check — the council flagged that cross-region match). */
const wholeFor = {
  callModel: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*async function callModel/,
  callSeatSubagent: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*(\/\*\*[\s\S]{0,400}?)?\s*async function callSeatSubagent/,
  runDeadlineOf: /关键区（第 \d+–\d+ 行，完整函数体） ---\n\s*(\/\*\*[\s\S]{0,300}?)?\s*(export )?function runDeadlineOf/,
  deadlineWall: /关键区（第 \d+–\d+ 行，完整函数体）[\s\S]{0,600}?Promise\.race\(\[execute\(run, routes\), deadlineWall\]\)/,
}
let wholePass = 0
for (const [name, pattern] of Object.entries(wholeFor)) {
  const ok = pattern.test(block)
  if (ok) wholePass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  wholeFn(${name})`)
}
const labelOk = labeled >= 3
console.log(`${labelOk ? 'PASS' : 'MISS'}  wholeFunctionLabels(${labeled})`)
let pass = wholePass + (labelOk ? 1 : 0)
for (const [name, literal] of Object.entries(MUST)) {
  const ok = block.includes(literal)
  if (ok) pass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  ${name}`)
}
const total = Object.keys(MUST).length + Object.keys(wholeFor).length + 1
console.log(`\n${pass}/${total} covered | chars=${code.chars}`)

/* D-(iii): re-run the sampler with the REAL acceptance question's hint set —
   different cluster geometry once hid callModel's def behind the
   continue-on-overlap bug while the synthetic hints passed 11/11. */
const realQuestionHints = ['deadline', 'v38', 'callmodel', 'callseatsubagent', 'rundeadlineof', 'deadlinewall', 'deadlineat', 'remaining']
const realPack = await collectCodeContext([ROOT], 40000, realQuestionHints)
const realBlock = realPack.text.slice(realPack.text.indexOf('index.js'))
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
console.log(`real-question pack: ${realPass}/${Object.keys(realChecks).length} | chars=${realPack.chars}`)
process.exit(pass === total && realPass === Object.keys(realChecks).length ? 0 : 1)
