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

const { getDecrypted, getEncryptedJSON, setEncrypted, setEncryptedJSON } = await import('../../utils/storage.js');

test('AES-GCM storage creates a non-exportable per-install key and round-trips data', async () => {
  await setEncrypted('test_payload', 'private local value');

  assert.equal(await getDecrypted('test_payload'), 'private local value');
  assert.equal(Array.isArray(values.get('selectpilot_encryption_key_v1')), true);
  assert.equal(values.get('selectpilot_encryption_key_v1').length, 32);
  assert.equal(typeof values.get('test_payload'), 'string');
  assert.equal(values.get('test_payload').includes('private local value'), false);
});

test('encrypted JSON never persists private fields as plaintext', async () => {
  const ledger = [{ content: 'private selected text', url: 'https://private.example/path' }];
  await setEncryptedJSON('ledger', ledger);

  const persisted = values.get('ledger');
  assert.equal(persisted.includes('private selected text'), false);
  assert.equal(persisted.includes('private.example'), false);
  assert.deepEqual(await getEncryptedJSON('ledger'), ledger);
});

test('corrupt encrypted JSON fails closed without returning partial data', async () => {
  values.set('corrupt', JSON.stringify({ iv: [1, 2], data: [3, 4] }));
  assert.equal(await getEncryptedJSON('corrupt'), null);
});
