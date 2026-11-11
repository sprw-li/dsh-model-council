/**
 * Host half of dsh-model-council.
 *
 * Serves the configured model catalog and runs one council:
 *   1. answers  - every selected model answers the question in parallel
 *                 (read-only subagent seats when enabled, else raw model calls);
 *   2. reviews  - every model reviews the anonymized answers and ranks them;
 *   3. chairman - one elected model synthesizes consensus, dissent and advice.
 *
 * The Client half polls `GET /council/run/<id>` for a snapshot while the run
 * streams, so no long-lived socket is required.
 *
 * Routes (same origin, cookie auth):
 *   GET  /council/                build marker
 *   GET  /council/models          configured providers and text models
 *   GET  /council/workspace       session workspace resolution (cwd / registry)
 *   GET  /council/runs            recent runs for one session (reattach after reload)
 *   GET  /council/diag            runs and live agents, for diagnosis
 *   POST /council/run             { question, models, ... } -> { runId }
 *   GET  /council/run/<id>        run snapshot
 *   POST /council/run/<id>/resume { mode: 'silent' | 'wake' } deliver the conclusion
 *   POST /council/run/<id>/cancel stop the run and dispose every live seat
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { lstat, readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'

export const inject = ['webServer', 'llm', 'agents', 'subagents']

/** Selected models per run. */
const MAX_MODELS = 6
/** Longest accepted question. */
const MAX_QUESTION = 20000
/** Per-answer characters forwarded to the review and chairman prompts. */
const MAX_ANSWER_CHARS = 6000
const ANSWER_MAX_TOKENS = 16384
const REVIEW_MAX_TOKENS = 16384
const CHAIRMAN_MAX_TOKENS = 16384
/** Retry budget for reasoning-only responses that burned the first one. */
const RETRY_MAX_TOKENS = 32768
/** One model call, not one run. */
const CALL_TIMEOUT_MS = 300000
/** A subagent seat must finish startup within this bound. */
const SEAT_START_TIMEOUT_MS = 60000
/** A subagent seat must return a result within this bound after startup. */
const SEAT_RESULT_TIMEOUT_MS = 240000
/** Whole-run watchdog: a stuck stage can never hold the UI forever. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000
/** Concurrent subagent seats; the delegation runtime has a shared capacity pool (default 8). */
const SEAT_CONCURRENCY = 3
/** Global per-provider concurrency, enforced in the Host so tabs/chats cannot multiply it. */
const PROVIDER_CONCURRENCY = 4
/** One run may degrade at most one seat per participant. */
const MAX_FALLBACKS_PER_RUN = 6
/** Transport/provider failures worth one retry with backoff (word-bounded so "5000 tokens" never matches). */
const TRANSIENT_FAILURE = /(\b429\b|\b5\d\d\b|ECONN|ETIMEDOUT|EAI_AGAIN|timeout|rate.?limit|overload|temporarily unavailable|fetch failed)/i
const RUN_TTL_MS = 30 * 60 * 1000
const MAX_RUNS = 16
const MODEL_CACHE_MS = 60000
/** Read-only Agent Preset used by subagent-backed seats. */
const READ_ONLY_PRESET = 'council-readonly'

/** Paths in the question whose directory tree / key files ride along. */
const MAX_ATTACH_PATHS = 3
const ATTACH_MAX_CHARS = 20000
const MAX_TREE_ENTRIES = 120
const MAX_FILE_CHARS = 8000
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'venv',
  '.mypy_cache', '.ruff_cache', 'runs', 'dist', 'build', '.tox',
])
const TEXT_EXTENSIONS = new Set([
  '.md', '.py', '.toml', '.json', '.yml', '.yaml', '.txt', '.cfg', '.ini',
  '.csv', '.jsonl', '.sh', '.ps1', '.html', '.css', '.js', '.ts', '.jsx',
  '.tsx', '.mjs', '.cjs', '.c', '.h', '.cpp', '.rs', '.go', '.java', '.rb',
  '.php', '.cs', '.kt', '.kts', '.swift', '.scala', '.lua', '.sql', '.vue',
  '.svelte', '.proto', '.gradle', '.env.example',
])
/** Extension-less files worth reading as text. */
const TEXT_FILENAMES = /^(Makefile|Dockerfile|LICENSE|NOTICE|Procfile|Gemfile|Rakefile|Justfile)$/
const SECRET_NAME = /(^|[\\/])(\.env[^\\/]*|id_(rsa|ed25519|ecdsa)[^\\/]*|credentials[^\\/]*|\.npmrc|\.pypirc|\.netrc|\.git-credentials|[^\\/]*\.(pem|key|pfx|p12|kdbx)|secrets?[^\\/]*|passwords?[^\\/]*|\.ssh|\.aws|\.kube)$/i
/** A question that means the session workspace even without an explicit path. */
const WORKSPACE_INTENT = /(工作区|项目|仓库|代码库|目录|本仓库|本项目|workspace|repository|repo\b|project|codebase)/i
/** A question that asks for a review, so the source pack is worth attaching. */
const REVIEW_INTENT = /(评审|审查|审计|review|audit|全项目|代码质量|安全审查)/i
/** Bounded source pack so llm-mode seats can cite real files instead of guessing. */
const CODE_MAX_CHARS = 40000
const CODE_MAX_FILES = 24
const CODE_FILE_CHARS = 4000
const CODE_WALK_ENTRIES = 2000
const CODE_EXTENSIONS = new Set([
  '.py', '.pyi', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.go', '.rs', '.java', '.kt', '.kts', '.cs', '.rb', '.php', '.c', '.h', '.cpp',
  '.hpp', '.cc', '.lua', '.swift', '.scala', '.sh', '.ps1', '.sql', '.vue', '.svelte',
])
/** `@relative/path` mentions inside the question. */
const AT_MENTION = /@([A-Za-z0-9_.\-]+(?:[\\/][A-Za-z0-9_.\-]+)*)/g
const KEY_FILE = /(^|[\\/])(README[^\\/]*\.md|SKILL\.md|CLAUDE\.md|AGENTS\.md|CHECKPOINT\.md|pyproject\.toml|package\.json|setup\.py|requirements\.txt|ARCHITECTURE[^\\/]*\.md|STATUS[^\\/]*\.md|DEFAULTS[^\\/]*\.md|RELEASE_NOTES[^\\/]*\.md|DECISIONS[^\\/]*\.md)$/i

/** Model ids that are not chat completions. */
const EXCLUDED_MODEL = /(embedding|rerank|\btts\b|\basr\b|whisper|audio|speech|image|video|seedream|wan-|ocr|moderation)/i
/** Child-session events surfaced as the live activity of a subagent seat. */
const SEAT_ACTIVITY = {
  'step/start': 'step',
  'tool/call': 'tool',
  'tool/result': 'result',
  'assistant/message': 'reply',
  'turn/start': 'start',
  'turn/end': 'end',
  'llm/retry': 'retry',
}

const ANSWER_SYSTEM = [
  '你是多模型理事会中的一名独立委员。',
  '请直接、完整地回答用户问题；不要复述指令，也不要替其他委员发言。',
  '先给结论，再给关键依据；不确定的地方明确标注。',
  '使用与用户问题相同的语言回答。',
].join('\n')

const REVIEW_SYSTEM = [
  '你是多模型理事会的评审。你看到的是若干模型对同一问题的匿名回答。',
  '你的任务不是重复回答，而是挑错与比较：指出事实错误、逻辑漏洞、关键遗漏，并给出排序。',
  '使用与问题相同的语言，简洁、具体，避免客套。',
].join('\n')

