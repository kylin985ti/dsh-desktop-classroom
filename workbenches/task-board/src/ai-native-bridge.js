/**
 * Native DSH draft and explicit reply-read bridge, without creation or submission.
 * Call only from an explicit user action, with a provider-scoped desktopWorkbenches
 * service. The caller owns context minimization and any explicit create/picker UI.
 */
export function inspectNativeDraftHost(service) {
  try {
    if (!service || typeof service.currentSession !== 'function' || typeof service.ownsSession !== 'function'
      || typeof service.isActive !== 'function') return { supported: false, reason: '当前宿主未提供可验证的工作台会话 API。' }
    if (!service.isActive()) return { supported: false, reason: '请先回到当前任务栏工作台，再放入原生草稿。' }
    const sessions = service.ctx?.sessions, conversation = service.ctx?.conversation
    if (typeof sessions?.retain !== 'function' || typeof conversation?.input?.for !== 'function') {
      return { supported: false, reason: '当前宿主未提供公开原生草稿接口；请复制提示词后手动粘贴。' }
    }
    const sessionId = service.currentSession()
    const owned = !!sessionId && service.ownsSession(sessionId)
    const workspace = typeof service.defaultWorkspace === 'function' ? service.defaultWorkspace() : null
    return { supported: true, sessionId, owned, workspaceId: workspace?.workspaceId }
  } catch {
    return { supported: false, reason: '无法验证当前会话的工作台归属；不会写入其他会话，请使用复制提示词。' }
  }
}

export function inspectNativeReplyHost(service) {
  try {
    if (!service || typeof service.currentSession !== 'function' || typeof service.ownsSession !== 'function'
      || typeof service.isActive !== 'function' || !service.isActive()
      || typeof service.ctx?.sessions?.retain !== 'function') {
      return { supported: false, reason: '当前宿主没有可验证的原生回复读取接口，请使用手动粘贴。' }
    }
    const sessionId = service.currentSession()
    return { supported: true, sessionId, owned: !!sessionId && service.ownsSession(sessionId) }
  } catch { return { supported: false, reason: '无法验证当前会话归属，请使用手动粘贴。' } }
}

/** Read only the current owned session's loaded, completed transcript on a click. */
export async function readOwnedNativeReply({ service, sessionId, isCurrent = () => true, validate = () => {} }) {
  const initial = inspectNativeReplyHost(service)
  const target = sessionId || initial.sessionId
  const verify = () => {
    const state = inspectNativeReplyHost(service)
    if (!isCurrent() || !state.supported || !state.owned || !target || state.sessionId !== target) {
      throw new Error('会话或任务范围已切换，或会话不属于本工作台；没有导入其他会话。')
    }
    validate()
  }
  let reference
  try {
    verify()
    reference = service.ctx.sessions.retain(target, { source: 'taskboardAIReplyImport' })
    const binding = await reference.ready
    verify()
    if (binding?.sessionId !== target || typeof binding.session?.getSnapshot !== 'function'
      || typeof binding.eventSource?.getSnapshot !== 'function') throw new Error('宿主没有可用的只读回复接口，请手动粘贴。')
    const state = binding.session.getSnapshot()
    if (state.sessionId !== target || state.removed || state.openState !== 'open') throw new Error('原生会话尚未就绪，请稍后重试。')
    if (state.running || state.awaitingFirstTurn || state.pendingSubmissions?.length) throw new Error('AI 仍在生成或等待提交，请完成后再导入。')
    const entries = binding.eventSource.getSnapshot()?.entries
    if (!Array.isArray(entries) || entries.length > 20000) throw new Error('当前会话窗口无法安全读取，请手动粘贴完整回复。')
    const durable = entries.filter(entry => entry?.type !== 'transient' && entry?.event?.surfaceOp === 'append')
    const last = durable.findLastIndex(entry => entry.event.type === 'assistant/message')
    const reply = durable[last]?.event
    if (!reply || reply.data?.interrupted === true || reply.data?.message?.role !== 'assistant') throw new Error('当前会话还没有完整 AI 回复，请完成后再导入。')
    const textOf = (message, limit) => {
      if (!Array.isArray(message?.content)) throw new Error('回复内容格式不受支持，请手动粘贴。')
      let text = ''
      for (const block of message.content) if (block.type === 'text') {
        if (typeof block.text !== 'string' || text.length + block.text.length > limit) throw new Error('原生消息过长，请缩小任务范围后重新生成。')
        text += block.text
      }
      return text.trim()
    }
    const text = textOf(reply.data.message, 150000)
    // User-authored context must precede the selected answer; tool output and
    // assistant prose cannot supply an import baseline or a request identity.
    const prompt = durable.slice(0, last).findLast(entry => entry.event.type === 'user/message'
      && entry.event.data?.role === 'user'
      && entry.event.data.content?.some(block => block.type === 'text' && block.text?.startsWith('# 排期与工作域建议')))
    if (!prompt) throw new Error('没有找到这条建议对应的排期上下文，请使用本次提示词重新生成。')
    const promptText = textOf(prompt.event.data, 60000)
    verify()
    if (binding.session.getSnapshot().running || binding.eventSource.getSnapshot().entries !== entries) throw new Error('原生回复正在变化，请完成后重试。')
    return { sessionId: target, text, prompt: promptText, replySeq: reply.seq }
  } finally { reference?.release() }
}

