# 60-90 Second Demo Script

## Goal

Show that the product is a privacy-first local execution layer for selected text and that the privacy boundary is concrete, not marketing copy.

## Minimal 60-second demo narrative (recommended)

1. **Select text** on a real page.
2. Click **Extract JSON** and show structured output.
3. Click **Export** (target package, e.g. Obsidian/Notion format).
4. Show **local-only proof** (`Privacy` chip + `/health` + local network calls).

Use this exact sequence when time is short. It maps directly to product value:

- Tier 1 feeling: “it works”
- Tier 2 feeling: “it saves time”
- Trust proof: “it stays local”

## Full demo flow

1. Open Ollama and confirm a local model is installed.
   - Show `ollama list`
   - Point out the Fast profile model, for example `qwen2.5:0.5b`

2. Start the local bridge and show health.
   - Run the bridge
   - Open `/health`
   - Highlight:
     - `privacy_mode: "local-only"`
     - `active_model`
     - `ignored_remote_models`
   - Explain that the app chooses the smallest viable model for the workload, not the largest available one

3. Open the extension on a real page.
   - Highlight a paragraph
   - Open the side panel
   - Click `Extract JSON`
   - Pick `Action Brief` or `Job Brief`

4. Show the result.
   - Call out that the output came from the local model
   - Show the Markdown and JSON panes
   - Repeat with `Rewrite` or `Ask Ollama`

5. Show the benchmark boundary.
   - Explain that Fast is the default profile
   - Mention that Balanced and Advanced are opt-in if the machine needs them
   - State that the first-run path is detect, install, benchmark, assign profile

6. Show the network boundary.
   - Open DevTools Network
   - Filter for `127.0.0.1`
   - Point out that the extension talks to the local bridge only

## Suggested narration (tight)

“SelectPilot is local AI for selected text. I highlight this passage, extract canonical structured output, and export it directly to the target format. The core execution path stays local through Ollama on-device. You can verify that in the privacy indicator, `/health`, and the network log that only shows `127.0.0.1`.”

## Demo constraints (important)

- Don’t add features mid-demo.
- Don’t switch narratives between tiers.
- Keep the sequence fixed: **select → extract → export → prove local**.

## What not to claim

- Do not say the whole project is a formal security product.
- Do not say every feature is production-ready.
- Do not say audio and vision are part of the zero-leakage proof.

## Best artifacts to attach

- Repo link
- 60-90 second screen recording
- Screenshot of `/health`
- Screenshot of DevTools Network filtered to `127.0.0.1`
