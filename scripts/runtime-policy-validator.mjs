#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  readJson,
  writeJson,
  stableStringify,
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
    const runtimeRegistry = await readJson(PATHS.runtimeRegistry, { required: true });

    const report = buildValidationReport(policy, runtimeRegistry);
    report.policy_path = path.relative(process.cwd(), PATHS.policy);
    report.runtime_registry_path = path.relative(process.cwd(), PATHS.runtimeRegistry);

    await writeJson(PATHS.validationReport, report);

    if (!report.ok) {
      fail('runtime_policy_validation_failed', 'Runtime policy validation failed', {
        report: path.relative(process.cwd(), PATHS.validationReport),
        errors: report.errors,
      });
    }

    console.log(stableStringify({
      ok: true,
      outputs: {
        runtime_policy_validation: path.relative(process.cwd(), PATHS.validationReport),
      },
    }));
  } catch (error) {
    fail('runtime_policy_validate_exception', error?.message || 'Unknown runtime policy validation failure', {
      stack: error?.stack || null,
    });
  }
}

main();
