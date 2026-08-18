// module_name: tests_panel_first-run-example_test_mjs
// spec_ref: "testing_strategy.integration_tests"
import test from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_RUN_EXAMPLE } from '../../shared/first-run-example.js';

test('first-run example is fixed, local, and uses the existing action preset', () => {
  assert.equal(Object.isFrozen(FIRST_RUN_EXAMPLE), true);
  assert.equal(FIRST_RUN_EXAMPLE.url, 'selectpilot://first-run');
  assert.equal(FIRST_RUN_EXAMPLE.preset, 'action_brief');
  assert.match(FIRST_RUN_EXAMPLE.text, /privacy check/i);
  assert.equal('callerText' in FIRST_RUN_EXAMPLE, false);
});
