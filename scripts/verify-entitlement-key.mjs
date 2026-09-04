// module_name: entitlement_key_verification
// spec_ref: "validation_layer"
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseProvisionedEntitlementKeyring } from './entitlement-keyring.mjs';

const privateKeyFile = process.env.SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE;
if (!privateKeyFile) throw new Error('SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE is required');
const publicKeyringFile = process.env.SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_FILE;
const publicKeyringJson = process.env.SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON
  || (publicKeyringFile ? await readFile(publicKeyringFile, 'utf8') : '');
const keyring = parseProvisionedEntitlementKeyring(publicKeyringJson);
const active = keyring.keys.filter((key) => key.status === 'active');
if (active.length !== 1) throw new Error('Exactly one active entitlement key is required');
const privateKey = createPrivateKey(await readFile(privateKeyFile));
const publicDer = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
const publicHex = publicDer.subarray(-32).toString('hex');
if (publicHex !== active[0].public_key_hex) throw new Error('Private key does not match the pinned public key');
const payload = Buffer.from(JSON.stringify({ token: 'verification-only', tier: 'essential', features: [], issuedAt: 0, expiresAt: null }));
const signature = sign(null, payload, privateKey);
if (!verify(null, payload, createPublicKey(privateKey), signature)) throw new Error('Ed25519 verification failed');
console.log(`Entitlement signing key verified: ${active[0].kid}`);
