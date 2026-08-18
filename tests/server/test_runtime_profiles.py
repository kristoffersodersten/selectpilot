from __future__ import annotations

import sys
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from runtime_profiles import build_bootstrap_commands, get_runtime_profile, recommend_runtime_profile  # noqa: E402
from ollama_client import OllamaClient  # noqa: E402


class RuntimeProfileTests(unittest.TestCase):
    def test_unknown_profile_falls_back_to_fast(self) -> None:
        profile = get_runtime_profile("missing")
        self.assertEqual(profile.key, "fast")
        self.assertEqual(profile.generation_model, "gemma4:e2b-it-qat")

    def test_low_memory_hardware_uses_memory_safe_gemma_profile(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 8, "platform": "darwin", "cpu_count": 8}
        )
        profile = get_runtime_profile(recommendation["recommended_profile"])
        self.assertEqual(profile.key, "fast")
        self.assertEqual(profile.generation_model, "gemma4:e2b-it-qat")

    def test_16_gb_apple_silicon_uses_balanced_gemma_profile(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 16, "platform": "darwin", "cpu_count": 10}
        )
        profile = get_runtime_profile(recommendation["recommended_profile"])
        self.assertEqual(profile.key, "balanced")
        self.assertEqual(profile.generation_model, "gemma4:e4b-it-qat")

    def test_intel_hardware_remains_on_memory_safe_profile(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "x86_64", "memory_gb": 64, "platform": "darwin", "cpu_count": 12}
        )
        self.assertEqual(recommendation["recommended_profile"], "fast")

    def test_auto_recommendation_prefers_balanced_on_large_machines(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 64, "platform": "darwin", "cpu_count": 10}
        )
        self.assertEqual(recommendation["recommended_profile"], "balanced")

    def test_bootstrap_command_contains_profile(self) -> None:
        command = build_bootstrap_commands("balanced", ROOT)
        self.assertIn("--profile balanced", command["command"])

    def test_ollama_client_uses_explicit_profile_without_model_fallback(self) -> None:
        with patch.dict("os.environ", {"CHROMEAI_RUNTIME_PROFILE": "balanced"}, clear=True):
            client = OllamaClient()

        self.assertEqual(client.config.model, "gemma4:e4b-it-qat")
        self.assertEqual(client.active_generation_model(["qwen2.5:0.5b"]), "gemma4:e4b-it-qat")

    def test_explicit_model_override_remains_authoritative(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "CHROMEAI_RUNTIME_PROFILE": "balanced",
                "CHROMEAI_OLLAMA_MODEL": "custom-local:model",
            },
            clear=True,
        ):
            client = OllamaClient()

        self.assertEqual(client.config.model, "custom-local:model")


if __name__ == "__main__":
    unittest.main()
