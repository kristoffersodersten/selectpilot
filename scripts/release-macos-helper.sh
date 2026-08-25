#!/bin/sh
set -eu

: "${SELECTPILOT_INSTALLER_SIGN_IDENTITY:?Set the exact Developer ID Installer identity.}"
: "${SELECTPILOT_NOTARY_KEYCHAIN_PROFILE:?Set an authorized notarytool keychain profile.}"

ROOT="$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)"
SIGNED="$ROOT/dist/macos-helper/SelectPilot-Installer.pkg"

SELECTPILOT_INSTALLER_SIGN_IDENTITY="$SELECTPILOT_INSTALLER_SIGN_IDENTITY" \
  sh "$ROOT/scripts/package-macos-helper.sh"

if [ ! -f "$SIGNED" ]; then
  echo "Signed SelectPilot installer was not produced." >&2
  exit 1
fi

xcrun notarytool submit "$SIGNED" \
  --keychain-profile "$SELECTPILOT_NOTARY_KEYCHAIN_PROFILE" \
  --wait
xcrun stapler staple "$SIGNED"
xcrun stapler validate "$SIGNED"
pkgutil --check-signature "$SIGNED"
spctl --assess --type install --verbose=2 "$SIGNED"

DIGEST="$(shasum -a 256 "$SIGNED" | awk '{print $1}')"
printf '%s %s\n' "$SIGNED" "$DIGEST"
