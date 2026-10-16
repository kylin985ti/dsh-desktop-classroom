import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LibraryAIError, collaborationError } from '../lib/ai-errors.mjs';

test('AI failures identify model, authentication, quota, rate and network causes', () => {
  for (const [code, expected] of [
    ['NO_ADAPTER', 'AI_CONFIGURATION'], ['UNKNOWN_MODEL', 'AI_CONFIGURATION'],
    ['INVALID_CONFIG', 'AI_CONFIGURATION'], ['MISSING_CREDENTIAL', 'AI_AUTHENTICATION'],
    ['QUOTA_EXCEEDED', 'AI_QUOTA'], ['RATE_LIMITED', 'AI_RATE_LIMIT'],
    ['ECONNRESET', 'AI_CONNECTION'], ['UND_ERR_CONNECT_TIMEOUT', 'AI_TIMEOUT'],
  ]) {
    const error = collaborationError({ code, message: 'private provider response' });
    assert.equal(error.code, expected);
    assert.equal(error.diagnosticCode, code);
    assert.ok(!error.message.includes('private'));
    assert.ok(!error.message.includes('文件和读取权限'));
  }
});

test('HTTP and nested transport failures have actionable messages', () => {
  assert.equal(collaborationError({ status: 401 }).code, 'AI_AUTHENTICATION');
  assert.equal(collaborationError({ statusCode: 429 }).code, 'AI_RATE_LIMIT');
  assert.equal(collaborationError({ cause: { code: 'ENOTFOUND' } }).code, 'AI_CONNECTION');
  assert.equal(collaborationError(new TypeError('fetch failed')).code, 'AI_CONNECTION');
});

test('deadline cancellation is distinct from plugin or user cancellation', () => {
  const timeout = new AbortController();
  timeout.abort(new DOMException('internal deadline', 'TimeoutError'));
  assert.equal(collaborationError(new DOMException('aborted', 'AbortError'), timeout.signal).code, 'AI_TIMEOUT');
  const cancel = new AbortController();
  cancel.abort();
  assert.equal(collaborationError(new Error('internal'), cancel.signal).code, 'AI_CANCELLED');
});

test('unknown provider responses and malformed codes never become user text or diagnostics', () => {
  const secret = 'Bearer private-test-value';
  const error = collaborationError({ code: secret, message: '文件 ' + secret });
  assert.equal(error.code, 'AI_REQUEST_FAILED');
  assert.equal(error.diagnosticCode, 'UNKNOWN');
  assert.ok(!JSON.stringify(error).includes(secret));
  assert.ok(!error.message.includes(secret));
});

test('known library AI failures retain their stable code and message', () => {
  const error = new LibraryAIError('AI_INCOMPLETE', 'AI 回复未完整生成');
  assert.equal(collaborationError(error), error);
});