const CHAIRMAN_SYSTEM = [
  '你是多模型理事会的主席。',
  '请综合各模型的回答与互评，给出一个用户可以直接采信的最终结论。',
  '必须区分「共识」「分歧与盲点」「最终建议」，并说明结论依赖的前提。',
  '使用与用户问题相同的语言，结构清晰，不罗列各模型原话。',
].join('\n')

/** Read a request body as UTF-8 text. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

/** Send one JSON response. */
function sendJson(res, code, value) {
  res.statusCode = code
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(value))
}

/** Human-readable message of any thrown value. */
function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Clip one answer before it enters another prompt. */
function clip(text) {
  return clipText(text, MAX_ANSWER_CHARS)
}

/** Clip arbitrary text to a character budget. */
function clipText(text, maxChars) {
  const value = String(text || '')
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n…（已截断）`
}

/** Visible text of one message's content blocks. */
function messageText(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') parts.push(block.text.trim())
  }
  return parts.join('\n')
}

/** Answer label A, B, C, … */
function letter(index) {
  return String.fromCharCode(65 + index)
}

/** Race a promise against a timeout that rejects with a readable message. */
function withTimeout(promise, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Run async items with a small concurrency window. */
async function runLimited(items, limit, worker) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

/** True when `child` stays inside `parent` (no traversal out of the workspace). */
function isPathInside(child, parent) {
  const rel = relative(parent, child)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..')
}

/** Local paths mentioned by the question: absolute tokens, `@mentions`, or workspace-relative. */
function candidatePaths(text, workspaceCwd) {
  const candidates = []
  const push = (value) => {
    if (typeof value === 'string' && value !== '' && candidates.indexOf(value) === -1) candidates.push(value)
  }
  const tokens = String(text || '').split(/[\s"'`<>|，。；：、（）()\[\]{}]+/)
  for (const rawToken of tokens) {
    const token = rawToken.replace(/[^\x20-\x7E]+$/g, '').replace(/[.,;:!?]+$/g, '')
    if (token.length < 4) continue
    const variants = [token]
    const drive = /^([A-Za-z])[\\/](.+)$/.exec(token)
    if (drive !== null) variants.push(`${drive[1]}:\\${drive[2]}`)
    for (const variant of variants) {
      if (!/^([A-Za-z]:[\\/]|\/)/.test(variant)) continue
      push(variant)
      break
    }
    if (candidates.length >= MAX_ATTACH_PATHS) return candidates
  }
  AT_MENTION.lastIndex = 0
  let mention
  while ((mention = AT_MENTION.exec(String(text || ''))) !== null) {
    if (candidates.length >= MAX_ATTACH_PATHS) break
    const value = mention[1]
    if (isAbsolute(value)) push(value)
    else if (typeof workspaceCwd === 'string' && workspaceCwd !== '') {
      const resolved = join(workspaceCwd, value)
      if (isPathInside(resolved, workspaceCwd)) push(resolved)
    }
  }
  return candidates
}

/** Stat one path, treating missing/invalid paths as absent. */
async function statSafe(path) {
  try {
    return await stat(path)
  } catch {
    return undefined
  }
}

/** Read one text file with the attachment budget; binary/missing/symlinked files are skipped. */
async function readTextFile(path, maxChars) {
  if (SECRET_NAME.test(path)) return ''
  try {
    const link = await lstat(path)
    if (link.isSymbolicLink()) return ''
    const info = await stat(path)
    if (!info.isFile() || info.size > 1024 * 1024) return ''
    const base = path.split(/[\\/]/).pop() || ''
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase()) && !TEXT_FILENAMES.test(base)) return ''
    const content = await readFile(path, 'utf8')
    if (content.indexOf('\u0000') !== -1) return ''
    return content.length > maxChars ? `${content.slice(0, maxChars)}\n…（已截断）` : content
  } catch {
    return ''
  }
}

/** Depth-limited directory tree, one entry per line. */
async function listTree(root, maxEntries) {
  const lines = []
  async function walk(dir, prefix, depth) {
    if (lines.length >= maxEntries || depth > 2) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (lines.length >= maxEntries) return
      if (entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        lines.push(`${prefix}${entry.name}/`)
        await walk(full, `${prefix}  `, depth + 1)
      } else if (entry.isFile()) {
        let size = 0
        try {
          size = (await stat(full)).size
        } catch {
          size = 0
        }
        lines.push(`${prefix}${entry.name} [${size}]`)
      }
    }
  }
  await walk(root, '', 1)
  return lines
}

/** Documentation/manifest files worth reading for a code review. */
async function keyFiles(root) {
  const found = []
  async function walk(dir, depth) {
    if (depth > 2 || found.length >= 6) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (found.length >= 6) return
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        await walk(full, depth + 1)
      } else if (entry.isFile() && KEY_FILE.test(entry.name) && !SECRET_NAME.test(full)) {
        found.push(full)
      }
    }
  }
  await walk(root, 1)
  return found
}

/** Lowercase ASCII tokens of a question, used to match project directories and rank files. */
function questionHints(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'code', 'review', 'project', 'please', 'audit', 'into', 'your', 'docs', 'test', 'file', 'files'])
  const hints = []
  for (const token of String(text || '').split(/[^A-Za-z0-9_.\-]+/)) {
    const value = token.toLowerCase()
    if (value.length < 3 || stop.has(value)) continue
    if (hints.indexOf(value) === -1) hints.push(value)
  }
  return hints
}

/** Source files under a directory: question-relevant paths first, then shallow/large. */
async function collectSourceFiles(root, hints = []) {
  const found = []
  let visited = 0
  async function walk(dir, depth) {
    if (depth > 4 || visited >= CODE_WALK_ENTRIES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (visited >= CODE_WALK_ENTRIES) return
      visited += 1
      if (entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full, depth + 1)
      } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())
        && !SECRET_NAME.test(full)) {
        let size = 0
        try {
          size = (await stat(full)).size
        } catch {
          size = 0
        }
        if (size === 0 || size > 300 * 1024) continue
        found.push({ path: full, size, depth })
      }
    }
  }
  await walk(root, 1)
  const score = (file) => {
    const lower = file.path.toLowerCase()
    let hits = 0
    for (const hint of hints) if (lower.includes(hint)) hits += 1
    return hits
  }
  found.sort((a, b) => score(b) - score(a) || a.depth - b.depth || b.size - a.size)
  return found
}

/** Bounded source-code pack for review questions: real files the models can cite. */
async function collectCodeContext(roots, maxChars, hints = []) {
  const files = []
  for (const root of roots) {
    if (files.length >= CODE_MAX_FILES) break
    for (const file of await collectSourceFiles(root, hints)) {
      if (files.length >= CODE_MAX_FILES) break
      files.push(file)
    }
  }
  const parts = [`【工作区源码附件】选取 ${files.length} 个源码文件（单文件 ≤${CODE_FILE_CHARS} 字，总预算 ${maxChars} 字）`]
  let used = 0
  let included = 0
  for (const file of files) {
    const budget = Math.min(CODE_FILE_CHARS, maxChars - used)
    if (budget < 200) break
    const content = await readTextFile(file.path, budget)
    if (content === '') continue
    parts.push(`--- ${file.path} ---`, content)
    used += content.length
    included += 1
  }
  return {
    text: included === 0 ? '' : parts.join('\n'),
    chars: used,
    files: included,
    state: included === 0 ? 'none' : 'ok',
  }
}

