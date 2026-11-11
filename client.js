window.__ModuleLoader__.load({
  id: 'dsh-model-council',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'council'

    const zh = {
      'meta.title': '多模型理事会',
      'chip.label': '理事会',
      'chip.title': '选择模型并运行多模型评审（输入 /council）',
      'bar.title': '理事会',
      'bar.count': '{count} 个模型',
      'bar.loading': '正在读取可用模型…',
      'bar.empty': '没有可用的对话模型',
      'bar.hint': '勾选后输入 /council 运行；至少 2 个模型',
      'bar.clear': '清空',
      'bar.pickThree': '选前三个',
      'panel.title': '多模型理事会',
      'panel.close': '关闭',
      'panel.question': '问题',
      'panel.questionPlaceholder': '写下要交给理事会的问题…',
      'panel.models': '参与模型（{count} 个已选，2–6 个）',
      'panel.run': '开始评审',
      'panel.running': '运行中…',
      'panel.cancel': '取消',
      'panel.copy': '复制结论',
      'panel.copied': '已复制',
      'panel.stage': '当前阶段：{stage}',
      'panel.reviews': '匿名互评',
      'panel.chairman': '主席结论 · {name}',
      'panel.chairmanPick': '主席模型（由它汇总结论）',
      'panel.options': '选项',
      'panel.optContext': '接当前对话上下文',
      'panel.optFiles': '自动附带问题里的本地路径',
      'panel.optSeats': 'subagent 只读席位（可读文件/skill）',
      'panel.seatsHint': '开启后每个委员是一个只读子代理：可读文件、搜索、加载 skill，不能写；更慢但能自行查证。关闭则用纯模型调用。开启时路径附件默认关闭（委员自己读文件）。',
      'panel.seatModeSub': '本次使用只读 subagent 席位',
      'panel.seatModeFallback': 'subagent 席位不可用，本次退回纯模型调用',
      'panel.filesHint': '问题中出现的本地路径（如 D:\\dev\\项目）会自动读取目录树和关键文件，最多 {chars} 字；没写路径但提到工作区/项目时用当前会话工作区；跳过 .git/node_modules/密钥文件。',
      'panel.workspace': '当前会话工作区：{path}',
      'panel.filesAttached': '已附带 {count} 个路径的文件内容（{chars} 字）',
      'panel.optFeedback': '结果回投主聊天',
      'panel.optChairman': '主席汇总（关闭=无主）',
      'panel.feedbackSent': '已回投主聊天',
      'panel.feedbackMode': '结果回投',
      'panel.feedbackOff': '不做（只留在右侧栏）',
      'panel.feedbackSilent': '静默注入主聊天',
      'panel.feedbackWake': '直接唤醒主聊天',
      'panel.feedbackHint': '静默注入不唤醒主 Agent，下次对话时作为上下文生效；唤醒会立即让主 Agent 回复。',
      'panel.feedbackSilentSent': '已静默注入，下次对话生效',
      'panel.feedbackWakeSent': '已唤醒主聊天',
      'panel.privacy': '接上下文时，最近约 {chars} 字会话内容会发送至所选模型提供商；回投会再发一条消息。',
      'panel.cost': '预计 {count} 次模型调用',
      'panel.partialFailure': '{failed}/{total} 个模型失败，其余结果仍有效',
      'panel.contextUnavailable': '上下文读取失败，本轮只发送了问题本身',
      'error.bridgeVersion': 'quick-quote 事件版本不匹配，请一起更新插件',
      'selection.label': '交给理事会评审',
      'selection.prefix': '请评审下面选中的内容，指出问题、风险和改进建议：',
      'tab.title': '理事会',
      'panel.loadModels': '重新读取模型',
      'stage.answers': '独立作答',
      'stage.reviews': '交叉互评',
      'stage.chairman': '主席汇总',
      'stage.done': '已完成',
      'status.streaming': '进行中',
      'status.done': '完成',
      'status.error': '失败',
      'status.seatStarting': '启动中 {s}s',
      'status.seatRunning': '运行中 {s}s',
      'status.seatClosed': '已关闭',
      'status.fallback': '完成（降级）',
      'error.empty': '问题不能为空',
      'error.minModels': '至少选择两个模型',
      'command.label': '理事会评审',
      'command.description': '把当前问题并行发给多个模型，匿名互评后由主席总结',
      'copy.title': '多模型理事会结论',
    }

    const en = {
      'meta.title': 'Model council',
      'chip.label': 'Council',
      'chip.title': 'Pick models and run a multi-model review (type /council)',
      'bar.title': 'Council',
      'bar.count': '{count} models',
      'bar.loading': 'Loading available models…',
      'bar.empty': 'No chat models available',
      'bar.hint': 'Tick at least 2 models, then type /council',
      'bar.clear': 'Clear',
      'bar.pickThree': 'First three',
      'panel.title': 'Model council',
      'panel.close': 'Close',
      'panel.question': 'Question',
      'panel.questionPlaceholder': 'Write the question for the council…',
      'panel.models': 'Participants ({count} selected, 2–6)',
      'panel.run': 'Run council',
      'panel.running': 'Running…',
      'panel.cancel': 'Cancel',
      'panel.copy': 'Copy conclusion',
      'panel.copied': 'Copied',
      'panel.stage': 'Stage: {stage}',
      'panel.reviews': 'Anonymous peer review',
      'panel.chairman': 'Chairman conclusion · {name}',
      'panel.chairmanPick': 'Chairman model (writes the synthesis)',
      'panel.options': 'Options',
      'panel.optContext': 'Attach current chat context',
      'panel.optFiles': 'Attach local paths named in the question',
      'panel.optSeats': 'Read-only subagent seats (files + skills)',
      'panel.seatsHint': 'Each seat becomes a read-only subagent: it can read files, search, and load skills, but cannot write. Slower, but it can verify things itself. Off = raw model calls. With seats on, path attachments default off (the seats read files themselves).',
      'panel.seatModeSub': 'Used read-only subagent seats',
      'panel.seatModeFallback': 'Subagent seats unavailable; fell back to raw model calls',
      'panel.filesHint': 'Local paths in the question (e.g. D:\\dev\\project) attach their directory tree and key files, up to {chars} characters; a workspace/project question without a path uses the session workspace; .git/node_modules/secret files are skipped.',
      'panel.workspace': 'Session workspace: {path}',
      'panel.filesAttached': 'Attached {count} path(s), {chars} characters',
      'panel.optFeedback': 'Post the result back to the chat',
      'panel.optChairman': 'Chairman synthesis (off = no chair)',
      'panel.feedbackSent': 'Posted back to the chat',
      'panel.feedbackMode': 'Result delivery',
      'panel.feedbackOff': 'Off (sidebar only)',
      'panel.feedbackSilent': 'Silent inject into the chat',
      'panel.feedbackWake': 'Wake the chat agent',
      'panel.feedbackHint': 'Silent inject does not wake the main Agent; the conclusion becomes context at the next turn. Wake starts a follow-up turn now.',
      'panel.feedbackSilentSent': 'Injected silently; applies at the next turn',
      'panel.feedbackWakeSent': 'Posted and woke the main Agent',
      'panel.privacy': 'With context on, about {chars} characters of this chat are sent to the selected model providers; posting back adds one more message.',
      'panel.cost': 'About {count} model calls',
      'panel.partialFailure': '{failed}/{total} models failed; the other results still stand',
      'panel.contextUnavailable': 'Context could not be read; only the question was sent',
      'error.bridgeVersion': 'quick-quote bridge version mismatch; update both plugins together',
      'selection.label': 'Send to council review',
      'selection.prefix': 'Review the selected passage below; point out problems, risks and improvements:',
      'tab.title': 'Council',
      'panel.loadModels': 'Reload models',
      'stage.answers': 'Answers',
      'stage.reviews': 'Peer review',
      'stage.chairman': 'Synthesis',
      'stage.done': 'Done',
      'status.streaming': 'Streaming',
      'status.done': 'Done',
      'status.error': 'Failed',
      'status.seatStarting': 'Starting {s}s',
      'status.seatRunning': 'Running {s}s',
      'status.seatClosed': 'Closed',
      'status.fallback': 'Done (fallback)',
      'error.empty': 'The question is empty',
      'error.minModels': 'Select at least two models',
      'command.label': 'Council review',
      'command.description': 'Ask several models in parallel, let them review each other, then synthesize',
      'copy.title': 'Model council conclusion',
    }

    /** Module-local translator; replaced by the bound locale function in apply. */
    let tr = (key) => key

    /** Max participants requested from the host. */
    const MAX_MODELS = 6
    /** Version of the quick-quote ↔ council selection bridge. */
    const REVIEW_API_VERSION = 1
    /** Browser storage for selected models and row expansion. */
    const LS_KEY = '@local/council:v1'

    const CSS = `
.dsc-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dsc-chip:hover,.dsc-chip:focus-visible{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsc-chip.dsc-on{color:var(--dsw-alias-label-primary)}
.dsc-chip.dsc-running{color:var(--dsw-alias-brand-primary)}
.dsc-chip-icon{font-size:13px;line-height:1}
.dsc-chip-count{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-brand-primary);color:#fff;font-size:10px;line-height:1}
.dsc-bar{display:flex;flex-direction:column;gap:4px;margin:2px 0;padding:4px 6px;border-radius:var(--dsw-radius-md);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsc-bar-head{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dsc-bar-title{font-weight:600}
.dsc-bar-count{color:var(--dsw-alias-label-tertiary)}
.dsc-bar-caret{color:var(--dsw-alias-label-tertiary);font-size:10px}
.dsc-bar-body{display:flex;flex-direction:column;gap:5px}
.dsc-group{display:flex;align-items:flex-start;gap:6px}
.dsc-group-name{flex:none;min-width:64px;padding-top:4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:132px}
.dsc-options{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.dsc-opt{display:inline-flex;align-items:center;gap:4px;max-width:220px;padding:2px 7px 2px 5px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:16px}
.dsc-opt:hover{border-color:var(--dsw-alias-brand-primary)}
.dsc-opt.dsc-opt-on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsc-opt input{width:12px;height:12px;margin:0;accent-color:var(--dsw-alias-brand-primary);flex:none}
.dsc-opt-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-bar-foot{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsc-link{padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}
.dsc-hint{color:var(--dsw-alias-label-tertiary)}
.dsc-error{color:var(--dsw-alias-state-error-primary)}
.dsc-overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(8,10,16,.46);pointer-events:auto}
.dsc-panel{display:flex;flex-direction:column;width:min(1000px,94vw);max-height:88vh;border-radius:var(--dsw-radius-lg);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent);overflow:hidden}
.dsc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsc-panel-title{display:inline-flex;align-items:center;gap:7px;font-size:14px;font-weight:600}
.dsc-close{width:26px;height:26px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font-size:18px;line-height:1;cursor:pointer}
.dsc-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsc-tab{display:flex;flex-direction:column;height:100%;min-height:0}
.dsc-tab-inner{display:flex;flex-direction:column;flex:1;min-height:0}
.dsc-tab-head{display:flex;align-items:center;gap:7px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;font-weight:600}
.dsc-tab-title{font-size:13px}
.dsc-tab .dsc-panel-body{flex:1;min-height:0;padding:10px 12px 16px}
.dsc-select{box-sizing:border-box;width:100%;height:28px;padding:0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none}
.dsc-select:focus{border-color:var(--dsw-alias-brand-primary)}
.dsc-select:disabled{opacity:.55}
.dsc-toggles{display:flex;flex-wrap:wrap;gap:6px 14px}
.dsc-toggle{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dsc-toggle input{width:12px;height:12px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.dsc-note{color:var(--dsw-alias-state-success-primary);font-size:11px}
.dsc-warn{color:var(--dsw-alias-label-tertiary);font-size:11px;font-style:italic}
.dsc-menu{display:flex;flex-direction:column;min-width:168px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent)}
.dsc-menu-item{display:flex;align-items:center;gap:7px;width:100%;padding:6px 9px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap}
.dsc-menu-item:hover,.dsc-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-menu-icon{font-size:13px;line-height:1}
.dsc-panel-body{display:flex;flex-direction:column;gap:12px;padding:14px 16px 18px;overflow:auto}
.dsc-field{display:flex;flex-direction:column;gap:6px}
.dsc-field-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsc-textarea{box-sizing:border-box;width:100%;min-height:82px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.55;outline:none}
.dsc-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.dsc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsc-primary{height:30px;padding:0 14px;border:1px solid var(--dsw-alias-brand-primary);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-brand-primary);color:#fff;font:inherit;font-size:12px;cursor:pointer}
.dsc-primary:disabled{opacity:.55;cursor:default}
.dsc-secondary{height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsc-secondary:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-error-box{padding:8px 10px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5;white-space:pre-wrap}
.dsc-results{display:flex;flex-direction:column;gap:10px;margin-top:2px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsc-stage{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsc-spinner{width:10px;height:10px;border-radius:50%;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-alias-brand-primary);animation:dsc-spin .8s linear infinite}
@keyframes dsc-spin{to{transform:rotate(360deg)}}
.dsc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px}
.dsc-grid-small{grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.dsc-card{display:flex;flex-direction:column;gap:6px;min-width:0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1)}
.dsc-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsc-card-title{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-badge{flex:none;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:15px}
.dsc-card-text{max-height:230px;overflow:auto;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}
.dsc-section{display:flex;flex-direction:column;gap:6px}
.dsc-section-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsc-chairman{padding:11px 12px;border:1px solid var(--dsw-alias-brand-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word}
`

    /* ------------------------------------------------------------------ *
     * State store                                                         *
     * ------------------------------------------------------------------ */

    const listeners = new Set()

    function loadPersisted() {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(LS_KEY) || '{}')
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    const persisted = loadPersisted()

    const store = {
      state: {
        catalog: [],
        selected: Array.isArray(persisted.selected) ? persisted.selected.filter((key) => typeof key === 'string').slice(0, MAX_MODELS) : [],
        chairmanKey: typeof persisted.chairmanKey === 'string' ? persisted.chairmanKey : '',
        useContext: persisted.useContext !== false,
        attachFiles: persisted.attachFiles !== false,
        useSubagentSeats: persisted.useSubagentSeats !== false,
        feedbackMode: persisted.feedbackMode === 'silent' || persisted.feedbackMode === 'wake'
          ? persisted.feedbackMode
          : persisted.useFeedback === true ? 'wake' : 'off',
        useChairman: persisted.useChairman !== false,
        sessionId: '',
        feedbackRunId: '',
        contextMaxChars: 6000,
        filesMaxChars: 20000,
        workspace: null,
        loading: false,
        loadError: '',
        question: '',
        runId: '',
        run: null,
        running: false,
        error: '',
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      publish(patch) {
        store.state = Object.assign({}, store.state, patch)
        for (const listener of Array.from(listeners)) {
          try {
            listener()
          } catch (error) {
            console.warn('[council] listener failed', error)
          }
        }
      },
    }

    function persist() {
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify({
          selected: store.state.selected,
          chairmanKey: store.state.chairmanKey,
          useContext: store.state.useContext,
          attachFiles: store.state.attachFiles,
          useSubagentSeats: store.state.useSubagentSeats,
          feedbackMode: store.state.feedbackMode,
          useChairman: store.state.useChairman,
        }))
      } catch {
        /* storage is best effort */
      }
    }

    /** Subscribe one component to the store. */
    function useStore(selector) {
      const [, force] = React.useState(0)
      React.useEffect(() => store.subscribe(() => force((value) => value + 1)), [])
      return selector(store.state)
    }

    /** Latest composer draft and write verbs seen by a session-scoped component. */
    const draftBridge = { draft: '', sessionId: undefined, inputActions: undefined }

    /** Client root context captured by `apply`, used for late service lookup. */
    let hostCtx = null

    /** Identity of the right-sidebar tab type this plugin owns. */
    const TAB_ID = 'dsh-model-council/panel'
    const TAB_KIND = 'council'

    function service(name) {
      try {
        return hostCtx === null ? undefined : hostCtx.get(name)
      } catch {
        return undefined
      }
    }

    function sleep(ms) {
      return new Promise((resolve) => {
        window.setTimeout(resolve, ms)
      })
    }

    /* ------------------------------------------------------------------ *
     * HTTP                                                                *
     * ------------------------------------------------------------------ */

    async function fetchJson(path, options) {
      const response = await window.fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}))
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok) throw new Error(data && data.error ? String(data.error) : `HTTP ${response.status}`)
      return data
    }

    let loadPromise = null

    /** Load the configured provider/model catalog once, retryable. */
    function loadModels() {
      if (loadPromise !== null) return loadPromise
      store.publish({ loading: true, loadError: '' })
      loadPromise = fetchJson('/council/models')
        .then((data) => {
          const rows = []
          const providers = Array.isArray(data.providers) ? data.providers : []
          for (const provider of providers) {
            if (provider === null || typeof provider !== 'object') continue
            const models = Array.isArray(provider.models) ? provider.models : []
            for (const model of models) {
              if (model === null || typeof model !== 'object') continue
              if (typeof model.id !== 'string' || typeof provider.id !== 'string') continue
              rows.push({
                key: `${provider.id}|${model.id}`,
                provider: provider.id,
                providerName: typeof provider.name === 'string' ? provider.name : provider.id,
                model: model.id,
                name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
              })
            }
          }
          const contextMaxChars = typeof data.contextMaxChars === 'number'
            && Number.isSafeInteger(data.contextMaxChars) && data.contextMaxChars > 0
            ? data.contextMaxChars
            : 6000
          const filesMaxChars = typeof data.filesMaxChars === 'number'
            && Number.isSafeInteger(data.filesMaxChars) && data.filesMaxChars > 0
            ? data.filesMaxChars
            : 20000
          store.publish({ catalog: rows, contextMaxChars, filesMaxChars, loading: false, loadError: '' })
          pruneSelection(rows)
        })
        .catch((error) => {
          store.publish({ loading: false, loadError: String(error && error.message ? error.message : error) })
        })
        .finally(() => {
          loadPromise = null
        })
      return loadPromise
    }

    /** Keep the chairman inside the current selection (first seat by default). */
    function clampChairman(selected) {
      if (selected.indexOf(store.state.chairmanKey) !== -1) return
      store.publish({ chairmanKey: selected.length > 0 ? selected[0] : '' })
    }

    /** Keep only known model keys. */
    function pruneSelection(rows) {
      const known = new Set(rows.map((row) => row.key))
      const kept = store.state.selected.filter((key) => known.has(key))
      if (kept.length === store.state.selected.length) return
      store.publish({ selected: kept })
      clampChairman(kept)
      persist()
    }

    /** Pick a starter panel when the user has not chosen models yet. */
    function ensureSelection() {
      if (store.state.selected.length >= 2) return
      const rows = store.state.catalog
      if (rows.length < 2) return
      const keys = rows.slice(0, 3).map((row) => row.key)
      store.publish({ selected: keys, chairmanKey: keys[0] })
      persist()
    }

    /** Append or remove one model key. */
    function toggleModel(key) {
      const selected = store.state.selected
      if (selected.indexOf(key) !== -1) {
        const next = selected.filter((item) => item !== key)
        store.publish({ selected: next })
        clampChairman(next)
        persist()
        return
      }
      if (selected.length >= MAX_MODELS) return
      const next = selected.concat([key])
      store.publish({ selected: next })
      clampChairman(next)
      persist()
    }

    function selectedRoutes() {
      const routes = []
      for (const key of store.state.selected) {
        const row = store.state.catalog.find((item) => item.key === key)
        if (row !== undefined) routes.push({ provider: row.provider, model: row.model })
      }
      return routes
    }

    /* ------------------------------------------------------------------ *
     * Run lifecycle                                                       *
     * ------------------------------------------------------------------ */

    let pollTimer = 0

    function stopPolling() {
      if (pollTimer !== 0) {
        window.clearTimeout(pollTimer)
        pollTimer = 0
      }
    }

    function schedulePoll(runId) {
      stopPolling()
      pollTimer = window.setTimeout(() => {
        void pollRun(runId)
      }, 320)
    }

    async function pollRun(runId) {
      if (store.state.runId !== runId) return
      try {
        const data = await fetchJson(`/council/run/${encodeURIComponent(runId)}`)
        if (store.state.runId !== runId) return
        const running = data.status === 'running'
        store.publish({ run: data, running })
        if (running) schedulePoll(runId)
        else if (data.status === 'done' && store.state.feedbackMode !== 'off') {
          void resumeRun(runId, store.state.feedbackMode)
        }
      } catch (error) {
        if (store.state.runId !== runId) return
        store.publish({ running: false, run: null, error: String(error && error.message ? error.message : error) })
      }
    }

    async function startRun() {
      if (store.state.running === true) return
      const question = String(store.state.question || '').trim()
      if (question === '') {
        store.publish({ error: tr('error.empty') })
        return
      }
      const models = selectedRoutes()
      if (models.length < 2) {
        store.publish({ error: tr('error.minModels') })
        return
      }
      const useChairman = store.state.useChairman !== false
      const chairmanRow = store.state.catalog.find((row) => row.key === store.state.chairmanKey)
      const chairman = useChairman && chairmanRow !== undefined
        ? { provider: chairmanRow.provider, model: chairmanRow.model }
        : undefined
      const sessionId = store.state.sessionId !== ''
        ? store.state.sessionId
        : typeof draftBridge.sessionId === 'string' ? draftBridge.sessionId : ''
      const payload = {
        question,
        models,
        chairman,
        context: store.state.useContext === true,
        attachFiles: store.state.useSubagentSeats !== false ? false : store.state.attachFiles !== false,
        seatMode: store.state.useSubagentSeats !== false ? 'subagent' : 'llm',
        useChairman,
        sessionId,
      }
      stopPolling()
      store.publish({ running: true, error: '', run: null, runId: '', feedbackRunId: '' })
      try {
        const data = await fetchJson('/council/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (typeof data.runId !== 'string' || data.runId === '') throw new Error('missing runId')
        store.publish({ runId: data.runId })
        schedulePoll(data.runId)
      } catch (error) {
        store.publish({ running: false, error: String(error && error.message ? error.message : error) })
      }
    }

    async function cancelRun() {
      const runId = store.state.runId
      if (runId === '') return
      try {
        await fetchJson(`/council/run/${encodeURIComponent(runId)}/cancel`, { method: 'POST' })
      } catch {
        /* the next poll reports the settled state */
      }
    }

    /**
     * Post a finished run back through the Host, with subagent-style semantics:
     * `silent` parks the message without waking the main Agent, `wake` queues an
     * immediate follow-up turn. Deduplicated per (run, mode).
     */
    async function resumeRun(runId, mode) {
      if (mode !== 'silent' && mode !== 'wake') return
      const token = `${runId}:${mode}`
      if (store.state.feedbackRunId === token) return
      store.publish({ feedbackRunId: token })
      try {
        await fetchJson(`/council/run/${encodeURIComponent(runId)}/resume`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
      } catch (error) {
        store.publish({ feedbackRunId: '', error: String(error && error.message ? error.message : error) })
      }
    }

    let workspacePromise = null

    /** Identify the session workspace once (session header cwd / workspace registry). */
    function loadWorkspace() {
      const sessionId = typeof draftBridge.sessionId === 'string' ? draftBridge.sessionId : store.state.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') return Promise.resolve()
      if (workspacePromise !== null) return workspacePromise
      workspacePromise = fetchJson(`/council/workspace?sessionId=${encodeURIComponent(sessionId)}`)
        .then((data) => {
          if (data !== null && typeof data === 'object') store.publish({ workspace: data })
        })
        .catch(() => {
          /* the workspace hint is best effort */
        })
        .finally(() => {
          workspacePromise = null
        })
      return workspacePromise
    }

    /** Draft minus a bare /council token; composer residue like a lone "/" is not a question. */
    function draftQuestion() {
      let text = String(draftBridge.draft || '')
      text = text.replace(/\/council\b/gi, ' ')
      text = text.replace(/[ \t]+/g, ' ').replace(/^[\/\s]+/, '').trim()
      if (/^[\/\s]*$/.test(text)) return ''
      return text
    }

    /**
     * Reveal the right sidebar and focus the council tab. This is the only
     * entry point: the tab never starts a run by itself, so the user can
     * review the question, participants and options before pressing run.
     */
    async function openCouncilTab(request) {
      const asked = request !== null && request !== undefined && typeof request.question === 'string' ? request.question.trim() : ''
      /* Always take the freshly derived question: a stale one from the previous
         run must not reappear when /council is invoked with no draft text. */
      store.publish({ question: asked })
      const rawDraft = String(draftBridge.draft || '')
      const leftoversOnly = rawDraft.replace(/\/council\b/gi, '').replace(/[\s/]+/g, '') === ''
      if (leftoversOnly && rawDraft !== '' && draftBridge.inputActions !== undefined
        && typeof draftBridge.inputActions.setDraft === 'function') {
        try {
          draftBridge.inputActions.setDraft('')
        } catch {
          /* clearing composer residue is best effort */
        }
      }
      const sessionId = request !== null && request !== undefined && typeof request.sessionId === 'string' ? request.sessionId : ''
      if (sessionId !== '') store.publish({ sessionId })
      void loadWorkspace()
      const layout = service('layout')
      if (layout !== undefined) {
        try {
          layout.openRightbar(true, false)
        } catch {
          /* the reveal is best effort; the tab open below still runs */
        }
      }
      const deadline = Date.now() + 3000
      while (Date.now() <= deadline) {
        const sidebar = service('sidebarRight')
        if (sidebar !== undefined) {
          try {
            sidebar.openTab(TAB_KIND)
            break
          } catch {
            /* the sidebar surface may not be mounted yet */
          }
        }
        await sleep(60)
      }
      await loadModels()
      ensureSelection()
    }

    /** Markdown conclusion for the clipboard. */
    function conclusionText() {
      const run = store.state.run
      if (run === null) return ''
      const lines = [`# ${tr('copy.title')}`, '', `## ${tr('panel.question')}`, run.question, '']
      lines.push(`## ${tr('panel.chairman', { name: run.chairman.name })}`, run.chairman.text || '')
      for (const answer of run.answers) lines.push('', `## ${answer.name}`, answer.text || answer.error || '')
      return lines.join('\n')
    }

    async function copyConclusion() {
      try {
        await window.navigator.clipboard.writeText(conclusionText())
        return true
      } catch {
        return false
      }
    }

    /* ------------------------------------------------------------------ *
     * Components                                                          *
     * ------------------------------------------------------------------ */

    function groupByProvider(catalog) {
      const groups = []
      const byId = new Map()
      for (const row of catalog) {
        let group = byId.get(row.provider)
        if (group === undefined) {
          group = { id: row.provider, name: row.providerName, models: [] }
          byId.set(row.provider, group)
          groups.push(group)
        }
        group.models.push(row)
      }
      return groups
    }

    function ModelOptions(props) {
      const selected = props.selected
      const groups = groupByProvider(props.catalog)
      return h('div', { className: 'dsc-options' },
        groups.map((group) => h('div', { className: 'dsc-group', key: group.id },
          h('span', { className: 'dsc-group-name', title: group.name }, group.name),
          h('div', { className: 'dsc-options' },
            group.models.map((row) => {
              const on = selected.indexOf(row.key) !== -1
              return h('label', {
                key: row.key,
                className: 'dsc-opt' + (on ? ' dsc-opt-on' : ''),
                title: `${row.providerName} · ${row.model}`,
              },
                h('input', {
                  type: 'checkbox',
                  checked: on,
                  onChange: () => toggleModel(row.key),
                }),
                h('span', { className: 'dsc-opt-name' }, row.name),
              )
            }),
          ),
        )),
      )
    }

    /** Slash-menu glyph: a balance scale standing for the council. */
    function CouncilIcon(props) {
      const size = props !== undefined && typeof props.size === 'number' ? props.size : 16
      const className = props !== undefined && typeof props.className === 'string' ? props.className : undefined
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className,
        'aria-hidden': true,
      },
        h('path', { d: 'M12 4v16' }),
        h('path', { d: 'M6 8h12' }),
        h('path', { d: 'M6 8l-3 6a3 3 0 0 0 6 0z' }),
        h('path', { d: 'M18 8l-3 6a3 3 0 0 0 6 0z' }),
        h('path', { d: 'M8 20h8' }),
      )
    }

    /** Context-menu (or fallback selection) surface for a selected passage. */
    function CouncilSelectionMenu(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const pick = () => {
        const text = typeof props.readText === 'function' ? String(props.readText() || '').trim() : ''
        if (typeof props.dismiss === 'function') props.dismiss()
        if (typeof props.clearSelection === 'function') props.clearSelection()
        if (text === '') return
        void openCouncilTab({ question: `${tr('selection.prefix')}\n\n${text}` })
      }
      return h('div', { className: 'dsc-menu', role: 'menu' },
        h('button', { type: 'button', className: 'dsc-menu-item', role: 'menuitem', onClick: pick },
          h('span', { className: 'dsc-menu-icon', 'aria-hidden': true }, '⚖'),
          h('span', null, t('selection.label')),
        ),
      )
    }

    /** Invisible composer bridge: keeps the latest draft and write verbs for /council. */
    function CouncilBridge(props) {
      const draft = typeof props.useInput === 'function'
        ? props.useInput((state) => (state !== null && state !== undefined && typeof state.draft === 'string' ? state.draft : ''))
        : ''
      draftBridge.draft = draft
      if (props.sessionId !== undefined) draftBridge.sessionId = props.sessionId
      if (props.inputActions !== undefined) draftBridge.inputActions = props.inputActions
      return h('span', { hidden: true, 'aria-hidden': true, style: { display: 'none' } })
    }

    /** Sidebar tab body: question, participants, three-stage results. */
    function CouncilTab(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const state = useStore((snapshot) => snapshot)
      const [copied, setCopied] = React.useState(false)

      React.useEffect(() => {
        if (state.catalog.length === 0) void loadModels()
      }, [])

      React.useEffect(() => {
        if (!copied) return undefined
        const timer = window.setTimeout(() => setCopied(false), 2000)
        return () => window.clearTimeout(timer)
      }, [copied])

      const run = state.run
      const stageNames = {
        answers: t('stage.answers'),
        reviews: t('stage.reviews'),
        chairman: t('stage.chairman'),
        done: t('stage.done'),
      }
      const stageName = run !== null && stageNames[run.stage] !== undefined ? stageNames[run.stage] : t('stage.answers')
      /** Seat phase label for a running card (starting/running/closed). */
      function seatStatusText(seat) {
        if (seat === null || typeof seat !== 'object') return t('status.streaming')
        const seconds = typeof seat.elapsedMs === 'number' && seat.elapsedMs > 0
          ? Math.max(1, Math.round(seat.elapsedMs / 1000))
          : 0
        if (seat.phase === 'starting') return t('status.seatStarting', { s: seconds })
        if (seat.phase === 'running') return t('status.seatRunning', { s: seconds })
        if (seat.phase === 'closed') return t('status.seatClosed')
        return t('status.streaming')
      }
      const participants = state.selected.length
      const estimatedCalls = participants * 2 + (state.useChairman !== false ? 1 : 0) + (state.feedbackMode !== 'off' ? 1 : 0)
      const failedAnswers = run !== null ? run.answers.filter((answer) => answer.error !== '').length : 0
      const resumedMode = run === null
        ? ''
        : run.resumed === 'silent' || run.resumed === 'wake'
          ? run.resumed
          : store.state.feedbackRunId === `${run.id}:silent`
            ? 'silent'
            : store.state.feedbackRunId === `${run.id}:wake` ? 'wake' : ''

      const optionToggle = (field, label) => h('label', { className: 'dsc-toggle', key: field },
        h('input', {
          type: 'checkbox',
          checked: state[field] === true,
          onChange: () => {
            const patch = {}
            patch[field] = store.state[field] !== true
            store.publish(patch)
            persist()
          },
        }),
        h('span', null, t(label)),
      )

      const feedbackOption = (mode, label) => h('label', { className: 'dsc-toggle', key: mode },
        h('input', {
          type: 'radio',
          name: 'council-feedback',
          checked: state.feedbackMode === mode,
          onChange: () => {
            store.publish({ feedbackMode: mode })
            persist()
          },
        }),
        h('span', null, t(label)),
      )

      return h('div', { className: 'dsc-tab' },
        h('div', { className: 'dsc-tab-inner' },
          h('div', { className: 'dsc-tab-head' },
            h('span', { className: 'dsc-chip-icon', 'aria-hidden': true }, '⚖'),
            h('span', { className: 'dsc-tab-title' }, t('panel.title')),
          ),
          h('div', { className: 'dsc-panel-body' },
            h('label', { className: 'dsc-field' },
              h('span', { className: 'dsc-field-label' }, t('panel.question')),
              h('textarea', {
                className: 'dsc-textarea',
                rows: 3,
                value: state.question,
                placeholder: t('panel.questionPlaceholder'),
                onChange: (event) => store.publish({ question: event.target.value }),
              }),
            ),
            h('div', { className: 'dsc-field' },
              h('span', { className: 'dsc-field-label' }, t('panel.options')),
              h('div', { className: 'dsc-toggles' },
                optionToggle('useContext', 'panel.optContext'),
                optionToggle('attachFiles', 'panel.optFiles'),
                optionToggle('useSubagentSeats', 'panel.optSeats'),
                optionToggle('useChairman', 'panel.optChairman'),
              ),
              h('div', { className: 'dsc-hint' }, t('panel.workspace', {
                path: state.workspace !== null && typeof state.workspace === 'object'
                  ? (typeof state.workspace.name === 'string' && state.workspace.name !== ''
                      ? state.workspace.name
                      : String(state.workspace.cwd || '?'))
                  : '…',
              })),
              h('div', { className: 'dsc-hint' }, t('panel.privacy', { chars: state.contextMaxChars })),
              h('div', { className: 'dsc-hint' }, t('panel.filesHint', { chars: state.filesMaxChars })),
              h('div', { className: 'dsc-hint' }, t('panel.seatsHint')),
            ),
            h('div', { className: 'dsc-field' },
              h('span', { className: 'dsc-field-label' }, t('panel.feedbackMode')),
              h('div', { className: 'dsc-toggles' },
                feedbackOption('off', 'panel.feedbackOff'),
                feedbackOption('silent', 'panel.feedbackSilent'),
                feedbackOption('wake', 'panel.feedbackWake'),
              ),
              h('div', { className: 'dsc-hint' }, t('panel.feedbackHint')),
            ),
            h('div', { className: 'dsc-field' },
              h('span', { className: 'dsc-field-label' }, t('panel.models', { count: state.selected.length })),
              state.loading
                ? h('span', { className: 'dsc-hint' }, t('bar.loading'))
                : state.loadError !== ''
                  ? h('div', { className: 'dsc-error-box' }, state.loadError)
                  : h(ModelOptions, { catalog: state.catalog, selected: state.selected }),
            ),
            state.useChairman
              ? h('div', { className: 'dsc-field' },
                  h('span', { className: 'dsc-field-label' }, t('panel.chairmanPick')),
                  h('select', {
                    className: 'dsc-select',
                    value: state.chairmanKey,
                    disabled: state.selected.length === 0,
                    onChange: (event) => store.publish({ chairmanKey: event.target.value }),
                  },
                    state.selected.map((key) => {
                      const row = state.catalog.find((item) => item.key === key)
                      if (row === undefined) return null
                      return h('option', { key, value: key }, row.name)
                    }),
                  ),
                )
              : null,
            state.error !== ''
              ? h('div', { className: 'dsc-error-box' }, state.error)
              : null,
            h('div', { className: 'dsc-actions' },
              h('span', { className: 'dsc-hint' }, t('panel.cost', { count: estimatedCalls })),
              h('button', {
                type: 'button',
                className: 'dsc-primary',
                disabled: state.running,
                onClick: () => void startRun(),
              }, state.running ? t('panel.running') : t('panel.run')),
              state.running
                ? h('button', {
                    type: 'button',
                    className: 'dsc-secondary',
                    onClick: () => void cancelRun(),
                  }, t('panel.cancel'))
                : null,
              run !== null && run.status === 'done'
                ? h('button', {
                    type: 'button',
                    className: 'dsc-secondary',
                    onClick: () => {
                      void copyConclusion().then((ok) => setCopied(ok))
                    },
                  }, copied ? t('panel.copied') : t('panel.copy'))
                : null,
            ),
            run === null
              ? null
              : h('div', { className: 'dsc-results' },
                  h('div', { className: 'dsc-stage' },
                    state.running ? h('span', { className: 'dsc-spinner', 'aria-hidden': true }) : null,
                    h('span', null, t('panel.stage', { stage: stageName })),
                    run.status === 'error'
                      ? h('span', { className: 'dsc-error' }, run.error)
                      : null,
                    run.status === 'done' && failedAnswers > 0
                      ? h('span', { className: 'dsc-warn' }, t('panel.partialFailure', { failed: failedAnswers, total: run.answers.length }))
                      : null,
                    run.contextState === 'unavailable'
                      ? h('span', { className: 'dsc-warn' }, t('panel.contextUnavailable'))
                      : null,
                    run.filesState === 'ok' && run.filesChars > 0
                      ? h('span', { className: 'dsc-note' }, t('panel.filesAttached', {
                          count: Array.isArray(run.filesPaths) ? run.filesPaths.length : 0,
                          chars: run.filesChars,
                        }))
                      : null,
                    run.seatMode === 'subagent'
                      ? h('span', { className: 'dsc-note' }, t('panel.seatModeSub'))
                      : state.useSubagentSeats !== false
                        ? h('span', { className: 'dsc-warn' }, t('panel.seatModeFallback'))
                        : null,
                    run.status === 'done' && resumedMode !== ''
                      ? h('span', { className: 'dsc-note' },
                          resumedMode === 'silent' ? t('panel.feedbackSilentSent') : t('panel.feedbackWakeSent'))
                      : null,
                  ),
                  h('div', { className: 'dsc-grid' },
                    run.answers.map((answer) => h('div', { className: 'dsc-card', key: answer.key },
                      h('div', { className: 'dsc-card-head' },
                        h('span', { className: 'dsc-card-title', title: answer.model }, answer.name),
                        h('span', { className: 'dsc-badge' },
                          answer.error !== '' ? t('status.error') : answer.done
                            ? (answer.seat !== null && typeof answer.seat === 'object' && answer.seat.fallback === true
                                ? t('status.fallback')
                                : t('status.done'))
                            : seatStatusText(answer.seat)),
                      ),
                      answer.error !== ''
                        ? h('div', { className: 'dsc-error-box' }, answer.error)
                        : h('div', { className: 'dsc-card-text' }, answer.text !== '' ? answer.text : '…'),
                    )),
                  ),
                  run.reviews.length > 0
                    ? h('div', { className: 'dsc-section' },
                        h('div', { className: 'dsc-section-title' }, t('panel.reviews')),
                        h('div', { className: 'dsc-grid dsc-grid-small' },
                          run.reviews.map((review) => h('div', { className: 'dsc-card', key: review.key },
                            h('div', { className: 'dsc-card-head' },
                              h('span', { className: 'dsc-card-title' }, review.reviewer),
                              h('span', { className: 'dsc-badge' },
                                review.error !== '' ? t('status.error') : review.done ? t('status.done') : seatStatusText(review.seat)),
                            ),
                            review.error !== ''
                              ? h('div', { className: 'dsc-error-box' }, review.error)
                              : h('div', { className: 'dsc-card-text' }, review.text !== '' ? review.text : '…'),
                          )),
                        ),
                      )
                    : null,
                  run.chairman.text !== '' || run.chairman.done
                    ? h('div', { className: 'dsc-section' },
                        h('div', { className: 'dsc-section-title' }, t('panel.chairman', { name: run.chairman.name })),
                        run.chairman.error !== ''
                          ? h('div', { className: 'dsc-error-box' }, run.chairman.error)
                          : h('div', { className: 'dsc-chairman' }, run.chairman.text !== '' ? run.chairman.text : '…'),
                      )
                    : null,
                ),
          ),
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Plugin                                                              *
     * ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        hostCtx = ctx
        const previous = window.__dshCouncilTeardown
        if (typeof previous === 'function') {
          try {
            previous()
          } catch {
            /* a stale instance is best effort */
          }
        }
        const disposers = []
        let retired = false
        const track = (dispose) => {
          if (typeof dispose === 'function') disposers.push(dispose)
          return dispose
        }
        const teardown = () => {
          if (retired) return
          retired = true
          stopPolling()
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch {
              /* keep tearing down the rest */
            }
          }
          disposers.length = 0
          if (window.__dshCouncilTeardown === teardown) delete window.__dshCouncilTeardown
        }
        window.__dshCouncilTeardown = teardown
        ctx.effect(() => teardown, 'council: instance')

        track(ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'council: dictionaries'))
        tr = ctx.locale.bind(NS)

        track(ctx.effect(() => {
          const styleId = '@local/council/panel.css'
          let tag = document.querySelector(`style[data-plugin-css="${styleId}"]`)
          const created = tag === null
          if (created) {
            tag = document.createElement('style')
            tag.dataset.plugin = '@local/council'
            tag.dataset.pluginCss = styleId
            tag.textContent = CSS
            document.head.appendChild(tag)
          }
          return () => {
            if (created) tag.remove()
          }
        }, 'council: styles'))

        track(ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'council-bridge',
            order: 90,
            locale: NS,
          }, CouncilBridge)))

        track(ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: TAB_ID,
            locale: NS,
          }, CouncilTab)))

        track(ctx.inject(['uiConversation'], (scope) => {
          const conversation = scope.uiConversation
          const interactions = conversation === null || conversation === undefined ? undefined : conversation.interactions
          if (interactions === undefined || interactions === null || typeof interactions.register !== 'function') return
          scope.effect(() => interactions.register({
            id: 'council',
            onInteraction(request) {
              const text = request.readText()
              if (text === null || text.trim() === '') return
              /* Right-click owns the menu; the left-select pill belongs to the
                 shipped quote interaction, which registers first and wins. */
              if (request.trigger === 'contextmenu') request.preventDefault()
              request.open()
            },
          }), 'council: text interaction')
        }))

        track(ctx.slots.inject('conversation.chat.text-interaction', () =>
          ctx.slots.register({
            name: 'conversation.chat.text-interaction',
            key: 'council',
            locale: NS,
          }, CouncilSelectionMenu)))

        track(ctx.inject(['sidebarRightTabs'], (scope) => {
          const tabs = scope.get('sidebarRightTabs')
          if (tabs === undefined) return
          scope.effect(() => tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => tr('tab.title'),
          }), 'council: sidebar tab type')
        }))

        track(ctx.inject(['commandUi'], (scope) => {
          scope.effect(() => scope.commandUi.register({
            name: 'council',
            label: () => tr('command.label'),
            description: () => tr('command.description'),
            icon: CouncilIcon,
            available: () => true,
            ui: {
              kind: 'action',
              run: (session) => {
                void openCouncilTab({
                  question: draftQuestion(),
                  sessionId: session === undefined || session === null ? undefined : session.sessionId,
                })
              },
            },
          }), 'council: /council command')
        }))

        /* Bridge for the quick-quote selection pill's council button; it ships
           in a separate local plugin. Feature detection plus an apiVersion is
           the contract: a missing or incompatible consumer must never fail
           silently on the sending side. */
        const reviewBridge = {
          apiVersion: REVIEW_API_VERSION,
          review(detail) {
            if (detail === null || typeof detail !== 'object') return false
            if (detail.apiVersion !== undefined && detail.apiVersion !== REVIEW_API_VERSION) {
              console.warn('[council] review bridge version mismatch', detail.apiVersion)
              store.publish({ error: tr('error.bridgeVersion') })
              return false
            }
            const text = typeof detail.text === 'string' ? detail.text.trim() : ''
            if (text === '') return false
            void openCouncilTab({
              question: `${tr('selection.prefix')}\n\n${text}`,
              sessionId: typeof detail.sessionId === 'string' ? detail.sessionId : undefined,
            })
            return true
          },
        }
        track(ctx.effect(() => {
          window.__dshCouncil = reviewBridge
          const onReview = (event) => {
            const detail = event !== null && typeof event === 'object'
              && event.detail !== null && typeof event.detail === 'object' ? event.detail : undefined
            if (detail === undefined) return
            if (detail.apiVersion !== REVIEW_API_VERSION) {
              console.warn('[council] ignoring review event with unsupported apiVersion', detail.apiVersion)
              store.publish({ error: tr('error.bridgeVersion') })
              return
            }
            reviewBridge.review(detail)
          }
          window.addEventListener('dsh-council:review', onReview)
          return () => {
            window.removeEventListener('dsh-council:review', onReview)
            if (window.__dshCouncil === reviewBridge) delete window.__dshCouncil
          }
        }, 'council: quick-quote bridge'))

        void loadModels()
      },
    }
  },
})
