#!/usr/bin/env node
/**
 * check-release.mjs — 发布一致性门禁
 *
 * 存在的理由：README 的安装命令曾经指向 `v0.1.0-alpha` 的 tarball，而 Releases 里已经有 v0.2.36 ——
 * 照 README 装的人拿到的是落后几十个版本的构建。**改一行 README 不解决问题，门禁才解决。**
 *
 * 一条命令，五项判据（后两项在官方 registry 可达时追加），任何一条不成立就 exit 1：
 *   1. README 声明「仓库源码版本」== package.json 的 version
 *   2. README 的安装命令指向 **本版本** 的 Release 资产 URL
 *   3. README 不再指向任何旧版（如 v0.1.0-alpha）的 tarball —— 这是那次事故的回归守卫
 *   4. 最新 git tag == v<version>（远端优先，远端不可达时退回本地 tag）
 *   5. README 陈述的 npm 版本 == 官方 registry 的 latest；npm 落后时 README 必须显式劝阻从 npm 安装
 *      （registry 不可达 → SKIP，不算失败：环境失败 ≠ 逻辑失败）
 *
 * 用法：
 *   node dev/check-release.mjs
 * 建议接进 verify（改动极小，但会动 package.json，所以留给维护者决定）：
 *   "verify": "node dev/verify-client.mjs && node dev/verify-host.mjs && node dev/verify-runtime.mjs && node dev/tune-sampler.mjs && node dev/check-release.mjs"
 */

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const root = fileURLToPath(new URL('..', import.meta.url))

const version = pkg.version
const tag = `v${version}`
const asset = `dsh-model-council-${version}.tgz`
const assetUrl = `https://github.com/sprw-li/dsh-model-council/releases/download/${tag}/${asset}`

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok, detail })

/* 1 + 2：README 与 package.json 必须互相指认，且指向同一版本 */
check('README 声明的源码版本 == package.json version', readme.includes(version), version)
check('README 的安装命令指向本版本的 Release 资产', readme.includes(assetUrl), assetUrl)

/* 3：回归守卫 —— 那次事故的具体形态 */
const staleTarball = /releases\/download\/v(\d+\.\d+\.\d+)[^)\s]*\/(dsh-model-council-\1[^)\s]*\.tgz)/g
const staleMatches = [...readme.matchAll(staleTarball)].filter((m) => `v${m[1]}` !== tag)
check(
  'README 不指向任何旧版 tarball（v0.1.0-alpha 事故的回归守卫）',
  staleMatches.length === 0,
  staleMatches.length ? staleMatches.map((m) => m[0]).join(', ') : '无旧版链接',
)

/* README 对 npm 现状的陈述必须与**官方 registry** 一致。
   分两种情形，且区分「环境失败」与「逻辑失败」：registry 不可达 → SKIP（不算失败）。 */
const readmeNpmVersion = (readme.match(/npm[^\n]*?`(\d+\.\d+\.\d+)`/) || [])[1]
let registryTags = null
let registryWhy = ''
try {
  const res = await fetch('https://registry.npmjs.org/-/package/dsh-model-council/dist-tags', {
    signal: AbortSignal.timeout(15000),
  })
  if (res.ok) registryTags = await res.json()
  else registryWhy = `HTTP ${res.status}`
} catch (err) {
  registryWhy = String(err?.message ?? err).split('\n')[0]
}

if (registryTags === null) {
  checks.push({ name: 'npm 现状与 README 一致', ok: true, skip: true, detail: `SKIP — registry 不可达（${registryWhy}）` })
} else {
  const latest = registryTags.latest
  check('README 陈述的 npm 版本 == registry 的 latest', readmeNpmVersion === latest,
    `README=${readmeNpmVersion ?? '(未陈述)'} registry.latest=${latest}`)
  if (latest !== version) {
    check('npm 落后于源码时，README 必须显式劝阻从 npm 安装', /不要从 npm 装/.test(readme), '已给出警示')
  } else {
    check('npm 已是本版本时，README 不得再劝阻从 npm 安装', !/不要从 npm 装/.test(readme), 'npm 已是最新')
  }
}

/* 4：最新 tag 必须是本版本 */
let tags = []
let source = ''
try {
  const out = execFileSync('git', ['ls-remote', '--tags', 'origin'], {
    cwd: root, encoding: 'utf8', timeout: 60000,
  })
  tags = out
    .split('\n')
    .map((line) => line.split('\t')[1])
    .filter(Boolean)
    .map((ref) => ref.replace('refs/tags/', '').replace(/\^\{\}$/, ''))
  source = 'remote (git ls-remote origin)'
} catch (err) {
  const out = execFileSync('git', ['tag'], { cwd: root, encoding: 'utf8' })
  tags = out.split('\n').filter(Boolean)
  source = `local (git tag) — 远端不可达：${String(err.message).split('\n')[0]}`
}

const semver = (v) => v.replace(/^v/, '').split('.').map(Number)
const versions = [...new Set(tags)]
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  .sort((a, b) => {
    const A = semver(a); const B = semver(b)
    return A[0] - B[0] || A[1] - B[1] || A[2] - B[2]
  })
const newest = versions.at(-1)
check(`最新 tag == ${tag}（来源：${source}）`, newest === tag, `newest=${newest ?? '(无 tag)'} this=${tag}`)

/* 报告 */
const pad = Math.max(...checks.map((c) => c.name.length))
for (const c of checks) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(pad)}  ${c.detail}`)
}
const failed = checks.filter((c) => !c.ok)
console.log(
  `\n${checks.length - failed.length}/${checks.length} passed | ` +
  `源码 ${version} | tag ${newest ?? '-'} | tag 总数 ${versions.length}`,
)
if (failed.length) {
  console.error(`\n发布一致性门禁未通过：${failed.length} 项。修好 README/package.json/tag 三者的一致关系再发版。`)
  process.exit(1)
}
console.log('发布一致性门禁通过：README / package.json / git tag 指向同一个版本。')
