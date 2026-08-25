// module_name: entitlement_authority_tests
// spec_ref: "testing_strategy.integration_tests"
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAuthority, verifyPaddleSignature } from '../../services/entitlement-authority/server.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'selectpilot-authority-'));
  const statePath = path.join(root, 'state.json');
  const keyPath = path.join(root, 'private.pem');
  const { privateKey } = generateKeyPairSync('ed25519');
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const server = await createAuthority({
    statePath,
    privateKeyFile: keyPath,
    kid: 'test-2026-01',
    webhookSecret: 'pdl_test_secret',
    priceMap: {
      __trial__: { tier: 'pro', features: ['extract', 'export'] },
      pri_plus: { tier: 'plus', features: ['extract', 'export'] },
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(base, route, body, headers = {}) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('trial is idempotent and produces a signed, expiring entitlement', async (t) => {
  const base = await fixture(t);
  const first = await post(base, '/v1/trials/start', { installation_id: 'installation-a' });
  assert.equal(first.status, 201);
  const issued = await first.json();
  assert.match(issued.token, /^sp_trial_/);

  const repeated = await post(base, '/v1/trials/start', { installation_id: 'installation-a' });
  assert.equal((await repeated.json()).token, issued.token);

  const verified = await post(base, '/v1/entitlements/verify', { token: issued.token });
  assert.equal(verified.status, 200);
  const signed = await verified.json();
  assert.equal(signed.entitlement.tier, 'pro');
  assert.equal(signed.alg, 'Ed25519');
  assert.equal(signed.kid, 'test-2026-01');
  assert.ok(signed.entitlement.expiresAt > Date.now());
  assert.match(signed.signature, /^[A-Za-z0-9+/]+=*$/);
});

test('Paddle webhook is authenticated and purchase claim redeems once', async (t) => {
  const base = await fixture(t);
  const event = JSON.stringify({
    event_id: 'evt_1',
    event_type: 'transaction.completed',
    data: { id: 'txn_1', custom_data: { claim_id: 'claim-secret' }, items: [{ price: { id: 'pri_plus' } }] },
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', 'pdl_test_secret').update(`${timestamp}:${event}`).digest('hex');
  const webhook = await post(base, '/v1/paddle/webhook', event, { 'paddle-signature': `ts=${timestamp};h1=${digest}` });
  assert.equal(webhook.status, 200);

  const claim = await post(base, '/v1/claims/redeem', { claim_id: 'claim-secret' });
  const ready = await claim.json();
  assert.equal(ready.status, 'ready');
  assert.match(ready.token, /^sp_live_/);
  const repeated = await post(base, '/v1/claims/redeem', { claim_id: 'claim-secret' });
  assert.deepEqual(await repeated.json(), ready);
  const acknowledged = await post(base, '/v1/claims/ack', { claim_id: 'claim-secret' });
  assert.deepEqual(await acknowledged.json(), { acknowledged: true });
  const afterAck = await post(base, '/v1/claims/redeem', { claim_id: 'claim-secret' });
  assert.deepEqual(await afterAck.json(), { status: 'acknowledged' });
});

test('Paddle webhook rejects events without a stable subject', async (t) => {
  const base = await fixture(t);
  const event = JSON.stringify({ event_id: 'evt_missing_subject', event_type: 'transaction.completed', data: {} });
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = createHmac('sha256', 'pdl_test_secret').update(`${timestamp}:${event}`).digest('hex');
  const response = await post(base, '/v1/paddle/webhook', event, { 'paddle-signature': `ts=${timestamp};h1=${digest}` });
  assert.equal(response.status, 422);
});

test('subscription updates preserve the token and cancellation revokes it', async (t) => {
  const base = await fixture(t);
  const sendEvent = async (event) => {
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac('sha256', 'pdl_test_secret').update(`${timestamp}:${body}`).digest('hex');
    return post(base, '/v1/paddle/webhook', body, { 'paddle-signature': `ts=${timestamp};h1=${digest}` });
  };
  const activated = await sendEvent({
    event_id: 'evt_activate', event_type: 'subscription.activated',
    data: { id: 'sub_1', custom_data: { claim_id: 'claim-sub' }, items: [{ price: { id: 'pri_plus' } }] },
  });
  assert.equal(activated.status, 200);
  const claimed = await (await post(base, '/v1/claims/redeem', { claim_id: 'claim-sub' })).json();

  const updated = await sendEvent({
    event_id: 'evt_update', event_type: 'subscription.updated',
    data: { id: 'sub_1', items: [{ price: { id: 'pri_plus' } }] },
  });
  assert.equal(updated.status, 200);
  assert.equal((await post(base, '/v1/entitlements/verify', { token: claimed.token })).status, 200);

  const canceled = await sendEvent({ event_id: 'evt_cancel', event_type: 'subscription.canceled', data: { id: 'sub_1' } });
  assert.equal(canceled.status, 200);
  assert.equal((await post(base, '/v1/entitlements/verify', { token: claimed.token })).status, 401);
});

test('Paddle signature rejects stale and forged events', () => {
  const body = '{}';
  const now = 2_000_000_000;
  const valid = createHmac('sha256', 'secret').update(`${now}:${body}`).digest('hex');
  assert.equal(verifyPaddleSignature(body, `ts=${now};h1=${valid}`, 'secret', now), true);
  assert.equal(verifyPaddleSignature(body, `ts=${now};h1=${valid}`, 'wrong', now), false);
  assert.equal(verifyPaddleSignature(body, `ts=${now - 301};h1=${valid}`, 'secret', now), false);
});
