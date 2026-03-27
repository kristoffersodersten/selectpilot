export function selectRuntimeModel(input, policy, registry) {
    const available = new Set(input.availableModelIds);
    const registryById = new Map(registry.models.map((m) => [m.model_id, m]));
    const quarantined = new Set((policy.quarantined_models || []).map((q) => q.model_id));
    const isSelectable = (modelId, allowQuarantined = false) => {
        if (!available.has(modelId))
            return false;
        if (!registryById.has(modelId))
            return false;
        if (!allowQuarantined && quarantined.has(modelId))
            return false;
        return true;
    };
    const override = String(input.manualOverrideModelId || '').trim();
    if (override && isSelectable(override, Boolean(input.allowQuarantinedOverride))) {
        return {
            selected_model_id: override,
            selection_path: 'manual_override',
            selection_reason: 'manual_override_model_if_explicitly_set_and_allowed',
            policy_version: policy.policy_version,
            promotion_applied: false,
        };
    }
    const tuple = (policy.defaults || []).find((d) => d.task_family === input.taskFamily &&
        d.output_mode === input.outputMode &&
        d.hardware_profile === input.hardwareProfile);
    if (!tuple)
        return null;
    if (isSelectable(tuple.preferred_model_id)) {
        return {
            selected_model_id: tuple.preferred_model_id,
            selection_path: 'runtime_policy_preferred',
            selection_reason: tuple.selection_reason,
            policy_version: policy.policy_version,
            promotion_applied: true,
        };
    }
    const fallback = (tuple.fallback_model_ids || []).find((id) => isSelectable(id));
    if (!fallback) {
        if (input.availableModelIds.length === 0) {
            return {
                selected_model_id: tuple.preferred_model_id,
                selection_path: 'runtime_policy_fallback',
                selection_reason: 'runtime_policy_fallback_no_models_available_simulated_degraded_mode',
                policy_version: policy.policy_version,
                promotion_applied: false,
            };
        }
        return null;
    }
    return {
        selected_model_id: fallback,
        selection_path: 'runtime_policy_fallback',
        selection_reason: 'runtime_policy_fallback_models_in_order',
        policy_version: policy.policy_version,
        promotion_applied: true,
    };
}
