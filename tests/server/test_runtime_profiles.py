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
from ollama_client import OllamaClient, OllamaConfig, OllamaError  # noqa: E402


class RuntimeProfileTests(unittest.TestCase):
    def test_unknown_profile_falls_back_to_fast(self) -> None:
        profile = get_runtime_profile("missing")
        self.assertEqual(profile.key, "fast")
        self.assertEqual(profile.generation_model, "gemma4:e2b-it-qat")
        self.assertEqual(profile.num_ctx, 16_384)

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
        self.assertEqual(profile.num_ctx, 32_768)

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
        self.assertEqual(command["num_ctx"], 32_768)

    def test_advanced_profile_has_explicit_manual_context_window(self) -> None:
        self.assertEqual(get_runtime_profile("advanced").num_ctx, 32_768)

    def test_ollama_client_uses_explicit_profile_without_model_fallback(self) -> None:
        with patch.dict("os.environ", {"CHROMEAI_RUNTIME_PROFILE": "balanced"}, clear=True):
            client = OllamaClient()

        self.assertEqual(client.config.model, "gemma4:e4b-it-qat")
        self.assertEqual(client.config.num_ctx, 32_768)
        self.assertEqual(client.active_generation_model(["qwen2.5:0.5b"]), "gemma4:e4b-it-qat")

    def test_explicit_model_override_remains_authoritative(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "CHROMEAI_RUNTIME_PROFILE": "balanced",
                "CHROMEAI_OLLAMA_MODEL": "custom-local:model",
                "CHROMEAI_OLLAMA_NUM_CTX": "24576",
            },
            clear=True,
        ):
            client = OllamaClient()

        self.assertEqual(client.config.model, "custom-local:model")
        self.assertEqual(client.config.num_ctx, 24_576)

    def test_invalid_context_override_fails_explicitly(self) -> None:
        with patch.dict("os.environ", {"CHROMEAI_OLLAMA_NUM_CTX": "0"}, clear=True):
            with self.assertRaisesRegex(OllamaError, "must be a positive integer"):
                OllamaClient()

    def test_every_generation_request_includes_context_window(self) -> None:
        client = OllamaClient(
            OllamaConfig(
                base_url="http://127.0.0.1:11434",
                model="test:model",
                embed_model="test:embed",
                num_ctx=32_768,
                timeout_seconds=1,
            )
        )
        responses = [
            {"model": "test:model", "response": '{"summary":"S","bullets":[],"action_items":[],"title":"T","tags":[]}'},
            {"model": "test:model", "response": '{"reasoning":[],"markdown":"M","json":{}}'},
            {"model": "test:model", "response": '{}'},
        ]
        with patch.object(client, "_model_names", return_value=["test:model"]), patch.object(
            client, "_request_json", side_effect=responses
        ) as request_json:
            client.summarize("Text")
            client.agent("Prompt")
            client.extract("Text", preset_key="action_brief")

        generation_payloads = [call.args[1] for call in request_json.call_args_list]
        self.assertEqual([payload["options"]["num_ctx"] for payload in generation_payloads], [32_768] * 3)
        self.assertEqual([payload["options"]["temperature"] for payload in generation_payloads], [0.2, 0.2, 0.1])


if __name__ == "__main__":
    unittest.main()
