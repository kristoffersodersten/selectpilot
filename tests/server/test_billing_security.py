"""module_name: billing_security_tests; spec_ref: "testing_strategy.integration_tests"."""

from __future__ import annotations

import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from billing_security import (  # noqa: E402
    admin_secret_matches,
    call_wallet_rpc,
    new_order_id,
    save_private_json,
    validated_wallet_rpc_url,
)


class BillingSecurityTests(unittest.TestCase):
    def test_wallet_rpc_uses_loopback_standard_library_request(self) -> None:
        response = io.BytesIO(
            json.dumps({"jsonrpc": "2.0", "id": "0", "result": {"height": 42}}).encode()
        )

        with patch("billing_security.urlopen", return_value=response) as request_mock:
            self.assertEqual(
                call_wallet_rpc("http://127.0.0.1:18083/json_rpc", "get_height"),
                {"height": 42},
            )

        sent_request = request_mock.call_args.args[0]
        self.assertEqual(sent_request.method, "POST")
        self.assertEqual(sent_request.full_url, "http://127.0.0.1:18083/json_rpc")
        self.assertEqual(
            json.loads(sent_request.data),
            {"jsonrpc": "2.0", "id": "0", "method": "get_height", "params": {}},
        )
        self.assertEqual(request_mock.call_args.kwargs["timeout"], 10)

    def test_wallet_rpc_is_loopback_only(self) -> None:
        self.assertEqual(
            validated_wallet_rpc_url("http://127.0.0.1:18083/json_rpc"),
            "http://127.0.0.1:18083/json_rpc",
        )
        with self.assertRaises(RuntimeError):
            validated_wallet_rpc_url("https://wallet.example/json_rpc")

    def test_order_ids_have_128_bits_of_random_material(self) -> None:
        order_id = new_order_id()
        self.assertRegex(order_id, r"^SP-[0-9a-f]{32}$")

    def test_admin_secret_requires_configured_high_entropy_value(self) -> None:
        secret = "a" * 32
        self.assertTrue(admin_secret_matches(secret, secret))
        self.assertFalse(admin_secret_matches("short", "short"))
        self.assertFalse(admin_secret_matches(secret, "b" * 32))

    def test_billing_database_is_written_owner_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "billing.json"
            save_private_json(path, {"orders": {}, "entitlements": {}})
            mode = stat.S_IMODE(os.stat(path).st_mode)
        self.assertEqual(mode, 0o600)


if __name__ == "__main__":
    unittest.main()
