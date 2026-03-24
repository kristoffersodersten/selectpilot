# Validation Steps (macOS)

## Build
- Install deps: `npm install`
- Generate runtime JS: `npm run build`

## LaunchAgent
- Install: `launchctl unload ~/Library/LaunchAgents/com.chromeai.nano.plist 2>/dev/null || true`
- Install script: `./scripts/install-macos-local.sh`
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

## Extension
- Load unpacked: `chrome://extensions` → enable Developer Mode → Load unpacked → select the project root.
- Open popup → open side panel.
- Trigger buttons: Summarize, Transcribe (with <audio> on page), Vision (with image/video), Agent.

## Endpoints direct
- Summarize: `curl http://chromeai.local/summarize -H 'Content-Type: application/json' -d '{"text":"Sample sentence one. Sample sentence two."}'`
- Transcribe: `curl http://chromeai.local/transcribe -H 'Content-Type: application/json' -d '{"audioUrl":"file:///tmp/a.mp3"}'`
- Vision: `curl http://chromeai.local/vision -H 'Content-Type: application/json' -d '{"imageBase64":"abc"}'`
- Embed: `curl http://chromeai.local/embed -H 'Content-Type: application/json' -d '{"text":"embedding text"}'`
- Agent: `curl http://chromeai.local/agent -H 'Content-Type: application/json' -d '{"prompt":"do it","context":{"foo":"bar"}}'`
- License: `curl http://chromeai.local/license/verify -H 'Content-Type: application/json' -d '{"token":"pro-123"}'`

## Monitoring
- Runtime errors: `tail -f /usr/local/var/log/chromeai/nano.err`
- Ports: `cat /usr/local/var/run/chromeai/port.info`
- Nginx access log (if enabled): `/usr/local/var/log/nginx/access.log`
