/**
 * Offline harness for the browser half: loads client.js the way the DSH web
 * shell does, stubs the client Cordis context, and checks that the plugin
 * registers its composer bridge, its sidebar tab type, its /council command,
 * renders the option toggles, and posts the finished result back to the chat
 * when "post back" is enabled.
 *
 * Run: node dev/verify-client.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

/* Discovery delay, read from the source so the harness cannot drift from it. */
const DISCOVERY_MS = Number((/const RUN_DISCOVERY_MS = (\d+)/.exec(source) || [])[1])
if (!Number.isSafeInteger(DISCOVERY_MS) || DISCOVERY_MS <= 0) {
  throw new Error('RUN_DISCOVERY_MS not found in client.js')
}
/* Every discovery-delay timer armed through window.setTimeout, plus its id so
   the harness can stop the (deliberately endless) re-arm chain at the end. */
let discoveryArms = 0
const discoveryTimerIds = []
/* GET /council/runs rows and the GET /council/run/run-live snapshot. */
let discoveryRows = null
let liveRunState = 'running'
/* Lets one case make POST /council/run return a chosen run id (the fake host
   only serves a live snapshot for `run-live`). */
let nextRunId = null
/* SSE liveness constants, read from the source like DISCOVERY_MS so a case can
   fire the watchdog/rebuild timers without waiting the real seconds. */
const STREAM_STALL_MS = Number((/const STREAM_STALL_MS = (\d+)/.exec(source) || [])[1])
if (!Number.isSafeInteger(STREAM_STALL_MS) || STREAM_STALL_MS <= 0) {
  throw new Error('STREAM_STALL_MS not found in client.js')
}
const STREAM_REBUILD_MAX = Number((/const STREAM_REBUILD_MAX = (\d+)/.exec(source) || [])[1])
const STREAM_REBUILD_BASE_MS = Number((/const STREAM_REBUILD_BASE_MS = (\d+)/.exec(source) || [])[1])
if (!Number.isSafeInteger(STREAM_REBUILD_MAX) || STREAM_REBUILD_MAX < 2) {
  throw new Error('STREAM_REBUILD_MAX not found in client.js')
}
if (!Number.isSafeInteger(STREAM_REBUILD_BASE_MS) || STREAM_REBUILD_BASE_MS <= 0) {
  throw new Error('STREAM_REBUILD_BASE_MS not found in client.js')
}

/* The client only arms its stream timers through window.setTimeout, so keeping
   the pending callbacks here lets a case fire one deterministically instead of
   sleeping STREAM_STALL_MS/… for real. */
let timerSeq = 0
const pendingTimers = new Map()

/** Newest timer still armed (optionally newer than a sequence watermark). */
function newestPendingTimer(sinceSeq = 0) {
  return [...pendingTimers.values()]
    .filter((timer) => timer.seq > sinceSeq)
    .sort((left, right) => right.seq - left.seq)[0]
}

/** Fire the newest pending timer by hand; the real one is cancelled first. */
function fireNewestPendingTimer(what, sinceSeq = 0) {
  const timer = newestPendingTimer(sinceSeq)
  if (timer === undefined) throw new Error(`no pending timer to fire for ${what}`)
  pendingTimers.delete(timer.id)
  clearTimeout(timer.id)
  timer.fn(...timer.rest)
  return timer
}

/* Count store publishes. The only `Object.assign({}, <state>, patch)` in
   client.js is store.publish, so tapping Object.assign inside the plugin's
   context lets a case assert "a beat must not publish" exactly: rendered HTML
   cannot reveal a publish that writes identical data. The store state is
   recognised by two of its own keys, which the other Object.assign in client.js
   (fetch options) never has. */
let publishCount = 0
const objectTap = new Proxy(Object, {
  get(target, key, receiver) {
    if (key !== 'assign') return Reflect.get(target, key, receiver)
    return function countingAssign(first, ...sources) {
      const state = sources[0]
      if (sources.length >= 2
        && state !== null && typeof state === 'object'
        && Object.prototype.hasOwnProperty.call(state, 'catalog')
        && Object.prototype.hasOwnProperty.call(state, 'feedbackMode')) {
        publishCount += 1
      }
      return Object.assign(first, ...sources)
    }
  },
})

const PACKAGE_NAME = 'dsh-model-council'
const TAB_ID = 'dsh-model-council/panel'
const LS_KEY = '@local/council:v1'

let loadArgument
const styleTags = []
const storage = new Map()
const fetchCalls = []
const windowListeners = new Map()

function addWindowListener(type, listener) {
  const set = windowListeners.get(type) || new Set()
  set.add(listener)
  windowListeners.set(type, set)
}

function removeWindowListener(type, listener) {
  const set = windowListeners.get(type)
  if (set !== undefined) set.delete(listener)
}

function dispatchWindowEvent(type, event) {
  const set = windowListeners.get(type)
  if (set === undefined) return
  for (const listener of [...set]) listener(event)
}

const resumeCalls = []
/* Fault injection for the resilience cases below. */
let failNextResumeWith409 = null
let failNextRunPolls = 0
/* Fault injection for the outbound-manifest preview (fail-closed cases). */
let failNextPreview = null

/* A full `POST /council/preview` 200 body, in the documented shape. */
const PREVIEW_RESPONSE = {
  question: '外发清单测试问题',
  attachFiles: true,
  workspace: { cwd: 'D:\\demo', source: 'session-header', workspaceId: 'ws1', name: 'demo' },
  filesState: 'ok',
  filesPaths: ['D:\\demo\\a.md', 'D:\\demo\\b.md'],
  filesChars: 1234,
  codeState: 'ok',
  codeFiles: 3,
  codeChars: 4567,
  codeDiscovered: 10,
  codeTruncated: 2,
  filesRedactions: [{ path: 'D:\\demo\\secret.env', patterns: ['openai-key'] }],
  totalChars: 1234,
  note: '抽样初审，不是全项目审查',
}

/* "Wake the chat agent" enabled before the bundle loads. */
storage.set(LS_KEY, JSON.stringify({ feedbackMode: 'wake', useContext: true, useChairman: true }))

const MODEL = { provider: 'p1', model: 'm1', name: 'Model One' }
const MODEL2 = { provider: 'p1', model: 'm2', name: 'Model Two' }
const MODEL3 = { provider: 'p2', model: 'm3', name: 'Model Three' }

function answersFor(overrides) {
  return [
    Object.assign({ key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '答案一', done: true, error: '', seat: { phase: 'done', elapsedMs: 4200, ttftMs: 900, fallback: false } }, overrides === undefined ? {} : overrides[0]),
    Object.assign({ key: 'p1|m2', provider: 'p1', model: 'm2', name: 'Model Two', text: '答案二', done: true, error: '', seat: { phase: 'done', elapsedMs: 3100, fallback: true } }, overrides === undefined ? {} : overrides[1]),
  ]
}

/** One done run per fetch; the browser half is driven by snapshots only. */
const SCENARIOS = [
  {
    id: 'run-1', status: 'done', stage: 'done', question: '测试问题', error: '',
    contextChars: 120, contextState: 'ok', useChairman: true,
    seatMode: 'subagent', subagentSeats: 1,
    filesState: 'ok', filesPaths: ['D:\\demo'], filesChars: 1200,
    codeState: 'ok', codeFiles: 4, codeChars: 3000,
    answers: answersFor(),
    reviews: [
      { key: 'p1|m1', reviewer: 'Model One', text: '互评一', done: true, error: '' },
      { key: 'p1|m2', reviewer: 'Model Two', text: '互评二', done: true, error: '' },
    ],
    chairman: { key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '主席结论正文', done: true, error: '' },
  },
  {
    id: 'run-2', status: 'done', stage: 'done', question: '测试问题', error: '',
    contextChars: 0, contextState: 'unavailable', useChairman: true,
    answers: answersFor([{}, { text: '', error: '模型调用失败' }]),
    reviews: [
      { key: 'p1|m1', reviewer: 'Model One', text: '互评一', done: true, error: '' },
      { key: 'p1|m2', reviewer: 'Model Two', text: '', done: true, error: '模型调用失败' },
    ],
    chairman: { key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '部分失败下的主席结论', done: true, error: '' },
  },
  {
    id: 'run-3', status: 'error', stage: 'answers', question: '测试问题', error: '所有模型作答失败',
    contextChars: 0, contextState: 'ok', useChairman: true,
    answers: answersFor([{ text: '', error: '模型调用失败' }, { text: '', error: '模型调用失败' }]),
    reviews: [],
    chairman: { key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '', done: false, error: '' },
  },
  {
    id: 'run-4', status: 'done', stage: 'done', question: '测试问题', error: '',
    contextChars: 0, contextState: 'ok', useChairman: false,
    answers: answersFor(),
    reviews: [
      { key: 'p1|m1', reviewer: 'Model One', text: '互评一', done: true, error: '' },
      { key: 'p1|m2', reviewer: 'Model Two', text: '互评二', done: true, error: '' },
    ],
    chairman: { key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '', done: false, error: '' },
  },
]

/* A run that stays live: GET /council/runs offers it, so adopting it fills the
   shared store with `running:true` and the toolview's live section has data. */
const LIVE_RUN = {
  id: 'run-live', status: 'running', stage: 'reviews', question: '实时进度问题',
  error: '', contextChars: 0, contextState: 'ok', useChairman: true,
  answers: [
    { key: 'p1|m1', provider: 'p1', model: 'p1/m1', name: 'Model One', text: '', done: true, error: '', seat: { phase: 'done', elapsedMs: 900 } },
    { key: 'p1|m2', provider: 'p1', model: 'p1/m2', name: 'Model Two', text: '', done: false, error: '', seat: { phase: 'running', elapsedMs: 1400 } },
  ],
  reviews: [],
  chairman: { key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '', done: false, error: '' },
}
const LIVE_RUN_DONE = Object.assign({}, LIVE_RUN, { status: 'done', stage: 'done' })

