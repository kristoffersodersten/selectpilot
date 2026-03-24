import { endpoints } from './endpoints.js';
import { apiRequest } from './request.js';

export type SummarizePayload = { text: string; url?: string; title?: string; metadata?: Record<string, unknown> };
export type ExtractPayload = { text: string; preset?: string; url?: string; title?: string; metadata?: Record<string, unknown> };
export type TranscribePayload = { audioUrl?: string; mediaId?: string; metadata?: Record<string, unknown> };
export type VisionPayload = { imageBase64?: string; videoFrame?: string; url?: string; metadata?: Record<string, unknown> };
export type AgentPayload = { prompt: string; context?: Record<string, unknown> };
export type EmbedPayload = { text: string };

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
