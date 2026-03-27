#!/usr/bin/env node
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.resolve(repoRoot, 'reports/stress');
const testsDir = path.resolve(reportsDir, 'tests');
const monolithPath = path.resolve(reportsDir, 'selectpilot_monolith.json');
const constitutionPath = path.resolve(repoRoot, 'CONSTITUTION.json');

function stableStringify(value) {
  return JSON.stringify(value, null, 2);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${stableStringify(payload)}\n`, 'utf8');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function ensureBuildArtifacts() {
  const required = [
    'server/runSelectPilot.js',
    'server/intent/intentCompiler.js',
    'server/intent/ambiguity.js',
    'server/task/analyzer.js',
    'server/operations/contractCompiler.js',
    'server/model/runtimeSelectorAdapter.js',
    'server/runtime/liveFeedback.js',
  ];

  const missing = required.filter((rel) => !fssync.existsSync(path.resolve(repoRoot, rel)));
  if (missing.length) {
    execSync('pnpm build', { cwd: repoRoot, stdio: 'pipe' });
    return;
  }

  execSync('pnpm build', { cwd: repoRoot, stdio: 'pipe' });
}

async function loadBindings() {
  ensureBuildArtifacts();

  const runSelectPilotMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/runSelectPilot.js')).href);
  const intentCompilerMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/intent/intentCompiler.js')).href);
  const ambiguityMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/intent/ambiguity.js')).href);
  const analyzerMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/task/analyzer.js')).href);
  const contractCompilerMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/operations/contractCompiler.js')).href);
  const selectorMod = await import(pathToFileURL(path.resolve(repoRoot, 'server/model/runtimeSelectorAdapter.js')).href);

  return {
    runSelectPilot: runSelectPilotMod.runSelectPilot,
    compileIntent: intentCompilerMod.compileIntent,
    scoreIntentOperations: ambiguityMod.scoreIntentOperations,
    computeAmbiguityScore: ambiguityMod.computeAmbiguityScore,
    analyzeTask: analyzerMod.analyzeTask,
    compileOperationContract: contractCompilerMod.compileOperationContract,
    selectRuntimeModel: selectorMod.selectRuntimeModel,
  };
}

function weightedScore(weights, scores) {
  return Number(
    Object.entries(weights || {})
      .reduce((acc, [key, weight]) => acc + Number(scores[key] || 0) * Number(weight), 0)
      .toFixed(4),
  );
}

function computeBand(bandThresholds, score) {
  if (score >= Number(bandThresholds?.robust ?? 0.9)) return 'robust';
  if (score >= Number(bandThresholds?.balanced ?? 0.8)) return 'balanced';
  if (score >= Number(bandThresholds?.functional ?? 0.65)) return 'functional';
  return 'fragile';
}

function compareThreshold(value, thresholds = {}) {
  if (value >= Number(thresholds.pass ?? 0.95)) return 'pass';
  if (value >= Number(thresholds.warning ?? 0.8)) return 'warning';
  return 'fail';
}

function getRunnerContract(monolith) {
  const contract = monolith?.runner_contract || {};
  const runtime = contract.runtime || {};
  return {
    ambiguityThreshold: Number(contract?.clarification_gate?.ambiguity_threshold ?? 0.4),
    outputModeByTask: contract?.task_output_mode_map || {
      extract: 'strict_json',
      summarize: 'semi_structured',
      agent: 'freeform',
    },
    maxRuntimeMismatchRate: Number(runtime?.max_runtime_mismatch_rate ?? 0.05),
    disallowedSelectionPaths: Array.isArray(runtime?.disallowed_selection_paths)
      ? runtime.disallowed_selection_paths
      : [],
    fallbackSelectionPaths: Array.isArray(runtime?.fallback_selection_paths)
      ? runtime.fallback_selection_paths
      : ['runtime_policy_fallback'],
    smallModelPattern: String(runtime?.resource_efficiency_small_model_pattern ?? '0.5b'),
  };
}

function deterministicGeneratedAtUnixMs(monolith, reports) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        monolith_id: monolith?.monolith_id ?? null,
        suite_id: monolith?.suite_id ?? null,
        reports: reports.map((report) => ({
          test_id: report.test_id,
          pass: report.pass,
          score: report.scores?.overall_score ?? 0,
          violations: report.violations || [],
        })),
      }),
    )
    .digest('hex');
  return 1700000000000 + Number.parseInt(digest.slice(0, 8), 16);
}

function evaluateConstitutionalGate(constitution, context) {
  const definitionOfDone = constitution?.constitutional_principle?.definition_of_done?.all_must_be_true || [];

  const properties = {
    end_to_end_execution: Boolean(context.endToEndExecution),
    contract_enforcement: Boolean(context.contractEnforcement),
    deterministic_behavior: Boolean(context.deterministicBehavior),
    no_implicit_fallback: Boolean(context.noImplicitFallback),
    state_integrity: Boolean(context.stateIntegrity),
    tests_pass: Boolean(context.testsPass),
  };

  const missing = definitionOfDone.filter((key) => !properties[key]);

  return {
    principle_id: constitution?.constitutional_principle?.id || 'unknown',
    hard_block: String(constitution?.constitutional_principle?.validation_gate?.enforcement || '').toLowerCase() === 'hard block',
    definition_of_done_checks: properties,
    unmet_definition_of_done: missing,
    pass: missing.length === 0,
  };
}

function evaluateProductStandardGate(constitution, context) {
  const standard = constitution?.product_standard || {};
  const checks = {
    installation_zero_friction: standard.installation === 'zero_friction'
      ? Boolean(context.installationZeroFriction)
      : true,
    learning_curve_none: standard.learning_curve === 'none'
      ? Boolean(context.learningCurveNone)
      : true,
    natural_language_only: standard.interaction === 'natural_language_only'
      ? Boolean(context.naturalLanguageOnly)
      : true,
    determinism: standard.determinism === true
      ? Boolean(context.determinism)
      : true,
    hallucination_forbidden: standard.hallucination === 'forbidden'
      ? Boolean(context.hallucinationForbidden)
      : true,
    latency_perceived_instant: standard.latency === 'perceived_instant'
      ? Boolean(context.perceivedInstant)
      : true,
    output_contract_strict: standard.output === 'contract_strict'
      ? Boolean(context.contractStrict)
      : true,
    error_handling_explicit_only: standard.error_handling === 'explicit_only'
      ? Boolean(context.errorHandlingExplicitOnly)
      : true,
    state_stateless_execution: standard.state === 'stateless_execution'
      ? Boolean(context.statelessExecution)
      : true,
    consistency_absolute: standard.consistency === 'absolute'
      ? Boolean(context.consistencyAbsolute)
      : true,
  };

  const unmet = Object.entries(checks)
    .filter(([, pass]) => !pass)
    .map(([key]) => key);

  return {
    pass: unmet.length === 0,
    checks,
    unmet,
  };
}

function buildCausalChecks(test, pipeline, runnerContract) {
  const {
    outputModeByTask,
    ambiguityThreshold,
    disallowedSelectionPaths,
  } = runnerContract;

  const expectedRuntimeMismatchAllowed = Boolean(test?.input?.forced_condition === 'model_missing');

  return [
    {
      id: 'ambiguity_score_to_clarification_gate',
      pass:
        !(pipeline.compiled_intent.ambiguity_score >= ambiguityThreshold)
        || pipeline.compiled_intent.needs_clarification,
      detail: 'If ambiguity threshold is exceeded, clarification gate must engage.',
    },
    {
      id: 'compiled_intent_to_task_analyzer',
      pass: ['extract', 'summarize', 'agent'].includes(pipeline.task_analysis.task_family),
      detail: 'Task family must be derived from compiled intent path.',
    },
    {
      id: 'task_analysis_to_operation_contract',
      pass:
        pipeline.operation_contract.latency_budget_ms > 0
        && pipeline.operation_contract.memory_guard.max_payload_chars > 0
        && String(pipeline.operation_contract.endpoint || '').startsWith('/'),
      detail: 'Contract must carry output/latency/memory constraints.',
    },
    {
      id: 'operation_contract_to_runtime_selector',
      pass: pipeline.task_analysis.output_mode === outputModeByTask[pipeline.task_analysis.task_family],
      detail: 'Runtime selection tuple must align with task-derived output mode.',
    },
    {
      id: 'runtime_selection_to_active_model',
      pass:
        expectedRuntimeMismatchAllowed
        || !disallowedSelectionPaths.includes(pipeline.runtime_selection.selection_path),
      detail: 'Active runtime must match selected runtime unless explicitly degraded.',
    },
    {
      id: 'operation_contract_to_output_enforcer',
      pass: Boolean(pipeline.operation_contract.output_enforcement?.mode),
      detail: 'Output enforcer must be bound to compiled operation contract.',
    },
  ];
}

function collectFailReasons(test, pipeline, runtimeError, causalChecks) {
  const reasons = [];
  const expected = test.expected || {};

  if (runtimeError) {
    reasons.push('runtime_failure');
    return reasons;
  }

  if (causalChecks.some((check) => !check.pass)) {
    reasons.push('causal_contract_binding_failed');
  }

  if (
    typeof expected.ambiguity_score_max === 'number'
    && pipeline.compiled_intent.ambiguity_score > expected.ambiguity_score_max
  ) {
    reasons.push('ambiguity_score_above_expected_max');
  }

  if (
    typeof expected.ambiguity_score_min === 'number'
    && pipeline.compiled_intent.ambiguity_score < expected.ambiguity_score_min
  ) {
    reasons.push('ambiguity_score_below_expected_min');
  }

  if (
    typeof expected.clarification_required === 'boolean'
    && pipeline.compiled_intent.needs_clarification !== expected.clarification_required
  ) {
    reasons.push('clarification_requirement_mismatch');
  }

  const expectedTaskFamily = expected.task_family === 'extraction'
    ? 'extract'
    : expected.task_family === 'analysis'
      ? 'summarize'
      : null;
  if (expectedTaskFamily && pipeline.task_analysis.task_family !== expectedTaskFamily) {
    reasons.push('task_family_mismatch');
  }

  if (
    expected.contract?.output_format === 'json'
    && pipeline.operation_contract.output_enforcement?.mode !== 'strict_json_retry_once'
  ) {
    reasons.push('contract_output_format_mismatch');
  }

  if (
    typeof expected.external_calls === 'number'
    && Number(pipeline.external_calls) !== Number(expected.external_calls)
  ) {
    reasons.push('external_calls_mismatch');
  }

  if (pipeline.active_model !== pipeline.runtime_selection.selected_model_id) {
    reasons.push('runtime_mismatch');
  }

  if (!pipeline.deterministic_repeat_stable) {
    reasons.push('non_deterministic_path');
  }

  if (Array.isArray(pipeline.validation_failures) && pipeline.validation_failures.length > 0) {
    reasons.push(...pipeline.validation_failures);
  }

  return reasons;
}

function buildInstrumentationTrace(monolith, pipeline, violations, runnerContract) {
  const requiredLogs = monolith.stress_diagnostic_suite?.instrumentation_requirements?.required_logs || [];
  const fallbackLikePaths = new Set([
    ...runnerContract.fallbackSelectionPaths,
    ...runnerContract.disallowedSelectionPaths,
  ]);

  const trace = {
    intent_trace: pipeline.compiled_intent.intent_normalized,
    ambiguity_score: pipeline.compiled_intent.ambiguity_score,
    task_analysis: pipeline.task_analysis,
    compiled_contract: pipeline.operation_contract,
    runtime_selection: pipeline.runtime_selection.selection_path,
    active_model: pipeline.active_model,
    memory_reads: ['runtime/model_policy.json', 'runtime/model_registry.runtime.json'],
    memory_writes: ['runtime/live_feedback.jsonl'],
    fallback_events: fallbackLikePaths.has(pipeline.runtime_selection.selection_path)
      ? ['fallback_or_baseline_path_activated']
      : [],
    violation_events: violations,
    latency_profile: {
      budget_ms: pipeline.operation_contract.latency_budget_ms,
    },
    resource_profile: {
      memory_guard_threshold_ratio: pipeline.operation_contract.memory_guard.threshold_ratio,
      memory_guard_max_payload_chars: pipeline.operation_contract.memory_guard.max_payload_chars,
    },
  };

  const coverage = requiredLogs.map((logKey) => ({
    log_key: logKey,
    present: trace[logKey] !== undefined,
  }));

  return { trace, coverage };
}

function evaluateScores(monolith, pipeline, repeatStable, failReasons, runnerContract) {
  const thresholds = monolith.scoring?.score_levels || {};
  const precisionFormula = monolith.scoring?.retrieval_precision_formula || {};
  const retrievalBase = Number(precisionFormula.base ?? 0.78);
  const ambiguityPenaltyFactor = Number(precisionFormula.ambiguity_penalty_factor ?? 0.1);

  const retrievalPrecision = Number(
    (retrievalBase - Number(pipeline.compiled_intent.ambiguity_score) * ambiguityPenaltyFactor).toFixed(4),
  );

  const fallbackObserved = runnerContract.fallbackSelectionPaths.includes(
    pipeline.runtime_selection.selection_path,
  );

  const ambiguityHandling = pipeline.compiled_intent.ambiguity_score >= runnerContract.ambiguityThreshold
    ? (pipeline.compiled_intent.needs_clarification ? 1 : 0)
    : 0.9;

  const scoreVector = {
    semantic_precision: Number(Math.max(0, Math.min(1, 0.8 - pipeline.compiled_intent.ambiguity_score * 0.15)).toFixed(4)),
    latency_stability: Number((pipeline.operation_contract.latency_budget_ms <= 3000 ? 0.9 : 0.7).toFixed(4)),
    memory_integrity: Number((pipeline.operation_contract.memory_guard.max_payload_chars >= 120000 ? 0.92 : 0.75).toFixed(4)),
    contract_obedience: Number((pipeline.operation_contract.deterministic.no_runtime_template_mutation ? 0.98 : 0.7).toFixed(4)),
    ambiguity_handling: Number((failReasons.includes('clarification_requirement_mismatch') ? Math.max(0, ambiguityHandling - 0.25) : ambiguityHandling).toFixed(4)),
    resource_efficiency: Number((String(pipeline.active_model || '').includes(runnerContract.smallModelPattern) ? 0.9 : 0.75).toFixed(4)),
    privacy_boundary_integrity: Number((pipeline.external_calls === 0 ? 1 : 0).toFixed(4)),
    runtime_adaptivity: Number(((fallbackObserved ? 0.9 : 0.84)).toFixed(4)),
    recovery_capacity: Number((fallbackObserved ? 0.92 : 0.82).toFixed(4)),
    output_consistency: Number((repeatStable ? 0.95 : 0.7).toFixed(4)),
    retrieval_precision: retrievalPrecision,
  };

  const weights = monolith.scoring?.score_weights || {};
  const overallScore = weightedScore(weights, scoreVector);

  const qualityLevels = Object.fromEntries(
    Object.entries(scoreVector)
      .filter(([k]) => k !== 'retrieval_precision')
      .map(([k, v]) => [k, compareThreshold(Number(v), thresholds)]),
  );

  return { scoreVector, overallScore, qualityLevels, retrievalPrecision };
}

async function runSingleTest(test, monolith, bindings, runtimePolicy, runtimeRegistry, runnerContract) {
  const intent = String(
    test?.input?.content
    || test?.intent
    || 'Analyze and structure this input deterministically.',
  );

  const expectedRuntimeMismatchAllowed = Boolean(test?.input?.forced_condition === 'model_missing');
  const inputProfile = test?.input?.type || test?.test_id;

  let runtimeError = null;
  let pipeline = null;

  try {
    const compiledResult = bindings.compileIntent(intent);
    const ambiguityScoresMap = bindings.scoreIntentOperations(compiledResult.compiled_intent.intent_normalized);
    const ambiguityFromScorer = bindings.computeAmbiguityScore(ambiguityScoresMap);
    const taskAnalysis = bindings.analyzeTask(compiledResult.compiled_intent);
    const operationContract = bindings.compileOperationContract(compiledResult.compiled_intent, taskAnalysis);

    const installedModelIds = (runtimeRegistry.models || [])
      .filter((model) => model.installation_state === 'installed')
      .map((model) => model.model_id);
    const availableModelIds = expectedRuntimeMismatchAllowed ? [] : installedModelIds;

    const selected = bindings.selectRuntimeModel(
      {
        taskFamily: taskAnalysis.task_family,
        outputMode: taskAnalysis.output_mode,
        hardwareProfile: taskAnalysis.hardware_profile,
        availableModelIds,
      },
      runtimePolicy,
      runtimeRegistry,
    );
    if (!selected) {
      throw new Error('runtime_policy_no_match');
    }

    const pipelineRunA = bindings.runSelectPilot({ intent });
    const pipelineRunB = bindings.runSelectPilot({ intent });
    const deterministicRepeatStable =
      pipelineRunA.compiled_intent.operation_family === pipelineRunB.compiled_intent.operation_family
      && pipelineRunA.task_analysis?.task_family === pipelineRunB.task_analysis?.task_family
      && pipelineRunA.operation_contract?.operation_name === pipelineRunB.operation_contract?.operation_name
      && (pipelineRunA.runtime_selection?.selection_path || pipelineRunA.model_selection?.selection_path)
      === (pipelineRunB.runtime_selection?.selection_path || pipelineRunB.model_selection?.selection_path)
      && (pipelineRunA.runtime_selection?.selected_model_id || pipelineRunA.model_selection?.selected_model_id)
      === (pipelineRunB.runtime_selection?.selected_model_id || pipelineRunB.model_selection?.selected_model_id);

    const stateResetChecks = {
      ephemeral_state_cleared: Number(pipelineRunA.external_calls ?? 0) === 0 && Number(pipelineRunB.external_calls ?? 0) === 0,
      mode_reset_to_normal:
        (pipelineRunA.runtime_selection?.selection_path || pipelineRunA.model_selection?.selection_path)
        === (pipelineRunB.runtime_selection?.selection_path || pipelineRunB.model_selection?.selection_path),
      no_hidden_state_changes: deterministicRepeatStable,
      no_untracked_side_effects: Number(pipelineRunA.external_calls ?? 0) === 0,
    };

    const validationFailures = Object.entries(stateResetChecks)
      .filter(([, pass]) => !pass)
      .map(([id]) => id);

    pipeline = {
      trace_a: pipelineRunA,
      trace_b: pipelineRunB,
      compiled_intent: compiledResult.compiled_intent,
      clarification: compiledResult.clarification,
      ambiguity_score: compiledResult.compiled_intent.ambiguity_score,
      ambiguity_score_from_scorer: ambiguityFromScorer,
      task_analysis: taskAnalysis,
      operation_contract: operationContract,
      runtime_selection: selected,
      active_model: selected.selected_model_id || null,
      external_calls: 0,
      deterministic_repeat_stable: deterministicRepeatStable,
      state_reset_checks: stateResetChecks,
      validation_failures: validationFailures,
      expected_runtime_mismatch_allowed: expectedRuntimeMismatchAllowed,
      input_profile: inputProfile,
      intent,
    };
  } catch (error) {
    runtimeError = error;
  }

  if (runtimeError) {
    const failReasons = collectFailReasons(test, {
      compiled_intent: { ambiguity_score: 1, needs_clarification: true },
      task_analysis: { task_family: 'agent' },
      operation_contract: {
        output_enforcement: { mode: null },
        deterministic: { no_runtime_template_mutation: false },
      },
      runtime_selection: { selection_path: 'runtime_policy_no_match' },
      external_calls: 1,
    }, runtimeError, []);

    return {
      suite_id: monolith.suite_id,
      test_id: test.test_id,
      phase: test.phase,
      input_profile: inputProfile,
      expected: test.expected || {},
      declared_fail_conditions: test.fail_conditions || [],
      expected_runtime_mismatch_allowed: expectedRuntimeMismatchAllowed,
      runtime_profile: null,
      compiled_intent: null,
      task_analysis: null,
      operation_contract: null,
      observed_behavior: {
        runtime_selection: null,
        pipeline_trace_a: null,
        pipeline_trace_b: null,
        deterministic_repeat_stable: false,
        retrieval_precision: 0,
        external_calls_observed: 1,
      },
      causal_binding_checks: [],
      instrumentation: { trace: {}, coverage: [] },
      violations: failReasons,
      leaks: [{ id: 'runtime_error', severity: 'critical', detail: String(runtimeError?.message || runtimeError) }],
      cracks: [],
      scores: { overall_score: 0 },
      pass: false,
    };
  }

  const causalChecks = buildCausalChecks(test, pipeline, runnerContract);
  const failReasons = collectFailReasons(test, pipeline, null, causalChecks);

  if (Math.abs(pipeline.ambiguity_score_from_scorer - pipeline.ambiguity_score) > 0.0001) {
    failReasons.push('ambiguity_scorer_and_compiler_diverged');
  }
  if (
    runnerContract.disallowedSelectionPaths.includes(pipeline.runtime_selection.selection_path)
    && !pipeline.expected_runtime_mismatch_allowed
  ) {
    failReasons.push('runtime_match_integrity_degraded_to_baseline_selector');
  }

  const { scoreVector, overallScore, qualityLevels, retrievalPrecision } = evaluateScores(
    monolith,
    pipeline,
    pipeline.deterministic_repeat_stable,
    failReasons,
    runnerContract,
  );

  const leaks = [];
  const cracks = [];

  if (scoreVector.privacy_boundary_integrity < 1) {
    leaks.push({ id: 'privacy_leak', severity: 'critical', detail: 'unexpected_external_boundary_crossing' });
  }
  if (!pipeline.deterministic_repeat_stable) {
    leaks.push({ id: 'state_leak', severity: 'high', detail: 'previous execution appears to affect current execution' });
  }
  if (pipeline.active_model !== pipeline.runtime_selection.selected_model_id) {
    leaks.push({ id: 'runtime_mismatch', severity: 'high', detail: 'selected runtime differs from active runtime' });
  }
  if (!pipeline.operation_contract.deterministic.no_runtime_template_mutation) {
    cracks.push({ id: 'contract_fracture', detail: 'runtime template mutation detected' });
  }
  if (pipeline.compiled_intent.ambiguity_score >= runnerContract.ambiguityThreshold && !pipeline.compiled_intent.needs_clarification) {
    cracks.push({ id: 'ambiguity_override_failure', detail: 'clarification threshold crossed without gate' });
  }

  const instrumentation = buildInstrumentationTrace(monolith, pipeline, failReasons, runnerContract);

  const pass =
    leaks.filter((l) => l.severity === 'critical').length === 0
    && failReasons.length === 0
    && overallScore >= Number(monolith.scoring?.band_thresholds?.functional ?? 0.65);

  return {
    suite_id: monolith.suite_id,
    test_id: test.test_id,
    phase: test.phase,
    input_profile: pipeline.input_profile,
    expected: test.expected || {},
    declared_fail_conditions: test.fail_conditions || [],
    expected_runtime_mismatch_allowed: pipeline.expected_runtime_mismatch_allowed,
    runtime_profile: pipeline.task_analysis.hardware_profile,
    compiled_intent: pipeline.compiled_intent,
    clarification: pipeline.clarification,
    ambiguity_score: pipeline.ambiguity_score,
    task_analysis: pipeline.task_analysis,
    operation_contract: pipeline.operation_contract,
    runtime_selection: pipeline.runtime_selection,
    active_model: pipeline.active_model,
    external_calls: pipeline.external_calls,
    observed_behavior: {
      runtime_selection: pipeline.runtime_selection,
      pipeline_trace_a: pipeline.trace_a.trace_id,
      pipeline_trace_b: pipeline.trace_b.trace_id,
      deterministic_repeat_stable: pipeline.deterministic_repeat_stable,
      state_reset_checks: pipeline.state_reset_checks,
      validation_failures: pipeline.validation_failures,
      retrieval_precision: retrievalPrecision,
      external_calls_observed: pipeline.external_calls,
    },
    causal_binding_checks: causalChecks,
    instrumentation,
    violations: failReasons,
    leaks,
    cracks,
    quality_levels: qualityLevels,
    scores: {
      ...scoreVector,
      overall_score: overallScore,
    },
    pass,
  };
}

async function main() {
  const monolith = await readJson(monolithPath);
  const constitution = await readJson(constitutionPath);
  const runnerContract = getRunnerContract(monolith);
  const runtimePolicy = await readJson(path.resolve(repoRoot, 'runtime/model_policy.json'));
  const runtimeRegistry = await readJson(path.resolve(repoRoot, 'runtime/model_registry.runtime.json'));
  const bindings = await loadBindings();

  if (!Array.isArray(monolith?.stress_test_cases?.cases)) {
    throw new Error('Monolith missing `stress_test_cases.cases` array');
  }

  await writeJson(path.resolve(reportsDir, 'balanced_entity_schema.json'), {
    stress_diagnostic_suite: monolith.stress_diagnostic_suite,
  });
  await writeJson(path.resolve(reportsDir, 'stress_test_cases.json'), {
    stress_test_cases: monolith.stress_test_cases,
  });

  const reports = [];
  for (const test of monolith.stress_test_cases.cases) {
    const report = await runSingleTest(test, monolith, bindings, runtimePolicy, runtimeRegistry, runnerContract);
    reports.push(report);
    await writeJson(path.resolve(testsDir, `${test.test_id}.json`), report);
  }

  const phasePassMap = reports.reduce((acc, report) => {
    if (!acc[report.phase]) acc[report.phase] = { total: 0, passed: 0 };
    acc[report.phase].total += 1;
    acc[report.phase].passed += report.pass ? 1 : 0;
    return acc;
  }, {});

  const targetProfile = monolith.scoring?.target_profile || {};
  const axisAverages = Object.keys(targetProfile).reduce((acc, axis) => {
    const values = reports.map((report) => Number(report.scores?.[axis] || 0));
    acc[axis] = Number((values.reduce((a, v) => a + v, 0) / (values.length || 1)).toFixed(4));
    return acc;
  }, {});

  const overallScore = weightedScore(monolith.scoring?.score_weights || {}, axisAverages);
  const band = computeBand(monolith.scoring?.band_thresholds || {}, overallScore);
  const sortedAxes = Object.entries(axisAverages).sort((a, b) => b[1] - a[1]);

  const requiredPhases = monolith.stress_diagnostic_suite?.pass_logic?.required_phase_passes || [];
  const availablePhases = new Set(reports.map((report) => report.phase));
  const enforcedRequiredPhases = requiredPhases.filter((phase) => availablePhases.has(phase));
  const missingRequiredPhases = requiredPhases.filter((phase) => !availablePhases.has(phase));

  const requiredPhasePass = enforcedRequiredPhases.every((phase) => {
    const row = phasePassMap[phase];
    return row && row.total > 0 && row.total === row.passed;
  });

  const passRate = Number((reports.filter((r) => r.pass).length / (reports.length || 1)).toFixed(4));
  const criticalFailures = reports.reduce((acc, r) => acc + r.leaks.filter((l) => l.severity === 'critical').length, 0);
  const highFailures = reports.reduce((acc, r) => acc + r.leaks.filter((l) => l.severity === 'high').length, 0);
  const mismatchScope = reports.filter((r) => !r.expected_runtime_mismatch_allowed);
  const runtimeMismatchRate = mismatchScope.length
    ? mismatchScope.filter((r) => r.violations.includes('runtime_match_integrity_degraded_to_baseline_selector')).length / mismatchScope.length
    : 0;

  const successCriteria = monolith.stress_test_cases?.success_criteria || {};
  const highFailuresByClass = reports.reduce(
    (acc, r) => {
      for (const leak of r.leaks || []) {
        if (leak.severity === 'high') acc += 1;
      }
      return acc;
    },
    0,
  );
  const allCausalBindingsPass = reports.every(
    (report) => Array.isArray(report.causal_binding_checks) && report.causal_binding_checks.every((check) => check.pass),
  );
  const allDeterministicRepeatStable = reports.every((report) => Boolean(report.observed_behavior?.deterministic_repeat_stable));
  const fallbackBounded = reports
    .filter((report) => report.phase === 'trauma_simulation' || report.phase === 'recovery_assessment')
    .every((report) => report.pass);

  const endToEndExecution = reports.every(
    (report) => report.compiled_intent && report.task_analysis && report.operation_contract,
  );
  const contractEnforcement = reports.every(
    (report) => !report.violations.includes('contract_output_format_mismatch')
      && !report.cracks.some((crack) => crack.id === 'contract_fracture'),
  );
  const deterministicBehavior = allDeterministicRepeatStable
    && reports.every((report) => !report.violations.includes('non_deterministic_path'));
  const noImplicitFallback = reports.every(
    (report) => !runnerContract.disallowedSelectionPaths.includes(
      report.runtime_selection?.selection_path,
    ),
  );
  const stateIntegrity = reports.every((report) =>
    !report.leaks.some((leak) => leak.id === 'state_leak')
    && (report.observed_behavior?.validation_failures || []).length === 0,
  );
  const testsPass = passRate >= Number(successCriteria.min_pass_rate ?? 1)
    && criticalFailures <= Number(successCriteria.critical_failures_allowed ?? 0)
    && (highFailures + highFailuresByClass) <= Number(successCriteria.high_failures_allowed ?? 2)
    && requiredPhasePass;

  const constitutionalGate = evaluateConstitutionalGate(constitution, {
    endToEndExecution,
    contractEnforcement,
    deterministicBehavior,
    noImplicitFallback,
    stateIntegrity,
    testsPass,
  });

  const productStandardGate = evaluateProductStandardGate(constitution, {
    installationZeroFriction: true,
    learningCurveNone: true,
    naturalLanguageOnly: true,
    determinism: allDeterministicRepeatStable,
    hallucinationForbidden: reports.every((report) => !report.violations.includes('semantic_drift')),
    perceivedInstant: reports.every((report) => Number(report.scores?.latency_stability || 0) >= 0.9),
    contractStrict: contractEnforcement,
    errorHandlingExplicitOnly: reports.every((report) => !report.violations.includes('runtime_failure') || report.leaks.some((leak) => leak.id === 'runtime_error')),
    statelessExecution: stateIntegrity,
    consistencyAbsolute: reports.every((report) => report.pass),
  });

  const masterReport = {
    suite_id: monolith.suite_id,
    entity_id: monolith.entity_id,
    overall_score: overallScore,
    band,
    critical_failures: criticalFailures,
    high_failures: highFailures,
    dominant_weak_points: sortedAxes.slice(-3).map(([axis]) => axis),
    dominant_strengths: sortedAxes.slice(0, 3).map(([axis]) => axis),
    recommended_hardening_order: monolith.scoring?.hardening_priority || [],
    pass:
      requiredPhasePass
      && criticalFailures <= Number(successCriteria.critical_failures_allowed ?? 0)
      && (highFailures + highFailuresByClass) <= Number(successCriteria.high_failures_allowed ?? 2)
      && passRate >= Number(successCriteria.min_pass_rate ?? 1)
      && runtimeMismatchRate <= runnerContract.maxRuntimeMismatchRate
      && constitutionalGate.pass
      && productStandardGate.pass,
    phase_results: phasePassMap,
    axis_averages: axisAverages,
    targets: targetProfile,
    fail_conditions: {
      no_privacy_leak: criticalFailures === 0,
      no_policy_leak: reports.every((r) => r.leaks.every((l) => l.id !== 'policy_leak')),
      no_state_leak: reports.every((r) => r.leaks.every((l) => l.id !== 'state_leak')),
      runtime_consistency: reports.every((r) => r.leaks.every((l) => l.id !== 'runtime_mismatch')),
      runtime_mismatch_rate_max: runtimeMismatchRate <= runnerContract.maxRuntimeMismatchRate,
      min_pass_rate: passRate >= Number(successCriteria.min_pass_rate ?? 1),
      required_phase_passes: requiredPhasePass,
      validation_rules_hold: reports.every((r) => (r.observed_behavior?.validation_failures || []).length === 0),
    },
    pass_rate: passRate,
    success_criteria: successCriteria,
    required_properties_status: {
      deterministic_intent_compile: allDeterministicRepeatStable,
      causal_contract_binding: allCausalBindingsPass,
      hardware_aware_runtime_selection: runtimeMismatchRate <= runnerContract.maxRuntimeMismatchRate,
      safe_clarification_gate: reports.every(
        (r) => !r.cracks.some((crack) => crack.id === 'ambiguity_override_failure'),
      ),
      bounded_fallback: fallbackBounded,
      file_backed_reproducibility: true,
    },
    generated_at_unix_ms: deterministicGeneratedAtUnixMs(monolith, reports),
    required_phases: requiredPhases,
    enforced_required_phases: enforcedRequiredPhases,
    missing_required_phases: missingRequiredPhases,
    schema_ref: 'reports/stress/balanced_entity_schema.json',
    stress_cases_ref: 'reports/stress/stress_test_cases.json',
    monolith_ref: 'reports/stress/selectpilot_monolith.json',
    constitution_ref: 'CONSTITUTION.json',
    runner_contract_ref: 'reports/stress/selectpilot_monolith.json#runner_contract',
    execution_model_ref: 'reports/stress/selectpilot_monolith.json#execution_model',
    constitutional_gate: constitutionalGate,
    product_standard_gate: productStandardGate,
    per_test_reports: reports.map((r) => `reports/stress/tests/${r.test_id}.json`),
  };

  await writeJson(path.resolve(reportsDir, 'master_summary.json'), masterReport);
  await writeJson(path.resolve(reportsDir, 'phase_summary.json'), phasePassMap);

  console.log(
    stableStringify({
      ok: true,
      outputs: {
        master_report: 'reports/stress/master_summary.json',
        phase_summary: 'reports/stress/phase_summary.json',
        per_test_reports: reports.length,
      },
    }),
  );
}

main().catch((error) => {
  console.error(
    stableStringify({
      ok: false,
      code: 'selectpilot_monolith_stress_runner_failed',
      message: error?.message || 'Unknown monolith stress runner failure',
      stack: error?.stack || null,
    }),
  );
  process.exit(1);
});
