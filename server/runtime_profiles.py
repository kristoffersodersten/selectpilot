# module_name: hardware_detector
# spec_ref: "hardware_detection_layer"
from __future__ import annotations

import os
import platform
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RuntimeProfile:
    key: str
    label: str
    description: str
    generation_model: str
    fast_generation_model: str
    embedding_model: str
    num_ctx: int
    fast_num_ctx: int
    max_input_chars: int
    target_latency: str
    intended_for: str
    is_default_auto: bool = False


RUNTIME_PROFILES: dict[str, RuntimeProfile] = {
    "fast": RuntimeProfile(
        key="fast",
        label="Fast",
        description="Smallest viable local profile for structured extraction and low-latency summaries.",
        generation_model="gemma4:e2b-it-qat",
        fast_generation_model="gemma4:e2b-it-qat",
        embedding_model="nomic-embed-text-v2-moe:latest",
        num_ctx=16384,
        fast_num_ctx=16384,
        max_input_chars=16000,
        target_latency="4-20s",
        intended_for="Selected-text extraction, action briefs, and quick summaries.",
        is_default_auto=True,
    ),
    "balanced": RuntimeProfile(
        key="balanced",
        label="Balanced",
        description="Higher quality local profile for rewrite and general-purpose browser transforms.",
        generation_model="gemma4:e4b-it-qat",
        fast_generation_model="gemma4:e2b-it-qat",
        embedding_model="nomic-embed-text-v2-moe:latest",
        num_ctx=32768,
        fast_num_ctx=16384,
        max_input_chars=16000,
        target_latency="4-30s",
        intended_for="Daily use when you want better quality without drifting into heavy models.",
    ),
    "advanced": RuntimeProfile(
        key="advanced",
        label="Advanced",
        description="Manual opt-in profile for stronger reasoning on larger machines.",
        generation_model="qwen2.5:7b",
        fast_generation_model="gemma4:e2b-it-qat",
        embedding_model="nomic-embed-text-v2-moe:latest",
        num_ctx=32768,
        fast_num_ctx=16384,
        max_input_chars=16000,
        target_latency="4-10s",
        intended_for="Heavier rewrite and ask flows when latency budget is less important.",
    ),
}


def _read_sysctl(name: str) -> str | None:
    try:
        result = subprocess.run(
            ["/usr/sbin/sysctl", "-n", name],
            capture_output=True,
            check=True,
            text=True,
        )
    except Exception:
        return None
    return result.stdout.strip() or None


def detect_system_snapshot() -> dict[str, Any]:
    memsize_raw = _read_sysctl("hw.memsize")
    memory_gb = None
    if memsize_raw:
        try:
            memory_gb = round(int(memsize_raw) / (1024 ** 3))
        except Exception:
            memory_gb = None

    return {
        "platform": platform.system().lower(),
        "machine": platform.machine().lower(),
        "cpu_count": os.cpu_count() or 0,
        "memory_gb": memory_gb,
    }


def recommend_runtime_profile(system_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    snapshot = system_snapshot or detect_system_snapshot()
    profile = RUNTIME_PROFILES["fast"]
    reason = (
        "SelectPilot automatically uses the smallest qualified local profile. "
        "Heavier profiles require explicit operator selection."
    )

    return {
        "recommended_profile": profile.key,
        "reason": reason,
        "system": snapshot,
    }


def list_runtime_profiles() -> list[dict[str, Any]]:
    return [asdict(profile) for profile in RUNTIME_PROFILES.values()]


def generation_routes(profile: RuntimeProfile) -> dict[str, dict[str, Any]]:
    return {
        "extract": {
            "model": profile.fast_generation_model,
            "num_ctx": profile.fast_num_ctx,
            "reason": "smallest_qualified_structured_model",
        },
        "summarize": {
            "model": profile.fast_generation_model,
            "num_ctx": profile.fast_num_ctx,
            "reason": "smallest_qualified_structured_model",
        },
        "agent": {
            "model": profile.generation_model,
            "num_ctx": profile.num_ctx,
            "reason": "qualified_general_model",
        },
    }


def required_generation_models(profile: RuntimeProfile) -> list[tuple[str, int]]:
    required: list[tuple[str, int]] = []
    for route in generation_routes(profile).values():
        item = (str(route["model"]), int(route["num_ctx"]))
        if item not in required:
            required.append(item)
    return required


def get_runtime_profile(key: str | None) -> RuntimeProfile:
    if key in RUNTIME_PROFILES:
        return RUNTIME_PROFILES[key]
    if key is None:
        return RUNTIME_PROFILES["fast"]
    raise ValueError(f"Unknown runtime profile: {key}")


def build_bootstrap_commands(profile_key: str, project_root: str | Path) -> dict[str, str]:
    profile = get_runtime_profile(profile_key)
    root = Path(project_root)
    install_script = root / "scripts" / "bootstrap-macos-local.sh"
    command = f"{install_script} --profile {profile.key}"
    return {
        "profile": profile.key,
        "command": command,
        "generation_model": profile.generation_model,
        "fast_generation_model": profile.fast_generation_model,
        "embedding_model": profile.embedding_model,
        "num_ctx": profile.num_ctx,
        "fast_num_ctx": profile.fast_num_ctx,
        "max_input_chars": profile.max_input_chars,
        "generation_routes": generation_routes(profile),
    }
