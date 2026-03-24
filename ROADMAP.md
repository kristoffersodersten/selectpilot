# SelectPilot Roadmap

SelectPilot is not trying to be a generic browser AI suite. The product thesis is narrower and stronger:

- Privacy-first utility for selected text
- Local-first by default
- Zero leakage on the core path
- Fast enough and useful enough to justify a paid upgrade

This roadmap is organized around one goal: turn the current MVP into a product that can be shipped, sold, and improved with real user feedback.

## Product Positioning

### Core promise

Highlight text on any page, open the side panel, and summarize, rewrite, or extract actions locally without sending the selected-text path to hosted inference.

### Primary user

- Privacy-conscious knowledge workers
- Developers and technical users already running Ollama
- Researchers, writers, operators, and founders who live in the browser

### Why it wins

- Faster than copy-paste into a separate app
- More private than cloud-first browser AI tools
- Narrower and easier to trust than all-purpose copilots

## Current State

### Already working

- Chrome MV3 extension shell
- Side panel workflow for selected text
- Local Ollama-backed summarize, agent, and embed flows
- Local-only boundary for the core selected-text path
- Privacy verification through `ZERO_LEAKAGE.md` and `/health`
- Prototype tiering and licensing structure

### Not ready yet

- Reliable onboarding for non-technical users
- Strong output quality controls and prompt presets
- Chrome Web Store packaging and review readiness
- Production-grade monetization and billing
- Clear retention loops like history, saved prompts, and exports
- Demo assets, screenshots, and a launch site

## Phase 1: Product Hardening

Goal: make the current MVP consistently usable by early testers.

### Must ship

- First-run runtime bootstrap with `Detect -> Install -> Benchmark -> Assign profile`
- Profile presets for `Fast`, `Balanced`, and `Advanced`
- Smallest-viable-model selection for the selected-text workload
- Improve selected-text capture reliability across more sites
- Add loading, error, and empty-state handling for all core actions
- Add visible Ollama status in the side panel
- Add first-run checks for:
  - Ollama reachable
  - local model available
  - local bridge reachable at `127.0.0.1:8083`
- Normalize output formatting for summarize, rewrite, and action extraction
- Add preset prompts for:
  - summarize
  - rewrite shorter
  - rewrite clearer
  - extract actions
  - extract decisions

### Privacy hardening

- Make privacy mode visible in UI
- Add a settings page section called `Privacy Boundary`
- Add a `local-only` indicator and a degraded-state warning if no local model is available
- Refuse core execution when only cloud Ollama models are present
- Keep profile selection and benchmark interpretation on-device

### Exit criteria

- A new tester can install and use the selected-text flow without repo spelunking
- The product fails clearly, not silently
- Privacy-first behavior is visible in both UI and docs
- The default Fast profile is usable on modest hardware without manual tuning

## Phase 2: Paid Utility Foundations

Goal: add the minimum feature set needed for a real free-to-paid product.

### Free tier

- Summarize selected text
- Rewrite selected text
- Extract action items
- Basic local prompt editing

### Paid tier

- Saved prompts
- Prompt presets library
- Output history
- Export options:
  - Markdown
  - Notion-friendly copy
  - Obsidian-friendly copy
- Workflow presets
- Better rewrite modes:
  - concise
  - executive
  - friendly
  - technical

### Billing and licensing

- Replace prototype billing assumptions with one real payment flow
- Add entitlement sync and tier enforcement that survives restart and offline use gracefully
- Add upgrade UI inside the extension
- Add trial logic that is obvious and fair

### Exit criteria

- There is a clear free tier and a clear reason to upgrade
- Paid features are product features, not arbitrary locks
- A user can upgrade without contacting you manually

## Phase 3: UX and Retention

Goal: make the product something users come back to, not just try once.

### Features

- Output history with search
- Favorite prompts
- One-click rerun on the same selection
- Better copy/export actions
- Recent pages and recent transforms
- Keyboard shortcuts
- Optional mini floating action after text selection

### Quality improvements

- Better default prompts per task
- Better markdown rendering in the panel
- Cleaner output cards
- Model-specific tuning for smaller local models

### Retention loops

- Saved workflows
- History
- Repeatable transforms
- Reliable outputs on daily browsing tasks

### Exit criteria

- Users have a reason to return weekly
- Core transforms feel fast and predictable
- The extension feels like a tool, not a demo

## Phase 4: Chrome Web Store Launch

Goal: package SelectPilot as a credible public product.

### Store readiness

- Final icons and screenshots
- Short and long store descriptions
- Privacy section aligned with `ZERO_LEAKAGE.md`
- Onboarding page
- FAQ
- Support email and support page
- Terms and privacy page

### Launch assets

- 60-90 second product demo
- Landing page with:
  - headline
  - zero-leakage explanation
  - screenshots
  - pricing
  - FAQ
- A short launch thread for:
  - X
  - Reddit
  - Hacker News
  - Discord communities

### Exit criteria

- Extension is ready for store review
- Public messaging is consistent across repo, store, and landing page
- Privacy-first claim is clear and defensible

## Phase 5: Distribution and Growth

Goal: find the first repeatable acquisition channel.

### Likely channels

- Privacy and local-AI communities
- Ollama and self-hosting communities
- Productivity and note-taking communities
- Founder/dev Twitter
- Chrome extension directories

### Content strategy

- `Why local-first matters for browser AI`
- `How SelectPilot avoids cloud leakage on the selected-text path`
- `Best local Ollama models for browser-side text transforms`
- Build-in-public updates with metrics and lessons

### Growth experiments

- Free prompt pack as lead magnet
- Comparison pages vs cloud-first browser AI tools
- Launch to niche communities before broad launch
- Use-case pages for:
  - founders
  - researchers
  - writers
  - developers

### Exit criteria

- One acquisition source reliably brings qualified users
- You understand which user segment converts best
- Messaging is validated by actual signups and activation

## Phase 6: Expansion Without Dilution

Goal: expand carefully without breaking the privacy-first thesis.

### Good expansions

- Better export destinations
- Better workflow presets
- Team-safe prompt packs
- Improved local model compatibility
- Optional local document memory

### Risky expansions

- Generic page chat
- Broad multimodal promises before core text utility is excellent
- Cloud fallback by default
- Enterprise complexity too early

### Rule

Do not expand beyond selected-text utility until the paid core is clearly working.

## Metrics

### Product

- Install to first successful transform
- Time to first successful summary
- Percentage of users who complete local setup
- Percentage of users who hit degraded privacy state

### Retention

- Weekly active users
- Transforms per active user
- Saved prompts per active user
- History usage rate

### Revenue

- Free to paid conversion
- Trial to paid conversion
- Average revenue per paid user
- Churn after first payment

## Immediate Next 30 Days

### Week 1

- Tighten install and onboarding
- Add settings page
- Add privacy boundary indicator in UI
- Record product demo

### Week 2

- Add saved prompts
- Add history
- Improve output quality and formatting
- Prepare Chrome Web Store assets

### Week 3

- Implement real upgrade flow
- Add pricing page or landing page
- Start onboarding first private testers

### Week 4

- Fix onboarding friction from tester feedback
- Publish store listing or waitlist
- Post launch content in 3 to 5 relevant communities

## What Not To Do

- Do not turn this into a broad AI browser assistant too early
- Do not lead with experimental audio or vision features
- Do not weaken the privacy story with ambiguous cloud behavior
- Do not ship pricing before the core workflow feels good
- Do not optimize for scale before you have proof of demand

## One-Sentence Strategy

Build the best privacy-first selected-text copilot for people who already want browser AI utility but do not want their text leaving the machine.
