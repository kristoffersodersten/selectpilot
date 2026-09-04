# module_name: tests_server_test_model_feedback_py
# spec_ref: "testing_strategy.integration_tests"
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import nano_server  # noqa: E402


class ModelFeedbackTests(unittest.TestCase):
    def test_failure_window_quarantines_model(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            feedback_path = Path(temp_dir) / "feedback.jsonl"
            rows = [
                {"type": "model_feedback", "model_id": "model:a", "success": index >= 3, "retries": 0, "latency_ms": 10}
                for index in range(10)
            ]
            feedback_path.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
            with patch.object(nano_server, "LIVE_FEEDBACK_PATH", feedback_path):
                self.assertTrue(nano_server._is_quarantined("model:a"))
                self.assertFalse(nano_server._is_quarantined("model:b"))

    def test_penalty_reflects_retries_and_latency(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            feedback_path = Path(temp_dir) / "feedback.jsonl"
            feedback_path.write_text(
                json.dumps({"type": "model_feedback", "model_id": "model:a", "success": True, "retries": 3, "latency_ms": 12000}) + "\n",
                encoding="utf-8",
            )
            with patch.object(nano_server, "LIVE_FEEDBACK_PATH", feedback_path):
                self.assertEqual(nano_server._recent_feedback_penalty("model:a"), 0.35)


if __name__ == "__main__":
    unittest.main()
