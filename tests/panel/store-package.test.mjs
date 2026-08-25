// module_name: tests_panel_store-package_test_mjs
// spec_ref: "testing_strategy.integration_tests"

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuntimeFiles, assertReleaseSafe } from '../../scripts/package-chrome-store.mjs';
import { REQUIRED_IMAGES, readPngDimensions, validateStoreAssets } from '../../scripts/validate-store-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Chrome Web Store image dimensions match the submission contract', async () => {
  const files = await validateStoreAssets(root);
  assert.deepEqual(files, [...REQUIRED_IMAGES.keys()]);
  const icon = await readFile(path.join(root, 'assets/icon128.png'));
  assert.deepEqual(readPngDimensions(icon), [128, 128]);
});

test('runtime inventory excludes source, tests, reports, and transient files', async () => {
  const files = await collectRuntimeFiles(root);
  assert.ok(files.includes('manifest.json'));
  assert.ok(files.includes('background/background.js'));
  assert.ok(files.includes('content/content-script.bundle.js'));
  assert.ok(files.includes('assets/icon128.png'));
  assert.ok(files.includes('pricing/tier-feature-map.json'));
  assert.ok(files.includes('pricing/entitlement-public-keys.json'));
  assert.ok(!files.some((file) => file.startsWith('billing/')));
  assert.ok(!files.includes('pricing/paddle-products.json'));
  assert.ok(!files.some((file) => file.startsWith('assets/marketing/')));
  assert.ok(files.every((file) => !file.endsWith('.ts')));
  assert.ok(files.every((file) => !/(^|\/)(tests|reports|node_modules)(\/|$)/.test(file)));
});

test('store release accepts the pinned production entitlement keyring', async () => {
  const files = await collectRuntimeFiles(root);
  await assert.doesNotReject(assertReleaseSafe(files, root));
});

test('relative CLI paths execute validation and deterministic packaging', () => {
  const validation = execFileSync(process.execPath, ['./scripts/validate-store-assets.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(validation, /Validated 6 Chrome Web Store images/);

  const packaging = spawnSync(process.execPath, ['./scripts/package-chrome-store.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(packaging.status, 0, packaging.stderr);
  assert.match(packaging.stdout, /^selectpilot-1\.0\.0\.zip [0-9a-f]{64}\s*$/);
});

test('store release rejects remotely hosted executable code', async () => {
  const releaseRoot = await mkdtemp(path.join(tmpdir(), 'selectpilot-remote-code-'));
  await mkdir(path.join(releaseRoot, 'background'), { recursive: true });
  await mkdir(path.join(releaseRoot, 'pricing'), { recursive: true });
  await writeFile(
    path.join(releaseRoot, 'background/entitlement-service.js'),
    'const PUBLIC_KEY_HEX = "01";'
  );
  await writeFile(
    path.join(releaseRoot, 'pricing/entitlement-public-keys.json'),
    JSON.stringify({
      schema_version: 1,
      keys: [{ kid: 'test', alg: 'Ed25519', public_key_hex: '01'.repeat(32), status: 'active' }],
    })
  );
  await writeFile(
    path.join(releaseRoot, 'remote.js'),
    'script.src = "https://cdn.example.com/runtime.js";'
  );

  await assert.rejects(
    assertReleaseSafe(['remote.js'], releaseRoot),
    /Remote hosted code/
  );
});
