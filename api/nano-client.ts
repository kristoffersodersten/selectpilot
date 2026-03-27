import { endpoints } from './endpoints.js';
import { apiRequest } from './request.js';

export type SummarizePayload = { text: string; url?: string; title?: string; metadata?: Record<string, unknown> };
export type ExtractPayload = { text: string; preset?: string; url?: string; title?: string; metadata?: Record<string, unknown> };
export type TranscribePayload = { audioUrl?: string; mediaId?: string; metadata?: Record<string, unknown> };
export type VisionPayload = { imageBase64?: string; videoFrame?: string; url?: string; metadata?: Record<string, unknown> };
export type AgentPayload = { prompt: string; context?: Record<string, unknown> };
export type EmbedPayload = { text: string };
export type IntentCompilePayload = {
  intent: string;
  has_selection?: boolean;
  has_page_text?: boolean;
  session_id?: string;
};

export type IntentCompileResponse = {
  trace_id: string;
  clarify_required: boolean;
  ambiguity_score: number;
  operation?: 'extract' | 'summarize' | 'agent';
  template?: string;
  prompt_version?: string;
  question?: string;
  options?: string[];
  output_enforcement?: {
    mode: string;
    max_attempts: number;
    visible_retries: boolean;
  };
  ir: {
    version: string;
    source: string;
    intent_text: string;
    operations_considered: string[];
    selected_operation?: string;
    requires_clarification: boolean;
    latency_budget_ms?: number;
    memory_guard?: {
      max_payload_chars?: number;
    };
  };
};

export type RuntimeMetaHealth = {
  ok: boolean;
  service: string;
  stream_enabled: boolean;
  active_streams: number;
  event_version: string;
};

export type RuntimeMetaEvent = {
  type: 'runtime_meta';
  event_type: string;
  trace_id?: string;
  operation?: string;
  status: string;
  step?: string;
  message?: string;
  timestamp: string;
  latency_hint_ms?: number;
  duration_ms?: number;
  details?: Record<string, unknown>;
  seq?: number;
  event_version?: string;
  privacy?: {
    selected_text_exposed?: boolean;
    local_only?: boolean;
  };
};

export async function summarize(payload: SummarizePayload) {
  return apiRequest<{ summary: string; markdown: string }>(endpoints.summarize, { body: payload });
}

export async function extract(payload: ExtractPayload) {
  return apiRequest<{ preset: string; label: string; description: string; markdown: string; json: Record<string, unknown> }>(
    endpoints.extract,
    { body: payload }
  );
}

export async function transcribe(payload: TranscribePayload) {
  return apiRequest<{ text: string; confidence: number }>(endpoints.transcribe, { body: payload });
}

export async function vision(payload: VisionPayload) {
  return apiRequest<{ text: string; tags?: string[] }>(endpoints.vision, { body: payload });
}

export async function embed(payload: EmbedPayload) {
  return apiRequest<{ vector: number[] }>(endpoints.embed, { body: payload });
}

export async function agent(payload: AgentPayload) {
  return apiRequest<{ reasoning: string[]; markdown: string; json: unknown }>(endpoints.agent, { body: payload });
}

export async function compileIntent(payload: IntentCompilePayload) {
  return apiRequest<IntentCompileResponse>(endpoints.intentCompile, { body: payload });
}

export async function getRuntimeMetaHealth() {
  return apiRequest<RuntimeMetaHealth>(endpoints.runtimeMetaHealth, { method: 'GET' });
}

export function getRuntimeMetaStreamUrl(afterSeq?: number) {
  if (typeof afterSeq === 'number' && Number.isFinite(afterSeq) && afterSeq > 0) {
    return `${endpoints.runtimeMetaStream}?after=${Math.floor(afterSeq)}`;
  }
  return endpoints.runtimeMetaStream;
}
