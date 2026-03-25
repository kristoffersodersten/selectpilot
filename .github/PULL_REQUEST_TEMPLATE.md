## What does this PR do?

<!-- A concise description of the change and why it's needed. Link the related issue if applicable. -->

Closes #

## Type of change

- [ ] Bug fix
- [ ] New transformer or prompt
- [ ] UI / side panel change
- [ ] Bridge or Ollama routing change
- [ ] Documentation
- [ ] Refactor / tech debt
- [ ] Other (describe below)

## Privacy and data-flow checklist

This is the most important section. Review carefully before submitting.

- [ ] Selected text, prompts, and model responses stay on-device on the core path
- [ ] No new external network calls are introduced on the core selected-text path
- [ ] No telemetry, analytics, or logging endpoints added
- [ ] No new permissions added to `manifest.json` (or changes are justified below)
- [ ] If a new optional external call is introduced, it requires explicit user opt-in

If any box is unchecked, explain why in the description.

## How was this tested?

- [ ] Core flows in `VALIDATION_STEPS.md` pass
- [ ] Tests pass (`pnpm test` / `npm test`)
- [ ] Manually verified in Chrome with the local bridge running
- [ ] Chrome DevTools Network tab confirms requests stay on `127.0.0.1:8083`

Describe any additional testing steps:

## Checklist

- [ ] Code follows the existing TypeScript/JS style and ESLint rules
- [ ] User-visible changes are documented in `README.md` or relevant docs
- [ ] No hardcoded secrets, tokens, or API keys
- [ ] PR is focused and does one thing - large changes are broken into smaller PRs
