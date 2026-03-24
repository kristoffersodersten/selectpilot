from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from extraction_presets import get_extraction_preset, render_extraction_markdown  # noqa: E402


class ExtractionPresetTests(unittest.TestCase):
    def test_unknown_preset_falls_back_to_action_brief(self) -> None:
        preset = get_extraction_preset("does-not-exist")
        self.assertEqual(preset.key, "action_brief")

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


if __name__ == "__main__":
    unittest.main()
