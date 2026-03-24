import { runAgent } from './agent-client.js';
import type { AgentContext, AgentOutput } from './agent-types.js';

function detectInput(context: AgentContext): { kind: 'text' | 'audio' | 'video' | 'image'; summary: string } {
  if (context.media?.videoFrame) return { kind: 'video', summary: 'video frame with OCR candidate' };
  if (context.media?.image) return { kind: 'image', summary: 'image with OCR candidate' };
  if (context.media?.audio) return { kind: 'audio', summary: 'audio snippet for transcription' };
  return { kind: 'text', summary: 'text or markdown selection' };
}

function classifyContent(markdown: string): string {
  if (/```/m.test(markdown)) return 'technical_markdown';
  if (markdown.length > 1200) return 'longform';
  if (/\[[^\]]+\]\([^\)]+\)/.test(markdown)) return 'linked';
  return 'shortform';
}

function normalizeMarkdown(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('#')) return trimmed;
  return `# Captured Content\n\n${trimmed}`;
}

function buildReasoningChain(steps: string[]): string[] {
  return steps.map((s, idx) => `${idx + 1}. ${s}`);
}

function buildPrompt(
  normalized: string,
  context: AgentContext,
  contentClass: string,
  detected: string,
  userPrompt?: string
): string {
  const meta = [context.url ? `URL: ${context.url}` : '', context.title ? `Title: ${context.title}` : '']
    .filter(Boolean)
    .join('\n');
  const goal = userPrompt?.trim()
    ? `User goal: ${userPrompt.trim()}`
    : 'User goal: Summarize and structure the captured context.';
  return `You are the local SelectPilot agent. Input type: ${detected}. Classification: ${contentClass}.\n${goal}\n${meta}\n\nContent:\n${normalized}`;
}

export async function runPipeline(input: string, context: AgentContext, userPrompt?: string): Promise<AgentOutput> {
  const detected = detectInput(context);
  const normalized = normalizeMarkdown(input || context.selection || context.pageText || context.markdown || '') || 'No content provided.';
  const contentClass = classifyContent(normalized);
  const chain = buildReasoningChain([
    `Detect input (${detected.summary})`,
    `Classify content (${contentClass})`,
    'Normalize to canonical markdown',
    'Augment with metadata and optional multimodal references',
    'Request structured response (JSON + Markdown) from local agent'
  ]);

  const prompt = buildPrompt(normalized, context, contentClass, detected.kind, userPrompt);
  const agentOut = await runAgent(prompt, {
    ...context,
    markdown: normalized,
    metadata: {
      ...(context.metadata || {}),
      detectedKind: detected.kind,
      contentClass
    }
  });

  return {
    reasoning: [...chain, ...(agentOut.reasoning || [])],
    markdown: agentOut.markdown,
    json: agentOut.json
  };
}
