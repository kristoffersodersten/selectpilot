"""module_name: entitlement_signer; spec_ref: "validation_layer"."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


class SigningError(RuntimeError):
    """Explicit fail-closed entitlement signing failure."""


def canonical_entitlement(entitlement: dict) -> bytes:
    return json.dumps(
        {
            "token": entitlement["token"],
            "tier": entitlement["tier"],
            "features": entitlement.get("features") or [],
            "issuedAt": entitlement["issuedAt"],
            "expiresAt": entitlement.get("expiresAt"),
        },
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


@dataclass(frozen=True)
class EntitlementSigner:
    key_file: str
    key_id: str

    @classmethod
    def from_environment(cls) -> "EntitlementSigner":
        return cls(
            key_file=os.environ.get("SELECTPILOT_ENTITLEMENT_SIGNING_KEY_FILE", ""),
            key_id=os.environ.get("SELECTPILOT_ENTITLEMENT_SIGNING_KEY_ID", ""),
        )

    def sign(self, entitlement: dict) -> dict:
        if not self.key_file or not self.key_id:
            raise SigningError("entitlement_signer_not_configured")
        key_path = Path(self.key_file)
        if not key_path.is_file():
            raise SigningError("entitlement_signing_key_unavailable")
        try:
            with tempfile.NamedTemporaryFile() as payload_file:
                payload_file.write(canonical_entitlement(entitlement))
                payload_file.flush()
                result = subprocess.run(
                    ["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", str(key_path), "-in", payload_file.name],
                    capture_output=True,
                    check=False,
                    timeout=5,
                )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise SigningError("entitlement_signing_failed") from exc
        if result.returncode != 0 or len(result.stdout) != 64:
            raise SigningError("entitlement_signing_failed")
        return {
            "entitlement": entitlement,
            "signature": base64.b64encode(result.stdout).decode("ascii"),
            "alg": "Ed25519",
            "kid": self.key_id,
        }
