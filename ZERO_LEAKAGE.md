# Zero Leakage Spec

This project is designed around a privacy-first, local-only boundary for the core selected-text workflow.

## Core claim

- Selected text is processed through a local bridge at `http://chromeai.local`.
- The local bridge talks only to a locally running Ollama instance.
- Cloud-hosted Ollama models are intentionally ignored for the core summarize, agent, and embed flows.
- If a requested model is unavailable locally, the bridge falls back only to other local models.

## What runs locally

- LLM inference for `summarize` and `agent` through a local Ollama model.
- Embeddings through a local Ollama embedding model.
- Context handling in the extension service worker and the local Python bridge.
- License storage in Chrome local storage.

## What never leaves by default

- Selected page text.
- Page URLs and titles used in the selected-text workflow.
- Prompt text entered in the side panel.
- Model responses and embeddings.
- Telemetry, analytics events, or usage logs.

## Allowed network boundary

- Extension UI calls `http://chromeai.local`, which is mapped to `127.0.0.1`.
- The local bridge calls the configured Ollama base URL, which defaults to `http://127.0.0.1:11434`.
- If only Ollama cloud models are installed, the bridge reports degraded health instead of sending selected text to them.

## Product framing

- Privacy-first is the main differentiator for the selected-text workflow.
- The repo should be understood as a utility product with a strict local boundary, not as a generic browser AI wrapper.

## Experimental surfaces

- `Transcribe` and `Vision OCR` remain prototype utilities and are not part of the privacy claim.
- Billing code exists in the repo as a prototype but is not part of the selected-text local copilot flow.

## How to verify

1. Run `curl http://127.0.0.1:11434/api/tags` and confirm you have at least one local generation model installed.
2. Run the local bridge and open `http://127.0.0.1:<port>/health`.
3. Confirm the response includes:
   - `"privacy_mode": "local-only"`
   - `"model_available": true`
   - `"active_model"` set to a local model
   - `"ignored_remote_models"` listing any cloud models that were skipped
4. Open Chrome DevTools Network for the extension and verify requests are limited to `chromeai.local`.
5. Verify there are no analytics or telemetry endpoints in the runtime path.

## Honest limitation

This is a local-only MVP for the core selected-text path, not a comprehensive security product. The privacy boundary is implemented in code and should be presented as a clear product constraint, not as a formal security certification.
