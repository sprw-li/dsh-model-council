/**
 * Host half of @local/council.
 *
 * Serves the configured model catalog and runs one council:
 *   1. answers  - every selected model answers the question in parallel;
 *   2. reviews  - every model reviews the anonymized answers and ranks them;
 *   3. chairman - one elected model synthesizes consensus, dissent and advice.
 *
 * The Client half polls `GET /council/run/<id>` for a snapshot while the run
 * streams, so no long-lived socket is required.
 *
 * Routes (same origin, cookie auth):
 *   GET  /council/models            configured providers and text models
 *   POST /council/run               { question, models: [{ provider, model }] }
 *   GET  /council/run/<id>          run snapshot
 *   POST /council/run/<id>/cancel   abort every in-flight call
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'

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
const SEAT_RESULT_TIMEOUT_MS = 120000
/** Whole-run watchdog: a stuck stage can never hold the UI forever. */
const RUN_TIMEOUT_MS = 30 * 60 * 1000
/** Concurrent subagent seats; the delegation runtime has a shared capacity pool (default 8). */
const SEAT_CONCURRENCY = 3
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
  '.tsx', '.mjs', '.cjs', '.c', '.h', '.cpp', '.rs', '.go', '.java',
])
const SECRET_NAME = /(^|[\\/])(\.env[^\\/]*|id_rsa[^\\/]*|id_ed25519[^\\/]*|credentials[^\\/]*|\.npmrc|\.pypirc|\.netrc)$/i
/** A question that means the session workspace even without an explicit path. */
const WORKSPACE_INTENT = /(工作区|项目|仓库|代码库|目录|本仓库|本项目|workspace|repository|repo\b|project|codebase)/i
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
    else if (typeof workspaceCwd === 'string' && workspaceCwd !== '') push(join(workspaceCwd, value))
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

/** Read one text file with the attachment budget; binary/missing files are skipped. */
async function readTextFile(path, maxChars) {
  if (SECRET_NAME.test(path)) return ''
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > 1024 * 1024) return ''
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) return ''
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

/** Directory tree plus key-file text for every path the question mentions, or the session workspace. */
async function collectPathContext(question, maxChars, workspaceCwd) {
  const candidates = candidatePaths(question, workspaceCwd)
  if (candidates.length === 0 && typeof workspaceCwd === 'string' && workspaceCwd !== ''
    && WORKSPACE_INTENT.test(String(question || ''))) {
    candidates.push(workspaceCwd)
  }
  const sections = []
  const valid = []
  let used = 0
  for (const candidate of candidates) {
    const info = await statSafe(candidate)
    if (info === undefined) continue
    valid.push(candidate)
    if (info.isDirectory()) {
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
  const text = sections.join('\n\n')
  return {
    text: text === '' ? '' : `${text}\n\n（以上为本地文件内容，供评审参考；不要声称可以访问文件系统。）`,
    state: valid.length === 0 ? 'none' : 'ok',
    paths: valid,
    chars: text.length,
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
        { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
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

  /** Stream one model call, reporting cumulative text. */
  async function callModel(route, system, userText, maxTokens, signal, onDelta) {
    let budget = maxTokens
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
      const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout
      let text = ''
      let finish
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
      /* Adapter and transport failures settle as a terminal finish chunk rather
         than a throw; surfacing them keeps one failed seat from looking empty. */
      if (finish !== null && typeof finish === 'object') {
        if (finish.kind === 'aborted') {
          lastError = new Error('调用被中止或超时')
          break
        }
        if (finish.kind === 'error') {
          const failure = finish.failure
          const detail = failure !== null && typeof failure === 'object' ? `${failure.message} (${failure.code})` : '未知错误'
          lastError = new Error(detail)
          break
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
      workspace: run.workspace === undefined ? { cwd: '', source: 'none', workspaceId: '', name: '' } : run.workspace,
      structure: run.structure === undefined ? { roles: {}, stages: [] } : run.structure,
      seatMode: run.seatMode === undefined ? 'llm' : run.seatMode,
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
   * Deliver one finished run back to its session, matching the subagent
   * settlement boundary: both modes target the NEXT TURN, never the current
   * step. `silent` only omits the wake; `wake` is exactly a subagent-style
   * parent delivery (`followup`).
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
      source: { kind: 'user' },
    }
    if (mode === 'wake') agent.followup(message)
    else agent.send(message, 'next-turn', false)
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
    const questionBlock = run.contextBlock === '' ? run.question : `${run.contextBlock}\n\n---\n\n问题：${run.question}`
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
        if (seat !== undefined && seat !== null) {
          seat.phase = 'fallback'
          seat.fallback = true
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
        questionBlock,
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
        run.status = 'done'
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
        questionBlock,
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
      run.status = 'done'
    } catch (error) {
      if (run.status !== 'error') {
        run.status = 'error'
        run.error = signal.aborted ? '已取消' : errorText(error)
      }
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
          sendJson(res, 200, { build: 'v13', runs: runsOut.slice(-10), agents: agentsOut.slice(-30) })
          return
        }
        if (req.method === 'GET' && path === '/workspace') {
          const sessionId = url.searchParams.get('sessionId') || ''
          sendJson(res, 200, resolveWorkspace(sessionId))
          return
        }
        if (req.method === 'GET' && path === '/') {
          sendJson(res, 200, { ok: true, build: 'v13' })
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
          if (body.attachFiles !== false) {
            const files = await collectPathContext(question, filesMaxChars, workspace.cwd)
            filesState = files.state
            filesPaths = files.paths
            filesChars = files.chars
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
          }
          const routes = {}
          for (const route of selected) routes[route.key] = route
          run.watchdog = setTimeout(() => {
            if (run.status === 'running') {
              run.status = 'error'
              run.error = '运行超时（30 分钟），已中止'
              try {
                run.controller.abort()
              } catch {
                /* best effort */
              }
            }
          }, RUN_TIMEOUT_MS)
          if (typeof run.watchdog.unref === 'function') run.watchdog.unref()
          runs.set(run.id, run)
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
          run.status = 'error'
          run.error = '已取消'
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
