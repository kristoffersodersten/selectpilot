---
name: Bug report
about: Something is broken or behaving unexpectedly
labels: bug
---

## What happened?

<!-- A clear and concise description of the bug. -->

## Steps to reproduce

1. 
2. 
3. 

## Expected behaviour

<!-- What did you expect to happen? -->

## Actual behaviour

<!-- What actually happened? -->

## Privacy / data-flow impact

- [ ] This bug could cause selected text or prompts to leave the device
- [ ] This bug affects the local bridge or Ollama routing
- [ ] No data-flow impact - UI or functional issue only

If you checked either of the first two boxes, please consider reporting via the private channel in SECURITY.md instead.

## Environment

| Field | Value |
| ----- | ----- |
| SelectPilot version | |
| Browser & version | |
| OS | |
| Ollama version | |
| Active Ollama model | |
| Profile (Fast / Balanced / Advanced) | |

## Network boundary check

If relevant, open Chrome DevTools -> Network and confirm whether requests were limited to `127.0.0.1:8083`.

- [ ] Confirmed - all requests stayed local
- [ ] Not confirmed
- [ ] Unexpected external request observed (describe below)

## Additional context

<!-- Logs, screenshots, or anything else that helps. Remove sensitive content before posting. -->
