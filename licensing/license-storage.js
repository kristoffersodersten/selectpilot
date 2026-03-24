import { getDecrypted, setEncrypted } from '../utils/storage.js';
const LICENSE_KEY = 'chromeai_license_token';
const LICENSE_META = 'chromeai_license_metadata';
export async function saveLicense(record) {
    await setEncrypted(LICENSE_KEY, record.token);
    await setEncrypted(LICENSE_META, JSON.stringify(record));
}
export async function loadLicense() {
    const raw = await getDecrypted(LICENSE_META);
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export async function loadToken() {
    return getDecrypted(LICENSE_KEY);
}
