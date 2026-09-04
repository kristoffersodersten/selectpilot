# module_name: tests_server_test_extraction_presets_py
# spec_ref: "testing_strategy.integration_tests"
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from extraction_presets import get_extraction_preset, render_extraction_markdown  # noqa: E402
from nano_server import ValidationError, validate_extract_payload  # noqa: E402


class ExtractionPresetTests(unittest.TestCase):
    def test_unknown_preset_fails_without_fallback(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unknown extraction preset"):
            get_extraction_preset("does-not-exist")

    def test_none_uses_declared_default(self) -> None:
        self.assertEqual(get_extraction_preset(None).key, "action_brief")

    def test_markdown_renderer_emits_sections(self) -> None:
        preset = get_extraction_preset("decision_log")
        markdown = render_extraction_markdown(
            preset,
            {
                "decision": "Ship the beta this week.",
                "why": ["The onboarding flow is stable."],
                "risks": ["The nginx config still needs verification."],
                "open_questions": [],
                "next_steps": ["Verify nginx config", "Publish changelog"],
            },
        )

        self.assertIn("## Decision Log", markdown)
        self.assertIn("### Why", markdown)
        self.assertIn("- The onboarding flow is stable.", markdown)
        self.assertIn("### Next Steps", markdown)
        self.assertIn("- Verify nginx config", markdown)

    def test_markdown_renderer_rejects_missing_intro(self) -> None:
        preset = get_extraction_preset("decision_log")
        with self.assertRaisesRegex(ValueError, "missing required intro field"):
            render_extraction_markdown(preset, {"decision": "", "why": []})

    def test_request_validation_rejects_unknown_preset(self) -> None:
        with self.assertRaises(ValidationError) as caught:
            validate_extract_payload({"text": "content", "preset": "missing"})
        self.assertEqual(caught.exception.code, "unknown_extraction_preset")
        self.assertEqual(caught.exception.status, 422)


if __name__ == "__main__":
    unittest.main()
