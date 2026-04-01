from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


class ServerPackageImportTests(unittest.TestCase):
    def test_package_import_preserves_runtime_profile_defaults(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CHROMEAI_RUNTIME_PROFILE": "balanced",
                "CHROMEAI_OLLAMA_BASE_URL": "http://127.0.0.1:11434",
                "CHROMEAI_OLLAMA_TIMEOUT_SECONDS": "30",
            },
            clear=False,
        ):
            from server.ollama_client import OllamaClient

            client = OllamaClient()

        self.assertEqual(client.config.model, "qwen2.5:3b")
        self.assertEqual(client.config.embed_model, "nomic-embed-text-v2-moe:latest")

    def test_server_package_import_exposes_runtime_profile_helpers(self) -> None:
        from server.nano_server import recommend_runtime_profile

        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 24, "platform": "darwin", "cpu_count": 10}
        )

        self.assertEqual(recommendation["recommended_profile"], "balanced")


if __name__ == "__main__":
    unittest.main()
