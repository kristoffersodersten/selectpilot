"""module_name: billing_security_tests; spec_ref: "testing_strategy.integration_tests"."""

from __future__ import annotations

import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from billing_security import (  # noqa: E402
    admin_secret_matches,
    new_order_id,
    save_private_json,
    validated_wallet_rpc_url,
)


class BillingSecurityTests(unittest.TestCase):
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
