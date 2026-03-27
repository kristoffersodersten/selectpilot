export type AggregatedMetrics = {
  correctness?: {
    retry_rate?: number;
  };
  [key: string]: unknown;
};

export type FrontierDecision = {
  candidate_model: string;
  baseline_model?: string;
  decision: 'promote' | 'reject' | string;
  reason: string;
  weighted_score: number;
  schema_validity_rate: number;
  failure_rate: number;
  latency_regression_ratio: number;
  retry_rate?: number;
};

export type DeterminismReport = {
  selection_consistency_rate?: number;
  output_shape_consistency_rate?: number;
  frontier_decision_consistency_rate?: number;
  score?: number;
  [key: string]: unknown;
};

export type BottleneckAnalysis = {
  inference_dominance_ratio: number;
  validation_overhead_ratio: number;
  orchestration_overhead_ratio: number;
  dominant_cost_center: string;
};
