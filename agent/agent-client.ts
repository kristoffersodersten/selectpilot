// module_name: agent_agent-client_ts
// spec_ref: "execution_layer"
import { agent as agentEndpoint } from '../api/nano-client.js';
import { AgentContext, AgentOutput } from './agent-types.js';

export async function runAgent(prompt: string, context: AgentContext): Promise<AgentOutput> {
  const payload = { prompt, context };
  const res = await agentEndpoint(payload);
  return {
    reasoning: res.reasoning,
    markdown: res.markdown,
    json: (res.json as Record<string, unknown>) ?? {}
  };
}
