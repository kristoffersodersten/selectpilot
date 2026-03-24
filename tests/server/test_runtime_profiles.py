from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from runtime_profiles import build_bootstrap_commands, get_runtime_profile, recommend_runtime_profile  # noqa: E402


class RuntimeProfileTests(unittest.TestCase):
    def test_unknown_profile_falls_back_to_fast(self) -> None:
        profile = get_runtime_profile("missing")
        self.assertEqual(profile.key, "fast")
        self.assertEqual(profile.generation_model, "qwen2.5:0.5b")

    def test_auto_recommendation_prefers_balanced_on_large_machines(self) -> None:
        recommendation = recommend_runtime_profile(
            {"machine": "arm64", "memory_gb": 64, "platform": "darwin", "cpu_count": 10}
        )
        self.assertEqual(recommendation["recommended_profile"], "balanced")

    def test_bootstrap_command_contains_profile(self) -> None:
        command = build_bootstrap_commands("balanced", ROOT)
        self.assertIn("--profile balanced", command["command"])


if __name__ == "__main__":
    unittest.main()
