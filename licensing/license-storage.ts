import { getDecrypted, setEncrypted } from '../utils/storage.js';

const LICENSE_KEY = 'chromeai_license_token';
const LICENSE_META = 'chromeai_license_metadata';

export type LicenseRecord = {
  token: string;
  tier: 'essential' | 'plus' | 'pro';
  issuedAt: number;
  expiresAt?: number;
  features?: string[];
  cachedAt?: number;
  signature?: string;
  alg?: string;
  kid?: string;
};

export async function saveLicense(record: LicenseRecord): Promise<void> {
  await setEncrypted(LICENSE_KEY, record.token);
  await setEncrypted(LICENSE_META, JSON.stringify(record));
}

export async function loadLicense(): Promise<LicenseRecord | null> {
  const raw = await getDecrypted(LICENSE_META);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LicenseRecord;
  } catch {
    return null;
  }
}

export async function loadToken(): Promise<string | null> {
  return getDecrypted(LICENSE_KEY);
}
