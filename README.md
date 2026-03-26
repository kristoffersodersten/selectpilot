# SelectPilot

Local AI in your browser.
No data leaves your device on the core selected-text path.

Select text on any page → extract structured knowledge → export where it belongs.

Runs on local models via Ollama.

![Selection](assets/marketing/selectpilot-screenshot-extract.png)
![Runtime](assets/marketing/selectpilot-screenshot-runtime.png)
![Privacy](assets/marketing/selectpilot-screenshot-privacy.png)

---

## Why SelectPilot

Most browser AI tools send your context to external APIs.

SelectPilot is built to keep the core workflow local-first and inspectable.

- No outbound cloud inference on the core selected-text workflow
- No telemetry in runtime flow
- No API keys required for core usage
- Deterministic local boundary (`127.0.0.1` bridge + local Ollama)

---

## What it does

- Extracts structured knowledge from selected text
- Generates canonical metadata (source, intent, timestamps)
- Exports to adapter targets (e.g. Obsidian/Notion package formats)
- Uses profile-based local runtime selection (Fast / Balanced / Advanced)

---

## Quick Start

1. Install Ollama
2. Bootstrap local runtime + extension build:

```bash
pnpm setup:local
pnpm build
```

3. Load unpacked extension in `chrome://extensions`
4. Select text → open side panel → click **Extract JSON**

Optional local checks:

```bash
curl http://127.0.0.1:8083/health
pnpm test:privacy
```

---

## Architecture

Browser Extension (UI)
        ↓
Local Bridge (`127.0.0.1:8083`)
        ↓
Python Backend (`server/`)
        ↓
Ollama (local models)

- All core inference runs locally
- No external inference endpoints on core path
- Privacy boundary is observable and testable

---

## Privacy Model

- Core selected-text processing happens locally
- No outbound requests for core inference
- No tracking or telemetry in runtime flow
- Verified with privacy and E2E tests (`tests/`)

See: `ZERO_LEAKAGE.md`

---

## Core Concepts

### Canonical schema
All extracted data is normalized before export.

### Connectors (adapters)
Exports are mapped to target formats without lock-in.

### Local-first execution
Your hardware and selected profile determine latency/quality.

---

## Tiers

### Core (Essential)
- Structured extraction
- Canonical metadata
- Manual export/copy

### Connect (Plus)
- One-click connector exports
- Target-specific format adapters
- No persistent memory layer

### Knowledge (Pro / Deep)
- Explicit opt-in local memory layer
- Local embeddings/retrieval capabilities
- Inspect / export / delete retained knowledge

---

## Project Structure

- `panel/` — side panel UI and interaction flow
- `background/` — extension runtime + feature gating
- `server/` — local Python bridge and runtime endpoints
- `api/` — extension-to-local-bridge client layer
- `tests/` — E2E + privacy/no-leakage tests

---

## What SelectPilot is

- Local inference interface for selected text
- Structured extraction engine with canonical output
- Adapter-based export pipeline

## What SelectPilot is not

- Cloud AI wrapper
- Generic chatbot platform
- Telemetry-driven data-harvesting tool

---

## Status

Active development.
Core local pipeline is functional and test-backed.
Current focus: stability, deterministic structure, and trust consistency.

---

## Repository

https://github.com/kristoffersodersten/selectpilot
