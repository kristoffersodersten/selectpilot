#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="auto"
SKIP_OLLAMA_INSTALL="0"
SKIP_MODEL_PULL="0"
BRIDGE_HEALTH_URL="http://127.0.0.1:8083/health"

STATUS_OLLAMA_INSTALL="pending"
STATUS_OLLAMA_RUNNING="pending"
STATUS_MODEL_PULL="pending"
STATUS_LAUNCHAGENT="pending"
STATUS_BRIDGE_HEALTH="pending"

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

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bootstrapper currently supports macOS only." >&2
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
  if command -v brew >/dev/null 2>&1; then
    echo "Installing Ollama with Homebrew..."
    brew install --cask ollama
    STATUS_OLLAMA_INSTALL="installed"
  else
    echo "Ollama is not installed and Homebrew is unavailable." >&2
    echo "Install Ollama manually, then rerun this script." >&2
    STATUS_OLLAMA_INSTALL="failed"
    exit 1
  fi
elif command -v ollama >/dev/null 2>&1; then
  STATUS_OLLAMA_INSTALL="present"
else
  STATUS_OLLAMA_INSTALL="skipped"
fi

if ! pgrep -x "ollama" >/dev/null 2>&1; then
  echo "Starting Ollama service..."
  nohup ollama serve >/tmp/selectpilot-ollama.log 2>&1 &
  sleep 3
fi

if pgrep -x "ollama" >/dev/null 2>&1; then
  STATUS_OLLAMA_RUNNING="ok"
else
  STATUS_OLLAMA_RUNNING="failed"
  echo "Ollama service did not start as expected." >&2
  exit 1
fi

if [[ "$SKIP_MODEL_PULL" != "1" ]]; then
  echo "Pulling generation model: $GEN_MODEL"
  ollama pull "$GEN_MODEL"
  echo "Pulling embedding model: $EMBED_MODEL"
  ollama pull "$EMBED_MODEL"
  STATUS_MODEL_PULL="ok"
else
  STATUS_MODEL_PULL="skipped"
fi

CHROMEAI_OLLAMA_MODEL="$GEN_MODEL" \
CHROMEAI_OLLAMA_EMBED_MODEL="$EMBED_MODEL" \
"$ROOT/scripts/install-macos-local.sh"
STATUS_LAUNCHAGENT="ok"

if curl -sSf "$BRIDGE_HEALTH_URL" >/dev/null; then
  STATUS_BRIDGE_HEALTH="ok"
else
  STATUS_BRIDGE_HEALTH="failed"
fi

cat <<EOF

SelectPilot bootstrap complete.

Profile: $SELECTED_PROFILE
Reason: $REASON
Generation model: $GEN_MODEL
Embedding model: $EMBED_MODEL

Next recommended command:
  pnpm benchmark:local

Bootstrap report:
  Ollama install:  $STATUS_OLLAMA_INSTALL
  Ollama running:  $STATUS_OLLAMA_RUNNING
  Model pull:      $STATUS_MODEL_PULL
  LaunchAgent:     $STATUS_LAUNCHAGENT
  Bridge health:   $STATUS_BRIDGE_HEALTH

If Bridge health is "failed", run:
  tail -n 80 ~/Library/Logs/SelectPilot/nano.err
  tail -n 80 ~/Library/Logs/SelectPilot/nano.log
  curl -v $BRIDGE_HEALTH_URL
EOF
