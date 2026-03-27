import type { InformationTopology } from '../../shared/types/uiTopology.js';

export const TOPOLOGY_MAP: Record<string, InformationTopology> = {
  panel_header: 'system_state',
  runtime_meta_overlay: 'execution_state',
  truth_strip: 'system_state',
  runtime_state: 'execution_state',
  selection_shell: 'human_intervention_state',
  intent_shell: 'human_intervention_state',
  workspace: 'execution_state',
  result_shell: 'execution_state',
  memory_shell: 'infrastructure_state',
  status_footer: 'system_state',
};

const ALLOWED_TOPOLOGIES: InformationTopology[] = [
  'system_state',
  'execution_state',
  'infrastructure_state',
  'human_intervention_state',
];

const REQUIRED_COMPONENTS = [
  'panel_header',
  'runtime_meta_overlay',
  'truth_strip',
  'runtime_state',
  'selection_shell',
  'intent_shell',
  'workspace',
  'result_shell',
  'memory_shell',
  'status_footer',
];

export function getTopologyForComponent(componentId: string): InformationTopology | null {
  const topology = TOPOLOGY_MAP[componentId];
  return topology || null;
}

export function validateTopologyMap(map: Record<string, string> = TOPOLOGY_MAP): { ok: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const componentId of REQUIRED_COMPONENTS) {
    if (!map[componentId]) {
      errors.push(`missing_topology_mapping:${componentId}`);
    }
  }

  for (const [componentId, topology] of Object.entries(map)) {
    if (!ALLOWED_TOPOLOGIES.includes(topology as InformationTopology)) {
      errors.push(`invalid_topology_value:${componentId}:${topology}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
