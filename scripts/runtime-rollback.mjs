#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  readJson,
  writeJson,
  stableStringify,
  applyRollback,
  buildRuntimeRegistryFromPolicy,
  buildValidationReport,
} from './runtime-policy-lib.mjs';

function fail(code, message, details = {}) {
  const payload = { ok: false, code, message, details };
  console.error(stableStringify(payload));
  process.exit(1);
}

async function main() {
  try {
    const policy = await readJson(PATHS.policy, { required: true });
    const audit = await readJson(PATHS.promotionAudit, { required: false }) || { events: [] };
    const registrySource = await readJson(PATHS.registrySource, { required: true });
    const rejectedCandidates = await readJson(PATHS.rejectedCandidates, { required: false }) || [];

    const rollback = applyRollback(policy, audit);
    if (!rollback.rollback_triggered) {
      console.log(stableStringify({
        ok: true,
        rollback_triggered: false,
        reason: rollback.reason,
        outputs: {
          model_policy: path.relative(process.cwd(), PATHS.policy),
          promotion_audit: path.relative(process.cwd(), PATHS.promotionAudit),
        },
      }));
      return;
    }

    const runtimeRegistry = buildRuntimeRegistryFromPolicy(rollback.policy, registrySource, rejectedCandidates);
    const validation = buildValidationReport(rollback.policy, runtimeRegistry);

    await writeJson(PATHS.policy, rollback.policy);
    await writeJson(PATHS.promotionAudit, rollback.audit);
    await writeJson(PATHS.runtimeRegistry, runtimeRegistry);
    await writeJson(PATHS.validationReport, {
      ...validation,
      policy_path: path.relative(process.cwd(), PATHS.policy),
      runtime_registry_path: path.relative(process.cwd(), PATHS.runtimeRegistry),
    });

    if (!validation.ok) {
      fail('runtime_policy_validation_failed_after_rollback', 'Rollback produced invalid runtime policy', {
        errors: validation.errors,
        report: path.relative(process.cwd(), PATHS.validationReport),
      });
    }

    console.log(stableStringify({
      ok: true,
      rollback_triggered: true,
      rolled_back_from: rollback.rolled_back_from,
      rolled_back_to: rollback.rolled_back_to,
      reason: rollback.reason,
      outputs: {
        model_policy: path.relative(process.cwd(), PATHS.policy),
        runtime_registry: path.relative(process.cwd(), PATHS.runtimeRegistry),
        promotion_audit: path.relative(process.cwd(), PATHS.promotionAudit),
        runtime_policy_validation: path.relative(process.cwd(), PATHS.validationReport),
      },
    }));
  } catch (error) {
    fail('runtime_rollback_exception', error?.message || 'Unknown runtime rollback failure', {
      stack: error?.stack || null,
    });
  }
}

main();
