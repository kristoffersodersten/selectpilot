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

export function loadFrontierReport(decisions: FrontierDecision[]): ReportStoreState {
  state.frontier = Array.isArray(decisions) ? decisions : [];
  return state;
}

export function loadDeterminismReport(report: DeterminismReport): ReportStoreState {
  state.determinism = report || null;
  return state;
}

export function loadBottleneckReport(analysis: BottleneckAnalysis): ReportStoreState {
  state.bottleneck = analysis || null;
  return state;
}
