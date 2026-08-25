// module_name: entitlement_key_verification
// spec_ref: "validation_layer"
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const privateKeyFile = process.env.SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE;
if (!privateKeyFile) throw new Error('SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE is required');
const keyring = JSON.parse(await readFile('pricing/entitlement-public-keys.json', 'utf8'));
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
