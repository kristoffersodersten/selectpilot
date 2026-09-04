// module_name: panel_runtime_profiles_test
// spec_ref: "frontend_state_contract"

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRuntimeProfileKey } from '../../panel/runtime-profiles.js';

test('automatic profile truth ignores a larger benchmark suggestion', () => {
  assert.equal(resolveRuntimeProfileKey(undefined, 'fast', { recommended_profile: 'advanced' }), 'fast');
});

test('automatic profile truth accepts the benchmark auto profile contract', () => {
  assert.equal(resolveRuntimeProfileKey(undefined, 'fast', {
    auto_profile: 'fast',
    recommended_profile: 'balanced',
  }), 'fast');
});

test('an explicit active profile remains visible without changing auto defaults', () => {
  assert.equal(resolveRuntimeProfileKey('balanced', 'fast', {
    auto_profile: 'fast',
    recommended_profile: 'advanced',
  }), 'balanced');
});

test('automatic profile truth fails safely to the smallest known profile', () => {
  assert.equal(resolveRuntimeProfileKey('invalid', 'unknown', {
    auto_profile: 'invalid',
    recommended_profile: 'advanced',
  }), 'fast');
});
