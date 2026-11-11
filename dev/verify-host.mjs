/**
 * Host-half harness for the pure helpers: path recognition and escaping,
 * sensitive-file rejection, timeout semantics, and the concurrency window.
 * No DSH runtime is required; only node:fs against a temp directory.
 */

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { candidatePaths, isPathInside, readTextFile, runLimited, withTimeout } from '../index.js'

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
