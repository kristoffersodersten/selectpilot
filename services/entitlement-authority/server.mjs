// module_name: entitlement_authority
// spec_ref: "validation_layer"
import { createHash, createHmac, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const TIERS = new Set(['essential', 'plus', 'pro']);
const MAX_BODY_BYTES = 256 * 1024;
const PADDLE_TOLERANCE_SECONDS = 5;
const MAX_IDENTIFIER_CHARS = 200;

function parseObject(rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(rawBody || '{}');
  } catch {
    throw Object.assign(new Error('invalid_json'), { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('invalid_json_object'), { status: 400 });
  }
  return parsed;
}

function identifier(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_IDENTIFIER_CHARS
    ? value.trim() : null;
}

function required(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function canonicalize(entitlement) {
  return JSON.stringify({
    token: entitlement.token,
    tier: entitlement.tier,
    features: Array.isArray(entitlement.features) ? entitlement.features : [],
    issuedAt: entitlement.issuedAt,
    expiresAt: entitlement.expiresAt ?? null,
  });
}

function tokenHash(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function opaque(prefix) {
  return `${prefix}_${randomBytes(24).toString('base64url')}`;
}

function parsePriceMap(value) {
  const parsed = JSON.parse(value);
  for (const [priceId, entry] of Object.entries(parsed)) {
    if ((priceId !== '__trial__' && !priceId.startsWith('pri_')) || !TIERS.has(entry?.tier) || !Array.isArray(entry.features)) {
      throw new Error('SELECTPILOT_PADDLE_PRICE_MAP_JSON has an invalid entry');
    }
  }
  return parsed;
}

// @spec_ref validation_layer
export function verifyPaddleSignature(rawBody, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(header || '').split(';').map((part) => part.split('=', 2));
  const timestamps = parts.filter(([name]) => name === 'ts').map(([, value]) => value);
  const signatures = parts.filter(([name]) => name === 'h1').map(([, value]) => value);
  const timestamp = Number(timestamps[0]);
  if (timestamps.length !== 1 || signatures.length === 0 || !Number.isInteger(timestamp)) return false;
  if (signatures.some((supplied) => !/^[0-9a-f]{64}$/i.test(supplied || ''))) return false;
  if (Math.abs(nowSeconds - timestamp) > PADDLE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex');
  return signatures.some((supplied) => timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex')));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request_too_large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return { schema_version: 1, tokens: {}, claims: {}, trials: {}, events: {}, subjects: {}, ...parsed };
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: 1, tokens: {}, claims: {}, trials: {}, events: {}, subjects: {} };
    throw error;
  }
}

async function saveState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function entitlementResponse(record, token, privateKey, kid) {
  const entitlement = {
    token,
    tier: record.tier,
    features: record.features,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt ?? null,
  };
  return {
    entitlement,
    signature: sign(null, Buffer.from(canonicalize(entitlement)), privateKey).toString('base64'),
    alg: 'Ed25519',
    kid,
  };
}

function purchasedItem(event, priceMap) {
  for (const item of event?.data?.items || []) {
    const priceId = item?.price?.id;
    if (priceMap[priceId]) return priceMap[priceId];
  }
  return null;
}

export async function createAuthority(config = {}) {
  const env = config.env || process.env;
  const statePath = resolve(config.statePath || required('SELECTPILOT_ENTITLEMENT_STATE_FILE', env));
  const privateKey = await readFile(config.privateKeyFile || required('SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE', env));
  const kid = config.kid || required('SELECTPILOT_ENTITLEMENT_KEY_ID', env);
  const webhookSecret = config.webhookSecret || (
    env.SELECTPILOT_PADDLE_WEBHOOK_SECRET_FILE
      ? (await readFile(env.SELECTPILOT_PADDLE_WEBHOOK_SECRET_FILE, 'utf8')).trim()
      : required('SELECTPILOT_PADDLE_WEBHOOK_SECRET', env)
  );
  const priceMap = config.priceMap || parsePriceMap(
    env.SELECTPILOT_PADDLE_PRICE_MAP_FILE
      ? await readFile(env.SELECTPILOT_PADDLE_PRICE_MAP_FILE, 'utf8')
      : required('SELECTPILOT_PADDLE_PRICE_MAP_JSON', env)
  );
  const allowedWebOrigin = config.allowedWebOrigin || env.SELECTPILOT_WEB_ORIGIN || 'https://selectpilot.app';
  let mutation = Promise.resolve();
  const serial = async (operation) => {
    const current = mutation.catch(() => {}).then(operation);
    mutation = current.catch(() => {});
    return current;
  };

  const server = createServer(async (req, res) => {
    try {
      if (req.headers.origin === allowedWebOrigin) {
        res.setHeader('access-control-allow-origin', allowedWebOrigin);
        res.setHeader('vary', 'origin');
      }
      if (req.method === 'OPTIONS' && ['/v1/claims/redeem', '/v1/claims/ack'].includes(req.url)) {
        res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
        res.setHeader('access-control-allow-headers', 'content-type');
        res.writeHead(req.headers.origin === allowedWebOrigin ? 204 : 403);
        return res.end();
      }
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
      if (req.method !== 'POST') return send(res, 404, { error: 'not_found' });
      if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        return send(res, 415, { error: 'json_content_type_required' });
      }
      const rawBody = await readBody(req);

      if (req.url === '/v1/entitlements/verify') {
        const token = identifier(parseObject(rawBody).token);
        if (!token) return send(res, 400, { error: 'token_required' });
        const state = await loadState(statePath);
        const record = state.tokens[tokenHash(token)];
        if (!record || record.revokedAt || (record.expiresAt && Date.now() >= record.expiresAt)) {
          return send(res, 401, { error: 'invalid_entitlement' });
        }
        return send(res, 200, entitlementResponse(record, token, privateKey, kid));
      }

      if (req.url === '/v1/trials/start') {
        const installationId = identifier(parseObject(rawBody).installation_id);
        if (!installationId) return send(res, 400, { error: 'installation_id_required' });
        let response;
        await serial(async () => {
          const state = await loadState(statePath);
          const installationHash = tokenHash(installationId);
          const existing = state.trials[installationHash];
          if (existing) {
            response = { token: existing.token, already_started: true };
            return;
          }
          const token = opaque('sp_trial');
          const now = Date.now();
          state.tokens[tokenHash(token)] = {
            tier: priceMap.__trial__?.tier || 'pro', features: priceMap.__trial__?.features || [], issuedAt: now,
            expiresAt: now + 7 * 24 * 60 * 60 * 1000,
          };
          state.trials[installationHash] = { token, issuedAt: now };
          await saveState(statePath, state);
          response = { token, already_started: false };
        });
        return send(res, 201, response);
      }

      if (req.url === '/v1/claims/redeem') {
        const claimId = identifier(parseObject(rawBody).claim_id);
        if (!claimId) return send(res, 400, { error: 'claim_id_required' });
        let response = { status: 'pending' };
        await serial(async () => {
          const state = await loadState(statePath);
          const claim = state.claims[tokenHash(claimId)];
          if (!claim) return;
          if (claim.acknowledgedAt) {
            response = { status: 'acknowledged' };
            return;
          }
          if (Date.now() >= claim.expiresAt) {
            delete claim.token;
            response = { status: 'expired' };
            await saveState(statePath, state);
            return;
          }
          response = { status: 'ready', token: claim.token };
        });
        return send(res, 200, response);
      }

      if (req.url === '/v1/claims/ack') {
        const claimId = identifier(parseObject(rawBody).claim_id);
        if (!claimId) return send(res, 400, { error: 'claim_id_required' });
        await serial(async () => {
          const state = await loadState(statePath);
          const claim = state.claims[tokenHash(claimId)];
          if (!claim) return;
          claim.acknowledgedAt = Date.now();
          delete claim.token;
          await saveState(statePath, state);
        });
        return send(res, 200, { acknowledged: true });
      }

      if (req.url === '/v1/paddle/webhook') {
        if (!verifyPaddleSignature(rawBody, req.headers['paddle-signature'], webhookSecret)) {
          return send(res, 401, { error: 'invalid_webhook_signature' });
        }
        const event = parseObject(rawBody);
        const claimId = identifier(event?.data?.custom_data?.claim_id);
        const product = purchasedItem(event, priceMap);
        const subjectId = identifier(event?.data?.subscription_id || event?.data?.id);
        const eventId = identifier(event?.event_id);
        if (!eventId || !subjectId) return send(res, 422, { error: 'unsupported_event' });
        await serial(async () => {
          const state = await loadState(statePath);
          if (state.events[eventId]) return;
          if (['transaction.completed', 'subscription.activated'].includes(event.event_type)) {
            if (!claimId || !product) throw Object.assign(new Error('unsupported_event'), { status: 422 });
            const previousHash = state.subjects[subjectId];
            if (previousHash && state.tokens[previousHash]) state.tokens[previousHash].revokedAt = Date.now();
            const token = opaque('sp_live');
            const now = Date.now();
            const currentHash = tokenHash(token);
            state.tokens[currentHash] = {
              tier: product.tier, features: product.features, issuedAt: now,
              expiresAt: event?.data?.current_billing_period?.ends_at
                ? Date.parse(event.data.current_billing_period.ends_at) : null,
              subjectId,
            };
            state.subjects[subjectId] = currentHash;
            state.claims[tokenHash(claimId)] = { token, issuedAt: now, expiresAt: now + 24 * 60 * 60 * 1000 };
          } else if (event.event_type === 'subscription.updated') {
            const currentHash = state.subjects[subjectId];
            const record = currentHash ? state.tokens[currentHash] : null;
            if (!record || !product) throw Object.assign(new Error('unsupported_event'), { status: 422 });
            record.tier = product.tier;
            record.features = product.features;
            record.expiresAt = event?.data?.current_billing_period?.ends_at
              ? Date.parse(event.data.current_billing_period.ends_at) : record.expiresAt;
          } else if (['subscription.canceled', 'subscription.paused'].includes(event.event_type)) {
            const currentHash = state.subjects[subjectId];
            if (currentHash && state.tokens[currentHash]) state.tokens[currentHash].revokedAt = Date.now();
          }
          state.events[eventId] = { handledAt: Date.now(), type: event.event_type };
          await saveState(statePath, state);
        });
        return send(res, 200, { accepted: true });
      }

      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      const status = error.status || 500;
      console.error(JSON.stringify({
        event: 'entitlement_authority_request_failed',
        method: req.method,
        path: req.url,
        status,
        error: error.code || error.name || 'Error',
      }));
      send(res, status, { error: error.status ? error.message : 'internal_error' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const server = await createAuthority();
  server.listen(Number(process.env.PORT || 8090), process.env.HOST || '127.0.0.1');
}
