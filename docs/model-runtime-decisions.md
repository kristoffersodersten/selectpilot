# Model runtime decisions

## Current production defaults

- Fast / unknown / under 16 GB / Intel: `gemma4:e2b-it-qat`, `num_ctx=16384`.
- Balanced / Apple Silicon with 16 GB or more: `gemma4:e4b-it-qat`, `num_ctx=32768`.
- Advanced: manual opt-in only, `qwen2.5:7b`, `num_ctx=32768`.
- Embeddings: `nomic-embed-text-v2-moe:latest`.
- Structured generation: `temperature=0` and `seed=42` for every production profile.

Explicit environment overrides remain authoritative and must fail visibly when invalid or unavailable. SelectPilot never substitutes a different installed model, downloads a model without consent, or routes generation to a cloud model.

Installation prewarms the selected generation model with the same context window and deterministic sampling options used at runtime. A failed prewarm is an explicit installation failure; SelectPilot does not report the runtime as ready and does not silently choose another model. `CHROMEAI_OLLAMA_SEED` may override the seed for controlled verification, but invalid or negative values fail closed.

## Deferred decisions

- Keep `nomic-embed-text-v2-moe:latest` until measured retrieval quality makes embeddings a product bottleneck (SOD-397/SOD-401).
- Do not promote a larger Gemma 4 model for 32 GB machines until real M1 Max evidence qualifies its latency, memory use, structured-output validity, and failure behavior (SOD-398).
- Do not adopt Qwen3 4B for long context without actual usage evidence that 32K is insufficient (SOD-399).
- Do not replace Ollama with MLX/LM Studio without target-hardware measurements showing a material full-system advantage (SOD-400).

## Evidence boundary

Hetzner and GitHub Actions verify deterministic contracts, build integrity, privacy boundaries, and browser/server E2E behavior. They do not qualify Apple Silicon latency or memory claims. Target-hardware promotion remains blocked until evidence is captured on the named machine class under the repository benchmark contract.
