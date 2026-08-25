// module_name: macos_release_contract_test
// spec_ref: "security"

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('production helper release fails before packaging without signing authority', () => {
  const result = spawnSync('sh', ['./scripts/release-macos-helper.sh'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SELECTPILOT_INSTALLER_SIGN_IDENTITY/);
});

test('production helper release requires notarization and Gatekeeper validation', () => {
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  const release = readFileSync('./scripts/release-macos-helper.sh', 'utf8');
  const candidate = readFileSync('./scripts/package-macos-helper.sh', 'utf8');

  assert.equal(packageJson.scripts['release:helper:macos'], 'sh ./scripts/release-macos-helper.sh');
  assert.match(release, /SELECTPILOT_INSTALLER_SIGN_IDENTITY/);
  assert.match(release, /SELECTPILOT_NOTARY_KEYCHAIN_PROFILE/);
  assert.match(release, /package-macos-helper\.sh/);
  assert.match(release, /notarytool submit/);
  assert.match(release, /--keychain-profile/);
  assert.match(release, /--wait/);
  assert.match(release, /stapler staple/);
  assert.match(release, /stapler validate/);
  assert.match(release, /pkgutil --check-signature/);
  assert.match(release, /spctl --assess --type install/);
  assert.match(release, /shasum -a 256/);

  assert.match(candidate, /SelectPilot-Installer-unsigned\.pkg/);
  assert.match(candidate, /SELECTPILOT_INSTALLER_SIGN_IDENTITY/);
});
