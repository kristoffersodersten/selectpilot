// module_name: runtime_selector_test
// spec_ref: "model_selection_layer"

import assert from 'node:assert/strict';
import test from 'node:test';

import { selectRuntimeModel } from '../../server/model/runtimeSelectorAdapter.js';

const policy = {
  policy_version: 'test-policy',
  promotion_evidence: { runtime_verified: false, status: 'simulation_only_no_promotion' },
  promotion_history: [],
  quarantined_models: [],
  defaults: [{
    task_family: 'extract',
    output_mode: 'strict_json',
    hardware_profile: 'medium',
    preferred_model_id: 'model:preferred',
    fallback_model_ids: ['model:fallback'],
    selection_reason: 'test_preferred',
  }],
};

const registry = {
  models: [
    { model_id: 'model:preferred' },
    { model_id: 'model:fallback' },
  ],
};

function select(availableModelIds) {
  return selectRuntimeModel({
    taskFamily: 'extract',
    outputMode: 'strict_json',
    hardwareProfile: 'medium',
    availableModelIds,
  }, policy, registry);
}

test('runtime selection fails closed when no declared model is installed', () => {
  assert.equal(select([]), null);
});

test('runtime selection uses the exact preferred model when installed', () => {
  assert.deepEqual(select(['model:preferred']), {
    selected_model_id: 'model:preferred',
    selection_path: 'runtime_policy_preferred',
    selection_reason: 'test_preferred',
    policy_version: 'test-policy',
    promotion_applied: false,
  });
});

test('runtime selection exposes an explicitly declared fallback path', () => {
  assert.deepEqual(select(['model:fallback']), {
    selected_model_id: 'model:fallback',
    selection_path: 'runtime_policy_fallback',
    selection_reason: 'runtime_policy_fallback_models_in_order',
    policy_version: 'test-policy',
    promotion_applied: false,
  });
});

test('runtime selection reports promotion only for verified matching history', () => {
  const promotedPolicy = {
    ...policy,
    promotion_evidence: { runtime_verified: true, status: 'runtime_verified' },
    promotion_history: [{
      task_family: 'extract',
      hardware_profile: 'medium',
      previous_model_id: 'model:old',
      new_model_id: 'model:preferred',
      decision_reason: 'runtime_evidence',
      effective_from_unix_ms: 1,
    }],
  };
  const selected = selectRuntimeModel({
    taskFamily: 'extract',
    outputMode: 'strict_json',
    hardwareProfile: 'medium',
    availableModelIds: ['model:preferred'],
  }, promotedPolicy, registry);
  assert.equal(selected?.promotion_applied, true);
});
