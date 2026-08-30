#!/bin/sh
set -eu

ROOT="$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/services/entitlement-authority/compose.yaml"
ENV_FILE="${1:-$ROOT/services/entitlement-authority/.env}"

fail() {
  printf 'Preflight failed: %s\n' "$1" >&2
  exit 1
}

[ -f "$ENV_FILE" ] || fail "missing environment file"
set -a
# The deployment environment file contains paths and scalar configuration only.
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

for name in \
  SELECTPILOT_UID \
  SELECTPILOT_GID \
  SELECTPILOT_AUTHORITY_HOST_PORT \
  SELECTPILOT_ENTITLEMENT_KEY_ID \
  SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE \
  SELECTPILOT_PADDLE_WEBHOOK_SECRET_FILE \
  SELECTPILOT_PADDLE_PRICE_MAP_FILE \
  SELECTPILOT_STATE_DIR
do
  eval "value=\${$name:-}"
  [ -n "$value" ] || fail "missing $name"
done

case "$SELECTPILOT_AUTHORITY_HOST_PORT" in
  ''|*[!0-9]*) fail "authority host port must be numeric" ;;
esac
if [ "$SELECTPILOT_AUTHORITY_HOST_PORT" -lt 1024 ] || [ "$SELECTPILOT_AUTHORITY_HOST_PORT" -gt 65535 ]; then
  fail "authority host port must be between 1024 and 65535"
fi

file_mode() {
  if [ "$(uname -s)" = "Darwin" ]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

file_owner() {
  if [ "$(uname -s)" = "Darwin" ]; then
    stat -f '%u:%g' "$1"
  else
    stat -c '%u:%g' "$1"
  fi
}

for secret_file in \
  "$SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE" \
  "$SELECTPILOT_PADDLE_WEBHOOK_SECRET_FILE" \
  "$SELECTPILOT_PADDLE_PRICE_MAP_FILE"
do
  [ -f "$secret_file" ] || fail "required secret file is missing"
  [ -s "$secret_file" ] || fail "required secret file is empty"
  [ "$(file_mode "$secret_file")" = "600" ] || fail "secret files must use mode 0600"
done

[ -d "$SELECTPILOT_STATE_DIR" ] || fail "state directory is missing"
[ "$(file_mode "$SELECTPILOT_STATE_DIR")" = "700" ] || fail "state directory must use mode 0700"
[ "$(file_owner "$SELECTPILOT_STATE_DIR")" = "$SELECTPILOT_UID:$SELECTPILOT_GID" ] \
  || fail "state directory ownership does not match SELECTPILOT_UID:SELECTPILOT_GID"

if command -v ss >/dev/null 2>&1 && ss -ltn | awk '{print $4}' | grep -Eq "(^|:)$SELECTPILOT_AUTHORITY_HOST_PORT$"; then
  fail "authority host port is already in use"
fi

node - "$SELECTPILOT_PADDLE_PRICE_MAP_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
const path = process.argv[2];
const map = JSON.parse(readFileSync(path, 'utf8'));
if (!map.__trial__ || !['essential', 'plus', 'pro'].includes(map.__trial__.tier)) process.exit(1);
for (const [id, entry] of Object.entries(map)) {
  if (id !== '__trial__' && !/^pri_[A-Za-z0-9]+$/.test(id)) process.exit(1);
  if (!['essential', 'plus', 'pro'].includes(entry?.tier) || !Array.isArray(entry.features)) process.exit(1);
}
NODE

SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE="$SELECTPILOT_ENTITLEMENT_PRIVATE_KEY_FILE" \
  node "$ROOT/scripts/verify-entitlement-key.mjs"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
printf 'SelectPilot entitlement deployment preflight passed on loopback port %s.\n' "$SELECTPILOT_AUTHORITY_HOST_PORT"
