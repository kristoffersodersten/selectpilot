# Security Policy

SelectPilot is a privacy-first local execution layer for selected text. The core security model is simple: selected text, prompts, and model responses never leave the device on the core path. This document explains how to report vulnerabilities, what the privacy boundary covers, and what sits outside it.

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest (`main`) | Yes |
| Older branches | No |

Only the current `main` branch receives security fixes.

## Reporting a vulnerability

Do **not** open a public GitHub issue for security or privacy vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/kristoffersodersten/selectpilot/security) of this repository.
2. Click **"Report a vulnerability"**.
3. Describe the issue with as much detail as possible (see checklist below).

You will receive an acknowledgement within **72 hours** and a status update within **7 days**.

### What to include in your report

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce, including browser version, OS, SelectPilot version, and Ollama model used.
- Whether the issue affects the privacy boundary (data leaving the device) or another attack surface.
- Any proof-of-concept code or network captures, with sensitive data removed.
- Whether you believe a fix is straightforward or requires architectural changes.

## Privacy boundary

The following is the core security guarantee of SelectPilot. See `ZERO_LEAKAGE.md` for the full spec and verification steps.

### What never leaves the device by default

- Selected page text.
- Page URLs and titles used in the selected-text workflow.
- Prompt text entered in the side panel.
- Model responses and embeddings.
- Telemetry, analytics events, or usage logs.

### Allowed network boundary

- The extension talks only to `http://127.0.0.1:8083` (local bridge).
- The local bridge talks only to the configured Ollama instance, defaulting to `http://127.0.0.1:11434`.
- If only cloud-hosted Ollama models are installed, the bridge reports degraded health instead of routing selected text to them.

### How to verify the boundary yourself

1. Open Chrome DevTools -> Network tab on the extension's side panel.
2. Trigger a summarize or rewrite action.
3. Confirm all requests are limited to `127.0.0.1:8083`.
4. Run `curl http://127.0.0.1:8083/health` and confirm `"privacy_mode": "local-only"` is present in the response.

## Known limitations

- `Transcribe` and `Vision OCR` are prototype utilities and are **not** covered by the core privacy boundary claim.
- Billing code exists in the repo as a prototype and is not part of the local selected-text flow.
- The local bridge (`127.0.0.1:8083`) is accessible to any process on the machine. This is an inherent trade-off of local inter-process communication.
- SelectPilot does not provide a formal security certification - the privacy boundary is implemented in code and should be treated as a clear product constraint.

## Scope

Reports are in scope if they affect:

- Data exfiltration from the core selected-text path (text, prompts, responses leaving the device).
- Privilege escalation or unexpected remote code execution via the local bridge.
- Extension manifest or permission regressions that expand the attack surface.
- Dependency vulnerabilities with a realistic exploitation path in this context.

Out of scope:

- Theoretical vulnerabilities with no realistic exploitation path.
- Issues in Ollama itself - report those to the [Ollama project](https://github.com/ollama/ollama).
- Vulnerabilities in prototype surfaces (`Transcribe`, `Vision OCR`, billing) that are clearly marked as out of scope above.

## Disclosure policy

We follow coordinated disclosure. Please give us reasonable time to investigate and issue a fix before publishing details publicly. We will credit reporters in the release notes unless you prefer to remain anonymous.

## Security-relevant files

| File | Purpose |
| ---- | ------- |
| `ZERO_LEAKAGE.md` | Full privacy boundary spec and verification steps |
| `VALIDATION_STEPS.md` | Manual test flows including network boundary checks |
| `manifest.json` | Chrome extension permissions - review for scope regressions |
