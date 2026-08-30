import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('checkout renders untrusted values as text and bounds polling/network waits', async () => {
  const source = await readFile(new URL('../../site/checkout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML/);
  assert.match(source, /textContent = token/);
  assert.match(source, /AbortController/);
  assert.match(source, /POLL_DEADLINE_MS/);
  assert.match(source, /Math\.min\(15_000/);
});

test('checkout never reports final success before claim acknowledgement', async () => {
  const source = await readFile(new URL('../../site/checkout.js', import.meta.url), 'utf8');
  const acknowledge = source.indexOf("await post('/v1/claims/ack'");
  const success = source.indexOf("message('License copied'");
  assert.ok(acknowledge >= 0 && success > acknowledge);
});
