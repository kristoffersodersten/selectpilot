import { verifyLicense } from '../licensing/license-verifier.js';
import { loadLicense, saveLicense } from '../licensing/license-storage.js';
import { log } from '../utils/logger.js';
import { nowISO } from '../utils/time.js';

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
  const verified = await verifyLicense();
  if (verified) return verified.tier;
  const pricing = await getPricing();
  if (pricing.trial.enabled) {
    const stored = await loadLicense();
    if (!stored) {
      const trial: any = {
        token: 'trial-local',
        tier: pricing.trial.access,
        issuedAt: Date.now(),
        expiresAt: Date.now() + pricing.trial.duration_days * 24 * 60 * 60 * 1000
      };
      await saveLicense(trial);
      log('tier', 'trial applied', trial);
      return pricing.trial.access;
    }
    if (stored.expiresAt && Date.now() < stored.expiresAt) {
      return stored.tier;
    }
  }
  return 'essential';
}

export async function requireFeature(feature: string): Promise<{ allowed: boolean; tier: string }> {
  const tier = await getLicenseTier();
  const allowed = await isFeatureEnabled(feature, tier as any);
  return { allowed, tier };
}
