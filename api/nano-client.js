import { endpoints } from './endpoints.js';
import { apiRequest } from './request.js';
export async function summarize(payload) {
    return apiRequest(endpoints.summarize, { body: payload });
}
export async function extract(payload) {
    return apiRequest(endpoints.extract, { body: payload });
}
export async function transcribe(payload) {
    return apiRequest(endpoints.transcribe, { body: payload });
}
export async function vision(payload) {
    return apiRequest(endpoints.vision, { body: payload });
}
export async function embed(payload) {
    return apiRequest(endpoints.embed, { body: payload });
}
export async function agent(payload) {
    return apiRequest(endpoints.agent, { body: payload });
}
