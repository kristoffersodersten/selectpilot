#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/launchd/com.chromeai.nano.plist"
DEST="${HOME}/Library/LaunchAgents/com.chromeai.nano.plist"
HASH="$(shasum -a 256 "$ROOT/server/nano_server.py" | awk '{print $1}')"
OLLAMA_BASE_URL="${CHROMEAI_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${CHROMEAI_OLLAMA_MODEL:-llama3.2}"
OLLAMA_EMBED_MODEL="${CHROMEAI_OLLAMA_EMBED_MODEL:-nomic-embed-text-v2-moe:latest}"

mkdir -p "${HOME}/Library/LaunchAgents"

sed \
  -e "s|__PROJECT_ROOT__|$ROOT|g" \
  -e "s|__BINARY_HASH__|$HASH|g" \
  -e "s|__OLLAMA_BASE_URL__|$OLLAMA_BASE_URL|g" \
  -e "s|__OLLAMA_MODEL__|$OLLAMA_MODEL|g" \
  -e "s|__OLLAMA_EMBED_MODEL__|$OLLAMA_EMBED_MODEL|g" \
  "$TEMPLATE" > "$DEST"

launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"

cat <<EOF
Installed LaunchAgent:
  $DEST

Next steps:
  1. Add '127.0.0.1 chromeai.local' to /etc/hosts if it does not already exist.
  2. Copy nginx/chromeai.conf to your nginx config and reload nginx.
  3. Load the unpacked extension from:
     $ROOT
  4. Current Ollama base URL: $OLLAMA_BASE_URL
  5. Current Ollama model: $OLLAMA_MODEL
EOF
