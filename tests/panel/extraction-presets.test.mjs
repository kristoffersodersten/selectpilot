// module_name: panel_unit_tests
// spec_ref: "testing_strategy.unit_tests"
import test from 'node:test';
import assert from 'node:assert/strict';

import { EXTRACTION_PRESETS, getExtractionPreset } from '../../panel/extraction-presets.js';

test('exposes the execution-layer extraction presets', () => {
  assert.ok(EXTRACTION_PRESETS.length >= 4);
  assert.deepEqual(
    EXTRACTION_PRESETS.map((preset) => preset.key),
    ['action_brief', 'generic_json', 'job_brief', 'decision_log']
  );
});

test('rejects unknown presets without fallback', () => {
  assert.throws(() => getExtractionPreset('unknown'), /Unknown extraction preset/);
});
