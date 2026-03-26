import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const manifestPath = resolve(__dirname, '..', 'manifest.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const errors = [];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isValidMatchPattern = (value) => {
  if (!isNonEmptyString(value)) return false;
  if (value === '<all_urls>') return true;
  return /^(\*|http|https|file|ftp):\/\/[^\s]+$/.test(value);
};

const validateMatches = (matches, context) => {
  if (!Array.isArray(matches) || matches.length === 0) {
    errors.push(`${context}: matches måste vara en icke-tom array.`);
    return;
  }

  for (const [index, pattern] of matches.entries()) {
    if (!isValidMatchPattern(pattern)) {
      errors.push(`${context}: ogiltigt match pattern vid index ${index}: ${JSON.stringify(pattern)}`);
    }
  }
};

if (typeof manifest.manifest_version !== 'number') {
  errors.push('manifest_version saknas eller är ogiltig.');
}

if (!isNonEmptyString(manifest.version)) {
  errors.push('version saknas eller är tom.');
}

if (Array.isArray(manifest.content_scripts)) {
  manifest.content_scripts.forEach((entry, index) => {
    validateMatches(entry?.matches, `content_scripts[${index}]`);
  });
}

if (Array.isArray(manifest.web_accessible_resources)) {
  manifest.web_accessible_resources.forEach((entry, index) => {
    validateMatches(entry?.matches, `web_accessible_resources[${index}]`);
  });
}

if (errors.length > 0) {
  console.error('Manifest lint misslyckades:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Manifest lint OK');