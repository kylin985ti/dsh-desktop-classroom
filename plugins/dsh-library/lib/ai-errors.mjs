// Provider messages may contain URLs, request bodies or credentials. Keep them
// on the provider side and expose only stable, actionable library errors.
export class LibraryAIError extends Error {
  constructor(code, message, diagnosticCode = code) {
    super(message);
    this.name = 'LibraryAIError';
    this.code = code;
    this.diagnosticCode = diagnosticCode;
  }
}

export function collaborationError(error, signal) {
  if (error instanceof LibraryAIError) return error;
  const rawCode = String(error?.code || error?.cause?.code || 'UNKNOWN');
  const diagnostic = /^[A-Z][A-Z0-9_]{0,79}$/.test(rawCode) ? rawCode : 'UNKNOWN';
  const status = error?.status ?? error?.statusCode;
  const failure = (code, message) => new LibraryAIError(code, message, diagnostic);
  if (signal?.reason?.name === 'TimeoutError' || error?.name === 'TimeoutError' || /TIMEOUT|TIMEDOUT/.test(diagnostic)) {
    return failure('AI_TIMEOUT', 'AI 请求超时，已停止等待。请稍后重试，或缩短正文和问题。');
  }
  if (signal?.aborted || error?.name === 'AbortError') {
    return failure('AI_CANCELLED', 'AI 请求已取消，问题和文件内容已保留，可以重新提问。');
  }
  if (['NO_ADAPTER', 'UNKNOWN_MODEL', 'INVALID_CONFIG'].includes(diagnostic)) {
    return failure('AI_CONFIGURATION', 'AI 协作的服务或模型配置不可用，请在资料库插件设置中检查模型。');
  }
  if (/CREDENTIAL|AUTHENTICAT|UNAUTHORIZED|FORBIDDEN|API_KEY/.test(diagnostic) || status === 401 || status === 403) {
    return failure('AI_AUTHENTICATION', 'AI 服务认证失败，请到 DSH 的模型设置中检查登录或密钥。');
  }
  if (/QUOTA|CREDIT|BALANCE/.test(diagnostic)) {
    return failure('AI_QUOTA', 'AI 服务额度不足，请检查服务账户后再试。');
  }
  if (/RATE_LIMIT|TOO_MANY_REQUESTS/.test(diagnostic) || status === 429) {
    return failure('AI_RATE_LIMIT', 'AI 服务请求过于频繁，请稍后重试。');
  }
  if (/ECONN|ENET|EHOST|ENOTFOUND|EAI_AGAIN|NETWORK|FETCH_FAILED|UND_ERR/.test(diagnostic) || error?.message === 'fetch failed') {
    return failure('AI_CONNECTION', 'AI 服务连接失败，请检查网络或代理后重试。');
  }
  return failure('AI_REQUEST_FAILED', 'AI 服务未能完成本次提问，请稍后重试。问题和文件内容已保留。');
}
