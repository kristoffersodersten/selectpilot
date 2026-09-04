// module_name: axiom_intent_tests
// spec_ref: "testing_strategy.integration_tests"
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifyAxiomIntent } from '../../scripts/verify-axiom-intent.mjs';

const intent = JSON.parse(await readFile(new URL('../../intent.json', import.meta.url), 'utf8'));
const trust = JSON.parse(await readFile(new URL('../../governance/axiom-trust.json', import.meta.url), 'utf8'));

test('Axiom intent is owner-signed, trusted, current, and bounds changed files', () => {
  const result = verifyAxiomIntent(intent, trust, {
    changedFiles: ['background/background.ts', 'tests/panel/axiom-intent.test.mjs'],
    nowSeconds: 1_788_000_000,
  });
  assert.deepEqual(result, { ok: true, failures: [] });
});

test('Axiom intent verification fails closed on tampering, expiry, and forbidden files', () => {
  const tampered = structuredClone(intent);
  tampered.goal = 'different goal';
  assert.ok(verifyAxiomIntent(tampered, trust, { nowSeconds: 1_788_000_000 }).failures.includes('invalid_signature'));
  assert.ok(verifyAxiomIntent(intent, trust, { nowSeconds: intent.expires_at }).failures.includes('intent_expired'));
  assert.ok(verifyAxiomIntent(intent, trust, {
    changedFiles: ['secrets/private.key'],
    nowSeconds: 1_788_000_000,
  }).failures.includes('forbidden_file_change:secrets/private.key'));
});
