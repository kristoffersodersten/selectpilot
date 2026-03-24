# SelectPilot

SelectPilot is a privacy-first, local-first browser copilot for selected text. Highlight something on the web, open the side panel, and turn that selection into a summary, rewrite, action list, or prompted answer using Ollama running on your machine.

This is still an MVP, but the core loop is real and intentionally constrained: selected text is captured in the extension, routed through a local Python bridge, sent to a local Ollama model, and rendered back in a Chrome side panel without sending the selected-text path to hosted inference.

For the privacy boundary and verification checklist, see [ZERO_LEAKAGE.md](./ZERO_LEAKAGE.md).
For a fast application-ready walkthrough, see [DEMO_SCRIPT.md](./DEMO_SCRIPT.md).

## Why this exists

Most browser AI tools are thin wrappers around remote APIs. SelectPilot is built around a narrower promise:

- Privacy first: the core selected-text path stays local by design.
- Zero leakage on the main workflow: selected text is not sent to cloud-hosted Ollama models.
- Useful before broad: summarize, rewrite, and extract actions from highlighted text quickly.

## Privacy-first promise

- `Summarize`, `Ask`, and `Embed` run through a local bridge and local Ollama models.
- Cloud Ollama models are explicitly ignored for the core selected-text path.
- No telemetry or analytics are part of the runtime flow.
- The privacy boundary is visible and testable through the `/health` endpoint and DevTools network inspection.

## What it does

- Summarizes selected text or page content from the active tab via Ollama.
- Rewrites or transforms selected text with prompted local model calls.
- Extracts action items and next steps from highlighted content.
- Runs an agent-style workflow from the side panel with a user-editable prompt.
- Stores license data locally and gates features by tier.
- Enforces a local-only boundary for summarize, agent, and embed by ignoring Ollama cloud models.
- Includes a local Python service, launchd wiring, and nginx proxy config for `http://chromeai.local`.
- Keeps audio and vision flows as explicit experimental tools, not the main product promise.

## Project status

- Chrome extension shell: implemented
- Side panel UI: implemented
- Content capture: implemented
- Local service layer: implemented
- Ollama integration for summarize/agent/embed: implemented
- Tiering and pricing model: implemented
- Billing and license verification flows: prototype
- Audio and vision tools: prototype

## Repo layout

- `manifest.json`: MV3 extension manifest
- `background/`: service worker and tier gating
- `content/`: extraction helpers for text, audio, and video
- `panel/`: side panel UI
- `popup/`: popup action entrypoint
- `agent/`: agent prompt and reasoning pipeline
- `api/`: local service client
- `billing/`: Paddle checkout prototype
- `licensing/`: local license storage and verification
- `server/`: local Python service
- `launchd/`, `nginx/`: local macOS setup

## Local setup

### 1. Install dev dependencies

```bash
npm install
```

### 2. Build JavaScript from TypeScript

```bash
npm run build
```

### 3. Install the local macOS LaunchAgent

```bash
./scripts/install-macos-local.sh
```

If you want a specific Ollama model, set it before running the script:

```bash
CHROMEAI_OLLAMA_MODEL=qwen2.5:0.5b ./scripts/install-macos-local.sh
```

### 4. Add the local hostname

Add this line to `/etc/hosts` if it is missing:

```text
127.0.0.1 chromeai.local
```

### 5. Install the nginx config

```bash
sudo cp nginx/chromeai.conf /usr/local/etc/nginx/nginx.conf
sudo nginx -t
sudo nginx -s reload
```

### 6. Load the unpacked extension

Open `chrome://extensions`, enable Developer Mode, choose `Load unpacked`, and select this project root.

### 7. Make sure Ollama is running

Examples:

```bash
ollama serve
ollama list
ollama pull qwen2.5:0.5b
```

## Validation

For a concise manual test checklist, see [VALIDATION_STEPS.md](./VALIDATION_STEPS.md).

You can also run the local service directly:

```bash
npm run validate:server
```

And verify it responds:

```bash
curl http://127.0.0.1:8083/health
```

## Notes

- The local Python service now forwards summarize, agent, and embed requests to Ollama and surfaces health information for the configured model.
- The core privacy story is local-only for the selected-text path. See [ZERO_LEAKAGE.md](./ZERO_LEAKAGE.md) for the exact claim and how to verify it.
- Privacy-first is the product thesis, not a side feature.
- Runtime JavaScript is generated from the `.ts` sources with `npm run build`.
- The project is best presented as a focused selected-text MVP, not as a polished all-in-one browser assistant.
