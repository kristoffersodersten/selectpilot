// module_name: local_settings_boundary_tests
// spec_ref: "privacy_and_debug_policy"
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectRuntimeFiles } from '../../scripts/package-chrome-store.mjs';

test('extension preferences remain device-local and never use Chrome sync', async () => {
  const source = await readFile(new URL('../../options/options.ts', import.meta.url), 'utf8');
  assert.match(source, /chrome\.storage\.local\.get/);
  assert.match(source, /chrome\.storage\.local\.set/);

  const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
  const runtimeFiles = (await collectRuntimeFiles(projectRoot)).filter((file) => /\.(?:html|js)$/.test(file));
  for (const runtimeFile of runtimeFiles) {
    const runtimeSource = await readFile(new URL(`../../${runtimeFile}`, import.meta.url), 'utf8');
    assert.doesNotMatch(runtimeSource, /chrome\.storage\.sync/, `${runtimeFile} must not use Chrome Sync`);
  }
});
