"""module_name: installation_manager_tests; spec_ref: "testing_strategy.integration_tests"."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from installation_manager import InstallationManager  # noqa: E402


class InstallationManagerTests(unittest.TestCase):
    def test_consent_is_required(self) -> None:
        manager = InstallationManager()
        with self.assertRaisesRegex(ValueError, "installation_consent_required"):
            manager.start(False)

    def test_non_macos_fails_before_work_starts(self) -> None:
        manager = InstallationManager()
        with patch("installation_manager.platform.system", return_value="Linux"):
            with self.assertRaisesRegex(RuntimeError, "macos_required"):
                manager.start(True)
        self.assertEqual(manager.status()["state"], "idle")

    def test_repeated_start_is_single_flight(self) -> None:
        manager = InstallationManager()
        manager._state["state"] = "installing"
        with patch("installation_manager.platform.system", return_value="Darwin"):
            state = manager.start(True)
        self.assertEqual(state["state"], "installing")

    def test_warmup_uses_deterministic_profile_options(self) -> None:
        response = MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        response.read.return_value = b'{"done":true}'
        with patch("installation_manager.urlopen", return_value=response) as mocked:
            InstallationManager()._warm_model("gemma4:e4b-it-qat", 32768)
        request = mocked.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["model"], "gemma4:e4b-it-qat")
        self.assertEqual(payload["options"], {
            "temperature": 0,
            "seed": 42,
            "num_ctx": 32768,
            "num_predict": 8,
        })

    def test_warmup_uses_runtime_seed_override(self) -> None:
        response = MagicMock()
        response.__enter__.return_value = response
        response.__exit__.return_value = False
        response.read.return_value = b'{"done":true}'
        with (
            patch.dict("installation_manager.os.environ", {"CHROMEAI_OLLAMA_SEED": "7"}),
            patch("installation_manager.urlopen", return_value=response) as mocked,
        ):
            InstallationManager()._warm_model("gemma4:e4b-it-qat", 32768)
        payload = json.loads(mocked.call_args.args[0].data)
        self.assertEqual(payload["options"]["seed"], 7)


if __name__ == "__main__":
    unittest.main()
