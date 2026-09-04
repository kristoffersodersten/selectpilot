// module_name: entitlement_keyring_contract
// spec_ref: "security"

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const PUBLIC_KEY_PATTERN = /^[0-9a-f]{64}$/i;

function assertKeyEntry(key) {
  if (
    !key
    || typeof key !== 'object'
    || !KEY_ID_PATTERN.test(String(key.kid || ''))
    || key.alg !== 'Ed25519'
    || !PUBLIC_KEY_PATTERN.test(String(key.public_key_hex || ''))
    || !['active', 'retiring'].includes(key.status)
  ) {
    throw new Error('Entitlement public keyring contains an invalid Ed25519 key entry');
  }
}

// @spec_ref security
export function validateEntitlementKeyring(value, { requireActive = true } = {}) {
  if (!value || typeof value !== 'object' || value.schema_version !== 1 || !Array.isArray(value.keys)) {
    throw new Error('Entitlement public keyring must use schema_version 1 with a keys array');
  }

  value.keys.forEach(assertKeyEntry);
  const ids = value.keys.map((key) => key.kid);
  if (new Set(ids).size !== ids.length) throw new Error('Entitlement public key IDs must be unique');

  const active = value.keys.filter((key) => key.status === 'active');
  if (requireActive && active.length !== 1) {
    throw new Error('Entitlement public keyring must contain exactly one active signing identity');
  }
  if (!requireActive && active.length > 0) {
    throw new Error('Repository entitlement keyring must remain unprovisioned');
  }

  return {
    schema_version: 1,
    keys: value.keys.map((key) => ({
      kid: key.kid,
      alg: 'Ed25519',
      public_key_hex: key.public_key_hex.toLowerCase(),
      status: key.status,
    })),
  };
}

// @spec_ref security
export function parseProvisionedEntitlementKeyring(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Store package blocked: SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON is required');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON must be valid JSON');
  }

  if (parsed?.schema_version === 1 && Array.isArray(parsed.keys)) {
    return validateEntitlementKeyring(parsed);
  }

  const entries = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed)
    : [];
  if (entries.length !== 1) {
    throw new Error('Map-form entitlement keyring must contain exactly one active key');
  }

  const [kid, publicKeyHex] = entries[0];
  return validateEntitlementKeyring({
    schema_version: 1,
    keys: [{ kid, alg: 'Ed25519', public_key_hex: String(publicKeyHex), status: 'active' }],
  });
}
