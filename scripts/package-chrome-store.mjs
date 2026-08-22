#!/usr/bin/env node
// module_name: scripts_package-chrome-store_mjs
// spec_ref: "reporting"

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateStoreAssets } from './validate-store-assets.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixedDate = new Date('2026-01-01T00:00:00Z');
const runtimeRoots = ['agent', 'api', 'background', 'content', 'licensing', 'panel', 'popup', 'shared', 'utils'];
const runtimeAssets = [
  'assets/icon16.png',
  'assets/icon32.png',
  'assets/icon48.png',
  'assets/icon128.png',
  'assets/icon256.png',
  'assets/icon512.png',
  'pricing/tier-feature-map.json',
];
const allowedExtensions = new Set(['.css', '.html', '.js', '.json', '.png', '.svg']);
const forbiddenPath = /(^|\/)(?:\.env|tests?|reports?|logs?|node_modules|test-results|playwright-report)(\/|$)|\.(?:map|log|pem|key)$/i;
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:api|secret|private)[_-]?key\s*[:=]\s*["'][^"']{12,}["']/i,
];

async function walk(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, base));
    if (entry.isFile()) files.push(path.relative(base, absolute));
  }
  return files;
}

export async function collectRuntimeFiles(root = projectRoot) {
  const files = ['manifest.json', ...runtimeAssets];
  for (const runtimeRoot of runtimeRoots) {
    const absoluteRoot = path.join(root, runtimeRoot);
    for (const nested of await walk(absoluteRoot)) {
      const relative = path.posix.join(runtimeRoot, nested.split(path.sep).join(path.posix.sep));
      if (allowedExtensions.has(path.extname(relative)) && !forbiddenPath.test(relative)) files.push(relative);
    }
  }
  return files.sort();
}

export async function assertReleaseSafe(files, root = projectRoot) {
  const entitlement = await readFile(path.join(root, 'background/entitlement-service.js'), 'utf8');
  if (entitlement.includes('__SELECTPILOT_ENTITLEMENT_PUBLIC_KEY_HEX__') || entitlement.includes('__SELECTPILOT_ENTITLEMENT_KEY_ID__')) {
    throw new Error('Store package blocked: production entitlement signature verification is not configured (SOD-837).');
  }
  if (files.some((file) => file.startsWith('billing/') || file === 'pricing/paddle-products.json')) {
    throw new Error('Store package blocked: inactive remote checkout code or product placeholders entered runtime inventory.');
  }

  for (const relative of files) {
    if (forbiddenPath.test(relative)) throw new Error(`Forbidden release path: ${relative}`);
    const absolute = path.join(root, relative);
    if (!(await stat(absolute)).isFile()) throw new Error(`Missing release file: ${relative}`);
    if (!['.png'].includes(path.extname(relative))) {
      const content = await readFile(absolute, 'utf8');
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) throw new Error(`Potential secret in release file: ${relative}`);
      }
    }
  }
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

export async function packageChromeStore(root = projectRoot) {
  await validateStoreAssets(root);
  const files = await collectRuntimeFiles(root);
  await assertReleaseSafe(files, root);

  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const outputRoot = path.join(root, 'dist', 'chrome-web-store');
  const stageRoot = path.join(outputRoot, `selectpilot-${packageJson.version}`);
  const zipPath = `${stageRoot}.zip`;
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(stageRoot, { recursive: true });

  for (const relative of files) {
    const destination = path.join(stageRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, relative), destination);
    await utimes(destination, fixedDate, fixedDate);
  }

  const zip = spawnSync('zip', ['-X', '-q', zipPath, ...files], {
    cwd: stageRoot,
    encoding: 'utf8',
    env: { ...process.env, TZ: 'UTC' },
  });
  if (zip.error || zip.status !== 0) throw new Error(`zip failed: ${zip.error?.message || zip.stderr || zip.status}`);

  const report = {
    schema_version: 1,
    version: packageJson.version,
    artifact: path.basename(zipPath),
    sha256: await sha256(zipPath),
    file_count: files.length,
    files,
  };
  await writeFile(`${zipPath}.json`, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await packageChromeStore();
  console.log(`${report.artifact} ${report.sha256}`);
}
