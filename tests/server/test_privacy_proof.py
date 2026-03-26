from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from nano_server import build_privacy_proof  # noqa: E402


class PrivacyProofTests(unittest.TestCase):
    def test_privacy_proof_reports_local_only_when_ollama_is_local(self) -> None:
        health = {
            "reachable": True,
            "model_available": True,
            "base_url": "http://127.0.0.1:11434",
            "active_model": "qwen2.5:0.5b",
            "active_embed_model": "nomic-embed-text-v2-moe:latest",
        }
        proof = build_privacy_proof(health=health, port=8083)
        self.assertTrue(proof["ok"])
        self.assertEqual(proof["privacy_mode"], "local-only")
        self.assertFalse(proof["outbound_observation"]["external_calls_registered"])
        self.assertIn("http://127.0.0.1:8083/privacy-proof", proof["allowed_endpoints"])

    def test_privacy_proof_flags_external_ollama_target(self) -> None:
        health = {
            "reachable": True,
            "model_available": True,
            "base_url": "https://api.example.com",
            "active_model": "qwen",
            "active_embed_model": "embed",
        }
        proof = build_privacy_proof(health=health, port=8083)
        self.assertFalse(proof["ok"])
        self.assertTrue(proof["outbound_observation"]["external_calls_registered"])
        self.assertIn("https://api.example.com", proof["outbound_observation"]["external_targets"])


if __name__ == "__main__":
    unittest.main()