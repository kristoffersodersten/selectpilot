// module_name: runtime_store
// spec_ref: "frontend_state_contract"
// @spec_ref runtime_event_contract
import type { VisiblePanelState } from '../../shared/types/uiTopology.js';
import type { RuntimeSelectionPath } from '../../shared/types/runtimePolicy.js';

export type RuntimeStepState = 'idle' | 'running' | 'waiting' | 'done' | 'error';

export type RuntimeStoreState = {
  intent: string;
  selectionContext: {
    selectionOrigin: string;
    contentLength: number;
    executionBoundary: string;
    privacyMode: string;
  };
  runtimeHeader: {
    taskFamily: string;
    selectedModel: string;
    selectionPath: RuntimeSelectionPath;
    executionGeography: string;
    policyVersion: string | null;
  };
  steps: Array<{ id: string; label: string; state: RuntimeStepState }>;
  visiblePanels: VisiblePanelState[];
};

const MAX_VISIBLE_PANELS = 3;

const state: RuntimeStoreState = {
  intent: '',
  selectionContext: {
    selectionOrigin: 'unknown',
    contentLength: 0,
    executionBoundary: 'local',
    privacyMode: 'local-only',
  },
  runtimeHeader: {
    taskFamily: 'agent',
    selectedModel: 'unknown',
    selectionPath: 'baseline_selector',
    executionGeography: 'local',
    policyVersion: null,
  },
  steps: [],
  visiblePanels: ['selection_surface', 'runtime_surface', 'report_surface'],
};

// @spec_ref frontend_state_contract
export function setIntent(intent: string): RuntimeStoreState {
  state.intent = String(intent || '');
  return state;
}

// @spec_ref frontend_state_contract
export function setSelectionContext(input: Partial<RuntimeStoreState['selectionContext']>): RuntimeStoreState {
  state.selectionContext = {
    ...state.selectionContext,
    ...input,
  };
  return state;
}

// @spec_ref frontend_state_contract
export function applyRuntimeEvent(event: {
  taskFamily?: string;
  selectedModel?: string;
  selectionPath?: RuntimeSelectionPath;
  executionGeography?: string;
  policyVersion?: string | null;
  step?: { id: string; label: string; state: RuntimeStepState };
}): RuntimeStoreState {
  state.runtimeHeader = {
    taskFamily: event.taskFamily || state.runtimeHeader.taskFamily,
    selectedModel: event.selectedModel || state.runtimeHeader.selectedModel,
    selectionPath: event.selectionPath || state.runtimeHeader.selectionPath,
    executionGeography: event.executionGeography || state.runtimeHeader.executionGeography,
    policyVersion: event.policyVersion ?? state.runtimeHeader.policyVersion,
  };
  if (event.step) {
    const idx = state.steps.findIndex((s) => s.id === event.step?.id);
    if (idx >= 0) state.steps[idx] = event.step;
    else state.steps.push(event.step);
  }
  return state;
}

// @spec_ref frontend_state_contract
export function setVisiblePanels(panels: VisiblePanelState[]): RuntimeStoreState {
  state.visiblePanels = [...panels].slice(0, MAX_VISIBLE_PANELS);
  return state;
}
// module_name: runtime_store
// spec_ref: "frontend_state_contract"
// @spec_ref runtime_event_contract
