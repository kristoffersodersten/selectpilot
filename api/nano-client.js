// module_name: api_nano-client_ts
// spec_ref: "execution_layer"
import { endpoints } from './endpoints.js';
import { apiRequest } from './request.js';
export async function summarize(payload) {
    return apiRequest(endpoints.summarize, {
        body: payload,
        timeoutMs: 45_000,
    });
}
export async function extract(payload) {
    return apiRequest(endpoints.extract, { body: payload, timeoutMs: 45_000 });
}
export async function embed(payload) {
    return apiRequest(endpoints.embed, { body: payload });
}
export async function agent(payload) {
    return apiRequest(endpoints.agent, {
        body: payload,
        timeoutMs: 45_000,
    });
}
export async function compileIntent(payload) {
    return apiRequest(endpoints.intentCompile, { body: payload });
}
export async function getRuntimeMetaHealth() {
    return apiRequest(endpoints.runtimeMetaHealth, { method: 'GET' });
}
// @spec_ref execution_layer
export function getRuntimeMetaStreamUrl(afterSeq) {
    if (typeof afterSeq === 'number' && Number.isFinite(afterSeq) && afterSeq > 0) {
        return `${endpoints.runtimeMetaStream}?after=${Math.floor(afterSeq)}`;
    }
    return endpoints.runtimeMetaStream;
}