let postCount = 0

const fakeWindow = {
  __ModuleLoader__: { load(argument) { loadArgument = argument } },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null },
    setItem(key, value) { storage.set(key, String(value)) },
  },
  fetch: async (url, options) => {
    fetchCalls.push({
      url,
      method: options === undefined || options === null || options.method === undefined ? 'GET' : options.method,
      body: options !== undefined && options !== null && options.body !== undefined ? String(options.body) : '',
    })
    if (url === '/council/models') {
      return {
        ok: true,
        json: async () => ({
          contextMaxChars: 6000,
          filesMaxChars: 20000,
          providers: [
            { id: 'p1', name: 'Provider One', models: [{ id: 'm1', name: 'Model One' }, { id: 'm2', name: 'Model Two' }] },
            { id: 'p2', name: 'Provider Two', models: [{ id: 'm3', name: 'Model Three' }] },
          ],
        }),
      }
    }
    if (String(url).indexOf('/council/workspace') === 0) {
      return { ok: true, json: async () => ({ cwd: 'D:\\demo', source: 'session-header', workspaceId: 'ws1', name: 'demo' }) }
    }
    if (url === '/council/preview') {
      if (failNextPreview !== null) {
        const message = failNextPreview
        failNextPreview = null
        return { ok: false, status: 500, json: async () => ({ error: message }) }
      }
      return { ok: true, json: async () => (Object.assign({}, PREVIEW_RESPONSE)) }
    }
    if (String(url).indexOf('/council/runs') === 0) {
      return { ok: true, json: async () => ({ runs: discoveryRows === null ? [] : discoveryRows }) }
    }
    if (/\/council\/run\/run-live$/.test(String(url))) {
      return { ok: true, json: async () => (liveRunState === 'done' ? LIVE_RUN_DONE : LIVE_RUN) }
    }
    if (url === '/council/run') {
      postCount += 1
      const runId = nextRunId === null ? `run-${postCount}` : nextRunId
      nextRunId = null
      return { ok: true, json: async () => ({ runId }) }
    }
    const resumeMatch = /\/council\/run\/(run-\d+)\/resume$/.exec(String(url))
    if (resumeMatch !== null) {
      const payload = JSON.parse(options === undefined || options === null || options.body === undefined ? '{}' : options.body)
      if (failNextResumeWith409) {
        const kind = failNextResumeWith409
        failNextResumeWith409 = null
        /* Two distinct host conditions share status 409: only the explicit
           "already delivered" is success. */
        if (kind === 'already') return { ok: false, status: 409, json: async () => ({ error: '该结果已回投过', code: 'already-resumed' }) }
        return { ok: false, status: 409, json: async () => ({ error: '运行尚未完成', code: 'not-finished' }) }
      }
      resumeCalls.push({ runId: resumeMatch[1], mode: payload.mode })
      return { ok: true, json: async () => ({ ok: true, mode: payload.mode }) }
    }
    const cancelMatch = /\/council\/run\/(run-\d+)\/cancel$/.exec(String(url))
    if (cancelMatch !== null) return { ok: true, json: async () => ({ ok: true }) }
    const runMatch = /\/council\/run\/(run-\d+)$/.exec(String(url))
    if (runMatch !== null) {
      if (failNextRunPolls > 0) {
        failNextRunPolls -= 1
        throw new Error('fetch failed')
      }
      const index = Number(runMatch[1].slice('run-'.length)) - 1
      return { ok: true, json: async () => SCENARIOS[index] || SCENARIOS[0] }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  },
  setTimeout: (fn, ms, ...rest) => {
    timerSeq += 1
    const seq = timerSeq
    const id = setTimeout(() => {
      pendingTimers.delete(id)
      fn(...rest)
    }, ms)
    pendingTimers.set(id, { id, seq, ms, fn, rest })
    if (ms === DISCOVERY_MS) {
      discoveryArms += 1
      discoveryTimerIds.push(id)
    }
    return id
  },
  clearTimeout: (id) => {
    pendingTimers.delete(id)
    clearTimeout(id)
  },
  /* The leader election needs both; the discovery case below drives it. */
  setInterval,
  clearInterval,
  addEventListener: addWindowListener,
  removeEventListener: removeWindowListener,
  navigator: { clipboard: { writeText: async () => {} } },
  location: { origin: 'http://127.0.0.1:63033' },
}

const fakeDocument = {
  createElement(tag) {
    return { tagName: String(tag).toUpperCase(), dataset: {}, style: {}, textContent: '', remove() {} }
  },
  querySelector() { return null },
  head: { appendChild(node) { styleTags.push(node) } },
  /* `conversation.input.overlay` requires a fixed overlay to portal to the
     body; without a body the card would silently take the inline path and the
     portal branch would never be exercised. */
  body: { appendChild() {}, removeChild() {} },
  addEventListener() {},
  removeEventListener() {},
}

/* Fake react-dom: records portals so the overlay test can prove it took the
   documented body-portal path instead of rendering inline. */
const portalCalls = []
const ReactDom = {
  createPortal(node, container) {
    portalCalls.push(container)
    return node
  },
}

/* Minimal effect scheduler: enough to prove side effects actually run.
   The old no-op useEffect could not catch a bridge that only wrote state
   during render, nor a component whose effects never fire. */
const effectQueue = []
const pendingCleanups = []
let renderedComponentCount = 0

const React = {
  createElement(type, props, ...children) {
    return { type, props: props === null || props === undefined ? {} : props, children: children.flat(Infinity) }
  },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
  useEffect(fn) { if (typeof fn === 'function') effectQueue.push(fn) },
  useRef(value) {
    const slot = refIndex
    refIndex += 1
    if (refSlots[slot] === undefined) refSlots[slot] = { current: value }
    return refSlots[slot]
  },
}

/* One ref slot per hook call within the component currently rendering. Each
   harness render starts components from scratch, so slots reset per component. */
let refSlots = []
let refIndex = 0

/** Reset hook slots at the start of one component invocation. */
function freshRefs() {
  refSlots = []
  refIndex = 0
}

/** Run queued effects the way React does after commit. */
function flushEffects() {
  let guard = 0
  while (effectQueue.length > 0) {
    if (guard++ > 200) throw new Error('effect flush did not settle')
    const fn = effectQueue.shift()
    const cleanup = fn()
    if (typeof cleanup === 'function') pendingCleanups.push(cleanup)
  }
  return renderedComponentCount
}

const context = {
  window: fakeWindow,
  document: fakeDocument,
  console,
  Map, Set, WeakMap, Promise, Date, Math, JSON, String, Number, Object: objectTap, Array,
  ArrayBuffer, Uint8Array, URL, AbortController, AbortSignal,
  encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout,
  navigator: fakeWindow.navigator,
}

vm.createContext(context)
vm.runInContext(source, context, { filename: 'client.js' })

if (loadArgument === undefined) throw new Error('window.__ModuleLoader__.load was not called')
if (loadArgument.id !== PACKAGE_NAME) throw new Error(`unexpected module id: ${loadArgument.id}`)

const plugin = loadArgument.factory((specifier) => {
  if (specifier === 'react') return React
  if (specifier === 'react-dom') return ReactDom
  throw new Error(`unexpected require("${specifier}")`)
})
if (typeof plugin.apply !== 'function') throw new Error('factory did not return { apply }')

/* ---- Fake client Cordis context ---- */
const registrations = []
const contributions = []
const tabTypes = []
const openedTabs = []
const dictionaries = []
const cleanups = []

const tabRegistry = { register(definition) { tabTypes.push(definition); return () => {} } }
const interactionDefs = []
/* Host-backed configuration form stub for the plugin's own cordis entry.
   Tracks the requested entry id so a wrong id cannot pass silently. */
const configEntryRequests = []
const configWrites = []
const configListeners = new Set()
const configForm = {
  value: { toolEnabled: true, panelEnabled: true, defaultModels: [], defaultChairman: '' },
  revision: 7,
  getSnapshot() { return { revision: this.revision, value: Object.assign({}, this.value) } },
  subscribe(listener) {
    configListeners.add(listener)
    return () => configListeners.delete(listener)
  },
  async mutate(ops, revision) {
    configWrites.push({ ops, revision })
    for (const op of ops) {
      if (op.op === 'set') this.value[op.path[0]] = op.value
    }
    this.revision += 1
    for (const listener of Array.from(configListeners)) listener()
  },
}
const configFormsService = {
  get(entryId) {
    configEntryRequests.push(entryId)
    return entryId === 'council' ? configForm : null
  },
}

const services = {
  layout: { openRightbar() {} },
  sidebarRight: { openTab(kind) { openedTabs.push(kind) } },
  sidebarRightTabs: tabRegistry,
  uiConversation: {
    interactions: {
      register(definition) {
        interactionDefs.push(definition)
        return () => {}
      },
    },
  },
  configForms: configFormsService,
}

function fakeGet(name) { return services[name] }
function makeScope() {
  const scope = {
    get: fakeGet,
    effect(fn) {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => {}
    },
    commandUi: { register(contribution) { contributions.push(contribution); return () => {} } },
  }
  for (const [name, value] of Object.entries(services)) scope[name] = value
  return scope
}

