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

test('falls back to action brief for unknown presets', () => {
  const preset = getExtractionPreset('unknown');
  assert.equal(preset.key, 'action_brief');
  assert.equal(preset.label, 'Action Brief');
});
