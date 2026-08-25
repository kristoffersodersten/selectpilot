# module_name: tests_server_test_runtime_profiles_py
# spec_ref: "testing_strategy.integration_tests"
from __future__ import annotations

import sys
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from runtime_profiles import (  # noqa: E402
    build_bootstrap_commands,
    generation_routes,
    get_runtime_profile,
    recommend_runtime_profile,
    required_generation_models,
)
from ollama_client import OllamaClient, OllamaError  # noqa: E402


class RuntimeProfileTests(unittest.TestCase):
    def test_unknown_profile_fails_explicitly(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown runtime profile"):
            get_runtime_profile("missing")

        profile = get_runtime_profile(None)
        self.assertEqual(profile.key, "fast")
        self.assertEqual(profile.generation_model, "gemma4:e2b-it-qat")
        self.assertEqual(profile.num_ctx, 16384)

    def test_auto_recommendation_prefers_balanced_on_large_machines(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 64, "platform": "darwin", "cpu_count": 10}
        )
        self.assertEqual(recommendation["recommended_profile"], "balanced")

    def test_low_memory_and_intel_hardware_use_fast(self) -> None:
        low_memory = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 8, "platform": "darwin", "cpu_count": 8}
        )
        intel = recommend_runtime_profile(
            {"machine": "x86_64", "memory_gb": 64, "platform": "darwin", "cpu_count": 12}
        )
        self.assertEqual(low_memory["recommended_profile"], "fast")
        self.assertEqual(intel["recommended_profile"], "fast")

    def test_explicit_profile_and_context_override_are_authoritative(self) -> None:
        with patch.dict("os.environ", {
            "CHROMEAI_RUNTIME_PROFILE": "balanced",
            "CHROMEAI_OLLAMA_MODEL": "custom-local:model",
            "CHROMEAI_OLLAMA_NUM_CTX": "24576",
        }, clear=True):
            client = OllamaClient()
        self.assertEqual(client.config.model, "custom-local:model")
        self.assertEqual(client.config.fast_model, "custom-local:model")
        self.assertEqual(client.config.num_ctx, 24576)

    def test_invalid_context_override_fails_explicitly(self) -> None:
        with patch.dict("os.environ", {"CHROMEAI_OLLAMA_NUM_CTX": "0"}, clear=True):
            with self.assertRaisesRegex(OllamaError, "must be a positive integer"):
                OllamaClient()

    def test_bootstrap_command_contains_profile(self) -> None:
        command = build_bootstrap_commands("balanced", ROOT)
        self.assertIn("--profile balanced", command["command"])
        self.assertEqual(command["num_ctx"], 32768)
        self.assertEqual(command["fast_num_ctx"], 16384)
        self.assertEqual(command["max_input_chars"], 16000)

    def test_balanced_profile_routes_smallest_qualified_model_per_task(self) -> None:
        profile = get_runtime_profile("balanced")
        routes = generation_routes(profile)
        self.assertEqual(routes["extract"]["model"], "gemma4:e2b-it-qat")
        self.assertEqual(routes["summarize"]["num_ctx"], 16384)
        self.assertEqual(routes["agent"]["model"], "gemma4:e4b-it-qat")
        self.assertEqual(required_generation_models(profile), [
            ("gemma4:e2b-it-qat", 16384),
            ("gemma4:e4b-it-qat", 32768),
        ])


if __name__ == "__main__":
    unittest.main()
