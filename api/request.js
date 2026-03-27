import { log, warn } from '../utils/logger.js';
export class ApiRequestError extends Error {
    status;
    code;
    details;
    traceId;
    constructor(message, opts) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = opts.status;
        this.code = opts.code;
        this.details = opts.details;
        this.traceId = opts.traceId;
    }
}
function createTraceId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function parseJsonSafe(text) {
    if (!text.trim())
        return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
    }
    catch {
        return null;
    }
}
export async function apiRequest(url, options = {}) {
    const { method = 'POST', headers = {}, body } = options;
    const traceId = createTraceId();
    const init = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'x-selectpilot-trace-id': traceId,
            ...headers
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store'
    };
    log('api', method, url);
    const res = await fetch(url, init);
    const text = await res.text();
    const parsed = parseJsonSafe(text);
    const maybeError = parsed?.error;
    const traceIdFromResponse = parsed?.trace_id ||
        maybeError?.details?.trace_id ||
        traceId;
    if (!res.ok) {
        warn('api', 'non-200', res.status, text);
        const code = maybeError?.code || `http_${res.status}`;
        const message = maybeError?.message || `API ${res.status}: ${text}`;
        throw new ApiRequestError(message, {
            status: res.status,
            code,
            details: maybeError?.details,
            traceId: traceIdFromResponse,
        });
    }
    if (!parsed) {
        throw new ApiRequestError('API returned invalid JSON', {
            status: res.status,
            code: 'invalid_json_response',
            traceId,
        });
    }
    const data = parsed;
    return data;
}
