export type OperationFamily = 'transform' | 'extract' | 'analyze' | 'classify' | 'generate' | 'unknown';

export type IntentConstraints = {
  output_format: 'freeform' | 'structured' | 'json' | 'unknown';
  strictness: 'low' | 'medium' | 'high';
  tone: string | null;
  length: 'short' | 'medium' | 'long' | 'unspecified';
  schema_requested: boolean;
  explanation_allowed: boolean;
};

export type CompiledIntent = {
  intent_raw: string;
  intent_normalized: string;
  operation_family: OperationFamily;
  action: string;
  target: string | null;
  constraints: IntentConstraints;
  ambiguity_score: number;
  needs_clarification: boolean;
};

export type IntentClarification = {
  question: string;
  options: string[];
};

export type IntentCompilationResult = {
  compiled_intent: CompiledIntent;
  clarification: IntentClarification | null;
};
