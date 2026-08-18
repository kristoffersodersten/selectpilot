// module_name: utils_storage_ts
// spec_ref: "frontend_state_contract"
import { error, log } from './logger.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY_STORAGE = 'selectpilot_encryption_key_v1';
let cryptoKeyPromise = null;
async function loadOrCreateCryptoKey() {
    const stored = (await chrome.storage.local.get(KEY_STORAGE))[KEY_STORAGE];
    let keyData;
    if (Array.isArray(stored) && stored.length === 32 && stored.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        keyData = new Uint8Array(stored);
    }
    else {
        keyData = crypto.getRandomValues(new Uint8Array(32));
        await chrome.storage.local.set({ [KEY_STORAGE]: Array.from(keyData) });
    }
    return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
function getCryptoKey() {
    cryptoKeyPromise ||= loadOrCreateCryptoKey();
    return cryptoKeyPromise;
}
export async function setEncrypted(key, value) {
    try {
        const cryptoKey = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoder.encode(value));
        const payload = {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(cipher))
        };
        await chrome.storage.local.set({ [key]: JSON.stringify(payload) });
    }
    catch (e) {
        error('storage', 'encrypt failed', e);
        throw e;
    }
}
export async function getDecrypted(key) {
    const stored = (await chrome.storage.local.get(key))[key];
    if (typeof stored !== 'string' || !stored)
        return null;
    try {
        const parsed = JSON.parse(stored);
        const iv = new Uint8Array(parsed.iv);
        const data = new Uint8Array(parsed.data);
        const cryptoKey = await getCryptoKey();
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
        return decoder.decode(plain);
    }
    catch (e) {
        error('storage', 'decrypt failed', e);
        return null;
    }
}
export async function setJSON(key, value) {
    await chrome.storage.local.set({ [key]: JSON.stringify(value) });
}
export async function getJSON(key) {
    const stored = (await chrome.storage.local.get(key))[key];
    if (typeof stored !== 'string' || !stored)
        return null;
    try {
        return JSON.parse(stored);
    }
    catch (e) {
        log('storage', 'parse JSON failed', e);
        return null;
    }
}
