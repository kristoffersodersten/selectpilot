// module_name: agent_agent-types_ts
// spec_ref: "execution_layer"
export type DetectedInput = {
  kind: 'text' | 'audio' | 'video' | 'image';
  content: string;
  metadata: Record<string, unknown>;
};

export type AgentContext = {
  url?: string;
  title?: string;
  selection?: string;
  pageText?: string;
  markdown?: string;
  media?: { audio?: string; videoFrame?: string; image?: string };
  metadata?: Record<string, unknown>;
};

export type AgentOutput = {
  reasoning: string[];
  markdown: string;
  json: Record<string, unknown>;
};
