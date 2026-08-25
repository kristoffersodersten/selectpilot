// module_name: runtime_policy_determinism_test
// spec_ref: "prompt_determinism"

import assert from 'node:assert/strict';
import test from 'node:test';

import { replaceCompileAuditEvent } from '../../scripts/runtime-policy-lib.mjs';

test('policy compilation keeps one deterministic compile audit event', () => {
  const historical = { event_type: 'rollback', model_id: 'historical:model' };
  const staleCompile = { event_type: 'compile_policy', policy_version: 'old' };
  const currentCompile = { event_type: 'compile_policy', policy_version: 'current' };

  const once = replaceCompileAuditEvent([historical, staleCompile], currentCompile);
  const twice = replaceCompileAuditEvent(once, currentCompile);

  assert.deepEqual(twice, once);
  assert.deepEqual(twice, [historical, currentCompile]);
});
