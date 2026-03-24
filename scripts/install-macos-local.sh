#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/launchd/com.chromeai.nano.plist"
DEST="${HOME}/Library/LaunchAgents/com.chromeai.nano.plist"
HASH="$(shasum -a 256 "$ROOT/server/nano_server.py" | awk '{print $1}')"
OLLAMA_BASE_URL="${CHROMEAI_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${CHROMEAI_OLLAMA_MODEL:-qwen2.5:0.5b}"
OLLAMA_EMBED_MODEL="${CHROMEAI_OLLAMA_EMBED_MODEL:-nomic-embed-text-v2-moe:latest}"
RUN_DIR="${CHROMEAI_RUN_DIR:-${HOME}/Library/Application Support/SelectPilot/run}"
LOG_DIR="${CHROMEAI_LOG_DIR:-${HOME}/Library/Logs/SelectPilot}"

mkdir -p "${HOME}/Library/LaunchAgents"
mkdir -p "$RUN_DIR" "$LOG_DIR"

sed \
  -e "s|__PROJECT_ROOT__|$ROOT|g" \
  -e "s|__RUN_DIR__|$RUN_DIR|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
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
  1. Load the unpacked extension from:
     $ROOT
  2. Current Ollama base URL: $OLLAMA_BASE_URL
  3. Current Ollama model: $OLLAMA_MODEL
  4. Local bridge URL: http://127.0.0.1:8083
  5. Run dir: $RUN_DIR
  6. Log dir: $LOG_DIR
  7. Run 'pnpm benchmark:local' to validate latency on this machine.
EOF
