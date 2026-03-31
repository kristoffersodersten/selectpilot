from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from server.ollama_client import OllamaClient


class OllamaClientTests(unittest.TestCase):
    def test_client_uses_runtime_profile_defaults_when_imported_as_package(self) -> None:
        with patch.dict(
            os.environ,
            {
                "CHROMEAI_RUNTIME_PROFILE": "auto",
                "CHROMEAI_OLLAMA_BASE_URL": "http://127.0.0.1:11434",
            },
            clear=True,
        ):
            with patch("server.runtime_profiles.recommend_runtime_profile", return_value={"recommended_profile": "balanced"}):
                with patch("server.runtime_profiles.get_runtime_profile") as get_profile_mock:
                    get_profile_mock.return_value = type(
                        "Profile",
                        (),
                        {
                            "generation_model": "qwen2.5:3b",
                            "embedding_model": "nomic-embed-text",
                        },
                    )()

                    client = OllamaClient()

        self.assertEqual(client.config.model, "qwen2.5:3b")
        self.assertEqual(client.config.embed_model, "nomic-embed-text")
        get_profile_mock.assert_called_once_with("balanced")


if __name__ == "__main__":
    unittest.main()