const ctx = {
  get: fakeGet,
  effect(fn) {
    const cleanup = fn()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return () => {}
  },
  inject(names, callback) { callback(makeScope()); return () => {} },
  locale: {
    register(namespace, dicts) { dictionaries.push({ namespace, dicts }); return () => {} },
    bind(namespace) { return (key, params) => translate(namespace, key, params) },
  },
  slots: {
    inject(name, callback) { callback(); return () => {} },
    register(options, component) { registrations.push({ key: options.name, options, component }); return () => {} },
  },
}

plugin.apply(ctx)

const registered = new Set(registrations.map((entry) => entry.key))
for (const expected of ['conversation.composer.dock', 'sidebar.right.pane.tab', 'conversation.chat.text-interaction']) {
  if (!registered.has(expected)) throw new Error(`missing slot registration: ${expected}`)
}
if (registered.has('conversation.input.left')) throw new Error('persistent composer chip should be gone')
if (registered.has('shell.overlay')) throw new Error('overlay panel should be gone')

if (tabTypes.length !== 1 || tabTypes[0].id !== TAB_ID || tabTypes[0].kind !== 'council') {
  throw new Error(`unexpected sidebar tab type: ${JSON.stringify(tabTypes)}`)
}
if (contributions.length !== 1 || contributions[0].name !== 'council') throw new Error('missing /council command')
const command = contributions[0]
if (command.ui === undefined || command.ui.kind !== 'action' || typeof command.ui.run !== 'function') {
  throw new Error('command is not an action command')
}

function translate(namespace, key, params) {
  const found = dictionaries.find((entry) => entry.namespace === namespace)
  const dict = found === undefined ? {} : found.dicts.zh !== undefined ? found.dicts.zh : {}
  let text = dict[key] !== undefined ? dict[key] : key
  if (params !== undefined && params !== null) {
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node.type === 'function') {
    renderedComponentCount += 1
    freshRefs()
    return render(node.type(Object.assign({}, node.props, { children: node.children })))
  }
  const children = node.children !== undefined && node.children.length > 0 ? node.children : node.props.children
  return render(children)
}

/** Render a component tree and run its effects, as a real commit would. */
function renderAndFlush(node) {
  freshRefs()
  const html = render(node)
  flushEffects()
  return html
}

/** Materialize a React element tree with the fake React. */
function build(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return { text: String(node) }
  if (Array.isArray(node)) return node.map(build)
  if (typeof node.type === 'function') return build(node.type(Object.assign({}, node.props, { children: node.children })))
  return { type: node.type, props: node.props, children: (node.children || []).map(build) }
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node.text === 'string') return node.text
  return node.children === undefined || node.children === null ? '' : textOf(node.children)
}

function findRunButton(node) {
  return findButtonByText(node, '开始评审')
}

function findNode(node, predicate) {
  if (node === null || node === undefined) return undefined
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, predicate)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (predicate(node)) return node
  return findNode(node.children, predicate)
}

function findButtonByText(node, text) {
  return findNode(node, (item) => item.type === 'button' && textOf(item.children).includes(text))
}

function findRadioByLabel(node, text) {
  const label = findNode(node, (item) => item.type === 'label' && textOf(item.children).includes(text))
  if (label === undefined) return undefined
  return findNode(label.children, (item) => item.type === 'input')
}

const t = (key, params) => translate('council', key, params)
const bridge = registrations.find((entry) => entry.key === 'conversation.composer.dock').component
const tabBody = registrations.find((entry) => entry.key === 'sidebar.right.pane.tab').component

const inputActions = {
  captureInsertion: () => ({ start: 0, end: 0, draftRev: 1 }),
  insertText: () => true,
  setDraft: () => {},
  submit: () => {},
}

renderAndFlush(React.createElement(bridge, { t, sessionId: 'session-test', useInput: (selector) => selector({ draft: '/' }), inputActions }))

if (typeof command.icon !== 'function') throw new Error('command has no slash-menu icon')

/* A leftover "/" in the composer must not become the question or start a run. */
command.ui.run({ sessionId: 'session-test' })
await new Promise((resolve) => setTimeout(resolve, 400))
if (openedTabs.indexOf('council') === -1) throw new Error('command did not open the sidebar tab')
if (fetchCalls.some((call) => call.url === '/council/run' && call.method === 'POST')) {
  throw new Error('leftover "/" started a run')
}

/* A real question is carried into the tab but still does NOT auto-start. */
renderAndFlush(React.createElement(bridge, { t, sessionId: 'session-test', useInput: (selector) => selector({ draft: '/council 测试问题' }), inputActions }))
command.ui.run({ sessionId: 'session-test' })
await new Promise((resolve) => setTimeout(resolve, 500))
if (fetchCalls.some((call) => call.url === '/council/run' && call.method === 'POST')) {
  throw new Error('entering from the slash menu must not auto-start the review')
}

const tabHtml = render(tabBody === undefined ? null : React.createElement(tabBody, { t }))
for (const expected of ['多模型理事会', '开始评审', '主席模型', '接当前对话上下文', '自动附带问题里的本地路径', 'subagent 只读席位', '会话工作区：demo', '静默放进上下文', '直接唤醒主聊天', '不做（只留在右侧栏）']) {
  if (!tabHtml.includes(expected)) throw new Error(`tab body missing "${expected}": ${tabHtml.slice(0, 400)}`)
}
if (styleTags.length !== 1) throw new Error(`expected one injected style tag, got ${styleTags.length}`)

/* Pressing the run button starts the review; the result is then posted back. */
const tree = build(tabBody === undefined ? null : tabBody({ t }))
const runButton = findRunButton(tree)
if (runButton === undefined) throw new Error('run button not found in the tab')
runButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 1800))

if (!fetchCalls.some((call) => call.url === '/council/run' && call.method === 'POST')) {
  throw new Error('run button did not start a run')
}
if (resumeCalls.length !== 1 || resumeCalls[0].mode !== 'wake') {
  throw new Error(`finished run was not delivered to the chat: ${JSON.stringify(resumeCalls)}`)
}
const filesHtml = render(React.createElement(tabBody, { t }))
if (!filesHtml.includes('已附带 1 个路径')) throw new Error('path-attachment note is missing after the run')
if (!filesHtml.includes('席位：1 个只读 subagent + 1 个快速')) throw new Error('hybrid seat note is missing after the run')
if (!filesHtml.includes('已附带源码 4 个文件')) throw new Error('source-pack note is missing after the run')
if (!filesHtml.includes('首字 0.9s')) throw new Error('per-seat TTFT metric is missing after the run')

/* ---- Floating run status: conversation.input.overlay ---- */
const overlayReg = registrations.find((entry) => entry.key === 'conversation.input.overlay')
if (overlayReg === undefined) throw new Error('council did not register the floating run-status overlay')
if (overlayReg.options.id !== 'council-status') {
  throw new Error(`overlay must own its own cell id, got "${overlayReg.options.id}"`)
}
/* A finished run is still a run: the card must have something to show here. */
const overlayHtml = render(React.createElement(overlayReg.component, { t }))
if (!overlayHtml.includes('理事会运行')) {
  throw new Error(`overlay missing its title: ${overlayHtml.slice(0, 300)}`)
}
if (!overlayHtml.includes('Model One')) {
  throw new Error(`overlay did not render a seat row: ${overlayHtml.slice(0, 400)}`)
}
if (!overlayHtml.includes('测试问题')) {
  throw new Error(`overlay did not show the question: ${overlayHtml.slice(0, 400)}`)
}
if (!/\d+\/\d+/.test(overlayHtml)) {
  throw new Error(`overlay did not show seat progress: ${overlayHtml.slice(0, 400)}`)
}
/* The slot contract: a fixed overlay must portal to the document body,
   because the docked composer card contains an in-place fixed element. */
if (portalCalls.length === 0) throw new Error('overlay rendered inline instead of portaling')
for (const container of portalCalls) {
  if (container !== fakeDocument.body) throw new Error('overlay portaled somewhere other than the document body')
}

/* The card is display-only: rendering it must not deliver or cancel a run. */
const resumeBeforeOverlay = resumeCalls.length
const cancelBeforeOverlay = fetchCalls.filter((call) => /\/cancel$/.test(call.url)).length
render(React.createElement(overlayReg.component, { t }))
if (resumeCalls.length !== resumeBeforeOverlay) {
  throw new Error('rendering the overlay must not deliver a conclusion')
}
if (fetchCalls.filter((call) => /\/cancel$/.test(call.url)).length !== cancelBeforeOverlay) {
  throw new Error('rendering the overlay must not cancel the run')
}
/* ---- Conversation card: `tool.call.toolview`, keyed by the wire name ---- */
const toolviewRegs = registrations.filter((entry) => entry.options !== undefined && entry.options.name === 'tool.call.toolview')
if (toolviewRegs.length !== 1) {
  throw new Error(`expected exactly one tool.call.toolview registration, got ${toolviewRegs.length}`)
}
const toolviewReg = toolviewRegs[0]
/* The keyed slot dispatches on the exact wire tool name; a typo never renders. */
if (toolviewReg.options.key !== 'council_review') {
  throw new Error(`tool.call.toolview must be keyed exactly "council_review", got ${JSON.stringify(toolviewReg.options.key)}`)
}
if (toolviewReg.options.locale !== 'council') {
  throw new Error(`tool.call.toolview must declare its locale namespace, got ${JSON.stringify(toolviewReg.options.locale)}`)
}
if (typeof toolviewReg.component !== 'function') throw new Error('tool.call.toolview has no component')
const toolview = toolviewReg.component

