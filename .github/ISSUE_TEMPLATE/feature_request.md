---
name: Feature request
about: Propose a new transformer, improvement, or workflow change
labels: enhancement
---

## Summary

<!-- One sentence: what do you want SelectPilot to do that it doesn't do today? -->

## Motivation

<!-- Why is this useful? What workflow or pain point does it address? -->

## Proposed behaviour

<!-- Describe how the feature should work from the user's perspective.
Be specific: which surface (side panel, popup, background), which trigger, what output. -->

## Privacy and data-flow check

This proposal:

- [ ] Keeps all selected-text processing local via Ollama (no cloud inference on core path)
- [ ] Does not introduce new external network calls
- [ ] Introduces an optional external call with explicit user opt-in (describe below)
- [ ] I'm not sure - happy to discuss in the issue

If you selected the third option, please describe exactly what data would leave the device and why.

## Alternatives considered

<!-- What other approaches did you consider? Why is this one better? -->

## Scope estimate

- [ ] Small - a new prompt or transformer variant
- [ ] Medium - changes to the side panel UI or bridge routing
- [ ] Large - architectural change (new surface, new runtime dependency, manifest change)

## Additional context

<!-- Mockups, links, related issues, or anything else that helps. -->
