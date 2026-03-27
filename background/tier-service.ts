import {
  getEntitlementTier,
  hasEntitlementFeature,
  refreshEntitlement,
  setEntitlementToken,
} from './entitlement-service.js';

export type PricingConfig = {
  trial: { enabled: boolean; duration_days: number; access: 'pro' | 'plus' | 'essential' };
  tiers: Record<'essential' | 'plus' | 'pro', number>;
  offline_grace_days: number;
  products?: Record<string, string>;
  vendor_id?: number;
};

export type FeatureMap = Record<'essential' | 'plus' | 'pro', string[]>;

async function loadJSON<T>(path: string): Promise<T> {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return (await res.json()) as T;
}

let cachedPricing: PricingConfig | null = null;
let cachedFeatures: FeatureMap | null = null;

export async function getPricing(): Promise<PricingConfig> {
  if (cachedPricing) return cachedPricing;
  const pricing = await loadJSON<Omit<PricingConfig, 'products'>>('pricing/pricing-global.json');
  const productsPayload = await loadJSON<{ products: Record<string, string>; vendor_id?: number }>('pricing/paddle-products.json');
  cachedPricing = { ...pricing, products: productsPayload.products, vendor_id: productsPayload.vendor_id };
  return cachedPricing;
}

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
