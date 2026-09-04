# module_name: server_extraction_presets_py
# spec_ref: "validation_layer"
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PRESET_REGISTRY_PATH = Path(__file__).resolve().parents[1] / "presets" / "extraction-presets.json"


@dataclass(frozen=True)
class ExtractionPreset:
    key: str
    label: str
    description: str
    intro_key: str
    schema: dict[str, Any]
    instructions: str
    sections: tuple[tuple[str, str], ...]


def _load_registry() -> tuple[str, dict[str, ExtractionPreset]]:
    try:
        payload = json.loads(PRESET_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Cannot load extraction preset registry: {PRESET_REGISTRY_PATH}") from exc

    raw_presets = payload.get("presets")
    if not isinstance(raw_presets, list) or not raw_presets:
        raise RuntimeError("Extraction preset registry must contain at least one preset")

    presets: dict[str, ExtractionPreset] = {}
    for raw in raw_presets:
        if not isinstance(raw, dict):
            raise RuntimeError("Extraction preset entries must be objects")
        key = str(raw.get("key") or "").strip()
        if not key or key in presets:
            raise RuntimeError(f"Invalid or duplicate extraction preset key: {key}")
        schema = raw.get("schema")
        if not isinstance(schema, dict) or schema.get("type") != "object" or schema.get("additionalProperties") is not False:
            raise RuntimeError(f"Extraction preset {key} must use a closed object schema")
        properties = schema.get("properties")
        required = schema.get("required")
        if not isinstance(properties, dict) or not isinstance(required, list) or set(properties) != set(required):
            raise RuntimeError(f"Extraction preset {key} must require every declared property exactly")
        intro_key = str(raw.get("intro_key") or "")
        if intro_key not in properties:
            raise RuntimeError(f"Extraction preset {key} has an invalid intro_key")
        raw_sections = raw.get("sections")
        if not isinstance(raw_sections, list) or any(not isinstance(item, list) or len(item) != 2 for item in raw_sections):
            raise RuntimeError(f"Extraction preset {key} has invalid sections")
        presets[key] = ExtractionPreset(
            key=key,
            label=str(raw.get("label") or "").strip(),
            description=str(raw.get("description") or "").strip(),
            intro_key=intro_key,
            schema=schema,
            instructions=str(raw.get("instructions") or "").strip(),
            sections=tuple((str(field), str(title)) for field, title in raw_sections),
        )

    default_key = str(payload.get("default_preset") or "")
    if default_key not in presets:
        raise RuntimeError(f"Unknown default extraction preset: {default_key}")
    return default_key, presets


DEFAULT_EXTRACTION_PRESET, EXTRACTION_PRESETS = _load_registry()


def get_extraction_preset(key: str | None) -> ExtractionPreset:
    resolved_key = key if key is not None else DEFAULT_EXTRACTION_PRESET
    try:
        return EXTRACTION_PRESETS[resolved_key]
    except KeyError as exc:
        raise ValueError(f"Unknown extraction preset: {resolved_key}") from exc


def render_extraction_markdown(preset: ExtractionPreset, payload: dict[str, Any]) -> str:
    intro_value = str(payload.get(preset.intro_key, "")).strip()
    if not intro_value:
        raise ValueError(f"Extraction output is missing required intro field: {preset.intro_key}")
    lines = [f"## {preset.label}", "", intro_value]

    for field, title in preset.sections:
        value = payload.get(field)
        if isinstance(value, str):
            cleaned = value.strip()
            if cleaned:
                lines.extend(["", f"### {title}", cleaned])
            continue
        if isinstance(value, list):
            cleaned_items = [str(item).strip() for item in value if str(item).strip()]
            if cleaned_items:
                lines.extend(["", f"### {title}"])
                lines.extend([f"- {item}" for item in cleaned_items])

    return "\n".join(lines).strip() + "\n"
