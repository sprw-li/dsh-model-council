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
  const reviewPack = await collectPathContext('评审这个项目', 2000, workspace, 1200)
  assert.equal(reviewPack.codeState, 'ok')
  assert.ok(reviewPack.codeFiles >= 2, `review code files: ${reviewPack.codeFiles}`)
  assert.ok(reviewPack.text.includes('main.py'), 'review pack must include source text')

  /* A named project directory inside the workspace wins over the whole workspace. */
  const projectPack = await collectPathContext('全项目审查 pkg', 4000, workspace, 2000)
  assert.ok(projectPack.paths[0].toLowerCase().endsWith('pkg'), `named dir: ${JSON.stringify(projectPack.paths)}`)
  assert.ok(projectPack.text.includes('main.py'), 'named project pack must include its sources')

  /* Tool-less llm seats get the source pack; tool-equipped seats opt out. */
  const seatPack = await collectPathContext('评审这个项目', 2000, workspace, 1200, false)
  assert.equal(seatPack.codeState, 'off', 'subagent seats must not receive the source pack')
  assert.ok(seatPack.text.includes('def main()') === false, 'no source text when seats have tools')
  assert.ok(seatPack.text.includes('main.py'), 'the directory tree still lists the files to grep')

  /* Retry classification is word-bounded: token counts must not look like a 5xx. */
  assert.equal(TRANSIENT_FAILURE.test('HTTP 429 too many requests'), true)
  assert.equal(TRANSIENT_FAILURE.test('upstream 503'), true)
  assert.equal(TRANSIENT_FAILURE.test('fetch failed'), true)
  assert.equal(TRANSIENT_FAILURE.test('budget 5000 tokens exceeded'), false)
  assert.equal(TRANSIENT_FAILURE.test('model returned 2500 chars'), false)

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
  assert.ok(readme.includes(`降级配额 ${MAX_FALLBACKS_PER_RUN}`), 'README must state the fallback quota')

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
