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

export const inject = ['webServer', 'llm', 'agents']

/** Selected models per run. */
const MAX_MODELS = 6
/** Longest accepted question. */
const MAX_QUESTION = 20000
/** Per-answer characters forwarded to the review and chairman prompts. */
const MAX_ANSWER_CHARS = 6000
const ANSWER_MAX_TOKENS = 4096
const REVIEW_MAX_TOKENS = 8192
const CHAIRMAN_MAX_TOKENS = 8192
/** One model call, not one run. */
const CALL_TIMEOUT_MS = 180000
const RUN_TTL_MS = 30 * 60 * 1000
const MAX_RUNS = 16
const MODEL_CACHE_MS = 60000

/** Model ids that are not chat completions. */
const EXCLUDED_MODEL = /(embedding|rerank|\btts\b|\basr\b|whisper|audio|speech|image|video|seedream|wan-|ocr|moderation)/i

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

export function apply(ctx, config) {
  /** Character budget for the attached conversation context (profile config). */
  const contextMaxChars = config !== null && typeof config === 'object'
    && Number.isSafeInteger(config.contextMaxChars) && config.contextMaxChars >= 500
    ? Math.min(config.contextMaxChars, 50000)
    : 6000
  /** Live runs by id. */
  const runs = new Map()
  /** Cached catalog; agent/account changes refresh it after MODEL_CACHE_MS. */
  let catalogCache = { at: 0, value: undefined }

  /** Enumerate every configured provider and its text models. */
  async function catalog() {
    if (catalogCache.value !== undefined && Date.now() - catalogCache.at < MODEL_CACHE_MS) return catalogCache.value
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
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS)
    const combined = typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout
    let text = ''
    let finish
    const stream = ctx.llm.stream({
      provider: route.provider,
      model: route.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
      maxTokens,
      signal: combined,
    })
    for await (const chunk of stream) {
      if (chunk === null || typeof chunk !== 'object') continue
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
        text += chunk.text
        onDelta(text)
      } else if (chunk.type === 'block-end' && text === '' && chunk.block !== null && typeof chunk.block === 'object') {
        if (chunk.block.type === 'text' && typeof chunk.block.text === 'string') {
          text = chunk.block.text
          onDelta(text)
        }
      } else if (chunk.type === 'finish') {
        finish = chunk.reason
      }
    }
    /* Adapter and transport failures settle as a terminal finish chunk rather
       than a throw; surfacing them keeps one failed seat from looking empty. */
    if (finish !== null && typeof finish === 'object') {
      if (finish.kind === 'aborted') throw new Error('调用被中止或超时')
      if (finish.kind === 'error') {
        const failure = finish.failure
        const detail = failure !== null && typeof failure === 'object' ? `${failure.message} (${failure.code})` : '未知错误'
        throw new Error(detail)
      }
    }
    const trimmed = text.trim()
    if (trimmed === '') {
      throw new Error(finish !== null && typeof finish === 'object' && finish.kind === 'max-tokens'
        ? '输出预算耗尽且无正文（max-tokens）'
        : '模型返回了空内容')
    }
    return trimmed
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
      })),
      reviews: run.reviews.map((review) => ({
        key: review.key,
        reviewer: review.reviewer,
        text: review.text,
        done: review.done,
        error: review.error,
      })),
      chairman: {
        key: run.chairman.key,
        provider: run.chairman.provider,
        model: run.chairman.model,
        name: run.chairman.name,
        text: run.chairman.text,
        done: run.chairman.done,
        error: run.chairman.error,
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

  /** Execute the three stages for one run. */
  async function execute(run, routes) {
    const signal = run.controller.signal
    const questionBlock = run.contextBlock === '' ? run.question : `${run.contextBlock}\n\n---\n\n问题：${run.question}`
    try {
      /* Stage 1: independent answers. */
      run.stage = 'answers'
      await Promise.all(run.answers.map(async (answer) => {
        try {
          answer.text = await callModel(routes[answer.key], ANSWER_SYSTEM, questionBlock, ANSWER_MAX_TOKENS, signal, (text) => {
            answer.text = text
          })
        } catch (error) {
          answer.error = errorText(error)
        }
        answer.done = true
      }))
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
      await Promise.all(run.reviews.map(async (review) => {
        try {
          review.text = await callModel(routes[review.key], REVIEW_SYSTEM, reviewPrompt, REVIEW_MAX_TOKENS, signal, (text) => {
            review.text = text
          })
        } catch (error) {
          review.error = errorText(error)
        }
        review.done = true
      }))

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
      run.status = 'error'
      run.error = signal.aborted ? '已取消' : errorText(error)
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
          sendJson(res, 200, { providers: cat.providers, contextMaxChars })
          return
        }
        if (req.method === 'GET' && path === '/') {
          sendJson(res, 200, { ok: true, build: 'v5' })
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
          let chairman = selected[0]
          if (body.chairman !== null && typeof body.chairman === 'object') {
            const chosen = findRoute(cat, String(body.chairman.provider || ''), String(body.chairman.model || ''))
            if (chosen !== undefined && selected.some((route) => route.key === chosen.key)) chairman = chosen
          }
          const contextParts = []
          let contextState = 'off'
          if (body.context === true) {
            const context = conversationContext(sessionId, contextMaxChars)
            contextState = context.state
            if (context.text !== '') contextParts.push(context.text)
          }
          const run = {
            id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
            createdAt: Date.now(),
            sessionId,
            useChairman,
            contextState,
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
            })),
            reviews: selected.map((route) => ({
              key: route.key,
              reviewer: route.name,
              text: '',
              done: false,
              error: '',
            })),
            chairman: {
              key: chairman.key,
              provider: chairman.provider,
              model: chairman.model,
              name: chairman.name,
              text: '',
              done: false,
              error: '',
            },
          }
          const routes = {}
          for (const route of selected) routes[route.key] = route
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
          try {
            run.controller.abort()
          } catch {
            /* best effort */
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
    }
    runs.clear()
  }, 'council: runs')
}
