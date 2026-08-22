"""module_name: entitlement_signer_tests; spec_ref: "testing_strategy.integration_tests"."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from entitlement_signer import EntitlementSigner, SigningError, canonical_entitlement  # noqa: E402


class EntitlementSignerTests(unittest.TestCase):
    entitlement = {
        "token": "opaque-token",
        "tier": "pro",
        "features": ["image_ocr"],
        "issuedAt": 1_700_000_000_000,
        "expiresAt": 1_700_086_400_000,
    }

    def test_unconfigured_signer_fails_closed(self) -> None:
        with self.assertRaises(SigningError) as ctx:
            EntitlementSigner("", "").sign(self.entitlement)
        self.assertEqual(str(ctx.exception), "entitlement_signer_not_configured")

    def test_ephemeral_ed25519_identity_signs_exact_canonical_payload(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            key_file = Path(directory) / "signer.pem"
            public_file = Path(directory) / "signer-public.pem"
            subprocess.run(["openssl", "genpkey", "-algorithm", "Ed25519", "-out", key_file], check=True)
            subprocess.run(["openssl", "pkey", "-in", key_file, "-pubout", "-out", public_file], check=True)

            signed = EntitlementSigner(str(key_file), "test-rotation-1").sign(self.entitlement)
            signature_file = Path(directory) / "signature.bin"
            payload_file = Path(directory) / "payload.json"
            import base64
            signature_file.write_bytes(base64.b64decode(signed["signature"]))
            payload_file.write_bytes(canonical_entitlement(self.entitlement))
            verified = subprocess.run(
                ["openssl", "pkeyutl", "-verify", "-rawin", "-pubin", "-inkey", public_file,
                 "-sigfile", signature_file, "-in", payload_file],
                capture_output=True,
                check=False,
            )
        self.assertEqual(verified.returncode, 0)
        self.assertEqual(signed["alg"], "Ed25519")
        self.assertEqual(signed["kid"], "test-rotation-1")


if __name__ == "__main__":
    unittest.main()
