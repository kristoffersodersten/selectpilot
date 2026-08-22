#!/usr/bin/env node
// module_name: scripts_build-extension_mjs
// spec_ref: "reporting"

import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function injectEntitlementPublicKeys() {
  const raw = process.env.SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON;
  if (!raw) return;
  let keys;
  try {
    keys = JSON.parse(raw);
  } catch {
    throw new Error('SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON must be valid JSON');
  }
  const entries = Object.entries(keys ?? {});
  if (entries.length === 0 || entries.some(([kid, key]) => !/^[A-Za-z0-9._-]{1,64}$/.test(kid) || !/^[0-9a-f]{64}$/i.test(String(key)))) {
    throw new Error('Entitlement public key ring must contain valid key IDs and 32-byte Ed25519 public keys');
  }
  const target = path.join(projectRoot, 'background/entitlement-service.js');
  const source = await readFile(target, 'utf8');
  const configured = source.replace(
    /const ENTITLEMENT_PUBLIC_KEYS = \{[\s\S]*?\n\};/,
    `const ENTITLEMENT_PUBLIC_KEYS = ${JSON.stringify(keys)};`,
  );
  if (configured === source) throw new Error('Entitlement public key injection marker not found');
  await writeFile(target, configured);
}

await injectEntitlementPublicKeys();

await build({
  entryPoints: [path.join(projectRoot, 'content/content-script.ts')],
  outfile: path.join(projectRoot, 'content/content-script.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome127'],
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});
