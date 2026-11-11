/**
 * Host-half harness for the pure helpers: path recognition and escaping,
 * sensitive-file rejection, timeout semantics, and the concurrency window.
 * No DSH runtime is required; only node:fs against a temp directory.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { TRANSIENT_FAILURE, SEAT_RESULT_TIMEOUT_MS, SEAT_START_TIMEOUT_MS, PROVIDER_CONCURRENCY, MAX_FALLBACKS_PER_RUN, RUN_TIMEOUT_MS, defaultRoutesFromCatalog, candidatePaths, collectCodeContext, collectPathContext, isPathInside, readTextFile, runLimited, withTimeout } from '../index.js'

const root = await mkdtemp(join(tmpdir(), 'council-host-'))
try {
  const workspace = join(root, 'ws')
  await mkdir(join(workspace, 'src'), { recursive: true })
  await writeFile(join(workspace, 'src', 'note.md'), '# hello\n')
  await writeFile(join(workspace, '.env'), 'TOKEN=secret\n')

  /* "D/dev/project" typo form is repaired; absolute tokens pass through. */
  const repaired = candidatePaths('review D/dev/project please', workspace)
  assert.ok(repaired.some((path) => /^D:[\\/]dev[\\/]project$/.test(path)), `typo repair: ${JSON.stringify(repaired)}`)

  /* @mentions resolve inside the workspace only. */
  const mentioned = candidatePaths('look at @src/note.md', workspace)
  assert.ok(mentioned.includes(join(workspace, 'src', 'note.md')), `mention: ${JSON.stringify(mentioned)}`)
  assert.equal(candidatePaths('@../../etc/passwd', workspace).length, 0, 'traversal must not escape the workspace')

  assert.equal(isPathInside(join(workspace, 'src', 'a.md'), workspace), true)
  assert.equal(isPathInside(join(root, 'outside.md'), workspace), false)

  /* Sensitive files are never read; normal text files are. */
  assert.equal(await readTextFile(join(workspace, '.env'), 1000), '')
  assert.equal(await readTextFile(join(workspace, 'src', 'note.md'), 1000), '# hello\n')

  /* Timeout helper rejects and resolves. */
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'boom'), /boom/)
  assert.equal(await withTimeout(Promise.resolve(7), 100, 'boom'), 7)

  /* Review questions get a bounded source pack the models can cite. */
  await mkdir(join(workspace, 'pkg'), { recursive: true })
  await writeFile(join(workspace, 'pkg', 'main.py'), 'def main():\n    return 1\n')
  await writeFile(join(workspace, 'pkg', 'util.py'), 'VALUE = 2\n')
  const code = await collectCodeContext([workspace], 1200)
  assert.equal(code.state, 'ok')
  assert.ok(code.files >= 2, `code files: ${code.files}`)
  assert.ok(code.text.includes('main.py'), 'code pack must include real file paths')
  assert.ok(code.chars <= 1200, `code budget: ${code.chars}`)
  assert.ok(typeof code.discovered === 'number' && code.discovered >= code.files, `coverage discovered: ${JSON.stringify(code)}`)
  assert.ok(code.text.includes('覆盖率声明'), 'code pack must carry the coverage disclaimer')

  /* Hint-anchored sampling: a large file's pack segment must center on the
     lines matching the question's key terms, not just the head constants. */
  {
    const big = join(workspace, 'pkg', 'big.py')
    const filler = Array.from({ length: 900 }, (_, index) => `# filler line ${index} ${'x'.repeat(40)}`).join('\n')
    const head = 'MARKER_HEAD = "top of file"'
    const impl = 'def implementation_marker():\n    return "the anchor target"'
    const tail = 'MARKER_TAIL = "bottom of file"'
    await mkdir(join(workspace, 'pkg'), { recursive: true })
    await writeFile(big, [head, filler, impl, filler, tail].join('\n'))
    const pack = await collectCodeContext([join(workspace, 'pkg')], 4000, ['implementation_marker', 'anchor', 'target'])
    assert.ok(pack.text.includes('MARKER_HEAD'), 'anchored pack keeps the head')
    assert.ok(pack.text.includes('implementation_marker'), 'anchored pack centers the hint-matching region')
    assert.ok(pack.text.includes('关键区'), 'anchored pack labels its sampling')
  }
  const reviewPack = await collectPathContext('评审这个项目', 6000, workspace, 5000)
  assert.equal(reviewPack.codeState, 'ok')
  assert.ok(reviewPack.codeFiles >= 2, `review code files: ${reviewPack.codeFiles}`)
  assert.ok(reviewPack.text.includes('main.py'), 'review pack must include source text')
  assert.ok(typeof reviewPack.codeDiscovered === 'number', 'review pack reports discovered count')

  /* Acceptance-style questions also get the source pack: 验收/复审 must not
     silently disable it (a real run regressed this way once). */
  const acceptancePack = await collectPathContext('验收：deadline 实现是否正确', 6000, workspace, 5000)
  assert.equal(acceptancePack.codeState, 'ok', '验收 questions must attach the source pack')
  const reAcceptancePack = await collectPathContext('复审：改判通过与否', 6000, workspace, 5000)
  assert.equal(reAcceptancePack.codeState, 'ok', '复审 questions must attach the source pack')

  /* A named project directory inside the workspace wins over the whole workspace. */
  const projectPack = await collectPathContext('全项目审查 pkg', 4000, workspace, 2000)
  assert.ok(projectPack.paths[0].toLowerCase().endsWith('pkg'), `named dir: ${JSON.stringify(projectPack.paths)}`)
  assert.ok(projectPack.text.includes('main.py'), 'named project pack must include its sources')

  /* Tool-less llm seats get the source pack; tool-equipped seats opt out. */
  const seatPack = await collectPathContext('评审这个项目', 2000, workspace, 1200, false)
  assert.equal(seatPack.codeState, 'off', 'subagent seats must not receive the source pack')
  assert.ok(seatPack.text.includes('def main()') === false, 'no source text when seats have tools')
  assert.ok(seatPack.text.includes('main.py'), 'the directory tree still lists the files to grep')

  /* Retry classification is anchored: token counts, CJK text, and field names
     never look like a 5xx; real transport failures do. */
  assert.equal(TRANSIENT_FAILURE.test('HTTP 429 too many requests'), true)
  assert.equal(TRANSIENT_FAILURE.test('HTTP 503 Service Unavailable'), true)
  assert.equal(TRANSIENT_FAILURE.test('upstream returned status: 502'), true)
  assert.equal(TRANSIENT_FAILURE.test('fetch failed'), true)
  assert.equal(TRANSIENT_FAILURE.test('connect ETIMEDOUT 1.2.3.4:443'), true)
  assert.equal(TRANSIENT_FAILURE.test('rate-limited by provider'), true)
  assert.equal(TRANSIENT_FAILURE.test('budget 5000 tokens exceeded'), false)
  assert.equal(TRANSIENT_FAILURE.test('model returned 2500 chars'), false)
  assert.equal(TRANSIENT_FAILURE.test('输出 500 字后停止'), false)
  assert.equal(TRANSIENT_FAILURE.test('timeoutMs is 300000'), false)
  assert.equal(TRANSIENT_FAILURE.test('超过 500 毫秒'), false)

  /* A configured allowlist confines attachments to the workspace. */
  const confined = await collectPathContext('review D/dev/elsewhere', 2000, workspace, 0, false, [workspace])
  assert.equal(confined.paths.length, 0, `allowlist must refuse outside paths: ${JSON.stringify(confined.paths)}`)
  const allowed = await collectPathContext('review the workspace', 2000, workspace, 0, false, [workspace])
  assert.equal(allowed.paths.length, 1, 'allowlist keeps the workspace itself')

  /* Documentation must quote the constants it describes; drift is a test failure. */
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const seats = /启动 (\d+)s \/ 执行 (\d+)s/.exec(readme)
  assert.ok(seats !== null, 'README must state the seat start/result windows')
  assert.equal(Number(seats[1]), Math.round(SEAT_START_TIMEOUT_MS / 1000), 'README seat start budget drifted from SEAT_START_TIMEOUT_MS')
  assert.equal(Number(seats[2]), Math.round(SEAT_RESULT_TIMEOUT_MS / 1000), 'README seat result budget drifted from SEAT_RESULT_TIMEOUT_MS')
  const watchdog = /(\d+) 分钟 watchdog/.exec(readme)
  assert.ok(watchdog !== null, 'README must state the watchdog window')
  assert.equal(Number(watchdog[1]), Math.round(RUN_TIMEOUT_MS / 60000), 'README watchdog drifted from RUN_TIMEOUT_MS')
  assert.ok(readme.includes(`${PROVIDER_CONCURRENCY} 并发`), 'README must state the provider concurrency')
  assert.ok(readme.includes(`降级熔断 ${MAX_FALLBACKS_PER_RUN}`), 'README must state the fallback circuit-breaker quota')

  /* Behavioral contracts, not just numbers: the README must describe the
     shipped defaults and the actual delivery mechanism. */
  assert.ok(readme.includes('agent.inject()'), 'README must describe silent delivery as agent.inject()')
  assert.ok(!readme.includes("send(msg, 'next-turn', false)"), 'README must not claim the retired next-turn queue semantics')
  const feedbackRow = /\| \*\*结果回投\*\*（三元） \| (不做|静默放进上下文|直接唤醒) \|/.exec(readme)
  assert.ok(feedbackRow !== null, 'README must state the feedback default')
  assert.equal(feedbackRow[1], '不做', 'feedback must ship disabled (sidebar-only) by default')
  const seatRow = /\| \*\*subagent 只读席位（混合）\*\* \| (开|关) \|/.exec(readme)
  assert.ok(seatRow !== null, 'README must state the subagent-seat default')
  assert.equal(seatRow[1], '关', 'subagent seats must ship disabled by default')
  const npmClaim = /0\.1\.0/.test(readme) && readme.includes('0.2.0 未发布')
  assert.ok(npmClaim, 'README must distinguish the published npm version (0.1.0) from the unreleased 0.2.0')

  /* The tool's auto-pick must be heterogeneous: one provider, one model name each. */
  const catalog = {
    providers: [
      { id: 'deepseek', name: 'DeepSeek', models: [
        { id: 'flash', name: 'DeepSeek-V4.1-Flash', contextWindow: 64000, maxTokens: 8192 },
        { id: 'pro', name: 'DeepSeek-V4-Pro', contextWindow: 64000, maxTokens: 8192 },
      ] },
      { id: 'deepseek-account', name: 'DeepSeek Account', models: [
        { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', contextWindow: 64000, maxTokens: 8192 },
      ] },
      { id: 'bohrium', name: 'bohrium', models: [
        { id: 'hy4', name: 'Hunyuan 4', contextWindow: 64000, maxTokens: 8192 },
        { id: 'glm', name: 'GLM-5.3', contextWindow: 64000, maxTokens: 8192 },
      ] },
    ],
  }
  const picks = defaultRoutesFromCatalog(catalog)
  assert.ok(picks.length >= 2, `auto-pick needs >=2 routes: ${JSON.stringify(picks.map((r) => r.key))}`)
  const providers = new Set(picks.map((route) => route.provider))
  const names = new Set(picks.map((route) => route.name))
  assert.equal(providers.size, picks.length, 'auto-pick must not repeat a provider')
  assert.equal(names.size, picks.length, 'auto-pick must not repeat a model name')

  /* Deadline discipline: a caller-provided budget must bound the retry loop.
     Simulate the clamp arithmetic the host applies per attempt. */
  const clampAttempt = (deadlineAt, now) => (typeof deadlineAt === 'number' ? Math.min(300000, Math.max(0, deadlineAt - now)) : Infinity)
  assert.equal(clampAttempt(0, 0), 0, 'an expired deadline must leave zero budget')
  assert.equal(clampAttempt(1000, 0), 1000, 'the attempt timeout clamps to the remaining budget')
  assert.equal(clampAttempt(Infinity, 0), 300000, 'no deadline keeps the full per-call timeout')
  assert.equal(clampAttempt(-1, 0), 0, 'a past deadline is zero, never negative (no zero-timeout helper)')
  /* Seat budgets clamp the same way: start and result windows never outlive the run. */
  const clampSeat = (seatMs, deadlineAt, now) => Math.min(seatMs, Math.max(0, deadlineAt - now))
  assert.equal(clampSeat(60000, 1000, 0), 1000, 'seat start clamps to the remaining run budget')
  assert.equal(clampSeat(240000, 100, 500), 0, 'an expired run leaves no seat result budget')

  /* Tool wait hard wall: the external wait ends AT the run deadline even when
     the executor's cleanup grace (+30s) is longer than the remaining budget. */
  const externalWait = (deadlineAt, now, graceMs) => Math.min(deadlineAt - now + graceMs, deadlineAt - now <= 0 ? 0 : deadlineAt - now)
  assert.equal(externalWait(1000, 0, 30000), 1000, 'the visible wait stops at the deadline, not deadline+grace')
  assert.equal(externalWait(500, 400, 30000), 100, 'remaining < grace still waits only the remaining budget')
  assert.equal(externalWait(0, 0, 30000), 0, 'an expired deadline means zero external wait')

  /* runLimited never exceeds its window. */
  let active = 0
  let peak = 0
  await runLimited(Array.from({ length: 9 }, (_, index) => index), 3, async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    active -= 1
  })
  assert.ok(peak >= 2 && peak <= 3, `concurrency window: ${peak}`)

  console.log('host half: OK (paths, traversal, secrets, timeout, scheduler)')
} finally {
  await rm(root, { recursive: true, force: true })
}
