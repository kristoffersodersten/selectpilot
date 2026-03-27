export type InformationTopology =
  | 'system_state'
  | 'execution_state'
  | 'infrastructure_state'
  | 'human_intervention_state';

export type VisiblePanelState = 'selection_surface' | 'runtime_surface' | 'report_surface';

export type ExecutionSurfaceState = 'idle' | 'running' | 'waiting' | 'done' | 'error';

export type EnvironmentTruthState = {
  tool_identity: string;
  tool_provider: string;
  execution_geography: 'local' | 'remote' | 'hybrid';
  latency_cost_class: 'low' | 'medium' | 'high';
  economic_cost_if_applicable: string | null;
  local_remote_hybrid_state: 'local_only' | 'hybrid' | 'remote';
};
