// module_name: axiom_intent_verifier
// spec_ref: "validation_layer"
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SIGNED_FIELDS = [
  'id',
  'goal',
  'linear_issue_id',
  'canonical_reference',
  'contract_target',
  'layer',
  'acceptance_criteria',
  'verification_method',
  'constraints',
  'allowed_actions',
  'forbidden_actions',
  'perception_targets',
  'expires_at',
  'nonce',
];

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function matchesPattern(file, pattern) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  return new RegExp(`${expression}$`).test(file);
}

// @spec_ref validation_layer
export function verifyAxiomIntent(intent, trust, { changedFiles = [], nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const failures = [];
  const publicKeyBytes = Buffer.from(intent?.signature?.public_key || '', 'base64');
  const publicKeyHash = createHash('sha256').update(publicKeyBytes).digest('hex');

  if (intent?.signature?.algorithm !== 'ed25519') failures.push('invalid_algorithm');
  if (intent?.signature?.public_key !== intent?.signer?.public_key) failures.push('signer_key_mismatch');
  if (intent?.signer?.role !== 'owner') failures.push('invalid_signer_role');
  if (publicKeyHash !== trust?.owner_public_key_sha256) failures.push('untrusted_signer');
  if (JSON.stringify(intent?.signature?.signed_payload_fields) !== JSON.stringify(SIGNED_FIELDS)) failures.push('signed_fields_mismatch');
  if (!Number.isInteger(intent?.expires_at) || intent.expires_at <= nowSeconds) failures.push('intent_expired');
  if (!/^AXIOM-[A-Z0-9-]+$/.test(intent?.id || '')) failures.push('invalid_intent_id');
  if (!/^SOD-[0-9]+$/.test(intent?.linear_issue_id || '')) failures.push('invalid_linear_issue');
  if (!/^kristoffersodersten\/selectpilot@[0-9a-f]{40}$/.test(intent?.canonical_reference || '')) failures.push('invalid_canonical_reference');

  try {
    const payload = Object.fromEntries(SIGNED_FIELDS.map((field) => [field, intent[field]]));
    const publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
    const valid = verify(
      null,
      Buffer.from(stableStringify(payload), 'utf8'),
      publicKey,
      Buffer.from(intent.signature.value || '', 'base64'),
    );
    if (!valid) failures.push('invalid_signature');
  } catch {
    failures.push('invalid_signature');
  }

  for (const file of changedFiles) {
    if (intent.forbidden_actions?.some((pattern) => matchesPattern(file, pattern))) {
      failures.push(`forbidden_file_change:${file}`);
    } else if (!intent.allowed_actions?.some((pattern) => matchesPattern(file, pattern))) {
      failures.push(`unknown_file_change:${file}`);
    }
  }

  return { ok: failures.length === 0, failures };
}

async function main() {
  const changedFilesIndex = process.argv.indexOf('--changed-files');
  const changedFiles = changedFilesIndex >= 0
    ? (await readFile(resolve(process.argv[changedFilesIndex + 1]), 'utf8')).split(/\r?\n/).filter(Boolean)
    : [];
  const intent = JSON.parse(await readFile(resolve('intent.json'), 'utf8'));
  const trust = JSON.parse(await readFile(resolve('governance/axiom-trust.json'), 'utf8'));
  const result = verifyAxiomIntent(intent, trust, { changedFiles });
  process.stdout.write(`${JSON.stringify({ ...result, intent_id: intent.id, authority_sha: trust.authority_sha })}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) await main();
