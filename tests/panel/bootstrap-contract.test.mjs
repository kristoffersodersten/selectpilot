// module_name: bootstrap_contract_test
// spec_ref: "runtime_profiles"

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  assert.equal(plan.fast_generation_model, 'gemma4:e2b-it-qat');
  assert.equal(plan.embedding_model, 'nomic-embed-text-v2-moe:latest');
  assert.equal(plan.num_ctx, 16_384);
  assert.equal(plan.fast_num_ctx, 16_384);
  assert.equal(plan.max_input_chars, 16_000);
  assert.equal(plan.reason, 'Explicit profile selected by operator.');
});

test('bootstrap plan exposes exact fail-closed Balanced runtime contract without side effects', () => {
  const plan = bootstrapPlan('balanced');
  assert.equal(plan.selected_profile, 'balanced');
  assert.equal(plan.generation_model, 'gemma4:e4b-it-qat');
  assert.equal(plan.fast_generation_model, 'gemma4:e2b-it-qat');
  assert.equal(plan.embedding_model, 'nomic-embed-text-v2-moe:latest');
  assert.equal(plan.num_ctx, 32_768);
  assert.equal(plan.fast_num_ctx, 16_384);
  assert.deepEqual(plan.generation_routes, {
    extract: { model: 'gemma4:e2b-it-qat', num_ctx: 16_384, reason: 'smallest_qualified_structured_model' },
    summarize: { model: 'gemma4:e2b-it-qat', num_ctx: 16_384, reason: 'smallest_qualified_structured_model' },
    agent: { model: 'gemma4:e4b-it-qat', num_ctx: 32_768, reason: 'qualified_general_model' },
  });
  assert.equal(plan.reason, 'Explicit profile selected by operator.');
});

test('one-command setup preserves hardware-aware automatic profile selection', () => {
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  assert.match(packageJson.scripts['setup:local'], /bootstrap-macos-local\.sh --profile auto$/);
});

test('bootstrap waits for the launchd bridge to become reachable', () => {
  const bootstrap = readFileSync('./scripts/bootstrap-macos-local.sh', 'utf8');

  assert.match(bootstrap, /for _attempt in \$\(seq 1 15\)/);
  assert.match(bootstrap, /curl -sSf "\$BRIDGE_HEALTH_URL"/);
  assert.match(bootstrap, /sleep 1/);
});

test('macOS service installs outside the source checkout before launchd execution', () => {
  const installer = readFileSync('./scripts/install-macos-local.sh', 'utf8');
  const launchAgent = readFileSync('./launchd/com.chromeai.nano.plist', 'utf8');

  assert.match(installer, /Application Support\/SelectPilot/);
  assert.match(installer, /RUNTIME_MODULES=\(/);
  assert.match(installer, /ollama_client\.py/);
  assert.match(installer, /extraction_presets\.py/);
  assert.match(installer, /runtime_profiles\.py/);
  assert.match(installer, /presets\/extraction-presets\.json/);
  assert.match(installer, /model_policy\.json/);
  assert.match(installer, /model_registry\.runtime\.json/);
  assert.match(installer, /sys\.version_info >= \(3, 9\)/);
  assert.match(launchAgent, /__PYTHON_BIN__/);
  assert.doesNotMatch(launchAgent, /\/usr\/bin\/python3/);
  assert.match(installer, /install -m 0555 "\$ROOT\/server\/\$module" "\$INSTALL_DIR\/\$module"/);
  assert.match(launchAgent, /__INSTALLED_BINARY__/);
  assert.match(launchAgent, /__INSTALL_DIR__/);
  assert.doesNotMatch(launchAgent, /__PROJECT_ROOT__/);
});

test('production macOS package also binds launchd to Python 3.9 or newer', () => {
  const postinstall = readFileSync('./installer/macos/scripts/postinstall', 'utf8');
  const launchAgent = readFileSync('./installer/macos/com.selectpilot.bridge.plist.template', 'utf8');

  assert.match(postinstall, /sys\.version_info >= \(3, 9\)/);
  assert.match(postinstall, /s\|__PYTHON_BIN__\|\$PYTHON_BIN\|g/);
  assert.match(postinstall, /s\|__STATE_DIR__\|\$STATE_DIR\|g/);
  assert.match(launchAgent, /__PYTHON_BIN__/);
  assert.match(launchAgent, /--state-dir/);
  assert.match(launchAgent, /CHROMEAI_RUNTIME_STATE_DIR/);
  assert.match(launchAgent, /CHROMEAI_MAX_CONCURRENT_OPERATIONS<\/key><string>1/);
  assert.doesNotMatch(launchAgent, /\/usr\/bin\/python3/);
});

test('production macOS package preserves hardware-aware task routing', () => {
  const postinstall = readFileSync('./installer/macos/scripts/postinstall', 'utf8');
  const launchAgent = readFileSync('./installer/macos/com.selectpilot.bridge.plist.template', 'utf8');

  for (const field of [
    'profile.key',
    'profile.generation_model',
    'profile.fast_generation_model',
    'profile.embedding_model',
    'profile.num_ctx',
    'profile.fast_num_ctx',
    'profile.max_input_chars',
  ]) {
    assert.ok(postinstall.includes(field), `missing profile field ${field}`);
  }

  for (const placeholder of [
    '__RUNTIME_PROFILE__',
    '__OLLAMA_MODEL__',
    '__OLLAMA_FAST_MODEL__',
    '__OLLAMA_EMBED_MODEL__',
    '__OLLAMA_NUM_CTX__',
    '__OLLAMA_FAST_NUM_CTX__',
    '__MAX_INPUT_CHARS__',
  ]) {
    assert.ok(postinstall.includes(placeholder), `postinstall does not bind ${placeholder}`);
    assert.ok(launchAgent.includes(placeholder), `LaunchAgent does not expose ${placeholder}`);
  }
});
