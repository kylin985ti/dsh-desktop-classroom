/**
 * Native DSH draft and explicit reply-read bridge, without creation or submission.
 * Call only from an explicit user action, with a provider-scoped desktopWorkbenches
 * service. The caller owns context minimization and any explicit create/picker UI.
 */
// DSH records these host snapshots as user/message events too. They carry no
// authored turn; unknown sources still count as users so a new request fails closed.
const HOST_CONTEXT_SOURCES = new Set(['runtime-context', 'skill-catalog'])
const isAuthoredUserEvent = event => event?.type === 'user/message' && event.data?.role === 'user'
  && !HOST_CONTEXT_SOURCES.has(event.data.source?.kind)

/** Keep the current planning binding alive across panel close and native-chat open. */
export function keepOwnedPlanningSession(cache, service, sessionId) {
  const host = inspectNativeDraftHost(service)
  if (!host.supported || !host.owned || host.sessionId !== sessionId) throw new Error('规划会话归属已变化，未保留其他会话。')
  if (cache.nativeLease?.sessionId === sessionId && cache.nativeLease.service === service) return
  const reference = service.ctx.sessions.retain(sessionId, { source: 'taskboardPlanningLifetime' })
  let released = false
  const next = { sessionId, service, release: () => { if (!released) { released = true; reference.release() } } }
  const previous = cache.nativeLease
  cache.nativeLease = next
  Promise.resolve(reference.ready).then(() => previous?.release(), () => {
    if (cache.nativeLease === next) cache.nativeLease = null
    next.release(); previous?.release()
  })
}

