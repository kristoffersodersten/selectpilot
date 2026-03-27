from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from nano_server import (  # noqa: E402
    OperationContract,
    build_runtime_meta_event,
    compile_intent_to_ir,
    ValidationError,
    _resolve_trace_id,
    enforce_contract_fields,
    get_operation_contract,
    run_with_output_enforcement,
    sanitize_runtime_meta_details,
    validate_agent_payload,
    validate_agent_response,
    validate_embed_payload,
    validate_intent_compile_payload,
    validate_extract_payload,
    validate_extract_response,
    validate_summarize_payload,
    validate_summarize_response,
)


class ValidationPipelineTests(unittest.TestCase):
    def test_summarize_payload_requires_non_empty_text(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            validate_summarize_payload({"text": "   "})
        self.assertEqual(ctx.exception.code, "invalid_request_field")

    def test_extract_payload_rejects_non_object_metadata(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            validate_extract_payload({"text": "x", "metadata": ["bad"]})
        self.assertEqual(ctx.exception.code, "invalid_request_field")
        self.assertEqual(ctx.exception.details.get("field"), "metadata")

    def test_agent_payload_requires_context_object_when_present(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            validate_agent_payload({"prompt": "go", "context": "bad"})
        self.assertEqual(ctx.exception.code, "invalid_request_field")
        self.assertEqual(ctx.exception.details.get("field"), "context")

    def test_embed_payload_requires_text(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            validate_embed_payload({})
        self.assertEqual(ctx.exception.code, "invalid_request_field")
        self.assertEqual(ctx.exception.details.get("field"), "text")

    def test_summarize_response_requires_schema(self) -> None:
        valid = {
            "summary": "s",
            "markdown": "m",
            "bullets": ["b"],
            "action_items": ["a"],
            "title": "t",
            "tags": ["x"],
            "model": "qwen",
            "source": "ollama",
            "raw_response": "{}",
        }
        result = validate_summarize_response(valid)
        self.assertEqual(result["source"], "ollama")

        with self.assertRaises(ValidationError) as ctx:
            validate_summarize_response({**valid, "bullets": "not-list"})
        self.assertEqual(ctx.exception.code, "invalid_model_output")
        self.assertEqual(ctx.exception.status, 502)

    def test_agent_response_requires_reasoning_and_json_object(self) -> None:
        valid = {
            "reasoning": ["r1"],
            "markdown": "m",
            "json": {"k": "v"},
            "model": "qwen",
            "source": "ollama",
            "raw_response": "{}",
        }
        result = validate_agent_response(valid)
        self.assertEqual(result["model"], "qwen")

        with self.assertRaises(ValidationError):
            validate_agent_response({**valid, "json": []})

    def test_extract_response_requires_json_object(self) -> None:
        valid = {
            "preset": "action_brief",
            "label": "Action Brief",
            "description": "desc",
            "json": {"summary": "ok"},
            "markdown": "md",
            "model": "qwen",
            "source": "ollama",
            "raw_response": "{}",
        }
        result = validate_extract_response(valid)
        self.assertEqual(result["preset"], "action_brief")

        with self.assertRaises(ValidationError):
            validate_extract_response({**valid, "json": "bad"})

    def test_contract_lookup_for_known_endpoint(self) -> None:
        contract = get_operation_contract("/summarize")
        self.assertIsNotNone(contract)
        self.assertEqual(contract.name, "summarize")

    def test_contract_whitelist_rejects_unknown_fields(self) -> None:
        contract = OperationContract(
            name="test",
            endpoint="/test",
            template="test.v1",
            allowed_fields=("text",),
        )
        with self.assertRaises(ValidationError) as ctx:
            enforce_contract_fields({"text": "ok", "unexpected": 1}, contract)
        self.assertEqual(ctx.exception.code, "invalid_request_field")
        self.assertIn("unexpected", ctx.exception.details.get("unexpected_fields", []))

    def test_contract_whitelist_allows_known_fields(self) -> None:
        contract = OperationContract(
            name="test",
            endpoint="/test",
            template="test.v1",
            allowed_fields=("text", "session_id"),
        )
        enforce_contract_fields({"text": "ok", "session_id": "abc"}, contract)

    def test_trace_id_resolves_from_header_then_body_then_generated(self) -> None:
        header_trace = _resolve_trace_id({"session_id": "body-trace"}, {"x-selectpilot-trace-id": "hdr-trace"})
        self.assertEqual(header_trace, "hdr-trace")

        body_trace = _resolve_trace_id({"session_id": "body-trace"}, {})
        self.assertEqual(body_trace, "body-trace")

        generated = _resolve_trace_id({}, {})
        self.assertTrue(isinstance(generated, str) and len(generated) > 0)

    def test_runtime_meta_details_are_sanitized_for_privacy(self) -> None:
        sanitized = sanitize_runtime_meta_details(
            {
                "request_fields": ["text", "url"],
                "text": "secret",
                "prompt": "never log me",
                "safe_scalar": "ok",
                "nested": {"allowed": "yes", "blocked": ["x"]},
            }
        )
        self.assertNotIn("text", sanitized)
        self.assertNotIn("prompt", sanitized)
        self.assertEqual(sanitized.get("safe_scalar"), "ok")
        self.assertEqual(sanitized.get("request_fields"), 2)

    def test_runtime_meta_event_contract_contains_privacy_flags(self) -> None:
        event = build_runtime_meta_event(
            event_type="RUNTIME_STARTED",
            trace_id="trace-1",
            operation="summarize",
            status="running",
            step="VALIDATE_INPUT",
            message="Started",
            latency_hint_ms=1200,
            details={"text": "do-not-leak", "endpoint": "/summarize"},
        )
        self.assertEqual(event["type"], "runtime_meta")
        self.assertEqual(event["event_type"], "RUNTIME_STARTED")
        self.assertEqual(event["trace_id"], "trace-1")
        self.assertEqual(event["operation"], "summarize")
        self.assertEqual(event["status"], "running")
        self.assertEqual(event["step"], "VALIDATE_INPUT")
        self.assertEqual(event["latency_hint_ms"], 1200)
        self.assertEqual(event.get("privacy", {}).get("selected_text_exposed"), False)
        self.assertEqual(event.get("privacy", {}).get("local_only"), True)
        self.assertNotIn("text", event.get("details", {}))
        self.assertEqual(event.get("details", {}).get("endpoint"), "/summarize")

    def test_intent_compile_payload_requires_non_empty_intent(self) -> None:
        with self.assertRaises(ValidationError):
            validate_intent_compile_payload({"intent": " "})

        valid = validate_intent_compile_payload({"intent": "Summarize this", "has_selection": True})
        self.assertEqual(valid["intent"], "Summarize this")

    def test_compile_intent_to_ir_returns_clarification_for_ambiguous_intent(self) -> None:
        compiled = compile_intent_to_ir("help", has_selection=True, has_page_text=False)
        self.assertTrue(compiled.get("clarify_required"))
        self.assertIn("question", compiled)
        self.assertIn("options", compiled)

    def test_compile_intent_to_ir_selects_operation_for_clear_intent(self) -> None:
        compiled = compile_intent_to_ir("extract structured json", has_selection=True, has_page_text=True)
        self.assertFalse(compiled.get("clarify_required"))
        self.assertEqual(compiled.get("operation"), "extract")
        self.assertEqual(compiled.get("ir", {}).get("selected_operation"), "extract")
        self.assertEqual(compiled.get("ir", {}).get("constraints", {}).get("strictness"), "high")
        self.assertIn("model_selection", compiled)

    def test_compile_intent_to_ir_blocks_when_ambiguity_over_threshold(self) -> None:
        compiled = compile_intent_to_ir("extract and summarize this", has_selection=True, has_page_text=True)
        self.assertTrue(compiled.get("clarify_required"))
        self.assertGreaterEqual(float(compiled.get("ambiguity_score", 0.0)), 0.4)
        self.assertEqual(compiled.get("ir", {}).get("action"), "clarify")

    def test_output_enforcement_emits_visible_retry_event(self) -> None:
        attempts = {"count": 0}

        def execute_fn():
            attempts["count"] += 1
            if attempts["count"] == 1:
                return {
                    "summary": 123,
                    "markdown": "m",
                    "bullets": ["b"],
                    "action_items": ["a"],
                    "title": "t",
                    "tags": ["x"],
                    "model": "qwen",
                    "source": "ollama",
                    "raw_response": "{}",
                }
            return {
                "summary": "ok",
                "markdown": "m",
                "bullets": ["b"],
                "action_items": ["a"],
                "title": "t",
                "tags": ["x"],
                "model": "qwen",
                "source": "ollama",
                "raw_response": "{}",
            }

        with patch("nano_server.emit_runtime_meta") as emit_mock:
            result, attempt_count = run_with_output_enforcement(
                trace_id="trace-1",
                operation="summarize",
                execute_fn=execute_fn,
                validate_fn=validate_summarize_response,
                max_attempts=2,
            )

        self.assertEqual(result["summary"], "ok")
        self.assertEqual(attempt_count, 2)
        self.assertEqual(attempts["count"], 2)
        emit_mock.assert_called_once()
        self.assertEqual(emit_mock.call_args.kwargs.get("event_type"), "RETRY_SCHEDULED")


if __name__ == "__main__":
    unittest.main()
