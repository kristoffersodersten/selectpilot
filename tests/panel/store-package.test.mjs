// module_name: tests_panel_store-package_test_mjs
// spec_ref: "testing_strategy.integration_tests"

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
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
  assert.ok(!files.some((file) => file.startsWith('billing/')));
  assert.ok(!files.includes('pricing/paddle-products.json'));
  assert.ok(!files.some((file) => file.startsWith('assets/marketing/')));
  assert.ok(files.every((file) => !file.endsWith('.ts')));
  assert.ok(files.every((file) => !/(^|\/)(tests|reports|node_modules)(\/|$)/.test(file)));
});

test('store packaging fails closed while entitlement verification is unsigned', async () => {
  const files = await collectRuntimeFiles(root);
  await assert.rejects(
    assertReleaseSafe(files, root),
    /production entitlement signature verification is not configured/
  );
});

test('relative CLI paths execute validation and fail-closed packaging', () => {
  const validation = execFileSync(process.execPath, ['./scripts/validate-store-assets.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(validation, /Validated 6 Chrome Web Store images/);

  const packaging = spawnSync(process.execPath, ['./scripts/package-chrome-store.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(packaging.status, 1);
  assert.match(packaging.stderr, /production entitlement signature verification is not configured/);
});
