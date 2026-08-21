// module_name: bootstrap_contract_test
// spec_ref: "runtime_profiles"

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

function bootstrapPlan(profile) {
  const stdout = execFileSync('bash', ['./scripts/bootstrap-macos-local.sh', '--profile', profile, '--plan'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

test('bootstrap plan exposes exact fail-closed Fast runtime contract without side effects', () => {
  const plan = bootstrapPlan('fast');
  assert.equal(plan.selected_profile, 'fast');
  assert.equal(plan.generation_model, 'gemma4:e2b-it-qat');
  assert.equal(plan.embedding_model, 'nomic-embed-text-v2-moe:latest');
  assert.equal(plan.num_ctx, 16_384);
  assert.equal(plan.reason, 'Explicit profile selected by operator.');
});

test('bootstrap plan exposes exact fail-closed Balanced runtime contract without side effects', () => {
  const plan = bootstrapPlan('balanced');
  assert.equal(plan.selected_profile, 'balanced');
  assert.equal(plan.generation_model, 'gemma4:e4b-it-qat');
  assert.equal(plan.embedding_model, 'nomic-embed-text-v2-moe:latest');
  assert.equal(plan.num_ctx, 32_768);
  assert.equal(plan.reason, 'Explicit profile selected by operator.');
});
