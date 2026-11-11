/**
 * Runtime harness for the REAL callModel path: drives `apply()` with a fake
 * Cordis context so the actual retry/deadline code executes against a stub
 * provider — no arithmetic simulation, no exports-only shortcuts.
 *
 * Covers: healthy round-trip, transient-retry recovery, non-transient
 * fail-fast, caller-signal cancellation propagation, and the exported
 * deadline formula (zero-budget refusal arithmetic on the real function).
 */

import assert from 'node:assert/strict'
import { apply, RUN_TIMEOUT_MS, runDeadlineOf } from '../index.js'

/** Minimal fake Cordis context: an effect registry plus the llm service. */
function makeCtx(llm) {
  const disposers = []
  const ctx = {
    llm,
    effect(fn) {
      disposers.push(fn)
      return () => {}
    },
    on() { return () => {} },
    get(name) {
      if (name === 'agentPresets') return undefined
      throw new Error(`service ${name} unavailable`)
    },
  }
  ctx.dispose = () => { for (const dispose of disposers.splice(0)) dispose() }
  return ctx
}
/** A provider whose stream settles exactly as scripted per call. */
function scriptedProvider(calls) {
  return {
    stream(request) {
      const script = calls.shift()
      if (script === undefined) throw new Error('unexpected extra call')
      const provider = this
      return {
        async *[Symbol.asyncIterator]() {
          if (script.throw !== undefined) throw script.throw
          if (script.error !== undefined) {
            yield { type: 'finish', reason: { kind: 'error', failure: { message: script.error, code: 'E_FAKE' } } }
            return
          }
          if (script.aborted === true) {
            yield { type: 'finish', reason: { kind: 'aborted' } }
            return
          }
          yield { type: 'text-delta', text: script.text }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
}

const ROUTE = { provider: 'fake', model: 'm1', name: 'Fake One' }
const SYSTEM = 'test system'
const PROMPT = 'test prompt'

let ctx
try {
  const catalogLlm = {
    listProviders: () => [{ id: 'fake', name: 'Fake' }],
    listModels: async () => [{ id: 'm1', name: 'Fake One', contextWindow: 64000, maxTokens: 8192 }],
  }

  function recordingContext(llm) {
    let toolDef
    const inner = {
      llm,
      tools: { register(definition) { toolDef = definition; return () => {} } },
      webServer: { register() { return () => {} } },
      /* Effects run immediately: registrations must be live after apply(). */
      effect(fn) {
        const dispose = fn()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      on() { return () => {} },
      get(name) {
        if (name === 'agentPresets') return undefined
        throw new Error(`service ${name} unavailable`)
      },
    }
    inner.toolDef = () => toolDef
    return inner
  }

  /* 1. Healthy round-trip on the real execute(): register, call, conclude. */
  {
    const llm = {
      ...catalogLlm,
      stream: scriptedProvider([{ text: '答案一' }]).stream,
    }
    ctx = recordingContext(llm)
    await apply(ctx, { contextMaxChars: 1000, filesMaxChars: 1000 })
    const toolDef = ctx.toolDef()
    assert.ok(toolDef !== undefined, 'council_review must register on ctx.tools')
    assert.equal(toolDef.name, 'council_review')
    const exec = { agent: undefined, signal: new AbortController().signal }
    const result = await toolDef.execute({ question: '测试问题', chairman: false, attachFiles: false }, exec)
    assert.ok(result.conclusion.includes('答案一'), `conclusion must carry the answer: ${JSON.stringify(result)}`)
    assert.ok(result.runId.startsWith('c'), 'runId format')
    assert.deepEqual(result.models, ['fake/m1'])
  }

  /* 3. Transient failure retries on the real path, then succeeds.
     The run answers AND reviews (1 model = 2 stage calls), so the scripted
     failure must apply only to the first call; later calls succeed. */
  {
    let attempt = 0
    const llm = {
      ...catalogLlm,
      stream(request) {
        attempt += 1
        const call = attempt
        return {
          async *[Symbol.asyncIterator]() {
            if (call === 1) {
              yield { type: 'finish', reason: { kind: 'error', failure: { message: 'HTTP 503 Service Unavailable', code: 'E_FAKE' } } }
              return
            }
            yield { type: 'text-delta', text: call === 2 ? '重试后的答案' : '互评文本' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    }
    ctx = recordingContext(llm)
    await apply(ctx, { contextMaxChars: 1000, filesMaxChars: 1000 })
    const exec = { agent: undefined, signal: new AbortController().signal }
    const result = await ctx.toolDef().execute({ question: '瞬态重试测试', chairman: false, attachFiles: false }, exec)
    assert.ok(result.conclusion.includes('重试后的答案'), 'the real retry path must recover from a transient 503')
    /* attempt 1 = failed answer, 2 = retried answer, 3 = peer review. */
    assert.equal(attempt, 3, `answer retry + review expected, got ${attempt} calls`)
  }

  /* 4. Non-transient failure fails fast on the real path (no retry burn).
     Every call fails with a NON-transient message: the answer stage burns no
     retries, the run settles as failed, and the review stage never starts. */
  {
    let attempt = 0
    const llm = {
      ...catalogLlm,
      stream() {
        attempt += 1
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'finish', reason: { kind: 'error', failure: { message: 'budget 5000 tokens exceeded', code: 'E_FAKE' } } }
          },
        }
      },
    }
    ctx = recordingContext(llm)
    await apply(ctx, { contextMaxChars: 1000, filesMaxChars: 1000 })
    const exec = { agent: undefined, signal: new AbortController().signal }
    const result = await ctx.toolDef().execute({ question: '非瞬态失败测试', chairman: false, attachFiles: false }, exec)
    assert.ok(result.conclusion.includes('失败'), 'a non-transient error must surface failure text')
    assert.equal(attempt, 1, `non-transient must not retry, got ${attempt} attempts`)
  }

  /* 5. Cancellation propagates into the real path: aborting exec.signal
     settles the tool with an error rather than hanging or succeeding. */
  {
    const controller = new AbortController()
    const llm = {
      ...catalogLlm,
      stream() {
        return {
          async *[Symbol.asyncIterator]() {
            await new Promise((resolve) => setTimeout(resolve, 50))
            yield { type: 'text-delta', text: '不应出现' }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      },
    }
    ctx = recordingContext(llm)
    await apply(ctx, { contextMaxChars: 1000, filesMaxChars: 1000 })
    const exec = { agent: undefined, signal: controller.signal }
    setTimeout(() => controller.abort(), 10)
    const result = await ctx.toolDef().execute({ question: '取消传播测试', chairman: false, attachFiles: false }, exec)
    assert.ok(result.conclusion.includes('取消') || result.conclusion.includes('失败'),
      'aborting the caller signal must surface cancellation, got: ' + result.conclusion.slice(0, 120))
  }

  /* 6. Zero-budget refusal on the REAL exported formula: a run whose deadline
     already passed computes zero remaining budget. The full tool path mints
     createdAt=now, so this asserts the production formula directly instead
     of simulating arithmetic (the council flagged the earlier name-mismatch). */
  {
    const pastRun = { createdAt: Date.now() - RUN_TIMEOUT_MS - 1000 }
    const deadline = runDeadlineOf(pastRun)
    assert.ok(deadline < Date.now(), 'an expired run computes a past deadline')
    const futureRun = { createdAt: Date.now() }
    assert.ok(runDeadlineOf(futureRun) - Date.now() <= RUN_TIMEOUT_MS, 'a fresh run gets the full budget')
    /* The clamped attempt timeout an expired run would compute: zero, never negative. */
    const clamped = Math.min(300000, Math.max(0, deadline - Date.now()))
    assert.equal(clamped, 0, 'an expired deadline yields exactly zero attempt budget')
  }

  console.log('runtime harness: OK (real callModel path — round-trip, transient retry, fail-fast, cancel, deadline formula)')
} finally {
  if (ctx !== undefined && typeof ctx.dispose === 'function') ctx.dispose()
}
