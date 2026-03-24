# Zero Leakage Spec

This project is designed around a privacy-first, local-only boundary for the core selected-text workflow.

The runtime is also profile-based: the product prefers the smallest viable local model for the selected-text workload, then lets the user move up to Balanced or Advanced only if the hardware and latency profile justify it.

## Core claim

- Selected text is processed through a local bridge at `http://127.0.0.1:8083`.
- The local bridge talks only to a locally running Ollama instance.
- Cloud-hosted Ollama models are intentionally ignored for the core summarize, agent, and embed flows.
- If a requested model is unavailable locally, the bridge falls back only to other local models.
- The first-run flow is expected to detect the runtime, install the small local profile, benchmark it, and assign the result before the extension is treated as ready.

## What runs locally

- LLM inference for `summarize` and `agent` through a local Ollama model.
- Embeddings through a local Ollama embedding model.
- Context handling in the extension service worker and the local Python bridge.
- License storage in Chrome local storage.
- Profile selection and benchmark interpretation stay on-device.

## What never leaves by default

- Selected page text.
- Page URLs and titles used in the selected-text workflow.
- Prompt text entered in the side panel.
- Model responses and embeddings.
- Telemetry, analytics events, or usage logs.

## Allowed network boundary

- Extension UI calls `http://127.0.0.1:8083` directly.
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
2. Run the local bridge and open `http://127.0.0.1:8083/health`.
3. Confirm the response includes:
   - `"privacy_mode": "local-only"`
   - `"model_available": true`
   - `"active_model"` set to a local model
   - `"ignored_remote_models"` listing any cloud models that were skipped
4. Install or select the Fast profile and re-run the health check to confirm the smallest viable model is active.
5. Open Chrome DevTools Network for the extension and verify requests are limited to `127.0.0.1:8083`.
6. Verify there are no analytics or telemetry endpoints in the runtime path.

## Honest limitation

This is a local-only MVP for the core selected-text path, not a comprehensive security product. The privacy boundary is implemented in code and should be presented as a clear product constraint, not as a formal security certification.
