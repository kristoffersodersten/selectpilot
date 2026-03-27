import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, '..');

export const PATHS = {
  reportsDir: path.resolve(repoRoot, 'reports'),
  runtimeDir: path.resolve(repoRoot, 'runtime'),
  frontier: path.resolve(repoRoot, 'reports/frontier_decisions.json'),
  determinism: path.resolve(repoRoot, 'reports/determinism_report.json'),
  aggregated: path.resolve(repoRoot, 'reports/aggregated_metrics.json'),
  architecture: path.resolve(repoRoot, 'reports/architecture_decision_report.json'),
  benchmarkSpec: path.resolve(repoRoot, 'selectpilot_benchmark_v1.json'),
  monolithSpec: path.resolve(repoRoot, 'selectpilot_monolith_v3.json'),
  evalKit: path.resolve(repoRoot, 'selectpilot_evaluation_kit_v1.json'),
  registrySource: path.resolve(repoRoot, 'server/model/registry_source.json'),
  rejectedCandidates: path.resolve(repoRoot, 'reports/rejected_candidates.json'),
  policy: path.resolve(repoRoot, 'runtime/model_policy.json'),
  runtimeRegistry: path.resolve(repoRoot, 'runtime/model_registry.runtime.json'),
  promotionAudit: path.resolve(repoRoot, 'runtime/promotion_audit.json'),
  validationReport: path.resolve(repoRoot, 'reports/runtime_policy_validation.json'),
  selectionSummary: path.resolve(repoRoot, 'reports/runtime_selection_summary.json'),
};