/** Directory tree plus key-file text for every path the question mentions, or the session workspace. */
async function collectPathContext(question, maxChars, workspaceCwd, codeMaxChars, allowCode = true, attachRoots = []) {
  const hints = questionHints(question)
  const allowedRoots = [workspaceCwd, ...attachRoots].filter((root) => typeof root === 'string' && root !== '')
  /** With no configured allowlist, an explicitly typed path stays readable (local use). */
  const permitted = (candidate) => attachRoots.length === 0
    || allowedRoots.some((root) => candidate === root || isPathInside(candidate, root))
  const candidates = candidatePaths(question, workspaceCwd).filter(permitted)
  /* A named project directory wins over the whole workspace: "评审 dsh-council". */
  if (candidates.length === 0 && typeof workspaceCwd === 'string' && workspaceCwd !== '') {
    let matched
    try {
      const entries = await readdir(workspaceCwd, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        if (hints.indexOf(entry.name.toLowerCase()) !== -1) {
          matched = join(workspaceCwd, entry.name)
          break
        }
      }
    } catch {
      matched = undefined
    }
    if (matched !== undefined) candidates.push(matched)
    else if (WORKSPACE_INTENT.test(String(question || ''))) candidates.push(workspaceCwd)
  }
  const sections = []
  const valid = []
  const dirs = []
  let used = 0
  for (const candidate of candidates) {
    const info = await statSafe(candidate)
    if (info === undefined) continue
    valid.push(candidate)
    if (info.isDirectory()) {
      dirs.push(candidate)
      const tree = await listTree(candidate, MAX_TREE_ENTRIES)
      const files = await keyFiles(candidate)
      const parts = [`【工作区附件：${candidate}】`, `目录树（最多 ${MAX_TREE_ENTRIES} 项）：`, tree.join('\n')]
      for (const file of files) {
        const budget = Math.min(MAX_FILE_CHARS, maxChars - used)
        if (budget <= 0) break
        const content = await readTextFile(file, budget)
        if (content === '') continue
        parts.push(`--- ${file} ---`, content)
        used += content.length
      }
      sections.push(parts.join('\n'))
    } else if (info.isFile()) {
      const budget = Math.min(MAX_FILE_CHARS, maxChars - used)
      const content = await readTextFile(candidate, budget)
      if (content === '') continue
      sections.push(`【工作区附件：${candidate}】\n${content}`)
      used += content.length
    }
    if (used >= maxChars) break
  }
  let codeState = 'off'
  let codeChars = 0
  let codeFiles = 0
  const wantsCode = allowCode && typeof codeMaxChars === 'number' && codeMaxChars > 0
    && REVIEW_INTENT.test(String(question || '')) && dirs.length > 0
  if (wantsCode) {
    const code = await collectCodeContext(dirs, codeMaxChars, hints)
    codeState = code.state
    codeChars = code.chars
    codeFiles = code.files
    if (code.text !== '') sections.push(code.text)
  }
  const text = sections.join('\n\n')
  return {
    text: text === '' ? '' : `${text}\n\n（以上为本地文件内容，供评审参考；不要声称可以访问文件系统。评审类结论必须引用具体文件路径，附件未覆盖的内容须标注【推断】。）`,
    state: valid.length === 0 ? 'none' : 'ok',
    paths: valid,
    chars: text.length,
    codeState,
    codeChars,
    codeFiles,
  }
}

