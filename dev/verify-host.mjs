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
import { TRANSIENT_FAILURE, SEAT_RESULT_TIMEOUT_MS, SEAT_START_TIMEOUT_MS, PROVIDER_CONCURRENCY, MAX_FALLBACKS_PER_RUN, RUN_TIMEOUT_MS, CODE_FILE_CHARS, CODE_MAX_CHARS, CODE_WALK_ENTRIES, looksLikeDeliberatePath, collectSourceFiles, defaultRoutesFromCatalog, candidatePaths, collectCodeContext, collectPathContext, documentOnlyReview, isPathInside, readTextFile, runLimited, withTimeout, apply, Config, toolEnabled, panelEnabled, parseRouteSpec, resolveConfiguredRoutes, selectCouncilRoutes, pickChairmanRoute, readSetting } from '../index.js'

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
    const watchdogCalls = (source.match(/terminateRun\(run, '运行超时（30 分钟），已中止'\)/g) || []).length
    assert.equal(watchdogCalls, 2, `both watchdogs (tool + HTTP) must use terminateRun, got ${watchdogCalls}`)
    assert.equal(/finishRun\(run, 'error', '整轮预算耗尽'/.test(source), false,
      'the wall branch must not settle without releasing resources')
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

  /* defaultChairman: honoured only when it is one of the participants. */
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
    const providers = [{ id: 'deepseek', name: 'DeepSeek' }, { id: 'providerA', name: 'providerA' }]
    const models = {
      deepseek: [{ id: 'pro', name: 'DeepSeek-V4-Pro' }, { id: 'flash', name: 'DeepSeek-V4.1-Flash' }],
      providerA: [{ id: 'glm', name: 'modelB' }, { id: 'modelA', name: 'modelA' }],
    }
    const fakeHost = (config) => {
      const state = { tool: undefined, server: undefined }
      const ctx = {
        effect: (fn) => { fn(); return () => {} },
        on: () => {},
        get: () => undefined,
        agents: { get: () => undefined, list: () => [] },
        subagents: {},
        tools: { register: (tool) => { state.tool = tool; return () => {} } },
        webServer: { register: (registration) => { state.server = registration; return () => {} } },
        llm: {
          listProviders: () => providers,
          listModels: async (id) => models[id] ?? [],
          stream: () => { throw new Error('fake provider down') },
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
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
    }
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
  await rm(root, { recursive: true, force: true })
}