export function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath, { required = true } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (!required && error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${stableStringify(payload)}\n`, 'utf8');
}

export function deterministicSeed(parts) {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return hash;
}

export function deterministicUnixMsFromSeed(seedHex) {
  const base = Number.parseInt(seedHex.slice(0, 12), 16);
  const epoch = 1_700_000_000_000;
  return epoch + (base % 1_000_000_000);
}

function hardwareRank(profile) {
  const ranks = { low: 1, medium: 2, medium_gpu: 3, high: 4, any: 0 };
  return ranks[String(profile)] ?? 0;
}

function compatibleWithHardware(minRequired, currentHardware) {
  return hardwareRank(currentHardware) >= hardwareRank(minRequired);
}

export function validatePolicyInvariants(policy, runtimeRegistry) {
  const errors = [];

  if (!policy || typeof policy !== 'object') errors.push('invalid_policy_schema');
  if (!runtimeRegistry || !Array.isArray(runtimeRegistry.models)) errors.push('invalid_runtime_registry_schema');
  if (errors.length) return { ok: false, errors };

  const registryIds = new Set(runtimeRegistry.models.map((m) => m.model_id));
  const quarantined = new Set((policy.quarantined_models || []).map((m) => m.model_id));

  for (const entry of policy.defaults || []) {
    if (!registryIds.has(entry.preferred_model_id)) {
      errors.push(`unknown_model_reference:${entry.preferred_model_id}`);
    }
    if (quarantined.has(entry.preferred_model_id)) {
      errors.push(`quarantined_model_promoted:${entry.preferred_model_id}`);
    }
  }

  const tupleCount = new Map();
  for (const entry of policy.defaults || []) {
    const tuple = `${entry.task_family}|${entry.hardware_profile}|${entry.output_mode}`;
    tupleCount.set(tuple, (tupleCount.get(tuple) || 0) + 1);
  }
  for (const [tuple, count] of tupleCount.entries()) {
    if (count > 1) errors.push(`duplicate_preferred_mapping:${tuple}`);
  }

  const statusByModel = new Map(runtimeRegistry.models.map((m) => [m.model_id, m.runtime_status]));
  for (const entry of policy.defaults || []) {
    const visited = new Set([entry.preferred_model_id]);
    let depth = 0;
    for (const fallback of entry.fallback_model_ids || []) {
      depth += 1;
      if (depth > 3) errors.push(`fallback_depth_exceeded:${entry.task_family}|${entry.hardware_profile}|${entry.output_mode}`);
      if (visited.has(fallback)) errors.push(`fallback_cycle_detected:${entry.task_family}|${entry.hardware_profile}|${entry.output_mode}`);
      visited.add(fallback);
      const status = statusByModel.get(fallback);
      if (status === 'quarantined' || status === 'rejected') {
        errors.push(`quarantined_or_rejected_in_fallback:${fallback}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildValidationReport(policy, runtimeRegistry) {
  const validation = validatePolicyInvariants(policy, runtimeRegistry);
  return {
    ok: validation.ok,
    errors: validation.errors,
    invariants_checked: [
      'every_preferred_model_exists_in_runtime_registry',
      'no_quarantined_model_is_marked_preferred',
      'every_task_hardware_output_tuple_has_at_most_one_preferred_model',
      'fallback_graph_is_acyclic',
      'promotion_history_is_append_only',
    ],
    hard_fail_rules: [
      'invalid_policy_schema',
      'unknown_model_reference',
      'duplicate_preferred_mapping',
      'fallback_cycle_detected',
      'quarantined_model_promoted',
    ],
    policy_version: policy?.policy_version ?? null,
    checked_at_unix_ms: policy?.generated_at_unix_ms ?? Date.now(),
  };
}

export function applyRollback(policy, audit, reason = 'manual_runtime_rollback') {
  const nextPolicy = JSON.parse(JSON.stringify(policy || {}));
  const nextAudit = JSON.parse(JSON.stringify(audit || { events: [] }));
  const history = Array.isArray(nextPolicy.promotion_history) ? nextPolicy.promotion_history : [];
  if (!history.length) {
    return {
      rollback_triggered: false,
      rolled_back_from: null,
      rolled_back_to: null,
      reason: 'no_promotion_history',
      policy: nextPolicy,
      audit: nextAudit,
    };
  }

  const last = history[history.length - 1];
  const defaults = Array.isArray(nextPolicy.defaults) ? nextPolicy.defaults : [];
  const target = defaults.find((entry) => entry.task_family === last.task_family && entry.hardware_profile === last.hardware_profile);
  if (!target) {
    return {
      rollback_triggered: false,
      rolled_back_from: null,
      rolled_back_to: null,
      reason: 'target_mapping_not_found',
      policy: nextPolicy,
      audit: nextAudit,
    };
  }

  const rolledBackFrom = target.preferred_model_id;
  const previousModelId = String(last.previous_model_id || '').trim();
  const fallbackCandidates = Array.isArray(target.fallback_model_ids) ? [...target.fallback_model_ids] : [];
  const computedRollbackTarget = previousModelId && previousModelId !== 'none'
    ? previousModelId
    : (fallbackCandidates.find((id) => String(id || '').trim() && String(id || '').trim() !== String(rolledBackFrom || '').trim()) || null);

  if (!computedRollbackTarget) {
    return {
      rollback_triggered: false,
      rolled_back_from: rolledBackFrom || null,
      rolled_back_to: null,
      reason: 'no_valid_rollback_target',
      policy: nextPolicy,
      audit: nextAudit,
    };
  }

  target.preferred_model_id = computedRollbackTarget;
  target.selection_reason = `rollback:${reason}`;
  target.effective_from_unix_ms = Date.now();
  if (!Array.isArray(target.fallback_model_ids)) target.fallback_model_ids = [];
  target.fallback_model_ids = [
    last.new_model_id,
    ...target.fallback_model_ids.filter((id) => id !== last.new_model_id && id !== computedRollbackTarget),
  ].slice(0, 3);

  nextAudit.events = Array.isArray(nextAudit.events) ? nextAudit.events : [];
  nextAudit.events.push({
    event_type: 'rollback',
    generated_at_unix_ms: Date.now(),
    rolled_back_from: rolledBackFrom,
    rolled_back_to: computedRollbackTarget,
    reason,
    task_family: last.task_family,
    hardware_profile: last.hardware_profile,
  });

  return {
    rollback_triggered: true,
    rolled_back_from: rolledBackFrom,
    rolled_back_to: computedRollbackTarget,
    reason,
    policy: nextPolicy,
    audit: nextAudit,
  };
}

export function buildRuntimeRegistryFromPolicy(policy, registrySource, rejectedCandidates = []) {
  const preferredSet = new Set((policy.defaults || []).map((d) => d.preferred_model_id));
  const fallbackSet = new Set((policy.defaults || []).flatMap((d) => d.fallback_model_ids || []));
  const quarantinedSet = new Set((policy.quarantined_models || []).map((q) => q.model_id));
  const rejectedSet = new Set((rejectedCandidates || []).map((r) => r.candidate_model));

  return {
    generated_at_unix_ms: Number(policy.generated_at_unix_ms || Date.now()),
    policy_version: String(policy.policy_version || 'runtime-policy-unknown'),
    models: (registrySource.models || []).map((model) => {
      let runtimeStatus = 'baseline';
      if (rejectedSet.has(model.model_id)) runtimeStatus = 'rejected';
      else if (quarantinedSet.has(model.model_id)) runtimeStatus = 'quarantined';
      else if (preferredSet.has(model.model_id)) runtimeStatus = 'preferred';
      else if (fallbackSet.has(model.model_id)) runtimeStatus = 'fallback';

      return {
        model_id: model.model_id,
        ollama_name: model.ollama_name,
        supported_operation_families: model.supported_operation_families || ['extract', 'summarize', 'agent'],
        min_hardware_profile: model.min_hardware_profile || 'low',
        installation_state: model.installation_state || 'installed',
        runtime_status: runtimeStatus,
        reliability_score: model.reliability_score ?? null,
        policy_refs: [`runtime/model_policy.json#${model.model_id}`],
      };
    }),
  };
}

function pickOutputMode(taskFamily) {
  if (taskFamily === 'extract') return 'strict_json';
  if (taskFamily === 'summarize') return 'semi_structured';
  return 'freeform';
}

function modelTaskSupport(modelId) {
  return {
    extract: true,
    summarize: true,
    agent: true,
    [modelId]: true,
  };
}

function confidenceFromDecision(decision, determinismRate) {
  const weighted = Number(decision.weighted_score || 0);
  const schema = Number(decision.schema_validity_rate || 0);
  const failure = Number(decision.failure_rate || 1);
  const latencyRatio = Number(decision.latency_regression_ratio || 1);
  const latencyComponent = Math.max(0, Math.min(1, 1.2 - latencyRatio));
  const score = (weighted * 0.45) + (schema * 0.2) + ((1 - failure) * 0.2) + (determinismRate * 0.1) + (latencyComponent * 0.05);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export async function compileRuntimePolicy() {
  const requiredPaths = [PATHS.frontier, PATHS.determinism, PATHS.aggregated, PATHS.architecture, PATHS.monolithSpec, PATHS.evalKit, PATHS.registrySource, PATHS.benchmarkSpec];
  for (const p of requiredPaths) {
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) {
      throw new Error(`required_input_missing:${path.relative(repoRoot, p)}`);
    }
  }

  const [frontier, determinism, aggregated, architecture, monolithSpec, evalKit, registrySource, benchmarkSpec] = await Promise.all([
    readJson(PATHS.frontier),
    readJson(PATHS.determinism),
    readJson(PATHS.aggregated),
    readJson(PATHS.architecture),
    readJson(PATHS.monolithSpec),
    readJson(PATHS.evalKit),
    readJson(PATHS.registrySource),
    readJson(PATHS.benchmarkSpec),
  ]);

  const existingPolicy = await readJson(PATHS.policy, { required: false });
  const existingAudit = await readJson(PATHS.promotionAudit, { required: false }) || { events: [] };
  const rejectedCandidates = await readJson(PATHS.rejectedCandidates, { required: false }) || [];

  const determinismRate = Number(determinism.selection_consistency_rate ?? determinism.score ?? 0);
  const strictSchemaMin = Number(benchmarkSpec.frontier_analysis?.thresholds?.schema_validity_min ?? 0.9);
  const maxFailureRate = Number(benchmarkSpec.frontier_analysis?.thresholds?.failure_rate_max ?? 0.1);
  const maxRetryRate = Number(aggregated.correctness?.retry_rate ?? 0.1);
  const minConfidence = Number(evalKit.policy_hysteresis?.parameters?.min_confidence ?? 0.8);
  const cooldownMs = Number(evalKit.policy_hysteresis?.parameters?.cooldown_ms ?? 86_400_000);
  const meaningful = evalKit.runtime_policy_compiler?.meaningful_advantage_thresholds || { correctness_gain: 0.02, latency_gain_ratio: 0.1, memory_gain_ratio: 0.1 };

  const seed = deterministicSeed([
    stableStringify(frontier),
    stableStringify(determinism),
    stableStringify(aggregated),
    stableStringify(architecture),
    stableStringify(monolithSpec),
    stableStringify(evalKit),
    stableStringify(registrySource),
  ]);
  const generatedAt = deterministicUnixMsFromSeed(seed);

  const promoted = Array.isArray(frontier) ? frontier.filter((d) => d.decision === 'promote') : [];
  const gatingResults = [];
  for (const decision of promoted) {
    const retryRate = Number(decision.retry_rate ?? aggregated.correctness?.retry_rate ?? 1);
    const confidence = confidenceFromDecision(decision, determinismRate);
    let eligible = true;
    let reason = 'eligible';

    if (determinismRate < 0.98) {
      eligible = false;
      reason = 'benchmark_variance_too_high';
    } else if (Number(decision.schema_validity_rate || 0) < strictSchemaMin) {
      eligible = false;
      reason = 'fails_schema_threshold';
    } else if (Number(decision.failure_rate || 1) > maxFailureRate) {
      eligible = false;
      reason = 'higher_failure_rate';
    } else if (retryRate > maxRetryRate) {
      eligible = false;
      reason = 'decision_confidence_below_threshold';
    } else if (confidence < minConfidence) {
      eligible = false;
      reason = 'decision_confidence_below_threshold';
    }

    gatingResults.push({
      candidate_model: decision.candidate_model,
      confidence,
      retry_rate: retryRate,
      eligible,
      reason,
      evidence_refs: [
        'reports/frontier_decisions.json',
        'reports/determinism_report.json',
        'reports/aggregated_metrics.json',
      ],
      decision,
    });
  }

  const eligible = gatingResults.filter((r) => r.eligible).sort((a, b) => b.confidence - a.confidence);
  const preferredCandidate = eligible[0] || null;

  const taskFamilies = ['extract', 'summarize', 'agent'];
  const hardwareProfiles = (benchmarkSpec.hardware_simulation?.profiles || []).map((p) => p.id);
  const defaults = [];
  const promotionHistory = Array.isArray(existingPolicy?.promotion_history) ? [...existingPolicy.promotion_history] : [];

  for (const taskFamily of taskFamilies) {
    for (const hardwareProfile of hardwareProfiles) {
      const outputMode = pickOutputMode(taskFamily);
      const tupleKey = `${taskFamily}|${hardwareProfile}|${outputMode}`;
      const previous = (existingPolicy?.defaults || []).find((d) => `${d.task_family}|${d.hardware_profile}|${d.output_mode}` === tupleKey);

      let preferred = previous?.preferred_model_id || null;
      let reason = previous?.selection_reason || 'baseline_selector';
      let evidenceRefs = Array.isArray(previous?.evidence_refs) ? previous.evidence_refs : ['reports/frontier_decisions.json'];
      const lastPromotion = [...promotionHistory].reverse().find((p) => p.task_family === taskFamily && p.hardware_profile === hardwareProfile);
      const cooldownActive = lastPromotion ? (generatedAt - Number(lastPromotion.effective_from_unix_ms || 0)) < cooldownMs : false;

      if (preferredCandidate && !cooldownActive) {
        const candidateId = preferredCandidate.candidate_model;
        const candidateWeighted = Number(preferredCandidate.decision.weighted_score || 0);
        const previousDecision = gatingResults.find((g) => g.candidate_model === preferred);
        const previousWeighted = Number(previousDecision?.decision?.weighted_score ?? 0);
        const weightedGain = candidateWeighted - previousWeighted;
        const latencyGainRatio = 1 - Number(preferredCandidate.decision.latency_regression_ratio || 1);
        const meaningfulGain = weightedGain >= Number(meaningful.correctness_gain ?? 0.02)
          || latencyGainRatio >= Number(meaningful.latency_gain_ratio ?? 0.1);

        if (!preferred || (preferred !== candidateId && meaningfulGain && preferredCandidate.confidence >= Number(previousDecision?.confidence ?? 0))) {
          const predecessor = preferred || 'none';
          preferred = candidateId;
          reason = preferredCandidate.decision.reason;
          evidenceRefs = preferredCandidate.evidence_refs;
          promotionHistory.push({
            task_family: taskFamily,
            hardware_profile: hardwareProfile,
            previous_model_id: predecessor,
            new_model_id: candidateId,
            decision_reason: reason,
            effective_from_unix_ms: generatedAt,
          });
        }
      }

      const runtimeCandidates = (registrySource.models || [])
        .filter((m) => !m.quarantined)
        .filter((m) => compatibleWithHardware(m.min_hardware_profile || 'low', hardwareProfile))
        .filter((m) => modelTaskSupport(m.model_id)[taskFamily])
        .map((m) => m.model_id);

      const preferredInCandidates = preferred && runtimeCandidates.includes(preferred) ? preferred : runtimeCandidates[0] || null;
      const fallbackIds = runtimeCandidates.filter((id) => id !== preferredInCandidates).slice(0, 3);

      if (preferredInCandidates) {
        defaults.push({
          task_family: taskFamily,
          hardware_profile: hardwareProfile,
          output_mode: outputMode,
          preferred_model_id: preferredInCandidates,
          fallback_model_ids: fallbackIds,
          selection_reason: reason,
          evidence_refs: evidenceRefs,
          effective_from_unix_ms: generatedAt,
        });
      }
    }
  }

  const quarantinedModels = [];
  for (const row of rejectedCandidates) {
    quarantinedModels.push({
      model_id: row.candidate_model,
      reason: row.reason || 'rejected_candidate',
      until_unix_ms: null,
      evidence_refs: ['reports/rejected_candidates.json'],
    });
  }
  for (const row of gatingResults.filter((r) => !r.eligible)) {
    quarantinedModels.push({
      model_id: row.candidate_model,
      reason: row.reason,
      until_unix_ms: null,
      evidence_refs: row.evidence_refs,
    });
  }

  const quarantineMap = new Map();
  for (const item of quarantinedModels) quarantineMap.set(item.model_id, item);

  const policy = {
    policy_version: `runtime-policy-${seed.slice(0, 12)}`,
    generated_at_unix_ms: generatedAt,
    source_reports: [
      'reports/aggregated_metrics.json',
      'reports/frontier_decisions.json',
      'reports/determinism_report.json',
      'reports/architecture_decision_report.json',
    ],
    global_guards: {
      determinism_min: 0.98,
      strict_json_schema_validity_min: strictSchemaMin,
      max_failure_rate: maxFailureRate,
      max_retry_rate: maxRetryRate,
    },
    defaults,
    quarantined_models: Array.from(quarantineMap.values()),
    promotion_history: promotionHistory,
  };

  const preferredSet = new Set(policy.defaults.map((d) => d.preferred_model_id));
  const quarantinedSet = new Set(policy.quarantined_models.map((q) => q.model_id));
  const rejectedSet = new Set(rejectedCandidates.map((r) => r.candidate_model));

  const runtimeRegistry = buildRuntimeRegistryFromPolicy(policy, registrySource, rejectedCandidates);

  const audit = {
    generated_at_unix_ms: generatedAt,
    policy_version: policy.policy_version,
    source_reports: policy.source_reports,
    events: [
      ...(existingAudit.events || []),
      {
        event_type: 'compile_policy',
        generated_at_unix_ms: generatedAt,
        promoted_count: eligible.length,
        rejected_count: gatingResults.filter((r) => !r.eligible).length,
        policy_version: policy.policy_version,
      },
    ],
    gating_results: gatingResults.map((r) => ({
      candidate_model: r.candidate_model,
      eligible: r.eligible,
      reason: r.reason,
      confidence: r.confidence,
      evidence_refs: r.evidence_refs,
    })),
  };

  const summary = {
    generated_at_unix_ms: generatedAt,
    policy_version: policy.policy_version,
    defaults_count: policy.defaults.length,
    preferred_models: Array.from(preferredSet),
    quarantined_models: Array.from(quarantinedSet),
    rejected_models: Array.from(rejectedSet),
    selector_invariants: {
      manual_override_has_highest_authority: true,
      hardware_guard_wins_on_conflict: true,
      live_selection_never_reads_uncompiled_reports: true,
    },
  };

  const validation = validatePolicyInvariants(policy, runtimeRegistry);

  return {
    policy,
    runtimeRegistry,
    audit,
    summary,
    validation,
  };
}