/* preparing: incomplete arguments are never dumped as raw JSON. */
const preparingHtml = render(React.createElement(toolview, {
  t, phase: 'preparing', block: { args: {}, argsRaw: '' },
}))
if (!preparingHtml.includes('正在准备理事会评审')) {
  throw new Error(`preparing row is missing its copy: ${preparingHtml.slice(0, 300)}`)
}
if (preparingHtml.includes('{')) throw new Error('preparing row must not dump raw JSON arguments')

/* start: question, participants, chairman and outbound-attachment hint. */
const startArgs = {
  question: '重构认证模块',
  models: [{ provider: 'p1', model: 'm1' }, 'p2/m2'],
  chairman: true,
  attachFiles: true,
}
const startHtml = render(React.createElement(toolview, {
  t, phase: 'start', block: { args: startArgs, argsRaw: JSON.stringify(startArgs) },
}))
for (const expected of ['重构认证模块', 'p1/m1', 'p2/m2', '参与模型（2 个）', '主席汇总：开', '将附带工作区文件']) {
  if (!startHtml.includes(expected)) {
    throw new Error(`start row missing "${expected}": ${startHtml.slice(0, 400)}`)
  }
}

/* The real Tool layer hands a lazy PartialArguments reader, not a plain object:
   the fields must be read through its methods. */
const readerArgs = {
  text(key) { return key === 'question' ? '方法读取的问题' : undefined },
  value(key) {
    if (key === 'models') return [{ provider: 'p1', model: 'm9' }]
    if (key === 'chairman') return false
    return undefined
  },
}
const readerHtml = render(React.createElement(toolview, {
  t, phase: 'start', block: { args: readerArgs, argsRaw: '' },
}))
for (const expected of ['方法读取的问题', 'p1/m9', '主席汇总：关']) {
  if (!readerHtml.includes(expected)) {
    throw new Error(`start row must read the argument view through its methods, missing "${expected}": ${readerHtml.slice(0, 400)}`)
  }
}

/* Explicitly off options and the automatic model pick. */
const offStartHtml = render(React.createElement(toolview, {
  t, phase: 'start', block: { args: { question: '简短问题', models: [], chairman: false, attachFiles: false }, argsRaw: '' },
}))
for (const expected of ['简短问题', '由 Host 自动挑选', '主席汇总：关', '不附带文件']) {
  if (!offStartHtml.includes(expected)) {
    throw new Error(`start row missing "${expected}": ${offStartHtml.slice(0, 400)}`)
  }
}

/* A long question is truncated until the user expands it. */
const longQuestion = '长'.repeat(400)
const longHtml = render(React.createElement(toolview, {
  t, phase: 'start', block: { args: { question: longQuestion, models: [], chairman: true, attachFiles: true }, argsRaw: '' },
}))
if (!longHtml.includes('展开全文')) throw new Error('a long question must offer the expand toggle')
if (longHtml.includes(longQuestion)) throw new Error('a long question must be truncated before expansion')

/* result: the settled call renders the blocks output.render() produced. */
const resultHtml = render(React.createElement(toolview, {
  t,
  phase: 'result',
  block: {
    kind: 'tool-result', callId: 'call-1', isError: false,
    content: [{ type: 'text', text: '结论正文' }],
    call: { name: 'council_review', argsRaw: '{"question":"q"}' },
    args: { question: 'q' },
  },
}))
if (!resultHtml.includes('结论正文')) {
  throw new Error(`result row must render block.content text: ${resultHtml.slice(0, 400)}`)
}

/* result: an error settles with no conclusion text. */
const errorHtml = render(React.createElement(toolview, {
  t,
  phase: 'result',
  block: {
    kind: 'tool-result', callId: 'call-2', isError: true,
    content: [], call: null, args: {},
    error: { name: 'CouncilRunError', code: 'COUNCIL_FAILED' },
  },
}))
for (const expected of ['评审失败', 'CouncilRunError', 'COUNCIL_FAILED']) {
  if (!errorHtml.includes(expected)) {
    throw new Error(`error row missing "${expected}": ${errorHtml.slice(0, 400)}`)
  }
}

/* ---- Discovery: the timer always re-arms, but only a leader sends ---- *
 * The old `isPollLeader() !== true` source-text assertion demanded the early
 * return that IS the dead end (a tab that was not leader at mount never armed
 * a timer and never retried), so it is replaced by behaviour. The 0.2.16
 * defect was a follower turning itself into a poller: schedulePoll and
 * schedulePollRetry keep their refuse-to-arm source assertions, because every
 * poll callback does send HTTP. scheduleRunDiscovery differs — its callback
 * only sends while leader, so a follower's re-arm is a local 4s no-op that is
 * the precondition for starting discovery on takeover. The assertions here
 * are therefore: no request while not leader, and a re-arm that happens
 * anyway. */
{
  const channels = []
  class HarnessBroadcastChannel {
    constructor(name) {
      this.name = name
      this.onmessage = null
      channels.push(this)
    }
    postMessage() {}
    close() {}
  }
  /* The shipped election only runs where BroadcastChannel exists. */
  fakeWindow.BroadcastChannel = HarnessBroadcastChannel
  dispatchWindowEvent('pageshow', { type: 'pageshow' })
  const channel = channels[channels.length - 1]
  if (channel === undefined || typeof channel.onmessage !== 'function') {
    throw new Error('leader election did not open a BroadcastChannel')
  }
  /* A lexicographically smaller rival holds the lease: this tab is a follower. */
  const rivalClaim = { data: { leader: 'a-rival-tab', sessionId: 'session-test' } }
  channel.onmessage(rivalClaim)
  const rival = setInterval(() => channel.onmessage(rivalClaim), 600)

  const runsRequests = () => fetchCalls.filter((call) => String(call.url).indexOf('/council/runs') === 0).length
  const armsBefore = discoveryArms
  const requestsBefore = runsRequests()
  /* Mounting the overlay arms discovery. Its one-shot adopt is not the
     discovery loop, so the request baseline is taken after that settles. */
  renderAndFlush(React.createElement(overlayReg.component, { t }))
  await new Promise((resolve) => setTimeout(resolve, 250))
  const requestsAfterMount = runsRequests()
  if (requestsAfterMount <= requestsBefore) {
    throw new Error('the discovery baseline is empty: /council/runs was never probed')
  }
  /* One full discovery interval as a follower. */
  await new Promise((resolve) => setTimeout(resolve, DISCOVERY_MS + 600))
  const rearmCount = discoveryArms - armsBefore
  if (rearmCount < 2) {
    throw new Error(`a non-leader must still arm and re-arm discovery (armed ${rearmCount} time(s) in ${DISCOVERY_MS}ms)`)
  }
  if (runsRequests() !== requestsAfterMount) {
    throw new Error('a non-leader must not run /council/runs discovery (follower sent a request)')
  }
  clearInterval(rival)
  /* Let the election hand the lease back so every later poll path is party to
     the same leader gate it was before this case. */
  await new Promise((resolve) => setTimeout(resolve, 3200))
}

/* ---- Live progress: read from the shared store, never from the tool props ---- */
{
  /* feedbackMode off so the synthetic run cannot be delivered. */
  const offRadio = findRadioByLabel(build(tabBody({ t })), '不做（只留在右侧栏）')
  if (offRadio === undefined) throw new Error('feedback-off option is missing before the live-run check')
  offRadio.props.onChange()
  const resumeBeforeLive = resumeCalls.length
  discoveryRows = [LIVE_RUN]
  liveRunState = 'running'
  /* Adopting the Host run fills store.run/running through the shipped path. */
  renderAndFlush(React.createElement(overlayReg.component, { t }))
  await new Promise((resolve) => setTimeout(resolve, 80))
  const liveArgs = { question: '实时进度问题', models: [{ provider: 'p1', model: 'm1' }], chairman: true, attachFiles: false }
  const liveHtml = render(React.createElement(toolview, {
    t, phase: 'start', block: { args: liveArgs, argsRaw: JSON.stringify(liveArgs) },
  }))
  for (const expected of ['实时进度：交叉互评', 'Model One', 'Model Two', '1/2', '运行中']) {
    if (!liveHtml.includes(expected)) {
      throw new Error(`live start row missing "${expected}": ${liveHtml.slice(0, 500)}`)
    }
  }
  /* Settle the synthetic run, then stop offering it. */
  liveRunState = 'done'
  discoveryRows = null
  await new Promise((resolve) => setTimeout(resolve, 700))
  if (resumeCalls.length !== resumeBeforeLive) {
    throw new Error('the live-progress check must not deliver a conclusion')
  }
  /* Restore the delivery mode this case borrowed (the storage default is
     "wake", and nothing before here changed it). */
  const wakeRadio = findRadioByLabel(build(tabBody({ t })), '直接唤醒主聊天')
  if (wakeRadio === undefined) throw new Error('feedback option vanished after the live-run check')
  wakeRadio.props.onChange()
}

/* ---- Settings page: settings.section over the Host configuration form ---- */
const sectionReg = registrations.find((entry) => entry.key === 'settings.section')
if (sectionReg === undefined) throw new Error('council did not register a settings section')
if (sectionReg.options.id !== 'council') {
  throw new Error(`settings section must use the cordis entry id, got "${sectionReg.options.id}"`)
}
if (!configEntryRequests.includes('council')) {
  throw new Error(`settings form bound the wrong entry: ${JSON.stringify(configEntryRequests)}`)
}
configForm.value.defaultModels = ['providerA/modelC']
const settingsTree = build(React.createElement(sectionReg.component, { t }))
const settingsHtml = render(React.createElement(sectionReg.component, { t }))
for (const expected of ['默认模型', '默认主席', '启用内置工具 council_review', '启用 /council 面板入口']) {
  if (!settingsHtml.includes(expected)) throw new Error(`settings page missing "${expected}": ${settingsHtml.slice(0, 400)}`)
}
const saveButton = findButtonByText(settingsTree, '保存')
if (saveButton === undefined) throw new Error('settings page has no save button')
saveButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 60))
if (configWrites.length === 0) throw new Error('save did not write the configuration form')
const write = configWrites[configWrites.length - 1]
const written = new Map(write.ops.map((op) => [op.path[0], op.value]))
/* The tool entry and the panel entry are two distinct surfaces: one switch must
   not silently stand in for the other, so both are written explicitly. */
