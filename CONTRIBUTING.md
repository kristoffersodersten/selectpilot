# Contributing to SelectPilot

SelectPilot is a **privacy-first** local execution layer for selected text: it turns highlighted content into structured, actionable output locally in the browser via Ollama, with no cloud inference on the core path. Contributions are welcome as long as they preserve that guarantee.

## What we welcome

- Bug reports and small, focused fixes.
- Performance improvements that keep execution local and predictable.
- New transformers (summaries, rewrites, JSON structures, action flows) that run via Ollama on-device.
- Documentation and validation improvements (e.g. `VALIDATION_STEPS.md`, `DEMO_SCRIPT.md`).

If you want to propose a larger change to the architecture or UX, please open an issue first and outline the idea before sending a PR.

## Local-first & privacy rules

These are non-negotiable:

- No cloud inference on the core selected-text path.
- No telemetry, tracking, or "anonymous" analytics.
- No silent network calls for logging, monitoring, or experimentation.
- No dependencies that ship data off-device without an explicit, opt-in user action.

If your change touches data flow, clearly document where data goes and how it is handled in the PR description.

## Getting started

1. Fork the repo and create a branch from `main` (`git checkout -b feature/my-change`).
2. Install dependencies: `pnpm install` (or `npm install`).
3. Make your changes, keeping to the existing TypeScript/JS style and ESLint rules (`eslint.config.js`).
4. Run tests (if available) and manual validation steps in `VALIDATION_STEPS.md`.
5. Commit with clear messages and open a pull request against `main`.

For browser-extension-specific work (e.g. manifest, background, side panel), keep behavior minimal, explicit, and inspectable in DevTools.

## Reporting issues

Use the GitHub Issues tab for:

- Bugs in the extension or local execution behavior.
- Incorrect or unsafe model outputs that may be tied to prompts or routing.
- Privacy or data-flow concerns.

When filing an issue, please include:

- Steps to reproduce.
- Expected vs actual behavior.
- Browser version, OS, SelectPilot version, and Ollama model(s) used.

Avoid sharing sensitive content from your own browsing; anonymize where possible.

## Pull request checklist

Before requesting review, make sure:

- All tests pass and core flows in `VALIDATION_STEPS.md` work.
- No new external calls are introduced on the core path.
- User-visible changes are reflected in `README.md` or the relevant docs.
- Your PR description explains what changed, why, and how you verified it.

Link related issues in the PR description using "Closes #<number>" when appropriate.

## Code of Conduct

Please keep discussions constructive and technical. See `CODE_OF_CONDUCT.md` for the full policy.
