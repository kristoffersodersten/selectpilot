import type { CompiledIntent } from '../../shared/types/intent.js';
import type { TaskAnalysis } from '../task/analyzer.js';

export type OperationContract = {
  operation_name: 'extract' | 'summarize' | 'agent';
  endpoint: '/extract' | '/summarize' | '/agent';
  template: 'extract.v1' | 'summarize.v1' | 'agent.v1';
  output_enforcement: {
    mode: 'strict_json_retry_once' | 'deterministic_validate';
    max_attempts: number;
    visible_retries: boolean;
  };
  latency_budget_ms: number;
  memory_guard: {
    threshold_ratio: number;
    strategy: 'lru_eviction';
    max_payload_chars: number;
  };
  deterministic: {
    no_runtime_template_mutation: true;
    prompt_version: string;
  };
};

function inferOperationName(compiledIntent: CompiledIntent): OperationContract['operation_name'] {
  if (compiledIntent.operation_family === 'extract' || compiledIntent.operation_family === 'classify') return 'extract';
  if (compiledIntent.operation_family === 'analyze') return 'summarize';
  return 'agent';
}

function latencyBudgetForTask(taskFamily: TaskAnalysis['task_family']): number {
  switch (taskFamily) {
    case 'extract':
      return 2000;
    case 'summarize':
      return 1200;
    default:
      return 3000;
  }
}

export function compileOperationContract(
  compiledIntent: CompiledIntent,
  taskAnalysis: TaskAnalysis,
): OperationContract {
  const operationName = inferOperationName(compiledIntent);

  if (operationName === 'extract') {
    return {
      operation_name: 'extract',
      endpoint: '/extract',
      template: 'extract.v1',
      output_enforcement: {
        mode: 'strict_json_retry_once',
        max_attempts: 2,
        visible_retries: true,
      },
      latency_budget_ms: latencyBudgetForTask(taskAnalysis.task_family),
      memory_guard: {
        threshold_ratio: 0.8,
        strategy: 'lru_eviction',
        max_payload_chars: 120_000,
      },
      deterministic: {
        no_runtime_template_mutation: true,
        prompt_version: 'deterministic.prompts.v3',
      },
    };
  }

  if (operationName === 'summarize') {
    return {
      operation_name: 'summarize',
      endpoint: '/summarize',
      template: 'summarize.v1',
      output_enforcement: {
        mode: 'deterministic_validate',
        max_attempts: 1,
        visible_retries: false,
      },
      latency_budget_ms: latencyBudgetForTask(taskAnalysis.task_family),
      memory_guard: {
        threshold_ratio: 0.8,
        strategy: 'lru_eviction',
        max_payload_chars: 120_000,
      },
      deterministic: {
        no_runtime_template_mutation: true,
        prompt_version: 'deterministic.prompts.v3',
      },
    };
  }

  return {
    operation_name: 'agent',
    endpoint: '/agent',
    template: 'agent.v1',
    output_enforcement: {
      mode: 'deterministic_validate',
      max_attempts: 1,
      visible_retries: false,
    },
    latency_budget_ms: latencyBudgetForTask(taskAnalysis.task_family),
    memory_guard: {
      threshold_ratio: 0.8,
      strategy: 'lru_eviction',
      max_payload_chars: 120_000,
    },
    deterministic: {
      no_runtime_template_mutation: true,
      prompt_version: 'deterministic.prompts.v3',
    },
  };
}
