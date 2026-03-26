import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');
const packagePath = resolve(root, 'package.json');
const manifestPath = resolve(root, 'manifest.json');

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const manifestJson = JSON.parse(readFileSync(manifestPath, 'utf8'));

const sourceVersion = packageJson.version;
if (!sourceVersion || typeof sourceVersion !== 'string') {
  throw new Error('package.json saknar giltig version-sträng.');
}

if (manifestJson.version !== sourceVersion) {
  manifestJson.version = sourceVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifestJson, null, 2)}\n`, 'utf8');
  console.log(`Synkade manifest.version -> ${sourceVersion}`);
} else {
  console.log(`manifest.version redan synkad (${sourceVersion})`);
}