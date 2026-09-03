// module_name: agent_agent-pipeline_ts
// spec_ref: "execution_layer"
import { runAgent } from './agent-client.js';
function classifyContent(markdown) {
    if (/```/m.test(markdown))
        return 'technical_markdown';
    if (markdown.length > 1200)
        return 'longform';
    if (/\[[^\]]+\]\([^)]+\)/.test(markdown))
        return 'linked';
    return 'shortform';
}
function normalizeMarkdown(input) {
    const trimmed = input.trim();
    if (!trimmed)
        return '';
    if (trimmed.startsWith('#'))
        return trimmed;
    return `# Captured Content\n\n${trimmed}`;
}
function buildReasoningChain(steps) {
    return steps.map((s, idx) => `${idx + 1}. ${s}`);
}
function buildPrompt(normalized, context, contentClass, detected, userPrompt) {
    const meta = [context.url ? `URL: ${context.url}` : '', context.title ? `Title: ${context.title}` : '']
        .filter(Boolean)
        .join('\n');
    const goal = userPrompt?.trim()
        ? `User goal: ${userPrompt.trim()}`
        : 'User goal: Summarize and structure the captured context.';
    return `You are the local SelectPilot agent. Input type: ${detected}. Classification: ${contentClass}.\n${goal}\n${meta}\n\nContent:\n${normalized}`;
}
export async function runPipeline(input, context, userPrompt) {
    const normalized = normalizeMarkdown(input || context.selection || context.markdown || '') || 'No content provided.';
    const contentClass = classifyContent(normalized);
    const chain = buildReasoningChain([
        'Confirm selected text input',
        `Classify content (${contentClass})`,
        'Normalize to canonical markdown',
        'Augment with declared page metadata',
        'Request structured response (JSON + Markdown) from local agent'
    ]);
    const prompt = buildPrompt(normalized, context, contentClass, 'text', userPrompt);
    const agentOut = await runAgent(prompt, {
        ...context,
        markdown: normalized,
        metadata: {
            ...(context.metadata || {}),
            detectedKind: 'text',
            contentClass
        }
    });
    return {
        reasoning: [...chain, ...(agentOut.reasoning || [])],
        markdown: agentOut.markdown,
        json: agentOut.json,
        model: agentOut.model,
        source: agentOut.source,
        routing: agentOut.routing,
        trace_id: agentOut.trace_id,
    };
}
