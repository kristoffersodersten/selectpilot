import fs from 'node:fs';
import path from 'node:path';

import { compileIntent } from './intent/intentCompiler.js';
import { analyzeTask } from './task/analyzer.js';
import { compileOperationContract } from './operations/contractCompiler.js';
import { selectRuntimeModel } from './model/runtimeSelectorAdapter.js';
import { appendRuntimeFeedback } from './runtime/liveFeedback.js';
import type {
  RuntimeModelPolicy,
  RuntimeModelRegistry,
  RuntimeSelectionOutput,
} from '../shared/types/runtimePolicy.js';

export type RunSelectPilotInput = {
  intent: string;
  manualOverrideModelId?: string | null;
  allowQuarantinedOverride?: boolean;
};

export type RunSelectPilotResult = {
  trace_id: string;
  aborted: boolean;
  abort_reason: string | null;
  compiled_intent: ReturnType<typeof compileIntent>['compiled_intent'];
  clarification: ReturnType<typeof compileIntent>['clarification'];
  ambiguity_score: number;
  task_analysis: ReturnType<typeof analyzeTask> | null;
  operation_contract: ReturnType<typeof compileOperationContract> | null;
  runtime_selection: RuntimeSelectionOutput | null;
  active_model: string | null;
  external_calls: number;
  model_selection: RuntimeSelectionOutput | null;
};

function repoRoot(): string {
  const scriptDir = decodeURIComponent(path.dirname(new URL(import.meta.url).pathname));
  return path.resolve(scriptDir, '..');
}

function readJsonFile<T>(absolutePath: string): T {
  const raw = fs.readFileSync(absolutePath, 'utf8');
  return JSON.parse(raw) as T;
}

function loadRuntimePolicyAndRegistry(root: string): {
  policy: RuntimeModelPolicy;
  registry: RuntimeModelRegistry;
} {
  const runtimeDir = path.resolve(root, 'runtime');
  const policyPath = path.resolve(runtimeDir, 'model_policy.json');
  const registryPath = path.resolve(runtimeDir, 'model_registry.runtime.json');

  return {
    policy: readJsonFile<RuntimeModelPolicy>(policyPath),
    registry: readJsonFile<RuntimeModelRegistry>(registryPath),
  };
}

function deterministicTraceId(payload: Record<string, unknown>): string {
  const source = JSON.stringify(payload);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (code + i) & 0xff;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  const digest = `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
  return `sp_${digest}`;
}

export function runSelectPilot(input: RunSelectPilotInput): RunSelectPilotResult {
  const root = repoRoot();
  const compilation = compileIntent(input.intent);
  const { policy, registry } = loadRuntimePolicyAndRegistry(root);
  const traceId = deterministicTraceId({
    intent_normalized: compilation.compiled_intent.intent_normalized,
    manualOverrideModelId: input.manualOverrideModelId ?? null,
    allowQuarantinedOverride: Boolean(input.allowQuarantinedOverride),
    policyVersion: policy.policy_version ?? null,
    installedModels: registry.models
      .filter((model) => model.installation_state === 'installed')
      .map((model) => model.model_id)
      .sort(),
  });

  if (compilation.compiled_intent.needs_clarification) {
    const result: RunSelectPilotResult = {
      trace_id: traceId,
      aborted: true,
      abort_reason: 'ambiguity_requires_clarification',
      compiled_intent: compilation.compiled_intent,
      clarification: compilation.clarification,
      ambiguity_score: compilation.compiled_intent.ambiguity_score,
      task_analysis: null,
      operation_contract: null,
      runtime_selection: null,
      active_model: null,
      external_calls: 0,
      model_selection: null,
    };

    appendRuntimeFeedback({
      timestamp: new Date().toISOString(),
      validation_result: {
        needs_clarification: true,
        ambiguity_score: compilation.compiled_intent.ambiguity_score,
        aborted: true,
        abort_reason: 'ambiguity_requires_clarification',
      },
      execution_result: {
        trace_id: traceId,
        operation_name: null,
        endpoint: null,
      },
    });

    return result;
  }

  const taskAnalysis = analyzeTask(compilation.compiled_intent);
  const operationContract = compileOperationContract(compilation.compiled_intent, taskAnalysis);

  const availableModelIds = registry.models
    .filter((model) => model.installation_state === 'installed')
    .map((model) => model.model_id);

  const selected = selectRuntimeModel(
    {
      taskFamily: taskAnalysis.task_family,
      outputMode: taskAnalysis.output_mode,
      hardwareProfile: taskAnalysis.hardware_profile,
      availableModelIds,
      manualOverrideModelId: input.manualOverrideModelId,
      allowQuarantinedOverride: Boolean(input.allowQuarantinedOverride),
    },
    policy,
    registry,
  );

  if (!selected) {
    throw new Error('runtime_policy_no_match');
  }

  const result: RunSelectPilotResult = {
    trace_id: traceId,
    aborted: false,
    abort_reason: null,
    compiled_intent: compilation.compiled_intent,
    clarification: compilation.clarification,
    ambiguity_score: compilation.compiled_intent.ambiguity_score,
    task_analysis: taskAnalysis,
    operation_contract: operationContract,
    runtime_selection: selected,
    active_model: selected.selected_model_id ?? null,
    external_calls: 0,
    model_selection: selected,
  };

  appendRuntimeFeedback({
    timestamp: new Date().toISOString(),
    runtime_selection_result: selected,
    validation_result: {
      needs_clarification: compilation.compiled_intent.needs_clarification,
      ambiguity_score: compilation.compiled_intent.ambiguity_score,
    },
    execution_result: {
      trace_id: traceId,
      operation_name: operationContract.operation_name,
      endpoint: operationContract.endpoint,
    },
  });

  return result;
}
