export const API_BASE = 'http://127.0.0.1:8083';
export const BILLING_BASE = 'http://127.0.0.1:8090';
export const endpoints = {
    health: `${API_BASE}/health`,
    profiles: `${API_BASE}/profiles`,
    runtimeMetaHealth: `${API_BASE}/runtime-meta/health`,
    runtimeMetaStream: `${API_BASE}/runtime-meta/stream`,
    intentCompile: `${API_BASE}/intent/compile`,
    benchmark: `${API_BASE}/benchmark`,
    privacyProof: `${API_BASE}/privacy-proof`,
    summarize: `${API_BASE}/summarize`,
    extract: `${API_BASE}/extract`,
    transcribe: `${API_BASE}/transcribe`,
    vision: `${API_BASE}/vision`,
    embed: `${API_BASE}/embed`,
    agent: `${API_BASE}/agent`,
    licenseVerify: `${API_BASE}/license/verify`,
    billingOrderStatus: (orderId) => `${BILLING_BASE}/order/${encodeURIComponent(orderId)}`,
};
