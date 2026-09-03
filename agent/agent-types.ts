// module_name: agent_agent-types_ts
// spec_ref: "execution_layer"
export type DetectedInput = {
  kind: 'text';
  content: string;
  metadata: Record<string, unknown>;
};

export type AgentContext = {
  url?: string;
  title?: string;
  selection?: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
};

export type AgentOutput = {
  reasoning: string[];
  markdown: string;
  json: Record<string, unknown>;
  model: string;
  source: string;
  routing: {
    model: string;
    num_ctx: number;
    reason: string;
  };
  trace_id?: string;
};
