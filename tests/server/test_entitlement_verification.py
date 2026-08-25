"""module_name: entitlement_verification_tests; spec_ref: "testing_strategy.integration_tests"."""

from __future__ import annotations

import io
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from nano_server import ValidationError, license_verify  # noqa: E402


class _Response:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self) -> bytes:
        return self.body


class EntitlementVerificationTests(unittest.TestCase):
    def test_pro_substring_cannot_grant_entitlement_without_authority(self) -> None:
        with patch("nano_server.urlopen", side_effect=URLError("offline")):
            with self.assertRaises(ValidationError) as ctx:
                license_verify({"token": "anything-pro-anything"})
        self.assertEqual(ctx.exception.status, 503)

    def test_invalid_authority_token_remains_unauthorized(self) -> None:
        error = HTTPError("http://127.0.0.1:8090/license/verify", 401, "invalid", {}, io.BytesIO())
        with patch("nano_server.urlopen", side_effect=error):
            with self.assertRaises(ValidationError) as ctx:
                license_verify({"token": "invalid"})
        self.assertEqual(ctx.exception.status, 401)

    def test_verified_local_authority_response_is_returned(self) -> None:
        response = _Response(
            b'{"entitlement":{"token":"opaque-token","tier":"pro","features":["extract"],'
            b'"issuedAt":1700000000000,"expiresAt":null},"signature":"c2ln",'
            b'"alg":"Ed25519","kid":"prod-1"}'
        )
        with patch("nano_server.urlopen", return_value=response):
            result = license_verify({"token": "opaque-token"})
        self.assertEqual(result["entitlement"]["tier"], "pro")

    def test_insecure_remote_verifier_configuration_is_rejected(self) -> None:
        with patch.dict(os.environ, {"SELECTPILOT_ENTITLEMENT_AUTHORITY_URL": "http://example.com"}):
            with self.assertRaises(ValidationError) as ctx:
                license_verify({"token": "opaque-token"})
        self.assertEqual(ctx.exception.code, "invalid_entitlement_verifier")

    def test_https_authority_is_allowed(self) -> None:
        response = _Response(
            b'{"entitlement":{"token":"opaque-token","tier":"plus","features":[],'
            b'"issuedAt":1700000000000,"expiresAt":null},"signature":"c2ln",'
            b'"alg":"Ed25519","kid":"prod-1"}'
        )
        with patch.dict(os.environ, {"SELECTPILOT_ENTITLEMENT_AUTHORITY_URL": "https://license.selectpilot.app"}):
            with patch("nano_server.urlopen", return_value=response) as request:
                license_verify({"token": "opaque-token"})
        self.assertEqual(request.call_args.args[0].full_url, "https://license.selectpilot.app/v1/entitlements/verify")

    def test_malformed_authority_response_is_rejected(self) -> None:
        response = _Response(
            b'{"entitlement":{"token":"opaque-token","tier":"pro","issuedAt":"not-a-timestamp"},'
            b'"signature":"bad","alg":"Ed25519","kid":"rotation-1"}'
        )
        with patch("nano_server.urlopen", return_value=response):
            with self.assertRaises(ValidationError) as ctx:
                license_verify({"token": "opaque-token"})
        self.assertEqual(ctx.exception.code, "invalid_entitlement_response")


if __name__ == "__main__":
    unittest.main()
