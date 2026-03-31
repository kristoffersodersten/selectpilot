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
    embedding_model: str
    target_latency: str
    intended_for: str
    is_default_auto: bool = False


RUNTIME_PROFILES: dict[str, RuntimeProfile] = {
    "fast": RuntimeProfile(
        key="fast",
        label="Fast",
        description="Smallest viable local profile for structured extraction and low-latency summaries.",
        generation_model="qwen2.5:0.5b",
        embedding_model="nomic-embed-text-v2-moe:latest",
        target_latency="1-4s",
        intended_for="Selected-text extraction, action briefs, and quick summaries.",
        is_default_auto=True,
    ),
    "balanced": RuntimeProfile(
        key="balanced",
        label="Balanced",
        description="Higher quality local profile for rewrite and general-purpose browser transforms.",
        generation_model="qwen2.5:3b",
        embedding_model="nomic-embed-text-v2-moe:latest",
        target_latency="2-6s",
        intended_for="Daily use when you want better quality without drifting into heavy models.",
    ),
    "advanced": RuntimeProfile(
        key="advanced",
        label="Advanced",
        description="Manual opt-in profile for stronger reasoning on larger machines.",
        generation_model="qwen2.5:7b",
        embedding_model="nomic-embed-text-v2-moe:latest",
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
    memory_gb = snapshot.get("memory_gb")
    machine = str(snapshot.get("machine") or "")

    if memory_gb is None:
        profile = RUNTIME_PROFILES["fast"]
        reason = "Memory could not be detected, so the smallest viable profile is safest."
    elif memory_gb < 16:
        profile = RUNTIME_PROFILES["fast"]
        reason = "This machine benefits from the smallest viable profile for low-latency extraction."
    elif memory_gb < 32:
        profile = RUNTIME_PROFILES["balanced"]
        reason = "This machine can comfortably handle the balanced profile without overprovisioning."
    else:
        profile = RUNTIME_PROFILES["balanced"]
        reason = "Even on larger machines, balanced is the default because SelectPilot prioritizes fit-for-task over maximum model size."

    if machine.startswith("x86") and profile.key != "fast":
        profile = RUNTIME_PROFILES["fast"]
        reason = "Intel machines default to the fast profile unless you explicitly opt into heavier models."

    return {
        "recommended_profile": profile.key,
        "reason": reason,
        "system": snapshot,
    }


def list_runtime_profiles() -> list[dict[str, Any]]:
    return [asdict(profile) for profile in RUNTIME_PROFILES.values()]


def get_runtime_profile(key: str | None) -> RuntimeProfile:
    if key and key in RUNTIME_PROFILES:
        return RUNTIME_PROFILES[key]
    return RUNTIME_PROFILES["fast"]


def build_bootstrap_commands(profile_key: str, project_root: str | Path) -> dict[str, str]:
    profile = get_runtime_profile(profile_key)
    root = Path(project_root)
    install_script = root / "scripts" / "bootstrap-macos-local.sh"
    command = f"{install_script} --profile {profile.key}"
    return {
        "profile": profile.key,
        "command": command,
        "generation_model": profile.generation_model,
        "embedding_model": profile.embedding_model,
    }

