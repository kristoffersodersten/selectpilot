# 60-90 Second Demo Script

## Goal

Show that the product is a privacy-first local execution layer for selected text and that the privacy boundary is concrete, not marketing copy.

## Demo flow

1. Open Ollama and confirm a local model is installed.
   - Show `ollama list`
   - Point out the local generation model, for example `qwen2.5:0.5b`

2. Start the local bridge and show health.
   - Run the bridge
   - Open `/health`
   - Highlight:
     - `privacy_mode: "local-only"`
     - `active_model`
     - `ignored_remote_models`

3. Open the extension on a real page.
   - Highlight a paragraph
   - Open the side panel
   - Click `Extract JSON`
   - Pick `Action Brief` or `Job Brief`

4. Show the result.
   - Call out that the output came from the local model
   - Show the Markdown and JSON panes
   - Repeat with `Rewrite` or `Ask Ollama`

5. Show the network boundary.
   - Open DevTools Network
   - Filter for `chromeai.local`
   - Point out that the extension talks to the local bridge only

## Suggested narration

“SelectPilot is a privacy-first local execution layer for selected text. I highlight something on the web, open the side panel, and turn that selection into structured output using Ollama on my own machine. The bridge explicitly ignores Ollama cloud models, which you can verify in the health output. The extension talks only to `chromeai.local`, so the selected-text path stays on-device by design.”

## What not to claim

- Do not say the whole project is a formal security product.
- Do not say every feature is production-ready.
- Do not say audio and vision are part of the zero-leakage proof.

## Best artifacts to attach

- Repo link
- 60-90 second screen recording
- Screenshot of `/health`
- Screenshot of DevTools Network filtered to `chromeai.local`
