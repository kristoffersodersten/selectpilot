// module_name: background_entitlement-service_ts
// spec_ref: "execution_layer"
import { endpoints } from '../api/endpoints.js';
import { error, log, warn } from '../utils/logger.js';
import { loadLicense, loadToken, saveLicense } from '../licensing/license-storage.js';
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const SIGNATURE_ALGORITHM = 'Ed25519';
let cachedFeatureMap = null;
let cachedKeyring = null;
function nowMs() {
    return Date.now();
}
function hexToBytes(hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex))
        throw new Error('invalid public key hex');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}
function base64ToBytes(value) {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++)
        bytes[i] = raw.charCodeAt(i);
    return bytes;
}
function bytesToArrayBuffer(bytes) {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}
function canonicalizeEntitlement(payload) {
    return JSON.stringify({
        token: payload.token,
        tier: payload.tier,
        features: Array.isArray(payload.features) ? payload.features : [],
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt ?? null,
    });
}
async function loadKeyring() {
    if (cachedKeyring)
        return cachedKeyring;
    const url = chrome.runtime.getURL('pricing/entitlement-public-keys.json');
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok)
        throw new Error('entitlement_keyring_unavailable');
    const value = (await res.json());
    if (value.schema_version !== 1 || !Array.isArray(value.keys) || value.keys.length === 0) {
        throw new Error('entitlement_keyring_invalid');
    }
    if (value.keys.some((key) => (!key.kid
        || key.alg !== 'Ed25519'
        || !/^[0-9a-f]{64}$/i.test(key.public_key_hex)
        || !['active', 'retiring'].includes(key.status))))
        throw new Error('entitlement_keyring_invalid');
    cachedKeyring = value;
    return value;
}
export async function verifyEntitlementSignature(payload, signature, kid, publicKeys) {
    if (!kid || !signature)
        return false;
    try {
        const keyEntry = publicKeys
            ? { public_key_hex: publicKeys[kid] }
            : (await loadKeyring()).keys.find((entry) => (entry.kid === kid && entry.alg === SIGNATURE_ALGORITHM && ['active', 'retiring'].includes(entry.status)));
        if (!keyEntry?.public_key_hex)
            return false;
        const key = await crypto.subtle.importKey('raw', bytesToArrayBuffer(hexToBytes(keyEntry.public_key_hex)), { name: 'Ed25519' }, false, ['verify']);
        const valid = await crypto.subtle.verify('Ed25519', key, bytesToArrayBuffer(base64ToBytes(signature)), new TextEncoder().encode(canonicalizeEntitlement(payload)));
        return Boolean(valid);
    }
    catch (e) {
        error('entitlement', 'signature verification failed', e);
        return false;
    }
}
async function loadFeatureMap() {
    if (cachedFeatureMap)
        return cachedFeatureMap;
    const url = chrome.runtime.getURL('pricing/tier-feature-map.json');
    const res = await fetch(url, { cache: 'no-store' });
    cachedFeatureMap = (await res.json());
    return cachedFeatureMap;
}
async function isFeatureAllowedByTier(feature, tier) {
    const featureMap = await loadFeatureMap();
    const order = ['essential', 'plus', 'pro'];
    const idx = order.indexOf(tier);
    for (let i = 0; i <= idx; i++) {
        if (featureMap[order[i]]?.includes(feature))
            return true;
    }
    return false;
}
function isWithinOfflineGrace(record) {
    const baseline = record.cachedAt || record.issuedAt;
    return (!record.expiresAt || nowMs() < record.expiresAt)
        && nowMs() <= (baseline + OFFLINE_GRACE_MS);
}
async function isVerifiedCachedEntitlement(record, token) {
    if (record.token !== token
        || record.alg !== SIGNATURE_ALGORITHM
        || !record.signature
        || !record.kid
        || !isWithinOfflineGrace(record))
        return false;
    return verifyEntitlementSignature({
        token: record.token,
        tier: record.tier,
        features: record.features,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt ?? null,
    }, record.signature, record.kid);
}
async function readCachedEntitlement() {
    const cached = await loadLicense();
    return cached ? validateCachedEntitlement(cached) : null;
}
async function validateCachedEntitlement(record) {
    if (!record.signature || !record.kid || record.alg !== 'Ed25519')
        return null;
    if (record.expiresAt !== undefined && nowMs() >= record.expiresAt)
        return null;
    const payload = {
        token: record.token,
        tier: record.tier,
        features: record.features,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt ?? null,
    };
    if (!(await verifyEntitlementSignature(payload, record.signature, record.kid)))
        return null;
    return { ...record, cachedAt: record.cachedAt || record.issuedAt };
}
async function writeCachedEntitlement(record) {
    await saveLicense({
        token: record.token,
        tier: record.tier,
        issuedAt: record.issuedAt,
        expiresAt: record.expiresAt,
        features: record.features,
        cachedAt: record.cachedAt,
        signature: record.signature,
        alg: record.alg,
        kid: record.kid,
    });
}
export async function normalizeRemoteResponse(token, response, keyring) {
    const entitlement = response?.entitlement;
    if (!entitlement
        || entitlement.token !== token
        || !['essential', 'plus', 'pro'].includes(entitlement.tier)
        || !Number.isInteger(entitlement.issuedAt)
        || (entitlement.expiresAt !== undefined
            && entitlement.expiresAt !== null
            && !Number.isInteger(entitlement.expiresAt))
        || !Array.isArray(entitlement.features)
        || entitlement.features.some((feature) => typeof feature !== 'string')) {
        warn('entitlement', 'invalid signed entitlement contract');
        return null;
    }
    if (response.alg !== SIGNATURE_ALGORITHM || !response.signature || !response.kid) {
        warn('entitlement', 'unsigned or unsupported entitlement response');
        return null;
    }
    if (entitlement.expiresAt !== undefined && entitlement.expiresAt !== null && nowMs() >= entitlement.expiresAt) {
        warn('entitlement', 'expired entitlement response');
        return null;
    }
    const publicKeys = keyring
        ? Object.fromEntries(keyring.keys.map((entry) => [entry.kid, entry.public_key_hex]))
        : undefined;
    if (!(await verifyEntitlementSignature(entitlement, response.signature, response.kid, publicKeys))) {
        return null;
    }
    return {
        token: entitlement.token,
        tier: entitlement.tier,
        features: entitlement.features,
        issuedAt: entitlement.issuedAt,
        expiresAt: entitlement.expiresAt ?? undefined,
        cachedAt: nowMs(),
        signature: response.signature,
        alg: response.alg,
        kid: response.kid,
    };
}
async function remoteVerify(token) {
    try {
        const res = await fetch(endpoints.licenseVerify, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
            cache: 'no-store',
        });
        if (res.status === 401)
            return 'unauthorized';
        if (!res.ok)
            throw new Error(`license verify failed: ${res.status}`);
        const payload = (await res.json());
        return normalizeRemoteResponse(token, payload);
    }
    catch (e) {
        error('entitlement', 'remote verify failed', e);
        return null;
    }
}
export async function setEntitlementToken(token) {
    const normalizedToken = token.trim();
    if (!normalizedToken)
        throw new Error('entitlement_token_required');
    const resetAt = nowMs();
    await saveLicense({
        token: normalizedToken,
        tier: 'essential',
        issuedAt: resetAt,
        expiresAt: resetAt,
        features: [],
        cachedAt: 0,
    });
}
export async function refreshEntitlement(force = false) {
    const token = await loadToken();
    const stored = await loadLicense();
    const cached = stored ? await validateCachedEntitlement(stored) : null;
    if (!token)
        return null;
    const shouldAttemptRemote = force
        || !cached
        || !(await isVerifiedCachedEntitlement(cached, token))
        || nowMs() - (cached.cachedAt || cached.issuedAt) > REFRESH_INTERVAL_MS;
    if (!shouldAttemptRemote && cached) {
        log('entitlement', 'using cached entitlement within offline grace');
        return cached;
    }
    const remote = await remoteVerify(token);
    if (remote === 'unauthorized') {
        await saveLicense({
            token,
            tier: 'essential',
            issuedAt: nowMs(),
            expiresAt: nowMs(),
            cachedAt: 0,
            features: [],
        });
        return null;
    }
    if (remote) {
        await writeCachedEntitlement(remote);
        return remote;
    }
    if (cached && await isVerifiedCachedEntitlement(cached, token)) {
        log('entitlement', 'remote unavailable; using cached entitlement within grace window');
        return cached;
    }
    return null;
}
export async function getEntitlementTier() {
    const verified = await refreshEntitlement(false);
    return verified?.tier || 'essential';
}
export async function getEntitlementSnapshot() {
    return refreshEntitlement(false);
}
export async function hasEntitlementFeature(feature) {
    const verified = await refreshEntitlement(false);
    if (!verified)
        return false;
    const cached = await readCachedEntitlement();
    if (cached?.features?.length) {
        return cached.features.includes(feature);
    }
    return isFeatureAllowedByTier(feature, verified.tier);
}
export async function requireEntitlementFeature(feature) {
    const allowed = await hasEntitlementFeature(feature);
    if (!allowed)
        throw new Error(`feature_not_available:${feature}`);
}
