// module_name: api_endpoints_ts
// spec_ref: "execution_layer"
export const API_BASE = 'http://127.0.0.1:8083';
export const endpoints = {
  health: `${API_BASE}/health`,
  profiles: `${API_BASE}/profiles`,
  runtimeMetaHealth: `${API_BASE}/runtime-meta/health`,
  runtimeMetaStream: `${API_BASE}/runtime-meta/stream`,
  intentCompile: `${API_BASE}/intent/compile`,
  benchmark: `${API_BASE}/benchmark`,
  installationStatus: `${API_BASE}/installation/status`,
  installationStart: `${API_BASE}/installation/start`,
  privacyProof: `${API_BASE}/privacy-proof`,
  summarize: `${API_BASE}/summarize`,
  extract: `${API_BASE}/extract`,
  embed: `${API_BASE}/embed`,
  agent: `${API_BASE}/agent`,
  licenseVerify: `${API_BASE}/license/verify`,
  licenseTrial: `${API_BASE}/license/trial`,
  licenseClaim: `${API_BASE}/license/claim`,
};
