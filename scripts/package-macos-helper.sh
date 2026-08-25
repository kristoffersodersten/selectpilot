#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
STAGE="$ROOT/dist/macos-helper/payload"
OUTPUT="$ROOT/dist/macos-helper/SelectPilot-Installer-unsigned.pkg"
SIGNED="$ROOT/dist/macos-helper/SelectPilot-Installer.pkg"
INSTALL_ROOT="$STAGE/Library/Application Support/SelectPilot"

rm -rf "$ROOT/dist/macos-helper"
mkdir -p "$INSTALL_ROOT" "$INSTALL_ROOT/launchd"
for source_dir in server presets runtime; do
  find "$ROOT/$source_dir" -type f \( -name '*.py' -o -name '*.json' \) | while IFS= read -r source; do
    relative="${source#"$ROOT/"}"
    destination="$INSTALL_ROOT/$relative"
    mkdir -p "$(dirname "$destination")"
    cp "$source" "$destination"
  done
done
cp "$ROOT/installer/macos/com.selectpilot.bridge.plist.template" "$INSTALL_ROOT/launchd/"
chmod 755 "$ROOT/installer/macos/scripts/postinstall"

pkgbuild \
  --root "$STAGE" \
  --scripts "$ROOT/installer/macos/scripts" \
  --identifier com.selectpilot.helper \
  --version "$(node -p "require('$ROOT/package.json').version")" \
  --install-location / \
  "$OUTPUT"

if [ -n "${SELECTPILOT_INSTALLER_SIGN_IDENTITY:-}" ]; then
  productsign --sign "$SELECTPILOT_INSTALLER_SIGN_IDENTITY" "$OUTPUT" "$SIGNED"
  pkgutil --check-signature "$SIGNED"
  printf '%s\n' "$SIGNED"
else
  printf '%s\n' "$OUTPUT"
fi
