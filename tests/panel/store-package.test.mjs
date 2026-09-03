// module_name: tests_panel_store-package_test_mjs
// spec_ref: "testing_strategy.integration_tests"

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectRuntimeFiles,
  assertReleaseSafe,
  assertSourceKeyringUnprovisioned,
  packageChromeStore,
} from '../../scripts/package-chrome-store.mjs';
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
  assert.ok(!files.some((file) => file.startsWith('content/') && file !== 'content/content-script.bundle.js'));
  assert.ok(files.includes('assets/icon128.png'));
  assert.ok(files.includes('pricing/tier-feature-map.json'));
  assert.ok(files.includes('pricing/entitlement-public-keys.json'));
  assert.ok(!files.some((file) => file.startsWith('billing/')));
  assert.ok(!files.includes('pricing/paddle-products.json'));
  assert.ok(!files.some((file) => file.startsWith('assets/marketing/')));
  assert.ok(!files.some((file) => /(?:audio|video|image).*(?:extract|ocr|transcri)/i.test(file)));
  assert.ok(files.every((file) => !file.endsWith('.ts')));
  assert.ok(files.every((file) => !/(^|\/)(tests|reports|node_modules)(\/|$)/.test(file)));
});

test('repository keyring remains deliberately unprovisioned', async () => {
  await assert.doesNotReject(assertSourceKeyringUnprovisioned(root));
});

test('store runtime captures selected text only', async () => {
  const bundle = await readFile(path.join(root, 'content/content-script.bundle.js'), 'utf8');
  const background = await readFile(path.join(root, 'background/background.js'), 'utf8');
  assert.match(bundle, /content:get_selection/);
  assert.doesNotMatch(bundle, /content:get_(?:document|audio|video)/);
  assert.doesNotMatch(bundle, /querySelector\(["'](?:audio|video)["']\)|drawImage\(/);
  assert.doesNotMatch(background, /content:get_(?:document|audio|video)/);

  const tiers = JSON.parse(await readFile(path.join(root, 'pricing/tier-feature-map.json'), 'utf8'));
  assert.ok(Object.values(tiers).flat().every((feature) => !/(?:audio|video|image|multimodal)/i.test(feature)));
});

test('relative CLI paths validate assets and block packaging without explicit release identity', () => {
  const validation = execFileSync(process.execPath, ['./scripts/validate-store-assets.mjs'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(validation, /Validated 6 Chrome Web Store images/);

  const packaging = spawnSync(process.execPath, ['./scripts/package-chrome-store.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON: '' },
  });
  assert.notEqual(packaging.status, 0);
  assert.match(packaging.stderr, /SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_JSON is required/);
});

test('explicit public identity is injected only into the isolated Store staging tree', async () => {
  const releaseRoot = await mkdtemp(path.join(tmpdir(), 'selectpilot-store-package-'));
  const files = await collectRuntimeFiles(root);
  for (const relative of new Set([...files, ...REQUIRED_IMAGES.keys(), 'package.json'])) {
    const destination = path.join(releaseRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(root, relative), destination);
  }

  const publicKey = 'ab'.repeat(32);
  const report = await packageChromeStore(releaseRoot, {
    entitlementKeyringJson: JSON.stringify({ 'selectpilot-test-release': publicKey }),
    sourceRevision: '1'.repeat(40),
  });
  const stagedKeyring = JSON.parse(await readFile(
    path.join(releaseRoot, 'dist/chrome-web-store/selectpilot-1.0.0/pricing/entitlement-public-keys.json'),
    'utf8',
  ));
  const sourceKeyring = JSON.parse(await readFile(path.join(releaseRoot, 'pricing/entitlement-public-keys.json'), 'utf8'));

  assert.deepEqual(report.entitlement_key_ids, ['selectpilot-test-release']);
  assert.equal(report.source_revision, '1'.repeat(40));
  assert.match(report.entitlement_keyring_sha256, /^[0-9a-f]{64}$/);
  assert.equal(stagedKeyring.keys[0].public_key_hex, publicKey);
  assert.deepEqual(sourceKeyring.keys, []);
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
