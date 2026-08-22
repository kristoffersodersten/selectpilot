// module_name: tests_panel_entitlement_signature_test_mjs
// spec_ref: "testing_strategy.integration_tests"

import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyEntitlementSignature } from '../../background/entitlement-service.js';

function toHex(bytes) {
  return Buffer.from(bytes).toString('hex');
}

test('only a matching Ed25519 key ID and exact payload verify', async () => {
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = toHex(await crypto.subtle.exportKey('raw', pair.publicKey));
  const entitlement = {
    token: 'opaque-token',
    tier: 'pro',
    features: ['image_ocr'],
    issuedAt: 1_700_000_000_000,
    expiresAt: 4_000_000_000_000,
  };
  const canonical = JSON.stringify(entitlement);
  const signature = Buffer.from(await crypto.subtle.sign(
    'Ed25519',
    pair.privateKey,
    new TextEncoder().encode(canonical),
  )).toString('base64');
  const keyRing = { 'rotation-1': publicKey };

  assert.equal(await verifyEntitlementSignature(entitlement, signature, 'rotation-1', keyRing), true);
  assert.equal(await verifyEntitlementSignature(entitlement, signature, 'unknown', keyRing), false);
  assert.equal(await verifyEntitlementSignature({ ...entitlement, tier: 'plus' }, signature, 'rotation-1', keyRing), false);
});
