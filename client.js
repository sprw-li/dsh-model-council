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
      'panel.cancel': '停止',
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
      'panel.seatsHint': '开启后前 N 个委员是只读子代理（可读文件/搜索/加载 skill），其余走快速流式通道；关闭则全部纯模型。子代理席位整轮结束才出正文。',
      'panel.seatSplit': 'subagent 席位数：{count}（其余为快速席位）',
      'panel.seatModeSub': '本次使用只读 subagent 席位',
      'panel.seatModeHybrid': '席位：{sub} 个只读 subagent + {fast} 个快速',
      'panel.seatModeFallback': 'subagent 席位不可用，本次退回纯模型调用',
      'panel.filesHint': '问题中出现的本地路径（如 D:\\dev\\项目）会自动读取目录树和关键文件，最多 {chars} 字；没写路径但提到工作区/项目时用当前会话工作区；跳过 .git/node_modules/密钥文件。注意：这些文件内容会随问题一起发送给所选模型提供商。',
      'panel.workspace': '当前会话工作区：{path}',
      'panel.filesAttached': '已附带 {count} 个路径的文件内容（{chars} 字）',
      'panel.codeAttached': '已附带源码 {count} 个文件（{chars} 字）',
      'panel.preview': '预览附件',
      'panel.previewing': '正在预览…',
      'panel.previewTitle': '出站清单（以下内容会发送给所选模型提供商）',
      'panel.previewWorkspace': '工作区：{name}',
      'panel.previewFiles': '将附带 {count} 个文件（{chars} 字）',
      'panel.previewFilesNone': '没有要附带的问题路径，也不使用工作区路径：本次不附带文件',
      'panel.previewFilesPaths': '文件：',
      'panel.previewCode': '源码包：附带 {files} 个文件（{chars} 字）；发现 {discovered} 个，截断 {truncated} 个',
      'panel.previewCodeOff': '源码包：本次不附带',
      'panel.previewRedactions': '已脱敏 {count} 处，这些位置对本次评审不可见：',
      'panel.previewRedaction': '{path}（{patterns}）',
      'panel.previewNote': '说明：{note}',
      'panel.previewFailed': '预览失败：{message}',
      'panel.previewStale': '问题或会话已改动，确认已失效，请重新预览',
      'panel.confirmRun': '确认并开始评审',
      'panel.optFeedback': '结果回投主聊天',
      'panel.optChairman': '主席汇总（关闭=无主）',
      'panel.feedbackSent': '已回投主聊天',
      'panel.feedbackMode': '结果回投',
      'panel.feedbackOff': '不做（只留在右侧栏）',
      'panel.feedbackSilent': '静默放进上下文',
      'panel.feedbackWake': '直接唤醒主聊天',
      'panel.feedbackHint': '静默用 agent.inject()：结论作为上下文在下一次请求前注入，不占用队列、不唤醒主 Agent；唤醒用 followup，立即让主 Agent 回复。',
      'panel.feedbackSilentSent': '已静默放进上下文（不排队）',
      'panel.feedbackWakeSent': '已唤醒主聊天',
      /* A follower tab does not POST the conclusion; the leader does. */
      'panel.feedbackOtherTab': '结论由另一个标签页回投（本页不重复提交）',
      /* A tool-originated run already handed the conclusion to the caller as
         its `tool/result`, so the panel intentionally skips the post-back. */
      'feedback.toolDelivered': '结论已作为工具结果交回调用方，未回投（/council 发起的运行仍按设置回投）',
      /* The configured chairman was not among the participants and the Host
         fell back to another seat; `problem` is the Host's own reason text. */
      'chairman.fallback': '配置的主席不在参与者名单，已回退：{problem}',
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
      'overlay.title': '理事会运行',
      'overlay.running': '运行中',
      'overlay.starting': '正在启动',
      'overlay.hide': '隐藏浮窗',
      /* In-conversation card for the agent-issued council_review tool call. */
      'toolview.preparing': '正在准备理事会评审…',
      'toolview.title': '理事会评审',
      'toolview.question': '问题',
      'toolview.showFull': '展开全文',
      'toolview.showLess': '收起',
      'toolview.models': '参与模型（{count} 个）',
      /* Where the roster came from, from the run snapshot's `modelSource`:
         saved defaultModels vs the tool's own `models` argument. Without the
         snapshot the card keeps its previous wording (see modelsAuto). */
      'toolview.modelsFromSettings': '参与模型：来自设置（{count} 个）',
      'toolview.modelsFromArgs': '参与模型：来自工具参数（{count} 个）',
      'toolview.modelsAuto': '参与模型：由 Host 自动挑选',
      'toolview.chairmanOn': '主席汇总：开',
      'toolview.chairmanOff': '主席汇总：关',
      'toolview.attachOn': '将附带工作区文件',
      'toolview.attachOff': '不附带文件',
      'toolview.progress': '实时进度：{stage}',
      'toolview.seatCount': '{done}/{total} 个席位完成',
      'toolview.seatRunning': '运行中',
      'toolview.seatDone': '完成',
      'toolview.seatFailed': '失败',
      'toolview.failedSeats': '{failed}/{total} 个席位失败',
      'toolview.result': '评审结论',
      'toolview.error': '评审失败',
      'toolview.noText': '（没有可显示的文本输出）',
      /* Expandable seat detail (card + floating card). The Host ships only the
         TAIL of the reasoning chain, so the window is always labelled instead
         of being passed off as the whole chain. */
      'seat.reasoning': '思考',
      'seat.answer': '正文',
      'seat.reviewer': '评审员',
      'seat.chairman': '主席',
      'seat.chars': '共 {count} 字',
      'seat.window': '仅显示最近 {shown} 字（共 {total} 字）',
      'seat.thinking': '思考中…',
      'seat.waitingToken': '等待首个 token…（推理模型首 token 可能超过 200 秒）',
      'seat.stageWaiting': '等待该阶段的实时内容…',
      'seat.expand': '展开该席位的实时思考与正文',
      'seat.collapse': '收起该席位的实时思考与正文',
      'settings.title': '理事会',
      'settings.toolEnabled': '启用内置工具 council_review',
      'settings.toolEnabledHint': '这是 agent 侧入口：关闭后模型调用 council_review 会被拒绝，并在工具结果里说明原因。',
      'settings.panelEnabled': '启用 /council 面板入口',
      'settings.panelEnabledHint': '这是用户侧入口：关闭后侧栏面板与 /council 无法发起、恢复或取消评审（只读查询仍然可用）。',
      'settings.models': '默认模型',
      'settings.modelsHint': '留空则沿用自动挑选（同一 provider、模型名互不相同、最多 3 个）。列表来自当前可用模型目录，模型下线后会在此标出。',
      'settings.chairman': '默认主席',
      'settings.chairmanAuto': '自动',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.saveFailed': '保存未生效（可能被更新的一版覆盖）',
      'settings.unavailable': '已保存但当前不可用的模型：{list}',
      'settings.noForm': '当前客户端没有提供设置表单接口（configForms），无法在这里修改配置。',
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
      'metrics.total': '总 {total}',
      'metrics.both': '首字 {ttft} · 总 {total}',
      'metrics.hint': '首字 = 从发起到第一个字符的耗时；总 = 该席位总耗时',
      /* Why a run takes so long, straight from the Host snapshot fields
         `providerWaves` / `budgetPlan`. Every one of these strings is rendered
         ONLY when the field it describes is present, so an old Host (or an old
         persisted run) keeps its previous copy instead of a guess. */
      'plan.waves': '预计每阶段 {waves} 波（{over}）',
      'plan.wavesPlain': '预计每阶段 {waves} 波',
      'plan.overProvider': '{provider} {seats} 席 > 槽位 {slots}',
      'plan.overSep': '、',
      'plan.sep': '｜',
      'plan.budget': '预算分配：{answers} {answersShare}% / {reviews} {reviewsShare}% / {chairman} {chairmanShare}%',
      'plan.budgetSpent': '预算分配：{answers} {answersShare}% / {reviews} {reviewsShare}% / {chairman} {chairmanShare}%（已用 {spent} / {total}）',
      /* A run that settled through a graceful degradation must say so out
         loud: a skipped chairman stage otherwise looks exactly like a normal
         finish. Known Host tokens are localized; an unknown token is shown
         verbatim rather than replaced by an invented reason. */
      'stop.chairmanSkipped': '主席阶段预算不足，已跳过：本轮没有主席汇总（结论按无主席模式给出）',
      'stop.watchdog': '整轮超时收尾',
      'stop.cancelled': '调用方取消收尾',
      'stop.stageError': '阶段失败收尾',
      'stop.generic': '非正常收尾（{reason}）',
      'stop.hostReason': 'Host 原因：{reason}',
      'seat.activity.step': '思考中',
      'seat.activity.tool': '调用工具',
      'seat.activity.result': '工具返回',
      'seat.activity.reply': '生成回复',
      'seat.activity.start': '开始',
      'seat.activity.end': '收尾',
      'seat.activity.retry': '重试中',
      'seat.activity.waiting': '等待响应',
      'seat.subagentWaiting': 'subagent 席位运行中，完成后出正文',
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
      'panel.cancel': 'Stop',
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
      'panel.seatsHint': 'With seats on, the first N members are read-only subagents (files/search/skills); the rest take the fast streaming path. Off = all raw model calls. Subagent seats emit text only when a turn finishes.',
      'panel.seatSplit': 'subagent seats: {count} (the rest are fast seats)',
      'panel.seatModeSub': 'Used read-only subagent seats',
      'panel.seatModeHybrid': 'Seats: {sub} read-only subagent + {fast} fast',
      'panel.seatModeFallback': 'Subagent seats unavailable; fell back to raw model calls',
      'panel.filesHint': 'Local paths in the question (e.g. D:\\dev\\project) attach their directory tree and key files, up to {chars} characters; a workspace/project question without a path uses the session workspace; .git/node_modules/secret files are skipped. Those file contents are sent to the selected model providers.',
      'panel.workspace': 'Session workspace: {path}',
      'panel.filesAttached': 'Attached {count} path(s), {chars} characters',
      'panel.codeAttached': 'Attached {count} source file(s), {chars} characters',
      'panel.preview': 'Preview attachments',
      'panel.previewing': 'Previewing…',
      'panel.previewTitle': 'Outbound manifest (this is what is sent to the selected providers)',
      'panel.previewWorkspace': 'Workspace: {name}',
      'panel.previewFiles': 'Attaches {count} file(s) ({chars} chars)',
      'panel.previewFilesNone': 'No question paths and no workspace paths: no files are attached',
      'panel.previewFilesPaths': 'Files:',
      'panel.previewCode': 'Source pack: {files} file(s) ({chars} chars); {discovered} discovered, {truncated} truncated',
      'panel.previewCodeOff': 'Source pack: not attached',
      'panel.previewRedactions': '{count} redaction(s); these locations are invisible to this review:',
      'panel.previewRedaction': '{path} ({patterns})',
      'panel.previewNote': 'Note: {note}',
      'panel.previewFailed': 'Preview failed: {message}',
      'panel.previewStale': 'The question or session changed; the confirmation expired — preview again',
      'panel.confirmRun': 'Confirm and run',
      'panel.optFeedback': 'Post the result back to the chat',
      'panel.optChairman': 'Chairman synthesis (off = no chair)',
      'panel.feedbackSent': 'Posted back to the chat',
      'panel.feedbackMode': 'Result delivery',
      'panel.feedbackOff': 'Off (sidebar only)',
      'panel.feedbackSilent': 'Silent inject into the chat',
      'panel.feedbackWake': 'Wake the chat agent',
      'panel.feedbackHint': 'Silent inject does not wake the main Agent; the conclusion becomes context at the next turn. Wake starts a follow-up turn now.',
      'panel.feedbackSilentSent': 'Placed into context (not queued)',
      'panel.feedbackWakeSent': 'Posted and woke the main Agent',
      'panel.feedbackOtherTab': 'Another tab posted the conclusion (not re-sent here)',
      'feedback.toolDelivered': 'The conclusion went back to the caller as the tool result, so it was not posted back (/council runs still follow the setting)',
      'chairman.fallback': 'The configured chairman is not among the participants; fell back: {problem}',
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
      'overlay.title': 'Council run',
      'overlay.running': 'Running',
      'overlay.starting': 'Starting',
      'overlay.hide': 'Hide overlay',
      /* In-conversation card for the agent-issued council_review tool call. */
      'toolview.preparing': 'Preparing the council review…',
      'toolview.title': 'Council review',
      'toolview.question': 'Question',
      'toolview.showFull': 'Show full question',
      'toolview.showLess': 'Collapse',
      'toolview.models': 'Participants ({count})',
      'toolview.modelsFromSettings': 'Participants: from settings ({count})',
      'toolview.modelsFromArgs': 'Participants: from tool arguments ({count})',
      'toolview.modelsAuto': 'Participants: chosen automatically by the Host',
      'toolview.chairmanOn': 'Chairman synthesis: on',
      'toolview.chairmanOff': 'Chairman synthesis: off',
      'toolview.attachOn': 'Attaches workspace files',
      'toolview.attachOff': 'No files attached',
      'toolview.progress': 'Live progress: {stage}',
      'toolview.seatCount': '{done}/{total} seats done',
      'toolview.seatRunning': 'Running',
      'toolview.seatDone': 'Done',
      'toolview.seatFailed': 'Failed',
      'toolview.failedSeats': '{failed}/{total} seats failed',
      'toolview.result': 'Conclusion',
      'toolview.error': 'Council review failed',
      'toolview.noText': '(No text output to show)',
      /* The reasoning window is the tail of the chain, never the whole chain. */
      'seat.reasoning': 'Reasoning',
      'seat.answer': 'Answer',
      'seat.reviewer': 'Reviewer',
      'seat.chairman': 'Chairman',
      'seat.chars': '{count} chars',
      'seat.window': 'Latest {shown} of {total} chars only',
      'seat.thinking': 'Thinking…',
      'seat.waitingToken': 'Waiting for the first token… (a reasoning model can take over 200s)',
      'seat.stageWaiting': 'Waiting for this stage to stream…',
      'seat.expand': "Show this seat's live reasoning and answer",
      'seat.collapse': "Hide this seat's live reasoning and answer",
      'settings.title': 'Council',
      'settings.toolEnabled': 'Enable the built-in council_review tool',
      'settings.toolEnabledHint': 'The agent-facing entry: when disabled, a model calling council_review is refused with the reason in the tool result.',
      'settings.panelEnabled': 'Enable the /council panel entry',
      'settings.panelEnabledHint': 'The user-facing entry: when disabled, the sidebar panel and /council cannot start, resume, or cancel a review (read-only queries still work).',
      'settings.models': 'Default models',
      'settings.modelsHint': 'Leave empty to keep automatic picking (one provider, distinct model names, at most three). Choices come from the live catalog; a model that went away is called out below.',
      'settings.chairman': 'Default chairman',
      'settings.chairmanAuto': 'Automatic',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.saveFailed': 'Save did not land (a newer revision may have superseded it)',
      'settings.unavailable': 'Saved but currently unavailable: {list}',
      'settings.noForm': 'This client does not expose the configuration form API (configForms), so the settings cannot be edited here.',
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
      'metrics.total': 'total {total}',
      'metrics.both': 'TTFT {ttft} · total {total}',
      'metrics.hint': 'TTFT = time from dispatch to the first character; total = this seat\'s full duration',
      /* The same plan/degradation copy as the Chinese dictionary: rendered only
         when the Host snapshot actually carries the field. */
      'plan.waves': 'About {waves} wave(s) per stage ({over})',
      'plan.wavesPlain': 'About {waves} wave(s) per stage',
      'plan.overProvider': '{provider} {seats} seats > {slots} slots',
      'plan.overSep': ', ',
      'plan.sep': ' | ',
      'plan.budget': 'Budget: {answers} {answersShare}% / {reviews} {reviewsShare}% / {chairman} {chairmanShare}%',
      'plan.budgetSpent': 'Budget: {answers} {answersShare}% / {reviews} {reviewsShare}% / {chairman} {chairmanShare}% (used {spent} of {total})',
      'stop.chairmanSkipped': 'The chairman stage ran out of budget and was skipped: this run has no chairman synthesis (the conclusion follows the no-chairman path)',
      'stop.watchdog': 'Settled by the whole-run timeout',
      'stop.cancelled': 'Settled after a caller cancel',
      'stop.stageError': 'Settled by a stage failure',
      'stop.generic': 'Settled off the normal path ({reason})',
      'stop.hostReason': 'Host reason: {reason}',
      'seat.activity.step': 'Thinking',
      'seat.activity.tool': 'Using tools',
      'seat.activity.result': 'Tool returned',
      'seat.activity.reply': 'Writing',
      'seat.activity.start': 'Started',
      'seat.activity.end': 'Finishing',
      'seat.activity.retry': 'Retrying',
      'seat.activity.waiting': 'waiting for model',
      'seat.subagentWaiting': 'subagent seat is running; the answer appears when its turn finishes',
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
/* Cordis entry id of this plugin (see cordis.patch.yml). The settings page
   binds the Host-backed configuration form through `ctx.configForms.get`. */