for (const field of ['toolEnabled', 'panelEnabled', 'defaultModels', 'defaultChairman']) {
  if (!written.has(field)) {
    throw new Error(`save must write "${field}" atomically, got ${JSON.stringify(write.ops)}`)
  }
}
if (written.get('toolEnabled') !== true || written.get('panelEnabled') !== true) {
  throw new Error(`save wrote the wrong switch values: ${JSON.stringify(written.get('toolEnabled'))}/${JSON.stringify(written.get('panelEnabled'))}`)
}
if (JSON.stringify(written.get('defaultModels')) !== JSON.stringify(['providerA/modelC'])) {
  throw new Error(`save wrote the wrong default models: ${JSON.stringify(written.get('defaultModels'))}`)
}
/* A stored route the catalog no longer serves must be surfaced, not dropped. */
if (!/7|revision/.test(String(write.revision))) {
  throw new Error('save must be fenced by the revision read before editing')
}
configForm.value.defaultModels = ['retired/gone-model']
const missingHtml = render(React.createElement(sectionReg.component, { t }))
if (!missingHtml.includes('retired/gone-model')) {
  throw new Error(`a saved but unavailable model must be reported: ${missingHtml.slice(0, 400)}`)
}
configForm.value.defaultModels = []

/* The two switches must be independent: the panel entry is not the tool entry,
   so one being off must not flip the other. */
configForm.value.toolEnabled = false
configForm.value.panelEnabled = true
function collectCheckboxes(node, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const item of node) collectCheckboxes(item, out)
    return out
  }
  if (node.type === 'input' && node.props !== undefined && node.props.type === 'checkbox') out.push(node)
  collectCheckboxes(node.children, out)
  return out
}
const splitTree = build(React.createElement(sectionReg.component, { t }))
const boxes = collectCheckboxes(splitTree)
/* Model cells are checkboxes too; the two entry switches render first. */
const switchBoxes = boxes.slice(0, 2)
if (switchBoxes.length !== 2) {
  throw new Error(`settings page must render exactly two entry switches, got ${switchBoxes.length}`)
}
const checkedStates = switchBoxes.map((box) => box.props.checked)
if (checkedStates[0] !== false || checkedStates[1] !== true) {
  throw new Error(`the two entry switches must be independent, got ${JSON.stringify(checkedStates)}`)
}
configForm.value.toolEnabled = true
configForm.value.panelEnabled = true

/* Selection context menu: right-click a passage offers the council review item. */
if (typeof command.icon !== 'function') throw new Error('command has no slash-menu icon')
if (interactionDefs.length !== 1) throw new Error(`expected one text interaction, got ${interactionDefs.length}`)
const gesture = { opened: 0, prevented: 0 }
interactionDefs[0].onInteraction({
  trigger: 'contextmenu',
  hasSelection: true,
  readText: () => '待评审文本',
  preventDefault: () => { gesture.prevented += 1 },
  open: () => { gesture.opened += 1 },
  sessionId: 'session-test',
})
if (gesture.opened !== 1) throw new Error('contextmenu interaction did not open a surface')
if (gesture.prevented !== 1) throw new Error('contextmenu interaction did not suppress the native menu')

const surface = registrations.find((entry) => entry.key === 'conversation.chat.text-interaction').component
const menuTree = build(surface({
  t,
  trigger: 'contextmenu',
  readText: () => '待评审文本',
  dismiss: () => {},
  clearSelection: () => {},
}))
const menuItem = findButtonByText(menuTree, '交给理事会评审')
if (menuItem === undefined) throw new Error('selection menu item is missing')
menuItem.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 400))
const tabTree = build(tabBody({ t }))
const textarea = findNode(tabTree, (node) => node.type === 'textarea')
if (textarea === undefined || !String(textarea.props.value).includes('待评审文本')) {
  throw new Error('selected passage was not carried into the question')
}

/* quick-quote's selection pill dispatches this event for its council button. */
const bridgeListeners = windowListeners.get('dsh-council:review')
if (bridgeListeners === undefined || bridgeListeners.size !== 1) {
  throw new Error(`council bridge listener missing (${bridgeListeners === undefined ? 0 : bridgeListeners.size})`)
}
dispatchWindowEvent('dsh-council:review', {
  type: 'dsh-council:review',
  detail: { apiVersion: 1, text: '来自浮动条的文本', sessionId: 'session-test' },
})
await new Promise((resolve) => setTimeout(resolve, 400))
const bridgeTree = build(tabBody({ t }))
const bridgeTextarea = findNode(bridgeTree, (node) => node.type === 'textarea')
if (bridgeTextarea === undefined || !String(bridgeTextarea.props.value).includes('来自浮动条的文本')) {
  throw new Error('quick-quote bridge text did not reach the question')
}

/* Global bridge contract: quick-quote feature-detects it before sending. */
const globalApi = fakeWindow.__dshCouncil
if (globalApi === undefined || globalApi.apiVersion !== 1 || typeof globalApi.review !== 'function') {
  throw new Error('window.__dshCouncil contract is missing')
}
if (globalApi.review({ apiVersion: 1, text: '全局接口文本', sessionId: 'session-test' }) !== true) {
  throw new Error('global bridge rejected a valid review')
}
await new Promise((resolve) => setTimeout(resolve, 400))
const globalTree = build(tabBody({ t }))
const globalTextarea = findNode(globalTree, (node) => node.type === 'textarea')
if (globalTextarea === undefined || !String(globalTextarea.props.value).includes('全局接口文本')) {
  throw new Error('global bridge text did not reach the question')
}

/* Reentrancy: the same (now stale) button pressed twice starts one run. */
const partialButton = findRunButton(build(tabBody({ t })))
if (partialButton === undefined) throw new Error('run button missing before reentrancy check')
const beforePartial = postCount
partialButton.props.onClick()
partialButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 1500))
if (postCount - beforePartial !== 1) throw new Error(`double press started ${postCount - beforePartial} runs`)
const partialHtml = render(React.createElement(tabBody, { t }))
for (const expected of ['1/2 个模型失败', '上下文读取失败']) {
  if (!partialHtml.includes(expected)) throw new Error(`partial/degraded run did not report "${expected}"`)
}
if (resumeCalls.length !== 2 || resumeCalls[1].mode !== 'wake') {
  throw new Error(`partial run delivery was wrong: ${JSON.stringify(resumeCalls)}`)
}

/* All seats failing surfaces the terminal error state, with no delivery. */
const beforeFail = postCount
const failButton = findRunButton(build(tabBody({ t })))
if (failButton === undefined) throw new Error('run button missing after the partial run')
failButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 1500))
if (postCount - beforeFail !== 1) throw new Error('all-fail run did not start')
const failHtml = render(React.createElement(tabBody, { t }))
if (!failHtml.includes('所有模型作答失败')) throw new Error('all-fail error state is missing')
if (resumeCalls.length !== 2) throw new Error('a failed run must not be delivered to the chat')

/* Silent delivery: place the conclusion in context without waking the main Agent. */
const silentRadio = findRadioByLabel(build(tabBody({ t })), '静默放进上下文')
if (silentRadio === undefined) throw new Error('silent feedback option is missing')
silentRadio.props.onChange()
const silentButton = findRunButton(build(tabBody({ t })))
if (silentButton === undefined) throw new Error('run button missing for the silent run')
silentButton.props.onClick()
await new Promise((resolve) => setTimeout(resolve, 1800))
const silentResume = resumeCalls[resumeCalls.length - 1]
if (silentResume === undefined || silentResume.mode !== 'silent') {
  throw new Error(`silent delivery missing: ${JSON.stringify(resumeCalls)}`)
}
const silentHtml = render(React.createElement(tabBody, { t }))
if (!silentHtml.includes('已静默放进上下文')) throw new Error('silent delivery note is missing')

/* --- Resilience: a 409 with code=already-resumed means delivered, not failure --- */
{
  const before = resumeCalls.length
  failNextResumeWith409 = 'already'
  const button = findRunButton(build(tabBody({ t })))
  if (button === undefined) throw new Error('run button missing for the 409 case')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (resumeCalls.length !== before) throw new Error('the 409 attempt should not be recorded as delivered')
  const html409 = render(React.createElement(tabBody, { t }))
  if (html409.includes('该结果已回投过')) {
    throw new Error('a 409 (already delivered) must not surface as a red error')
  }
}

/* --- Narrowing: any OTHER 409 must surface, not be swallowed --- */
{
  failNextResumeWith409 = 'other'
  const button = findRunButton(build(tabBody({ t })))
  if (button === undefined) throw new Error('run button missing for the other-409 case')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  const htmlOther = render(React.createElement(tabBody, { t }))
  if (!htmlOther.includes('运行尚未完成')) {
    throw new Error('a non-"already delivered" 409 must be shown to the user')
  }
}

