// module_name: tests_panel_capability_truth_test_mjs
// spec_ref: "testing_strategy.integration_tests"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { endpoints } from '../../api/endpoints.js';

test('unimplemented media capabilities are absent from the shipped extension', async () => {
  const [panel, harness, background] = await Promise.all([
    readFile(new URL('../../panel/panel.html', import.meta.url), 'utf8'),
    readFile(new URL('../e2e/panel-harness.html', import.meta.url), 'utf8'),
    readFile(new URL('../../background/background.js', import.meta.url), 'utf8'),
  ]);

  assert.equal('transcribe' in endpoints, false);
  assert.equal('vision' in endpoints, false);
  assert.doesNotMatch(panel, /btn-(?:transcribe|vision)/);
  assert.doesNotMatch(harness, /btn-(?:transcribe|vision)/);
  assert.doesNotMatch(background, /panel:(?:transcribe|vision)/);
});
