/**
 * Host-half harness for the pure helpers: path recognition and escaping,
 * sensitive-file rejection, timeout semantics, and the concurrency window.
 * No DSH runtime is required; only node:fs against a temp directory.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
/* index.js imports @deepseek-ai/schemastery for the `council` entry Config, so this
   harness needs it resolvable from this package (gitignored node_modules/), e.g.
   `npm install --no-save --no-package-lock @deepseek-ai/schemastery` — the DSH
   installation also routes a linked plugin's declared peerDependencies, but a plain
   `node dev/verify-host.mjs` has no such router. */
import { TRANSIENT_FAILURE, SEAT_RESULT_TIMEOUT_MS, SEAT_START_TIMEOUT_MS, PROVIDER_CONCURRENCY, MAX_FALLBACKS_PER_RUN, RUN_TIMEOUT_MS, CODE_FILE_CHARS, CODE_MAX_CHARS, CODE_WALK_ENTRIES, looksLikeDeliberatePath, reasoningTail, collectSourceFiles, defaultRoutesFromCatalog, candidatePaths, collectCodeContext, collectPathContext, documentOnlyReview, isPathInside, readTextFile, runLimited, withTimeout, apply, Config, toolEnabled, panelEnabled, parseRouteSpec, resolveConfiguredRoutes, selectCouncilRoutes, pickChairmanRoute, chairmanSelection, readSetting } from '../index.js'
import { ANSWER_MAX_TOKENS, CALL_TIMEOUT_MS, REVIEW_MAX_TOKENS, CHAIRMAN_MAX_TOKENS, RUN_BUDGET_MIN_MS, OUTPUT_TOKENS_MIN, PROVIDER_CONCURRENCY_MIN, PROVIDER_CONCURRENCY_MAX, STAGE_BUDGET_SHARE, CHAIRMAN_FLOOR_MS, STOP_REASON_CHAIRMAN_SKIPPED, providerWavePlan, stageBudgetPlan, stageCapReason, budgetPlanSnapshot, chairmanStageDecision, runBudgetOf, runDeadlineOf, watchdogMessage, resumeGuard, optMemberFor, chairmanForRequest } from '../index.js'

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

  /* Multi-cluster coverage: when key terms hit several distant regions, ALL
     major clusters must appear — a single densest window missed three of the
     four deadline mechanisms in a real acceptance run. */
  {
    const spread = join(workspace, 'pkg', 'spread.py')
    const filler = Array.from({ length: 400 }, () => '# gap').join('\n')
    const r1 = 'def cluster_one():\n    DEADLINE_A = 1'
    const r2 = 'def cluster_two():\n    DEADLINE_B = 2'
    const r3 = 'def cluster_three():\n    DEADLINE_C = 3'
    await writeFile(spread, [r1, filler, r2, filler, r3].join('\n'))
    const pack = await collectCodeContext([join(workspace, 'pkg')], 6000, ['deadline', 'cluster'])
    assert.ok(pack.text.includes('cluster_one'), 'multi-cluster pack covers region 1')
    assert.ok(pack.text.includes('cluster_two'), 'multi-cluster pack covers region 2')
    assert.ok(pack.text.includes('cluster_three'), 'multi-cluster pack covers region 3')
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

  /* Vocabulary robustness: an unfamiliar review verb ("终审") or a bare file
     name must still attach the pack. Relying on an intent word list turned the
     whole pack off three separate times. */
  for (const question of [
    '终审：client.js 六项是否成立',
    '核验 index.js 的实现',
    '请判定 main.py 的裁剪逻辑',
    'look at main.py',
  ]) {
    const pack = await collectPathContext(question, 6000, workspace, 5000)
    assert.equal(pack.codeState, 'ok', `source pack must attach for: ${question}`)
  }
  /* A bogus absolute token in the prose ("无 /cancel", a version string) used
     to become the ONLY candidate, so validation failed and both workspace
     fallbacks were skipped — the review then received zero source and could
     only answer "attachment not covered". */
  for (const question of [
    'client.js 签发复审（v0.2.18, a7ab32bb）：pagehide 无 sendBeacon、无 /cancel',
    '核验 v0.2.18 里 /resume 与 /cancel 的行为，index.js 实现是否一致',
  ]) {
    const pack = await collectPathContext(question, 6000, workspace, 5000, true, [], workspace)
    assert.equal(pack.codeState, 'ok', `bogus path tokens must not suppress the fallback: ${question}`)
    assert.ok(pack.codeFiles >= 1, `expected code files for: ${question}`)
  }

  /* A RELATIVE path named in the question must reach the attachment.
     Measured on a real run: "评审对象是工作区里的 `评审/04_方案步骤与决策手册.md`"
     produced NO candidate at all, so the review target was never attached and the
     reviewer received a directory tree instead. Only absolute paths were accepted,
     and AT_MENTION's character class excluded non-ASCII, so a Chinese-named path
     could not be mentioned either. */
  {
    const named = candidatePaths('评审对象是工作区里的 `评审/04_方案.md`。', workspace)
    assert.ok(named.includes(join(workspace, '评审', '04_方案.md')),
      `a relative named document must become a candidate: ${JSON.stringify(named)}`)
    assert.ok(candidatePaths('请评审 @评审/04_方案.md', workspace).includes(join(workspace, '评审', '04_方案.md')),
      'an @mention of a non-ASCII path must resolve')
    /* Bare filenames stay out on purpose: `client.js` is ambiguous and the
       directory fallback already covers it, which keeps the pack assertions above
       meaningful. */
    assert.equal(candidatePaths('评审 client.js 的实现', workspace).length, 0,
      'a bare filename must not become a resolved candidate')
    /* Traversal must stay refused. A leading `@` used to be fed in as a path
       component, which let `join` absorb the `..` segments and land back inside
       the workspace — containment then read a traversal as safe. */
    for (const traversal of ['@../../etc/passwd', '@../../../windows/win.ini', '评审 ..\\..\\etc\\passwd']) {
      assert.equal(candidatePaths(traversal, workspace).length, 0,
        `traversal must not become a candidate: ${traversal}`)
    }
  }

  /* Code-pack gating: a review whose only named artefact is a document must NOT
     drag in source. `CODE_MENTION` lists `md` among its extensions and
     `REVIEW_INTENT` fires on any review word, so a real run that asked to review a
     Chinese Markdown plan attached 90k chars of source (24 files) from the
     fallback directory — 17 minutes, reviewers reading mostly irrelevant code. */
  {
    assert.equal(documentOnlyReview('评审 docs/plan.md 的方案'), true, 'a document-only review must drop the pack')
    assert.equal(documentOnlyReview('审查 report.pdf 的逻辑'), true, 'a PDF review must drop the pack')
    /* Real source vocabulary keeps the pack even when a doc is also named. */
    assert.equal(documentOnlyReview('评审 docs/plan.md 里的源码结构'), false, 'unambiguous code words keep the pack')
    assert.equal(documentOnlyReview('核验 方案.md 的函数设计与调用链'), false, 'unambiguous code words keep the pack')
    /* `实现` is deliberately NOT a blocker: in Chinese it usually means
       "achieve/realise", so counting it would re-open this very false positive. */
    assert.equal(documentOnlyReview('评审 docs/plan.md 的实现是否合理'), true,
      '实现 must not be treated as a code signal')
    assert.equal(documentOnlyReview('评审 docs/plan.md 与 src/app.js'), false, 'naming source keeps the pack')
    assert.equal(documentOnlyReview('评审 README.md'), false, 'a contract doc keeps the pack')
    assert.equal(documentOnlyReview('核验 SKILL.md 的描述'), false, 'a contract doc keeps the pack')
    assert.equal(documentOnlyReview('评审这个项目'), false, 'naming nothing keeps the existing behaviour')
    assert.equal(documentOnlyReview(''), false, 'an empty question changes nothing')
  }
  /* End to end on its own workspace: the document is attached, the source is not,
     and the two other branches (source named, nothing named) still get the pack. */
  {
    const docWorkspace = join(root, 'docws')
    await mkdir(join(docWorkspace, 'docs'), { recursive: true })
    await mkdir(join(docWorkspace, 'src'), { recursive: true })
    await writeFile(join(docWorkspace, 'docs', 'plan.md'), '# 方案\n\n## 总览\n\n| S0 立项 | 状态 |\n')
    await writeFile(join(docWorkspace, 'src', 'app.js'), 'function SECRET_SOURCE_MARKER() { return 1 }\n')

    const docOnly = await collectPathContext('评审对象是工作区里的 `docs/plan.md`。', 60000, docWorkspace, 60000)
    assert.equal(docOnly.codeState, 'off', 'a document-only review must not attach a source pack')
    assert.equal(docOnly.codeFiles, 0, 'a document-only review must attach zero code files')
    assert.ok(docOnly.paths.some((p) => p.endsWith(join('docs', 'plan.md'))),
      `the named document must be attached: ${JSON.stringify(docOnly.paths)}`)
    assert.ok(docOnly.text.includes('S0 立项'), 'the attached document text must be present')
    assert.equal(docOnly.text.includes('SECRET_SOURCE_MARKER'), false,
      'a document-only review must not leak workspace source')

    /* The DISCRIMINATING case for the veto, and the shape the real run had.
       Naming an EXISTING file leaves `dirs` empty, so `wantsCode` is false with or
       without the veto — an assertion built on that shape is vacuous (measured: it
       passed after the veto was deleted). Here the named document does NOT resolve,
       so the directory fallback fires, `dirs` becomes non-empty, and only the veto
       keeps the source pack off. Verified by mutation. */
    const missingDoc = await collectPathContext('评审 docs/missing-plan.md 的方案是否完整。', 60000, docWorkspace, 60000)
    assert.equal(missingDoc.codeState, 'off',
      'a review naming only a document must not attach a source pack, even when the directory fallback fires')
    assert.equal(missingDoc.text.includes('SECRET_SOURCE_MARKER'), false,
      'the directory fallback must not leak source into a document-only review')

    /* Naming a source file attaches THAT file. `codeState` stays 'off' because no
       directory was named for the pack to walk — the right signal here is that the
       named source really is in the attachment, not which internal branch put it
       there. */
    const withSource = await collectPathContext('评审 `docs/plan.md` 与 `src/app.js` 是否一致', 60000, docWorkspace, 60000)
    assert.ok(withSource.paths.some((p) => p.endsWith(join('src', 'app.js'))),
      `a named source file must be attached: ${JSON.stringify(withSource.paths)}`)
    assert.ok(withSource.text.includes('SECRET_SOURCE_MARKER'),
      'a named source file must contribute its text')

    const nothingNamed = await collectPathContext('评审这个项目', 60000, docWorkspace, 60000)
    assert.equal(nothingNamed.codeState, 'ok', 'naming nothing must keep the existing workspace behaviour')
    assert.ok(nothingNamed.text.includes('SECRET_SOURCE_MARKER'),
      'the directory walk must still carry source for an unnamed review')
  }

  /* Nested project selection: an alphabetical walk spent the entry budget on
     unrelated sibling dirs, so a review of one project received another's
     files. A question naming the project must surface ITS files. */
  {
    const nested = join(workspace, 'many')
    await mkdir(join(nested, 'aaa-unrelated'), { recursive: true })
    await mkdir(join(nested, 'zzz-target'), { recursive: true })
    for (let index = 0; index < 30; index += 1) {
      await writeFile(join(nested, 'aaa-unrelated', `f${index}.py`), `# unrelated ${index}\n`)
    }
    await writeFile(join(nested, 'zzz-target', 'wanted.py'), 'WANTED_MARKER = True\n')
    const pack = await collectCodeContext([nested], 8000, ['zzz-target', 'wanted'])
    assert.ok(pack.text.includes('WANTED_MARKER'), 'a named nested project must be walked first')
  }

  /* Bogus absolute tokens must not suppress the fallback. */
  const bogus = await collectPathContext('核验 v0.2.19 里 /cancel 的行为，index.js 是否一致', 6000, workspace, 5000, true, [], workspace)
  assert.equal(bogus.codeState, 'ok', 'bogus path tokens must not suppress the workspace fallback')

  /* A pure chat question MUST NOT drag the code base into the prompt. */
  const chatPack = await collectPathContext('今天天气怎么样', 6000, workspace, 5000)
  assert.equal(chatPack.codeState, 'off', 'plain chat must not attach source code')

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

  /* Out-of-band termination must release resources, not just write a state.
     The deadline wall used to call finishRun only; `finally` then cleared the
     watchdog, so in-flight provider calls and live seats were never aborted
     (and because the wall fires a few ms before the watchdog, that was the
     normal path). Assert the shared terminateRun helper and every caller. */
  {
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    const terminate = /function terminateRun\(run, message\) \{([\s\S]*?)\n  \}/.exec(source)
    assert.ok(terminate !== null, 'terminateRun helper must exist')
    assert.ok(terminate[1].includes("finishRun(run, 'error', message, 'watchdog')"), 'terminateRun settles the run')
    assert.ok(terminate[1].includes('run.controller.abort()'), 'terminateRun aborts in-flight work')
    assert.ok(terminate[1].includes('activation.dispose()'), 'terminateRun disposes live seats')
    /* The wall branch and both watchdogs go through it. */
    assert.ok(source.includes("terminateRun(run, '整轮预算耗尽')"), 'deadline wall must use terminateRun')
    /* Both watchdogs pass the run through `watchdogMessage`, so the sentence states
       the budget it actually enforces once `runBudgetMs` is lowered. Counting the
       helper call sites keeps the coverage assertion (still exactly two) without
       pinning it to a literal that would go stale with a configured budget. */
    const watchdogCalls = (source.match(/terminateRun\(run, watchdogMessage\(run\)\)/g) || []).length
    assert.equal(watchdogCalls, 2, `both watchdogs (tool + HTTP) must use terminateRun, got ${watchdogCalls}`)
    assert.equal(/terminateRun\(run, '运行超时/.test(source), false,
      'both watchdogs must derive their message from the run budget, not a fixed literal')
    /* The default budget keeps the historical sentence VERBATIM: a user who never
       opened Settings must not see their watchdog message reworded. */
    assert.equal(watchdogMessage({ createdAt: 0, budgetMs: RUN_TIMEOUT_MS }), '运行超时（30 分钟），已中止',
      'the default run budget must produce the historical watchdog sentence')
    assert.equal(watchdogMessage({ createdAt: 0, budgetMs: 10 * 60 * 1000 }), '运行超时（10 分钟），已中止',
      'a lowered run budget must be stated in the watchdog message')
    assert.equal(watchdogMessage({ createdAt: 0 }), '运行超时（30 分钟），已中止',
      'a run with no frozen budget (loaded from disk) must fall back to the ceiling')
    assert.equal(/finishRun\(run, 'error', '整轮预算耗尽'/.test(source), false,
      'the wall branch must not settle without releasing resources')
    /* The build marker is bumped by hand on every behaviour change so a reload is
       verifiable ("if it still reads the previous marker, the host is running the
       old code and the new snapshot fields are not there"). Both health surfaces
       must therefore agree, or "which code is live?" becomes unanswerable. */
    const buildMarkers = [...source.matchAll(/build: 'v(\d+)'/g)].map((match) => match[1])
    assert.equal(buildMarkers.length, 2, 'both health surfaces must report a build marker')
    assert.equal(new Set(buildMarkers).size, 1,
      `the /diag and / health probes must report one build marker, got ${JSON.stringify(buildMarkers)}`)
  }

  /* A configured allowlist confines attachments to the workspace. */
  const confined = await collectPathContext('review D/dev/elsewhere', 2000, workspace, 0, false, [workspace])
  assert.equal(confined.paths.length, 0, `allowlist must refuse outside paths: ${JSON.stringify(confined.paths)}`)
  const allowed = await collectPathContext('review the workspace', 2000, workspace, 0, false, [workspace])
  assert.equal(allowed.paths.length, 1, 'allowlist keeps the workspace itself')

  /* Fail closed by default (2026-11-16). The old rule was
     `attachRoots.length === 0 || ...`, so with no allowlist ANY absolute path
     typed into the question was read and shipped to the provider. Measured with
     a canary file outside the workspace: its content came back in the pack. */
  {
    const outsideDir = join(root, 'outside')
    await mkdir(outsideDir, { recursive: true })
    const canary = join(outsideDir, 'canary.txt')
    const CANARY = 'OUTSIDE_CANARY_9f3a'
    await writeFile(canary, `line1\n${CANARY}\nline3\n`, 'utf8')

    /* Default: outside path refused, even though no allowlist is configured. */
    const refused = await collectPathContext(
      `评审这个文件 ${canary}`, 4000, workspace, 0, false, [], undefined, false,
    )
    assert.equal(refused.text.includes(CANARY), false,
      'default must NOT read a path outside the workspace')
    assert.equal(refused.paths.some((p) => p === canary), false,
      'the outside file must not appear in attached paths')

    /* Opt back in: the escape hatch restores the pre-0.2.28 behaviour. */
    const restored = await collectPathContext(
      `评审这个文件 ${canary}`, 4000, workspace, 0, false, [], undefined, true,
    )
    assert.equal(restored.text.includes(CANARY), true,
      'allowExternalPaths=true must restore reading an explicit outside path')

    /* Explicit grant: naming the directory in attachRoots is the intended path. */
    const granted = await collectPathContext(
      `评审这个文件 ${canary}`, 4000, workspace, 0, false, [outsideDir], workspace, false,
    )
    assert.equal(granted.text.includes(CANARY), true,
      'an allowlisted outside directory must be readable')
  }

  /* Reparse points. A link placed INSIDE an allowed root resolves outside it, so
     comparing the written path is not enough. The walkers always rejected links
     they met within a tree, but a link used as the tree's own ROOT was followed —
     measured: naming `ws/link-dir` (a junction to an outside directory) shipped
     that directory's files. Windows junctions need no admin rights, so this was
     reachable. */
  {
    const linkRoot = join(root, 'links')
    const linkOutside = join(linkRoot, 'outside')
    const linkWs = join(linkRoot, 'ws')
    await mkdir(join(linkOutside, 'deep'), { recursive: true })
    await mkdir(join(linkWs, 'sub'), { recursive: true })
    const LINK_CANARY = 'REPARSE_CANARY_4a17'
    await writeFile(join(linkOutside, 'leak.js'), `export const leak = "${LINK_CANARY}"\n`, 'utf8')
    await writeFile(join(linkOutside, 'deep', 'deeper.js'), `export const d = "${LINK_CANARY}"\n`, 'utf8')
    await writeFile(join(linkWs, 'ok.js'), 'export const ok = 1\n', 'utf8')

    /* Junctions need no elevation on Windows; a file symlink would. */
    const made = []
    const tryLink = (target, path) => {
      try {
        symlinkSync(target, path, 'junction')
        made.push(path)
      } catch { /* filesystem without junction support: skip that variant */ }
    }
    const direct = join(linkWs, 'link-dir')
    const nested = join(linkWs, 'sub', 'nested-link')
    const chain = join(linkWs, 'chain')
    tryLink(linkOutside, direct)
    tryLink(linkOutside, nested)
    tryLink(direct, chain)

    assert.ok(made.length >= 1, 'this platform must support directory junctions for this test')

    for (const target of made) {
      const pack = await collectPathContext(
        `评审 ${target}`, 4000, linkWs, 4000, true, [linkRoot], linkWs, false,
      )
      assert.equal(pack.text.includes(LINK_CANARY), false,
        `naming a junction (${target.split(/[\\/]/).pop()}) must not read outside the workspace`)
      assert.equal(pack.paths.includes(target), false,
        'a refused junction must not be listed as an attached path')
      const walked = await collectSourceFiles(target, ['leak', 'deep'])
      assert.equal(walked.length, 0, 'collectSourceFiles must refuse a link as its root')
    }

    /* The whole-directory review must not follow those links either. */
    const dirPack = await collectPathContext(
      `评审整个工作区 ${linkWs}`, 6000, linkWs, 6000, true, [linkRoot], linkWs, false,
    )
    assert.equal(dirPack.text.includes(LINK_CANARY), false,
      'walking the workspace must not follow a junction out of it')
    assert.equal(dirPack.text.includes('ok.js'), true,
      'the ordinary file must still be attached — the guard must not disable attachments')

    /* An explicitly granted real directory is still readable. */
    const realGrant = await collectPathContext(
      `评审这个文件 ${join(linkOutside, 'leak.js')}`, 4000, linkWs, 4000, true, [linkOutside], linkWs, false,
    )
    assert.equal(realGrant.text.includes(LINK_CANARY), true,
      'granting the real target directory must still work')
  }

  /* Content-level secret scan. `SECRET_NAME` only catches self-announcing file
     names, which misses a key pasted into a README — the exact case that ships
     a credential to a third-party provider. */
  {
    const secretDir = join(root, 'secretish')
    await mkdir(secretDir, { recursive: true })
    const readme = join(secretDir, 'NOTES.md')
    const KEY = 'sk-abcdefghijklmnopqrstuvwxyz0123456789'
    await writeFile(readme, `# notes\n\nkey = "${KEY}"\n`, 'utf8')

    const packed = await collectPathContext(
      `评审 ${readme}`, 4000, workspace, 0, false, [secretDir], workspace, false,
    )
    assert.equal(packed.text.includes(KEY), false,
      'a key pasted into an ordinary file must not reach the provider')
    assert.equal(packed.text.includes('已脱敏'), true,
      'the redaction must be visible in the pack, not silent')
    assert.ok(Array.isArray(packed.redactions) && packed.redactions.length >= 1,
      'the run must record which file was redacted')
    assert.ok(packed.redactions.some((r) => r.patterns.includes('openai-key')),
      `expected the openai-key pattern to fire, got ${JSON.stringify(packed.redactions)}`)
  }

  /* The path-shape rule that keeps prose from suppressing the workspace fallback
     must itself be anchored: `/cancel` is noise, a drive path is a request. */
  for (const [token, expected, why] of [
    ['/cancel', false, 'a bare /token is prose noise, not a path request'],
    ['/resume', false, 'same for /resume'],
    ['D:\\dev/elsewhere', true, 'a drive-letter path is a deliberate request'],
    ['C:/Users/x/notes.md', true, 'drive + separators is deliberate'],
    ['/etc/passwd', true, 'a real multi-segment absolute path is deliberate'],
    ['notes.md', true, 'a bare filename with an extension is deliberate'],
  ]) {
    const got = looksLikeDeliberatePath(token)
    assert.equal(got, expected, `${token} -> ${why} (got ${got})`)
  }

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

  /* The per-call timeout: the README claimed 300s while CALL_TIMEOUT_MS was 600000
     (10 min) — drift nobody noticed because nothing compared the two. Parse the
     number the README actually prints and compare it to the constant, so the next
     change to either side has to be made together. */
  const callTimeout = /单次调用超时 (\d+)s/.exec(readme)
  assert.ok(callTimeout !== null, 'README must state the single-call timeout')
  assert.equal(Number(callTimeout[1]), Math.round(CALL_TIMEOUT_MS / 1000),
    'README 的「单次调用超时 Ns」必须等于 CALL_TIMEOUT_MS')

  /* Every tuning knob the Config exposes must be documented, and every new
     observable the plugin ships must be described: a Settings field or snapshot
     field nobody wrote down is the same defect as an undocumented constant.
     Matched on a whole identifier, NOT a substring: renaming `providerWaves` to
     `providerWavesUndocumented` must fail, which a plain `includes` would miss. */
  const documentsToken = (token) => new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`).test(readme)
  for (const name of ['answerMaxTokens', 'reviewMaxTokens', 'chairmanMaxTokens', 'providerConcurrency', 'runBudgetMs']) {
    assert.ok(documentsToken(name), `README must document the ${name} setting (as a whole identifier)`)
  }
  for (const name of ['providerWaves', 'budgetPlan', 'optMember', 'chairman-budget-skipped']) {
    assert.ok(documentsToken(name), `README must describe the ${name} observable (as a whole identifier)`)
  }

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
  /* Version claims must track package.json, not a number someone typed once.
     The earlier form hard-coded "0.2.0 未发布" and therefore *locked the drift
     in*: it passed only while the README still advertised a stale version. */
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(readme.includes(pkg.version), `README must state the repository source version (${pkg.version})`)
  assert.ok(!readme.includes('0.2.0 未发布'), 'README must not claim 0.2.0 is the unreleased source version')
  assert.ok(readme.includes('0.1.0'), 'README must state the published npm version (0.1.0)')

  /* The source-pack budget the README quotes must be the budget the code uses. */
  assert.ok(readme.includes(String(CODE_FILE_CHARS)),
    `README must state the per-file source budget (${CODE_FILE_CHARS})`)
  assert.ok(readme.includes(String(CODE_MAX_CHARS)),
    `README must state the total source budget (${CODE_MAX_CHARS})`)
  assert.ok(readme.includes(String(CODE_WALK_ENTRIES)),
    `README must state the walk entry cap (${CODE_WALK_ENTRIES})`)
  for (const stale of ['24 个源码文件', '单文件 4k 字', '默认 40k']) {
    assert.ok(!readme.includes(stale), `README must not keep the superseded source-pack claim "${stale}"`)
  }

  /* The tool's auto-pick must be heterogeneous: one provider, one model name each. */
  const catalog = {
    providers: [
      { id: 'deepseek', name: 'DeepSeek', models: [
        { id: 'flash', name: 'DeepSeek-V4.1-Flash', contextWindow: 64000, maxTokens: 8192 },
        { id: 'pro', name: 'DeepSeek-V4-Pro', contextWindow: 64000, maxTokens: 8192 },
      ] },
      { id: 'providerD', name: 'DeepSeek Account', models: [
        { id: 'deepseek-flash', name: 'DeepSeek-V4.1-Flash', contextWindow: 64000, maxTokens: 8192 },
      ] },
      { id: 'providerA', name: 'providerA', models: [
        { id: 'modelA', name: 'modelA', contextWindow: 64000, maxTokens: 8192 },
        { id: 'glm', name: 'modelB', contextWindow: 64000, maxTokens: 8192 },
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

  /* ------------------------------------------------------------------ *
   * Latency and budget fairness.                                        *
   *                                                                     *
   * Measured baseline this locks in: 8 council runs took 11m45s–27m46s, *
   * and one hard-failed IN THE CHAIRMAN STAGE with                     *
   * `整轮预算耗尽：调用超时（89s 内未完成）`. Three causes: 16384-token  *
   * seats, a 4-slot provider that turned a 5-seat roster into 2 waves   *
   * per stage, and a chairman stage that only ever saw the run's         *
   * leftovers. The knobs are settings now, the waves and stage budgets  *
   * are reported, and the chairman degrades visibly instead of dying.    *
   * ------------------------------------------------------------------ */
  {
    /* The five tuning knobs ship exactly the values that were hard-coded, so an
       upgrade can never shorten an answer or a run behind the user's back. */
    const defaults = Config(undefined)
    assert.equal(readSetting(defaults.answerMaxTokens, -1), ANSWER_MAX_TOKENS,
      'answerMaxTokens must default to the historical ANSWER_MAX_TOKENS')
    assert.equal(readSetting(defaults.reviewMaxTokens, -1), REVIEW_MAX_TOKENS,
      'reviewMaxTokens must default to the historical REVIEW_MAX_TOKENS')
    assert.equal(readSetting(defaults.chairmanMaxTokens, -1), CHAIRMAN_MAX_TOKENS,
      'chairmanMaxTokens must default to the historical CHAIRMAN_MAX_TOKENS')
    assert.equal(readSetting(defaults.providerConcurrency, -1), PROVIDER_CONCURRENCY,
      'providerConcurrency must default to the historical PROVIDER_CONCURRENCY')
    assert.equal(readSetting(defaults.runBudgetMs, -1), RUN_TIMEOUT_MS,
      'runBudgetMs must default to the historical RUN_TIMEOUT_MS')
    /* Pinned literals, so a future "small tweak" cannot quietly lower quality. */
    assert.equal(ANSWER_MAX_TOKENS, 16384, 'the answer budget must not be lowered silently')
    assert.equal(REVIEW_MAX_TOKENS, 16384, 'the review budget must not be lowered silently')
    assert.equal(CHAIRMAN_MAX_TOKENS, 16384, 'the chairman budget must not be lowered silently')
    /* 0.2.36 raised this from 4 to 5 ON PURPOSE: a 5-seat roster on one provider
       went from 2 waves per stage to 1. Locked as a floor, and cross-checked
       against the README below, so it cannot silently drift back. */
    assert.ok(PROVIDER_CONCURRENCY >= 5,
      `the default slot count must cover a 5-seat roster in one wave, got ${PROVIDER_CONCURRENCY}`)
    assert.equal(RUN_TIMEOUT_MS, 1800000, 'the default run budget must not be lowered silently')
    for (const name of ['answerMaxTokens', 'reviewMaxTokens', 'chairmanMaxTokens', 'providerConcurrency', 'runBudgetMs']) {
      assert.ok(Object.hasOwn(Config.dict, name), `Config must declare ${name}`)
      assert.equal(Config.dict[name].meta.volatile, true,
        `${name} must be .volatile() so a Settings write reaches the next run without a plugin restart`)
      assert.ok(String(Config.dict[name].meta.description || '').length > 0, `${name} must carry a description`)
      assert.throws(() => Config({ [name]: 'not-a-number' }), `${name} must reject a non-number`)
    }
    /* A floor on the output budget keeps "empty body / truncated answer" from being
       a configurable outcome; the ceiling keeps a provider from being over-asked. */
    assert.ok(OUTPUT_TOKENS_MIN >= 4096, `the output-budget floor must be sane, got ${OUTPUT_TOKENS_MIN}`)
    assert.ok(OUTPUT_TOKENS_MIN <= ANSWER_MAX_TOKENS, 'the floor must never exclude the shipped default')
    assert.ok(PROVIDER_CONCURRENCY_MIN >= 1 && PROVIDER_CONCURRENCY_MAX >= PROVIDER_CONCURRENCY)

    /* --- provider waves ---------------------------------------------------- */
    const bohrium = (n) => Array.from({ length: n }, () => ({ provider: 'bohrium', providerName: 'Bohrium' }))
    const deepseek = (n) => Array.from({ length: n }, () => ({ provider: 'deepseek', providerName: 'DeepSeek' }))
    /* The 4-slot arithmetic stays locked with an EXPLICIT slot count (the default is
       5 now): the rule `ceil(seats/slots)` must keep holding for any slot count. */
    const fiveOneProvider = providerWavePlan({
      answers: bohrium(5), reviews: bohrium(5), chairman: bohrium(1),
    }, 4)
    assert.equal(fiveOneProvider.concurrency, 4)
    assert.equal(fiveOneProvider.stages.answers.seats, 5)
    assert.equal(fiveOneProvider.stages.answers.slots, 4)
    assert.equal(fiveOneProvider.stages.answers.waves, 2,
      'a 5-seat roster on 4 slots needs ceil(5/4)=2 waves in the answer stage')
    assert.equal(fiveOneProvider.stages.reviews.waves, 2, 'the review stage pays the same waves')
    assert.equal(fiveOneProvider.stages.chairman.waves, 1, 'one chairman seat is one wave')
    assert.equal(fiveOneProvider.maxWaves, 2)
    assert.equal(fiveOneProvider.stages.answers.byProvider[0].provider, 'bohrium')
    assert.equal(fiveOneProvider.stages.answers.byProvider[0].seats, 5)
    assert.equal(fiveOneProvider.advice,
      '同 provider "bohrium" 5 席 > 槽位 4，每阶段将跑 2 波（ceil(5/4)）；掺入第二 provider 可降为一波。',
      'the same-provider excess must produce the one visible advice line')
    /* The 0.2.36 default: the same roster is ONE wave per stage, and the advice line
       must disappear because there is nothing left to advise. */
    const fiveAtDefault = providerWavePlan({
      answers: bohrium(5), reviews: bohrium(5), chairman: bohrium(1),
    }, PROVIDER_CONCURRENCY)
    assert.equal(fiveAtDefault.concurrency, PROVIDER_CONCURRENCY)
    assert.equal(fiveAtDefault.maxWaves, 1,
      'the shipped default must put a 5-seat single-provider roster in one wave per stage')
    assert.equal(fiveAtDefault.advice, '', 'a roster that fits the default slots needs no advice')
    /* Six seats are still 2 waves: the default was bounded, not fitted to one roster. */
    const sixAtDefault = providerWavePlan({
      answers: bohrium(6), reviews: bohrium(6), chairman: bohrium(1),
    }, PROVIDER_CONCURRENCY)
    assert.equal(sixAtDefault.maxWaves, 2, 'a 6-seat roster still needs 2 waves at the default slots')
    assert.ok(sixAtDefault.advice.includes('6 席 > 槽位'), 'and it must say so')
    /* The cheapest fix the user has: slots that fit the roster. */
    const fiveSlots = providerWavePlan({
      answers: bohrium(5), reviews: bohrium(5), chairman: bohrium(1),
    }, 5)
    assert.equal(fiveSlots.maxWaves, 1, 'slots >= seats collapses every stage to one wave')
    assert.equal(fiveSlots.advice, '', 'no excess means no advice line')
    /* A mixed roster is one wave per stage at every slot count tested. */
    const mixedRoster = providerWavePlan({
      answers: [...bohrium(3), ...deepseek(2)], reviews: [...bohrium(3), ...deepseek(2)], chairman: bohrium(1),
    }, 4)
    assert.equal(mixedRoster.maxWaves, 1, '3+2 across two providers is one wave at 4 slots')
    assert.equal(mixedRoster.advice, '')
    /* Only the offending stage is named when just one stage exceeds. */
    const answersOnly = providerWavePlan({ answers: bohrium(5), reviews: bohrium(2), chairman: bohrium(1) }, 4)
    assert.equal(answersOnly.stages.reviews.waves, 1)
    assert.ok(answersOnly.advice.includes('作答阶段将跑 2 波'),
      `a single offending stage must be named, got ${JSON.stringify(answersOnly.advice)}`)
    /* No chairman stage means no fabricated wave. */
    const noChairman = providerWavePlan({ answers: bohrium(2), reviews: bohrium(2), chairman: [] }, 4)
    assert.equal(noChairman.stages.chairman.seats, 0)
    assert.equal(noChairman.stages.chairman.waves, 0)
    assert.equal(noChairman.stages.chairman.byProvider.length, 0)
    /* A 6-seat roster is NOT slower than a 5-seat one: both are 2 waves. */
    assert.equal(providerWavePlan({ answers: bohrium(6), reviews: bohrium(6) }, 4).maxWaves, 2)
    /* Garbage in must fall back to the documented default, never NaN waves. */
    assert.equal(providerWavePlan({ answers: bohrium(5) }, Number.NaN).concurrency, PROVIDER_CONCURRENCY)
    assert.equal(providerWavePlan({ answers: bohrium(5) }, 0).concurrency, PROVIDER_CONCURRENCY)
    assert.equal(providerWavePlan(undefined, 4).maxWaves, 0)

    /* --- stage sub-budgets ------------------------------------------------- */
    assert.deepEqual([STAGE_BUDGET_SHARE.answers, STAGE_BUDGET_SHARE.reviews, STAGE_BUDGET_SHARE.chairman],
      [0.45, 0.35, 0.2], 'the three stage shares are the documented 45/35/20')
    assert.ok(STAGE_BUDGET_SHARE.answers + STAGE_BUDGET_SHARE.reviews <= 0.8,
      'the answer and review caps must leave the chairman at least 20% by construction')
    const plan = stageBudgetPlan(RUN_TIMEOUT_MS)
    assert.equal(plan.totalMs, RUN_TIMEOUT_MS)
    assert.equal(plan.stages.answers.budgetMs, 810000, 'answers get 45% of 30 min')
    assert.equal(plan.stages.reviews.budgetMs, 630000, 'reviews get 35% of 30 min')
    assert.equal(plan.stages.chairman.budgetMs, 360000, 'the chairman floor budget is 20% of 30 min')
    assert.equal(plan.stages.chairman.floorMs, CHAIRMAN_FLOOR_MS, 'the chairman floor is 120 s')
    assert.equal(plan.stages.chairman.skipped, false)
    assert.equal(plan.stages.chairman.reason, '')
    for (const name of ['answers', 'reviews']) {
      assert.equal(plan.stages[name].capped, false)
      assert.equal(plan.stages[name].cappedReason, '')
    }
    /* A small run budget cannot carry a floor bigger than the chairman's own share. */
    const smallPlan = stageBudgetPlan(RUN_BUDGET_MIN_MS)
    assert.equal(smallPlan.totalMs, RUN_BUDGET_MIN_MS)
    assert.equal(smallPlan.stages.chairman.floorMs, Math.round(RUN_BUDGET_MIN_MS * STAGE_BUDGET_SHARE.chairman))
    /* Out-of-range totals clamp to the ceiling: a plan can never exceed the watchdog. */
    for (const bad of [undefined, null, 1, RUN_BUDGET_MIN_MS - 1, 10 * RUN_TIMEOUT_MS]) {
      assert.equal(stageBudgetPlan(bad).totalMs, RUN_TIMEOUT_MS, `stageBudgetPlan(${String(bad)}) must clamp`)
    }

    /* --- run budget -------------------------------------------------------- */
    assert.equal(runBudgetOf({}), RUN_TIMEOUT_MS, 'a run without a frozen budget falls back to the ceiling')
    assert.equal(runBudgetOf({ budgetMs: 600000 }), 600000, 'a frozen budget is honoured')
    assert.equal(runBudgetOf({ budgetMs: 10 * RUN_TIMEOUT_MS }), RUN_TIMEOUT_MS,
      'a budget above the ceiling is refused: the tool timeout backstop must stay valid')
    assert.equal(runBudgetOf({ budgetMs: 1 }), RUN_TIMEOUT_MS, 'a nonsense budget falls back to the ceiling')
    assert.equal(runDeadlineOf({ createdAt: 5000, budgetMs: 300000 }), 305000,
      'the deadline must be derived from the frozen budget, not the constant')

    /* --- budget snapshot --------------------------------------------------- */
    const running = stageBudgetPlan(RUN_TIMEOUT_MS)
    running.startedAt = 1000000
    running.stages.answers.startedAt = 1010000
    running.stages.answers.deadlineAt = 1010000 + 810000
    const live = budgetPlanSnapshot(running, 1070000)
    assert.equal(live.elapsedMs, 70000, 'elapsedMs is measured from the run start')
    assert.equal(live.remainingMs, RUN_TIMEOUT_MS - 70000)
    assert.equal(live.stages.answers.usedMs, 60000, 'an open stage counts to now')
    assert.equal(live.stages.answers.capped, false)
    /* A settled run must FREEZE its stage timings instead of growing with the clock
       every time the snapshot is re-rendered. */
    const frozen = budgetPlanSnapshot({
      ...running,
      stages: {
        ...running.stages,
        answers: { ...running.stages.answers, endedAt: 1030000, capped: true, cappedReason: '用满了' },
      },
    }, 9999999)
    assert.equal(frozen.stages.answers.usedMs, 20000, 'a closed stage freezes at endedAt')
    assert.equal(frozen.stages.answers.capped, true)
    assert.equal(frozen.stages.answers.cappedReason, '用满了')
    /* The promised shape is always complete, even for a run with no plan at all. */
    for (const view of [budgetPlanSnapshot(undefined, 0), budgetPlanSnapshot(undefined, undefined)]) {
      assert.deepEqual(Object.keys(view.stages), ['answers', 'reviews', 'chairman'])
      for (const name of ['answers', 'reviews', 'chairman']) {
        for (const field of ['share', 'budgetMs', 'usedMs', 'startedAt', 'endedAt', 'deadlineAt', 'capped', 'cappedReason']) {
          assert.ok(Object.hasOwn(view.stages[name], field), `budgetPlan.${name}.${field} must always be present`)
        }
      }
      assert.equal(typeof view.stages.chairman.floorMs, 'number')
      assert.equal(view.stages.chairman.skipped, false)
      assert.equal(view.stages.chairman.reason, '')
    }

    /* --- what a stage cap means, and what it is NOT -------------------------- */
    /* "The answer stage used its 45%" must never be reported as "the run ran out".
       The three cases below are the whole distinction: inside budget → nothing,
       stage cap bound it → named reason, RUN deadline bound it → nothing. */
    const runDeadline = 1000000 + RUN_TIMEOUT_MS
    const stageOf = (extra) => ({ share: 0.45, budgetMs: 810000, startedAt: 1000000 + 20000, deadlineAt: 1000000 + 20000 + 810000, ...extra })
    assert.equal(stageCapReason('answers', stageOf({}), runDeadline, 1000000 + 20000 + 800000), '',
      'a stage that finished inside its sub-budget must not be reported as capped')
    assert.equal(stageCapReason('answers', stageOf({}), runDeadline, 1000000 + 20000 + 810001),
      '作答阶段用满子预算 810s（整轮预算的 45%），阶段内未完成的席位已停止',
      'a stage stopped by its own sub-budget must say so, in seconds and percent')
    /* The chairman runs to the RUN deadline by design: that is not a stage cap. */
    assert.equal(stageCapReason('chairman', {
      share: 0.2, budgetMs: 360000, startedAt: 1000000 + 25000, deadlineAt: runDeadline,
    }, runDeadline, runDeadline), '', 'the run deadline is not a stage cap')
    assert.equal(stageCapReason('answers', { share: 0.45, budgetMs: 810000, startedAt: 0, deadlineAt: 0 },
      runDeadline, runDeadline), '', 'a stage that never started cannot be capped')
    /* A stage cap reached exactly at the boundary is still a cap (>= not >). */
    assert.notEqual(stageCapReason('reviews', stageOf({}), runDeadline, 1000000 + 20000 + 810000), '',
      'ending exactly at the sub-budget deadline counts as capped')

    /* --- chairman floor ---------------------------------------------------- */
    const skip = chairmanStageDecision(89000, CHAIRMAN_FLOOR_MS)
    assert.equal(skip.action, 'skip', '89 s of remaining budget must NOT be spent on a chairman call')
    assert.equal(skip.reason, '主席阶段预算不足（剩余 89s，下限 120s），已跳过（无主席模式）',
      'the skip reason must state the remaining budget and the floor')
    /* The client renders this string verbatim (no HTML, no wrapping), so it must
       stay a single plain-text line. */
    assert.equal(/[<>]/.test(skip.reason), false, 'the skip reason must not contain markup')
    assert.equal(skip.reason.includes('\n'), false, 'the skip reason must be one line')
    assert.equal(chairmanStageDecision(CHAIRMAN_FLOOR_MS, CHAIRMAN_FLOOR_MS).action, 'run',
      'exactly the floor is still attempted')
    assert.equal(chairmanStageDecision(CHAIRMAN_FLOOR_MS - 1, CHAIRMAN_FLOOR_MS).action, 'skip')
    assert.equal(chairmanStageDecision(600000, CHAIRMAN_FLOOR_MS).action, 'run')
    assert.equal(chairmanStageDecision(CHAIRMAN_FLOOR_MS, CHAIRMAN_FLOOR_MS).reason, '')
    assert.equal(chairmanStageDecision(-5, CHAIRMAN_FLOOR_MS).reason,
      '主席阶段预算不足（剩余 0s，下限 120s），已跳过（无主席模式）',
      'a negative remainder must be reported as 0s, never as a negative number')
    assert.equal(STOP_REASON_CHAIRMAN_SKIPPED, 'chairman-budget-skipped',
      'the stopReason token is frozen: the browser maps it, so a reworded literal would be unlabelled')

    /* --- the degradation is wired into execute, not just available --------- */
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    assert.ok(source.includes("finishRun(run, 'done', '', STOP_REASON_CHAIRMAN_SKIPPED)"),
      'a chairman skipped for lack of budget must settle the run as DONE, with the reason recorded')
    assert.equal(/finishRun\(run, 'error'[^\n]*主席阶段预算不足/.test(source), false,
      'the chairman floor must never settle the run as an error')
    assert.ok(source.includes('chairmanStageDecision(deadlineAt - Date.now(), chairmanTrack.floorMs)'),
      'execute must decide the chairman stage from the budget actually left')
    assert.ok(source.includes("endStage(run, 'answers')") && source.includes("endStage(run, 'reviews')"),
      'both capped stages must be closed so the snapshot can report what they consumed')
    /* Every budget-exhausted throw names the budget that ran out through `${label}`:
       three sites in callModel (two with lastError, one with detail) and the seat
       start guard. Counting them keeps "a stage cap must never claim the whole run
       ran out" from being satisfied by one leftover occurrence. */
    assert.equal((source.match(/throw new Error\(`\$\{label\}预算耗尽/g) || []).length, 4,
      'all four budget-exhausted throws must name the stage budget, not a fixed "整轮"')
    assert.equal(/throw new Error\(`整轮预算耗尽：/.test(source), false,
      'no budget throw may hard-code "整轮预算耗尽"')
    assert.ok(source.includes('timeoutMs: RUN_TIMEOUT_MS + 30000'),
      'the tool timeout backstop must stay above the largest allowed run budget')
  }

  /* ------------------------------------------------------------------ *
   * task-6 (pure half): the opt-member label is write-once. The measured  *
   * hole it closes: one real runId × 8 members still passed              *
   * `council_records.py check` with exit 0, so a single run could stand   *
   * in for the whole 8-member matrix.                                     *
   * ------------------------------------------------------------------ */
  {
    assert.deepEqual(optMemberFor('', 'rev-01'), { value: 'rev-01', conflict: '' },
      'the first label is applied')
    assert.deepEqual(optMemberFor('rev-01', ''), { value: 'rev-01', conflict: '' },
      'a call without a label must not ERASE the existing one')
    assert.deepEqual(optMemberFor('rev-01', 'rev-01'), { value: 'rev-01', conflict: '' },
      'the same label repeated is idempotent, not a conflict (a retry is not a new member)')
    assert.deepEqual(optMemberFor('  rev-01  ', 'rev-01'), { value: 'rev-01', conflict: '' },
      'the label is compared trimmed')
    const clash = optMemberFor('rev-01', 'rev-02')
    assert.equal(clash.value, 'rev-01', 'a labelled run keeps its FIRST label')
    assert.ok(clash.conflict.includes('不能改写'), 'the clash must be reported, never applied')
    assert.ok(clash.conflict.includes('冒充'), 'the reason must name the integrity risk')
    assert.equal(optMemberFor('', '').value, '', 'no label at all stays empty')
    assert.equal(optMemberFor(undefined, undefined).value, '', 'missing input stays empty, never "undefined"')
    assert.equal(optMemberFor(7, 'x').value, 'x', 'a non-string existing value is treated as empty')
    assert.equal(optMemberFor('a', 7).value, 'a', 'a non-string request cannot relabel a run')
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    assert.ok(source.includes('const optLabel = optMemberFor(run.optMember, input.optMember)'),
      'the tool must resolve the label through the write-once helper')
    assert.ok(source.includes("if (optLabel.conflict !== '') throw new Error(optLabel.conflict)"),
      'a conflicting label must REFUSE the run, not be applied quietly')
  }

  /* ------------------------------------------------------------------ *
   * task-4 (pure half): the resume gate is a real rule, not a client      *
   * convention — and it must stay INVISIBLE to panel runs.                *
   * ------------------------------------------------------------------ */
  {
    const panelRun = { id: 'c1', toolRun: false, status: 'done' }
    const toolRun = { id: 'c2', toolRun: true, status: 'done' }
    assert.equal(resumeGuard(panelRun, false).ok, true, 'a panel run must resume without force')
    assert.equal(resumeGuard(panelRun, true).forced, true,
      'an explicit force on a panel run is still recorded as forced')
    const denied = resumeGuard(toolRun, false)
    assert.equal(denied.ok, false, 'a tool-originated run must be refused by default')
    assert.equal(denied.status, 409, 'the refusal must be a 409, like the other run-state conflicts')
    assert.equal(denied.code, 'tool-run', 'the refusal must carry a structured code')
    assert.ok(denied.error.includes('工具结果'), 'the refusal must say the conclusion went back as a tool result')
    assert.ok(denied.error.includes('force'), 'the refusal must name the escape hatch')
    assert.equal(resumeGuard(toolRun, true).ok, true, 'the escape hatch must open for a tool run')
    assert.equal(resumeGuard(toolRun, true).forced, true)
    assert.equal(resumeGuard(toolRun, 'yes').ok, false, 'only a real boolean true may force a delivery')
    assert.equal(resumeGuard(undefined, false).ok, true, 'an unknown run is not a tool run')
    assert.equal(resumeGuard({}, false).ok, true, 'a run without the flag (a panel run) is allowed')
    const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    assert.ok(source.includes('const guard = resumeGuard(run, force)'),
      'the resume route must consult the gate, not re-implement it')
    assert.ok(source.includes('if (guard.ok !== true) {'), 'the route must honour a refused gate')
    assert.ok(source.includes('run.resumed = forced === true ? `${mode}(forced)` : mode'),
      'a forced delivery must be recorded distinguishably from a normal one')
  }

  /* ------------------------------------------------------------------ *
   * Settings contract: the `council` entry config, the council_review    *
   * default models, and the live (volatile) path the Settings page uses. *
   * ------------------------------------------------------------------ */

  /* `Config` keeps the four entry switches live: a `.volatile()` field reaches
     the plugin as a `{ get() }` source the loader rewrites in place
     (cordis-plugin-loader lib/index.js:513 gate, :526-558 commit), which is what
     makes a Settings-page write take effect without restarting the plugin. */
  {
    const defaults = Config(undefined)
    for (const name of ['toolEnabled', 'panelEnabled']) {
      assert.equal(typeof defaults[name].get, 'function', `${name} must be a live source (volatile)`)
      assert.equal(defaults[name].get(), true, `${name} must default to true`)
    }
    assert.deepEqual(defaults.defaultModels.get(), [], 'defaultModels must default to []')
    assert.equal(defaults.defaultChairman.get(), '', 'defaultChairman must default to ""')
    for (const name of ['toolEnabled', 'panelEnabled', 'defaultModels', 'defaultChairman']) {
      assert.equal(Config.dict[name].meta.volatile, true, `${name} must be declared .volatile()`)
    }
    /* The single `enabled` switch is gone in 0.2.27: one knob must not mute both
       the built-in tool and the external panel. */
    assert.equal(Object.hasOwn(Config.dict, 'enabled'), false, 'the old `enabled` field must be removed')
    /* The historical plugin-config keys stay ordinary: they may restart the
       plugin, but the schema must still declare and default them. */
    for (const name of ['contextMaxChars', 'filesMaxChars', 'codeMaxChars', 'skillDirs', 'attachRoots']) {
      assert.ok(Object.hasOwn(Config.dict, name), `Config must declare ${name}`)
      assert.notEqual(readSetting(defaults[name], undefined), undefined, `${name} must resolve`)
    }
    assert.equal(defaults.contextMaxChars, 6000, 'contextMaxChars keeps its documented default')
    assert.throws(() => Config({ toolEnabled: 'yes' }), 'toolEnabled must reject a non-boolean')
    assert.throws(() => Config({ panelEnabled: 'yes' }), 'panelEnabled must reject a non-boolean')
    assert.throws(() => Config({ defaultModels: 'deepseek/pro' }), 'defaultModels must reject a non-array')
    assert.throws(() => Config({ defaultChairman: 7 }), 'defaultChairman must reject a non-string')
  }

  /* `"<provider>/<model>"` parsing: legal specs resolve, malformed ones are
     refused with a defined result (undefined) rather than silently accepted. */
  {
    assert.deepEqual(parseRouteSpec('deepseek/pro'), { provider: 'deepseek', model: 'pro' })
    assert.deepEqual(parseRouteSpec('  providerA / modelB '), { provider: 'providerA', model: 'modelB' })
    assert.deepEqual(parseRouteSpec('openrouter/meta/llama'), { provider: 'openrouter', model: 'meta/llama' },
      'a model id may contain "/"')
    for (const bad of ['', '   ', 'no-slash', '/model', 'provider/', '/', ' / ']) {
      assert.equal(parseRouteSpec(bad), undefined, `malformed spec must be refused: ${JSON.stringify(bad)}`)
    }
    for (const bad of [undefined, null, 42, ['p', 'm'], { provider: 'p' }]) {
      assert.equal(parseRouteSpec(bad), undefined, `non-string spec must be refused: ${JSON.stringify(bad)}`)
    }
  }

  const settingsCatalog = {
    providers: [
      { id: 'deepseek', name: 'DeepSeek', models: [
        { id: 'pro', name: 'DeepSeek-V4-Pro' },
        { id: 'flash', name: 'DeepSeek-V4.1-Flash' },
      ] },
      { id: 'providerA', name: 'providerA', models: [
        { id: 'glm', name: 'modelB' },
        { id: 'modelA', name: 'modelA' },
      ] },
    ],
  }

  /* defaultModels is synced against the live catalog: unknown/unparsable entries
     are reported and dropped, duplicates collapse, order is preserved. */
  {
    const resolved = resolveConfiguredRoutes(settingsCatalog, ['deepseek/pro', 'providerA/glm', 'ghost/x', 'deepseek/pro'])
    assert.deepEqual(resolved.routes.map((route) => route.key), ['deepseek|pro', 'providerA|glm'],
      'catalog-synced specs resolve once each')
    assert.equal(resolved.problems.length, 1, 'the unknown spec is reported')
    assert.ok(resolved.problems[0].includes('ghost/x'), 'the report names the offending spec')

    const malformed = resolveConfiguredRoutes(settingsCatalog, ['providerA', '/glm', 'glm/'])
    assert.equal(malformed.routes.length, 0, 'malformed specs resolve to nothing')
    assert.equal(malformed.problems.length, 3, 'each malformed spec is reported')
  }

  /* Selection precedence: explicit args, then defaultModels, then the
     heterogeneous auto-pick. */
  {
    const configured = selectCouncilRoutes(settingsCatalog, undefined, ['providerA/glm', 'deepseek/flash'])
    assert.equal(configured.source, 'default', 'a non-empty defaultModels selects the default branch')
    assert.deepEqual(configured.routes.map((route) => route.key), ['providerA|glm', 'deepseek|flash'],
      'defaultModels order is used verbatim, not re-picked')

    const empty = selectCouncilRoutes(settingsCatalog, undefined, [])
    assert.equal(empty.source, 'auto', 'an empty defaultModels keeps the auto-pick')
    const autoProviders = new Set(empty.routes.map((route) => route.provider))
    const autoNames = new Set(empty.routes.map((route) => route.name))
    assert.ok(empty.routes.length >= 2 && empty.routes.length <= 3, `auto-pick size: ${empty.routes.length}`)
    assert.equal(autoProviders.size, empty.routes.length, 'auto-pick must not repeat a provider')
    assert.equal(autoNames.size, empty.routes.length, 'auto-pick must not repeat a model name')

    const explicit = selectCouncilRoutes(settingsCatalog, [{ provider: 'deepseek', model: 'pro' }], ['providerA/glm'])
    assert.equal(explicit.source, 'explicit', 'explicit models select the explicit branch')
    assert.deepEqual(explicit.routes.map((route) => route.key), ['deepseek|pro'], 'explicit models win over defaultModels')

    const unknown = selectCouncilRoutes(settingsCatalog, [{ provider: 'nope', model: 'x' }], [])
    assert.equal(unknown.source, 'explicit')
    assert.deepEqual(unknown.problems, ['unknown model: nope/x'], 'an unknown explicit model is named')

    const unusable = selectCouncilRoutes(settingsCatalog, undefined, ['nope/x'])
    assert.equal(unusable.source, 'default', 'a set-but-unusable defaultModels stays on the default branch')
    assert.equal(unusable.routes.length, 0, 'nothing resolves, so nothing is selected silently')

    const capped = selectCouncilRoutes(settingsCatalog, undefined, ['deepseek/pro', 'deepseek/flash', 'providerA/glm', 'providerA/modelA'])
    assert.ok(capped.routes.length <= 6, `MAX_MODELS cap: ${capped.routes.length}`)
  }

  /* defaultChairman: honoured only when it is one of the participants, and a
     fallback is reported rather than silently swapped. */
  {
    const selected = resolveConfiguredRoutes(settingsCatalog, ['deepseek/pro', 'providerA/glm']).routes
    assert.equal(pickChairmanRoute(settingsCatalog, selected, '').key, 'deepseek|pro',
      'an empty defaultChairman elects the first participant')
    assert.equal(pickChairmanRoute(settingsCatalog, selected, 'providerA/glm').key, 'providerA|glm',
      'a configured chairman inside the roster is honoured')
    assert.equal(pickChairmanRoute(settingsCatalog, selected, 'nope/x').key, 'deepseek|pro',
      'a chairman absent from the catalog falls back')
    assert.equal(pickChairmanRoute(settingsCatalog, selected, 'providerA/modelA').key, 'deepseek|pro',
      'a chairman outside the roster falls back')
    assert.equal(pickChairmanRoute(settingsCatalog, selected, 'providerA').key, 'deepseek|pro',
      'a malformed chairman falls back')

    /* pickChairmanRoute stays a thin wrapper: same route for the very inputs
       asserted above, so the new problem reporting cannot drift the election. */
    for (const spec of ['', 'providerA/glm', 'nope/x', 'providerA/modelA', 'providerA']) {
      assert.equal(pickChairmanRoute(settingsCatalog, selected, spec).key,
        chairmanSelection(settingsCatalog, selected, spec).route.key,
        `pickChairmanRoute must mirror chairmanSelection for ${JSON.stringify(spec)}`)
    }

    /* task-10: ONE decision point for both entries. Explicit request > configured
       default > first participant (with "nothing configured" NOT reported as a
       problem). This is the rule the panel used to bypass entirely. */
    {
      const explicit = chairmanForRequest(settingsCatalog, selected, 'deepseek/pro', 'providerA/glm')
      assert.equal(explicit.route.key, 'deepseek|pro', 'an explicit request beats the configured default')
      assert.equal(explicit.problem, '', 'an honoured explicit request reports no problem')

      const byDefault = chairmanForRequest(settingsCatalog, selected, '', 'providerA/glm')
      assert.equal(byDefault.route.key, 'providerA|glm', 'with no request the configured default is used')
      assert.equal(byDefault.problem, '', 'an honoured configured default reports no problem')

      const unset = chairmanForRequest(settingsCatalog, selected, '', '')
      assert.equal(unset.route.key, 'deepseek|pro', 'an empty setting keeps the first-participant election')
      assert.equal(unset.problem, '', '"not configured" is not a problem to report')

      const unusable = chairmanForRequest(settingsCatalog, selected, '', 'providerA/modelA')
      assert.equal(unusable.route.key, 'deepseek|pro', 'an unusable configured default falls back')
      assert.equal(unusable.problem, '主席 "providerA/modelA" 不在本次参与者名单里，已回退到第一个参与者',
        'a configured-but-unusable default must be reported, never swapped in silence')

      const malformed = chairmanForRequest(settingsCatalog, selected, '', 'providerA')
      assert.equal(malformed.route.key, 'deepseek|pro', 'a malformed configured default falls back')
      assert.ok(malformed.problem.includes('无法解析'), 'and it says the spec was unparsable')

      for (const [requested, configured, expected] of [
        [undefined, 'providerA/glm', 'providerA|glm'],
        [null, 'providerA/glm', 'providerA|glm'],
        ['  ', 'providerA/glm', 'providerA|glm'],
        [undefined, undefined, 'deepseek|pro'],
      ]) {
        assert.equal(chairmanForRequest(settingsCatalog, selected, requested, configured).route.key, expected,
          `non-string/blank request + ${String(configured)} must resolve to ${expected}`)
      }
      /* No-explicit-request must be IDENTICAL to the historical selection, for every
         spec the old code accepted: that is what keeps empty defaults unchanged. */
      for (const spec of ['', 'providerA/glm', 'nope/x', 'providerA/modelA', 'providerA']) {
        assert.deepEqual(chairmanForRequest(settingsCatalog, selected, '', spec),
          chairmanSelection(settingsCatalog, selected, spec),
          `chairmanForRequest('', ${JSON.stringify(spec)}) must mirror chairmanSelection`)
      }
    }

    /* The three branches of chairmanSelection. The reason matters as much as the
       route: a silent swap is what hid a misconfigured chairman from its user. */
    const inside = chairmanSelection(settingsCatalog, selected, 'providerA/glm')
    assert.equal(inside.route.key, 'providerA|glm', 'a chairman inside the roster is elected')
    assert.equal(inside.problem, '', 'an honoured chairman reports no problem')

    const offRoster = chairmanSelection(settingsCatalog, selected, 'providerA/modelA')
    assert.equal(offRoster.route.key, 'deepseek|pro',
      'a chairman in the catalog but outside the roster falls back to the first participant')
    assert.equal(offRoster.problem, '主席 "providerA/modelA" 不在本次参与者名单里，已回退到第一个参与者',
      'a chairman outside the roster must be reported, not silently swapped')

    const offCatalog = chairmanSelection(settingsCatalog, selected, 'nope/x')
    assert.equal(offCatalog.route.key, 'deepseek|pro', 'a chairman absent from the catalog falls back')
    assert.equal(offCatalog.problem, '主席 "nope/x" 不在当前模型目录中，已回退到第一个参与者',
      'a chairman absent from the catalog must be reported')

    /* Unset is the documented election, not a misconfiguration; malformed is a
       misconfiguration and is named. */
    const unset = chairmanSelection(settingsCatalog, selected, '')
    assert.equal(unset.route.key, 'deepseek|pro', 'an empty defaultChairman keeps electing the first participant')
    assert.equal(unset.problem, '', 'an unset chairman must not raise a problem')
    const malformed = chairmanSelection(settingsCatalog, selected, 'providerA')
    assert.equal(malformed.route.key, 'deepseek|pro', 'a malformed chairman falls back')
    assert.ok(malformed.problem.includes('无法解析'),
      `a malformed chairman spec must be reported as unparsable, got ${JSON.stringify(malformed.problem)}`)
  }

  /* The reader behind both switches: plain values and live sources behave alike,
     and an in-place write to a live source is observed without re-reading the row. */
  {
    const write = Symbol.for('cosmokit.volatile.write')
    const live = (value) => { let current = value; return { get: () => current, [write]: (next) => { current = next } } }
    assert.equal(toolEnabled({}), true, 'toolEnabled defaults to true when unset')
    assert.equal(panelEnabled({}), true, 'panelEnabled defaults to true when unset')
    assert.equal(toolEnabled({ toolEnabled: false }), false)
    assert.equal(panelEnabled({ panelEnabled: false }), false)
    assert.equal(toolEnabled(undefined), true)
    assert.equal(toolEnabled({ toolEnabled: 'no' }), true, 'only an explicit false disables the tool')
    assert.equal(panelEnabled({ panelEnabled: 'no' }), true, 'only an explicit false disables the panel')
    /* The two switches are independent: one being off must not read the other. */
    assert.equal(toolEnabled({ toolEnabled: false, panelEnabled: true }), false)
    assert.equal(panelEnabled({ toolEnabled: false, panelEnabled: true }), true,
      'toolEnabled must not mute the panel')
    assert.equal(toolEnabled({ toolEnabled: true, panelEnabled: false }), true,
      'panelEnabled must not mute the tool')
    const source = live(true)
    assert.equal(toolEnabled({ toolEnabled: source }), true)
    source[write](false)
    assert.equal(toolEnabled({ toolEnabled: source }), false, 'a live source is observed after an in-place write')
  }

  /* Drive the real `apply` through a fake cordis context: the tool is registered,
     the council is started, and every model call fails at once — the roster the
     tool selected is the contract under test, not a provider round-trip. */
  {
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = join(root, 'dsh-home')
    await mkdir(process.env.DSH_HOME, { recursive: true })
    /* A run restored from the registry file has no frozen plan (it predates these
       fields, or the Host restarted). The snapshot must still describe it, because
       the client must never have to branch on `undefined` for an old run. */
    await writeFile(join(process.env.DSH_HOME, 'council-runs.json'), JSON.stringify({
      version: 1,
      runs: [{
        id: 'chistory1', sessionId: 's-historic', status: 'done', stage: 'done',
        question: 'historic probe', createdAt: Date.now() - 60000, seatMode: 'llm', error: '',
      }],
    }), 'utf8')
    const providers = [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'providerA', name: 'providerA' }]
    const models = {
      deepseek: [{ id: 'pro', name: 'DeepSeek-V4-Pro' }, { id: 'flash', name: 'DeepSeek-V4.1-Flash' }],
      providerA: [{ id: 'glm', name: 'modelB' }, { id: 'modelA', name: 'modelA' }],
    }
    /**
     * `inbox` (optional) turns the fake `ctx.agents` into a live delivery target:
     * `resumeRun` needs a resolvable agent, and the delivery test must see WHICH
     * slot (`inject` = silent / `followup` = wake) was used and how many times.
     */
    const fakeHost = (config, streamImpl, inbox) => {
      const state = { tool: undefined, server: undefined }
      const ctx = {
        effect: (fn) => { fn(); return () => {} },
        on: () => {},
        get: () => undefined,
        agents: {
          get: (id) => (Array.isArray(inbox)
            ? {
              id,
              inject: (message) => inbox.push({ via: 'inject', mode: 'silent', id, text: message.content[0].text }),
              followup: (message) => inbox.push({ via: 'followup', mode: 'wake', id, text: message.content[0].text }),
            }
            : undefined),
          list: () => [],
        },
        subagents: {},
        tools: { register: (tool) => { state.tool = tool; return () => {} } },
        webServer: { register: (registration) => { state.server = registration; return () => {} } },
        llm: {
          listProviders: () => providers,
          listModels: async (id) => models[id] ?? [],
          stream: typeof streamImpl === 'function'
            ? streamImpl
            : () => { throw new Error('fake provider down') },
        },
      }
      apply(ctx, config)
      return state
    }
    const roster = async (state) => (await state.tool.execute({ question: 'roster probe', attachFiles: false }, {})).models
    /* Minimal request/response doubles for the registered HTTP prefix: the
       handler needs `method`/`url`, an event emitter (body + SSE close) and a
       writable response. readBody()/SSE register their listeners in the order
       data → error → end / close, so firing on registration reproduces a
       complete body. */
    const fakeReq = (method, url, body) => ({
      method,
      url,
      on(event, handler) {
        if (event === 'data' && typeof body === 'string' && body !== '') handler(Buffer.from(body))
        if (event === 'end' && body !== undefined) handler()
        return this
      },
    })
    const fakeRes = () => ({
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, value) { this.headers[name] = value },
      writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers ?? {}) },
      write(chunk) { this.body += String(chunk) },
      end(chunk) { if (chunk !== undefined) this.body += String(chunk) },
    })
    const http = async (state, method, url, body) => {
      const res = fakeRes()
      await state.server.handler(fakeReq(method, url, body), res)
      let json
      try { json = JSON.parse(res.body) } catch { json = undefined }
      return { status: res.statusCode, json, text: res.body }
    }
    const write = Symbol.for('cosmokit.volatile.write')

    try {
      /* A configured list is used verbatim; the auto-pick would give
         deepseek/pro + providerA/glm instead. */
      const configured = fakeHost(Config({ defaultModels: ['providerA/glm', 'deepseek/flash'] }))
      assert.deepEqual(await roster(configured), ['providerA/glm', 'deepseek/flash'],
        'council_review must use defaultModels instead of the auto-pick')

      /* The run restored from the registry file (see the fixture above) must be
         described by the same fields, derived for its own roster, instead of
         shipping `undefined` to the panel. */
      {
        const listed = await http(configured, 'GET', '/council/runs?sessionId=s-historic')
        assert.equal(listed.status, 200, 'GET /council/runs must stay readable')
        assert.equal(listed.json.runs.length, 1, 'the persisted fixture run must be restored')
        const historic = listed.json.runs[0]
        assert.equal(historic.id, 'chistory1')
        assert.ok(historic.providerWaves !== null && typeof historic.providerWaves === 'object',
          'a run with no frozen plan must still snapshot a providerWaves object')
        assert.equal(historic.providerWaves.concurrency, PROVIDER_CONCURRENCY,
          'a historic run is described with the default slot count')
        assert.equal(historic.providerWaves.advice, '', 'an empty roster has no wave advice')
        assert.ok(historic.budgetPlan !== null && typeof historic.budgetPlan === 'object',
          'a run with no frozen plan must still snapshot a budgetPlan object')
        assert.equal(historic.budgetPlan.totalMs, RUN_TIMEOUT_MS,
          'a historic run is described with the default run budget')
        assert.equal(historic.budgetPlan.stages.chairman.skipped, false)
        assert.equal(typeof historic.budgetPlan.stages.chairman.floorMs, 'number')
        for (const name of ['answers', 'reviews', 'chairman']) {
          assert.equal(typeof historic.budgetPlan.stages[name].share, 'number',
            `a historic run must still carry stages.${name}.share as a number`)
          assert.ok(historic.budgetPlan.stages[name].share > 0 && historic.budgetPlan.stages[name].share <= 1,
            `stages.${name}.share must stay a 0-1 fraction`)
        }
      }

      /* A Settings write to the new knobs must reach the NEXT run without a plugin
         restart: that is what `.volatile()` buys, and it is why the resolved values
         are frozen per run instead of being pinned inside `apply`. */
      {
        const liveTune = Config({ defaultModels: ['providerA/glm', 'providerA/modelA'] })
        const tuned = fakeHost(liveTune)
        liveTune.providerConcurrency[write](1)
        await roster(tuned)
        const tunedRun = (await http(tuned, 'GET', '/council/runs?sessionId=')).json.runs[0]
        assert.equal(tunedRun.providerWaves.concurrency, 1,
          'a live providerConcurrency write must reach the next run without a restart')
        assert.equal(tunedRun.providerWaves.stages.answers.waves, 2, '2 seats on a live 1-slot setting = 2 waves')
        /* The budget must also reach the ACTUAL provider call, per stage. */
        const seenTokens = []
        const liveBudget = Config({ defaultModels: ['providerA/glm'] })
        const tokenHost = fakeHost(liveBudget, async function* (request) {
          seenTokens.push(request.maxTokens)
          yield { type: 'text-delta', text: 'ok' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        })
        liveBudget.answerMaxTokens[write](8192)
        await roster(tokenHost)
        assert.deepEqual(seenTokens, [8192, REVIEW_MAX_TOKENS, CHAIRMAN_MAX_TOKENS],
          'a live answerMaxTokens write must reach the answer seat only; reviews/chairman keep their budgets')
      }

      /* No configured list keeps the heterogeneous auto-pick. */
      const auto = fakeHost(Config({}))
      const autoRoster = await roster(auto)
      assert.equal(new Set(autoRoster.map((row) => row.split('/')[0])).size, autoRoster.length,
        `auto roster must stay heterogeneous: ${JSON.stringify(autoRoster)}`)

      /* A Settings-page write reaches an already-registered tool: the loader
         rewrites the same live source, so `apply` is not re-run. */
      const liveConfig = Config({})
      const hot = fakeHost(liveConfig)
      liveConfig.defaultModels[write](['providerA/glm'])
      assert.deepEqual(await roster(hot), ['providerA/glm'],
        'a settings write must change the roster without a plugin restart')

      /* toolEnabled=false refuses with a reason that names the right setting. */
      const off = fakeHost(Config({ toolEnabled: false }))
      await assert.rejects(off.tool.execute({ question: 'x', attachFiles: false }, {}), /启用 council_review 工具/,
        'a disabled tool must refuse and name the toolEnabled setting')

      /* The same refusal after a live write, on an already-registered tool. */
      const liveOn = Config({})
      const hotOff = fakeHost(liveOn)
      liveOn.toolEnabled[write](false)
      await assert.rejects(hotOff.tool.execute({ question: 'x', attachFiles: false }, {}), /启用 council_review 工具/,
        'a live tool disable must reach an already-registered tool')

      /* A set-but-unusable defaultModels refuses loudly instead of silently
         auto-picking. */
      const typo = fakeHost(Config({ defaultModels: ['providerA'] }))
      await assert.rejects(typo.tool.execute({ question: 'x', attachFiles: false }, {}),
        /defaultModels 中没有可用模型/, 'an unparsable defaultModels must fail loudly')

      /* defaultChairman is recorded on the run and served to the panel. */
      const chaired = fakeHost(Config({ defaultModels: ['deepseek/pro', 'providerA/glm'], defaultChairman: 'providerA/glm' }))
      await roster(chaired)
      const run = (await http(chaired, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(run.chairman.key, 'providerA|glm', 'defaultChairman must become the chairman')
      assert.equal(run.structure.roles.arbiter, 'providerA|glm', 'the arbiter role must follow the chairman')

      /* The snapshot must expose the four fields the client uses to tell a
         tool-started run from a panel one and to show a roster/chairman
         fallback: without `toolRun` the panel re-delivers a conclusion the tool
         already returned, and without `chairmanProblem` a silent swap is hidden. */
      assert.equal(run.toolRun, true, 'a tool-started run must snapshot toolRun=true')
      assert.equal(run.modelSource, 'default', 'the snapshot must expose which branch picked the roster')
      assert.deepEqual(run.defaultModelProblems, [], 'a clean defaultModels must report no problems')
      assert.equal(run.chairmanProblem, '', 'an honoured chairman must report no problem')

      /* The snapshot must EXPLAIN the latency, not only report a duration: which
         slots this run planned with, how many waves each stage needs, and what each
         stage was allowed / consumed. Both fields are frozen onto the run, so a
         mid-run Settings write cannot desync the plan from the behaviour. */
      assert.ok(Object.hasOwn(run, 'providerWaves'), 'the snapshot must carry providerWaves')
      assert.ok(Object.hasOwn(run, 'budgetPlan'), 'the snapshot must carry budgetPlan')
      assert.equal(run.providerWaves.concurrency, PROVIDER_CONCURRENCY,
        'the default snapshot must report the default slot count')
      assert.equal(typeof run.providerWaves.maxWaves, 'number')
      assert.equal(typeof run.providerWaves.advice, 'string', 'providerWaves.advice must be a string, never null')
      for (const name of ['answers', 'reviews', 'chairman']) {
        const stage = run.providerWaves.stages[name]
        assert.ok(stage !== undefined && stage !== null, `providerWaves.stages.${name} must exist`)
        for (const field of ['seats', 'slots', 'waves']) {
          assert.equal(typeof stage[field], 'number', `providerWaves.stages.${name}.${field} must be a number`)
        }
        assert.ok(Array.isArray(stage.byProvider), `providerWaves.stages.${name}.byProvider must be an array`)
      }
      /* One seat per provider in this roster: one wave, so no advice line. */
      assert.equal(run.providerWaves.stages.answers.waves, 1)
      assert.equal(run.providerWaves.advice, '')
      assert.equal(run.budgetPlan.totalMs, RUN_TIMEOUT_MS, 'the default run budget must still be 30 minutes')
      assert.equal(run.deadlineAt - run.createdAt, RUN_TIMEOUT_MS,
        'the run deadline must follow the frozen budget')
      assert.equal(run.budgetPlan.stages.answers.share, 0.45)
      assert.equal(run.budgetPlan.stages.reviews.share, 0.35)
      assert.equal(run.budgetPlan.stages.chairman.share, 0.2)
      assert.equal(run.budgetPlan.stages.chairman.skipped, false, 'a run with budget left must not be marked skipped')
      assert.equal(run.budgetPlan.stages.chairman.reason, '')
      for (const name of ['answers', 'reviews', 'chairman']) {
        for (const field of ['share', 'budgetMs', 'usedMs', 'startedAt', 'endedAt', 'deadlineAt', 'capped', 'cappedReason']) {
          assert.ok(Object.hasOwn(run.budgetPlan.stages[name], field),
            `budgetPlan.stages.${name}.${field} must be present in every snapshot`)
        }
        /* The client prints the split from `share` and skips the whole line when one
           share is missing, so all three must be present 0-1 fractions. */
        assert.ok(run.budgetPlan.stages[name].share > 0 && run.budgetPlan.stages[name].share <= 1,
          `budgetPlan.stages.${name}.share must be a 0-1 fraction`)
      }

      /* The measured complaint ("council 不好用", no visible reason) is now answered
         inside the tool result: two seats on ONE provider with ONE slot means two
         waves per stage, and the conclusion says so in one line. */
      const slowRoster = fakeHost(Config({
        defaultModels: ['providerA/glm', 'providerA/modelA'],
        providerConcurrency: 1,
      }))
      const slowResult = await slowRoster.tool.execute({ question: 'wave probe', attachFiles: false }, {})
      const slowRun = (await http(slowRoster, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(slowRun.providerWaves.concurrency, 1,
        'the providerConcurrency setting must reach the frozen plan')
      assert.equal(slowRun.providerWaves.stages.answers.waves, 2, '2 seats on 1 slot = 2 waves')
      assert.equal(slowRun.providerWaves.maxWaves, 2)
      assert.ok(slowResult.conclusion.includes('注意：同 provider "providerA" 2 席 > 槽位 1，每阶段将跑 2 波'),
        `the tool conclusion must carry the one-line wave advice; got ${JSON.stringify(slowResult.conclusion)}`)
      assert.ok(slowResult.conclusion.includes('掺入第二 provider 可降为一波'),
        'the advice must say what to change, not only that something is slow')

      /* Settings clamps: an absurd slot count must not create a wall-clock stall,
         and a zero must not deadlock the slot gate. */
      const clampedHigh = fakeHost(Config({ defaultModels: ['providerA/glm'], providerConcurrency: 99 }))
      await roster(clampedHigh)
      const clampedHighRun = (await http(clampedHigh, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(clampedHighRun.providerWaves.concurrency, PROVIDER_CONCURRENCY_MAX,
        'an absurd slot count must clamp to the declared ceiling')
      const clampedZero = fakeHost(Config({ defaultModels: ['providerA/glm'], providerConcurrency: 0 }))
      await roster(clampedZero)
      const clampedZeroRun = (await http(clampedZero, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(clampedZeroRun.providerWaves.concurrency, PROVIDER_CONCURRENCY,
        'a zero slot count must fall back to the default instead of deadlocking the slot gate')

      /* A lowered run budget must reach the plan AND the deadline together. */
      const shortRun = fakeHost(Config({ defaultModels: ['providerA/glm'], runBudgetMs: 10 * 60 * 1000 }))
      await roster(shortRun)
      const shortRunSnap = (await http(shortRun, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(shortRunSnap.budgetPlan.totalMs, 10 * 60 * 1000, 'runBudgetMs must reach the frozen plan')
      assert.equal(shortRunSnap.deadlineAt - shortRunSnap.createdAt, 10 * 60 * 1000,
        'the deadline must follow runBudgetMs, not the 30-minute constant')
      assert.equal(shortRunSnap.budgetPlan.stages.answers.budgetMs, 270000, '45% of a 10-minute budget')
      const tinyRun = fakeHost(Config({ defaultModels: ['providerA/glm'], runBudgetMs: 1000 }))
      await roster(tinyRun)
      const tinyRunSnap = (await http(tinyRun, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(tinyRunSnap.budgetPlan.totalMs, RUN_BUDGET_MIN_MS,
        'an unusably small run budget must clamp to the declared floor, not to zero')

      /* Happy path against a scripted provider: the three stages actually complete,
         so the budget bookkeeping is exercised on a run that FINISHES. A healthy run
         must never be reported as capped or skipped, and its conclusion must carry
         no degradation notice — otherwise the new fields would cry wolf every time. */
      const healthy = fakeHost(
        Config({ defaultModels: ['providerA/glm', 'deepseek/pro'] }),
        async function* () {
          yield { type: 'text-delta', text: 'ok' }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      )
      const healthyResult = await healthy.tool.execute({ question: 'healthy probe', attachFiles: false }, {})
      assert.equal(healthyResult.models.length, 2, 'the scripted provider keeps the whole roster')
      const healthyRun = (await http(healthy, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(healthyRun.status, 'done', `a scripted provider must finish all three stages; got ${JSON.stringify(healthyRun.error)}`)
      assert.equal(healthyRun.stopReason, 'completed')
      assert.equal(healthyRun.chairman.done, true, 'the chairman stage must have run')
      assert.equal(healthyRun.chairman.text, 'ok')
      assert.equal(healthyRun.budgetPlan.stages.chairman.skipped, false,
        'a healthy run must not be marked as a skipped chairman')
      assert.equal(healthyRun.budgetPlan.stages.chairman.reason, '')
      for (const name of ['answers', 'reviews', 'chairman']) {
        const stage = healthyRun.budgetPlan.stages[name]
        assert.ok(stage.startedAt > 0, `budgetPlan.stages.${name}.startedAt must be set on a completed run`)
        assert.ok(stage.endedAt >= stage.startedAt, `budgetPlan.stages.${name} must be closed`)
        assert.equal(stage.capped, false, `budgetPlan.stages.${name} must not be capped on a fast run`)
        assert.equal(stage.cappedReason, '')
      }
      /* The chairman's 20% is a FLOOR, not a ceiling: after a fast answer+review the
         chairman must still be allowed the whole remaining run budget (the old
         behaviour). Capping it at its own share would trade starvation for a new
         timeout. */
      assert.equal(healthyRun.budgetPlan.stages.chairman.deadlineAt, healthyRun.createdAt + RUN_TIMEOUT_MS,
        'the chairman must be allowed the whole remaining run budget, not 20% of it')
      assert.ok(healthyRun.budgetPlan.stages.answers.deadlineAt < healthyRun.createdAt + RUN_TIMEOUT_MS,
        'the answer stage must still be capped at its sub-budget deadline')
      assert.equal(healthyRun.budgetPlan.stages.answers.deadlineAt,
        healthyRun.budgetPlan.stages.answers.startedAt + 810000,
        'the answer sub-budget deadline is its own start plus 45% of the run budget')
      assert.equal(healthyResult.conclusion.includes('注意：'), false,
        `a healthy run must carry no degradation notice; got ${JSON.stringify(healthyResult.conclusion)}`)
      assert.ok(healthyResult.conclusion.includes('（参与模型：modelB、DeepSeek-V4-Pro；runId: '),
        `a healthy run must still end with the participant line; got ${JSON.stringify(healthyResult.conclusion)}`)

      /* A configured chairman that cannot be honoured is no longer silent: the
         run records the reason and the tool's own conclusion carries it. */
      const badChair = fakeHost(Config({
        defaultModels: ['deepseek/pro', 'providerA/glm'],
        defaultChairman: 'nope/x',
      }))
      const badResult = await badChair.tool.execute({ question: 'chairman probe', attachFiles: false }, {})
      assert.deepEqual(badResult.models, ['deepseek/pro', 'providerA/glm'],
        'the fallback chairman must not change the participant roster')
      const badRun = (await http(badChair, 'GET', '/council/runs?sessionId=')).json.runs[0]
      assert.equal(badRun.chairman.key, 'deepseek|pro', 'the fallback chairman must be the first participant')
      assert.equal(badRun.chairmanProblem, '主席 "nope/x" 不在当前模型目录中，已回退到第一个参与者',
        'the run snapshot must carry the chairman problem')
      assert.ok(badResult.conclusion.includes('（注意：主席 "nope/x" 不在当前模型目录中，已回退到第一个参与者）'),
        `the tool conclusion must surface the chairman problem; got ${JSON.stringify(badResult.conclusion)}`)

      /* A panel-created run leaves all four fields unset, so it pins the snapshot
         defaults (never `undefined`). */
      const panelCreated = await http(chaired, 'POST', '/council/run', JSON.stringify({
        question: 'panel probe',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        attachFiles: false,
      }))
      assert.equal(panelCreated.status, 200, `a panel run must start; body=${JSON.stringify(panelCreated.json)}`)
      const panelRun = (await http(chaired, 'GET', `/council/run/${panelCreated.json.runId}`)).json
      assert.equal(panelRun.toolRun, false, 'a panel-created run must snapshot toolRun=false')
      assert.equal(panelRun.modelSource, '', 'an unset modelSource must snapshot as ""')
      assert.deepEqual(panelRun.defaultModelProblems, [], 'an unset defaultModelProblems must snapshot as []')
      assert.equal(panelRun.chairmanProblem, '', 'an unset chairmanProblem must snapshot as ""')
      /* The panel path freezes the same plan, and its wave count follows the actual
         reviewer list (which may be a subset of the answerers). */
      assert.ok(Object.hasOwn(panelRun, 'providerWaves') && Object.hasOwn(panelRun, 'budgetPlan'),
        'a panel-created run must carry providerWaves and budgetPlan too')
      assert.equal(panelRun.providerWaves.stages.reviews.seats, 2,
        'the panel wave plan must follow the reviewer list')
      assert.equal(panelRun.budgetPlan.totalMs, RUN_TIMEOUT_MS)

      /* A panel-started run that picks a chairman outside its own roster must not
         swap it in silence either: the reason lands on the same `chairmanProblem`
         field the tool path uses, while the fallback election is unchanged and
         `toolRun` stays false so the panel still delivers its conclusion. */
      const panelChair = await http(chaired, 'POST', '/council/run', JSON.stringify({
        question: 'panel chairman probe',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        chairman: { provider: 'providerA', model: 'modelA' },
        attachFiles: false,
      }))
      assert.equal(panelChair.status, 200, `a panel run with a chairman must start; body=${JSON.stringify(panelChair.json)}`)
      const panelChairRun = (await http(chaired, 'GET', `/council/run/${panelChair.json.runId}`)).json
      assert.equal(panelChairRun.toolRun, false, 'a panel-created run must stay toolRun=false')
      assert.equal(panelChairRun.chairman.key, 'deepseek|pro',
        'a chairman outside the roster must still fall back to the first participant')
      assert.equal(panelChairRun.chairmanProblem,
        '主席 "providerA/modelA" 不在本次参与者名单里，已回退到第一个参与者',
        'a panel chairman outside the roster must be reported, not swapped in silence')

      /* An unresolvable panel chairman is reported on the same field. */
      const panelGhost = await http(chaired, 'POST', '/council/run', JSON.stringify({
        question: 'panel ghost chairman',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        chairman: { provider: 'ghost', model: 'x' },
        attachFiles: false,
      }))
      assert.equal(panelGhost.status, 200, 'a panel run with an unknown chairman must still start')
      const panelGhostRun = (await http(chaired, 'GET', `/council/run/${panelGhost.json.runId}`)).json
      assert.equal(panelGhostRun.chairmanProblem,
        '主席 "ghost/x" 不在当前模型目录中，已回退到第一个参与者',
        'an unresolvable panel chairman must be reported')

      /* Regression: an honoured panel chairman reports nothing. */
      const panelHonoured = await http(chaired, 'POST', '/council/run', JSON.stringify({
        question: 'panel honoured chairman',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        chairman: { provider: 'providerA', model: 'glm' },
        attachFiles: false,
      }))
      assert.equal(panelHonoured.status, 200, 'a panel run with a valid chairman must start')
      const panelHonouredRun = (await http(chaired, 'GET', `/council/run/${panelHonoured.json.runId}`)).json
      assert.equal(panelHonouredRun.chairman.key, 'providerA|glm', 'an honoured panel chairman must serve')
      assert.equal(panelHonouredRun.chairmanProblem, '', 'an honoured panel chairman must report no problem')

      /* ------------------------------------------------------------------ *
       * task-10: the PANEL must honour the `defaultChairman` setting too.   *
       * Measured defect (v70, panel entry, 5 seats, no `chairman` in the    *
       * body): chairman came back as `bohrium|hy4` while the setting said   *
       * `bohrium/kimi-k3`, and `chairmanProblem` was '' — "no problem" for a *
       * chairman nobody asked for. The setting worked on the tool path only. *
       * ------------------------------------------------------------------ */
      {
        /* Same configuration, both entries: the panel used to ignore the setting and
           take the first participant, so this equality is the regression lock. */
        const bothPaths = fakeHost(Config({
          defaultModels: ['deepseek/pro', 'providerA/glm'],
          defaultChairman: 'providerA/glm',
        }))
        const panelDefault = await http(bothPaths, 'POST', '/council/run', JSON.stringify({
          question: 'panel default chairman probe',
          models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
          attachFiles: false,
        }))
        assert.equal(panelDefault.status, 200, `the panel run must start; body=${JSON.stringify(panelDefault.json)}`)
        const panelDefaultRun = (await http(bothPaths, 'GET', `/council/run/${panelDefault.json.runId}`)).json
        assert.equal(panelDefaultRun.chairman.key, 'providerA|glm',
          'a panel run with NO chairman in the body must honour the defaultChairman SETTING')
        assert.equal(panelDefaultRun.chairmanProblem, '',
          'an honoured configured default must report no problem (it was honoured, not substituted)')
        assert.notEqual(panelDefaultRun.chairman.key, panelDefaultRun.answers[0].key,
          'the configured default must actually beat "first participant"')
        /* The tool path, same settings: both entries must agree. */
        const toolDefault = await bothPaths.tool.execute(
          { question: 'tool default chairman probe', attachFiles: false },
          { agent: { id: 'sess-both-paths' } },
        )
        const toolDefaultRun = (await http(bothPaths, 'GET', `/council/run/${toolDefault.runId}`)).json
        assert.equal(toolDefaultRun.chairman.key, panelDefaultRun.chairman.key,
          'the tool path and the panel path must elect the SAME chairman for the same settings')
        assert.equal(toolDefaultRun.chairmanProblem, panelDefaultRun.chairmanProblem,
          'and they must agree about whether that chairman was a fallback')

        /* A configured default that is in the catalog but NOT in this roster must be
           reported on the panel too — the panel used to have no problem field set at
           all, so a substitution was invisible on the entry the user actually uses. */
        const badDefault = fakeHost(Config({
          defaultModels: ['deepseek/pro'],
          defaultChairman: 'providerA/modelA',
        }))
        const badDefaultPanel = await http(badDefault, 'POST', '/council/run', JSON.stringify({
          question: 'panel bad default chairman probe',
          models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
          attachFiles: false,
        }))
        const badDefaultRun = (await http(badDefault, 'GET', `/council/run/${badDefaultPanel.json.runId}`)).json
        assert.equal(badDefaultRun.chairman.key, 'deepseek|pro',
          'an unusable configured default falls back to the first participant')
        assert.equal(badDefaultRun.chairmanProblem,
          '主席 "providerA/modelA" 不在本次参与者名单里，已回退到第一个参与者',
          'a configured-but-unusable default must be REPORTED on the panel path, not swapped in silence')

        /* An empty setting keeps the historical election AND reports no problem. */
        const noDefault = fakeHost(Config({ defaultModels: ['deepseek/pro', 'providerA/glm'] }))
        const noDefaultPanel = await http(noDefault, 'POST', '/council/run', JSON.stringify({
          question: 'panel no default chairman probe',
          models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
          attachFiles: false,
        }))
        const noDefaultRun = (await http(noDefault, 'GET', `/council/run/${noDefaultPanel.json.runId}`)).json
        assert.equal(noDefaultRun.chairman.key, 'deepseek|pro',
          'with no defaultChairman configured the first participant is still the election')
        assert.equal(noDefaultRun.chairmanProblem, '', '"not configured" is not a problem to report')

        /* An explicit pick still beats the setting: the user's choice at run time. */
        const explicitWins = await http(bothPaths, 'POST', '/council/run', JSON.stringify({
          question: 'panel explicit over default probe',
          models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
          chairman: { provider: 'deepseek', model: 'pro' },
          attachFiles: false,
        }))
        const explicitWinsRun = (await http(bothPaths, 'GET', `/council/run/${explicitWins.json.runId}`)).json
        assert.equal(explicitWinsRun.chairman.key, 'deepseek|pro',
          'an explicit body pick must win over the configured default')
        assert.equal(explicitWinsRun.chairmanProblem, '', 'an honoured explicit pick reports no problem')

        /* A half-empty picker (`{}` / provider only) is "no explicit request", not the
           unparsable spec "/": it must fall through to the configured default. */
        const emptyPick = await http(bothPaths, 'POST', '/council/run', JSON.stringify({
          question: 'panel empty picker probe',
          models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
          chairman: {},
          attachFiles: false,
        }))
        const emptyPickRun = (await http(bothPaths, 'GET', `/council/run/${emptyPick.json.runId}`)).json
        assert.equal(emptyPickRun.chairman.key, 'providerA|glm',
          'an empty picker must fall through to the configured default')
        assert.equal(emptyPickRun.chairmanProblem, '',
          'an empty picker must not be reported as an unparsable chairman')

        /* The panel needs to KNOW the settings to pre-fill its pickers. */
        const echoed = await http(bothPaths, 'GET', '/council/models')
        assert.equal(echoed.status, 200)
        assert.deepEqual(echoed.json.defaultModels, ['deepseek/pro', 'providerA/glm'],
          'GET /council/models must echo the configured defaultModels read-only')
        assert.equal(echoed.json.defaultChairman, 'providerA/glm',
          'GET /council/models must echo the configured defaultChairman read-only')
        /* The existing fields keep their meaning. */
        for (const field of ['providers', 'contextMaxChars', 'filesMaxChars']) {
          assert.ok(Object.hasOwn(echoed.json, field), `GET /council/models must keep ${field}`)
        }

        /* The catalog is live data a user watches: a model added after the panel
           mounted must be reachable without waiting out MODEL_CACHE_MS, and a
           pinned model that disappeared must be named instead of silently
           shortening the roster. Both are measured against a MUTATED fake
           catalog, so a "refresh" that returns the cache cannot pass. */
        const originalDeepseek = models.deepseek
        try {
          const liveHost = fakeHost(Config({ defaultModels: ['deepseek/pro'] }))
          const first = await http(liveHost, 'GET', '/council/models')
          assert.equal(first.status, 200)
          assert.ok(first.json.providers.some((p) => p.id === 'deepseek' && p.models.some((m) => m.id === 'pro')),
            'the live catalog must list the provider models')
          assert.deepEqual(first.json.defaultModelProblems, [],
            'a defaultModels entry that resolves must report no problem')
          assert.equal(first.json.defaultModelsUsable, true, 'a usable defaultModels list reports usable')
          const firstAt = first.json.catalogAt
          assert.equal(typeof firstAt, 'number', 'catalogAt must be a timestamp')
          assert.equal(typeof first.json.catalogAgeMs, 'number', 'catalogAgeMs must be a number')

          /* A model appears after the panel mounted. */
          models.deepseek = originalDeepseek.concat([{ id: 'pro9', name: 'DeepSeek-V4.9-Pro' }])
          const cached = await http(liveHost, 'GET', '/council/models')
          assert.equal(cached.json.catalogAt, firstAt, 'a plain GET must serve the cache')
          assert.equal(cached.json.providers.some((p) => p.models.some((m) => m.id === 'pro9')), false,
            'a plain GET must not see a model added after it was cached')

          const refreshed = await http(liveHost, 'GET', '/council/models?refresh=1')
          /* The proof is CONTENT, not a timestamp: `catalogAt` is a millisecond
             clock, so two enumerations can share one and a notEqual assertion
             would flake (it did). Seeing the newly added model is the behaviour
             under test; the timestamp only has to move forward or stay put. */
          assert.ok(refreshed.json.catalogAt >= firstAt, 'catalogAt must not go backwards')
          assert.equal(refreshed.json.providers.some((p) => p.models.some((m) => m.id === 'pro9')), true,
            '?refresh=1 must see the newly added model')
          for (const field of ['providers', 'contextMaxChars', 'filesMaxChars', 'defaultModels',
            'defaultChairman', 'catalogAt', 'catalogAgeMs', 'defaultModelProblems', 'defaultModelsUsable']) {
            assert.ok(Object.hasOwn(refreshed.json, field), `a refresh must keep ${field}`)
          }
          assert.deepEqual(refreshed.json.defaultModels, ['deepseek/pro'],
            'a refresh must not change the echoed setting')

          /* A pinned model that no longer exists is reported, not dropped silently. */
          const staleHost = fakeHost(Config({ defaultModels: ['deepseek/pro', 'deepseek/gone'] }))
          const staleJson = (await http(staleHost, 'GET', '/council/models')).json
          assert.equal(staleJson.defaultModelProblems.length, 1,
            'a defaultModels entry missing from the catalog must be reported')
          assert.ok(staleJson.defaultModelProblems[0].includes('deepseek/gone'),
            `the problem must name the dead entry: ${JSON.stringify(staleJson.defaultModelProblems)}`)
          assert.equal(staleJson.defaultModelsUsable, true, 'one usable entry keeps the list usable')

          const goneHost = fakeHost(Config({ defaultModels: ['deepseek/gone'] }))
          const goneJson = (await http(goneHost, 'GET', '/council/models')).json
          assert.equal(goneJson.defaultModelsUsable, false,
            'a fully unusable defaultModels list must be reported as unusable')

          /* An unset defaultModels is not a problem: auto-pick is the documented path. */
          const unsetHost = fakeHost(Config({}))
          const unsetJson = (await http(unsetHost, 'GET', '/council/models')).json
          assert.deepEqual(unsetJson.defaultModelProblems, [], 'an unset defaultModels reports no problem')
          assert.equal(unsetJson.defaultModelsUsable, true, 'an unset defaultModels is usable (auto-pick)')
        } finally {
          models.deepseek = originalDeepseek
        }
      }

      /* A cancel must not rewrite an ALREADY SETTLED run: `finishRun` is documented
         write-once, and the browser now branches on `stopReason` (including
         `chairman-budget-skipped`), so a relabelled terminal state would be a lie
         told by the very field this task adds. */
      {
        const settleHost = fakeHost(Config({ defaultModels: ['providerA/glm'] }))
        await roster(settleHost)
        let settled = (await http(settleHost, 'GET', '/council/runs?sessionId=')).json.runs[0]
        for (let i = 0; i < 40 && settled.status === 'running'; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10))
          settled = (await http(settleHost, 'GET', '/council/runs?sessionId=')).json.runs[0]
        }
        assert.notEqual(settled.status, 'running', 'the cancellation probe run must have settled first')
        const before = { status: settled.status, error: settled.error, stopReason: settled.stopReason }
        assert.equal((await http(settleHost, 'POST', `/council/run/${settled.id}/cancel`, '')).status, 200,
          'cancel must still answer 200 for a settled run')
        const after = (await http(settleHost, 'GET', `/council/run/${settled.id}`)).json
        assert.equal(after.status, before.status, 'a settled run must keep its terminal status')
        assert.equal(after.error, before.error, 'a settled run must keep its terminal error')
        assert.equal(after.stopReason, before.stopReason, 'a settled run must keep its stopReason')
      }

      /* ------------------------------------------------------------------ *
       * task-4: the host, not the client, must refuse a resume of a         *
       * tool-originated run. Measured by an independent verifier on the      *
       * frozen baseline: `POST /run/<id>/resume` only looked at             *
       * "already resumed" and never at `toolRun`, so any stale/revived tab  *
       * could re-deliver a conclusion the tool had already returned as a    *
       * tool/result.                                                         *
       * ------------------------------------------------------------------ */
      {
        /* A tool run that actually COMPLETES (scripted provider), so the refusal
           cannot be explained away as "the run was not finished yet". */
        const inbox = []
        const toolInboxHost = fakeHost(
          Config({ defaultModels: ['providerA/glm'] }),
          async function* () {
            yield { type: 'text-delta', text: 'conclusion body' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
          inbox,
        )
        const toolRunResult = await toolInboxHost.tool.execute(
          { question: 'resume guard probe', attachFiles: false },
          { agent: { id: 'sess-tool-run' } },
        )
        assert.ok(toolRunResult.conclusion.includes('conclusion body'), 'the probe tool run must complete')
        const toolRunSnap = (await http(toolInboxHost, 'GET', '/council/runs?sessionId=sess-tool-run')).json.runs[0]
        assert.equal(toolRunSnap.toolRun, true, 'the probe run must be tool-originated')
        assert.equal(toolRunSnap.status, 'done', 'the refusal must not be masked by a not-finished error')
        assert.equal(toolRunSnap.resumed, '', 'a fresh run must not be marked resumed')

        /* (1) default: refused, structured, and it says what happened. */
        const refused = await http(toolInboxHost, 'POST',
          `/council/run/${toolRunSnap.id}/resume`, JSON.stringify({ mode: 'wake' }))
        assert.equal(refused.status, 409, `a tool run must refuse resume by default; body=${JSON.stringify(refused.json)}`)
        assert.equal(refused.json.code, 'tool-run', 'the refusal must carry code=tool-run like the other run-state conflicts')
        assert.ok(String(refused.json.error).includes('工具结果'),
          'the refusal must explain that the conclusion already went back as a tool result')
        assert.ok(String(refused.json.error).includes('force'),
          'the refusal must name the escape hatch instead of leaving the caller stuck')
        assert.equal(inbox.length, 0, 'a refused resume must deliver NOTHING')
        assert.equal((await http(toolInboxHost, 'GET', `/council/run/${toolRunSnap.id}`)).json.resumed, '',
          'a refused resume must not leave a resumed mark')

        /* (2) explicit escape hatch: allowed, and RECORDED on the run. */
        const forced = await http(toolInboxHost, 'POST',
          `/council/run/${toolRunSnap.id}/resume?force=1`, JSON.stringify({ mode: 'wake' }))
        assert.equal(forced.status, 200, `?force=1 must allow the delivery; body=${JSON.stringify(forced.json)}`)
        assert.equal(forced.json.forced, true, 'the forced response must say it was forced')
        assert.equal(inbox.length, 1, 'a forced resume must deliver exactly once')
        assert.equal(inbox[0].via, 'followup', 'mode=wake must go through the wake slot')
        assert.equal(inbox[0].id, 'sess-tool-run', 'the delivery must target the run session')
        const forcedSnap = (await http(toolInboxHost, 'GET', `/council/run/${toolRunSnap.id}`)).json
        assert.equal(forcedSnap.resumed, 'wake(forced)',
          'a forced delivery must be distinguishable from a normal one in the snapshot')
        /* The escape hatch does not unlock a second duplicate: already-resumed still wins. */
        const second = await http(toolInboxHost, 'POST',
          `/council/run/${toolRunSnap.id}/resume?force=1`, JSON.stringify({ mode: 'wake' }))
        assert.equal(second.status, 409, 'even a forced resume must not deliver a third copy')
        assert.equal(second.json.code, 'already-resumed', 'the second forced attempt keeps the already-resumed code')
        assert.equal(inbox.length, 1, 'still exactly one delivery')

        /* (3) hard regression: a PANEL run is untouched — same status, same body,
           same mark, and it needs no `force`. */
        const panelInbox = []
        const panelHost = fakeHost(
          Config({}),
          async function* () {
            yield { type: 'text-delta', text: 'panel conclusion' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
          panelInbox,
        )
        const started = await http(panelHost, 'POST', '/council/run', JSON.stringify({
          question: 'panel resume probe',
          models: [{ provider: 'providerA', model: 'glm' }, { provider: 'deepseek', model: 'pro' }],
          sessionId: 'sess-panel-run',
          attachFiles: false,
        }))
        assert.equal(started.status, 200, `the panel run must start; body=${JSON.stringify(started.json)}`)
        let panelSnap = (await http(panelHost, 'GET', `/council/run/${started.json.runId}`)).json
        for (let i = 0; i < 40 && panelSnap.status === 'running'; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 10))
          panelSnap = (await http(panelHost, 'GET', `/council/run/${started.json.runId}`)).json
        }
        assert.equal(panelSnap.status, 'done', `the panel run must complete first; got ${JSON.stringify(panelSnap.error)}`)
        assert.equal(panelSnap.toolRun, false, 'the panel run must not be tool-originated')
        const panelResume = await http(panelHost, 'POST',
          `/council/run/${started.json.runId}/resume`, JSON.stringify({ mode: 'wake' }))
        assert.equal(panelResume.status, 200, 'a panel run must still resume exactly as before')
        assert.deepEqual(panelResume.json, { ok: true, mode: 'wake' },
          'the panel resume response must stay byte-for-byte the historical shape (no `forced` key)')
        assert.equal(panelInbox.length, 1, 'the panel delivery must happen once')
        assert.equal((await http(panelHost, 'GET', `/council/run/${started.json.runId}`)).json.resumed, 'wake',
          'a panel delivery keeps the plain mark, never "wake(forced)"')
        const panelAgain = await http(panelHost, 'POST',
          `/council/run/${started.json.runId}/resume`, JSON.stringify({ mode: 'wake' }))
        assert.equal(panelAgain.status, 409, 'a panel run still refuses a duplicate delivery')
        assert.equal(panelAgain.json.code, 'already-resumed', 'and still with the historical code')
      }

      /* ------------------------------------------------------------------ *
       * task-6: `optMember` must land on the run, reach the snapshot and the *
       * conclusion's metadata line, and be un-injectable from HTTP.          *
       * ------------------------------------------------------------------ */
      {
        const optHost = fakeHost(
          Config({ defaultModels: ['providerA/glm'] }),
          async function* () {
            yield { type: 'text-delta', text: 'opt conclusion' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        )
        /* (A) the tool must DECLARE the parameter, document it, and keep it optional. */
        const params = optHost.tool.parameters
        assert.ok(params.properties.optMember !== undefined,
          'council_review must declare an optMember parameter')
        assert.equal(params.properties.optMember.type, 'string')
        assert.ok(String(params.properties.optMember.description).includes('opt 阶段 7'),
          'the parameter must document that it is the stage-7 member label')
        assert.ok(String(params.properties.optMember.description).includes('留空表示非 opt 流程'),
          'the parameter must document the empty case')
        assert.equal(params.required.includes('optMember'), false, 'optMember must stay optional')

        /* (B) a labelled run carries the label in snapshot AND conclusion. */
        const labelled = await optHost.tool.execute(
          { question: 'opt probe', attachFiles: false, optMember: 'rev-01' },
          { agent: { id: 'sess-opt' } },
        )
        assert.ok(labelled.conclusion.includes('；optMember: rev-01）'),
          `the label must ride in the runId metadata line; got ${JSON.stringify(labelled.conclusion.slice(-160))}`)
        assert.equal(typeof labelled.runId, 'string')
        /* Fetch the run the CONCLUSION names: that also proves the label and the
           runId a downstream record would read back refer to the same run. */
        const runIdOf = (text) => {
          const found = /runId: ([A-Za-z0-9]+)/.exec(text)
          return found === null ? '' : found[1]
        }
        assert.equal(runIdOf(labelled.conclusion), labelled.runId,
          'the conclusion metadata line must name the run it came from')
        const labelledSnap = (await http(optHost, 'GET', `/council/run/${labelled.runId}`)).json
        assert.equal(labelledSnap.optMember, 'rev-01', 'the label must reach the snapshot')
        assert.equal(labelledSnap.toolRun, true, 'the labelled run must still be a tool run')

        /* (C) a run without the argument stays empty — and an empty value must not
           fabricate an "optMember:" tag in the conclusion. */
        const unlabelled = await optHost.tool.execute(
          { question: 'opt probe 2', attachFiles: false },
          { agent: { id: 'sess-opt' } },
        )
        assert.equal(/optMember/.test(unlabelled.conclusion), false,
          `an unlabelled run must not carry an optMember tag; got ${JSON.stringify(unlabelled.conclusion.slice(-160))}`)
        assert.notEqual(unlabelled.runId, labelled.runId, 'each tool call must be its own run')
        const unlabelledSnap = (await http(optHost, 'GET', `/council/run/${unlabelled.runId}`)).json
        assert.equal(unlabelledSnap.optMember, '', 'an unset label must snapshot as ""')

        /* (D) the HTTP panel must NOT be able to inject a member label: the label is
           trustworthy exactly because only the documented tool path can set it. */
        const injected = await http(optHost, 'POST', '/council/run', JSON.stringify({
          question: 'panel opt injection probe',
          models: [{ provider: 'providerA', model: 'glm' }, { provider: 'deepseek', model: 'pro' }],
          sessionId: 'sess-opt-panel',
          attachFiles: false,
          optMember: 'rev-99',
        }))
        assert.equal(injected.status, 200, `the panel run must start; body=${JSON.stringify(injected.json)}`)
        const injectedSnap = (await http(optHost, 'GET', `/council/run/${injected.json.runId}`)).json
        assert.equal(injectedSnap.optMember, '',
          'a panel run must ignore an optMember in the body: only the tool path may label a run')
        assert.equal(injectedSnap.toolRun, false)
      }

      /* panelEnabled=false refuses every change-class route with 403 + a
         structured code, before any run lookup (the ids do not exist). */
      const panelOff = fakeHost(Config({ panelEnabled: false }))
      for (const [method, url, label] of [
        ['POST', '/council/run', 'POST /council/run'],
        ['POST', '/council/run/cmissing/resume', 'POST /council/run/<id>/resume'],
        ['POST', '/council/run/cmissing/cancel', 'POST /council/run/<id>/cancel'],
      ]) {
        const denied = await http(panelOff, method, url, '{"question":"x"}')
        assert.equal(denied.status, 403, `${label} must be 403 while panelEnabled=false`)
        assert.equal(denied.json.code, 'panel-disabled', `${label} must carry code=panel-disabled`)
        assert.ok(String(denied.json.error).includes('启用 /council 面板'), `${label} must name the panel setting`)
      }

      /* Read-only GETs stay available with the panel off, including the health
         probe and the runs that already exist. */
      const health = await http(panelOff, 'GET', '/council/')
      assert.equal(health.status, 200, 'the health probe must never be gated')
      assert.equal(health.json.toolEnabled, true, 'the probe must report the live tool switch')
      assert.equal(health.json.panelEnabled, false, 'the probe must report the live panel switch')
      assert.equal((await http(panelOff, 'GET', '/council/models')).status, 200,
        'GET /council/models must stay readable')
      assert.equal((await http(panelOff, 'GET', '/council/runs')).status, 200,
        'GET /council/runs must stay readable')

      /* A panel-created run stays observable after a live panel disable; only
         starting/intervening becomes impossible. */
      const livePanel = Config({})
      const hotPanel = fakeHost(livePanel)
      const created = await http(hotPanel, 'POST', '/council/run', JSON.stringify({
        question: 'panel probe',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
      }))
      assert.equal(created.status, 200, `POST /council/run must work while panelEnabled=true; body=${JSON.stringify(created.json)} text=${String(created.text).slice(0, 300)}`)
      assert.equal(typeof created.json.runId, 'string', 'POST /council/run must return a runId')
      livePanel.panelEnabled[write](false)
      assert.equal((await http(hotPanel, 'GET', `/council/run/${created.json.runId}`)).status, 200,
        'GET /council/run/<id> must stay readable after a live panel disable')
      const streamed = await http(hotPanel, 'GET', `/council/run/${created.json.runId}/stream`)
      assert.equal(streamed.status, 200, 'GET /council/run/<id>/stream must stay readable')
      assert.ok(streamed.text.includes('data:'), 'the SSE stream must still deliver a snapshot')
      assert.equal((await http(hotPanel, 'POST', '/council/run', '{"question":"x"}')).status, 403,
        'a live panel disable must reach POST /council/run')

      /* The two entries are independent: the tool switch must not mute the
         panel, and the panel switch must not mute the tool. */
      const toolOnlyOff = fakeHost(Config({ toolEnabled: false }))
      await assert.rejects(toolOnlyOff.tool.execute({ question: 'x', attachFiles: false }, {}), /已在设置中关闭/,
        'toolEnabled=false still refuses the tool')
      const panelStillOn = await http(toolOnlyOff, 'POST', '/council/run', JSON.stringify({
        question: 'panel probe',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
      }))
      assert.equal(panelStillOn.status, 200, 'toolEnabled=false must not mute the panel')
      const panelOnlyOff = fakeHost(Config({ panelEnabled: false, defaultModels: ['providerA/glm'] }))
      assert.deepEqual(await roster(panelOnlyOff), ['providerA/glm'],
        'panelEnabled=false must not mute the council_review tool')

      /* Outbound manifest preview. It assembles the same pack the run would send
         but starts nothing — it is the list a person confirms before their files
         leave for a provider. */
      const previewHost = fakeHost(Config({}))
      const preview = await http(previewHost, 'POST', '/preview',
        JSON.stringify({ question: 'review the workspace', sessionId: '' }))
      assert.equal(preview.status, 200, `POST /council/preview must answer 200; body=${JSON.stringify(preview.json)}`)
      for (const field of ['filesState', 'filesPaths', 'filesChars', 'codeState', 'codeFiles',
        'codeChars', 'codeDiscovered', 'codeTruncated', 'filesRedactions', 'note', 'attachFiles']) {
        assert.ok(Object.hasOwn(preview.json, field), `preview response must carry "${field}"`)
      }
      assert.ok(Array.isArray(preview.json.filesPaths), 'preview.filesPaths must be an array')
      assert.ok(Array.isArray(preview.json.filesRedactions), 'preview.filesRedactions must be an array')
      /* The preview must not overstate coverage. */
      assert.equal(/不是全项目审查/.test(preview.json.note), true,
        `preview.note must say it is a sample review, got ${JSON.stringify(preview.json.note)}`)

      /* Reading is not intervening: the preview stays available with the panel off. */
      const previewOff = fakeHost(Config({ panelEnabled: false }))
      const previewWhileOff = await http(previewOff, 'POST', '/preview',
        JSON.stringify({ question: 'review the workspace' }))
      assert.equal(previewWhileOff.status, 200,
        'POST /council/preview must stay available while panelEnabled=false (read-only)')

      /* A missing question is a usage error, not an empty manifest. */
      assert.equal((await http(previewHost, 'POST', '/preview', '{}')).status, 400,
        'preview must reject a missing question')
      assert.equal((await http(previewHost, 'POST', '/preview', 'not json')).status, 400,
        'preview must reject a malformed body')

      /* Confirmation is recorded, and defaults to false so "no human saw the
         list" is distinguishable from "someone confirmed it". */
      const unconfirmed = await http(previewHost, 'POST', '/council/run', JSON.stringify({
        question: 'panel probe',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        attachFiles: false,
      }))
      assert.equal(unconfirmed.status, 200, 'run must start')
      const unconfirmedView = await http(previewHost, 'GET', `/council/run/${unconfirmed.json.runId}`)
      assert.equal(unconfirmedView.json.manifestConfirmed, false,
        'a run without an explicit confirmation must record manifestConfirmed=false')

      const confirmed = await http(previewHost, 'POST', '/council/run', JSON.stringify({
        question: 'panel probe confirmed',
        models: [{ provider: 'deepseek', model: 'pro' }, { provider: 'providerA', model: 'glm' }],
        attachFiles: false,
        manifestConfirmed: true,
      }))
      const confirmedView = await http(previewHost, 'GET', `/council/run/${confirmed.json.runId}`)
      assert.equal(confirmedView.json.manifestConfirmed, true,
        'an explicitly confirmed run must record manifestConfirmed=true')

      /* The health probe must report in-flight runs.
         A plugin disable→enable cycle destroys this instance and every run in it;
         each lands in the persisted file as "Host 重启，运行中断". Measured: two
         reloads during a live council killed three runs and left the calling agent
         holding a tool that no longer resolves. Reporting the count makes "is it
         safe to reload?" answerable before the fact. */
      const probe = await http(previewHost, 'GET', '/council/')
      assert.equal(typeof probe.json.runningRuns, 'number', 'health must report runningRuns as a number')
      assert.ok(probe.json.runningRuns >= 0, 'runningRuns must never be negative')
      assert.equal(typeof probe.json.toolEnabled, 'boolean', 'health must report the tool switch')
      assert.equal(typeof probe.json.panelEnabled, 'boolean', 'health must report the panel switch')
      /* The live host must report the marker this source declares: that is the only
         way the user can tell, after a reload, whether the new snapshot fields are
         actually being served. */
      const declaredBuild = /build: 'v(\d+)'/.exec(
        readFileSync(new URL('../index.js', import.meta.url), 'utf8'),
      )
      assert.equal(probe.json.build, `v${declaredBuild[1]}`,
        'the health probe must report the build marker the source declares')
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    }
  }

  /* SSE heartbeat.
     The stream carries state changes only, so a healthy run emits nothing for the
     minutes a model call takes (measured: 1 event in 25 s). The client treats 8 s
     of silence as a dead stream, so without a beat it closed a healthy stream and
     a non-leader tab then had neither stream nor poller — its status card froze
     (observed: card at "0/5, all running" while the snapshot had 3 seats done). */
  {
    /* The interval must stay below the client's STREAM_STALL_MS with margin for
       two lost beats. Read both sides so the pairing cannot silently drift. */
    const hostSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    const clientSource = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
    const beat = /const STREAM_BEAT_MS = (\d+)/.exec(hostSource)
    const stall = /const STREAM_STALL_MS = (\d+)/.exec(clientSource)
    assert.ok(beat !== null, 'the host must declare STREAM_BEAT_MS')
    assert.ok(stall !== null, 'the client must declare STREAM_STALL_MS')
    const beatMs = Number(beat[1])
    const stallMs = Number(stall[1])
    assert.ok(beatMs * 2 < stallMs,
      `STREAM_BEAT_MS (${beatMs}) must leave room for two lost beats below the client stall bound (${stallMs})`)
    /* A NAMED event, so a client that only handles onmessage cannot treat a beat
       as a snapshot. */
    assert.ok(/event: beat\\ndata:/.test(hostSource),
      'the heartbeat must be sent as the named event `beat`')
    /* The interval must be cleared on both endings, or it beats into a dead
       response for the life of the process. */
    assert.ok(/clearInterval\(beat\)/.test(hostSource), 'the heartbeat interval must be cleared')
  }

  /* A timed-out attempt is retryable, and a cancel is not.
     Measured: a real run had all five seats settle as `调用被中止或超时` with
     ttft=0 and end `所有模型作答失败`. Our own CALL_TIMEOUT_MS expiry reached the
     `aborted` branch, which threw terminally — so one slow provider per seat lost
     the whole run even though every other transport failure is retried. */
  {
    const hostSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    const abortedBranch = /finish\.kind === 'aborted'\) \{([\s\S]{0,1400}?)\n        \}/.exec(hostSource)
    assert.ok(abortedBranch !== null, 'the aborted branch must exist')
    const body = abortedBranch[1]
    assert.ok(/signal\.aborted/.test(body),
      'the aborted branch must distinguish a run cancel from our own timeout')
    assert.ok(/已取消/.test(body), 'a run cancel must stay a distinct, terminal error')
    assert.ok(/continue/.test(body),
      'a timeout must be retried, not thrown terminally')
    assert.ok(/调用超时/.test(body), 'a timeout must carry its own message so it is diagnosable')
    /* The budget must exceed the measured time-to-first-token, or the retry just
       re-times-out. 284 s was measured on this link. */
    const call = /const CALL_TIMEOUT_MS = (\d+)/.exec(hostSource)
    assert.ok(call !== null, 'CALL_TIMEOUT_MS must be declared')
    assert.ok(Number(call[1]) > 284 * 1000,
      `CALL_TIMEOUT_MS (${call[1]}) must exceed the measured 284 s time-to-first-token`)
    assert.equal(Number(call[1]) < 30 * 60 * 1000, true,
      'CALL_TIMEOUT_MS must stay below the run deadline')
  }

  /* The health probe must report in-flight runs.
     A plugin disable→enable cycle destroys the instance and every run in it; each
     lands in the persisted file as "Host 重启，运行中断". Measured: two reloads
     during a live council killed three runs and left the calling agent holding a
     tool that no longer resolves. Reporting the count makes "is it safe to
     reload?" answerable before the fact.
     (The live probe assertion sits in the fake-host block above, where `http` and
     `previewHost` are in scope.) */

  /* Live reasoning must reach the snapshot.
     The provider streams chain-of-thought as its own `reasoning-delta` chunk
     stream, which arrives BEFORE any `text-delta`. It was dropped entirely, so an
     expanded card could only show a status dot through the whole thinking phase —
     measured at 200+ s on this link. */
  {
    const hostSource = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    assert.ok(/chunk\.type === 'reasoning-delta'/.test(hostSource),
      'the stream loop must consume reasoning-delta chunks')
    assert.ok(/reportReasoning\(reasoning\)/.test(hostSource),
      'a reasoning delta must be reported (so it can be streamed live)')
    /* Bounded on purpose: SSE frames carry the whole snapshot and are republished
       on every tick, so shipping the full trace would multiply wire cost by the
       reasoning length. */
    const tail = /const REASONING_TAIL = (\d+)/.exec(hostSource)
    assert.ok(tail !== null, 'REASONING_TAIL must be declared')
    assert.ok(Number(tail[1]) > 0 && Number(tail[1]) <= 20000,
      `REASONING_TAIL (${tail[1]}) must be a bounded window`)
    /* The snapshot must expose both the tail and the true total, so a client can
       tell "short trace" from "truncated trace" instead of claiming full text. */
    for (const field of ['reasoning: reasoningTail(', 'reasoningChars:']) {
      assert.ok(hostSource.includes(field),
        `the snapshot must expose ${field.trim()} for answers, reviews and the chairman`)
    }
    /* Answers, reviews and the chairman each accumulate their own trace. */
    assert.equal((hostSource.match(/reasoningChars = reasoning\.length/g) || []).length >= 3, true,
      'answers, reviews and the chairman must each record reasoningChars')
    /* The tail helper must actually bound the value. */
    for (const [input, expected] of [['', 0], ['abc', 3]]) {
      assert.equal(typeof reasoningTail(input), 'string', 'reasoningTail must return a string')
      assert.equal(reasoningTail(input).length, expected, `reasoningTail(${JSON.stringify(input)}) length`)
    }
    const long = 'x'.repeat(Number(tail[1]) + 500)
    assert.equal(reasoningTail(long).length, Number(tail[1]), 'reasoningTail must clamp to REASONING_TAIL')
    assert.equal(reasoningTail(long).endsWith('x'), true, 'reasoningTail must keep the newest text')
  }

  /* Portability guard. The harnesses must run unchanged on the CI runner
     (ubuntu-latest). `dev/tune-sampler.mjs` used to hardcode
     `<repo-root>`, so the sampler looked at a path that does
     not exist on Linux and the coverage gate failed for the wrong reason.
     A repo root must be derived from the module URL, never typed as a literal. */
  {
    const devDir = fileURLToPath(new URL('.', import.meta.url))
    const harnesses = (await readdir(devDir)).filter((name) => name.endsWith('.mjs'))
    assert.ok(harnesses.length >= 4, `expected at least four harnesses, got ${harnesses.join(', ')}`)
    for (const name of harnesses) {
      const text = readFileSync(new URL(name, `file://${devDir.replace(/\\/g, '/')}/`), 'utf8')
      for (const match of text.matchAll(/^\s*const\s+ROOT\s*=\s*['"]([^'"]+)['"]/gm)) {
        const literal = match[1]
        assert.equal(/^[A-Za-z]:[\\/]/.test(literal), false,
          `${name} hardcodes a Windows repo root (${literal}) — derive it from import.meta.url so CI works`)
        assert.equal(literal.startsWith('/'), false,
          `${name} hardcodes an absolute repo root (${literal}) — derive it from import.meta.url`)
      }
    }
    /* The sampler is the one that consumes such a root; prove it resolves. */
    const sampler = readFileSync(new URL('tune-sampler.mjs', `file://${devDir.replace(/\\/g, '/')}/`), 'utf8')
    assert.equal(/const ROOT = .*import\.meta\.url/.test(sampler), true,
      'tune-sampler must derive ROOT from import.meta.url')
  }

  /* The CI workflow itself. Two real defects lived here and both survived because
     nothing ever parsed the file:
       * `- name: Runtime harness (real callModel: retry, ...)` — an unquoted
         `": "` inside a plain scalar, which YAML reads as a nested mapping.
         GitHub would have rejected the whole workflow on the first push.
       * the file was gitignored for weeks (the OAuth `workflow` scope obstacle,
         which turned out NOT to apply to SSH pushes), so CI never ran at all.
     It is committed now, so this guard is permanent rather than opportunistic. */
  {
    const workflow = new URL('../.github/workflows/verify.yml', import.meta.url)
    assert.ok(existsSync(fileURLToPath(workflow)),
      'the CI workflow must be committed — CI is enabled, so losing the file silently disables the gate')
    {
      const text = readFileSync(workflow, 'utf8')
      for (const [index, line] of text.split(/\r?\n/).entries()) {
        const match = /^\s*-\s*name:\s*(.+?)\s*$/.exec(line)
        if (match === null) continue
        /* A plain (unquoted) scalar must not contain ": " — that is the trap. */
        if (!/^['"]/.test(match[1])) {
          assert.equal(match[1].includes(': '), false,
            `workflow line ${index + 1} has an unquoted ": " inside a step name (${match[1]}) — YAML reads it as a mapping`)
        }
      }
      /* Every gate the project promises must actually be wired. */
      for (const script of ['verify-client.mjs', 'verify-host.mjs', 'verify-runtime.mjs', 'tune-sampler.mjs']) {
        assert.ok(text.includes(`node dev/${script}`),
          `the CI workflow must run dev/${script}`)
      }
      assert.ok(text.includes('npm install'),
        'the CI workflow must install the peer dependency before the plain-node harnesses')
      assert.ok(/runs-on:\s*ubuntu-latest/.test(text), 'the CI workflow must pin a runner')
    }
  }

  console.log('host half: OK (paths, traversal, secrets, timeout, scheduler, settings, council tool)')
} finally {
  /* Retries on purpose: a run's `persistRuns()` debounce (500 ms) can still fire
     while the temp tree is being removed, which surfaced as a flaky ENOTEMPTY
     teardown (measured while reverse-verifying this task). */
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}
