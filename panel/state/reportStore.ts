// module_name: panel_state_reportStore_ts
// spec_ref: "frontend_state_contract"
import type { BottleneckAnalysis, DeterminismReport, FrontierDecision } from '../../shared/types/benchmarkTypes.js';

export type ReportStoreState = {
  frontier: FrontierDecision[];
  determinism: DeterminismReport | null;
  bottleneck: BottleneckAnalysis | null;
};

const state: ReportStoreState = {
  frontier: [],
  determinism: null,
  bottleneck: null,
};

// @spec_ref frontend_state_contract
export function loadFrontierReport(decisions: FrontierDecision[]): ReportStoreState {
  state.frontier = Array.isArray(decisions) ? decisions : [];
  return state;
}

// @spec_ref frontend_state_contract
export function loadDeterminismReport(report: DeterminismReport): ReportStoreState {
  state.determinism = report || null;
  return state;
}

// @spec_ref frontend_state_contract
export function loadBottleneckReport(analysis: BottleneckAnalysis): ReportStoreState {
  state.bottleneck = analysis || null;
  return state;
}
