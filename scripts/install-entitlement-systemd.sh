#!/bin/sh
set -eu

[ "$(id -u)" -eq 0 ] || {
  echo "Run this installer as root." >&2
  exit 1
}

ROOT="$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/selectpilot-entitlement
UNIT_SOURCE="$ROOT/services/entitlement-authority/selectpilot-entitlement.service"
UNIT_TARGET=/etc/systemd/system/selectpilot-entitlement.service

for secret_file in \
  /etc/selectpilot/secrets/entitlement-ed25519.pem \
  /etc/selectpilot/secrets/entitlement-public-keys.json \
  /etc/selectpilot/secrets/paddle-webhook-secret \
  /etc/selectpilot/secrets/paddle-price-map.json
do
  [ -s "$secret_file" ] || {
    echo "Required production credential is missing." >&2
    exit 1
  }
  [ "$(stat -c '%a' "$secret_file")" = "600" ] || {
    echo "Production credentials must use mode 0600." >&2
    exit 1
  }
done

if ss -ltn | awk '{print $4}' | grep -Eq '(^|:)8091$'; then
  echo "Loopback port 8091 is already in use." >&2
  exit 1
fi

SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE=/etc/selectpilot/secrets/entitlement-ed25519.pem \
SELECTPILOT_ENTITLEMENT_PUBLIC_KEYS_FILE=/etc/selectpilot/secrets/entitlement-public-keys.json \
  node "$ROOT/scripts/verify-entitlement-key.mjs"

install -d -o root -g root -m 0755 "$APP_DIR"
install -o root -g root -m 0644 "$ROOT/services/entitlement-authority/server.mjs" "$APP_DIR/server.mjs"
install -o root -g root -m 0644 "$UNIT_SOURCE" "$UNIT_TARGET"
systemd-analyze verify "$UNIT_TARGET"
systemctl daemon-reload
systemctl enable --now selectpilot-entitlement.service
systemctl is-active --quiet selectpilot-entitlement.service
curl --fail --silent --show-error http://127.0.0.1:8091/health >/dev/null
echo "SelectPilot entitlement authority is active on 127.0.0.1:8091."