/* --- Resilience: one failed poll must not discard a still-running run --- */
{
  failNextRunPolls = 1
  const button = findRunButton(build(tabBody({ t })))
  if (button === undefined) throw new Error('run button missing for the poll-blip case')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  const htmlBlip = render(React.createElement(tabBody, { t }))
  if (htmlBlip.includes('fetch failed')) {
    throw new Error('a single poll failure must not be shown as a run error')
  }
  if (!htmlBlip.includes('开始评审') && !htmlBlip.includes('停止')) {
    throw new Error('the run button vanished after one failed poll')
  }
}

/* --- Regression: the delivery token must not be claimed before the POST.
       A follower used to write feedbackRunId, so when it took over the leader
       role the guard above short-circuited and nobody delivered. --- */
{
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const resume = /async function resumeRun\(runId, mode\) \{([\s\S]*?)\n    \}/.exec(source)
  if (resume === null) throw new Error('resumeRun not found')
  const body = resume[1]
  const tokenWrite = body.indexOf('feedbackRunId: token')
  const leaderGate = body.indexOf('isPollLeader() !== true')
  if (tokenWrite === -1) throw new Error('resumeRun no longer records the delivery token')
  if (leaderGate === -1) throw new Error('resumeRun lost its leader gate')
  if (tokenWrite < leaderGate) {
    throw new Error('resumeRun must not record the token before the leader gate')
  }
  if (!body.includes('already-resumed')) throw new Error('resumeRun must recognise already-resumed')
  if (!body.includes('resumeInFlight')) throw new Error('resumeRun needs an in-tab in-flight guard')
}

