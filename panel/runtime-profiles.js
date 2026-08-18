export const RUNTIME_PROFILES = [
    {
        key: 'fast',
        label: 'Fast',
        description: 'Smallest viable local profile for structured extraction and low-latency summaries.',
        generation_model: 'gemma4:e2b-it-qat',
        embedding_model: 'nomic-embed-text-v2-moe:latest',
        num_ctx: 16384,
        target_latency: '1-4s',
        intended_for: 'Selected-text extraction, action briefs, and quick summaries.',
        command: './scripts/bootstrap-macos-local.sh --profile fast',
        is_default_auto: true,
    },
    {
        key: 'balanced',
        label: 'Balanced',
        description: 'Higher quality local profile for rewrite and general-purpose browser transforms.',
        generation_model: 'gemma4:e4b-it-qat',
        embedding_model: 'nomic-embed-text-v2-moe:latest',
        num_ctx: 32768,
        target_latency: '2-6s',
        intended_for: 'Daily use when you want better quality without drifting into heavy models.',
        command: './scripts/bootstrap-macos-local.sh --profile balanced',
    },
    {
        key: 'advanced',
        label: 'Advanced',
        description: 'Manual opt-in profile for stronger reasoning on larger machines.',
        generation_model: 'qwen2.5:7b',
        embedding_model: 'nomic-embed-text-v2-moe:latest',
        num_ctx: 32768,
        target_latency: '4-10s',
        intended_for: 'Heavier rewrite and ask flows when latency budget is less important.',
        command: './scripts/bootstrap-macos-local.sh --profile advanced',
    },
];
// @spec_ref frontend_state_contract
export function getRuntimeProfile(key) {
    return RUNTIME_PROFILES.find((profile) => profile.key === key) || RUNTIME_PROFILES[0];
}
