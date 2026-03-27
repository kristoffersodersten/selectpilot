#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  readJson,
  stableStringify,
} from './runtime-policy-lib.mjs';

function fail(code, message, details = {}) {
  const payload = { ok: false, code, message, details };
  console.error(stableStringify(payload));
  process.exit(1);
}

async function main() {
  try {
    const policy = await readJson(PATHS.policy, { required: true });
    const registry = await readJson(PATHS.runtimeRegistry, { required: true });

    console.log(stableStringify({
      ok: true,
      policy_path: path.relative(process.cwd(), PATHS.policy),
      runtime_registry_path: path.relative(process.cwd(), PATHS.runtimeRegistry),
      summary: {
        policy_version: policy.policy_version,
        generated_at_unix_ms: policy.generated_at_unix_ms,
        defaults_count: Array.isArray(policy.defaults) ? policy.defaults.length : 0,
        quarantined_count: Array.isArray(policy.quarantined_models) ? policy.quarantined_models.length : 0,
        promotion_history_count: Array.isArray(policy.promotion_history) ? policy.promotion_history.length : 0,
        runtime_registry_models: Array.isArray(registry.models) ? registry.models.length : 0,
      },
    }));
  } catch (error) {
    fail('runtime_show_policy_exception', error?.message || 'Unknown runtime show policy failure', {
      stack: error?.stack || null,
    });
  }
}

main();
