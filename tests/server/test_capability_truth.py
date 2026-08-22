# module_name: tests_server_test_capability_truth_py
# spec_ref: "testing_strategy.integration_tests"
import sys
import unittest
from pathlib import Path


SERVER_DIR = Path(__file__).resolve().parents[2] / "server"
sys.path.insert(0, str(SERVER_DIR))

import nano_server  # noqa: E402


class CapabilityTruthTests(unittest.TestCase):
    def test_unimplemented_media_routes_are_not_admitted(self):
        self.assertNotIn("/transcribe", nano_server.ALLOWED_BRIDGE_ENDPOINT_PATHS)
        self.assertNotIn("/vision", nano_server.ALLOWED_BRIDGE_ENDPOINT_PATHS)
        self.assertNotIn("/transcribe", nano_server.OPERATION_CONTRACTS)
        self.assertNotIn("/vision", nano_server.OPERATION_CONTRACTS)


if __name__ == "__main__":
    unittest.main()
