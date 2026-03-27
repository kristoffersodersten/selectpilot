import { getEntitlementTier, hasEntitlementFeature, refreshEntitlement, setEntitlementToken, } from './entitlement-service.js';
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
    return getEntitlementTier();
}
export async function requireFeature(feature) {
    const tier = await getLicenseTier();
    const allowed = await hasEntitlementFeature(feature);
    return { allowed, tier };
}
export async function refreshLicense(force = false) {
    return refreshEntitlement(force);
}
export async function attachLicenseToken(token) {
    await setEntitlementToken(token);
    return refreshEntitlement(true);
}
