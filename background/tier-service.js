import { verifyLicense } from '../licensing/license-verifier.js';
import { loadLicense, saveLicense } from '../licensing/license-storage.js';
import { log } from '../utils/logger.js';
async function loadJSON(path) {
    const url = chrome.runtime.getURL(path);
    const res = await fetch(url);
    return (await res.json());
}
let cachedPricing = null;
let cachedFeatures = null;
export async function getPricing() {
    if (cachedPricing)
        return cachedPricing;
    const pricing = await loadJSON('pricing/pricing-global.json');
    const productsPayload = await loadJSON('pricing/paddle-products.json');
    cachedPricing = { ...pricing, products: productsPayload.products, vendor_id: productsPayload.vendor_id };
    return cachedPricing;
}
export async function getFeatures() {
    if (cachedFeatures)
        return cachedFeatures;
    cachedFeatures = await loadJSON('pricing/tier-feature-map.json');
    return cachedFeatures;
}
export async function isFeatureEnabled(feature, tier) {
    const features = await getFeatures();
    const order = ['essential', 'plus', 'pro'];
    const idx = order.indexOf(tier);
    for (let i = 0; i <= idx; i++) {
        if (features[order[i]].includes(feature))
            return true;
    }
    return false;
}
export async function getLicenseTier() {
    const verified = await verifyLicense();
    if (verified)
        return verified.tier;
    const pricing = await getPricing();
    if (pricing.trial.enabled) {
        const stored = await loadLicense();
        if (!stored) {
            const trial = {
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
export async function requireFeature(feature) {
    const tier = await getLicenseTier();
    const allowed = await isFeatureEnabled(feature, tier);
    return { allowed, tier };
}
