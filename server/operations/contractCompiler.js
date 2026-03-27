function inferOperationName(compiledIntent) {
    if (compiledIntent.operation_family === 'extract' || compiledIntent.operation_family === 'classify')
        return 'extract';
    if (compiledIntent.operation_family === 'analyze')
        return 'summarize';
    return 'agent';
}
function latencyBudgetForTask(taskFamily) {
    switch (taskFamily) {
        case 'extract':
            return 2000;
        case 'summarize':
            return 1200;
        default:
            return 3000;
    }
}
export function compileOperationContract(compiledIntent, taskAnalysis) {
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