export function releaseOwnedPlanningSession(cache) {
  if (!cache) return
  const current = cache.nativeLease
  cache.nativeLease = null
  current?.release()
}

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
    const prompt = durable.slice(0, last).findLast(entry => isAuthoredUserEvent(entry.event)
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

/**
 * Explicit planning-button submission through the retained public Session face.
 * It never edits, submits or clears the native composer. The caller creates a
 * dedicated owned planning session; subscriptions observe that session only.
 */
export async function runOwnedPlanningTurn({ service, sessionId, prompt, signal,
  isCurrent = () => true, validate = () => {}, onProgress = () => {}, onDispatch = () => {}, timeoutMs = 180000 }) {
  if (typeof prompt !== 'string' || !prompt || prompt.length > 60000) throw new Error('本次规划资料为空或过长。')
  const verify = () => {
    const host = inspectNativeDraftHost(service)
    if (signal?.aborted) throw new DOMException('已停止等待本轮结果。', 'AbortError')
    if (!isCurrent() || !host.supported || !sessionId || host.sessionId !== sessionId || !host.owned) {
      throw new Error('工作台或规划会话已切换，本轮结果没有加入其他方案。')
    }
    validate()
  }
  let reference, disposeEvents, disposeSession, timer, abortListener
  try {
    verify()
    reference = service.ctx.sessions.retain(sessionId, { source: 'taskboardAIPlanning' })
    const binding = await new Promise((resolve, reject) => {
      let readyTimer
      const cleanup = () => { clearTimeout(readyTimer); signal?.removeEventListener('abort', cancel) }
      const cancel = () => { cleanup(); reject(new DOMException('已取消准备规划会话。', 'AbortError')) }
      readyTimer = setTimeout(() => { cleanup(); reject(new Error('规划会话准备超时，请稍后重试。')) }, Math.min(timeoutMs, 15000))
      const finish = callback => value => {
        cleanup(); callback(value)
      }
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
      Promise.resolve(reference.ready).then(finish(resolve), finish(reject))
    })
    verify()
    const session = binding?.session, source = binding?.eventSource
    if (binding?.sessionId !== sessionId || !binding.ctx || typeof session?.prompt !== 'function'
      || typeof session?.getSnapshot !== 'function' || typeof session?.subscribe !== 'function'
      || typeof source?.getSnapshot !== 'function' || typeof source?.subscribe !== 'function') {
      throw new Error('当前宿主未提供完整的规划提交接口，请使用原生会话入口。')
    }
    const input = service.ctx.conversation.input.for(binding.ctx)?.state?.getSnapshot()
    if (input?.phase !== 'plain' || input.draft !== '' || !Array.isArray(input.attachmentIds) || input.attachmentIds.length) {
      throw new Error('规划会话的原生草稿已有文字、附件或正在处理，已保留原样；请先处理草稿。')
    }
    const initial = session.getSnapshot()
    if (initial.sessionId !== sessionId || initial.removed || initial.openState !== 'open') throw new Error('规划会话尚未就绪，请稍后再试。')
    if (initial.running || initial.pendingSubmissions?.length) throw new Error('规划会话仍在生成，请先等待或接收本轮结果。')
    let admitted = false, observedPrompt = false, settled = false, inspect
    const result = new Promise((resolve, reject) => {
      const fail = error => { if (!settled) { settled = true; reject(error) } }
      inspect = () => {
        if (settled) return
        try {
          verify()
          const state = session.getSnapshot()
          if (state.removed || state.openState !== 'open') throw new Error('规划会话已经关闭，本轮结果未应用。')
          if (state.promptError && state.promptError !== initial.promptError) {
            throw new Error(state.promptError.message || '原生 AI 请求失败，请检查模型连接后重试。')
          }
          const entries = source.getSnapshot()?.entries
          if (!Array.isArray(entries) || entries.length > 20000) throw new Error('规划会话内容过长，请开始新的规划会话。')
          const durable = entries.filter(entry => entry?.type !== 'transient' && entry?.event?.surfaceOp === 'append')
          const textOf = message => (message?.content || []).filter(block => block.type === 'text').map(block => block.text).join('')
          const lastUser = durable.findLastIndex(entry => isAuthoredUserEvent(entry.event))
          const matches = lastUser >= 0 && textOf(durable[lastUser].event.data).trim() === prompt.trim()
          if (!matches) {
            if (observedPrompt) throw new Error('本轮之后会话又收到其他消息，请重新生成规划以免混入另一轮建议。')
            return
          }
          observedPrompt = true
          onProgress(state.running || state.awaitingFirstTurn ? 'AI 正在规划，当前任务保持原样…' : '正在接收完整方案…')
          if (!admitted || state.running || state.awaitingFirstTurn || state.pendingSubmissions?.length) return
          const reply = durable.slice(lastUser + 1).findLast(entry => entry.event.type === 'assistant/message')?.event
          if (!reply) return
          if (reply.data?.interrupted || reply.data?.message?.role !== 'assistant') throw new Error('AI 回复被中断，上一版方案已保留。')
          const text = textOf(reply.data.message).trim()
          if (!text || text.length > 150000) throw new Error('AI 回复为空或过长，请缩小范围后重试。')
          settled = true; resolve({ sessionId, text, prompt, replySeq: reply.seq })
        } catch (error) { fail(error) }
      }
      abortListener = () => fail(new DOMException('已停止等待，本轮没有修改任务。可稍后接收结果。', 'AbortError'))
      signal?.addEventListener('abort', abortListener, { once: true })
      timer = setTimeout(() => fail(new Error('等待本轮结果超时，上一版保留。可稍后接收本轮结果；没有自动重发。')), timeoutMs)
      disposeEvents = source.subscribe(inspect)
      disposeSession = session.subscribe(inspect)
    })
    // Install a rejection handler before awaiting admission: cancellation can
    // happen during the Host round-trip and must never be an unhandled promise.
    result.catch(() => {})
    verify()
    onDispatch()
    const admission = await session.prompt([{ type: 'text', text: prompt }], 'queue', signal)
    if (!admission?.ok) throw new Error(admission?.error?.message || '原生 AI 没有接收本次规划请求。')
    admitted = true; inspect()
    return await result
  } finally {
    clearTimeout(timer); disposeEvents?.(); disposeSession?.()
    if (abortListener) signal?.removeEventListener('abort', abortListener)
    reference?.release()
  }
}
