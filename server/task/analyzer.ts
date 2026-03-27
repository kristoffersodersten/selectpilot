import type { CompiledIntent, OperationFamily } from '../../shared/types/intent.js';
import type { OutputMode } from '../../shared/types/runtimePolicy.js';

export type TaskFamily = 'extract' | 'summarize' | 'agent';

export type TaskAnalysis = {
  task_family: TaskFamily;
  output_mode: OutputMode;
  hardware_profile: string;
  complexity: 'low' | 'medium' | 'high';
  latency_sensitivity: 'low' | 'medium' | 'high';
  precision_requirement: 'low' | 'medium' | 'high';
};

function mapOperationFamilyToTaskFamily(operationFamily: OperationFamily): TaskFamily {
  if (operationFamily === 'extract' || operationFamily === 'classify') return 'extract';
  if (operationFamily === 'analyze') return 'summarize';
  return 'agent';
}

function mapOperationFamilyToOutputMode(operationFamily: OperationFamily): OutputMode {
  if (operationFamily === 'extract' || operationFamily === 'classify') return 'strict_json';
  if (operationFamily === 'analyze') return 'semi_structured';
  return 'freeform';
}

function inferComplexity(intentNormalized: string): TaskAnalysis['complexity'] {
  const len = String(intentNormalized || '').length;
  if (len > 280) return 'high';
  if (len > 120) return 'medium';
  return 'low';
}

function inferLatencySensitivity(intentNormalized: string): TaskAnalysis['latency_sensitivity'] {
  const text = intentNormalized.toLowerCase();
  if (text.includes('urgent') || text.includes('fast') || text.includes('quick')) return 'high';
  if (text.includes('background') || text.includes('when ready')) return 'low';
  return 'medium';
}

function inferPrecisionRequirement(compiledIntent: CompiledIntent): TaskAnalysis['precision_requirement'] {
  if (compiledIntent.constraints.strictness === 'high') return 'high';
  if (compiledIntent.constraints.strictness === 'low') return 'low';
  return 'medium';
}

export function analyzeTask(compiledIntent: CompiledIntent): TaskAnalysis {
  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const hardwareProfile = String(runtimeEnv?.env?.CHROMEAI_HARDWARE_PROFILE || 'medium').trim() || 'medium';

  return {
    task_family: mapOperationFamilyToTaskFamily(compiledIntent.operation_family),
    output_mode: mapOperationFamilyToOutputMode(compiledIntent.operation_family),
    hardware_profile: hardwareProfile,
    complexity: inferComplexity(compiledIntent.intent_normalized),
    latency_sensitivity: inferLatencySensitivity(compiledIntent.intent_normalized),
    precision_requirement: inferPrecisionRequirement(compiledIntent),
  };
}
