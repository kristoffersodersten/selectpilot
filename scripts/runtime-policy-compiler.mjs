#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  compileRuntimePolicy,
  writeJson,
  ensureDir,
  stableStringify,
} from './runtime-policy-lib.mjs';

function fail(code, message, details = {}) {
  const payload = { ok: false, code, message, details };
  console.error(stableStringify(payload));
  process.exit(1);
}

async function main() {
  try {
    await ensureDir(PATHS.runtimeDir);
    await ensureDir(PATHS.reportsDir);

    const compiled = await compileRuntimePolicy();

    await writeJson(PATHS.policy, compiled.policy);
    await writeJson(PATHS.runtimeRegistry, compiled.runtimeRegistry);
    await writeJson(PATHS.promotionAudit, compiled.audit);

    const validationReport = {
      ok: compiled.validation.ok,
      errors: compiled.validation.errors,
      checked_at_unix_ms: compiled.policy.generated_at_unix_ms,
      policy_path: path.relative(process.cwd(), PATHS.policy),
      runtime_registry_path: path.relative(process.cwd(), PATHS.runtimeRegistry),
    };

    const selectionSummary = {
      generated_at_unix_ms: compiled.summary.generated_at_unix_ms,
      policy_version: compiled.summary.policy_version,
      defaults_count: compiled.summary.defaults_count,
      preferred_models: compiled.summary.preferred_models,
      quarantined_models: compiled.summary.quarantined_models,
      rejected_models: compiled.summary.rejected_models,
      selector_invariants: compiled.summary.selector_invariants,
      selection_order: [
        'manual_override_model_if_explicitly_set_and_allowed',
        'runtime_policy_preferred_model_if_available_and_not_quarantined',
        'runtime_policy_fallback_models_in_order',
        'baseline_smallest_sufficient_selection_from_registry',
        'hard_error_if_no_sufficient_model',
      ],
      source_reports: compiled.policy.source_reports,
    };

    await writeJson(PATHS.validationReport, validationReport);
    await writeJson(PATHS.selectionSummary, selectionSummary);

    if (!compiled.validation.ok) {
      fail('runtime_policy_validation_failed', 'Compiled policy failed runtime invariants', {
        errors: compiled.validation.errors,
        report: path.relative(process.cwd(), PATHS.validationReport),
      });
    }

    console.log(stableStringify({
      ok: true,
      outputs: {
        model_policy: path.relative(process.cwd(), PATHS.policy),
        runtime_registry: path.relative(process.cwd(), PATHS.runtimeRegistry),
        promotion_audit: path.relative(process.cwd(), PATHS.promotionAudit),
        runtime_policy_validation: path.relative(process.cwd(), PATHS.validationReport),
        runtime_selection_summary: path.relative(process.cwd(), PATHS.selectionSummary),
      },
    }));
  } catch (error) {
    fail('runtime_policy_compile_exception', error?.message || 'Unknown policy compiler failure', {
      stack: error?.stack || null,
    });
  }
}

main();