export function apply(ctx, config) {
  /** Character budget for the attached conversation context (profile config). */
  const contextMaxChars = config !== null && typeof config === 'object'
    && Number.isSafeInteger(config.contextMaxChars) && config.contextMaxChars >= 500
    ? Math.min(config.contextMaxChars, 50000)
    : 6000
  /** Character budget for path attachments extracted from the question. */
  const filesMaxChars = config !== null && typeof config === 'object'
    && Number.isSafeInteger(config.filesMaxChars) && config.filesMaxChars >= 2000
    ? Math.min(config.filesMaxChars, 80000)
    : ATTACH_MAX_CHARS
  /** Character budget for the source-code pack attached to review questions. */
  const codeMaxChars = config !== null && typeof config === 'object'
    && Number.isSafeInteger(config.codeMaxChars) && config.codeMaxChars >= 2000
    ? Math.min(config.codeMaxChars, 120000)
    : CODE_MAX_CHARS
  /**
   * Extra read-only skill roots for subagent seats. Configured `skillDirs` wins;
   * otherwise auto-detect the shared agent-library store (~/.dsh/skills already
   * covers the installed subset, this adds the full catalog).
   */
  const configuredSkillDirs = config !== null && typeof config === 'object' && Array.isArray(config.skillDirs)
    ? config.skillDirs.filter((dir) => typeof dir === 'string' && dir !== '')
    : []
  /**
   * Optional allowlist for path attachments. Empty (default) keeps the local
   * single-user behavior: a path the user typed into the question is read.
   * Non-empty confines every attachment to these roots plus the session
   * workspace, so a shared deployment cannot be talked into reading elsewhere.
   */
  const attachRoots = config !== null && typeof config === 'object' && Array.isArray(config.attachRoots)
    ? config.attachRoots.filter((dir) => typeof dir === 'string' && dir !== '')
    : []
  const defaultAgentsHome = process.env.DSH_AGENTS_HOME || join(process.env.USERPROFILE || '', '.agents')
  const defaultSkillStore = process.env.AGLIB_STORE || 'D:\\agent-library'
  const autoSkillDirs = [join(defaultSkillStore, 'catalog')].filter((dir) => existsSync(dir))
  const skillDirs = configuredSkillDirs.length > 0 ? configuredSkillDirs : autoSkillDirs
  /** Live runs by id. */
  const runs = new Map()
  /** Child session id -> seat object, for the per-seat activity label. */
  const liveSeatByChild = new Map()
  ctx.effect(() => ctx.on('session/event', (session, event) => {
    if (session === null || typeof session !== 'object') return
    const seat = liveSeatByChild.get(session.id)
    if (seat === undefined || seat === null) return
    const activity = event !== null && typeof event === 'object' ? SEAT_ACTIVITY[event.type] : undefined
    if (activity === undefined) return
    seat.activity = activity
    seat.activityAt = Date.now()
  }), 'council: seat activity')

  /** Run registry file: survives a Host restart, bounded and best effort. */
  const persistFile = join(process.env.DSH_HOME || join(process.env.USERPROFILE || '', '.dsh'), 'council-runs.json')
  let persistTimer
  function persistRuns() {
    if (persistTimer !== undefined) return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      const rows = []
      for (const run of runs.values()) {
        rows.push({
          id: run.id,
          sessionId: run.sessionId,
          status: run.status,
          stage: run.stage,
          question: String(run.question || '').slice(0, 120),
          createdAt: run.createdAt,
          seatMode: run.seatMode,
          error: run.error,
        })
      }
      try {
        writeFileSync(persistFile, JSON.stringify({ version: 1, runs: rows.slice(-20) }), 'utf8')
      } catch {
        /* persistence is best effort */
      }
    }, 500)
    if (typeof persistTimer.unref === 'function') persistTimer.unref()
  }

  function loadPersistedRuns() {
    let data
    try {
      data = JSON.parse(readFileSync(persistFile, 'utf8'))
    } catch {
      return
    }
    for (const row of Array.isArray(data === null ? undefined : data.runs) ? data.runs : []) {
      if (row === null || typeof row !== 'object' || typeof row.id !== 'string') continue
      if (Date.now() - Number(row.createdAt) > RUN_TTL_MS) continue
      runs.set(row.id, {
        id: row.id,
        sessionId: typeof row.sessionId === 'string' ? row.sessionId : '',
        status: row.status === 'running' ? 'error' : String(row.status || 'error'),
        stage: String(row.stage || 'done'),
        question: String(row.question || ''),
        createdAt: Number(row.createdAt) || Date.now(),
        seatMode: row.seatMode === 'subagent' ? 'subagent' : 'llm',
        error: row.status === 'running' ? 'Host 重启，运行中断' : String(row.error || ''),
        historic: true,
        contextBlock: '',
        contextState: 'off',
        filesState: 'off',
        filesPaths: [],
        filesChars: 0,
        useChairman: true,
        answers: [],
        reviews: [],
        chairman: { key: '', provider: '', model: '', name: '', text: '', done: false, error: '' },
        structure: { roles: {}, stages: [] },
      })
    }
  }
  loadPersistedRuns()

  /** Write-once terminal state: late stage/seat results must not overwrite a stop. */
  function finishRun(run, status, error) {
    if (run.finished === true) return false
    run.finished = true
    run.status = status
    run.error = typeof error === 'string' ? error : ''
    if (run.watchdog !== undefined) {
      clearTimeout(run.watchdog)
      run.watchdog = undefined
    }
    persistRuns()
    return true
  }
  /** Cached catalog; agent/account changes refresh it after MODEL_CACHE_MS. */
  let catalogCache = { at: 0, value: undefined }

  /**
   * Identify the session's workspace the same way the rest of the harness does:
   * the session header's canonical cwd first, then the workspace registry entity.
   */
  function resolveWorkspace(sessionId) {
    const info = { cwd: '', source: 'none', workspaceId: '', name: '' }
    let agent
    if (typeof sessionId === 'string' && sessionId !== '') {
      try {
        agent = ctx.agents.get(sessionId)
      } catch {
        agent = undefined
      }
    }
    if (agent !== undefined && agent !== null) {
      try {
        const cwd = agent.session.header.cwd
        if (typeof cwd === 'string' && cwd !== '') {
          info.cwd = cwd
          info.source = 'session-header'
        }
      } catch {
        /* header unavailable */
      }
    }
    let registry
    try {
      registry = ctx.get('workspaceRegistry')
    } catch {
      registry = undefined
    }
    if (registry !== undefined && registry !== null && typeof registry.list === 'function') {
      let list = []
      try {
        list = registry.list()
      } catch {
        list = []
      }
      for (const workspace of list) {
        if (workspace === null || typeof workspace !== 'object') continue
        const ids = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        const matched = typeof sessionId === 'string' && sessionId !== '' && ids.indexOf(sessionId) !== -1
        const samePath = info.cwd !== '' && workspace.path === info.cwd
        if (!matched && !samePath) continue
        info.workspaceId = typeof workspace.id === 'string' ? workspace.id : ''
        info.name = typeof workspace.name === 'string' && workspace.name !== ''
          ? workspace.name
          : String(workspace.path || '')
        if (info.cwd === '') {
          info.cwd = typeof workspace.path === 'string' ? workspace.path : ''
          info.source = 'workspace-registry'
        }
        break
      }
    }
    if (info.cwd === '') {
      info.cwd = process.cwd()
      info.source = 'process'
    }
    return info
  }

  /** Readiness of the read-only Agent Preset used by subagent-backed seats. */
  let readOnlyPresetReady = Promise.resolve(false)
  ctx.effect(() => {
    let disposed = false
    let unregister
    let presets
    try {
      presets = ctx.get('agentPresets')
    } catch {
      presets = undefined
    }
    if (presets === undefined || presets === null || typeof presets.register !== 'function') {
      readOnlyPresetReady = Promise.resolve(false)
      return
    }
    const definition = {
      id: READ_ONLY_PRESET,
      name: 'Council read-only member',
      description: 'Read-only council seat: file reads, searches and skills, with no mutation tools.',
      order: 90,
      plugins: [
        {
          id: 'persona',
          name: '@deepseek-ai/dsh-persona',
          config: {
            prefix: 'You are a read-only member of a model council. Inspect the workspace with read-only tools; never modify files, never run mutating commands, and answer the question directly.',
          },
        },
        { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config: { read: true, readImage: false, write: false, edit: false } },
        { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
        {
          id: 'skill-filesystem',
          name: '@deepseek-ai/dsh-skill-filesystem',
          config: skillDirs.length > 0 ? { customSkillDirs: skillDirs } : {},
        },
        { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
        { id: 'time-context', name: '@deepseek-ai/dsh-time-context' },
      ],
    }
    readOnlyPresetReady = presets.register(definition)
      .then((disposePreset) => {
        if (disposed) {
          try {
            void disposePreset().catch(() => {})
          } catch {
            /* best effort */
          }
          return false
        }
        unregister = disposePreset
        return true
      })
      .catch((error) => {
        console.warn('[council] read-only agent preset unavailable:', error instanceof Error ? error.message : String(error))
        return false
      })
    return () => {
      disposed = true
      try {
        if (typeof unregister === 'function') void unregister().catch(() => {})
      } catch {
        /* best effort */
      }
    }
  }, 'council: read-only preset')

  /** Enumerate every configured provider and its text models. */
  async function catalog() {    if (catalogCache.value !== undefined && Date.now() - catalogCache.at < MODEL_CACHE_MS) return catalogCache.value
    let providers = []
    try {
      providers = ctx.llm.listProviders()
    } catch {
      providers = []
    }
    const result = []
    for (const provider of providers) {
      let models = []
      try {
        models = await ctx.llm.listModels(provider.id)
      } catch {
        models = []
      }
      const rows = []
      for (const model of models) {
        if (model === null || typeof model !== 'object') continue
        if (typeof model.id !== 'string' || model.id === '') continue
        if (EXCLUDED_MODEL.test(model.id)) continue
        const modalities = model.inputModalities
        if (Array.isArray(modalities) && modalities.length > 0 && modalities.indexOf('text') === -1) continue
        rows.push({
          id: model.id,
          name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
          contextWindow: typeof model.contextWindow === 'number' ? model.contextWindow : undefined,
          maxTokens: typeof model.maxTokens === 'number' ? model.maxTokens : undefined,
        })
      }
      if (rows.length > 0) {
        result.push({
          id: provider.id,
          name: typeof provider.name === 'string' && provider.name !== '' ? provider.name : provider.id,
          models: rows,
        })
      }
    }
    catalogCache = { at: Date.now(), value: { providers: result } }
    return catalogCache.value
  }

  /** Resolve one requested route against the catalog. */
  function findRoute(cat, providerId, modelId) {
    for (const provider of cat.providers) {
      if (provider.id !== providerId) continue
      for (const model of provider.models) {
        if (model.id !== modelId) continue
        return {
          key: `${provider.id}|${model.id}`,
          provider: provider.id,
          providerName: provider.name,
          model: model.id,
          name: model.name,
        }
      }
    }
    return undefined
  }

  /** Global per-provider slot so tabs/chats cannot multiply provider concurrency. */
  const providerActive = new Map()
  async function withProviderSlot(provider, signal, run) {
    while ((providerActive.get(provider) || 0) >= PROVIDER_CONCURRENCY) {
      if (signal !== undefined && signal.aborted) throw new Error('已取消')
      await new Promise((resolve) => setTimeout(resolve, 40))
    }
    providerActive.set(provider, (providerActive.get(provider) || 0) + 1)
    try {
      return await run()
    } finally {
      providerActive.set(provider, Math.max(0, (providerActive.get(provider) || 1) - 1))
    }
  }

  /** Stream one model call; retries transient provider failures with backoff. */
  async function callModel(route, system, userText, maxTokens, signal, onDelta) {
    let budget = maxTokens
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (signal.aborted) throw new Error('已取消')
      const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
      const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout
      let text = ''
      let finish
      let thrown
      try {
        await withProviderSlot(route.provider, signal, async () => {
          const stream = ctx.llm.stream({
            provider: route.provider,
            model: route.model,
            system,
            messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            maxTokens: budget,
            signal: combined,
          })
          for await (const chunk of stream) {
            if (chunk === null || typeof chunk !== 'object') continue
            if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
              text += chunk.text
              if (typeof onDelta === 'function') onDelta(text)
            } else if (chunk.type === 'block-end' && text === '' && chunk.block !== null && typeof chunk.block === 'object') {
              if (chunk.block.type === 'text' && typeof chunk.block.text === 'string') {
                text = chunk.block.text
                if (typeof onDelta === 'function') onDelta(text)
              }
            } else if (chunk.type === 'finish') {
              finish = chunk.reason
            }
          }
        })
      } catch (error) {
        thrown = error
      }
      if (thrown !== undefined) {
        lastError = thrown instanceof Error ? thrown : new Error(String(thrown))
        if (signal.aborted) throw new Error('已取消')
        if (attempt < 2 && TRANSIENT_FAILURE.test(lastError.message)) {
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
          continue
        }
        throw lastError
      }
      /* Adapter and transport failures settle as a terminal finish chunk rather
         than a throw; surfacing them keeps one failed seat from looking empty. */
      if (finish !== null && typeof finish === 'object') {
        if (finish.kind === 'aborted') throw new Error('调用被中止或超时')
        if (finish.kind === 'error') {
          const failure = finish.failure
          const detail = failure !== null && typeof failure === 'object'
            ? `${String(failure.message)} (${String(failure.code)})`
            : '未知错误'
          lastError = new Error(detail)
          if (attempt < 2 && TRANSIENT_FAILURE.test(detail)) {
            await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
            continue
          }
          throw lastError
        }
      }
      const trimmed = text.trim()
      if (trimmed !== '') return trimmed
      /* Reasoning-only completion burned the whole budget: retry once larger. */
      if (finish !== null && typeof finish === 'object' && finish.kind === 'max-tokens' && attempt === 0) {
        budget = Math.min(Math.max(budget * 2, RETRY_MAX_TOKENS), RETRY_MAX_TOKENS)
        continue
      }
      lastError = new Error(finish !== null && typeof finish === 'object' && finish.kind === 'max-tokens'
        ? '输出预算耗尽且无正文（max-tokens，已重试）'
        : '模型返回了空内容')
      break
    }
    throw lastError ?? new Error('模型调用失败')
  }

  /** Compact per-seat diagnostics for the browser. */
  function summarizeSeat(seat) {
    if (seat === undefined || seat === null) return { phase: 'idle', childId: '', elapsedMs: 0, fallback: false, activity: '', activityMs: 0 }
    const startedAt = typeof seat.startedAt === 'number' ? seat.startedAt : 0
    const finishedAt = typeof seat.finishedAt === 'number' ? seat.finishedAt : Date.now()
    return {
      phase: typeof seat.phase === 'string' ? seat.phase : 'idle',
      childId: typeof seat.childId === 'string' ? seat.childId : '',
      elapsedMs: startedAt === 0 ? 0 : Math.max(0, finishedAt - startedAt),
      fallback: seat.fallback === true,
      fallbackFrom: typeof seat.fallbackFrom === 'string' ? seat.fallbackFrom : '',
      activity: typeof seat.activity === 'string' ? seat.activity : '',
      activityMs: typeof seat.activityAt === 'number' ? Math.max(0, Date.now() - seat.activityAt) : 0,
    }
  }

  /** Run snapshot returned to the browser. */
  function snapshot(run) {
    return {
      id: run.id,
      status: run.status,
      stage: run.stage,
      question: run.question,
      error: run.error,
      createdAt: run.createdAt,
      contextChars: run.contextBlock === '' ? 0 : run.contextBlock.length,
      contextState: run.contextState === undefined ? 'off' : run.contextState,
      filesState: run.filesState === undefined ? 'off' : run.filesState,
      filesPaths: run.filesPaths === undefined ? [] : run.filesPaths,
      filesChars: run.filesChars === undefined ? 0 : run.filesChars,
      codeState: run.codeState === undefined ? 'off' : run.codeState,
      codeFiles: run.codeFiles === undefined ? 0 : run.codeFiles,
      codeChars: run.codeChars === undefined ? 0 : run.codeChars,
      workspace: run.workspace === undefined ? { cwd: '', source: 'none', workspaceId: '', name: '' } : run.workspace,
      structure: run.structure === undefined ? { roles: {}, stages: [] } : run.structure,
      seatMode: run.seatMode === undefined ? 'llm' : run.seatMode,
      fallbacks: run.fallbacks === undefined ? 0 : run.fallbacks,
      fallbackLimit: MAX_FALLBACKS_PER_RUN,
      resumed: run.resumed === undefined ? '' : run.resumed,
      useChairman: run.useChairman !== false,
      answers: run.answers.map((answer) => ({
        key: answer.key,
        provider: answer.provider,
        model: answer.model,
        name: answer.name,
        text: answer.text,
        done: answer.done,
        error: answer.error,
        seat: summarizeSeat(answer.seat),
      })),
      reviews: run.reviews.map((review) => ({
        key: review.key,
        reviewer: review.reviewer,
        text: review.text,
        done: review.done,
        error: review.error,
        seat: summarizeSeat(review.seat),
      })),
      chairman: {
        key: run.chairman.key,
        provider: run.chairman.provider,
        model: run.chairman.model,
        name: run.chairman.name,
        text: run.chairman.text,
        done: run.chairman.done,
        error: run.chairman.error,
        seat: summarizeSeat(run.chairman.seat),
      },
    }
  }

  /** Drop expired runs and keep the map bounded. */
  function prune() {
    const now = Date.now()
    for (const [id, run] of runs) {
      if (now - run.createdAt <= RUN_TTL_MS) continue
      try {
        run.controller.abort()
      } catch {
        /* best effort */
      }
      if (run.watchdog !== undefined) clearTimeout(run.watchdog)
      runs.delete(id)
    }
    while (runs.size > MAX_RUNS) {
      const oldest = runs.keys().next().value
      const run = runs.get(oldest)
      if (run !== undefined) {
        try {
          run.controller.abort()
        } catch {
          /* best effort */
        }
        if (run.watchdog !== undefined) clearTimeout(run.watchdog)
      }
      runs.delete(oldest)
    }
  }

  /**
   * Recent conversation context of one Session, newest messages last.
   * `snapshotEvents()` is a DSH internal surface, so every failure degrades to
   * the question-only prompt and reports that state to the browser.
   * @returns the formatted block and a state of 'ok' | 'empty' | 'unavailable'.
   */
  function conversationContext(sessionId, maxChars) {
    if (typeof sessionId !== 'string' || sessionId === '') return { text: '', state: 'unavailable' }
    let agent
    try {
      agent = ctx.agents.get(sessionId)
    } catch {
      agent = undefined
    }
    if (agent === undefined || agent === null) return { text: '', state: 'unavailable' }
    let events = []
    try {
      events = agent.session.snapshotEvents()
    } catch {
      return { text: '', state: 'unavailable' }
    }
    if (!Array.isArray(events)) return { text: '', state: 'unavailable' }
    const lines = []
    for (const event of events) {
      if (event === null || typeof event !== 'object') continue
      let message
      if (event.type === 'user/message') message = event.data
      else if (event.type === 'assistant/message') {
        message = event.data !== null && typeof event.data === 'object' ? event.data.message : undefined
      } else continue
      if (message === null || typeof message !== 'object') continue
      const role = message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Assistant' : undefined
      if (role === undefined) continue
      const text = messageText(message.content)
      if (text === '') continue
      lines.push(`${role}: ${text}`)
    }
    if (lines.length === 0) return { text: '', state: 'empty' }
    const kept = []
    let used = 0
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]
      if (used + line.length > maxChars && kept.length > 0) break
      kept.push(line)
      used += line.length + 1
    }
    kept.reverse()
    return {
      text: `【当前对话上下文（节选，最近 ${kept.length} 条消息）】\n${kept.join('\n\n')}`,
      state: 'ok',
    }
  }

  /** One chat message carrying the council's conclusion back to the main Agent. */
  function feedbackText(run) {
    const parts = ['【多模型理事会结论】', `问题：${run.question}`, '']
    if (run.chairman.text !== '') {
      parts.push(run.chairman.text)
    } else {
      parts.push('（无主模式：以下为各模型答案与匿名互评，未做主席汇总）', '')
      for (const answer of run.answers) parts.push(`### ${answer.name}`, answer.text !== '' ? answer.text : answer.error, '')
      for (const review of run.reviews) {
        if (review.text !== '') parts.push(`### 评审 · ${review.reviewer}`, review.text, '')
      }
    }
    parts.push(`（参与模型：${run.answers.map((answer) => answer.name).join('、')}；完整过程在右侧栏「理事会」）`)
    return parts.join('\n')
  }

  /**
   * Deliver one finished run back to its session.
   * `silent` uses `agent.inject()`: the conclusion becomes model-facing context
   * claimed at the next pre-step, so it never occupies an inbox queue slot and
   * never opens a turn. `wake` is a subagent-style parent delivery (`followup`).
   * @param run - completed run owning the target session.
   * @param mode - 'silent' or 'wake'.
   */
  function resumeRun(run, mode) {
    if (typeof run.sessionId !== 'string' || run.sessionId === '') throw new Error('该运行没有关联会话，无法回投')
    const agent = ctx.agents.get(run.sessionId)
    if (agent === undefined || agent === null) throw new Error('主会话当前没有活跃 Agent')
    const message = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: [{ type: 'text', text: feedbackText(run) }],
      source: { kind: 'council' },
    }
    if (mode === 'wake') agent.followup(message)
    else agent.inject(message)
    run.resumed = mode
  }

  /** One read-only subagent seat, built on the same delegation runtime as the subagent tool. */
  async function callSeatSubagent(parent, route, system, userText, maxTokens, signal, cwd, seat, liveSeats) {
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
    const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout
    if (seat !== undefined && seat !== null) {
      seat.phase = 'starting'
      seat.startedAt = Date.now()
      seat.activity = 'start'
      seat.activityAt = Date.now()
    }
    let activation
    try {
      activation = await withTimeout(ctx.subagents.startActivation({
        provider: 'spawn',
        label: `council-${route.name}`.slice(0, 60),
        delivery: 'caller',
        signal: combined,
        request: {
          parent,
          prompt: [{ type: 'text', text: `${system}\n\n---\n\n${userText}` }],
          agentOptions: { provider: route.provider, model: route.model, maxTokens },
          agentPreset: READ_ONLY_PRESET,
          ...(typeof cwd === 'string' && cwd !== '' ? { cwd } : {}),
        },
      }), SEAT_START_TIMEOUT_MS, '子代理启动超时（等待 delegation 容量或会话创建）')
      if (seat !== undefined && seat !== null) {
        seat.phase = 'running'
        seat.childId = typeof activation.childId === 'string' ? activation.childId : ''
        if (seat.childId !== '') liveSeatByChild.set(seat.childId, seat)
      }
      if (liveSeats !== undefined && liveSeats !== null) liveSeats.add(activation)
      /* The race below may abandon this promise; keep a late settlement handled. */
      void activation.result.catch(() => {})
      const result = await withTimeout(
        activation.result,
        SEAT_RESULT_TIMEOUT_MS,
        '子代理执行超时（未在预算内 settle）',
      )
      const blocks = result !== null && typeof result === 'object' && Array.isArray(result.output) ? result.output : []
      const parts = []
      for (const block of blocks) {
        if (block !== null && typeof block === 'object'
          && block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          parts.push(block.text.trim())
        }
      }
      const text = parts.join('\n\n')
      if (text === '') throw new Error('子代理返回了空内容')
      if (seat !== undefined && seat !== null) {
        seat.phase = 'done'
        seat.finishedAt = Date.now()
      }
      return text
    } finally {
      if (seat !== undefined && seat !== null && seat.phase !== 'done') seat.phase = 'closed'
      if (seat !== undefined && seat !== null && seat.childId !== '') liveSeatByChild.delete(seat.childId)
      if (activation !== undefined) {
        if (liveSeats !== undefined && liveSeats !== null) liveSeats.delete(activation)
        try {
          await activation.dispose()
        } catch {
          /* best effort */
        }
      }
    }
  }

  /** Execute the three stages for one run. */
  async function execute(run, routes) {
    const signal = run.controller.signal
    const baseQuestion = run.contextBlock === '' ? run.question : `${run.contextBlock}\n\n---\n\n问题：${run.question}`
    const workspaceLine = run.workspace !== undefined && typeof run.workspace.cwd === 'string' && run.workspace.cwd !== ''
      ? run.workspace.cwd
      : ''
    const attachmentNote = run.seatMode === 'subagent' && workspaceLine !== ''
      ? `【工作区】你有只读工具（read/glob/grep/skill）。工作区根目录：${workspaceLine}。请自己检索并打开相关文件后再下结论，不要依据附件摘要猜测；结论必须引用具体文件路径，没查到的内容标注【未核实】。`
      : run.codeState === 'ok'
        ? '【附件说明】附件包含工作区实际文件与源码片段（路径已标注）。评审结论必须引用具体文件路径；附件未覆盖的内容必须标注【推断】，不得编造文件内容。'
        : run.filesState === 'ok'
          ? '【附件说明】附件包含工作区目录树与关键文档（路径已标注）。引用具体文件路径；未覆盖内容标注【推断】。'
          : ''
    const questionBlock = attachmentNote === '' ? baseQuestion : `${baseQuestion}\n\n${attachmentNote}`
    /* Reviews and the chairman get the question plus answers; re-sending the full
       source pack would triple latency and token cost without adding evidence. */
    const reviewQuestionBlock = attachmentNote === '' ? run.question : `${run.question}\n\n${attachmentNote}`
    const useSubagentSeats = run.seatMode === 'subagent' && run.parent !== undefined && run.parent !== null
    /**
     * Stage-1 seat: read-only subagent when enabled, falling back to a raw model
     * call when the seat times out or fails. Reviews and the chairman always use
     * the fast raw path so a six-model run cannot spend a whole subagent turn
     * per reviewer.
     */
    const invokeAnswer = async (route, system, prompt, maxTokens, onDelta, seat) => {
      if (!useSubagentSeats) return callModel(route, system, prompt, maxTokens, signal, onDelta)
      try {
        return await callSeatSubagent(run.parent, route, system, prompt, maxTokens, signal, run.cwd, seat, run.liveSeats)
      } catch (error) {
        if (signal.aborted) throw new Error('已取消')
        if (run.fallbacks >= MAX_FALLBACKS_PER_RUN) {
          throw new Error(`${errorText(error)}（降级配额已用尽：本 run 最多降级 ${MAX_FALLBACKS_PER_RUN} 席）`)
        }
        run.fallbacks += 1
        if (seat !== undefined && seat !== null) {
          seat.phase = 'fallback'
          seat.fallback = true
          seat.fallbackFrom = 'subagent'
        }
        return callModel(route, system, prompt, maxTokens, signal, onDelta)
      }
    }
    const concurrency = useSubagentSeats ? SEAT_CONCURRENCY : run.answers.length
    try {
      /* Stage 1: independent answers. */
      run.stage = 'answers'
      await runLimited(run.answers, concurrency, async (answer) => {
        try {
          answer.text = await invokeAnswer(routes[answer.key], ANSWER_SYSTEM, questionBlock, ANSWER_MAX_TOKENS, (text) => {
            answer.text = text
          }, answer.seat)
        } catch (error) {
          answer.error = errorText(error)
        }
        answer.done = true
      })
      if (signal.aborted) throw new Error('已取消')
      const usable = run.answers.filter((answer) => answer.error === '' && answer.text !== '')
      if (usable.length === 0) {
        run.status = 'error'
        run.error = '所有模型作答失败'
        return
      }

      /* Stage 2: anonymous peer review and ranking. */
      run.stage = 'reviews'
      const labeled = run.answers
        .map((answer, index) => {
          if (answer.error !== '' || answer.text === '') return `【回答 ${letter(index)}】\n（该模型作答失败）`
          return `【回答 ${letter(index)}】\n${clip(answer.text)}`
        })
        .join('\n\n')
      const reviewPrompt = [
        reviewQuestionBlock,
        `各模型对同一问题的匿名回答：\n\n${labeled}`,
        [
          '请完成：',
          '1. 逐个指出回答中的事实错误、遗漏与含糊之处；',
          '2. 按准确性与洞察力对回答排序（写字母）；',
          '3. 给出你认为最好的最终答案。',
          '保持简洁。',
        ].join('\n'),
      ].join('\n\n')
      await runLimited(run.reviews, run.reviews.length, async (review) => {
        try {
          review.text = await callModel(routes[review.key], REVIEW_SYSTEM, reviewPrompt, REVIEW_MAX_TOKENS, signal, (text) => {
            review.text = text
          })
        } catch (error) {
          review.error = errorText(error)
        }
        review.done = true
      })

      if (signal.aborted) throw new Error('已取消')
      if (run.useChairman === false) {
        run.stage = 'done'
        finishRun(run, 'done', '')
        return
      }

      /* Stage 3: chairman synthesis. */
      run.stage = 'chairman'
      const answersBlock = run.answers
        .map((answer, index) => {
          if (answer.error !== '' || answer.text === '') return `【回答 ${letter(index)}｜${answer.name}】\n（失败）`
          return `【回答 ${letter(index)}｜${answer.name}】\n${clip(answer.text)}`
        })
        .join('\n\n')
      const reviewsBlock = run.reviews
        .map((review, index) => {
          if (review.error !== '' || review.text === '') return `【评审 ${letter(index)}】\n（失败）`
          return `【评审 ${letter(index)}】\n${clip(review.text)}`
        })
        .join('\n\n')
      const chairmanPrompt = [
        reviewQuestionBlock,
        `各模型的回答：\n\n${answersBlock}`,
        `各模型的匿名互评：\n\n${reviewsBlock}`,
        '你是理事会主席。请综合以上材料输出最终结论：共识、分歧与盲点、最终建议，以及结论依赖的前提。',
      ].join('\n\n')
      run.chairman.text = await callModel(
        routes[run.chairman.key],
        CHAIRMAN_SYSTEM,
        chairmanPrompt,
        CHAIRMAN_MAX_TOKENS,
        signal,
        (text) => {
          run.chairman.text = text
        },
      )
      run.chairman.done = true
      run.stage = 'done'
      finishRun(run, 'done', '')
    } catch (error) {
      finishRun(run, 'error', signal.aborted ? '已取消' : errorText(error))
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/council',
    handler: async (req, res) => {
      try {
        const url = new URL(typeof req.url === 'string' ? req.url : '/council', 'http://127.0.0.1')
        const path = url.pathname.replace(/^\/council/, '') || '/'

        if (req.method === 'GET' && path === '/models') {
          const cat = await catalog()
          sendJson(res, 200, { providers: cat.providers, contextMaxChars, filesMaxChars })
          return
        }
        if (req.method === 'GET' && path === '/runs') {
          const sessionId = url.searchParams.get('sessionId') || ''
          const list = []
          for (const run of runs.values()) {
            if (sessionId !== '' && run.sessionId !== sessionId) continue
            list.push(snapshot(run))
          }
          list.sort((a, b) => b.createdAt - a.createdAt)
          sendJson(res, 200, { runs: list.slice(0, 5) })
          return
        }
        if (req.method === 'GET' && path === '/diag') {
          const runsOut = []
          for (const run of runs.values()) runsOut.push(snapshot(run))
          const agentsOut = []
          try {
            const list = typeof ctx.agents.list === 'function' ? ctx.agents.list() : []
            for (const agent of list) {
              if (agent === null || typeof agent !== 'object') continue
              agentsOut.push({ id: agent.id, status: agent.status })
            }
          } catch {
            /* diagnostics must never throw */
          }
          sendJson(res, 200, { build: 'v20', runs: runsOut.slice(-10), agents: agentsOut.slice(-30) })
          return
        }
        if (req.method === 'GET' && path === '/workspace') {
          const sessionId = url.searchParams.get('sessionId') || ''
          sendJson(res, 200, resolveWorkspace(sessionId))
          return
        }
        if (req.method === 'GET' && path === '/') {
          sendJson(res, 200, { ok: true, build: 'v20' })
          return
        }
        if (req.method === 'POST' && path === '/run') {
          let body
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            sendJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const question = typeof body.question === 'string' ? body.question.trim() : ''
          if (question === '') {
            sendJson(res, 400, { error: '问题不能为空' })
            return
          }
          if (question.length > MAX_QUESTION) {
            sendJson(res, 400, { error: '问题过长' })
            return
          }
          const cat = await catalog()
          const requested = Array.isArray(body.models) ? body.models : []
          const seen = new Set()
          const selected = []
          for (const item of requested.slice(0, MAX_MODELS)) {
            if (item === null || typeof item !== 'object') continue
            const route = findRoute(cat, String(item.provider || ''), String(item.model || ''))
            if (route === undefined || seen.has(route.key)) continue
            seen.add(route.key)
            selected.push(route)
          }
          if (selected.length < 2) {
            sendJson(res, 400, { error: '至少选择两个模型' })
            return
          }
          prune()
          const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
          if (sessionId !== '') {
            for (const existing of runs.values()) {
              if (existing.historic !== true && existing.sessionId === sessionId && existing.status === 'running') {
                sendJson(res, 409, { error: '该会话已有运行中的评审', runId: existing.id })
                return
              }
            }
          }
          const useChairman = body.useChairman !== false
          const workspace = resolveWorkspace(sessionId)
          let seatMode = 'llm'
          let seatParent
          if (body.seatMode === 'subagent') {
            let presetReady = false
            try {
              presetReady = await Promise.race([
                readOnlyPresetReady,
                new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
              ])
            } catch {
              presetReady = false
            }
            if (presetReady) {
              try {
                seatParent = ctx.agents.get(sessionId)
              } catch {
                seatParent = undefined
              }
              if (seatParent !== undefined && seatParent !== null) seatMode = 'subagent'
            }
          }
          let chairman = selected[0]
          if (body.chairman !== null && typeof body.chairman === 'object') {
            const chosen = findRoute(cat, String(body.chairman.provider || ''), String(body.chairman.model || ''))
            if (chosen !== undefined && selected.some((route) => route.key === chosen.key)) chairman = chosen
          }
          /* Optional reviewer group, defaulting to every answerer (subagent/group style roster). */
          const reviewerRoutes = []
          const requestedReviewers = Array.isArray(body.reviewers) ? body.reviewers : []
          for (const item of requestedReviewers.slice(0, MAX_MODELS)) {
            if (item === null || typeof item !== 'object') continue
            const route = findRoute(cat, String(item.provider || ''), String(item.model || ''))
            if (route === undefined) continue
            if (!selected.some((candidate) => candidate.key === route.key)) continue
            if (reviewerRoutes.some((candidate) => candidate.key === route.key)) continue
            reviewerRoutes.push(route)
          }
          const reviewers = reviewerRoutes.length > 0 ? reviewerRoutes : selected
          const contextParts = []
          let contextState = 'off'
          if (body.context === true) {
            const context = conversationContext(sessionId, contextMaxChars)
            contextState = context.state
            if (context.text !== '') contextParts.push(context.text)
          }
          let filesState = 'off'
          let filesPaths = []
          let filesChars = 0
          let codeState = 'off'
          let codeFiles = 0
          let codeChars = 0
          if (body.attachFiles !== false) {
            /* Seats with read-only tools grep the workspace themselves; only
               tool-less llm seats need the bounded source pack. */
            const files = await collectPathContext(
              question, filesMaxChars, workspace.cwd, codeMaxChars, seatMode !== 'subagent', attachRoots,
            )
            filesState = files.state
            filesPaths = files.paths
            filesChars = files.chars
            codeState = files.codeState
            codeFiles = files.codeFiles
            codeChars = files.codeChars
            if (files.text !== '') contextParts.push(files.text)
          }
          const structure = {
            roles: {
              answerers: selected.map((route) => route.key),
              reviewers: reviewers.map((route) => route.key),
              arbiter: useChairman ? chairman.key : '',
            },
            stages: useChairman ? ['answers', 'reviews', 'synthesize'] : ['answers', 'reviews'],
            seatStages: seatMode === 'subagent'
              ? { answers: 'subagent', reviews: 'llm', synthesize: 'llm' }
              : { answers: 'llm', reviews: 'llm', synthesize: 'llm' },
            workspace,
            seatMode,
          }
          const run = {
            id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
            createdAt: Date.now(),
            sessionId,
            useChairman,
            seatMode,
            cwd: workspace.cwd,
            ...(seatParent === undefined ? {} : { parent: seatParent }),
            contextState,
            filesState,
            filesPaths,
            filesChars,
            codeState,
            codeFiles,
            codeChars,
            workspace,
            structure,
            contextBlock: contextParts.join('\n\n'),
            status: 'running',
            stage: 'answers',
            question,
            error: '',
            controller: new AbortController(),
            answers: selected.map((route) => ({
              key: route.key,
              provider: route.provider,
              model: route.model,
              name: route.name,
              text: '',
              done: false,
              error: '',
              seat: { phase: 'idle' },
            })),
            reviews: reviewers.map((route) => ({
              key: route.key,
              reviewer: route.name,
              text: '',
              done: false,
              error: '',
              seat: { phase: 'idle' },
            })),
            chairman: {
              key: chairman.key,
              provider: chairman.provider,
              model: chairman.model,
              name: chairman.name,
              text: '',
              done: false,
              error: '',
              seat: { phase: 'idle' },
            },
            liveSeats: new Set(),
            fallbacks: 0,
          }
          const routes = {}
          for (const route of selected) routes[route.key] = route
          run.watchdog = setTimeout(() => {
            if (run.status !== 'running') return
            finishRun(run, 'error', '运行超时（30 分钟），已中止')
            try {
              run.controller.abort()
            } catch {
              /* best effort */
            }
            for (const activation of run.liveSeats) {
              void activation.dispose().catch(() => {})
            }
          }, RUN_TIMEOUT_MS)
          if (typeof run.watchdog.unref === 'function') run.watchdog.unref()
          runs.set(run.id, run)
          persistRuns()
          void execute(run, routes)
          sendJson(res, 200, { runId: run.id })
          return
        }

        const readMatch = /^\/run\/([A-Za-z0-9]+)$/.exec(path)
        if (req.method === 'GET' && readMatch !== null) {
          const run = runs.get(readMatch[1])
          if (run === undefined) {
            sendJson(res, 404, { error: 'run not found' })
            return
          }
          sendJson(res, 200, snapshot(run))
          return
        }

        const resumeMatch = /^\/run\/([A-Za-z0-9]+)\/resume$/.exec(path)
        if (req.method === 'POST' && resumeMatch !== null) {
          const run = runs.get(resumeMatch[1])
          if (run === undefined) {
            sendJson(res, 404, { error: 'run not found' })
            return
          }
          let body = {}
          try {
            body = JSON.parse((await readBody(req)) || '{}')
          } catch {
            sendJson(res, 400, { error: 'invalid JSON body' })
            return
          }
          const mode = body.mode === 'silent' ? 'silent' : body.mode === 'wake' ? 'wake' : ''
          if (mode === '') {
            sendJson(res, 400, { error: 'mode must be silent or wake' })
            return
          }
          if (run.status !== 'done') {
            sendJson(res, 409, { error: '运行尚未完成' })
            return
          }
          if (run.resumed !== undefined) {
            sendJson(res, 409, { error: '该结果已回投过' })
            return
          }
          try {
            resumeRun(run, mode)
            sendJson(res, 200, { ok: true, mode })
          } catch (error) {
            sendJson(res, 409, { error: errorText(error) })
          }
          return
        }

        const cancelMatch = /^\/run\/([A-Za-z0-9]+)\/cancel$/.exec(path)
        if (req.method === 'POST' && cancelMatch !== null) {
          const run = runs.get(cancelMatch[1])
          if (run === undefined) {
            sendJson(res, 404, { error: 'run not found' })
            return
          }
          finishRun(run, 'error', '已取消')
          try {
            run.controller.abort()
          } catch {
            /* best effort */
          }
          const live = run.liveSeats === undefined ? [] : Array.from(run.liveSeats)
          for (const activation of live) {
            try {
              await activation.dispose()
            } catch {
              /* best effort */
            }
          }
          sendJson(res, 200, { ok: true })
          return
        }

        sendJson(res, 404, { error: 'not found' })
      } catch (error) {
        try {
          sendJson(res, 500, { error: errorText(error) })
        } catch {
          /* the response may already be gone */
        }
      }
    },
  }), 'council: http routes')

  ctx.effect(() => () => {
    for (const run of runs.values()) {
      try {
        run.controller.abort()
      } catch {
        /* best effort */
      }
      if (run.watchdog !== undefined) clearTimeout(run.watchdog)
      if (run.liveSeats !== undefined) {
        for (const activation of run.liveSeats) {
          void activation.dispose().catch(() => {})
        }
      }
    }
    runs.clear()
  }, 'council: runs')
}

/* Pure helpers exported for the host harness (`dev/verify-host.mjs`). */
export {
  TRANSIENT_FAILURE,
  candidatePaths,
  collectCodeContext,
  collectPathContext,
  collectSourceFiles,
  isPathInside,
  readTextFile,
  runLimited,
  withTimeout,
}
