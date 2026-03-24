import { endpoints } from '../api/endpoints.js';
import { apiRequest } from '../api/request.js';
import { daysFrom } from '../utils/time.js';
import { error, log } from '../utils/logger.js';
import { loadLicense, loadToken, saveLicense, LicenseRecord } from './license-storage.js';

const OFFLINE_GRACE_DAYS = 5;

async function remoteVerify(token: string): Promise<LicenseRecord | null> {
  try {
    const res = await apiRequest<LicenseRecord>(endpoints.licenseVerify, { body: { token } });
    return res;
  } catch (e) {
    error('license', 'remote verification failed', e);
    return null;
  }
}

export async function verifyLicense(): Promise<LicenseRecord | null> {
  const cached = await loadLicense();
  const token = await loadToken();
  if (!token) {
    return null;
  }

  const offlineOk = cached && (!cached.expiresAt || Date.now() < cached.expiresAt + OFFLINE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  if (offlineOk && daysFrom(cached.issuedAt) <= OFFLINE_GRACE_DAYS) {
    log('license', 'using cached license within offline grace');
    return cached;
  }

  const remote = await remoteVerify(token);
  if (remote) {
    await saveLicense(remote);
    return remote;
  }

  return offlineOk ? cached : null;
}
