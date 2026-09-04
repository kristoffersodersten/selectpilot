// module_name: api_request_hardening_tests
// spec_ref: "privacy_and_debug_policy"
import assert from 'node:assert/strict';
import test from 'node:test';

const { ApiRequestError, apiRequest } = await import('../../api/request.js');

test('request timeout aborts a hung local runtime explicitly', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    apiRequest('http://127.0.0.1:11435/hung', { timeoutMs: 100 }),
    (error) => error instanceof ApiRequestError && error.code === 'request_timeout' && error.status === 0,
  );
});

test('untrusted response bodies are not reflected in fallback errors', async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('secret model output', { status: 502 });
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    apiRequest('http://127.0.0.1:11435/failure'),
    (error) => error instanceof ApiRequestError
      && error.code === 'http_502'
      && !error.message.includes('secret model output'),
  );
});

test('timeout budget is bounded by contract', async () => {
  await assert.rejects(apiRequest('http://127.0.0.1:11435', { timeoutMs: 0 }), TypeError);
  await assert.rejects(apiRequest('http://127.0.0.1:11435', { timeoutMs: 120_001 }), TypeError);
});
