export type OutputMode = 'freeform' | 'semi_structured' | 'strict_json';

export type RuntimePolicyDefault = {
  task_family: string;
  hardware_profile: string;
  output_mode: OutputMode;
  preferred_model_id: string;
  fallback_model_ids: string[];
  selection_reason: string;
  evidence_refs: string[];
  effective_from_unix_ms: number;
};

export type RuntimePolicyQuarantine = {
  model_id: string;
  reason: string;
  until_unix_ms: number | null;
  evidence_refs: string[];
};

export type RuntimePolicyHistory = {
  task_family: string;
  hardware_profile: string;
  previous_model_id: string;
  new_model_id: string;
  decision_reason: string;
  effective_from_unix_ms: number;
};

export type RuntimeModelPolicy = {
  policy_version: string;
  generated_at_unix_ms: number;
  source_reports: string[];
  global_guards: {
    determinism_min: number;
    strict_json_schema_validity_min: number;
    max_failure_rate: number;
    max_retry_rate: number;
  };
  defaults: RuntimePolicyDefault[];
  quarantined_models: RuntimePolicyQuarantine[];
  promotion_history: RuntimePolicyHistory[];
};

export type PromotionAuditRecord = {
  event_type: 'compile_policy' | 'rollback' | 'promotion' | 'gate_reject';
  generated_at_unix_ms: number;
  policy_version?: string;
  rolled_back_from?: string;
  rolled_back_to?: string;
  reason?: string;
  task_family?: string;
  hardware_profile?: string;
};

export type RuntimeRegistryEntry = {
  model_id: string;
  ollama_name: string;
  supported_operation_families: string[];
  min_hardware_profile: string;
  installation_state: string;
  runtime_status: 'preferred' | 'fallback' | 'baseline' | 'quarantined' | 'rejected';
  reliability_score: number | null;
  policy_refs: string[];
};

export type RuntimeModelRegistry = {
  generated_at_unix_ms: number;
  policy_version: string;
  models: RuntimeRegistryEntry[];
};

export type RuntimeSelectionInput = {
  taskFamily: string;
  outputMode: OutputMode;
  hardwareProfile: string;
  availableModelIds: string[];
  manualOverrideModelId?: string | null;
  allowQuarantinedOverride?: boolean;
};

export type RuntimeSelectionPath =
  | 'manual_override'
  | 'runtime_policy_preferred'
  | 'runtime_policy_fallback'
  | 'baseline_selector';

export type RuntimeSelectionOutput = {
  selected_model_id: string;
  selection_path: RuntimeSelectionPath;
  selection_reason: string;
  policy_version: string | null;
  promotion_applied: boolean;
};
