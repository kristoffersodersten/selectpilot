#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/launchd/com.chromeai.nano.plist"
DEST="${HOME}/Library/LaunchAgents/com.chromeai.nano.plist"
APP_DIR="${CHROMEAI_APP_DIR:-${HOME}/Library/Application Support/SelectPilot}"
INSTALL_DIR="$APP_DIR/server"
INSTALLED_BINARY="$INSTALL_DIR/nano_server.py"
RUNTIME_MODULES=(
  nano_server.py
  ollama_client.py
  extraction_presets.py
  runtime_profiles.py
)
OLLAMA_BASE_URL="${CHROMEAI_OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${CHROMEAI_OLLAMA_MODEL:-gemma4:e2b-it-qat}"
OLLAMA_FAST_MODEL="${CHROMEAI_OLLAMA_FAST_MODEL:-$OLLAMA_MODEL}"
OLLAMA_EMBED_MODEL="${CHROMEAI_OLLAMA_EMBED_MODEL:-nomic-embed-text-v2-moe:latest}"
OLLAMA_NUM_CTX="${CHROMEAI_OLLAMA_NUM_CTX:-16384}"
OLLAMA_FAST_NUM_CTX="${CHROMEAI_OLLAMA_FAST_NUM_CTX:-$OLLAMA_NUM_CTX}"
MAX_INPUT_CHARS="${CHROMEAI_MAX_INPUT_CHARS:-16000}"
OLLAMA_SEED="${CHROMEAI_OLLAMA_SEED:-42}"
RUN_DIR="${CHROMEAI_RUN_DIR:-${HOME}/Library/Application Support/SelectPilot/run}"
STATE_DIR="${CHROMEAI_RUNTIME_STATE_DIR:-${HOME}/Library/Application Support/SelectPilot/state}"
LOG_DIR="${CHROMEAI_LOG_DIR:-${HOME}/Library/Logs/SelectPilot}"
PYTHON_BIN="${CHROMEAI_PYTHON_BIN:-$(command -v python3)}"

if ! "$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)'; then
  echo "SelectPilot requires Python 3.9 or newer; found $($PYTHON_BIN --version 2>&1)." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "$INSTALL_DIR" "$APP_DIR/presets" "$APP_DIR/runtime"
mkdir -p "$RUN_DIR" "$STATE_DIR" "$LOG_DIR"

# LaunchAgents cannot reliably read repositories located in macOS privacy-
# protected folders such as Documents. Install an immutable runtime copy in
# Application Support and bind the integrity contract to that exact copy.
for module in "${RUNTIME_MODULES[@]}"; do
  install -m 0555 "$ROOT/server/$module" "$INSTALL_DIR/$module"
done
install -m 0444 "$ROOT/presets/extraction-presets.json" "$APP_DIR/presets/extraction-presets.json"
for policy in model_policy.json model_registry.runtime.json promotion_audit.json; do
  install -m 0444 "$ROOT/runtime/$policy" "$APP_DIR/runtime/$policy"
done
HASH="$(shasum -a 256 "$INSTALLED_BINARY" | awk '{print $1}')"

sed \
  -e "s|__PYTHON_BIN__|$PYTHON_BIN|g" \
  -e "s|__INSTALL_DIR__|$INSTALL_DIR|g" \
  -e "s|__INSTALLED_BINARY__|$INSTALLED_BINARY|g" \
  -e "s|__RUN_DIR__|$RUN_DIR|g" \
  -e "s|__STATE_DIR__|$STATE_DIR|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  -e "s|__BINARY_HASH__|$HASH|g" \
  -e "s|__OLLAMA_BASE_URL__|$OLLAMA_BASE_URL|g" \
  -e "s|__OLLAMA_MODEL__|$OLLAMA_MODEL|g" \
  -e "s|__OLLAMA_FAST_MODEL__|$OLLAMA_FAST_MODEL|g" \
  -e "s|__OLLAMA_EMBED_MODEL__|$OLLAMA_EMBED_MODEL|g" \
  -e "s|__OLLAMA_NUM_CTX__|$OLLAMA_NUM_CTX|g" \
  -e "s|__OLLAMA_FAST_NUM_CTX__|$OLLAMA_FAST_NUM_CTX|g" \
  -e "s|__MAX_INPUT_CHARS__|$MAX_INPUT_CHARS|g" \
  -e "s|__OLLAMA_SEED__|$OLLAMA_SEED|g" \
  "$TEMPLATE" > "$DEST"

launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"

cat <<EOF
Installed LaunchAgent:
  $DEST
Installed runtime:
  $INSTALLED_BINARY

Next steps:
  1. Load the unpacked extension from:
     $ROOT
  2. Current Ollama base URL: $OLLAMA_BASE_URL
  3. Current Ollama model: $OLLAMA_MODEL
  4. Structured-task model: $OLLAMA_FAST_MODEL
  5. Local bridge URL: http://127.0.0.1:8083
  6. Ollama context window: $OLLAMA_NUM_CTX
  7. Deterministic seed: $OLLAMA_SEED
  8. Run dir: $RUN_DIR
  9. Runtime state dir: $STATE_DIR
  10. Log dir: $LOG_DIR
  11. Run 'pnpm benchmark:local' to validate latency on this machine.
EOF
