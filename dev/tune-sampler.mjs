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
let pass = 0
for (const [name, literal] of Object.entries(MUST)) {
  const ok = block.includes(literal)
  if (ok) pass += 1
  console.log(`${ok ? 'PASS' : 'MISS'}  ${name}`)
}
/* The pack must also LABEL the whole-function regions, so a reviewer knows
   which regions are complete bodies rather than sampled fragments. */
const labeled = (block.match(/完整函数体/g) || []).length
console.log(`${labeled > 0 ? 'PASS' : 'MISS'}  wholeFunctionLabels(${labeled})`)
if (labeled > 0) pass += 1
const total = Object.keys(MUST).length + 1
console.log(`\n${pass}/${total} covered | chars=${code.chars}`)
process.exit(pass === total ? 0 : 1)
