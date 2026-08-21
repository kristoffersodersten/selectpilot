#!/usr/bin/env node
// module_name: scripts_validate-store-assets_mjs
// spec_ref: "reporting"

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const REQUIRED_IMAGES = new Map([
  ['assets/icon128.png', [128, 128]],
  ['assets/marketing/selectpilot-screenshot-extract.png', [1280, 800]],
  ['assets/marketing/selectpilot-screenshot-runtime.png', [1280, 800]],
  ['assets/marketing/selectpilot-screenshot-privacy.png', [1280, 800]],
  ['assets/marketing/selectpilot-small-promo.png', [440, 280]],
  ['assets/marketing/selectpilot-marquee.png', [1400, 560]],
]);

// @spec_ref reporting
export function readPngDimensions(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a' || buffer.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('not a PNG with an IHDR header');
  }
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

export async function validateStoreAssets(root = projectRoot) {
  const errors = [];
  for (const [relativePath, expected] of REQUIRED_IMAGES) {
    try {
      const actual = readPngDimensions(await readFile(path.join(root, relativePath)));
      if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
        errors.push(`${relativePath}: expected ${expected.join('x')}, got ${actual.join('x')}`);
      }
    } catch (error) {
      errors.push(`${relativePath}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`Store asset validation failed:\n- ${errors.join('\n- ')}`);
  return [...REQUIRED_IMAGES.keys()];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await validateStoreAssets();
  console.log(`Validated ${REQUIRED_IMAGES.size} Chrome Web Store images.`);
}
