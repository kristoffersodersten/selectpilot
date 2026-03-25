#!/usr/bin/env bash
# Bootstrap SelectPilot on Linux or inside a dev container.
# Usage: bash scripts/bootstrap-linux.sh [--profile auto|<name>] [--skip-ollama-install] [--skip-model-pull]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="auto"
SKIP_OLLAMA_INSTALL="0"
SKIP_MODEL_PULL="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      PROFILE="${2:-auto}"
      shift 2
      ;;
    --skip-ollama-install)
      SKIP_OLLAMA_INSTALL="1"
      shift
      ;;
    --skip-model-pull)
      SKIP_MODEL_PULL="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This bootstrapper targets Linux / dev containers. For macOS, use bootstrap-macos-local.sh." >&2
  exit 1
fi

read_profile_json() {
  python3 - "$PROFILE" "$ROOT" <<'PY'
import json
import sys
from pathlib import Path

profile = sys.argv[1]
root = Path(sys.argv[2])
sys.path.insert(0, str(root / "server"))

from runtime_profiles import build_bootstrap_commands, get_runtime_profile, recommend_runtime_profile

recommendation = recommend_runtime_profile()
selected = recommendation["recommended_profile"] if profile == "auto" else profile
runtime_profile = get_runtime_profile(selected)
commands = build_bootstrap_commands(runtime_profile.key, root)

print(json.dumps({
    "selected_profile": runtime_profile.key,
    "label": runtime_profile.label,
    "reason": recommendation["reason"],
    "generation_model": runtime_profile.generation_model,
    "embedding_model": runtime_profile.embedding_model,
    "command": commands["command"],
}))
PY
}

PROFILE_JSON="$(read_profile_json)"
PROFILE_VARS="$(python3 - "$PROFILE_JSON" <<'PY'
import json
import shlex
import sys

payload = json.loads(sys.argv[1])
for key in ("selected_profile", "generation_model", "embedding_model", "reason"):
    print(f"{key.upper()}={shlex.quote(str(payload[key]))}")
PY
)"
eval "$PROFILE_VARS"

if [[ "$SKIP_OLLAMA_INSTALL" != "1" ]] && ! command -v ollama >/dev/null 2>&1; then
  echo "Installing Ollama..."
  curl -fsSL https://ollama.ai/install.sh | sh
fi

if ! pgrep -x "ollama" >/dev/null 2>&1; then
  echo "Starting Ollama service..."
  nohup ollama serve >/tmp/selectpilot-ollama.log 2>&1 &
  sleep 3
fi

if [[ "$SKIP_MODEL_PULL" != "1" ]]; then
  echo "Pulling generation model: $GENERATION_MODEL"
  ollama pull "$GENERATION_MODEL"
  echo "Pulling embedding model: $EMBEDDING_MODEL"
  ollama pull "$EMBEDDING_MODEL"
fi

RUN_DIR="${CHROMEAI_RUN_DIR:-${HOME}/.local/share/SelectPilot/run}"
LOG_DIR="${CHROMEAI_LOG_DIR:-${HOME}/.local/share/SelectPilot/logs}"
mkdir -p "$RUN_DIR" "$LOG_DIR"

HASH="$(sha256sum "$ROOT/server/nano_server.py" | awk '{print $1}')"
BIND="${CHROMEAI_BIND_HOST:-127.0.0.1}"
# When binding to all interfaces (0.0.0.0), display the loopback address for the
# local bridge URL as that is what the browser extension and tools use to connect.
if [[ "$BIND" == "0.0.0.0" ]]; then
  DISPLAY_URL="http://127.0.0.1:8083"
else
  DISPLAY_URL="http://${BIND}:8083"
fi

echo "Starting nano server..."
CHROMEAI_OLLAMA_MODEL="$GENERATION_MODEL" \
CHROMEAI_OLLAMA_EMBED_MODEL="$EMBEDDING_MODEL" \
  nohup python3 "$ROOT/server/nano_server.py" \
    --bind "$BIND" \
    --binary-path "$ROOT/server/nano_server.py" \
    --binary-hash "$HASH" \
    --run-dir "$RUN_DIR" \
    --log-dir "$LOG_DIR" \
    >"$LOG_DIR/nano.log" 2>"$LOG_DIR/nano.err" &

cat <<EOF

SelectPilot bootstrap complete.

Profile:           $SELECTED_PROFILE
Reason:            $REASON
Generation model:  $GENERATION_MODEL
Embedding model:   $EMBEDDING_MODEL
Run dir:           $RUN_DIR
Log dir:           $LOG_DIR
Local bridge URL:  $DISPLAY_URL

Next recommended command:
  pnpm benchmark:local
EOF
