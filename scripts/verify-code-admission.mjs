#!/usr/bin/env node
// module_name: code_admission_verifier
// spec_ref: "verification"

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportsDir = path.join(repoRoot, 'reports');

function fail(code, message, details = {}) {
  process.stderr.write(`${JSON.stringify({ ok: false, code, message, details }, null, 2)}\n`);
  process.exit(1);
}

async function readJson(name) {
  const filePath = path.join(reportsDir, name);
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    fail('admission_evidence_unreadable', `Cannot read ${name}`, { error: String(error) });
  }
}

function requireExactSha(value, field) {
  if (!/^[0-9a-f]{40}$/i.test(value || '')) {
    fail('admission_sha_invalid', `${field} must be an exact 40-character Git SHA`, { [field]: value || null });
  }
  return value.toLowerCase();
}

const sourceSha = requireExactSha(process.env.SELECTPILOT_SOURCE_SHA, 'source_sha');
const workflowSha = requireExactSha(process.env.SELECTPILOT_WORKFLOW_SHA, 'workflow_sha');
const ref = process.env.SELECTPILOT_REF || '';
if (!ref.startsWith('refs/')) fail('admission_ref_invalid', 'SELECTPILOT_REF must be an explicit Git ref', { ref });

const coverage = await readJson('spec_coverage_report.json');
const verification = await readJson('verification_report.json');
const policy = await readJson('../runtime/model_policy.json');
const policyValidation = await readJson('runtime_policy_validation.json');
const stress = await readJson('stress/master_summary.json');

const coverageSummary = {
  implemented: coverage.implemented_spec_nodes?.length ?? 0,
  missing: coverage.missing_spec_nodes?.length ?? -1,
  unmapped_files: coverage.unmapped_files?.length ?? -1,
  unmapped_functions: coverage.unmapped_functions?.length ?? -1,
};
if (
  coverageSummary.implemented === 0
  || coverageSummary.missing !== 0
  || coverageSummary.unmapped_files !== 0
  || coverageSummary.unmapped_functions !== 0
) {
  fail('admission_traceability_incomplete', 'Specification traceability is incomplete', coverageSummary);
}

if (
  verification.verification_scope !== 'static_traceability_only'
  || verification.full_system_ok !== false
  || verification.runtime_verified !== false
) {
  fail('admission_scope_ambiguous', 'Verification evidence must remain explicitly scoped and fail closed', {
    verification_scope: verification.verification_scope,
    full_system_ok: verification.full_system_ok,
    runtime_verified: verification.runtime_verified,
  });
}

if (
  policy.promotion_evidence?.runtime_verified !== false
  || policy.promotion_evidence?.status !== 'simulation_only_no_promotion'
  || policy.promotion_history?.length !== 0
) {
  fail('admission_policy_promotes_unverified_evidence', 'Runtime policy accepted unverified promotion evidence', {
    promotion_evidence: policy.promotion_evidence,
    promotion_history_count: policy.promotion_history?.length ?? null,
  });
}

if (policyValidation.ok !== true || stress.pass !== true) {
  fail('admission_contract_validation_failed', 'Policy or stress validation is not green', {
    policy_validation_ok: policyValidation.ok ?? null,
    stress_pass: stress.pass ?? null,
  });
}

const evidence = {
  schema_version: 1,
  evidence_class: 'exact_sha_code_admission',
  source_sha: sourceSha,
  workflow_sha: workflowSha,
  ref,
  generated_at: new Date().toISOString(),
  checks: {
    traceability: coverageSummary,
    runtime_policy_validation: true,
    deterministic_stress_contracts: true,
  },
  runtime_verified: false,
  physical_hardware_verified: false,
  full_system_ok: false,
  remaining_gates: [
    'protected_main_merge',
    'physical_apple_hardware_runtime',
    'full_system_definition_of_done',
  ],
};

await fs.writeFile(path.join(reportsDir, 'code_admission_evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, output: 'reports/code_admission_evidence.json', ...evidence }, null, 2)}\n`);
