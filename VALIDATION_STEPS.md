# Validation Steps (macOS)

## Build
- Install deps: `npm install`
- Generate runtime JS: `npm run build`
- Confirm typecheck: `npm run typecheck`

## LaunchAgent
- Install: `launchctl unload ~/Library/LaunchAgents/com.chromeai.nano.plist 2>/dev/null || true`
- Bootstrap: `npm run bootstrap:local`
- Explicit profiles: `npm run bootstrap:local -- --profile fast|balanced|advanced`
- Default profile: `Fast`
- Recommended models:
  - Generation: `qwen2.5:0.5b`
  - Embeddings: `nomic-embed-text-v2-moe:latest`
- Verify loaded: `launchctl list | grep com.chromeai.nano`
- Check logs: `tail -f /usr/local/var/log/chromeai/nano.log /usr/local/var/log/chromeai/nano.err`
- Check port file: `cat /usr/local/var/run/chromeai/port.info`
- Check listening port: `lsof -i :$(awk '{print $3}' /usr/local/var/run/chromeai/port.info 2>/dev/null | tr -dc '0-9')`

## Nginx
- Add to `/etc/hosts`: `127.0.0.1 chromeai.local`
- Copy config: `sudo cp nginx/chromeai.conf /usr/local/etc/nginx/nginx.conf`
- Test config: `sudo nginx -t`
- Restart: `sudo nginx -s reload` or `sudo nginx`
- Health check: `curl http://127.0.0.1:8083/health`
- Verify proxy: `curl -H "Origin: chrome-extension://test" http://chromeai.local/summarize -d '{"text":"hello"}' -H 'Content-Type: application/json'`

## Ollama
- Verify Ollama responds: `curl http://127.0.0.1:11434/api/tags`
- Install the Fast profile models first:
  - `npm run bootstrap:local -- --profile fast`
- If Fast is too slow or low quality, rerun with `npm run bootstrap:local -- --profile balanced`
- For heavier local reasoning, opt into `npm run bootstrap:local -- --profile advanced`

## Extension
- Load unpacked: `chrome://extensions` → enable Developer Mode → Load unpacked → select the project root.
- Open popup → open side panel.
- Highlight text on a page.
- Trigger buttons: `Extract JSON`, `Summarize`, `Rewrite`, `Action brief`, `Ask Ollama`.
- Change the extraction preset and verify the JSON pane and export buttons update.
- Use Advanced tools only for experimental Transcribe/Vision flows.
- Confirm the runtime strip shows the active model, ignored remote models, and local-only boundary.

## Endpoints direct
- Summarize: `curl http://chromeai.local/summarize -H 'Content-Type: application/json' -d '{"text":"Sample sentence one. Sample sentence two."}'`
- Extract: `curl http://chromeai.local/extract -H 'Content-Type: application/json' -d '{"preset":"action_brief","text":"Ship beta Friday. Update onboarding copy. Verify nginx config before launch.","title":"Launch prep","url":"https://example.com"}'`
- Agent: `curl http://chromeai.local/agent -H 'Content-Type: application/json' -d '{"prompt":"Rewrite this as a crisp product pitch.","context":{"selection":"A browser tool that rewrites selected text locally.","url":"https://example.com","title":"Example"}}'`
- Transcribe: `curl http://chromeai.local/transcribe -H 'Content-Type: application/json' -d '{"audioUrl":"file:///tmp/a.mp3"}'`
- Vision: `curl http://chromeai.local/vision -H 'Content-Type: application/json' -d '{"imageBase64":"abc"}'`
- Embed: `curl http://chromeai.local/embed -H 'Content-Type: application/json' -d '{"text":"embedding text"}'`
- License: `curl http://chromeai.local/license/verify -H 'Content-Type: application/json' -d '{"token":"pro-123"}'`
- Benchmark: `npm run benchmark:local`

## Monitoring
- Runtime errors: `tail -f /usr/local/var/log/chromeai/nano.err`
- Ports: `cat /usr/local/var/run/chromeai/port.info`
- Nginx access log (if enabled): `/usr/local/var/log/nginx/access.log`
- Benchmark targets for the Fast profile:
  - `Extract JSON`: should return quickly on short selections
  - `Summarize`: should feel immediate on normal paragraphs
  - `Rewrite`: should remain usable without waiting for a large-model latency profile
