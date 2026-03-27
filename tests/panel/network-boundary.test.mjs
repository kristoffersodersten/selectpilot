import test from 'node:test';
import assert from 'node:assert/strict';

import { endpoints } from '../../api/endpoints.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

test('all configured API endpoints stay on local hosts', () => {
  for (const [name, endpoint] of Object.entries(endpoints)) {
    if (typeof endpoint !== 'string') {
      continue;
    }
    const url = new URL(endpoint);
    assert.ok(
      LOCAL_HOSTS.has(url.hostname),
      `endpoint ${name} must remain local, got ${url.hostname}`
    );
    assert.ok(
      url.protocol === 'http:' || url.protocol === 'https:',
      `endpoint ${name} must use http/https`
    );
  }
});