/**
 * @param {{service: object, sessionId: string, prompt: string,
 *   isCurrent?: () => boolean, validate?: () => void}} options
 * @returns {Promise<{sessionId: string, unchanged: boolean}>}
 *
 * Uses only sessions.retain(id).ready -> binding.ctx -> conversation.input.for(ctx)
 * -> input.state.getSnapshot()/input.setDraft(text). It never calls newSession,
 * newWorkspaceSession, ensureSession, prompt, send, submit, pickers or remote APIs.
 */
export async function placeOwnedNativeDraft({ service, sessionId, prompt, isCurrent = () => true, validate = () => {} }) {
  if (typeof prompt !== 'string' || !prompt || prompt.length > 60000) throw new Error('原生草稿必须是已预览的有界提示词。')
  const verify = () => {
    if (!isCurrent()) throw new Error('当前上下文已关闭或变更，未写入原生草稿。')
    if (!service || typeof service.currentSession !== 'function' || typeof service.ownsSession !== 'function'
      || typeof service.isActive !== 'function' || !sessionId || !service.isActive()
      || service.currentSession() !== sessionId || !service.ownsSession(sessionId)) {
      throw new Error('会话或工作台已切换，或会话不属于本工作台；未放入草稿。')
    }
    validate()
  }
  let reference
  try {
    verify()
    const sessions = service.ctx?.sessions, conversation = service.ctx?.conversation
    if (typeof sessions?.retain !== 'function' || typeof conversation?.input?.for !== 'function') {
      throw new Error('当前宿主没有公开原生草稿接口，请使用复制提示词。')
    }
    reference = sessions.retain(sessionId, { source: 'taskboardAISchedule' })
    const binding = await reference.ready
    verify()
    if (!binding || binding.sessionId !== sessionId || !binding.ctx) throw new Error('宿主返回的会话作用域与本次目标不符，未写入草稿。')
    const input = conversation.input.for(binding.ctx)
    if (typeof input?.setDraft !== 'function' || typeof input?.state?.getSnapshot !== 'function') {
      throw new Error('当前宿主没有可用的公开草稿接口，请使用复制提示词。')
    }
    const state = input.state.getSnapshot()
    if (state?.phase === 'adjudicating' || state?.phase === 'submitting') throw new Error('原生输入框正在提交，请稍后重试。')
    if (typeof state?.draft !== 'string' || !Array.isArray(state?.attachmentIds)
      || !['plain', 'claimed'].includes(state.phase)) throw new Error('无法安全读取原生草稿状态，请使用复制提示词。')
    if (state.attachmentIds.length > 0 || state.draft !== prompt && state.draft.length > 0) {
      throw new Error('当前原生草稿已有文字或附件，已保留原样。请先处理草稿、新建本工作台会话，或使用复制提示词。')
    }
    verify()
    const unchanged = state.draft === prompt
    // Draft-only public facade; the user still explicitly clicks native Send.
    if (!unchanged) input.setDraft(prompt)
    return { sessionId, unchanged }
  } finally { reference?.release() }
}
