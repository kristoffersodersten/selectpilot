import { agent as agentEndpoint } from '../api/nano-client.js';
export async function runAgent(prompt, context) {
    const payload = { prompt, context };
    const res = await agentEndpoint(payload);
    return {
        reasoning: res.reasoning,
        markdown: res.markdown,
        json: res.json ?? {}
    };
}
