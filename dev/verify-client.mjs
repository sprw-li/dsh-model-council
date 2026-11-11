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

/* "Wake the chat agent" enabled before the bundle loads. */
storage.set(LS_KEY, JSON.stringify({ feedbackMode: 'wake', useContext: true, useChairman: true }))

const MODEL = { provider: 'p1', model: 'm1', name: 'Model One' }
const MODEL2 = { provider: 'p1', model: 'm2', name: 'Model Two' }
const MODEL3 = { provider: 'p2', model: 'm3', name: 'Model Three' }

function answersFor(overrides) {
  return [
    Object.assign({ key: 'p1|m1', provider: 'p1', model: 'm1', name: 'Model One', text: '答案一', done: true, error: '' }, overrides === undefined ? {} : overrides[0]),
    Object.assign({ key: 'p1|m2', provider: 'p1', model: 'm2', name: 'Model Two', text: '答案二', done: true, error: '' }, overrides === undefined ? {} : overrides[1]),
  ]
}

/** One done run per fetch; the browser half is driven by snapshots only. */
const SCENARIOS = [
  {
    id: 'run-1', status: 'done', stage: 'done', question: '测试问题', error: '',
    contextChars: 120, contextState: 'ok', useChairman: true,
    seatMode: 'subagent',
    filesState: 'ok', filesPaths: ['D:\\demo'], filesChars: 1200,
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

let postCount = 0

const fakeWindow = {
  __ModuleLoader__: { load(argument) { loadArgument = argument } },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null },
    setItem(key, value) { storage.set(key, String(value)) },
  },
  fetch: async (url, options) => {
    fetchCalls.push({ url, method: options === undefined || options === null || options.method === undefined ? 'GET' : options.method })
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
    if (url === '/council/run') {
      postCount += 1
      const runId = `run-${postCount}`
      return { ok: true, json: async () => ({ runId }) }
    }
    const resumeMatch = /\/council\/run\/(run-\d+)\/resume$/.exec(String(url))
    if (resumeMatch !== null) {
      const payload = JSON.parse(options === undefined || options === null || options.body === undefined ? '{}' : options.body)
      resumeCalls.push({ runId: resumeMatch[1], mode: payload.mode })
      return { ok: true, json: async () => ({ ok: true, mode: payload.mode }) }
    }
    const runMatch = /\/council\/run\/(run-\d+)$/.exec(String(url))
    if (runMatch !== null) {
      const index = Number(runMatch[1].slice('run-'.length)) - 1
      return { ok: true, json: async () => SCENARIOS[index] || SCENARIOS[0] }
    }
    return { ok: true, json: async () => ({ ok: true }) }
  },
  setTimeout,
  clearTimeout,
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
  addEventListener() {},
  removeEventListener() {},
}

const React = {
  createElement(type, props, ...children) {
    return { type, props: props === null || props === undefined ? {} : props, children: children.flat(Infinity) }
  },
  useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}] },
  useEffect() {},
}

const context = {
  window: fakeWindow,
  document: fakeDocument,
  console,
  Map, Set, WeakMap, Promise, Date, Math, JSON, String, Number, Object, Array,
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
  if (typeof node.type === 'function') return render(node.type(Object.assign({}, node.props, { children: node.children })))
  const children = node.children !== undefined && node.children.length > 0 ? node.children : node.props.children
  return render(children)
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

bridge({ t, sessionId: 'session-test', useInput: (selector) => selector({ draft: '/' }), inputActions })

if (typeof command.icon !== 'function') throw new Error('command has no slash-menu icon')

/* A leftover "/" in the composer must not become the question or start a run. */
command.ui.run({ sessionId: 'session-test' })
await new Promise((resolve) => setTimeout(resolve, 400))
if (openedTabs.indexOf('council') === -1) throw new Error('command did not open the sidebar tab')
if (fetchCalls.some((call) => call.url === '/council/run' && call.method === 'POST')) {
  throw new Error('leftover "/" started a run')
}

/* A real question is carried into the tab but still does NOT auto-start. */
bridge({ t, sessionId: 'session-test', useInput: (selector) => selector({ draft: '/council 测试问题' }), inputActions })
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
if (!filesHtml.includes('本次使用只读 subagent 席位')) throw new Error('subagent-seat note is missing after the run')

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

/* Silent delivery: inject the conclusion without waking the main Agent. */
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

for (const cleanup of cleanups.reverse()) {
  try {
    cleanup()
  } catch (error) {
    throw new Error(`cleanup threw: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('client half: OK')
console.log(`  slots: ${[...registered].join(', ')}`)
console.log(`  tab type: ${tabTypes[0].kind} (${tabTypes[0].id})`)
console.log(`  command: /${command.name} (${command.ui.kind})`)
console.log(`  deliveries: ${resumeCalls.map((call) => call.mode).join(', ')}`)