/* --- Regression: followers must not turn themselves into pollers, and a tab
       that gave up polling must be able to reattach. --- */
{
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const followerBranch = /if \(isPollLeader\(\) !== true\) \{\s*\n\s*\/\*[\s\S]*?\*\/\s*\n\s*return\s*\n\s*\}/.exec(source)
  if (followerBranch === null) throw new Error('pollRun follower branch must return without re-arming')
  if (/schedulePoll/.test(followerBranch[0])) throw new Error('follower branch must not schedule a poll')
  const adopt = /async function adoptRunningRun\(\) \{([\s\S]*?)\n    \}/.exec(source)
  if (adopt === null) throw new Error('adoptRunningRun not found')
  if (!/store\.state\.running === true/.test(adopt[1])) {
    throw new Error('adoptRunningRun must not skip a tab that is not live')
  }
  const openAt = source.indexOf('const sessionId = request')
  if (openAt === -1) throw new Error('openCouncilTab session handling not found')
  const openWindow = source.slice(openAt, openAt + 600)
  if (!/switchSession\(sessionId\)/.test(openWindow)) {
    throw new Error('openCouncilTab must route the session switch through switchSession')
  }
  /* Every path that can convert a stream failure into polling must be gated:
     the EventSource-constructor catch was the last ungated one. */
  const watchAt = source.indexOf('function watchRun(runId)')
  if (watchAt === -1) throw new Error('watchRun not found')
  const constructorAt = source.indexOf('new window.EventSource(', watchAt)
  if (constructorAt === -1) throw new Error('EventSource construction not found in watchRun')
  const constructorBlock = source.slice(constructorAt, constructorAt + 500)
  if (!/isPollLeader\(\) === true/.test(constructorBlock)) {
    throw new Error('the EventSource constructor catch must be leader-gated')
  }
  /* pagehide must NOT cancel: it also fires on refresh, which would kill a
     running council and make the documented reattach path impossible. */
  const pagehideAt = source.indexOf("addEventListener('pagehide'")
  if (pagehideAt === -1) throw new Error('pagehide handler not found')
  const pagehideBlock = source.slice(pagehideAt, pagehideAt + 500)
  if (/sendBeacon/.test(pagehideBlock) || /\/cancel/.test(pagehideBlock)) {
    throw new Error('pagehide must not cancel the run (it also fires on refresh)')
  }
  if (!/stopEventStream\(\)/.test(pagehideBlock)) {
    throw new Error('pagehide should release the tab channels')
  }
  /* Both schedulers refuse to arm for a follower, so the "every poll path is
     leader-gated" invariant holds locally instead of by call-site inspection. */
  for (const name of ['schedulePoll', 'schedulePollRetry']) {
    const at = source.indexOf('function ' + name + '(')
    if (at === -1) throw new Error(name + ' not found')
    const head = source.slice(at, at + 400)
    if (!/isPollLeader\(\) !== true/.test(head)) {
      throw new Error(name + ' must refuse to arm for a non-leader')
    }
  }
  /* pageshow must rebuild what pagehide released, or a bfcache restore leaves
     the panel frozen (no poller, no stream, no leader role). */
  const pageshowAt = source.indexOf("addEventListener('pageshow'")
  if (pageshowAt === -1) throw new Error('pageshow recovery handler not found')
  const pageshowBlock = source.slice(pageshowAt, pageshowAt + 600)
  if (!/initLeaderElection\(/.test(pageshowBlock)) {
    throw new Error('pageshow must re-establish the leader role')
  }
  if (!/watchRun\(|adoptRunningRun\(/.test(pageshowBlock)) {
    throw new Error('pageshow must reattach the live run')
  }
  /* Delivery is not a model call: silent injects context, wake starts a chat
     turn. Counting it made the cost hint overstate by one. */
  const costAt = source.indexOf('const estimatedCalls =')
  if (costAt === -1) throw new Error('estimatedCalls not found')
  const costLine = source.slice(costAt, source.indexOf('\n', costAt))
  if (/feedbackMode/.test(costLine)) {
    throw new Error('estimatedCalls must not count delivery as a model call')
  }
  /* The store subscription must skip publishes that leave the selection as-is. */
  if (!/function sameSelection\(/.test(source)) throw new Error('sameSelection helper missing')
  const storeAt = source.indexOf('function useStore(selector)')
  if (storeAt === -1) throw new Error('useStore not found')
  const storeBlock = source.slice(storeAt, storeAt + 700)
  if (!/sameSelection\(next, box\.current\.selected\)/.test(storeBlock)) {
    throw new Error('useStore must compare before forcing a re-render')
  }
}

/* ---- Outbound manifest: POST /council/preview + explicit confirmation gate ---- */
function setQuestion(value) {
  const tree = build(tabBody({ t }))
  const box = findNode(tree, (node) => node.type === 'textarea')
  if (box === undefined) throw new Error('question textarea is missing')
  box.props.onChange({ target: { value } })
}

function previewCallCount() {
  return fetchCalls.filter((call) => call.url === '/council/preview').length
}

function lastRunBody() {
  const calls = fetchCalls.filter((call) => call.url === '/council/run' && call.method === 'POST')
  if (calls.length === 0) throw new Error('no POST /council/run was recorded')
  return JSON.parse(calls[calls.length - 1].body)
}

function previewButtonNode(tree) {
  return findNode(tree === undefined ? build(tabBody({ t })) : tree,
    (node) => node.type === 'button' && textOf(node.children).includes('预览附件'))
}

function runButtonNode() {
  return findRunButton(build(tabBody({ t })))
}

function clickRun() {
  const button = runButtonNode()
  if (button === undefined) throw new Error('run button is missing')
  button.props.onClick()
}

function checkboxByLabel(text) {
  const label = findNode(build(tabBody({ t })), (node) => node.type === 'label' && textOf(node.children).includes(text))
  if (label === undefined) return undefined
  return findNode(label.children, (node) => node.type === 'input')
}

/* ---- SSE liveness: host heartbeat + a follower that must never go dark ---- *
 * Host protocol: `event: beat` / `data: {"seq":N}` every ~3s while the stream
 * lives. The client treats it as liveness only. When a stream stalls or
 * errors, the leader still falls back to polling; a follower owns no poller,
 * so it must re-open the read-only stream (bounded + backed off) and never
 * send a poll request of its own. */
{
  const sseInstances = []
  const rivalIntervals = []
  class FakeEventSource {
    constructor(url) {
      this.url = String(url)
      this.readyState = 1
      this.onmessage = null
      this.onerror = null
      this.closed = false
      this.handlers = new Map()
      sseInstances.push(this)
    }
    addEventListener(type, listener) {
      const set = this.handlers.get(type) || new Set()
      set.add(listener)
      this.handlers.set(type, set)
    }
    removeEventListener(type, listener) {
      const set = this.handlers.get(type)
      if (set !== undefined) set.delete(listener)
    }
    close() {
      this.closed = true
      this.readyState = 2
    }
    /* The browser never routes a NAMED event to onmessage. Keeping that split
       here is what makes a beat handler written against onmessage fail loudly. */
    emit(type, payload) {
      const event = { type, data: typeof payload === 'string' ? payload : JSON.stringify(payload) }
      if (type === 'message' && typeof this.onmessage === 'function') this.onmessage(event)
      const set = this.handlers.get(type)
      if (set !== undefined) for (const listener of [...set]) listener(event)
    }
    fail() {
      if (typeof this.onerror === 'function') this.onerror({ type: 'error' })
    }
  }
  fakeWindow.EventSource = FakeEventSource

  const latestInstance = () => sseInstances[sseInstances.length - 1]
  /* GET /council/run/<id> only: POST /council/run and the cancel/resume verbs
     are different URLs and must not be counted as polls. */
  const pollRequests = () => fetchCalls.filter((call) => /^\/council\/run\/[^/]+$/.test(String(call.url))).length
  /** The newest armed timer has to be a fresh stall watchdog. */
  function requireWatchdog(what, sinceSeq) {
    const timer = newestPendingTimer(sinceSeq)
    if (timer === undefined || timer.ms !== STREAM_STALL_MS) {
      throw new Error(`${what}: expected a fresh ${STREAM_STALL_MS}ms watchdog, got ${timer === undefined ? 'no timer' : timer.ms + 'ms'}`)
    }
    return timer
  }
  /** Start one run and return the stream watchRun opened for it. */
  async function startWatchedRun() {
    setQuestion('SSE 心跳测试问题')
    const postsBefore = postCount
    const streamsBefore = sseInstances.length
    clickRun()
    await new Promise((resolve) => setTimeout(resolve, 60))
    if (postCount !== postsBefore + 1) throw new Error('the SSE case could not start a run')
    if (sseInstances.length !== streamsBefore + 1) {
      throw new Error('watchRun did not open an EventSource stream for a fresh run')
    }
    return latestInstance()
  }
  /** End the run through the shipped done-frame path, so no timer outlives it. */
  function finishStream(instance, what) {
    instance.emit('message', Object.assign({}, LIVE_RUN, { status: 'done', stage: 'done' }))
    if (instance.closed !== true) throw new Error(`${what}: a done frame must close the stream`)
  }

  /* Delivery off: these synthetic runs must not post back to the chat. */
  const offRadio = findRadioByLabel(build(tabBody({ t })), '不做（只留在右侧栏）')
  if (offRadio === undefined) throw new Error('feedback-off option is missing before the SSE cases')
  offRadio.props.onChange()

  try {
    /* A. A beat re-arms the watchdog and publishes nothing. */
    {
      const stream = await startWatchedRun()
      const beatListeners = stream.handlers.get('beat')
      if (beatListeners === undefined || beatListeners.size === 0) {
        throw new Error('watchRun must listen for the named "beat" event: EventSource never routes it to onmessage')
      }
      const watchdogBefore = requireWatchdog('fresh run', 0)
      const publishesBefore = publishCount
      const pollsBefore = pollRequests()
      stream.emit('beat', { seq: 1 })
      if (publishCount !== publishesBefore) {
        throw new Error(`a beat is liveness only and must not publish (store.publish +${publishCount - publishesBefore})`)
      }
      if (stream.closed === true) throw new Error('a beat must not close the stream')
      if (pendingTimers.has(watchdogBefore.id)) {
        throw new Error('a beat must re-arm the watchdog instead of leaving the previous timer armed')
      }
      requireWatchdog('after a beat', watchdogBefore.seq)
      if (pollRequests() !== pollsBefore) throw new Error('a beat must not trigger a poll request')
      finishStream(stream, 'beat case')
    }

    /* Follower cases: a lexicographically smaller rival tab holds the lease. */
    const channels = []
    class HarnessBroadcastChannel {
      constructor(name) {
        this.name = name
        this.onmessage = null
        channels.push(this)
      }
      postMessage() {}
      close() {}
    }
    fakeWindow.BroadcastChannel = HarnessBroadcastChannel
    dispatchWindowEvent('pageshow', { type: 'pageshow' })
    await new Promise((resolve) => setTimeout(resolve, 30))
    const channel = channels[channels.length - 1]
    if (channel === undefined || typeof channel.onmessage !== 'function') {
      throw new Error('the SSE cases could not open a leader-election channel')
    }
    const rivalClaim = { data: { leader: 'a-rival-tab', sessionId: 'session-test' } }
    channel.onmessage(rivalClaim)
    rivalIntervals.push(setInterval(() => channel.onmessage(rivalClaim), 400))

    /* B. A follower whose watchdog fires re-opens the stream — it causes no
          polling and does not stay dark. */
    {
      const stream = await startWatchedRun()
      const pollsBefore = pollRequests()
      const streamsBefore = sseInstances.length
      const fired = fireNewestPendingTimer('follower stream stall')
      if (fired.ms !== STREAM_STALL_MS) {
        throw new Error(`the newest timer should be the ${STREAM_STALL_MS}ms watchdog, got ${fired.ms}ms`)
      }
      if (stream.closed !== true) throw new Error('a stalled stream must be closed before it is rebuilt')
      if (sseInstances.length !== streamsBefore) {
        throw new Error('a follower must wait for its backoff before re-opening the stream')
      }
      const rebuild = newestPendingTimer()
      if (rebuild === undefined || rebuild.ms !== STREAM_REBUILD_BASE_MS) {
        throw new Error(`a follower must schedule a ${STREAM_REBUILD_BASE_MS}ms stream rebuild (newest pending timer: ${rebuild === undefined ? 'none' : rebuild.ms + 'ms'})`)
      }
      if (pollRequests() !== pollsBefore) throw new Error('a follower must never poll: the stall path sent a request')
      fireNewestPendingTimer('follower stream rebuild')
      if (sseInstances.length !== streamsBefore + 1) {
        throw new Error('a follower must re-open the stream after the backoff')
      }
      const rebuilt = latestInstance()
      if (rebuilt.closed === true) throw new Error('the rebuilt follower stream closed immediately')
      requireWatchdog('rebuilt follower stream', 0)
      if (pollRequests() !== pollsBefore) throw new Error('a follower must never poll: the rebuild path sent a request')
      finishStream(rebuilt, 'follower stall case')
    }

    /* C. The same for an SSE transport error (onerror). */
    {
      const stream = await startWatchedRun()
      const pollsBefore = pollRequests()
      const streamsBefore = sseInstances.length
      stream.fail()
      if (stream.closed !== true) throw new Error('an errored stream must be closed')
      const rebuild = newestPendingTimer()
      if (rebuild === undefined || rebuild.ms !== STREAM_REBUILD_BASE_MS) {
        throw new Error('a follower must rebuild after an SSE error instead of going dark')
      }
      if (pollRequests() !== pollsBefore) throw new Error('a follower must never poll: the error path sent a request')
      fireNewestPendingTimer('follower rebuild after error')
      if (sseInstances.length !== streamsBefore + 1) {
        throw new Error('the follower did not re-open the stream after an error')
      }
      finishStream(latestInstance(), 'follower error case')
    }

    /* D. Consecutive failures back off (1s → 2s), so this cannot become an
          open→fail→open tight loop. */
    {
      const stream = await startWatchedRun()
      const pollsBefore = pollRequests()
      fireNewestPendingTimer('backoff stall 1')
      const firstDelay = newestPendingTimer()
      fireNewestPendingTimer('backoff rebuild 1')
      fireNewestPendingTimer('backoff stall 2')
      const secondDelay = newestPendingTimer()
      if (firstDelay === undefined || firstDelay.ms !== STREAM_REBUILD_BASE_MS) {
        throw new Error(`the first follower rebuild must wait ${STREAM_REBUILD_BASE_MS}ms, got ${firstDelay === undefined ? 'nothing' : firstDelay.ms + 'ms'}`)
      }
      if (secondDelay === undefined || secondDelay.ms !== STREAM_REBUILD_BASE_MS * 2) {
        throw new Error(`the second consecutive rebuild must back off to ${STREAM_REBUILD_BASE_MS * 2}ms, got ${secondDelay === undefined ? 'nothing' : secondDelay.ms + 'ms'}`)
      }
      fireNewestPendingTimer('backoff rebuild 2')
      if (stream.closed !== true) throw new Error('the first stalled stream must stay closed')
      if (pollRequests() !== pollsBefore) throw new Error('a follower must never poll: the backoff path sent a request')
      finishStream(latestInstance(), 'follower backoff case')
    }

    /* E. The budget caps the retries: past STREAM_REBUILD_MAX the follower
          stops trying instead of spinning forever (0.2.16's loop had no bound). */
    {
      nextRunId = 'run-live'
      liveRunState = 'running'
      await startWatchedRun()
      for (let attempt = 1; attempt <= STREAM_REBUILD_MAX; attempt += 1) {
        fireNewestPendingTimer(`cap stall ${attempt}`)
        const retry = newestPendingTimer()
        if (retry === undefined) throw new Error(`rebuild attempt ${attempt} did not schedule a retry`)
        fireNewestPendingTimer(`cap rebuild ${attempt}`)
      }
      const timersBefore = timerSeq
      fireNewestPendingTimer('cap stall after the rebuild budget')
      if (timerSeq !== timersBefore) {
        throw new Error('the follower rebuild budget must cap retries: a further retry was armed past STREAM_REBUILD_MAX')
      }
      if (latestInstance().closed !== true) throw new Error('the exhausted stream must be closed, not left half-open')
      /* Bounded is not the same as permanent: a fresh leader role re-attaches
         (and with streamStalls past the limit the leader polls), so the card
         recovers instead of freezing. */
      for (const id of rivalIntervals) clearInterval(id)
      rivalIntervals.length = 0
      dispatchWindowEvent('pageshow', { type: 'pageshow' })
      const poll = newestPendingTimer()
      if (poll === undefined || poll.ms !== 320) {
        throw new Error('after the rebuild budget a leader must poll (no dead end left behind)')
      }
      liveRunState = 'done'
      fireNewestPendingTimer('settle poll after the rebuild budget')
      await new Promise((resolve) => setTimeout(resolve, 60))
      liveRunState = 'running'
    }

    /* F. The leader keeps its existing semantics: a stalled stream becomes
          polling. */
    {
      const stream = await startWatchedRun()
      const pollsBefore = pollRequests()
      const streamsBefore = sseInstances.length
      fireNewestPendingTimer('leader stream stall')
      if (stream.closed !== true) throw new Error('a stalled leader stream must be closed')
      const poll = newestPendingTimer()
      if (poll === undefined || poll.ms !== 320) {
        throw new Error(`a leader must convert a stall into the 320ms poll, got ${poll === undefined ? 'nothing' : poll.ms + 'ms'}`)
      }
      if (sseInstances.length !== streamsBefore) throw new Error('a leader must not re-open the stream on the stall path')
      if (pollRequests() !== pollsBefore) throw new Error('the leader poll must not have run yet')
      fireNewestPendingTimer('leader stall poll')
      await new Promise((resolve) => setTimeout(resolve, 60))
      if (pollRequests() !== pollsBefore + 1) {
        throw new Error('the leader stall poll did not issue GET /council/run/<id>')
      }
    }

    /* G. `streamStalls >= 2` still degrades the leader to polling for good. */
    {
      liveRunState = 'running'
      nextRunId = 'run-live'
      await startWatchedRun()
      /* First stall: the leader polls, and a running answer re-opens the stream
         (streamStalls is still 1). */
      fireNewestPendingTimer('degrade stall 1')
      fireNewestPendingTimer('degrade poll 1')
      await new Promise((resolve) => setTimeout(resolve, 60))
      const healed = latestInstance()
      if (healed.closed === true) throw new Error('the first leader poll should have re-opened the stream')
      requireWatchdog('healed leader stream', 0)
      const streamsBefore = sseInstances.length
      /* Second stall: streamStalls is now 2, so polling wins for good. */
      fireNewestPendingTimer('degrade stall 2')
      fireNewestPendingTimer('degrade poll 2')
      await new Promise((resolve) => setTimeout(resolve, 60))
      if (sseInstances.length !== streamsBefore) {
        throw new Error('streamStalls >= 2 must keep the leader on polling instead of re-opening the stream')
      }
      const poll = newestPendingTimer()
      if (poll === undefined || poll.ms !== 320) throw new Error('the degraded leader must keep its 320ms poll armed')
      /* A done answer ends the chain. */
      liveRunState = 'done'
      fireNewestPendingTimer('degrade settle poll')
      await new Promise((resolve) => setTimeout(resolve, 60))
      liveRunState = 'running'
      if (sseInstances.some((instance) => instance.closed !== true)) {
        throw new Error('an SSE case left a stream open')
      }
    }
  } finally {
    for (const id of rivalIntervals) clearInterval(id)
    rivalIntervals.length = 0
    delete fakeWindow.EventSource
    liveRunState = 'running'
    nextRunId = null
  }

  /* Restore the delivery mode these cases borrowed (silent before them). */
  const silentRadio = findRadioByLabel(build(tabBody({ t })), '静默放进上下文')
  if (silentRadio === undefined) throw new Error('feedback option vanished after the SSE cases')
  silentRadio.props.onChange()
}

/* 1. "预览附件" posts /council/preview and renders the manifest in full. */
{
  setQuestion('外发清单测试问题')
  const before = previewCallCount()
  const button = previewButtonNode()
  if (button === undefined) throw new Error('preview button is missing next to the run button')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const calls = fetchCalls.filter((call) => call.url === '/council/preview')
  if (calls.length !== before + 1) {
    throw new Error(`preview button did not POST /council/preview (delta=${calls.length - before})`)
  }
  if (calls[calls.length - 1].method !== 'POST') throw new Error('preview must be sent as a POST')
  const sent = JSON.parse(calls[calls.length - 1].body)
  if (sent.question !== '外发清单测试问题') throw new Error(`preview sent the wrong question: ${sent.question}`)
  if (sent.attachFiles !== true) throw new Error('preview must report the attachFiles flag')
  if (sent.sessionId !== 'session-test') throw new Error(`preview sent the wrong session: ${sent.sessionId}`)

  const html = render(React.createElement(tabBody, { t }))
  for (const expected of [
    '出站清单（以下内容会发送给所选模型提供商）',
    '将附带 2 个文件（1234 字）',
    'D:\\demo\\a.md',
    'D:\\demo\\b.md',
    '源码包：附带 3 个文件（4567 字）；发现 10 个，截断 2 个',
    '已脱敏 1 处，这些位置对本次评审不可见：',
    'D:\\demo\\secret.env（openai-key）',
    '说明：抽样初审，不是全项目审查',
    '确认并开始评审',
  ]) {
    if (!html.includes(expected)) throw new Error(`manifest is missing "${expected}": ${html.slice(0, 600)}`)
  }
}

/* 2. Preview + confirmed start carries manifestConfirmed:true, then consumes it. */
{
  setQuestion('确认后开始的问题')
  const button = previewButtonNode()
  if (button === undefined) throw new Error('preview button is missing before the confirm case')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (!render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('a successful preview must switch the run button to its confirm state')
  }
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('a confirmed start did not POST /council/run')
  const body = lastRunBody()
  if (body.manifestConfirmed !== true) {
    throw new Error(`a confirmed run must carry manifestConfirmed:true, got ${JSON.stringify(body.manifestConfirmed)}`)
  }
  if (render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('a run must consume the confirmation (one-shot authorisation)')
  }
}

/* 3. Without a preview the same button must NOT claim a confirmation. */
{
  setQuestion('未预览就点开始')
  if (render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('a fresh question must not start in the confirm state')
  }
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('an unconfirmed start did not run')
  if (lastRunBody().manifestConfirmed === true) {
    throw new Error('starting without a preview must not send manifestConfirmed:true')
  }
}

/* 4. Editing the question after a preview invalidates the confirmation. */
{
  setQuestion('换问题前')
  const button = previewButtonNode()
  if (button === undefined) throw new Error('preview button is missing before the question swap')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (!render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('preview before the question swap did not confirm')
  }
  setQuestion('换问题后')
  const html = render(React.createElement(tabBody, { t }))
  if (html.includes('确认并开始评审')) {
    throw new Error('changing the question must invalidate the confirmation')
  }
  if (!html.includes('确认已失效')) throw new Error('the stale-manifest hint is missing after a question edit')
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('the run after a question swap did not start')
  if (lastRunBody().manifestConfirmed === true) {
    throw new Error('a rewritten question must not reuse the old confirmation')
  }
}

/* 5. Switching sessions after a preview invalidates the confirmation too. */
{
  setQuestion('换会话前')
  const button = previewButtonNode()
  if (button === undefined) throw new Error('preview button is missing before the session switch')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (!render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('preview before the session switch did not confirm')
  }
  command.ui.run({ sessionId: 'session-other' })
  await new Promise((resolve) => setTimeout(resolve, 400))
  setQuestion('换会话前')
  if (render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('switching sessions must invalidate the confirmation')
  }
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('the run after a session switch did not start')
  if (lastRunBody().manifestConfirmed === true) {
    throw new Error('a new session must not reuse the confirmation of the old one')
  }
}

/* 6. A failed preview fails closed: it must also revoke a confirmation for the
      SAME question, otherwise a stale manifest would ride along silently. */
{
  setQuestion('预览失败的问题')
  const okButton = previewButtonNode()
  if (okButton === undefined) throw new Error('preview button is missing before the failure case')
  okButton.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  if (!render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('the successful preview before the failure case did not confirm')
  }
  failNextPreview = 'preview service down'
  const button = previewButtonNode()
  if (button === undefined) throw new Error('preview button vanished before the retry')
  button.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 200))
  const html = render(React.createElement(tabBody, { t }))
  if (!html.includes('预览失败：preview service down')) {
    throw new Error(`a failed preview must show its error: ${html.slice(0, 600)}`)
  }
  if (html.includes('确认并开始评审')) {
    throw new Error('a failed preview must revoke the confirmation (fail closed)')
  }
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('a failed preview must not block the original run path')
  if (lastRunBody().manifestConfirmed === true) {
    throw new Error('a failed preview must never authorise manifestConfirmed:true')
  }
}

/* 7. attachFiles=false: no preview surface, no confirmation, unchanged run path. */
{
  const toggle = checkboxByLabel('自动附带问题里的本地路径')
  if (toggle === undefined) throw new Error('the attachFiles toggle is missing')
  toggle.props.onChange()
  setQuestion('不附带文件的问题')
  if (render(React.createElement(tabBody, { t })).includes('预览附件')) {
    throw new Error('attachFiles=false must hide the preview button')
  }
  if (render(React.createElement(tabBody, { t })).includes('确认并开始评审')) {
    throw new Error('attachFiles=false must never show a confirmation state')
  }
  const before = postCount
  clickRun()
  await new Promise((resolve) => setTimeout(resolve, 1800))
  if (postCount - before !== 1) throw new Error('attachFiles=false must keep the original run path')
  const body = lastRunBody()
  if (body.attachFiles !== false) throw new Error(`attachFiles=false must be sent as false, got ${JSON.stringify(body.attachFiles)}`)
  if (body.manifestConfirmed === true) throw new Error('attachFiles=false must never confirm a manifest')
  const restore = checkboxByLabel('自动附带问题里的本地路径')
  if (restore === undefined) throw new Error('the attachFiles toggle vanished')
  restore.props.onChange()
}

for (const cleanup of cleanups.reverse()) {
  try {
    cleanup()
  } catch (error) {
    throw new Error(`cleanup threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/* This harness started two endless loops the plugin owns in a real tab: the
   leader-election interval and the discovery chain (which re-arms on purpose).
   Release both so the offline run terminates instead of hanging. */
dispatchWindowEvent('pagehide', { type: 'pagehide' })
for (const id of discoveryTimerIds) clearTimeout(id)

console.log('client half: OK')
console.log(`  slots: ${[...registered].join(', ')}`)
console.log(`  tab type: ${tabTypes[0].kind} (${tabTypes[0].id})`)
console.log(`  command: /${command.name} (${command.ui.kind})`)
console.log(`  deliveries: ${resumeCalls.map((call) => call.mode).join(', ')}`)
