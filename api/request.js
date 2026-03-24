import { log, warn } from '../utils/logger.js';
export async function apiRequest(url, options = {}) {
    const { method = 'POST', headers = {}, body } = options;
    const init = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store'
    };
    log('api', method, url);
    const res = await fetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        warn('api', 'non-200', res.status, text);
        throw new Error(`API ${res.status}: ${text}`);
    }
    const data = (await res.json());
    return data;
}
