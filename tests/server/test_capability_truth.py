# module_name: tests_server_test_capability_truth_py
# spec_ref: "testing_strategy.integration_tests"
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch


SERVER_DIR = Path(__file__).resolve().parents[2] / "server"
sys.path.insert(0, str(SERVER_DIR))

import nano_server  # noqa: E402


class CapabilityTruthTests(unittest.TestCase):
    def test_unimplemented_media_routes_are_not_admitted(self):
        self.assertNotIn("/transcribe", nano_server.ALLOWED_BRIDGE_ENDPOINT_PATHS)
        self.assertNotIn("/vision", nano_server.ALLOWED_BRIDGE_ENDPOINT_PATHS)
        self.assertNotIn("/transcribe", nano_server.OPERATION_CONTRACTS)
        self.assertNotIn("/vision", nano_server.OPERATION_CONTRACTS)

    def test_binary_integrity_mismatch_stops_startup_contract(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            binary = Path(temp_dir) / "nano_server.py"
            binary.write_text("print('trusted')\n", encoding="utf-8")
            expected = sha256(binary.read_bytes()).hexdigest()
            nano_server.require_binary_integrity(binary, expected)

            binary.write_text("print('tampered')\n", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "runtime_integrity_check_failed"):
                    nano_server.require_binary_integrity(binary, expected)

    def test_runtime_integrity_covers_imported_code_and_policy(self):
        relative_paths = (
            "server/nano_server.py",
            "server/ollama_client.py",
            "server/extraction_presets.py",
            "server/runtime_profiles.py",
            "server/installation_manager.py",
            "presets/extraction-presets.json",
            "runtime/model_policy.json",
            "runtime/model_registry.runtime.json",
            "runtime/promotion_audit.json",
        )
        self.assertTrue(
            hasattr(nano_server, "require_runtime_integrity"),
            "runtime tree has no integrity verifier",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            records = []
            for relative_path in relative_paths:
                target = root / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(f"trusted:{relative_path}\n", encoding="utf-8")
                records.append(f"{relative_path}\t{sha256(target.read_bytes()).hexdigest()}\n")

            expected = sha256("".join(records).encode("utf-8")).hexdigest()
            nano_server.require_runtime_integrity(root, expected)

            (root / "server/ollama_client.py").write_text("tampered\n", encoding="utf-8")
            with redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, "runtime_integrity_check_failed"):
                    nano_server.require_runtime_integrity(root, expected)

    def test_runtime_feedback_uses_explicit_mutable_state_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            state_dir = Path(temp_dir) / "state"
            with patch.object(nano_server, "RUNTIME_STATE_DIR", nano_server.RUNTIME_STATE_DIR), patch.object(
                nano_server, "LIVE_FEEDBACK_PATH", nano_server.LIVE_FEEDBACK_PATH
            ):
                nano_server.configure_runtime_state(state_dir)
                self.assertTrue(nano_server._append_live_feedback({"type": "test"}))
                self.assertEqual(nano_server.LIVE_FEEDBACK_PATH.parent, state_dir.resolve())
                self.assertTrue(nano_server.LIVE_FEEDBACK_PATH.is_file())

    def test_runtime_feedback_write_failure_is_explicit(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            feedback_path = Path(temp_dir) / "feedback.jsonl"
            with patch.object(nano_server, "LIVE_FEEDBACK_PATH", feedback_path), patch.object(
                Path, "open", side_effect=OSError("read only")
            ), patch("sys.stderr") as stderr:
                self.assertFalse(nano_server._append_live_feedback({"type": "test"}))
                self.assertTrue(stderr.write.called)

    def test_production_intent_metadata_matches_zero_temperature_runtime(self):
        for task in ("classification", "extract", "rewrite", "analyze", "summarize", "agent"):
            self.assertEqual(nano_server.fixed_temperature_for_task(task), 0.0)

    def test_local_operation_admission_is_bounded_and_recoverable(self):
        admission = nano_server.LocalOperationAdmission(1)
        self.assertTrue(admission.try_acquire())
        self.assertFalse(admission.try_acquire())
        self.assertEqual(admission.snapshot(), {"active": 1, "limit": 1})
        admission.release()
        self.assertTrue(admission.try_acquire())
        admission.release()


if __name__ == "__main__":
    unittest.main()
