import { log, warn } from '../utils/logger.js';

export type RequestOptions = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
};

export async function apiRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'POST', headers = {}, body } = options;
  const init: RequestInit = {
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
  const data = (await res.json()) as T;
  return data;
}
