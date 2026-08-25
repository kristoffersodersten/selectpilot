# module_name: tests_server_test_ollama_client_py
# spec_ref: "testing_strategy.integration_tests"
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from ollama_client import OllamaClient, OllamaConfig, OllamaError  # noqa: E402


class StubOllamaClient(OllamaClient):
    def __init__(self, response: dict):
        super().__init__(OllamaConfig(
            base_url="http://127.0.0.1:11434",
            model="gemma4:e2b-it-qat",
            embed_model="nomic-embed-text-v2-moe:latest",
            timeout_seconds=1,
            num_ctx=16384,
            seed=42,
        ))
        self.response = response
        self.last_payload = None

    def _model_names(self, local_only: bool = False) -> list[str]:
        return [self.config.model, self.config.embed_model]

    def _request_json(self, path: str, payload=None):
        self.last_payload = payload
        return self.response


class OllamaClientContractTests(unittest.TestCase):
    def test_explicit_model_is_not_silently_substituted(self) -> None:
        client = StubOllamaClient({})
        self.assertEqual(
            client.active_generation_model(["qwen2.5:0.5b"]),
            "gemma4:e2b-it-qat",
        )

    def test_summarize_sends_explicit_context_window(self) -> None:
        client = StubOllamaClient({
            "model": "gemma4:e2b-it-qat",
            "response": '{"summary":"S","bullets":[],"action_items":[],"title":"T","tags":[]}',
        })
        client.summarize("content")
        self.assertEqual(client.last_payload["options"]["num_ctx"], 16384)
        self.assertEqual(client.last_payload["options"]["seed"], 42)
        self.assertEqual(client.last_payload["options"]["temperature"], 0.0)

    def test_summarize_rejects_non_schema_output(self) -> None:
        client = StubOllamaClient({"response": "not json"})
        with self.assertRaisesRegex(OllamaError, "non-object structured output"):
            client.summarize("content")

    def test_summarize_rejects_missing_required_fields(self) -> None:
        client = StubOllamaClient({"response": '{"summary":"S"}'})
        with self.assertRaisesRegex(OllamaError, "missing required fields"):
            client.summarize("content")

    def test_all_structured_routes_send_closed_object_schemas(self) -> None:
        responses = [
            {"response": '{"summary":"S","bullets":[],"action_items":[],"title":"T","tags":[]}'},
            {"response": '{"reasoning":[],"markdown":"M","json":{}}'},
            {"response": '{"summary":"S","action_items":[],"decisions":[],"risks":[],"follow_ups":[]}'},
        ]
        client = StubOllamaClient(responses.pop(0))
        payloads = []
        for operation in (
            lambda: client.summarize("content"),
            lambda: client.agent("prompt"),
            lambda: client.extract("content", preset_key="action_brief"),
        ):
            operation()
            payloads.append(client.last_payload)
            if responses:
                client.response = responses.pop(0)
        self.assertEqual([payload["format"]["type"] for payload in payloads], ["object"] * 3)
        self.assertTrue(all(payload["format"]["additionalProperties"] is False for payload in payloads))


if __name__ == "__main__":
    unittest.main()
