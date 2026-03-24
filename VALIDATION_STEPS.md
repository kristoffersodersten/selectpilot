# Validation Steps (macOS)

## Build
- Install deps: `pnpm install` (or `npm install`)
- Generate runtime JS: `pnpm build`
- Confirm typecheck: `pnpm typecheck`

## LaunchAgent
- Install: `launchctl unload ~/Library/LaunchAgents/com.chromeai.nano.plist 2>/dev/null || true`
- Bootstrap: `pnpm bootstrap:local`
- Explicit profiles: `pnpm bootstrap:local -- --profile fast|balanced|advanced`
- Default profile: `Fast`
- Recommended models:
  - Generation: `qwen2.5:0.5b`
  - Embeddings: `nomic-embed-text-v2-moe:latest`
- Verify loaded: `launchctl list | grep com.chromeai.nano`
- Check logs: `tail -f ~/Library/Logs/SelectPilot/nano.log ~/Library/Logs/SelectPilot/nano.err`
- Check port file: `cat ~/Library/Application\ Support/SelectPilot/run/port.info`
- Check listening port: `lsof -i :8083`
- Health check: `curl http://127.0.0.1:8083/health`
- Verify local bridge: `curl -H "Origin: chrome-extension://test" http://127.0.0.1:8083/summarize -d '{"text":"hello"}' -H 'Content-Type: application/json'`

## Ollama
- Verify Ollama responds: `curl http://127.0.0.1:11434/api/tags`
- Install the Fast profile models first:
  - `pnpm bootstrap:local -- --profile fast`
- If Fast is too slow or low quality, rerun with `pnpm bootstrap:local -- --profile balanced`
- For heavier local reasoning, opt into `pnpm bootstrap:local -- --profile advanced`

## Extension
- Load unpacked: `chrome://extensions` → enable Developer Mode → Load unpacked → select the project root.
- Open popup → open side panel.
- Highlight text on a page.
- Trigger buttons: `Extract JSON`, `Summarize`, `Rewrite`, `Action brief`, `Ask Ollama`.
- Change the extraction preset and verify the JSON pane and export buttons update.
- Use Advanced tools only for experimental Transcribe/Vision flows.
- Confirm the runtime strip shows the active model, ignored remote models, and local-only boundary.

## Endpoints direct
- Summarize: `curl http://127.0.0.1:8083/summarize -H 'Content-Type: application/json' -d '{"text":"Sample sentence one. Sample sentence two."}'`
- Extract: `curl http://127.0.0.1:8083/extract -H 'Content-Type: application/json' -d '{"preset":"action_brief","text":"Ship beta Friday. Update onboarding copy. Validate launch copy before publishing.","title":"Launch prep","url":"https://example.com"}'`
- Agent: `curl http://127.0.0.1:8083/agent -H 'Content-Type: application/json' -d '{"prompt":"Rewrite this as a crisp product pitch.","context":{"selection":"A browser tool that rewrites selected text locally.","url":"https://example.com","title":"Example"}}'`
- Transcribe: `curl http://127.0.0.1:8083/transcribe -H 'Content-Type: application/json' -d '{"audioUrl":"file:///tmp/a.mp3"}'`
- Vision: `curl http://127.0.0.1:8083/vision -H 'Content-Type: application/json' -d '{"imageBase64":"abc"}'`
- Embed: `curl http://127.0.0.1:8083/embed -H 'Content-Type: application/json' -d '{"text":"embedding text"}'`
- License: `curl http://127.0.0.1:8083/license/verify -H 'Content-Type: application/json' -d '{"token":"pro-123"}'`
- Benchmark: `pnpm benchmark:local`

## Monitoring
- Runtime errors: `tail -f ~/Library/Logs/SelectPilot/nano.err`
- Ports: `cat ~/Library/Application\ Support/SelectPilot/run/port.info`
- Benchmark targets for the Fast profile:
  - `Extract JSON`: should return quickly on short selections
  - `Summarize`: should feel immediate on normal paragraphs
  - `Rewrite`: should remain usable without waiting for a large-model latency profile
