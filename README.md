# ChromeAI Extension

ChromeAI is a Chrome extension MVP for local AI-assisted browser workflows. It captures text, audio, and video context from the active tab, sends that context to a local service, and renders the results in a side panel with lightweight licensing and pricing hooks.

This is not a polished product release. It is a working prototype intended to prove end-to-end extension architecture quickly: capture, side-panel UX, local API bridge, feature gating, and early monetization concepts.

## What it does

- Summarizes selected text or page content from the active tab.
- Detects `<audio>` and `<video>` elements for transcription and frame capture flows.
- Runs an agent-style workflow from the side panel with a user-editable prompt.
- Stores license data locally and gates features by tier.
- Includes a local Python service, launchd wiring, and nginx proxy config for `http://chromeai.local`.

## Project status

- Chrome extension shell: implemented
- Side panel UI: implemented
- Content capture: implemented
- Local service layer: implemented
- Tiering and pricing model: implemented
- Billing and license verification flows: prototype
- Local AI backend: stubbed MVP, not production inference

## Repo layout

- `manifest.json`: MV3 extension manifest
- `background/`: service worker and tier gating
- `content/`: extraction helpers for text, audio, and video
- `panel/`: side panel UI
- `popup/`: popup action entrypoint
- `agent/`: agent prompt and reasoning pipeline
- `api/`: local service client
- `billing/`: Paddle checkout prototype
- `licensing/`: local license storage and verification
- `server/`: local Python service
- `launchd/`, `nginx/`: local macOS setup

## Local setup

### 1. Install dev dependencies

```bash
npm install
```

### 2. Build JavaScript from TypeScript

```bash
npm run build
```

### 3. Install the local macOS LaunchAgent

```bash
./scripts/install-macos-local.sh
```

### 4. Add the local hostname

Add this line to `/etc/hosts` if it is missing:

```text
127.0.0.1 chromeai.local
```

### 5. Install the nginx config

```bash
sudo cp nginx/chromeai.conf /usr/local/etc/nginx/nginx.conf
sudo nginx -t
sudo nginx -s reload
```

### 6. Load the unpacked extension

Open `chrome://extensions`, enable Developer Mode, choose `Load unpacked`, and select this project root.

## Validation

For a concise manual test checklist, see [VALIDATION_STEPS.md](./VALIDATION_STEPS.md).

You can also run the local service directly:

```bash
npm run validate:server
```

And verify it responds:

```bash
curl http://127.0.0.1:8083/health
```

## Notes

- The local Python service currently returns deterministic prototype responses. It is intentionally lightweight so the extension workflow can be exercised without a full inference stack.
- Runtime JavaScript is generated from the `.ts` sources with `npm run build`.
- The project is best presented as an MVP or prototype, not as a production-ready extension.
