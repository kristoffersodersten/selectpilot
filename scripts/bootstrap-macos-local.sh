#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="auto"
SKIP_OLLAMA_INSTALL="0"
SKIP_MODEL_PULL="0"
PLAN_ONLY="0"
BRIDGE_HEALTH_URL="http://127.0.0.1:8083/health"

STATUS_OLLAMA_INSTALL="pending"
STATUS_OLLAMA_RUNNING="pending"
STATUS_MODEL_PULL="pending"
STATUS_MODEL_WARMUP="pending"
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
    --plan)
      PLAN_ONLY="1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

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
reason = recommendation["reason"] if profile == "auto" else "Explicit profile selected by operator."

print(json.dumps({
    "selected_profile": runtime_profile.key,
    "label": runtime_profile.label,
    "reason": reason,
    "generation_model": runtime_profile.generation_model,
    "embedding_model": runtime_profile.embedding_model,
    "num_ctx": runtime_profile.num_ctx,
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
for key in ("selected_profile", "generation_model", "embedding_model", "num_ctx", "reason"):
    print(f"{key.upper()}={shlex.quote(str(payload[key]))}")
PY
)"
eval "$PROFILE_VARS"

if [[ "$PLAN_ONLY" == "1" ]]; then
  printf '%s\n' "$PROFILE_JSON"
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This bootstrapper currently supports macOS only." >&2
  exit 1
fi

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
fi

for _attempt in $(seq 1 15); do
  if curl -sSf "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
    STATUS_OLLAMA_RUNNING="ok"
    break
  fi
  sleep 1
done

if [[ "$STATUS_OLLAMA_RUNNING" != "ok" ]]; then
  STATUS_OLLAMA_RUNNING="failed"
  echo "Ollama API did not become reachable within 15 seconds." >&2
  exit 1
fi

if [[ "$SKIP_MODEL_PULL" != "1" ]]; then
  echo "Pulling generation model: $GENERATION_MODEL"
  ollama pull "$GENERATION_MODEL"
  echo "Pulling embedding model: $EMBEDDING_MODEL"
  ollama pull "$EMBEDDING_MODEL"
  STATUS_MODEL_PULL="ok"
else
  STATUS_MODEL_PULL="skipped"
fi

echo "Preparing generation model: $GENERATION_MODEL"
python3 - "$GENERATION_MODEL" "$NUM_CTX" <<'PY'
import json
import sys
from urllib.request import Request, urlopen

model = sys.argv[1]
num_ctx = int(sys.argv[2])
request = Request(
    "http://127.0.0.1:11434/api/generate",
    data=json.dumps({
        "model": model,
        "prompt": "Return only: ready",
        "stream": False,
        "keep_alive": "10m",
        "options": {
            "temperature": 0,
            "seed": 42,
            "num_ctx": num_ctx,
            "num_predict": 8,
        },
    }).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=600) as response:
    result = json.load(response)
if result.get("done") is not True:
    raise SystemExit("Generation model did not finish preparing.")
PY
STATUS_MODEL_WARMUP="ok"

CHROMEAI_OLLAMA_MODEL="$GENERATION_MODEL" \
CHROMEAI_OLLAMA_EMBED_MODEL="$EMBEDDING_MODEL" \
CHROMEAI_OLLAMA_NUM_CTX="$NUM_CTX" \
CHROMEAI_OLLAMA_SEED=42 \
"$ROOT/scripts/install-macos-local.sh"
STATUS_LAUNCHAGENT="ok"

HEALTH_JSON="$(curl -sSf "$BRIDGE_HEALTH_URL" || true)"
if python3 - "$HEALTH_JSON" <<'PY'
import json
import sys

try:
    payload = json.loads(sys.argv[1])
except (IndexError, json.JSONDecodeError):
    raise SystemExit(1)

ollama = payload.get("ollama") or {}
raise SystemExit(0 if (
    payload.get("ok") is True
    and ollama.get("reachable") is True
    and ollama.get("model_available") is True
    and ollama.get("embed_model_available") is True
) else 1)
PY
then
  STATUS_BRIDGE_HEALTH="ok"
else
  STATUS_BRIDGE_HEALTH="failed"
  echo "Local bridge is reachable but the exact configured runtime contract is not healthy." >&2
  echo "$HEALTH_JSON" >&2
  exit 1
fi

cat <<EOF

SelectPilot bootstrap complete.

Profile: $SELECTED_PROFILE
Reason: $REASON
Generation model: $GENERATION_MODEL
Embedding model: $EMBEDDING_MODEL
Context window: $NUM_CTX

Next recommended command:
  pnpm benchmark:local

Bootstrap report:
  Ollama install:  $STATUS_OLLAMA_INSTALL
  Ollama running:  $STATUS_OLLAMA_RUNNING
  Model prepared:  $STATUS_MODEL_WARMUP
  Model pull:      $STATUS_MODEL_PULL
  LaunchAgent:     $STATUS_LAUNCHAGENT
  Bridge health:   $STATUS_BRIDGE_HEALTH

If Bridge health is "failed", run:
  tail -n 80 ~/Library/Logs/SelectPilot/nano.err
  tail -n 80 ~/Library/Logs/SelectPilot/nano.log
  curl -v $BRIDGE_HEALTH_URL
EOF
