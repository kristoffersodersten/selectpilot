from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ExtractionPreset:
    key: str
    label: str
    description: str
    intro_key: str
    schema: dict[str, Any]
    instructions: str
    sections: tuple[tuple[str, str], ...]


EXTRACTION_PRESETS: dict[str, ExtractionPreset] = {
    "action_brief": ExtractionPreset(
        key="action_brief",
        label="Action Brief",
        description="Turn selected text into a concise action-oriented brief.",
        intro_key="summary",
        schema={
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "action_items": {"type": "array", "items": {"type": "string"}},
                "decisions": {"type": "array", "items": {"type": "string"}},
                "risks": {"type": "array", "items": {"type": "string"}},
                "follow_ups": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "action_items", "decisions", "risks", "follow_ups"],
            "additionalProperties": False,
        },
        instructions=(
            "Extract a tight action brief from the selected text.\n"
            "- summary: 1 to 2 sentences.\n"
            "- action_items: concrete next steps.\n"
            "- decisions: decisions already made.\n"
            "- risks: blockers or uncertainties.\n"
            "- follow_ups: open loops to revisit."
        ),
        sections=(
            ("action_items", "Action Items"),
            ("decisions", "Decisions"),
            ("risks", "Risks"),
            ("follow_ups", "Follow-ups"),
        ),
    ),
    "generic_json": ExtractionPreset(
        key="generic_json",
        label="Generic JSON",
        description="Create reusable structured output from any selected text.",
        intro_key="summary",
        schema={
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "key_points": {"type": "array", "items": {"type": "string"}},
                "entities": {"type": "array", "items": {"type": "string"}},
                "action_items": {"type": "array", "items": {"type": "string"}},
                "questions": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "key_points", "entities", "action_items", "questions"],
            "additionalProperties": False,
        },
        instructions=(
            "Convert the selected text into reusable structured data.\n"
            "- summary: 1 to 2 sentences.\n"
            "- key_points: the most important facts.\n"
            "- entities: named people, products, teams, or concepts.\n"
            "- action_items: concrete tasks implied by the text.\n"
            "- questions: unresolved questions or ambiguities."
        ),
        sections=(
            ("key_points", "Key Points"),
            ("entities", "Entities"),
            ("action_items", "Action Items"),
            ("questions", "Open Questions"),
        ),
    ),
    "job_brief": ExtractionPreset(
        key="job_brief",
        label="Job Brief",
        description="Turn a role description into a structured hiring brief.",
        intro_key="role",
        schema={
            "type": "object",
            "properties": {
                "role": {"type": "string"},
                "company_context": {"type": "string"},
                "requirements": {"type": "array", "items": {"type": "string"}},
                "nice_to_haves": {"type": "array", "items": {"type": "string"}},
                "risks": {"type": "array", "items": {"type": "string"}},
                "keywords": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["role", "company_context", "requirements", "nice_to_haves", "risks", "keywords"],
            "additionalProperties": False,
        },
        instructions=(
            "Turn the selected text into a compact job brief.\n"
            "- role: the job title or role focus.\n"
            "- company_context: one sentence of team or company context.\n"
            "- requirements: hard requirements.\n"
            "- nice_to_haves: soft requirements or bonuses.\n"
            "- risks: ambiguity, role scope issues, or hiring risks.\n"
            "- keywords: search terms or core skills."
        ),
        sections=(
            ("company_context", "Company Context"),
            ("requirements", "Requirements"),
            ("nice_to_haves", "Nice to Haves"),
            ("risks", "Risks"),
            ("keywords", "Keywords"),
        ),
    ),
    "decision_log": ExtractionPreset(
        key="decision_log",
        label="Decision Log",
        description="Capture a decision, rationale, risks, and next steps.",
        intro_key="decision",
        schema={
            "type": "object",
            "properties": {
                "decision": {"type": "string"},
                "why": {"type": "array", "items": {"type": "string"}},
                "risks": {"type": "array", "items": {"type": "string"}},
                "open_questions": {"type": "array", "items": {"type": "string"}},
                "next_steps": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["decision", "why", "risks", "open_questions", "next_steps"],
            "additionalProperties": False,
        },
        instructions=(
            "Turn the selected text into a decision log entry.\n"
            "- decision: the choice or recommendation.\n"
            "- why: short reasons or tradeoffs.\n"
            "- risks: downsides and uncertainty.\n"
            "- open_questions: unresolved decisions.\n"
            "- next_steps: concrete follow-up steps."
        ),
        sections=(
            ("why", "Why"),
            ("risks", "Risks"),
            ("open_questions", "Open Questions"),
            ("next_steps", "Next Steps"),
        ),
    ),
}

DEFAULT_EXTRACTION_PRESET = "action_brief"


def get_extraction_preset(key: str | None) -> ExtractionPreset:
    if key and key in EXTRACTION_PRESETS:
        return EXTRACTION_PRESETS[key]
    return EXTRACTION_PRESETS[DEFAULT_EXTRACTION_PRESET]


def render_extraction_markdown(preset: ExtractionPreset, payload: dict[str, Any]) -> str:
    intro_value = str(payload.get(preset.intro_key, "")).strip() or "No summary produced."
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
