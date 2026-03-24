#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$ROOT/launchd/com.chromeai.nano.plist"
DEST="${HOME}/Library/LaunchAgents/com.chromeai.nano.plist"
HASH="$(shasum -a 256 "$ROOT/server/nano_server.py" | awk '{print $1}')"

mkdir -p "${HOME}/Library/LaunchAgents"

sed \
  -e "s|__PROJECT_ROOT__|$ROOT|g" \
  -e "s|__BINARY_HASH__|$HASH|g" \
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
EOF
