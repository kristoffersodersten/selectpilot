import { endpoints } from '../api/endpoints.js';
import { error, log, warn } from '../utils/logger.js';
import { loadLicense, loadToken, saveLicense, type LicenseRecord } from '../licensing/license-storage.js';

export type EntitlementTier = 'essential' | 'plus' | 'pro';

type EntitlementPayload = {
  token: string;
  tier: EntitlementTier;
  features?: string[];
  issuedAt: number;
  expiresAt?: number | null;
};

type SignedEntitlementResponse = {
  entitlement?: EntitlementPayload;
  signature?: string;
  alg?: string;
  kid?: string;
  token?: string;
  tier?: EntitlementTier;
  issuedAt?: number;
  expiresAt?: number;
};

type RemoteVerifyResult = CachedEntitlement | 'unauthorized' | null;

export type CachedEntitlement = {
  token: string;
  tier: EntitlementTier;
  features?: string[];
  issuedAt: number;
  expiresAt?: number;
  cachedAt: number;
  signature?: string;
  alg?: string;
  kid?: string;
};

const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const PUBLIC_KEY_HEX = '';

let cachedFeatureMap: Record<EntitlementTier, string[]> | null = null;

function nowMs(): number {
  return Date.now();
}

function normalizeEntitlement(payload: EntitlementPayload): LicenseRecord {
  return {
    token: payload.token,
    tier: payload.tier,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt ?? undefined,
    features: payload.features,
    cachedAt: nowMs(),
  };
}

function hexToBytes(hex: string): Uint8Array {
  if (!hex || hex.length % 2 !== 0) throw new Error('invalid public key hex');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64ToBytes(value: string): Uint8Array {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function canonicalizeEntitlement(payload: EntitlementPayload): string {
  return JSON.stringify({
    token: payload.token,
    tier: payload.tier,
    features: Array.isArray(payload.features) ? payload.features : [],
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt ?? null,
  });
}

async function verifySignature(payload: EntitlementPayload, signature: string): Promise<boolean> {
  if (!PUBLIC_KEY_HEX) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      bytesToArrayBuffer(hexToBytes(PUBLIC_KEY_HEX)),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      'Ed25519',
      key,
      bytesToArrayBuffer(base64ToBytes(signature)),
      new TextEncoder().encode(canonicalizeEntitlement(payload))
    );
    return Boolean(valid);
  } catch (e) {
    error('entitlement', 'signature verification failed', e);
    return false;
  }
}

async function loadFeatureMap(): Promise<Record<EntitlementTier, string[]>> {
  if (cachedFeatureMap) return cachedFeatureMap;
  const url = chrome.runtime.getURL('pricing/tier-feature-map.json');
  const res = await fetch(url, { cache: 'no-store' });
  cachedFeatureMap = (await res.json()) as Record<EntitlementTier, string[]>;
  return cachedFeatureMap;
}

async function isFeatureAllowedByTier(feature: string, tier: EntitlementTier): Promise<boolean> {
  const featureMap = await loadFeatureMap();
  const order: EntitlementTier[] = ['essential', 'plus', 'pro'];
  const idx = order.indexOf(tier);
  for (let i = 0; i <= idx; i++) {
    if (featureMap[order[i]]?.includes(feature)) return true;
  }
  return false;
}

function isWithinOfflineGrace(record: LicenseRecord): boolean {
  const baseline = record.cachedAt || record.issuedAt;
  return nowMs() <= (baseline + OFFLINE_GRACE_MS);
}

async function readCachedEntitlement(): Promise<CachedEntitlement | null> {
  const cached = await loadLicense();
  if (!cached) return null;
  return {
    ...cached,
    cachedAt: cached.cachedAt || cached.issuedAt,
  };
}

async function writeCachedEntitlement(record: CachedEntitlement): Promise<void> {
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

async function normalizeRemoteResponse(token: string, response: SignedEntitlementResponse): Promise<CachedEntitlement | null> {
  if (response.entitlement) {
    const entitlement = response.entitlement;
    if (entitlement.token !== token) {
      warn('entitlement', 'token mismatch in signed response');
      return null;
    }
    if (response.signature) {
      if (!PUBLIC_KEY_HEX) {
        warn('entitlement', 'signature returned but PUBLIC_KEY_HEX is not configured; accepting as unsigned MVP');
      } else {
        const valid = await verifySignature(entitlement, response.signature);
        if (!valid) return null;
      }
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

  if (response.tier && response.issuedAt) {
    return {
      token,
      tier: response.tier,
      issuedAt: response.issuedAt,
      expiresAt: response.expiresAt,
      cachedAt: nowMs(),
    };
  }

  return null;
}

async function remoteVerify(token: string): Promise<RemoteVerifyResult> {
  try {
    const res = await fetch(endpoints.licenseVerify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      cache: 'no-store',
    });

    if (res.status === 401) return 'unauthorized';
    if (!res.ok) throw new Error(`license verify failed: ${res.status}`);

    const payload = (await res.json()) as SignedEntitlementResponse;
    return normalizeRemoteResponse(token, payload);
  } catch (e) {
    error('entitlement', 'remote verify failed', e);
    return null;
  }
}

export async function setEntitlementToken(token: string): Promise<void> {
  const existing = await loadLicense();
  await saveLicense({
    token,
    tier: existing?.tier || 'essential',
    issuedAt: existing?.issuedAt || nowMs(),
    expiresAt: existing?.expiresAt,
    features: existing?.features,
    cachedAt: existing?.cachedAt,
    signature: existing?.signature,
    alg: existing?.alg,
    kid: existing?.kid,
  });
}

export async function refreshEntitlement(force = false): Promise<LicenseRecord | null> {
  const token = await loadToken();
  const cached = await loadLicense();

  if (!token) return null;

  const shouldAttemptRemote = force
    || !cached
    || !isWithinOfflineGrace(cached)
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
    return normalizeEntitlement(remote);
  }

  if (cached && isWithinOfflineGrace(cached)) {
    log('entitlement', 'remote unavailable; using cached entitlement within grace window');
    return cached;
  }

  return null;
}

export async function getEntitlementTier(): Promise<EntitlementTier> {
  const verified = await refreshEntitlement(false);
  return verified?.tier || 'essential';
}

export async function getEntitlementSnapshot(): Promise<LicenseRecord | null> {
  return refreshEntitlement(false);
}

export async function hasEntitlementFeature(feature: string): Promise<boolean> {
  const verified = await refreshEntitlement(false);
  if (!verified) return false;

  const cached = await readCachedEntitlement();
  if (cached?.features?.length) {
    return cached.features.includes(feature);
  }

  return isFeatureAllowedByTier(feature, verified.tier);
}

export async function requireEntitlementFeature(feature: string): Promise<void> {
  const allowed = await hasEntitlementFeature(feature);
  if (!allowed) throw new Error(`feature_not_available:${feature}`);
}