const CONFIG_ENTRY_ID = 'council'
/* How often the leader looks for a run this tab did not start. An agent-issued
   `council_review` creates a Host run with no client involvement, so without
   discovery the floating status card stays empty until the tab is opened. */
const RUN_DISCOVERY_MS = 4000
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
/* Plan + degradation copy. The plan line answers "why is this slow"; the
   degradation line must be able to stop a settled run from reading as a clean
   finish, so it gets a rule of its own instead of the muted hint styling. */
.dsc-plan{display:flex;flex-wrap:wrap;gap:2px 10px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;word-break:break-word}
.dsc-degraded{padding:4px 7px;border-left:3px solid var(--dsw-alias-state-warning-primary,var(--dsw-alias-brand-primary));border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.55;word-break:break-word}
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
.dsc-manifest{display:flex;flex-direction:column;gap:6px;padding:9px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:1.55;color:var(--dsw-alias-label-primary)}
.dsc-manifest-title{font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsc-manifest-list{margin:0;padding-left:18px;font-size:11px;word-break:break-all;color:var(--dsw-alias-label-secondary)}
.dsc-manifest-redact{padding:6px 8px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:1.6;word-break:break-all}
.dsc-manifest-note{font-size:11px;font-style:italic;color:var(--dsw-alias-label-tertiary)}
.dsc-manifest-stale{font-size:11px;color:var(--dsw-alias-state-error-primary)}
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
/* Floating run status. Portal-rendered, so it owns its own stacking. */
.dsc-float{position:fixed;right:16px;bottom:96px;z-index:2147483000;width:min(330px,calc(100vw - 32px));display:flex;flex-direction:column;gap:7px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-primary,#fff);box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:12px}
.dsc-float-head{display:flex;align-items:center;gap:8px}
.dsc-float-title{font-weight:600}
.dsc-float-stage{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.dsc-float-count{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsc-float-btn{flex:none;width:18px;height:18px;line-height:1;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsc-float-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsc-float-q{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.dsc-float-seats{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto}
.dsc-float-seat{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsc-float-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-secondary)}
.dsc-float-dot.is-live{background:var(--dsw-alias-brand-primary);animation:dsc-pulse 1.2s ease-in-out infinite}
.dsc-float-dot.is-done{background:var(--dsw-alias-state-success,#2e7d32)}
.dsc-float-dot.is-error{background:var(--dsw-alias-state-error,#c62828)}
@keyframes dsc-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.dsc-float-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-float-state{flex:none;color:var(--dsw-alias-label-secondary)}
.dsc-float-error{color:var(--dsw-alias-state-error,#c62828);word-break:break-word}
/* Settings page */
.dsc-settings{display:flex;flex-direction:column;gap:8px;max-width:720px}
.dsc-settings-row{display:flex;align-items:center;gap:8px}
.dsc-settings-hint{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsc-settings-label{margin-top:6px;font-size:12px;font-weight:600}
.dsc-settings-group{display:flex;flex-direction:column;gap:4px}
.dsc-settings-group-name{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsc-settings-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:4px 10px}
.dsc-settings-cell{display:flex;align-items:center;gap:6px;min-width:0}
.dsc-settings-cell span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-settings-select{max-width:340px;padding:4px 6px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-primary,#fff);color:inherit}
.dsc-settings-actions{display:flex;align-items:center;gap:10px;margin-top:6px}
.dsc-tool{display:flex;flex-direction:column;gap:5px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsc-tool-head{display:flex;align-items:center;gap:6px}
.dsc-tool-icon{font-size:13px;line-height:1}
.dsc-tool-title{font-weight:600}
.dsc-tool-toggle{align-self:flex-start;padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-size:11px;cursor:pointer}
.dsc-tool-q{white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}
.dsc-tool-chips{display:flex;flex-wrap:wrap;gap:4px}
.dsc-tool-chip{padding:1px 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.dsc-tool-meta{display:flex;flex-wrap:wrap;gap:10px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsc-tool-live{display:flex;flex-direction:column;gap:4px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l1)}
.dsc-tool-live-head{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary)}
.dsc-tool-count{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsc-tool-seats{display:flex;flex-direction:column;gap:4px}
.dsc-tool-seat{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsc-tool-seat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsc-tool-seat-state{flex:none;color:var(--dsw-alias-label-secondary)}
.dsc-tool-text{max-height:240px;overflow:auto;white-space:pre-wrap;word-break:break-word}
/* Expandable seat row + live detail, shared by the card and the floating one.
   Collapsed rows render one line only; the 4000-char reasoning window exists
   in the DOM only while its row is open. */
.dsc-seat-row{display:flex;align-items:center;gap:6px;width:100%;min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.dsc-seat-row:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px;border-radius:var(--dsw-radius-sm)}
.dsc-seat-caret{flex:none;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1}
.dsc-seat-role{flex:none;padding:0 5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:10px;line-height:15px}
.dsc-seat-detail{display:flex;flex-direction:column;gap:5px;padding:3px 0 2px}
.dsc-seat-part-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;min-width:0}
.dsc-seat-part{font-size:11px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsc-seat-chars{font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsc-seat-window{font-size:11px;font-style:italic;color:var(--dsw-alias-label-tertiary)}
.dsc-seat-body{max-height:220px;overflow:auto;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.dsc-seat-phase{font-size:11px;color:var(--dsw-alias-brand-primary)}
.dsc-seat-waiting{font-size:11px;color:var(--dsw-alias-label-tertiary)}
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
        useSubagentSeats: persisted.useSubagentSeats === true,
        seatSplit: Number.isSafeInteger(persisted.seatSplit) && persisted.seatSplit >= 1 && persisted.seatSplit <= 5
          ? persisted.seatSplit
          : 2,
        /* Legacy migration: the 1.x boolean `useFeedback` used to become
           'wake', which pushes a follow-up turn onto the main agent's queue and
           wakes it. A user who never touched the panel therefore kept getting a
           new chat turn spliced in after every finished run. The old flag now
           maps to 'silent' (context only: no queue entry, no wake), which is
           what the panel's own "静默放进上下文" option does. */
        feedbackMode: persisted.feedbackMode === 'silent' || persisted.feedbackMode === 'wake'
          ? persisted.feedbackMode
          : persisted.useFeedback === true ? 'silent' : 'off',
        useChairman: persisted.useChairman !== false,
        sessionId: '',
        feedbackRunId: '',
        /* '' | 'another-tab' — why this tab did not deliver the conclusion. */
        feedbackNote: '',
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
        /* Outbound manifest preview. `previewKey` names the exact
           (session, question) the preview was taken for, so a changed question
           or session silently drops the confirmation (fail closed) instead of
           degrading into a permanent one-time grant. */
        preview: null,
        previewKey: '',
        previewError: '',
        previewLoading: false,
        /* Which seat row is expanded on each surface that shows seats. View
           state only: a row click publishes one of these strings so the
           existing subscription repaints the surface, and no run field is
           read or written. The two surfaces keep separate fields because
           opening a seat in the card must not move the floating card. */
        seatOpenCard: '',
        seatOpenFloat: '',
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
          seatSplit: store.state.seatSplit,
          feedbackMode: store.state.feedbackMode,
          useChairman: store.state.useChairman,
        }))
      } catch {
        /* storage is best effort */
      }
    }

    /** Shallow compare of two selected values, one level deep. */
    function sameSelection(a, b) {
      if (a === b) return true
      if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
      const left = Object.keys(a)
      const right = Object.keys(b)
      if (left.length !== right.length) return false
      for (const key of left) {
        if (a[key] !== b[key]) return false
      }
      return true
    }

    /**
     * Subscribe one component to the store. A publish that leaves the selected
     * slice untouched does not re-render, so the sidebar is not redrawn for
     * every unrelated store write.
     */
    function useStore(selector) {
      const [, force] = React.useState(0)
      const box = React.useRef({ selected: undefined, ready: false, selector })
      box.current.selector = selector
      const selected = selector(store.state)
      if (box.current.ready !== true) {
        box.current.selected = selected
        box.current.ready = true
      }
      React.useEffect(() => {
        box.current.selected = selected
        return store.subscribe(() => {
          const next = box.current.selector(store.state)
          if (sameSelection(next, box.current.selected)) return
          box.current.selected = next
          force((value) => value + 1)
        })
      })
      return selected
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
      if (!response.ok) {
        const error = new Error(data && data.error ? String(data.error) : `HTTP ${response.status}`)
        /* Structured code + status travel with the error so callers never have
           to pattern-match a human-readable message (or guess which 409 it is). */
        error.status = response.status
        error.code = data !== null && typeof data === 'object' && typeof data.code === 'string' ? data.code : ''
        if (data !== null && typeof data === 'object' && typeof data.runId === 'string') error.runId = data.runId
        throw error
      }
      return data
    }

    /** Human-readable text of any thrown value. */
    function messageOf(error) {
      return String(error && error.message ? error.message : error)
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
    let eventSource = null
    let streamWatchdog = 0
    /* A half-open proxy can make the stream stall repeatedly. After a couple of
       stalls this run stays on polling instead of churning open→stall→open. */
    let streamStalls = 0
    /** No SSE frame for this long while running => the stream is half-open. */
    const STREAM_STALL_MS = 8000
    /* Follower stream rebuild. A follower owns no polling duty, so a stall or
       an error used to end its view for good: `stopEventStream()` left no
       channel behind and the card froze on its last snapshot. The stream is
       read-only, so rebuilding it is safe — but it must not become an
       open→fail→open churn. This is NOT the 0.2.16 idle loop: that one
       re-armed a 320ms timer that sent no HTTP at all, forever. Here every
       retry is one real SSE connection, the gap doubles up to 8s, and the
       per-run budget is capped, so a stream that never comes back costs at
       most STREAM_REBUILD_MAX connections and then stops. Any frame on a
       rebuilt stream (a beat included) clears the budget again. */
    const STREAM_REBUILD_MAX = 8
    const STREAM_REBUILD_BASE_MS = 1000
    const STREAM_REBUILD_MAX_DELAY_MS = 8000
    let streamRebuildTimer = 0
    let streamRebuilds = 0

    /** Preferred live channel: SSE with automatic fallback to 320ms polling. */
    function stopEventStream() {
      /* A stream stopped on purpose must not be re-opened behind our back. */
      cancelStreamRebuild()
      if (streamWatchdog !== 0) {
        window.clearTimeout(streamWatchdog)
        streamWatchdog = 0
      }
      if (eventSource !== null) {
        try {
          eventSource.close()
        } catch {
          /* best effort */
        }
        eventSource = null
      }
    }

    /** Drop a pending follower re-open: the stream was stopped deliberately. */
    function cancelStreamRebuild() {
      if (streamRebuildTimer !== 0) {
        window.clearTimeout(streamRebuildTimer)
        streamRebuildTimer = 0
      }
    }

    /**
     * A frame (state update or beat) proves the stream is alive, so a follower
     * that hits a later failure starts from a fresh rebuild budget. A pending
     * retry cannot be useful once a live frame arrived on the current stream.
     */
    function noteStreamFrame() {
      streamRebuilds = 0
      cancelStreamRebuild()
    }

    /**
     * Re-open a follower's stream after a stall or a transport error.
     *
     * Only the leader may convert a dead stream into polling, so a follower
     * that just dropped its stream had no channel left at all — that is the
     * frozen "0/5 running" card. Followers re-open the read-only stream
     * instead, behind an exponential backoff (1s→8s) and a per-run budget
     * (STREAM_REBUILD_MAX). The budget is the guard that keeps this from
     * degrading into a loop: a host that never answers costs a bounded number
     * of connection attempts, not an endless chain — which is exactly what the
     * old 320ms follower poll→watchRun→poll cycle was.
     */
    function scheduleStreamRebuild(runId) {
      if (isPollLeader() === true) return
      if (store.state.runId !== runId || store.state.running !== true) return
      if (streamRebuilds >= STREAM_REBUILD_MAX) return
      streamRebuilds += 1
      cancelStreamRebuild()
      const delay = Math.min(
        STREAM_REBUILD_MAX_DELAY_MS,
        STREAM_REBUILD_BASE_MS * Math.pow(2, streamRebuilds - 1),
      )
      streamRebuildTimer = window.setTimeout(() => {
        streamRebuildTimer = 0
        if (store.state.runId !== runId || store.state.running !== true) return
        /* The election may have handed this tab the lease while we waited. */
        if (isPollLeader() === true) {
          schedulePoll(runId)
          return
        }
        if (eventSource !== null) return
        watchRun(runId)
      }, delay)
    }

    /**
     * A stream that opens but never sends (dead proxy, half-open socket) fires
     * neither onmessage nor onerror, so `running` stayed true forever. This
     * watchdog re-arms on every frame and hands over to polling when it stalls.
     */
    function armStreamWatchdog(runId) {
      if (streamWatchdog !== 0) window.clearTimeout(streamWatchdog)
      streamWatchdog = window.setTimeout(() => {
        streamWatchdog = 0
        if (store.state.runId !== runId || store.state.running !== true) return
        streamStalls += 1
        stopEventStream()
        /* Only the leader converts a stall into polling. A follower has no
           poller to fall back on, so dropping the stream there means going
           dark: it re-opens the read-only stream instead. */
        if (isPollLeader() === true) schedulePoll(runId)
        else scheduleStreamRebuild(runId)
      }, STREAM_STALL_MS)
    }

    function watchRun(runId) {
      stopPolling()
      stopEventStream()
      if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
        if (isPollLeader() === true) schedulePoll(runId)
        return
      }
      /* Two stalls are enough evidence for the LEADER to give up the stream
         and stay on polling. A follower must not be trapped here: it has no
         poller to fall back on, so returning would leave it permanently dark
         (exactly the frozen card this fixed). It re-opens behind
         scheduleStreamRebuild's backoff and budget instead. */
      if (streamStalls >= 2 && isPollLeader() === true) {
        schedulePoll(runId)
        return
      }
      try {
        eventSource = new window.EventSource(`/council/run/${encodeURIComponent(runId)}/stream`)
      } catch {
        /* Same rule as every other poll-conversion path: only the leader
           polls. A follower that cannot open a stream waits for takeover
           instead of spinning its own poller. */
        if (isPollLeader() === true) schedulePoll(runId)
        return
      }
      armStreamWatchdog(runId)
      eventSource.onmessage = (event) => {
        if (store.state.runId !== runId) return
        noteStreamFrame()
        armStreamWatchdog(runId)
        let data
        try {
          data = JSON.parse(event.data)
        } catch {
          return
        }
        if (data === null || typeof data !== 'object') return
        const running = data.status === 'running'
        store.publish({ run: data, running })
        if (!running) {
          stopEventStream()
          const mode = autoDeliverMode(data)
          /* `tool-run` is a deliberate skip, not a silent one: the card names
             the reason. The setting itself is left untouched. */
          if (mode === 'tool-run') store.publish({ feedbackNote: 'tool-delivered' })
          else if (mode !== '') void resumeRun(runId, mode)
        }
      }
      /* Host heartbeat (`event: beat`, `data: {"seq":N}`, every ~3s while the
         stream lives). `EventSource` never routes a NAMED event to
         `onmessage`, so it needs an explicit listener. A beat is a liveness
         signal only: re-arm the watchdog and touch nothing else — publishing
         it would overwrite `run` with `{"seq":N}` and stop the run. */
      eventSource.addEventListener('beat', () => {
        if (store.state.runId !== runId) return
        noteStreamFrame()
        armStreamWatchdog(runId)
      })
      eventSource.onerror = () => {
        /* The stream died: count it like a stall so a proxy that always blocks
           SSE cannot cause a 320ms open→error→poll loop — after two failures
           the leader stays on polling. A follower has no poller, so it
           rebuilds the read-only stream instead of going dark. */
        streamStalls += 1
        stopEventStream()
        if (store.state.runId !== runId || store.state.running !== true) return
        if (isPollLeader() === true) {
          schedulePoll(runId)
          return
        }
        scheduleStreamRebuild(runId)
      }
    }

    /** Reattach a run that kept running in the host after a refresh or window close. */
    async function adoptRunningRun() {
      /* Only skip when this tab is actively showing a live run. A tab that
         gave up after repeated poll failures keeps runId/run but is NOT live;
         early-returning here left it permanently unable to reattach. */
      if (store.state.running === true && store.state.runId !== '' && store.state.run !== null) return
      const sessionId = store.state.sessionId !== ''
        ? store.state.sessionId
        : typeof draftBridge.sessionId === 'string' ? draftBridge.sessionId : ''
      if (sessionId === '') return
      try {
        const data = await fetchJson(`/council/runs?sessionId=${encodeURIComponent(sessionId)}`)
        const rows = data !== null && typeof data === 'object' && Array.isArray(data.runs) ? data.runs : []
        const current = rows.find((row) => row !== null && typeof row === 'object' && row.status === 'running')
        if (current === undefined || typeof current.id !== 'string') return
        /* Reattaching a different run must not inherit the old counters. */
        if (store.state.runId !== current.id) {
          pollFailures = 0
          streamStalls = 0
          streamRebuilds = 0
        }
        store.publish({ runId: current.id, run: current, running: true, error: '' })
        watchRun(current.id)
      } catch {
        /* best effort: the tab still works without reattachment */
      }
    }

    /**
     * The page is going away: release this tab's channels but DO NOT cancel the
     * run. `pagehide` also fires on refresh and navigation, so cancelling here
     * killed a running council whenever the user reloaded — which contradicts
     * the documented reattach path (`GET /council/runs`). A closed tab now
     * leaves the run to the host watchdog; an explicit 停止 still cancels.
     */
    function releaseOnPageHide() {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
      window.addEventListener('pagehide', () => {
        stopPolling()
        stopEventStream()
        closeLeaderChannel()
      })
      /* Back from bfcache (browser Back, or a restored tab): pagehide released
         our channels, so without this the panel would sit frozen — no poller,
         no stream, no leader role. Rebuild them and reattach the live run. */
      window.addEventListener('pageshow', () => {
        if (store.state.sessionId === '') return
        initLeaderElection(store.state.sessionId)
        if (store.state.running === true && typeof store.state.runId === 'string' && store.state.runId !== '') {
          watchRun(store.state.runId)
          return
        }
        void adoptRunningRun()
      })
    }
    releaseOnPageHide()

    /** Per-session council state so different chats do not share one run. */
    const sessionCache = new Map()
    const SESSION_KEYS = ['question', 'runId', 'run', 'running', 'feedbackRunId', 'workspace']

    /*
     * Multi-tab election: only one tab per session polls and delivers, so two
     * open tabs cannot double-poll or double-deliver the conclusion. The leader
     * republishes its claim well inside the lease; a follower takes over only
     * after a full TTL of silence. Renewal and takeover therefore use
     * different thresholds — using the same one made the leader time itself out
     * roughly every third tick and stall its own polling.
     */
    const LEADER_TTL_MS = 2500
    const LEADER_RENEW_MS = 800
    const LEADER_TICK_MS = 400
    let leaderChannel = null
    let leaderTab = ''
    let leaderTimer = 0
    let myClaimAt = 0
    let leaderSeenAt = 0

    function initLeaderElection(sessionId) {
      if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return
      closeLeaderChannel()
      try {
        leaderChannel = new window.BroadcastChannel(`dsh-council-${sessionId}`)
        leaderChannel.onmessage = (event) => {
          const data = event !== null && typeof event === 'object' ? event.data : null
          if (data === null || typeof data !== 'object') return
          if (typeof data.leader !== 'string' || data.leader === leaderTab) return
          leaderSeenAt = Date.now()
          /* Deterministic tie-break so two simultaneous claims converge:
             the lexicographically smaller tab id keeps the lease. */
          if (data.leader < leaderTab) myClaimAt = 0
        }
      } catch {
        leaderChannel = null
        return
      }
      leaderTab = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      myClaimAt = 0
      leaderSeenAt = 0
      if (leaderTimer !== 0) window.clearInterval(leaderTimer)
      leaderTimer = window.setInterval(() => {
        if (leaderChannel === null) return
        const now = Date.now()
        const claim = () => {
          const wasLeader = isPollLeader()
          myClaimAt = now
          try {
            leaderChannel.postMessage({ leader: leaderTab, sessionId: store.state.sessionId })
          } catch {
            /* best effort */
          }
          /* Takeover: the previous leader may have owned the only poll timer,
             so re-arm one or the run would sit unobserved. */
          if (wasLeader !== true && store.state.running === true && pollTimer === 0 && eventSource === null
            && store.state.runId !== '') {
            schedulePoll(store.state.runId)
          }
        }
        if (myClaimAt > leaderSeenAt) {
          /* I hold the lease: keep it fresh so followers never time me out. */
          if (now - myClaimAt >= LEADER_RENEW_MS) claim()
          return
        }
        /* I am a follower: take over only after the leader goes fully silent. */
        if (now - leaderSeenAt >= LEADER_TTL_MS) claim()
      }, LEADER_TICK_MS)
    }

    function closeLeaderChannel() {
      if (leaderTimer !== 0) {
        window.clearInterval(leaderTimer)
        leaderTimer = 0
      }
      if (leaderChannel !== null) {
        try {
          leaderChannel.close()
        } catch {
          /* best effort */
        }
        leaderChannel = null
      }
    }

    /** True when this tab owns polling for the current session. */
    function isPollLeader() {
      /* Without BroadcastChannel every tab degrades to independent polling. */
      if (leaderChannel === null) return true
      return myClaimAt >= leaderSeenAt
    }

    function saveSessionState() {
      const sessionId = store.state.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') return
      const cached = {}
      for (const key of SESSION_KEYS) cached[key] = store.state[key]
      sessionCache.set(sessionId, cached)
    }

    function restoreSessionState(sessionId) {
      const cached = sessionCache.get(sessionId)
      if (cached === undefined) {
        store.publish({ question: '', runId: '', run: null, running: false, feedbackRunId: '', error: '' })
        return
      }
      store.publish({ ...cached, error: '' })
      if (cached.running === true && typeof cached.runId === 'string' && cached.runId !== '') {
        pollFailures = 0
        streamStalls = 0
        streamRebuilds = 0
        watchRun(cached.runId)
      }
    }

    function switchSession(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      const current = store.state.sessionId
      if (sessionId === current) return
      /* Tear the old session's channels down first: leaving the previous
         EventSource/poller alive leaked a live connection per switch, and the
         previous BroadcastChannel kept mutating the shared leader clock. */
      stopPolling()
      stopEventStream()
      pollFailures = 0
      streamStalls = 0
      streamRebuilds = 0
      saveSessionState()
      store.publish({ sessionId })
      restoreSessionState(sessionId)
      initLeaderElection(sessionId)
      void loadWorkspace()
      void adoptRunningRun()
    }

    function stopPolling() {
      if (pollTimer !== 0) {
        window.clearTimeout(pollTimer)
        pollTimer = 0
      }
    }

    /**
     * A polling duty can stop being this tab's duty between arming the timer
     * and the timer firing: a rival tab with a smaller id claims the lease.
     * `pollRun` then refuses to poll (correctly), but with nothing re-armed
     * this tab would hold no channel at all — no poll, no stream — and its card
     * would sit on its last "running" snapshot forever while the Host run is
     * already done. Observed exactly as "Host says done, card still says 进行中 /
     * 主席汇总 0/1". Re-opening the read-only stream is the same bounded
     * recovery every other lost-channel path uses (`scheduleStreamRebuild`:
     * exponential backoff 1s→8s, at most STREAM_REBUILD_MAX attempts per run),
     * so this cannot become the 0.2.16 idle loop: it costs zero HTTP until the
     * backoff fires, and a follower still never sends a poll request.
     */
    function recoverLostPollDuty(runId) {
      if (isPollLeader() === true) return false
      scheduleStreamRebuild(runId)
      return true
    }

    function schedulePoll(runId) {
      /* Defensive: every poll is a leader duty. Call sites are already gated,
         but the invariant is easier to verify (and to trust) when the
         scheduler itself refuses to arm for a follower. */
      if (isPollLeader() !== true) return
      stopPolling()
      pollTimer = window.setTimeout(() => {
        /* Clear the handle when it fires: a stale non-zero id made the
           takeover check in claim() believe a poll was still armed. */
        pollTimer = 0
        if (recoverLostPollDuty(runId) === true) return
        void pollRun(runId)
      }, 320)
    }

    /** Same loop, longer delay: used while the network is failing. */
    function schedulePollRetry(runId, attempt) {
      if (isPollLeader() !== true) return
      stopPolling()
      const delay = Math.min(8000, 320 * Math.pow(2, Math.min(5, attempt)))
      pollTimer = window.setTimeout(() => {
        pollTimer = 0
        if (recoverLostPollDuty(runId) === true) return
        void pollRun(runId)
      }, delay)
    }

    let pollFailures = 0
    let resumeInFlight = ''
    let discoveryTimer = 0

    /**
     * Look for a run this tab did not start.
     *
     * An agent-issued `council_review` creates the Host run without any client
     * involvement, so nothing calls `watchRun`. The floating status card must
     * not depend on the user opening the sidebar tab first, nor on this tab
     * happening to hold the leader role at mount time.
     *
     * The timer therefore always exists and always re-arms; only the request
     * itself is leader-gated. This is NOT the 0.2.16 idle-loop defect: a
     * follower keeps a local 4s timer with zero HTTP, where the old loop
     * fetched on a 320ms cycle. Keeping the timer alive is what lets a follower
     * begin discovery the moment it takes the lease — the previous early
     * `return` left a tab that was not leader at mount time permanently blind
     * to agent-issued runs.
     */
    function scheduleRunDiscovery() {
      if (discoveryTimer !== 0) return
      if (typeof window === 'undefined') return
      discoveryTimer = window.setTimeout(() => {
        discoveryTimer = 0
        if (isPollLeader() === true) {
          /* A live run already has a stream; discovery is only for finding one. */
          if (!(store.state.running === true && store.state.runId !== '' && store.state.run !== null)) {
            void adoptRunningRun().then(scheduleRunDiscovery, scheduleRunDiscovery)
            return
          }
        }
        /* Follower: no request, but keep re-arming so takeover starts discovery. */
        scheduleRunDiscovery()
      }, RUN_DISCOVERY_MS)
    }

    function stopRunDiscovery() {
      if (discoveryTimer !== 0) {
        window.clearTimeout(discoveryTimer)
        discoveryTimer = 0
      }
    }

    async function pollRun(runId) {
      if (store.state.runId !== runId) return
      if (store.state.running !== true) {
        stopPolling()
        return
      }
      if (isPollLeader() !== true) {
        /* Followers do not poll: poll → watchRun → (stall guard) → poll was a
           320ms idle loop that never fetched, so this stays a bare refusal.
           The timer callbacks that drive this loop convert it into a read-only
           stream rebuild instead of leaving the tab dark (see below). */
        return
      }
      try {
        const data = await fetchJson(`/council/run/${encodeURIComponent(runId)}`)
        if (store.state.runId !== runId) return
        pollFailures = 0
        const running = data.status === 'running'
        /* A recovered poll clears a transport error it itself raised. */
        store.publish({ run: data, running, ...(store.state.error !== '' ? { error: '' } : {}) })
        if (running) {
          /* The SSE stream may have healed while we were polling. */
          if (eventSource === null && typeof window !== 'undefined' && typeof window.EventSource === 'function') {
            watchRun(runId)
          } else {
            schedulePoll(runId)
          }
        } else {
          const mode = autoDeliverMode(data)
          if (mode === 'tool-run') store.publish({ feedbackNote: 'tool-delivered' })
          else if (mode !== '') void resumeRun(runId, mode)
        }
      } catch (error) {
        if (store.state.runId !== runId) return
        const message = String(error && error.message ? error.message : error)
        /* A 404 means the host no longer knows this run: that really is
           terminal, unlike a transport blip. Prefer the structured status. */
        const status = error !== null && typeof error === 'object' ? error.status : undefined
        if (status === 404 || /\b404\b/.test(message) || message.includes('run not found')) {
          stopPolling()
          stopEventStream()
          store.publish({ running: false, run: null, runId: '', error: message })
          return
        }
        /* A single failed poll must NOT discard a run that is still executing
           on the host: keep runId/running, back off, and only give up after a
           sustained streak. Dropping it let the user start a second run while
           the first one's conclusion had nowhere to land. */
        pollFailures += 1
        /* Only publish the message once it is worth showing — and never blank
           an error that some other path just set. */
        if (pollFailures >= 3) store.publish({ error: message })
        if (pollFailures >= 8) {
          stopPolling()
          stopEventStream()
          store.publish({ running: false, error: message })
          return
        }
        schedulePollRetry(runId, pollFailures)
      }
    }

    /** Session id resolution shared by preview and run, so both name the same session. */
    function currentSessionId() {
      return store.state.sessionId !== ''
        ? store.state.sessionId
        : typeof draftBridge.sessionId === 'string' ? draftBridge.sessionId : ''
    }

    /** Identity of the exact (session, question) pair a confirmation authorises. */
    function manifestKey(question) {
      return `${currentSessionId()}\u0000${question}`
    }

    /**
     * True only while a successful preview covers the current question AND
     * session AND files are actually attached. Any failed/in-flight preview
     * leaves the stored preview empty, so the gate cannot open on a guess.
     */
    function isManifestConfirmed() {
      if (store.state.attachFiles === false) return false
      if (store.state.previewLoading === true) return false
      if (store.state.previewError !== '') return false
      const preview = store.state.preview
      if (preview === null || typeof preview !== 'object') return false
      return store.state.previewKey === manifestKey(String(store.state.question || '').trim())
    }

    /**
     * Read-only dry run of the outbound manifest (`POST /council/preview`).
     * Fail closed: any transport/HTTP error clears the preview, so a failed
     * preview can never be mistaken for a confirmation.
     */
    async function previewManifest() {
      const question = String(store.state.question || '').trim()
      if (question === '') {
        store.publish({ error: tr('error.empty'), previewError: '' })
        return
      }
      const key = manifestKey(question)
      store.publish({ previewLoading: true, preview: null, previewKey: '', previewError: '' })
      try {
        const data = await fetchJson('/council/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            question,
            sessionId: currentSessionId(),
            attachFiles: store.state.attachFiles !== false,
          }),
        })
        /* Store the preview under the key it was requested for: if the
           question or session moved while the request was in flight, the
           response must not inherit a confirmation it was not asked for. */
        store.publish({ previewLoading: false, preview: data, previewKey: key, previewError: '' })
      } catch (error) {
        store.publish({ previewLoading: false, preview: null, previewKey: '', previewError: messageOf(error) })
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
      const sessionId = currentSessionId()
      /* Read the gate at the moment of the send: an edit between preview and
         click has already invalidated the key by then. */
      const manifestConfirmed = isManifestConfirmed()
      const payload = {
        question,
        models,
        chairman,
        context: store.state.useContext === true,
        attachFiles: store.state.attachFiles !== false,
        seatMode: store.state.useSubagentSeats !== false ? 'subagent' : 'llm',
        /* Hybrid seats: with subagent seats on, only the first N answerers are
           subagents; the rest take the fast streaming path. */
        subagentSeats: store.state.useSubagentSeats !== false
          ? Math.max(1, Math.min(store.state.selected.length - 1, store.state.seatSplit))
          : 0,
        useChairman,
        sessionId,
      }
      /* Omitted entirely when unconfirmed, so an unconfirmed run cannot look
         confirmed on the wire (the Host defaults the field to false). */
      if (manifestConfirmed) payload.manifestConfirmed = true
      stopPolling()
      /* Failure/stall counters are per-run: a previous run that died after 8
         failed polls must not make the next run fail on its first blip. */
      pollFailures = 0
      streamStalls = 0
      streamRebuilds = 0
      cancelStreamRebuild()
      store.publish({ running: true, error: '', run: null, runId: '', feedbackRunId: '', feedbackNote: '' })
      try {
        const data = await fetchJson('/council/run', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (typeof data.runId !== 'string' || data.runId === '') throw new Error('missing runId')
        store.publish({ runId: data.runId })
        if (manifestConfirmed) {
          /* One-shot authorisation: the next run needs its own preview. */
          store.publish({ preview: null, previewKey: '', previewError: '' })
        }
        watchRun(data.runId)
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
     * Decide how a finished run may be posted back into the chat.
     *
     * Returns the delivery mode, `''` for "deliver nothing", or `'tool-run'`
     * when the delivery is skipped *because the run was started by the
     * `council_review` tool*: that tool already hands the conclusion to its
     * caller as the `tool/result` (host side), so the panel's poll/stream would
     * otherwise splice a second, duplicate conclusion into the same session.
     * A `/council` panel run has no tool result, so it keeps following the
     * user's own setting. Read from the run snapshot, never from a guess.
     */
    function autoDeliverMode(data) {
      if (data === null || typeof data !== 'object' || data.status !== 'done') return ''
      if (store.state.feedbackMode === 'off') return ''
      if (data.toolRun === true) return 'tool-run'
      return store.state.feedbackMode
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
      /* In-tab guard only: the token itself must NOT be written before the
         POST succeeds. Writing it first let a follower "claim" the delivery,
         so when it later became leader the guard above short-circuited and
         nobody ever posted the conclusion. */
      if (resumeInFlight === token) return
      if (isPollLeader() !== true) {
        /* The leader delivers; say so instead of failing silently. */
        store.publish({ feedbackNote: 'another-tab' })
        return
      }
      resumeInFlight = token
      try {
        await fetchJson(`/council/run/${encodeURIComponent(runId)}/resume`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
        store.publish({ feedbackRunId: token, feedbackNote: '' })
      } catch (error) {
        /* Only the host's explicit "already delivered" is success. Any other
           409 (not finished / session busy) is a real condition the user must
           see — matching on the bare status code would swallow those. */
        if (error !== null && typeof error === 'object' && error.code === 'already-resumed') {
          store.publish({ feedbackRunId: token, feedbackNote: '' })
          return
        }
        store.publish({ feedbackNote: '', error: messageOf(error) })
      } finally {
        if (resumeInFlight === token) resumeInFlight = ''
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
    /* ------------------------------------------------------------------ *
     * Floating run status — `conversation.input.overlay`
     * ------------------------------------------------------------------ */

    let reactDom = null
    try {
      reactDom = require('react-dom')
    } catch {
      reactDom = null
    }

    /** The slot contract says a fixed overlay must portal to the document body. */
    function canPortal() {
      return reactDom !== null && reactDom !== undefined
        && typeof reactDom.createPortal === 'function'
        && typeof document !== 'undefined'
        && document !== null
        && document.body !== null
        && document.body !== undefined
    }

    /* ------------------------------------------------------------------ *
     * Seat live detail — shared by the conversation card and the floating *
     * card, so the phase rules, the reasoning window and the follow       *
     * behaviour cannot drift between the two surfaces.                    *
     * ------------------------------------------------------------------ */

    /* The store field that owns the one expanded seat of each surface. Two
       surfaces must not overwrite each other's open row, so each gets its own
       field. Both are plain view state: a click publishes one of these and
       touches nothing else. */
    const SEAT_OPEN_FIELD = { card: 'seatOpenCard', float: 'seatOpenFloat' }

    function seatOpenFieldOf(surface) {
      return SEAT_OPEN_FIELD[surface] !== undefined ? SEAT_OPEN_FIELD[surface] : 'seatOpenCard'
    }

    /** The seat key expanded on this surface, or '' when every row is closed. */
    function seatOpenKeyOf(state, surface) {
      if (state === null || typeof state !== 'object') return ''
      const field = seatOpenFieldOf(surface)
      return typeof state[field] === 'string' ? state[field] : ''
    }

    /**
     * Open or close one seat row. The key lives in the shared store so the
     * shipped subscription repaints the surface; no run field is published and
     * no run state is read or written.
     */
    function toggleSeatRow(surface, key) {
      if (typeof key !== 'string' || key === '') return
      const field = seatOpenFieldOf(surface)
      const open = store.state[field] === key
      /* Re-opening a row always follows the stream again, even when the user
         had scrolled up during the previous expansion. */
      if (open !== true) delete seatFollowUp[seatFollowKey(surface, key)]
      store.publish({ [field]: open === true ? '' : key })
    }

    /* Expanded bodies stay pinned to the newest token until the user scrolls
       up. Following is read inside a callback ref and written by an onScroll
       handler, so it is deliberately NOT React state: a scroll gesture fires
       far too often to re-render a card for each one. */
    const seatFollowUp = Object.create(null)

    function seatFollowKey(surface, key) {
      return `${surface}\u0000${key}`
    }

    /** True while the body should follow the stream (default: yes). */
    function seatFollows(surface, key) {
      return seatFollowUp[seatFollowKey(surface, key)] !== false
    }

    /** User scrolled: follow only while the body is still at its bottom. */
    function noteSeatScroll(surface, key, element) {
      if (element === null || typeof element !== 'object') return
      const top = typeof element.scrollTop === 'number' ? element.scrollTop : 0
      const view = typeof element.clientHeight === 'number' ? element.clientHeight : 0
      const full = typeof element.scrollHeight === 'number' ? element.scrollHeight : 0
      seatFollowUp[seatFollowKey(surface, key)] = top + view >= full - 2
    }

    /** New tokens arrived: pin the body to the bottom unless the user scrolled up. */
    function followSeatBottom(surface, key, element) {
      if (element === null || typeof element !== 'object') return
      if (seatFollows(surface, key) !== true) return
      if (typeof element.scrollHeight !== 'number') return
      element.scrollTop = element.scrollHeight
    }

    /** The element an onScroll event happened on, total over fake events. */
    function scrollElementOf(event) {
      if (event === null || event === undefined || typeof event !== 'object') return null
      if (event.currentTarget !== undefined && event.currentTarget !== null) return event.currentTarget
      return event.target !== undefined ? event.target : null
    }

    /**
     * The Host ships the TAIL of the reasoning chain (at most 4000 chars) plus
     * the total length, so a shorter `reasoning` is a window, never the whole
     * chain. `truncated` is what the row has to say out loud.
     */
    function seatReasoningOf(answer) {
      const reasoning = answer !== null && typeof answer === 'object' && typeof answer.reasoning === 'string'
        ? answer.reasoning : ''
      const raw = answer !== null && typeof answer === 'object' ? answer.reasoningChars : undefined
      const chars = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
        ? Math.floor(raw) : reasoning.length
      return { text: reasoning, chars, truncated: chars > reasoning.length }
    }

    /** The answer body of one seat. Streaming runs grow it in place. */
    function seatAnswerTextOf(answer) {
      return answer !== null && typeof answer === 'object' && typeof answer.text === 'string' ? answer.text : ''
    }

    function seatErrorOf(answer) {
      return answer !== null && typeof answer === 'object' && typeof answer.error === 'string' ? answer.error : ''
    }

    /**
     * Label of one live seat, tolerant of every row shape the Host ships:
     * `answers[]` and `chairman` carry `name`, `reviews[]` carries `reviewer`
     * (whatever the Host put there — a model name or an anonymous label — is
     * rendered verbatim, never invented).
     */
    function seatLabel(item) {
      if (item === null || typeof item !== 'object') return ''
      if (typeof item.reviewer === 'string' && item.reviewer !== '') return item.reviewer
      if (typeof item.name === 'string' && item.name !== '') return item.name
      if (typeof item.model === 'string' && item.model !== '') return item.model
      return ''
    }

    /** Display name for a seat row, with a positional fallback. */
    function seatNameOf(item, index) {
      const label = seatLabel(item)
      return label !== '' ? label : `${index + 1}`
    }

    /** Raw identity of a seat within its stage (also the DOM `data-seat`). */
    function seatKeyOf(item, index) {
      return item !== null && typeof item === 'object' && typeof item.key === 'string' && item.key !== ''
        ? item.key : `${index}`
    }

    /**
     * Identity of one live row INCLUDING the stage it belongs to. The stage is
     * part of the open/follow key, so a stage change cannot inherit the open
     * row of the previous stage: the stale key matches no current row, the row
     * simply collapses, and no render-time state write is needed.
     */
    function seatRowKeyOf(stage, item, index) {
      return `${stage}\u0000${seatKeyOf(item, index)}`
    }

    /**
     * Which live seats the current stage streams.
     *
     * The Host runs answers → reviews → chairman. A card that kept reading
     * `answers` showed only finished seats throughout the reviews and chairman
     * minutes — the exact stretch the user wants to watch — so the live seat
     * region switches its data source with the stage. `role` names the stage
     * for the row chip; the row label itself stays the Host's.
     */
    function liveSeatsOf(run) {
      if (run === null || typeof run !== 'object') return { stage: 'answers', items: [], role: 'member' }
      const onlyObjects = (value) => Array.isArray(value)
        ? value.filter((item) => item !== null && typeof item === 'object') : []
      if (run.stage === 'reviews') {
        return { stage: 'reviews', items: onlyObjects(run.reviews), role: 'reviewer' }
      }
      if (run.stage === 'chairman') {
        const chairman = run.chairman
        return {
          stage: 'chairman',
          items: chairman !== null && typeof chairman === 'object' ? [chairman] : [],
          role: 'chairman',
        }
      }
      return { stage: 'answers', items: onlyObjects(run.answers), role: 'member' }
    }

    /** Row-role chip copy: '' when the stage needs no explanation. */
    function seatRoleLabel(t, role) {
      if (role === 'reviewer') return t('seat.reviewer')
      if (role === 'chairman') return t('seat.chairman')
      return ''
    }

    function seatToneClass(answer) {
      if (seatErrorOf(answer) !== '') return ' is-error'
      return answer !== null && typeof answer === 'object' && answer.done === true ? ' is-done' : ' is-live'
    }

    /**
     * The seat is between its first reasoning token and its first answer token.
     * "运行中" is not wrong there, but the user has something to read, so the
     * row names the phase instead of looking idle.
     */
    function seatThinking(answer) {
      if (answer === null || typeof answer !== 'object' || answer.done === true) return false
      if (seatErrorOf(answer) !== '') return false
      return seatAnswerTextOf(answer) === '' && seatReasoningOf(answer).text !== ''
    }

    /**
     * Seat phase label for a running card (starting/running/closed/activity).
     * Module scope because both the sidebar panel and the floating card need
     * it; it was previously scoped inside the panel, so a floating card that
     * rendered a live seat threw a ReferenceError.
     */
    function seatStatusText(t, seat) {
      if (seat === null || typeof seat !== 'object') return t('status.streaming')
      const seconds = typeof seat.elapsedMs === 'number' && seat.elapsedMs > 0
        ? Math.max(1, Math.round(seat.elapsedMs / 1000))
        : 0
      const phase = seat.phase === 'starting'
        ? t('status.seatStarting', { s: seconds })
        : seat.phase === 'running'
          ? t('status.seatRunning', { s: seconds })
          : seat.phase === 'closed'
            ? t('status.seatClosed')
            : t('status.streaming')
      const activity = typeof seat.activity === 'string' && seat.activity !== ''
        ? t(`seat.activity.${seat.activity}`)
        : ''
      const waiting = typeof seat.activityMs === 'number' && seat.activityMs > 15000
        ? ` · ${t('seat.activity.waiting')}`
        : ''
      if (activity === '' || activity === `seat.activity.${seat.activity}`) return `${phase}${waiting}`
      return `${phase} · ${activity}${waiting}`
    }

    /* ------------------------------------------------------------------ *
     * Run plan and graceful-degradation copy                              *
     *                                                                     *
     * Both readers below take the `t` of the surface that is rendering,   *
     * because the same numbers are shown on three surfaces. They are      *
     * deliberately total and return '' / null for a snapshot that does    *
     * not carry the Host field: an old Host, a persisted historic run or  *
     * a prepare/start card without a run snapshot therefore renders its   *
     * previous copy instead of an invented plan.                          *
     * ------------------------------------------------------------------ */

    /** A positive finite count from a snapshot field, or 0 when it is absent. */
    function positiveCount(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
    }

    /** Compact duration for the budget line: 45s, 1m30s, 27m; '' when unknown. */
    function durationText(ms) {
      const total = positiveCount(ms)
      if (total === 0) return ''
      const seconds = Math.round(total / 1000)
      if (seconds < 60) return `${seconds}s`
      const minutes = Math.floor(seconds / 60)
      const rest = seconds % 60
      return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`
    }

    /** The Host's `budgetPlan` object of a run snapshot, or null. */
    function budgetPlanOf(run) {
      if (run === null || typeof run !== 'object') return null
      const plan = run.budgetPlan
      return plan !== null && plan !== undefined && typeof plan === 'object' ? plan : null
    }

    /** The Host's `providerWaves` object of a run snapshot, or null. */
    function providerWavesOf(run) {
      if (run === null || typeof run !== 'object') return null
      const plan = run.providerWaves
      return plan !== null && plan !== undefined && typeof plan === 'object' ? plan : null
    }

    /**
     * "About 2 waves per stage (Bohrium 5 seats > 4 slots)": how many serial
     * provider rounds every stage needs. Read from the Host's structured
     * `providerWaves`; an over-subscribed provider is named only when the
     * snapshot actually reports it (`waves > 1` on its own row), never inferred
     * from the roster. '' when the field is missing.
     */
    function wavesLineOf(t, run) {
      const plan = providerWavesOf(run)
      if (plan === null) return ''
      const maxWaves = positiveCount(plan.maxWaves)
      if (maxWaves < 1) return ''
      const stages = plan.stages !== null && plan.stages !== undefined && typeof plan.stages === 'object'
        ? plan.stages : {}
      const seen = new Set()
      const over = []
      for (const stageName of ['answers', 'reviews', 'chairman']) {
        const stage = stages[stageName]
        const rows = stage !== null && stage !== undefined && typeof stage === 'object' && Array.isArray(stage.byProvider)
          ? stage.byProvider : []
        for (const row of rows) {
          if (row === null || typeof row !== 'object') continue
          if (positiveCount(row.waves) < 2) continue
          const label = typeof row.providerName === 'string' && row.providerName !== ''
            ? row.providerName
            : typeof row.provider === 'string' ? row.provider : ''
          if (label === '' || seen.has(label)) continue
          seen.add(label)
          over.push(t('plan.overProvider', {
            provider: label,
            seats: positiveCount(row.seats),
            slots: positiveCount(row.slots),
          }))
        }
      }
      return over.length === 0
        ? t('plan.wavesPlain', { waves: maxWaves })
        : t('plan.waves', { waves: maxWaves, over: over.join(t('plan.overSep')) })
    }

    /**
     * "Budget: answers 45% / reviews 35% / chairman 20% (used 2m of 30m)": the
     * stage sub-budgets the Host planned, with the run's own spend when the
     * snapshot reports it. Every share must be present and sane; one missing
     * share drops the whole line rather than printing a made-up percentage.
     */
    function budgetLineOf(t, run) {
      const plan = budgetPlanOf(run)
      if (plan === null) return ''
      const stages = plan.stages !== null && plan.stages !== undefined && typeof plan.stages === 'object'
        ? plan.stages : {}
      const percent = {}
      for (const stageName of ['answers', 'reviews', 'chairman']) {
        const stage = stages[stageName]
        const share = stage !== null && stage !== undefined && typeof stage === 'object' ? stage.share : undefined
        if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > 1) return ''
        percent[stageName] = Math.round(share * 100)
      }
      const params = {
        answers: t('stage.answers'),
        answersShare: percent.answers,
        reviews: t('stage.reviews'),
        reviewsShare: percent.reviews,
        chairman: t('stage.chairman'),
        chairmanShare: percent.chairman,
      }
      const spent = durationText(plan.elapsedMs)
      const total = durationText(plan.totalMs)
      if (spent === '' || total === '') return t('plan.budget', params)
      return t('plan.budgetSpent', Object.assign({ spent, total }, params))
    }

    /**
     * One readable line about the run's planned cost, or '' when the snapshot
     * carries neither Host field. Composed from the two optional parts so a
     * Host that ships only one of them still explains itself.
     */
    function planTextOf(t, run) {
      const parts = []
      const waves = wavesLineOf(t, run)
      if (waves !== '') parts.push(waves)
      const budget = budgetLineOf(t, run)
      if (budget !== '') parts.push(budget)
      return parts.join(t('plan.sep'))
    }

    /* Graceful-degradation stop reasons, as the Host names them in `stopReason`
       (the field has existed since 0.2.x; this table only adds copy). */
    const STOP_NOTE_KEYS = {
      'chairman-budget-skipped': 'stop.chairmanSkipped',
      watchdog: 'stop.watchdog',
      cancelled: 'stop.cancelled',
      'stage-error': 'stop.stageError',
    }

    /** The Host's own long reason for a skipped chairman stage, or ''. */
    function chairmanSkipReasonOf(run) {
      const plan = budgetPlanOf(run)
      if (plan === null) return ''
      const stages = plan.stages
      const chairman = stages !== null && stages !== undefined && typeof stages === 'object'
        ? stages.chairman : null
      if (chairman === null || chairman === undefined || typeof chairman !== 'object') return ''
      return typeof chairman.reason === 'string' ? chairman.reason : ''
    }

    /**
     * Why a settled run did not finish its normal path, or '' when it did
     * (`stopReason` empty or 'completed'). A known Host token is localized; an
     * unknown one is printed verbatim behind generic copy, because showing the
     * real token beats inventing a reason. Nothing is returned for a running
     * run: `stopReason` is a terminal field.
     */
    function stopNoteOf(t, run) {
      if (run === null || run === undefined || typeof run !== 'object') return ''
      const stopReason = typeof run.stopReason === 'string' ? run.stopReason : ''
      if (stopReason === '' || stopReason === 'completed') return ''
      const key = STOP_NOTE_KEYS[stopReason]
      return key !== undefined ? t(key) : t('stop.generic', { reason: stopReason })
    }

    /** The Host's own explanation under a degradation note, when it ships one. */
    function stopDetailOf(t, run) {
      if (run === null || run === undefined || typeof run !== 'object') return ''
      if (run.stopReason !== 'chairman-budget-skipped') return ''
      const reason = chairmanSkipReasonOf(run)
      return reason === '' ? '' : t('stop.hostReason', { reason })
    }

    /**
     * Plan + degradation nodes shared by the conversation card, the sidebar and
     * the floating card. Returns [] when the snapshot has neither the new Host
     * fields nor a degradation token, so all three surfaces keep their previous
     * rendering byte for byte on an old snapshot.
     */
    function planNodesOf(t, run) {
      const nodes = []
      const plan = planTextOf(t, run)
      if (plan !== '') nodes.push(h('div', { className: 'dsc-plan', key: 'plan' }, plan))
      const note = stopNoteOf(t, run)
      if (note !== '') nodes.push(h('div', { className: 'dsc-degraded', key: 'stop' }, note))
      const detail = stopDetailOf(t, run)
      if (detail !== '') nodes.push(h('div', { className: 'dsc-plan', key: 'stop-detail' }, detail))
      return nodes
    }

    /**
     * Expanded body of one seat: the live reasoning window, the growing answer,
     * the phase note, the "no token yet" note and the error.
     *
     * Only an expanded row renders this: a collapsed row stays one line, so a
     * 4000-char reasoning window is never laid out for every seat of a frame.
     * Both surfaces render the identical markup (`data-surface` keeps their
     * open/follow state apart).
     */
    function seatDetailNodes(t, item, surface, rowKey, domKey) {
      const reasoning = seatReasoningOf(item)
      const text = seatAnswerTextOf(item)
      const error = seatErrorOf(item)
      const done = item !== null && typeof item === 'object' && item.done === true
      const thinking = seatThinking(item)
      const waiting = !done && error === '' && text === '' && reasoning.text === ''
      const nodes = []
      if (reasoning.text !== '' || reasoning.chars > 0) {
        nodes.push(h('div', { className: 'dsc-seat-reason', key: 'reasoning' },
          h('div', { className: 'dsc-seat-part-head' },
            h('span', { className: 'dsc-seat-part' }, t('seat.reasoning')),
            h('span', { className: 'dsc-seat-chars' }, t('seat.chars', { count: reasoning.chars })),
            reasoning.truncated
              ? h('span', { className: 'dsc-seat-window' },
                  t('seat.window', { shown: reasoning.text.length, total: reasoning.chars }))
              : null,
          ),
          reasoning.text !== ''
            ? h('div', {
                className: 'dsc-seat-body',
                'data-surface': surface,
                'data-seat': domKey,
                'data-part': 'reasoning',
                ref: (element) => followSeatBottom(surface, rowKey, element),
                onScroll: (event) => noteSeatScroll(surface, rowKey, scrollElementOf(event)),
              }, reasoning.text)
            : null,
        ))
      }
      if (thinking) {
        nodes.push(h('div', { className: 'dsc-seat-phase', key: 'thinking' }, t('seat.thinking')))
      }
      if (text !== '') {
        nodes.push(h('div', { className: 'dsc-seat-answer', key: 'answer' },
          h('div', { className: 'dsc-seat-part-head' },
            h('span', { className: 'dsc-seat-part' }, t('seat.answer')),
          ),
          h('div', {
            className: 'dsc-seat-body',
            'data-surface': surface,
            'data-seat': domKey,
            'data-part': 'answer',
            ref: (element) => followSeatBottom(surface, rowKey, element),
            onScroll: (event) => noteSeatScroll(surface, rowKey, scrollElementOf(event)),
          }, text),
        ))
      }
      if (waiting) {
        nodes.push(h('div', { className: 'dsc-seat-waiting', key: 'waiting' }, t('seat.waitingToken')))
      }
      if (error !== '') {
        nodes.push(h('div', { className: 'dsc-error-box', key: 'error' }, error))
      }
      return nodes.length === 0 ? null
        : h('div', { className: 'dsc-seat-detail', 'data-surface': surface, 'data-seat': domKey }, nodes)
    }

    /**
     * Floating council run-status card.
     *
     * Lives in the same seat as the shipped command popup, slash menu, and
     * feedback dialog. Without a portal a `position: fixed` card is contained
     * by the docked composer card, so the portal is not cosmetic.
     *
     * The card is display-only: it never writes run state and never delivers a
     * conclusion. Delivery stays with the leader's stream/poll path.
     */
    function CouncilStatusOverlay(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const state = useStore((snapshot) => ({
        run: snapshot.run,
        running: snapshot.running,
        runId: snapshot.runId,
        /* The card must be able to say "not posted back, and why": a
           tool-originated run is skipped on purpose, not silently dropped. */
        feedbackMode: snapshot.feedbackMode,
        /* Only this card's open row: expanding a row here must not move the
           conversation card, and vice versa. */
        seatOpenFloat: snapshot.seatOpenFloat,
      }))
      const [hidden, setHidden] = React.useState(false)

      React.useEffect(() => {
        /* An agent-issued `council_review` starts a Host run that nothing else
           tells this tab about, so the card would stay empty without this. */
        void adoptRunningRun()
        scheduleRunDiscovery()
        return () => stopRunDiscovery()
      }, [])

      /* A new run must un-hide a card the user dismissed for the previous one. */
      React.useEffect(() => {
        setHidden(false)
      }, [state.runId])

      const run = state.run
      if (hidden === true || (run === null && state.running !== true)) return null

      /* The live seat region follows `run.stage`: answers → reviews → chairman.
         Otherwise the card kept showing finished answers through the reviews
         and chairman minutes. */
      const seats = liveSeatsOf(run)
      const finished = seats.items.filter((item) => item.done === true).length
      const roleLabel = seatRoleLabel(t, seats.role)
      const stageNames = {
        answers: t('stage.answers'),
        reviews: t('stage.reviews'),
        chairman: t('stage.chairman'),
        done: t('stage.done'),
      }
      const stage = run !== null && stageNames[run.stage] !== undefined ? stageNames[run.stage] : stageNames.answers
      const statusText = run === null
        ? t('overlay.starting')
        : run.status === 'error'
          ? t('status.error')
          : run.status === 'done' ? t('status.done') : t('overlay.running')

      const card = h('div', {
        className: 'dsc-float',
        role: 'status',
        'aria-live': 'polite',
      },
        h('div', { className: 'dsc-float-head' },
          h('span', { className: 'dsc-float-title' }, t('overlay.title')),
          h('span', { className: 'dsc-float-stage' }, `${statusText} · ${stage}`),
          h('span', { className: 'dsc-float-count' }, `${finished}/${seats.items.length}`),
          h('button', {
            type: 'button',
            className: 'dsc-float-btn',
            title: t('overlay.hide'),
            'aria-label': t('overlay.hide'),
            onClick: () => setHidden(true),
          }, '×'),
        ),
        run !== null && typeof run.question === 'string' && run.question !== ''
          ? h('div', { className: 'dsc-float-q', title: run.question }, run.question)
          : null,
        /* Why this run needs this long, and why it settled off the normal path.
           Both are empty for a snapshot without the Host plan fields. */
        ...planNodesOf(t, run),
        /* A configured chairman that was dropped is a warning, not a silent
           detail: the user's choice did not take effect. */
        run !== null && typeof run.chairmanProblem === 'string' && run.chairmanProblem !== ''
          ? h('div', { className: 'dsc-warn' }, t('chairman.fallback', { problem: run.chairmanProblem }))
          : null,
        /* The conclusion already went back as the tool result. Shown while the
           delivery setting is on, i.e. exactly when the skip is a decision. */
        run !== null && run.status === 'done' && run.toolRun === true && state.feedbackMode !== 'off'
          ? h('div', { className: 'dsc-note' }, t('feedback.toolDelivered'))
          : null,
        seats.items.length > 0
          ? h('div', { className: 'dsc-float-seats' },
            seats.items.map((item, index) => {
              const domKey = seatKeyOf(item, index)
              const rowKey = seatRowKeyOf(seats.stage, item, index)
              const open = seatOpenKeyOf(state, 'float') === rowKey
              const name = seatNameOf(item, index)
              const failed = seatErrorOf(item) !== ''
              return h('div', { className: 'dsc-float-seat' + (open === true ? ' is-open' : ''), key: rowKey },
                h('button', {
                  type: 'button',
                  className: 'dsc-seat-row',
                  'aria-expanded': open === true ? 'true' : 'false',
                  'aria-label': open === true ? t('seat.collapse') : t('seat.expand'),
                  title: open === true ? t('seat.collapse') : t('seat.expand'),
                  onClick: () => toggleSeatRow('float', rowKey),
                },
                  h('span', { className: 'dsc-float-dot' + seatToneClass(item) }),
                  roleLabel !== '' ? h('span', { className: 'dsc-seat-role' }, roleLabel) : null,
                  h('span', { className: 'dsc-float-name', title: name }, name),
                  h('span', { className: 'dsc-float-state' },
                    failed ? t('status.error')
                      : seatThinking(item) ? t('seat.thinking')
                        : item.done === true ? t('status.done') : seatStatusText(t, item.seat)),
                  h('span', { className: 'dsc-seat-caret', 'aria-hidden': true }, open === true ? '▾' : '▸'),
                ),
                /* Collapsed rows render one line: the long reasoning window is
                   only mounted for the row the user opened. */
                open === true ? seatDetailNodes(t, item, 'float', rowKey, domKey) : null,
              )
            }),
          )
          : h('div', { className: 'dsc-seat-waiting' }, t('seat.stageWaiting')),
        run !== null && typeof run.error === 'string' && run.error !== ''
          ? h('div', { className: 'dsc-float-error' }, run.error)
          : null,
      )

      if (!canPortal()) return card
      return reactDom.createPortal(card, document.body)
    }

    /* ------------------------------------------------------------------ *
     * Settings page — `settings.section`
     * ------------------------------------------------------------------ */

    /* Bound Host configuration form for entry `council`; null when the Host or
       the settings layer is unavailable, in which case the page says so
       instead of pretending the switches work. */
    let settingsForm = null

    /** `<provider>/<model>` — the stored shape of a default route. */
    function routeKeyOf(entry) {
      if (entry === null || typeof entry !== 'object') return ''
      if (typeof entry.provider !== 'string' || typeof entry.model !== 'string') return ''
      if (entry.provider === '' || entry.model === '') return ''
      return `${entry.provider}/${entry.model}`
    }

    /** Parse a stored `provider/model` route; a malformed entry is dropped. */
    function parseRouteKey(key) {
      if (typeof key !== 'string') return null
      const slash = key.indexOf('/')
      if (slash <= 0 || slash === key.length - 1) return null
      const provider = key.slice(0, slash)
      const model = key.slice(slash + 1)
      if (provider === '' || model === '') return null
      return { provider, model }
    }

    /** Accepted value of the bound configuration entry, or {} when unbound. */
    function acceptedSettings() {
      const form = settingsForm
      if (form === null || typeof form.getSnapshot !== 'function') return {}
      const snapshot = form.getSnapshot()
      return snapshot !== null && typeof snapshot === 'object'
        && snapshot.value !== null && typeof snapshot.value === 'object' ? snapshot.value : {}
    }

    /** Stored default routes, filtered to the string shape the schema expects. */
    function acceptedDefaultModels() {
      const value = acceptedSettings().defaultModels
      return Array.isArray(value) ? value.filter((key) => typeof key === 'string') : []
    }

    /**
     * Settings page for the council tool.
     *
     * Model choices come from `store.state.catalog` — the Host route
     * `/council/models` that `loadModels()` keeps in sync with the live
     * provider catalog. The picker therefore never offers a model the Host no
     * longer serves, and a stored key that vanished is surfaced as unavailable
     * instead of being silently rewritten.
     */
    function CouncilSettingsSection(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const state = useStore((snapshot) => ({
        catalog: snapshot.catalog,
        loading: snapshot.loading,
        loadError: snapshot.loadError,
      }))
      /* Seeded from the accepted Host value during render, not from an effect:
         the draft must already equal what the Host holds on the first paint,
         or a reader who saves immediately would write an empty selection. */
      const [draftToolEnabled, setDraftToolEnabled] = React.useState(() => acceptedSettings().toolEnabled !== false)
      const [draftPanelEnabled, setDraftPanelEnabled] = React.useState(() => acceptedSettings().panelEnabled !== false)
      const [draftModels, setDraftModels] = React.useState(() => acceptedDefaultModels())
      const [draftChairman, setDraftChairman] = React.useState(() => {
        const value = acceptedSettings().defaultChairman
        return typeof value === 'string' ? value : ''
      })
      const [ready, setReady] = React.useState(() => settingsForm !== null)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      React.useEffect(() => {
        if (state.catalog.length === 0 && state.loading !== true) void loadModels()
      }, [state.catalog.length, state.loading])

      React.useEffect(() => {
        const form = settingsForm
        if (form === null) return undefined
        const sync = () => {
          setDraftToolEnabled(acceptedSettings().toolEnabled !== false)
          setDraftPanelEnabled(acceptedSettings().panelEnabled !== false)
          setDraftModels(acceptedDefaultModels())
          const chairman = acceptedSettings().defaultChairman
          setDraftChairman(typeof chairman === 'string' ? chairman : '')
          setReady(true)
        }
        sync()
        const unsubscribe = typeof form.subscribe === 'function' ? form.subscribe(sync) : null
        return () => {
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [ready])


      const catalogKeys = new Set(state.catalog.map((row) => `${row.provider}/${row.model}`))
      const missing = draftModels.filter((key) => !catalogKeys.has(key) && parseRouteKey(key) !== null)
      const groups = []
      for (const row of state.catalog) {
        let group = groups.find((candidate) => candidate.provider === row.provider)
        if (group === undefined) {
          group = { provider: row.provider, name: row.providerName, rows: [] }
          groups.push(group)
        }
        group.rows.push(row)
      }

      function toggleModel(key) {
        setDraftModels((current) => current.includes(key)
          ? current.filter((candidate) => candidate !== key)
          : current.concat([key]))
      }

      async function save() {
        const form = settingsForm
        if (form === null) return
        const snapshot = typeof form.getSnapshot === 'function' ? form.getSnapshot() : null
        const revision = snapshot !== null && typeof snapshot === 'object' ? snapshot.revision : undefined
        setSaving(true)
        setNotice('')
        try {
          await form.mutate([
            { op: 'set', path: ['toolEnabled'], value: draftToolEnabled },
            { op: 'set', path: ['panelEnabled'], value: draftPanelEnabled },
            { op: 'set', path: ['defaultModels'], value: draftModels },
            { op: 'set', path: ['defaultChairman'], value: draftChairman },
          ], revision)
          setNotice(t('settings.saved'))
        } catch {
          setNotice(t('settings.saveFailed'))
        }
        setSaving(false)
      }

      if (settingsForm === null) {
        return h('div', { className: 'dsc-settings' },
          h('div', { className: 'dsc-section-title' }, t('settings.title')),
          h('div', { className: 'dsc-warn' }, t('settings.noForm')),
        )
      }

      return h('div', { className: 'dsc-settings' },
        h('div', { className: 'dsc-section-title' }, t('settings.title')),
        h('label', { className: 'dsc-settings-row' },
          h('input', {
            type: 'checkbox',
            checked: draftToolEnabled === true,
            onChange: (event) => setDraftToolEnabled(event.target.checked === true),
          }),
          h('span', null, t('settings.toolEnabled')),
        ),
        h('div', { className: 'dsc-settings-hint' }, t('settings.toolEnabledHint')),

        h('label', { className: 'dsc-settings-row' },
          h('input', {
            type: 'checkbox',
            checked: draftPanelEnabled === true,
            onChange: (event) => setDraftPanelEnabled(event.target.checked === true),
          }),
          h('span', null, t('settings.panelEnabled')),
        ),
        h('div', { className: 'dsc-settings-hint' }, t('settings.panelEnabledHint')),

        h('div', { className: 'dsc-settings-label' }, t('settings.models')),
        h('div', { className: 'dsc-settings-hint' }, t('settings.modelsHint')),
        state.loading === true && state.catalog.length === 0
          ? h('div', { className: 'dsc-settings-hint' }, t('bar.loading'))
          : null,
        state.loadError !== '' ? h('div', { className: 'dsc-warn' }, state.loadError) : null,
        groups.length === 0 && state.loading !== true
          ? h('div', { className: 'dsc-settings-hint' }, t('bar.empty'))
          : null,
        groups.map((group) => h('div', { className: 'dsc-settings-group', key: group.provider },
          h('div', { className: 'dsc-settings-group-name' }, group.name),
          h('div', { className: 'dsc-settings-grid' },
            group.rows.map((row) => {
              const key = `${row.provider}/${row.model}`
              return h('label', { className: 'dsc-settings-cell', key, title: row.model },
                h('input', {
                  type: 'checkbox',
                  checked: draftModels.includes(key),
                  onChange: () => toggleModel(key),
                }),
                h('span', null, row.name),
              )
            }),
          ),
        )),
        missing.length > 0
          ? h('div', { className: 'dsc-warn' }, t('settings.unavailable', { list: missing.join('、') }))
          : null,

        h('div', { className: 'dsc-settings-label' }, t('settings.chairman')),
        h('select', {
          className: 'dsc-settings-select',
          value: draftChairman,
          onChange: (event) => setDraftChairman(event.target.value),
        },
          h('option', { value: '' }, t('settings.chairmanAuto')),
          state.catalog.map((row) => {
            const key = `${row.provider}/${row.model}`
            return h('option', { value: key, key }, `${row.providerName} · ${row.name}`)
          }),
          missing.includes(draftChairman) ? h('option', { value: draftChairman }, draftChairman) : null,
        ),

        h('div', { className: 'dsc-settings-actions' },
          h('button', {
            type: 'button',
            className: 'dsc-btn',
            disabled: saving === true || ready !== true,
            onClick: () => { void save() },
          }, saving === true ? t('settings.saving') : t('settings.save')),
          notice !== '' ? h('span', { className: 'dsc-settings-hint' }, notice) : null,
        ),
      )
    }

    async function openCouncilTab(request) {
      const asked = request !== null && request !== undefined && typeof request.question === 'string' ? request.question.trim() : ''
      /* Publish the question AFTER the session switch below: publishing first
         made switchSession's saveSessionState write the new question into the
         OLD session's cache, so switching back showed the other chat's text. */
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
      /* Route through switchSession: publishing sessionId directly bypassed
         the teardown, so a run started in session A kept streaming (and
         delivering) into session B. */
      if (sessionId !== '') {
        if (sessionId === store.state.sessionId) store.publish({ sessionId })
        else switchSession(sessionId)
      }
      /* Now that the session is settled, the fresh question cannot leak into
         the previous session's cache. */
      store.publish({ question: asked })
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

    /** Draft selector shared by both bridge variants. */
    function selectDraft(state) {
      return state !== null && state !== undefined && typeof state.draft === 'string' ? state.draft : ''
    }

    /** Publishes bridge values from an effect — never during render. */
    function CouncilBridgeWriter(props) {
      const draft = typeof props.draft === 'string' ? props.draft : ''
      React.useEffect(() => {
        draftBridge.draft = draft
      }, [draft])
      React.useEffect(() => {
        if (typeof props.sessionId === 'string') draftBridge.sessionId = props.sessionId
      }, [props.sessionId])
      React.useEffect(() => {
        if (props.inputActions !== undefined) draftBridge.inputActions = props.inputActions
      }, [props.inputActions])
      React.useEffect(() => {
        if (typeof props.sessionId === 'string' && props.sessionId !== '') switchSession(props.sessionId)
      }, [props.sessionId])
      return h('span', { hidden: true, 'aria-hidden': true, style: { display: 'none' } })
    }

    /**
     * The host's input hook may or may not be provided, and a hook cannot be
     * called conditionally. The decision therefore picks a component TYPE:
     * React remounts when the type changes, so hook order stays stable.
     */
    function CouncilBridgeWithInput(props) {
      const draft = props.useInput(selectDraft)
      return h(CouncilBridgeWriter, { draft, sessionId: props.sessionId, inputActions: props.inputActions })
    }

    function CouncilBridgeStatic(props) {
      return h(CouncilBridgeWriter, { draft: '', sessionId: props.sessionId, inputActions: props.inputActions })
    }

    /** Invisible composer bridge: keeps the latest draft and write verbs for /council. */
    function CouncilBridge(props) {
      return typeof props.useInput === 'function'
        ? h(CouncilBridgeWithInput, { useInput: props.useInput, sessionId: props.sessionId, inputActions: props.inputActions })
        : h(CouncilBridgeStatic, { sessionId: props.sessionId, inputActions: props.inputActions })
    }

    /** Sidebar tab body: question, participants, three-stage results. */
    function CouncilTab(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const state = useStore((snapshot) => snapshot)
      const [copied, setCopied] = React.useState(false)

      React.useEffect(() => {
        if (typeof draftBridge.sessionId === 'string' && draftBridge.sessionId !== '') {
          switchSession(draftBridge.sessionId)
        } else {
          initLeaderElection(store.state.sessionId)
        }
        if (state.catalog.length === 0) void loadModels()
        void adoptRunningRun()
        return () => saveSessionState()
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
      const stageRank = { answers: 0, reviews: 1, chairman: 2, done: 3 }
      const stageIndex = run !== null && stageRank[run.stage] !== undefined ? stageRank[run.stage] : 0
      /** Per-seat timing: what explains a slow seat (TTFT vs total). */
      function seatMetrics(seat) {
        if (seat === null || typeof seat !== 'object') return ''
        const seconds = (ms) => (typeof ms === 'number' && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '')
        const total = seconds(seat.elapsedMs)
        const ttft = seconds(seat.ttftMs)
        if (total === '') return ''
        return ttft === '' ? t('metrics.total', { total }) : t('metrics.both', { ttft, total })
      }

      /* Seat phase labels come from the module-scope helper: the floating card
         renders the same seats and used to call a name it could not see. */
      const participants = state.selected.length
      /* Answers + peer reviews per model, plus the chairman. Delivery is NOT a
         model call: `silent` injects the conclusion as context (no provider
         round-trip) and `wake` starts a normal chat turn the user can see.
         Counting it over-reported the cost by one. */
      const estimatedCalls = participants * 2 + (state.useChairman !== false ? 1 : 0)
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

      /* Confirmation is derived, never stored: `isManifestConfirmed()` already
         returned false once the question/session no longer matches the preview. */
      const confirmed = isManifestConfirmed()
      const preview = state.preview !== null && typeof state.preview === 'object' ? state.preview : null

      /** The outbound manifest: what exactly leaves the machine, in plain sight. */
      function manifestPanel() {
        if (state.attachFiles === false) return null
        if (state.previewLoading === true) {
          return h('div', { className: 'dsc-manifest' }, t('panel.previewing'))
        }
        if (state.previewError !== '') {
          return h('div', { className: 'dsc-manifest' },
            h('div', { className: 'dsc-manifest-title' }, t('panel.previewFailed', { message: state.previewError })),
          )
        }
        if (preview === null) return null
        const filesPaths = Array.isArray(preview.filesPaths)
          ? preview.filesPaths.filter((path) => typeof path === 'string')
          : []
        const filesLine = preview.filesState === 'ok' && filesPaths.length > 0
          ? t('panel.previewFiles', {
              count: filesPaths.length,
              chars: typeof preview.filesChars === 'number' ? preview.filesChars : 0,
            })
          : t('panel.previewFilesNone')
        const codeLine = preview.codeState === 'ok' && typeof preview.codeFiles === 'number' && preview.codeFiles > 0
          ? t('panel.previewCode', {
              files: preview.codeFiles,
              chars: typeof preview.codeChars === 'number' ? preview.codeChars : 0,
              discovered: typeof preview.codeDiscovered === 'number' ? preview.codeDiscovered : 0,
              truncated: typeof preview.codeTruncated === 'number' ? preview.codeTruncated : 0,
            })
          : t('panel.previewCodeOff')
        const redactions = Array.isArray(preview.filesRedactions) ? preview.filesRedactions : []
        const workspace = preview.workspace !== null && typeof preview.workspace === 'object' ? preview.workspace : {}
        return h('div', { className: 'dsc-manifest' },
          h('div', { className: 'dsc-manifest-title' }, t('panel.previewTitle')),
          h('div', null, t('panel.previewWorkspace', {
            name: typeof workspace.name === 'string' && workspace.name !== '' ? workspace.name : String(workspace.cwd || '?'),
          })),
          h('div', null, filesLine),
          filesPaths.length > 0
            ? h('div', null,
                h('span', null, t('panel.previewFilesPaths')),
                h('ul', { className: 'dsc-manifest-list' }, filesPaths.map((path) => h('li', { key: path }, path))),
              )
            : null,
          h('div', null, codeLine),
          redactions.length > 0
            ? h('div', { className: 'dsc-manifest-redact' },
                h('div', null, t('panel.previewRedactions', { count: redactions.length })),
                h('ul', { className: 'dsc-manifest-list' }, redactions.map((item, index) => {
                  const row = item !== null && typeof item === 'object' ? item : {}
                  return h('li', { key: `${index}` }, t('panel.previewRedaction', {
                    path: String(row.path || ''),
                    patterns: Array.isArray(row.patterns) ? row.patterns.join(', ') : '',
                  }))
                })),
              )
            : null,
          typeof preview.note === 'string' && preview.note !== ''
            ? h('div', { className: 'dsc-manifest-note' }, t('panel.previewNote', { note: preview.note }))
            : null,
          confirmed !== true
            ? h('div', { className: 'dsc-manifest-stale' }, t('panel.previewStale'))
            : null,
        )
      }

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
              state.useSubagentSeats === true
                ? h('div', { className: 'dsc-hint' },
                    h('label', { className: 'dsc-inline' },
                      h('span', null, t('panel.seatSplit', { count: state.seatSplit })),
                      h('input', {
                        type: 'range', min: 1, max: 5, step: 1,
                        value: state.seatSplit,
                        onChange: (event) => {
                          const value = Number(event.target.value)
                          if (Number.isSafeInteger(value) && value >= 1 && value <= 5) {
                            store.publish({ seatSplit: value })
                            persist()
                          }
                        },
                      }),
                    ),
                  )
                : null,
            ),            h('div', { className: 'dsc-field' },
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
            manifestPanel(),
            h('div', { className: 'dsc-actions' },
              h('span', { className: 'dsc-hint' }, t('panel.cost', { count: estimatedCalls })),
              h('button', {
                type: 'button',
                className: 'dsc-primary',
                disabled: state.running,
                onClick: () => void startRun(),
              }, state.running ? t('panel.running') : confirmed ? t('panel.confirmRun') : t('panel.run')),
              state.attachFiles !== false
                ? h('button', {
                    type: 'button',
                    className: 'dsc-secondary',
                    disabled: state.running || state.previewLoading === true,
                    onClick: () => void previewManifest(),
                  }, state.previewLoading === true ? t('panel.previewing') : t('panel.preview'))
                : null,
              state.running === true || (run !== null && run.status === 'running')
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
                    run.codeState === 'ok' && run.codeFiles > 0
                      ? h('span', { className: 'dsc-note' }, t('panel.codeAttached', {
                          count: run.codeFiles,
                          chars: run.codeChars,
                        }))
                      : null,
                    run.seatMode === 'subagent'
                      ? h('span', { className: 'dsc-note' }, t('panel.seatModeHybrid', {
                          sub: typeof run.subagentSeats === 'number' ? run.subagentSeats : 0,
                          fast: run.answers !== undefined && Array.isArray(run.answers)
                            ? Math.max(0, run.answers.length - (typeof run.subagentSeats === 'number' ? run.subagentSeats : 0))
                            : 0,
                        }))
                      : state.useSubagentSeats !== false
                        ? h('span', { className: 'dsc-warn' }, t('panel.seatModeFallback'))
                        : null,
                    run.status === 'done' && resumedMode !== ''
                      ? h('span', { className: 'dsc-note' },
                          resumedMode === 'silent' ? t('panel.feedbackSilentSent') : t('panel.feedbackWakeSent'))
                      : null,
                    run.status === 'done' && resumedMode === '' && state.feedbackNote === 'another-tab'
                      ? h('span', { className: 'dsc-note' }, t('panel.feedbackOtherTab'))
                      : null,
                    run.status === 'done' && resumedMode === '' && state.feedbackNote === 'tool-delivered'
                      ? h('span', { className: 'dsc-note' }, t('feedback.toolDelivered'))
                      : null,
                    typeof run.chairmanProblem === 'string' && run.chairmanProblem !== ''
                      ? h('span', { className: 'dsc-warn' }, t('chairman.fallback', { problem: run.chairmanProblem }))
                      : null,
                  ),
                  /* Planned waves / stage budgets and a degradation note, in
                     the sidebar as well: the run card alone is not where a user
                     waits out a 20-minute review. Empty for an old snapshot. */
                  ...planNodesOf(t, run),
                  h('div', { className: 'dsc-grid' },
                    run.answers.map((answer) => h('div', { className: 'dsc-card', key: answer.key },
                      h('div', { className: 'dsc-card-head' },
                        h('span', { className: 'dsc-card-title', title: answer.model }, answer.name),
                        h('span', { className: 'dsc-badge' },
                          answer.error !== '' ? t('status.error') : answer.done
                            ? (answer.seat !== null && typeof answer.seat === 'object' && answer.seat.fallback === true
                                ? t('status.fallback')
                                : t('status.done'))
                            : seatStatusText(t, answer.seat)),
                        answer.done === true && seatMetrics(answer.seat) !== ''
                          ? h('span', { className: 'dsc-metrics', title: t('metrics.hint') }, seatMetrics(answer.seat))
                          : null,
                      ),
                      answer.error !== ''
                        ? h('div', { className: 'dsc-error-box' }, answer.error)
                        : h('div', { className: 'dsc-card-text' }, answer.text !== ''
                            ? answer.text
                            : (run.seatMode === 'subagent' && answer.seat !== null && typeof answer.seat === 'object' && answer.seat.phase !== 'done'
                                ? t('seat.subagentWaiting')
                                : '…')),
                    )),
                  ),
                  run.reviews.length > 0 && stageIndex >= 1
                    ? h('div', { className: 'dsc-section' },
                        h('div', { className: 'dsc-section-title' }, t('panel.reviews')),
                        h('div', { className: 'dsc-grid dsc-grid-small' },
                          run.reviews.map((review) => h('div', { className: 'dsc-card', key: review.key },
                            h('div', { className: 'dsc-card-head' },
                              h('span', { className: 'dsc-card-title' }, review.reviewer),
                              h('span', { className: 'dsc-badge' },
                                review.error !== '' ? t('status.error') : review.done ? t('status.done') : seatStatusText(t, review.seat)),
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
     * Conversation card — `tool.call.toolview`, key `council_review`       *
     * ------------------------------------------------------------------ */

    /* Field readers over a Tool argument view. The Tool layer hands a lazy
       `PartialArguments` reader with methods, never a plain object; the
       property arm keeps callers that pass literal args (the offline harness)
       working. Every reader is total: a missing or mistyped field is empty. */
    function toolArgValue(args, key) {
      if (args === null || args === undefined || typeof args !== 'object') return undefined
      if (typeof args.value === 'function') return args.value(key)
      return args[key]
    }

    function toolArgText(args, key) {
      if (args === null || args === undefined || typeof args !== 'object') return ''
      if (typeof args.text === 'function') {
        const text = args.text(key)
        return typeof text === 'string' ? text : ''
      }
      const text = args[key]
      return typeof text === 'string' ? text : ''
    }

    /**
     * The argument view of any stage. Preparing, start and result all expose
     * `block.args`; a settled call additionally carries `block.call.argsRaw`
     * and `block.content`.
     */
    function toolArgsOf(block) {
      if (block === null || block === undefined || typeof block !== 'object') return undefined
      return block.args
    }

    /** `[{provider, model}, …]` or bare strings; anything else is dropped. */
    function toolModelLabels(args) {
      const raw = toolArgValue(args, 'models')
      if (!Array.isArray(raw)) return []
      const labels = []
      for (const entry of raw) {
        if (typeof entry === 'string') {
          if (entry !== '') labels.push(entry)
          continue
        }
        if (entry === null || typeof entry !== 'object') continue
        const provider = typeof entry.provider === 'string' ? entry.provider : ''
        const model = typeof entry.model === 'string' ? entry.model : ''
        const label = provider !== '' && model !== '' ? `${provider}/${model}` : model !== '' ? model : provider
        if (label !== '') labels.push(label)
      }
      return labels
    }

    /** Display text of one rendered content block; non-text blocks are skipped. */
    function toolBlockText(block) {
      if (block === null || block === undefined || typeof block !== 'object') return ''
      return typeof block.text === 'string' ? block.text : ''
    }

    /** Characters of the question shown before the expand toggle appears. */
    const TOOL_QUESTION_PREVIEW = 160

    /**
     * In-conversation card for the agent-issued `council_review` call.
     *
     * `phase` is a props discriminant, never `block.phase`; a settled call is
     * recognised by `'kind' in block` and shows `block.content`, the blocks the
     * tool output renderer produced. None of the three stages carries run
     * progress, so the live section reads this module's shared store — the same
     * fact the floating card reads. It starts no poller and no stream.
     */
    function CouncilReviewRow(props) {
      const t = typeof props.t === 'function' ? props.t : tr
      const phase = props.phase
      const block = props.block
      /* Hooks run before any early return: one row can move from preparing to
         start to result across renders, and hook order must not change. */
      const live = useStore((snapshot) => ({
        run: snapshot.run,
        running: snapshot.running,
        runId: snapshot.runId,
        /* Needed to tell a deliberate skip of the post-back (setting on, tool
           run) from a run that was never going to be delivered. */
        feedbackMode: snapshot.feedbackMode,
        /* Which live seat row is open on THIS card. View state only: the
           shipped store subscription repaints the card, run fields are not
           touched, and the floating card keeps its own open row. */
        seatOpenCard: snapshot.seatOpenCard,
      }))
      const [expanded, setExpanded] = React.useState(false)

      if (phase === 'preparing') {
        return h('div', { className: 'dsc-tool' },
          h('div', { className: 'dsc-tool-head' },
            h('span', { className: 'dsc-tool-icon', 'aria-hidden': true }, '⚖'),
            h('span', { className: 'dsc-tool-title' }, t('toolview.preparing')),
          ),
        )
      }

      const args = toolArgsOf(block)
      const question = toolArgText(args, 'question')
      const models = toolModelLabels(args)
      const chairmanOn = toolArgValue(args, 'chairman') !== false
      const attachOn = toolArgValue(args, 'attachFiles') !== false

      if (phase === 'result' || (block !== null && typeof block === 'object' && 'kind' in block)) {
        const settled = block !== null && typeof block === 'object' && 'kind' in block
        const content = settled && Array.isArray(block.content) ? block.content : []
        const text = content.map(toolBlockText).filter((chunk) => chunk !== '').join('\n\n')
        const error = settled && block.error !== null && block.error !== undefined && typeof block.error === 'object'
          ? block.error
          : null
        const errorName = error !== null && typeof error.name === 'string' ? error.name : ''
        const errorCode = error !== null && typeof error.code === 'string' ? error.code : ''
        const isError = settled && (block.isError === true || error !== null)
        if (isError) {
          const detail = [errorName, errorCode].filter((part) => part !== '').join(' · ')
          const message = [detail, text].filter((part) => part !== '').join('\n')
          return h('div', { className: 'dsc-tool' },
            h('div', { className: 'dsc-tool-head' },
              h('span', { className: 'dsc-tool-icon', 'aria-hidden': true }, '⚖'),
              h('span', { className: 'dsc-tool-title' }, t('toolview.title')),
              h('span', { className: 'dsc-tool-chip' }, t('toolview.error')),
            ),
            h('div', { className: 'dsc-error-box' }, message !== '' ? message : t('toolview.error')),
          )
        }
        return h('div', { className: 'dsc-tool' },
          h('div', { className: 'dsc-tool-head' },
            h('span', { className: 'dsc-tool-icon', 'aria-hidden': true }, '⚖'),
            h('span', { className: 'dsc-tool-title' }, t('toolview.title')),
            h('span', { className: 'dsc-tool-chip' }, t('status.done')),
          ),
          h('div', { className: 'dsc-section-title' }, t('toolview.result')),
          h('div', { className: 'dsc-tool-text' }, text !== '' ? text : t('toolview.noText')),
        )
      }

      /* start: the dispatched call with complete arguments. */
      const showToggle = question.length > TOOL_QUESTION_PREVIEW
      const shown = showToggle && expanded !== true ? `${question.slice(0, TOOL_QUESTION_PREVIEW)}…` : question

      const run = live.run
      const liveVisible = live.running === true && run !== null && typeof run === 'object'
      /* The live seat region follows `run.stage`, so the reviews and chairman
         minutes stream too instead of leaving only finished answers on screen. */
      const seats = liveVisible ? liveSeatsOf(run) : { stage: 'answers', items: [], role: 'member' }
      const finished = seats.items.filter((item) => item.done === true).length
      const failed = seats.items.filter((item) => seatErrorOf(item) !== '').length
      const roleLabel = seatRoleLabel(t, seats.role)
      const stageNames = {
        answers: t('stage.answers'),
        reviews: t('stage.reviews'),
        chairman: t('stage.chairman'),
        done: t('stage.done'),
      }
      const stage = liveVisible && stageNames[run.stage] !== undefined ? stageNames[run.stage] : stageNames.answers

      /* Where the roster came from, per the run snapshot's `modelSource`:
         'default' = the saved defaultModels, 'explicit' = the tool's own
         `models` argument, 'auto' = the Host picked. The snapshot is
         authoritative because the tool arguments alone cannot tell "no models
         passed" from "the saved defaults were used". Without a snapshot (or
         without the field, or without a count) the card keeps its previous
         wording, so the old path is untouched. */
      const modelSource = run !== null && typeof run.modelSource === 'string' ? run.modelSource : ''
      const rosterCount = run !== null && Array.isArray(run.answers) && run.answers.length > 0
        ? run.answers.length
        : models.length
      const participantsText = rosterCount > 0 && modelSource === 'default'
        ? t('toolview.modelsFromSettings', { count: rosterCount })
        : rosterCount > 0 && modelSource === 'explicit'
          ? t('toolview.modelsFromArgs', { count: rosterCount })
          : models.length > 0 ? t('toolview.models', { count: models.length }) : t('toolview.modelsAuto')
      const toolDelivered = run !== null && run.status === 'done' && run.toolRun === true && live.feedbackMode !== 'off'
      const chairmanProblem = run !== null && typeof run.chairmanProblem === 'string' ? run.chairmanProblem : ''

      return h('div', { className: 'dsc-tool' },
        h('div', { className: 'dsc-tool-head' },
          h('span', { className: 'dsc-tool-icon', 'aria-hidden': true }, '⚖'),
          h('span', { className: 'dsc-tool-title' }, t('toolview.title')),
          h('span', { className: 'dsc-tool-chip' }, liveVisible ? t('status.streaming') : t('toolview.title')),
        ),
        question !== ''
          ? h('div', { className: 'dsc-tool-q', title: question },
              h('span', { className: 'dsc-section-title' }, `${t('toolview.question')} · `),
              shown,
            )
          : null,
        showToggle
          ? h('button', {
              type: 'button',
              className: 'dsc-tool-toggle',
              onClick: () => setExpanded((value) => value !== true),
            }, expanded === true ? t('toolview.showLess') : t('toolview.showFull'))
          : null,
        models.length > 0
          ? h('div', { className: 'dsc-tool-chips' },
              models.map((label, index) => h('span', { className: 'dsc-tool-chip', key: `${index}:${label}` }, label)))
          : null,
        h('div', { className: 'dsc-tool-meta' },
          h('span', null, participantsText),
          h('span', null, chairmanOn ? t('toolview.chairmanOn') : t('toolview.chairmanOff')),
          h('span', null, attachOn ? t('toolview.attachOn') : t('toolview.attachOff')),
        ),
        /* Why this run needs this long, and why it settled off the normal path.
           Outside the live block on purpose: the note must still be readable
           once the run has settled. Both are empty for an old snapshot. */
        ...planNodesOf(t, run),
        /* A configured chairman that was dropped is a warning, not a silent
           detail: the user's choice did not take effect. */
        chairmanProblem !== ''
          ? h('div', { className: 'dsc-warn' }, t('chairman.fallback', { problem: chairmanProblem }))
          : null,
        /* The conclusion already went back as this call's tool result; the
           panel therefore did not post it again, and says so. */
        toolDelivered
          ? h('div', { className: 'dsc-note' }, t('feedback.toolDelivered'))
          : null,
        liveVisible
          ? h('div', { className: 'dsc-tool-live' },
              h('div', { className: 'dsc-tool-live-head' },
                h('span', { className: 'dsc-spinner', 'aria-hidden': true }),
                h('span', null, t('toolview.progress', { stage })),
                h('span', { className: 'dsc-tool-count' }, `${finished}/${seats.items.length}`),
              ),
              failed > 0
                ? h('div', { className: 'dsc-warn' }, t('toolview.failedSeats', { failed, total: seats.items.length }))
                : null,
              seats.items.length > 0
                ? h('div', { className: 'dsc-tool-seats' },
                    seats.items.map((item, index) => {
                      const domKey = seatKeyOf(item, index)
                      const rowKey = seatRowKeyOf(seats.stage, item, index)
                      const open = seatOpenKeyOf(live, 'card') === rowKey
                      const name = seatNameOf(item, index)
                      return h('div', {
                        className: 'dsc-tool-seat' + (open === true ? ' is-open' : ''),
                        key: rowKey,
                      },
                        h('button', {
                          type: 'button',
                          className: 'dsc-seat-row',
                          'aria-expanded': open === true ? 'true' : 'false',
                          'aria-label': open === true ? t('seat.collapse') : t('seat.expand'),
                          title: open === true ? t('seat.collapse') : t('seat.expand'),
                          onClick: () => toggleSeatRow('card', rowKey),
                        },
                          h('span', { className: 'dsc-float-dot' + seatToneClass(item) }),
                          roleLabel !== '' ? h('span', { className: 'dsc-seat-role' }, roleLabel) : null,
                          h('span', { className: 'dsc-tool-seat-name', title: name }, name),
                          h('span', { className: 'dsc-tool-seat-state' },
                            seatErrorOf(item) !== '' ? t('toolview.seatFailed')
                              : seatThinking(item) ? t('seat.thinking')
                                : item.done === true ? t('toolview.seatDone') : t('toolview.seatRunning')),
                          h('span', { className: 'dsc-seat-caret', 'aria-hidden': true }, open === true ? '▾' : '▸'),
                        ),
                        /* The live reasoning/answer body exists only while this
                           row is open: a collapsed seat is one line, never a
                           4000-char window. */
                        open === true ? seatDetailNodes(t, item, 'card', rowKey, domKey) : null,
                      )
                    }),
                  )
                : h('div', { className: 'dsc-seat-waiting' }, t('seat.stageWaiting')),
            )
          : null,
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
          if (typeof dispose !== 'function') return dispose
          /* A disposer registered after teardown would never run: run it now
             instead of leaking whatever it was meant to clean up. */
          if (retired) {
            try {
              dispose()
            } catch {
              /* best effort */
            }
            return () => {}
          }
          disposers.push(dispose)
          return dispose
        }
        const teardown = () => {
          if (retired) return
          retired = true
          stopPolling()
          stopEventStream()
          if (leaderTimer !== 0) {
            window.clearInterval(leaderTimer)
            leaderTimer = 0
          }
          if (leaderChannel !== null) {
            try {
              leaderChannel.close()
            } catch {
              /* best effort */
            }
            leaderChannel = null
          }
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

        /* The settings page is written against the Host-backed form for this
           plugin's own cordis entry. `configForms` is absent on a client that
           did not compose the settings layer, so this is feature-detected
           rather than injected: the page then renders an explanation instead
           of failing the whole plugin. */
        track(ctx.effect(() => {
          const forms = service('configForms')
          if (forms === undefined || forms === null || typeof forms.get !== 'function') return undefined
          let bound = null
          try {
            bound = forms.get(CONFIG_ENTRY_ID)
          } catch {
            bound = null
          }
          if (bound === null || bound === undefined) return undefined
          settingsForm = bound
          return () => {
            if (settingsForm === bound) settingsForm = null
          }
        }, 'council: settings form binding'))

        track(ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: CONFIG_ENTRY_ID,
            order: 60,
            label: () => tr('settings.title'),
            locale: NS,
          }, CouncilSettingsSection)))

        track(ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register({
            name: 'conversation.input.overlay',
            id: 'council-status',
            order: 120,
            label: () => tr('overlay.title'),
            locale: NS,
          }, CouncilStatusOverlay)))

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

        /* Keyed by the exact wire tool name: the slot dispatches on `key`, and
           a typo never renders. `council_review` is unclaimed, so this replaces
           no shipped view. Without `locale` the framework would not inject the
           `t` seat. */
        track(ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'council_review',
            locale: NS,
          }, CouncilReviewRow)))

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
