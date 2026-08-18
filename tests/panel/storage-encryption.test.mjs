// module_name: tests_panel_storage-encryption_test_mjs
// spec_ref: "testing_strategy.integration_tests"
import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: values.get(key) };
      },
      async set(entries) {
        for (const [key, value] of Object.entries(entries)) values.set(key, value);
      },
    },
  },
};

const { getDecrypted, setEncrypted } = await import('../../utils/storage.js');

test('AES-GCM storage creates a non-exportable per-install key and round-trips data', async () => {
  await setEncrypted('test_payload', 'private local value');

  assert.equal(await getDecrypted('test_payload'), 'private local value');
  assert.equal(Array.isArray(values.get('selectpilot_encryption_key_v1')), true);
  assert.equal(values.get('selectpilot_encryption_key_v1').length, 32);
  assert.equal(typeof values.get('test_payload'), 'string');
  assert.equal(values.get('test_payload').includes('private local value'), false);
});
