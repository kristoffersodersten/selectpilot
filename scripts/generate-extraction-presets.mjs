#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(projectRoot, 'presets/extraction-presets.json');
const targetPath = path.join(projectRoot, 'panel/extraction-presets.generated.ts');

const source = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (!Array.isArray(source.presets) || source.presets.length === 0) {
  throw new Error('Preset registry must contain at least one preset');
}

const keys = new Set();
for (const preset of source.presets) {
  if (!preset || typeof preset !== 'object' || !preset.key || !preset.label || !preset.description) {
    throw new Error('Every preset requires key, label, and description');
  }
  if (keys.has(preset.key)) throw new Error(`Duplicate preset key: ${preset.key}`);
  keys.add(preset.key);
  if (preset.schema?.type !== 'object' || preset.schema?.additionalProperties !== false) {
    throw new Error(`Preset ${preset.key} must use a closed object schema`);
  }
  const propertyKeys = Object.keys(preset.schema.properties || {});
  const required = preset.schema.required || [];
  if (!propertyKeys.length || propertyKeys.some((key) => !required.includes(key)) || required.some((key) => !propertyKeys.includes(key))) {
    throw new Error(`Preset ${preset.key} must require every declared property exactly`);
  }
  if (!propertyKeys.includes(preset.intro_key)) {
    throw new Error(`Preset ${preset.key} intro_key must reference a schema property`);
  }
}
if (!keys.has(source.default_preset)) {
  throw new Error(`Unknown default preset: ${source.default_preset}`);
}

const output = `// Generated from presets/extraction-presets.json. Do not edit directly.\n`
  + `export const DEFAULT_EXTRACTION_PRESET = ${JSON.stringify(source.default_preset)} as const;\n`
  + `export const EXTRACTION_PRESET_DEFINITIONS = ${JSON.stringify(source.presets, null, 2)} as const;\n`;
if (process.argv.includes('--check')) {
  const current = await fs.readFile(targetPath, 'utf8').catch(() => '');
  if (current !== output) throw new Error('Generated extraction preset module is stale; run pnpm build');
} else {
  await fs.writeFile(targetPath, output, 'utf8');
}
