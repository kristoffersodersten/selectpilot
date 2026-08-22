// module_name: background_tier-service_ts
// spec_ref: "execution_layer"
import {
  getEntitlementTier,
  hasEntitlementFeature,
  refreshEntitlement,
  setEntitlementToken,
} from './entitlement-service.js';

export type FeatureMap = Record<'essential' | 'plus' | 'pro', string[]>;

async function loadJSON<T>(path: string): Promise<T> {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return (await res.json()) as T;
}

let cachedFeatures: FeatureMap | null = null;

export async function getFeatures(): Promise<FeatureMap> {
  if (cachedFeatures) return cachedFeatures;
  cachedFeatures = await loadJSON<FeatureMap>('pricing/tier-feature-map.json');
  return cachedFeatures;
}

export async function isFeatureEnabled(feature: string, tier: 'essential' | 'plus' | 'pro'): Promise<boolean> {
  const features = await getFeatures();
  const order: ('essential' | 'plus' | 'pro')[] = ['essential', 'plus', 'pro'];
  const idx = order.indexOf(tier);
  for (let i = 0; i <= idx; i++) {
    if (features[order[i]].includes(feature)) return true;
  }
  return false;
}

export async function getLicenseTier(): Promise<'essential' | 'plus' | 'pro'> {
  return getEntitlementTier();
}

export async function requireFeature(feature: string): Promise<{ allowed: boolean; tier: string }> {
  const tier = await getLicenseTier();
  const allowed = await hasEntitlementFeature(feature);
  return { allowed, tier };
}

export async function refreshLicense(force = false) {
  return refreshEntitlement(force);
}

export async function attachLicenseToken(token: string) {
  await setEntitlementToken(token);
  return refreshEntitlement(true);
}
