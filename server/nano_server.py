#!/usr/bin/env python3
import argparse
import base64
import hmac
import hashlib
import json
import os
import socket
import threading
import time
from collections import deque
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

from ollama_client import OllamaClient, OllamaError
from runtime_profiles import build_bootstrap_commands, list_runtime_profiles, recommend_runtime_profile

DEFAULT_PORT = 8083
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}

ALLOWED_BRIDGE_ENDPOINT_PATHS = [
    "/health",
    "/privacy-proof",
    "/profiles",
    "/runtime-meta/health",
    "/runtime-meta/stream",
    "/intent/compile",
    "/benchmark",
    "/summarize",
    "/extract",
    "/agent",
    "/embed",
    "/transcribe",
    "/vision",
    "/license/verify",
]


@dataclass(frozen=True)
class OperationContract:
    name: str
    endpoint: str
    template: str
    allowed_fields: tuple[str, ...]


OPERATION_CONTRACTS: dict[str, OperationContract] = {
    "/intent/compile": OperationContract(
        name="intent_compile",
        endpoint="/intent/compile",
        template="intent_compile.v2",
        allowed_fields=("intent", "has_selection", "has_page_text", "session_id"),
    ),
    "/summarize": OperationContract(
        name="summarize",
        endpoint="/summarize",
        template="summarize.v1",
        allowed_fields=("text", "title", "url", "metadata", "session_id"),
    ),
    "/extract": OperationContract(
        name="extract",
        endpoint="/extract",
        template="extract.v1",
        allowed_fields=("text", "preset", "title", "url", "metadata", "session_id"),
    ),
    "/agent": OperationContract(
        name="agent",
        endpoint="/agent",
        template="agent.v1",
        allowed_fields=("prompt", "context", "session_id"),
    ),
    "/embed": OperationContract(
        name="embed",
        endpoint="/embed",
        template="embed.v1",
        allowed_fields=("text", "session_id"),
    ),
    "/transcribe": OperationContract(
        name="transcribe",
        endpoint="/transcribe",
        template="transcribe.v1",
        allowed_fields=("audioUrl", "mediaId", "session_id"),
    ),
    "/vision": OperationContract(
        name="vision",
        endpoint="/vision",
        template="vision.v1",
        allowed_fields=("imageBase64", "videoFrame", "session_id"),
    ),
    "/license/verify": OperationContract(
        name="license_verify",
        endpoint="/license/verify",
        template="license_verify.v1",
        allowed_fields=("token",),
    ),
    "/benchmark": OperationContract(
        name="benchmark",
        endpoint="/benchmark",
        template="benchmark.v1",
        allowed_fields=(),
    ),
}


class ValidationError(RuntimeError):
    def __init__(self, code: str, message: str, *, status: int = 400, details: dict | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}


def _expect_dict(value: object, *, field: str = "payload") -> dict:
    if not isinstance(value, dict):
        raise ValidationError(
            "invalid_request_payload",
            f"{field} must be a JSON object",
            details={"field": field, "expected": "object"},
        )
    return value


def _expect_string(payload: dict, field: str, *, required: bool = False, allow_empty: bool = True) -> str | None:
    raw = payload.get(field)
    if raw is None:
        if required:
            raise ValidationError(
                "invalid_request_field",
                f"{field} is required",
                details={"field": field, "expected": "string"},
            )
        return None
    if not isinstance(raw, str):
        raise ValidationError(
            "invalid_request_field",
            f"{field} must be a string",
            details={"field": field, "expected": "string"},
        )
    value = raw.strip()
    if not allow_empty and not value:
        raise ValidationError(
            "invalid_request_field",
            f"{field} cannot be empty",
            details={"field": field, "expected": "non-empty string"},
        )
    return value


def _expect_optional_dict(payload: dict, field: str) -> dict | None:
    raw = payload.get(field)
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValidationError(
            "invalid_request_field",
            f"{field} must be an object when provided",
            details={"field": field, "expected": "object"},
        )
    return raw


def validate_summarize_payload(payload: object) -> dict:
    body = _expect_dict(payload)
    _expect_string(body, "text", required=True, allow_empty=False)
    _expect_string(body, "title", required=False, allow_empty=True)
    _expect_string(body, "url", required=False, allow_empty=True)
    _expect_optional_dict(body, "metadata")
    return body


def validate_extract_payload(payload: object) -> dict:
    body = _expect_dict(payload)
    _expect_string(body, "text", required=True, allow_empty=False)
    _expect_string(body, "preset", required=False, allow_empty=True)
    _expect_string(body, "title", required=False, allow_empty=True)
    _expect_string(body, "url", required=False, allow_empty=True)
    _expect_optional_dict(body, "metadata")
    return body


def validate_agent_payload(payload: object) -> dict:
    body = _expect_dict(payload)
    _expect_string(body, "prompt", required=True, allow_empty=False)
    _expect_optional_dict(body, "context")
    return body


def validate_embed_payload(payload: object) -> dict:
    body = _expect_dict(payload)
    _expect_string(body, "text", required=True, allow_empty=False)
    return body


def validate_intent_compile_payload(payload: object) -> dict:
    body = _expect_dict(payload)
    _expect_string(body, "intent", required=True, allow_empty=False)
    for field in ("has_selection", "has_page_text"):
        raw = body.get(field)
        if raw is None:
            continue
        if not isinstance(raw, bool):
            raise ValidationError(
                "invalid_request_field",
                f"{field} must be a boolean",
                details={"field": field, "expected": "boolean"},
            )
    return body


def _validate_list_of_strings(value: object, field: str) -> None:
    if not isinstance(value, list):
        raise ValidationError(
            "invalid_model_output",
            f"{field} must be a list",
            status=502,
            details={"field": field, "expected": "array<string>"},
        )
    for item in value:
        if not isinstance(item, str):
            raise ValidationError(
                "invalid_model_output",
                f"{field} must contain only strings",
                status=502,
                details={"field": field, "expected": "array<string>"},
            )


def _validate_object_output(value: object, field: str) -> None:
    if not isinstance(value, dict):
        raise ValidationError(
            "invalid_model_output",
            f"{field} must be an object",
            status=502,
            details={"field": field, "expected": "object"},
        )


def validate_summarize_response(response: object) -> dict:
    body = _expect_dict(response, field="response")
    for key in ["summary", "markdown", "title", "model", "source", "raw_response"]:
        if not isinstance(body.get(key), str):
            raise ValidationError(
                "invalid_model_output",
                f"{key} must be a string",
                status=502,
                details={"field": key, "expected": "string"},
            )
    _validate_list_of_strings(body.get("bullets"), "bullets")
    _validate_list_of_strings(body.get("action_items"), "action_items")
    _validate_list_of_strings(body.get("tags"), "tags")
    return body


def validate_agent_response(response: object) -> dict:
    body = _expect_dict(response, field="response")
    for key in ["markdown", "model", "source", "raw_response"]:
        if not isinstance(body.get(key), str):
            raise ValidationError(
                "invalid_model_output",
                f"{key} must be a string",
                status=502,
                details={"field": key, "expected": "string"},
            )
    _validate_list_of_strings(body.get("reasoning"), "reasoning")
    _validate_object_output(body.get("json"), "json")
    return body


def validate_extract_response(response: object) -> dict:
    body = _expect_dict(response, field="response")
    for key in ["preset", "label", "description", "markdown", "model", "source", "raw_response"]:
        if not isinstance(body.get(key), str):
            raise ValidationError(
                "invalid_model_output",
                f"{key} must be a string",
                status=502,
                details={"field": key, "expected": "string"},
            )
    _validate_object_output(body.get("json"), "json")
    return body


def get_operation_contract(path: str) -> OperationContract | None:
    return OPERATION_CONTRACTS.get(path)


def enforce_contract_fields(payload: dict, contract: OperationContract) -> None:
    if not contract.allowed_fields and payload:
        raise ValidationError(
            "invalid_request_field",
            f"{contract.endpoint} does not accept request fields",
            details={
                "operation": contract.name,
                "allowed_fields": list(contract.allowed_fields),
                "unexpected_fields": sorted(payload.keys()),
            },
        )

    unexpected = sorted([key for key in payload.keys() if key not in contract.allowed_fields])
    if unexpected:
        raise ValidationError(
            "invalid_request_field",
            f"Unexpected fields for {contract.endpoint}: {', '.join(unexpected)}",
            details={
                "operation": contract.name,
                "allowed_fields": list(contract.allowed_fields),
                "unexpected_fields": unexpected,
            },
        )


def _resolve_trace_id(payload: dict, headers: dict[str, str]) -> str:
    header_trace = str(headers.get("x-selectpilot-trace-id") or headers.get("x-trace-id") or "").strip()
    body_trace = str(payload.get("session_id") or "").strip() if isinstance(payload, dict) else ""
    if header_trace:
        return header_trace
    if body_trace:
        return body_trace
    basis = {
        "payload": payload if isinstance(payload, dict) else {},
        "content_type": str(headers.get("content-type") or ""),
    }
    digest = hashlib.sha256(
        json.dumps(basis, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:24]
    return f"sp_{digest}"


def log_runtime_event(event: str, trace_id: str, operation: str, status: str, details: dict | None = None) -> None:
    payload = {
        "event": event,
        "trace_id": trace_id,
        "operation": operation,
        "status": status,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    if details:
        payload["details"] = details
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def verify_binary(path: Path, expected_hash: str | None = None) -> bool:
    if not path.exists():
        print(f"binary missing: {path}")
        return False
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    digest = h.hexdigest()
    if expected_hash and digest != expected_hash:
        print(f"binary hash mismatch: {digest} != {expected_hash}")
        return False
    return True
def ensure_dirs(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def write_port_info(port_file: Path, port: int):
    port_file.write_text(f"set $nano_port {port};\n", encoding="utf-8")


OLLAMA = OllamaClient()
PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_DIR = PROJECT_ROOT / "runtime"
RUNTIME_POLICY_PATH = RUNTIME_DIR / "model_policy.json"
RUNTIME_REGISTRY_PATH = RUNTIME_DIR / "model_registry.runtime.json"
LIVE_FEEDBACK_PATH = RUNTIME_DIR / "live_feedback.jsonl"
_LIVE_FEEDBACK_LOCK = threading.Lock()

RUNTIME_META_EVENT_VERSION = "1.0"
RUNTIME_META_DEFAULT_LATENCY_HINT_MS = 1200
INTENT_AMBIGUITY_THRESHOLD = 0.4
MODEL_HYSTERESIS_MIN_RUNS = 5
MODEL_HYSTERESIS_COOLDOWN_MS = 86_400_000
MODEL_FAILURE_ISOLATION_THRESHOLD = 0.2
MODEL_FAILURE_ISOLATION_WINDOW = 10

DETERMINISTIC_MODEL_REGISTRY = [
    {
        "id": "qwen2.5:0.5b",
        "capability_profile": {"classification": 0.9, "extract": 0.82, "rewrite": 0.75, "analyze": 0.72},
        "resource_profile": {"memory": 1, "latency": 1},
        "benchmark_scores": {"precision": 0.81, "validation_pass_rate": 0.93, "retry_rate": 0.07},
        "installation_state": "installed",
    },
    {
        "id": "qwen2.5:1.5b",
        "capability_profile": {"classification": 0.94, "extract": 0.9, "rewrite": 0.84, "analyze": 0.83},
        "resource_profile": {"memory": 2, "latency": 2},
        "benchmark_scores": {"precision": 0.88, "validation_pass_rate": 0.95, "retry_rate": 0.05},
        "installation_state": "installed",
    },
]

def _append_live_feedback(event: dict) -> None:
    try:
        ensure_dirs(RUNTIME_DIR)
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **event,
        }
        line = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        with _LIVE_FEEDBACK_LOCK:
            with LIVE_FEEDBACK_PATH.open("a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")
    except Exception:
        # Feedback sink must not break request handling.
        return


def _load_json_file(path: Path) -> dict | None:
    try:
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _hardware_rank(profile: str) -> int:
    ranks = {
        "low": 1,
        "medium": 2,
        "medium_gpu": 3,
        "high": 4,
        "any": 0,
    }
    return int(ranks.get(str(profile or "").strip(), 0))


def _runtime_policy_select(
    *,
    task_analysis: dict,
    available_model_ids: list[str],
) -> dict | None:
    policy = _load_json_file(RUNTIME_POLICY_PATH)
    registry = _load_json_file(RUNTIME_REGISTRY_PATH)
    if not isinstance(policy, dict) or not isinstance(registry, dict):
        return None

    policy_version = str(policy.get("policy_version") or "") or None
    defaults = policy.get("defaults") if isinstance(policy.get("defaults"), list) else []
    quarantined = set()
    for item in policy.get("quarantined_models") or []:
        if isinstance(item, dict):
            mid = str(item.get("model_id") or "").strip()
            if mid:
                quarantined.add(mid)

    registry_models = registry.get("models") if isinstance(registry.get("models"), list) else []
    registry_by_id: dict[str, dict] = {}
    for item in registry_models:
        if not isinstance(item, dict):
            continue
        mid = str(item.get("model_id") or "").strip()
        if mid:
            registry_by_id[mid] = item

    task_family = str(task_analysis.get("task_type") or "agent")
    output_mode = str(task_analysis.get("output_structure") or "freeform")
    hardware_profile = str(task_analysis.get("hardware_profile") or os.environ.get("CHROMEAI_HARDWARE_PROFILE", "medium"))
    override_model = str(task_analysis.get("manual_override_model") or "").strip()
    allow_quarantined_override = os.environ.get("CHROMEAI_ALLOW_QUARANTINED_OVERRIDE", "0").strip().lower() in {"1", "true", "yes"}

    def _hardware_allows(model_id: str) -> bool:
        record = registry_by_id.get(model_id, {})
        min_hw = str(record.get("min_hardware_profile") or "low")
        return _hardware_rank(hardware_profile) >= _hardware_rank(min_hw)

    def _model_available(model_id: str) -> bool:
        return model_id in available_model_ids and model_id in registry_by_id

    if override_model:
        if _model_available(override_model) and _hardware_allows(override_model):
            if override_model not in quarantined or allow_quarantined_override:
                return {
                    "model_id": override_model,
                    "selection_path": "manual_override",
                    "selection_reason": "manual_override_model_if_explicitly_set_and_allowed",
                    "policy_version": policy_version,
                    "promotion_applied": False,
                }

    matches = []
    for entry in defaults:
        if not isinstance(entry, dict):
            continue
        if str(entry.get("task_family") or "") != task_family:
            continue
        if str(entry.get("hardware_profile") or "") != hardware_profile:
            continue
        if str(entry.get("output_mode") or "") != output_mode:
            continue
        matches.append(entry)

    if not matches:
        return None

    chosen = matches[0]
    preferred = str(chosen.get("preferred_model_id") or "").strip()
    if preferred and _model_available(preferred) and _hardware_allows(preferred) and preferred not in quarantined and not _is_quarantined(preferred):
        return {
            "model_id": preferred,
            "selection_path": "runtime_policy_preferred",
            "selection_reason": str(chosen.get("selection_reason") or "runtime_policy_preferred_model_if_available_and_not_quarantined"),
            "policy_version": policy_version,
            "promotion_applied": True,
        }

    for fallback in chosen.get("fallback_model_ids") or []:
        model_id = str(fallback or "").strip()
        if not model_id:
            continue
        if model_id in quarantined:
            continue
        if _is_quarantined(model_id):
            continue
        if _model_available(model_id) and _hardware_allows(model_id):
            return {
                "model_id": model_id,
                "selection_path": "runtime_policy_fallback",
                "selection_reason": "runtime_policy_fallback_models_in_order",
                "policy_version": policy_version,
                "promotion_applied": True,
            }

    return None


def _now_ms() -> int:
    return int(time.time() * 1000)


def record_model_feedback(model_id: str, *, success: bool, retries: int, latency_ms: int, cancelled: bool = False) -> None:
    return


def _is_quarantined(model_id: str) -> bool:
    return False


def _recent_feedback_penalty(model_id: str) -> float:
    return 0.0


def apply_hysteresis(task_type: str, selected_model_id: str, available_model_ids: list[str]) -> str:
    return selected_model_id


class RuntimeMetaBus:
    def __init__(self, *, max_events: int = 500):
        self._events = deque(maxlen=max_events)
        self._seq = 0
        self._active_streams = 0
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)

    def publish(self, event: dict) -> dict:
        with self._condition:
            self._seq += 1
            enriched = {
                **event,
                "seq": self._seq,
                "event_version": RUNTIME_META_EVENT_VERSION,
            }
            self._events.append(enriched)
            self._condition.notify_all()
            return enriched

    def wait_for_events(self, after_seq: int, timeout_seconds: float = 20.0) -> list[dict]:
        with self._condition:
            if self._seq <= after_seq:
                self._condition.wait(timeout=timeout_seconds)
            return [event for event in self._events if int(event.get("seq", 0)) > after_seq]

    def active_stream_count(self) -> int:
        with self._lock:
            return self._active_streams

    def increment_streams(self):
        with self._lock:
            self._active_streams += 1

    def decrement_streams(self):
        with self._lock:
            self._active_streams = max(0, self._active_streams - 1)


def sanitize_runtime_meta_details(details: dict | None) -> dict:
    if not details:
        return {}
    redacted_markers = ("text", "prompt", "selection", "content", "raw")
    safe: dict[str, object] = {}
    for key, value in details.items():
        key_str = str(key)
        lowered = key_str.lower()
        if any(marker in lowered for marker in redacted_markers):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key_str] = value
        elif isinstance(value, list):
            safe[key_str] = len(value)
        elif isinstance(value, dict):
            safe[key_str] = {k: v for k, v in value.items() if isinstance(v, (str, int, float, bool, type(None)))}
        else:
            safe[key_str] = str(value)
    return safe


def build_runtime_meta_event(
    *,
    event_type: str,
    trace_id: str,
    operation: str,
    status: str,
    step: str | None = None,
    message: str | None = None,
    latency_hint_ms: int | None = None,
    duration_ms: int | None = None,
    details: dict | None = None,
) -> dict:
    payload: dict[str, object] = {
        "type": "runtime_meta",
        "event_type": event_type,
        "trace_id": trace_id,
        "operation": operation,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "privacy": {
            "selected_text_exposed": False,
            "local_only": True,
        },
    }
    if step:
        payload["step"] = step
    if message:
        payload["message"] = message
    if latency_hint_ms is not None:
        payload["latency_hint_ms"] = latency_hint_ms
    if duration_ms is not None:
        payload["duration_ms"] = duration_ms
    safe_details = sanitize_runtime_meta_details(details)
    if safe_details:
        payload["details"] = safe_details
    return payload


RUNTIME_META = RuntimeMetaBus()


def emit_runtime_meta(
    *,
    event_type: str,
    trace_id: str,
    operation: str,
    status: str,
    step: str | None = None,
    message: str | None = None,
    latency_hint_ms: int | None = None,
    duration_ms: int | None = None,
    details: dict | None = None,
) -> None:
    event = build_runtime_meta_event(
        event_type=event_type,
        trace_id=trace_id,
        operation=operation,
        status=status,
        step=step,
        message=message,
        latency_hint_ms=latency_hint_ms,
        duration_ms=duration_ms,
        details=details,
    )
    RUNTIME_META.publish(event)


def ensure_runtime_models() -> dict:
    """Ensure profile-selected local models are available.

    This keeps startup aligned with runtime profile selection so the server
    can run with a hardware-fit local model set.
    """
    health = OLLAMA.health()
    generation_model = str(health.get("requested_model") or "").strip()
    embedding_model = str(health.get("requested_embed_model") or "").strip()

    models_to_ensure = [name for name in [generation_model, embedding_model] if name]
    if not models_to_ensure:
        return {"ok": True, "already_present": [], "pulled": [], "failed": {}}

    result = OLLAMA.ensure_models(models_to_ensure)
    if not result.get("ok"):
        print(f"warning: failed to ensure one or more models: {result.get('failed')}")
    elif result.get("pulled"):
        print(f"pulled models: {', '.join(result['pulled'])}")
    else:
        print("runtime models already present")
    return result


def compile_intent_to_ir(intent: str, *, has_selection: bool, has_page_text: bool) -> dict:
    normalized = intent.strip().lower()
    if not normalized:
        raise ValidationError(
            "invalid_request_field",
            "intent cannot be empty",
            details={"field": "intent", "expected": "non-empty string"},
        )

    extract_markers = ("extract", "json", "structured", "schema", "action", "tasks")
    summarize_markers = ("summar", "brief", "compress", "tl;dr")
    agent_markers = ("rewrite", "answer", "explain", "ask", "clarify")

    score_extract = sum(1 for marker in extract_markers if marker in normalized)
    score_summarize = sum(1 for marker in summarize_markers if marker in normalized)
    score_agent = sum(1 for marker in agent_markers if marker in normalized)

    scores = {
        "extract": score_extract,
        "summarize": score_summarize,
        "agent": score_agent,
    }
    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_op, best_score = ranked[0]
    second_score = ranked[1][1]

    no_signal = best_score == 0
    tie = best_score == second_score
    ambiguity_score = 1.0 if (no_signal or tie) else round(second_score / max(best_score, 1), 2)

    if "extract" in normalized or "json" in normalized or "structured" in normalized:
        output_structure = "strict_json"
    elif "rewrite" in normalized:
        output_structure = "freeform"
    else:
        output_structure = "semi_structured"

    task_analysis = {
        "task_type": "extract" if score_extract > max(score_summarize, score_agent) else "summarize" if score_summarize > score_agent else "agent",
        "complexity": "high" if len(normalized) > 120 else "medium" if len(normalized) > 60 else "low",
        "precision_requirement": "high" if output_structure == "strict_json" else "medium",
        "latency_sensitivity": "high" if "quick" in normalized or "fast" in normalized else "medium",
        "output_structure": output_structure,
    }

    if (no_signal or tie) and not has_selection and not has_page_text:
        return {
            "clarify_required": True,
            "ambiguity_score": 1.0,
            "question": "What should SelectPilot do with your content?",
            "options": [
                "Extract structured JSON",
                "Summarize for quick decision",
                "Answer or rewrite with a custom prompt",
            ],
            "ir": {
                "version": "intent-ir.v1",
                "source": "deterministic-rule-compiler",
                "operation_family": "unknown",
                "action": "clarify",
                "target": None,
                "constraints": {
                    "format": "freeform",
                    "strictness": "high",
                },
                "operations_considered": ["extract", "summarize", "agent"],
                "requires_clarification": True,
            },
            "task_analysis": task_analysis,
        }

    if no_signal or tie or ambiguity_score >= INTENT_AMBIGUITY_THRESHOLD:
        return {
            "clarify_required": True,
            "ambiguity_score": ambiguity_score,
            "question": "Your intent is ambiguous. Should I extract JSON, summarize, or run an agent prompt?",
            "options": [
                "Extract structured JSON",
                "Summarize for quick decision",
                "Run custom agent prompt",
            ],
            "ir": {
                "version": "intent-ir.v1",
                "source": "deterministic-rule-compiler",
                "operation_family": "ambiguous",
                "action": "clarify",
                "target": None,
                "constraints": {
                    "format": "freeform",
                    "strictness": "high",
                },
                "operations_considered": ["extract", "summarize", "agent"],
                "requires_clarification": True,
            },
            "task_analysis": task_analysis,
        }

    selected_model = select_smallest_sufficient_model(task_analysis)

    template_by_operation = {
        "extract": "extract.v1",
        "summarize": "summarize.v1",
        "agent": "agent.v1",
    }

    return {
        "clarify_required": False,
        "ambiguity_score": ambiguity_score,
        "operation": best_op,
        "template": template_by_operation[best_op],
        "prompt_version": "deterministic.prompts.v3",
        "output_enforcement": {
            "mode": "strict_json_retry_once" if best_op == "extract" else "deterministic_validate",
            "max_attempts": 2 if best_op == "extract" else 1,
            "visible_retries": True,
        },
        "task_analysis": task_analysis,
        "model_selection": selected_model,
        "model_locked_per_operation": True,
        "prompting": {
            "version": "deterministic.prompts.v3",
            "deterministic": True,
            "temperature": fixed_temperature_for_task(task_analysis.get("task_type", best_op)),
            "no_runtime_mutation": True,
        },
        "ir": {
            "version": "intent-ir.v1",
            "source": "deterministic-rule-compiler",
            "operation_family": best_op,
            "action": best_op,
            "target": "selection" if has_selection else "page_context" if has_page_text else None,
            "constraints": {
                "format": "structured" if best_op == "extract" else "freeform" if best_op == "agent" else "structured",
                "strictness": "high" if best_op == "extract" else "medium",
            },
            "operations_considered": ["extract", "summarize", "agent"],
            "selected_operation": best_op,
            "requires_clarification": False,
            "latency_budget_ms": latency_budget_for_operation(best_op),
            "memory_guard": {
                "threshold_ratio": 0.8,
                "strategy": "lru_eviction",
                "max_payload_chars": 120000,
            },
        },
    }


def latency_budget_for_operation(operation: str) -> int:
    budgets = {
        "classification": 500,
        "rewrite": 1200,
        "extract": 2000,
        "analyze": 3000,
        "summarize": 1200,
        "agent": 3000,
    }
    return int(budgets.get(operation, RUNTIME_META_DEFAULT_LATENCY_HINT_MS))


def _model_is_sufficient(model: dict, required_precision: float) -> bool:
    scores = model.get("benchmark_scores", {})
    return (
        float(scores.get("precision", 0.0)) >= required_precision
        and float(scores.get("validation_pass_rate", 0.0)) >= 0.9
        and float(scores.get("retry_rate", 1.0)) <= 0.1
    )


def _task_capability_key(task_type: str) -> str:
    mapping = {
        "extract": "extract",
        "summarize": "classification",
        "agent": "analyze",
        "rewrite": "rewrite",
        "classification": "classification",
        "analyze": "analyze",
    }
    return mapping.get(str(task_type), "analyze")


def _effective_precision_with_feedback(model_id: str, model: dict) -> float:
    precision = float(model.get("benchmark_scores", {}).get("precision", 0.0))
    penalty = _recent_feedback_penalty(model_id)
    adjusted = precision - min(0.3, penalty * 0.1)
    return max(0.0, adjusted)


def select_smallest_sufficient_model(task_analysis: dict) -> dict:
    precision_requirement = str(task_analysis.get("precision_requirement") or "medium")
    required_precision = 0.87 if precision_requirement == "high" else 0.8
    task_type = str(task_analysis.get("task_type") or "agent")
    capability_key = _task_capability_key(task_type)

    provisioned_models = [m for m in DETERMINISTIC_MODEL_REGISTRY if str(m.get("installation_state") or "") == "installed"]
    if not provisioned_models:
        raise ValidationError(
            "model_not_provisioned",
            "No local deterministic model is provisioned for execution",
            status=503,
            details={"policy": "local_preprovisioned_only", "required_state": "installed"},
        )

    candidates = [m for m in provisioned_models if _model_is_sufficient(m, required_precision)]
    if not candidates:
        candidates = list(provisioned_models)

    quarantined = [m for m in candidates if _is_quarantined(str(m.get("id") or ""))]
    non_quarantined = [m for m in candidates if not _is_quarantined(str(m.get("id") or ""))]
    if non_quarantined:
        candidates = non_quarantined
    elif quarantined:
        raise ValidationError(
            "no_non_quarantined_model_available",
            "All sufficient local models are currently quarantined",
            status=503,
            details={
                "policy": "quarantine_exclusion_strict",
                "quarantined_models": [str(m.get("id") or "") for m in quarantined],
            },
        )

    scored_candidates: list[tuple[dict, float, float, float]] = []
    for model in candidates:
        model_id = str(model.get("id") or "")
        penalty = _recent_feedback_penalty(model_id)
        capability = float(model.get("capability_profile", {}).get(capability_key, 0.0))
        effective_precision = _effective_precision_with_feedback(model_id, model)
        scored_candidates.append((model, penalty, capability, effective_precision))

    sorted_candidates = sorted(
        scored_candidates,
        key=lambda item: (
            item[1],
            -item[2],
            int(item[0].get("resource_profile", {}).get("memory", 999)),
            int(item[0].get("resource_profile", {}).get("latency", 999)),
            -item[3],
        ),
    )

    if not sorted_candidates:
        raise ValidationError(
            "hard_error_if_no_sufficient_model",
            "No local model could be selected after deterministic filtering",
            status=503,
            details={"selection_order_terminal": True},
        )

    selected = sorted_candidates[0][0]
    available_ids = [str(item[0].get("id") or "") for item in sorted_candidates]

    policy_selection = _runtime_policy_select(task_analysis=task_analysis, available_model_ids=available_ids)
    if policy_selection and str(policy_selection.get("model_id") or "") in available_ids:
        selected_id = str(policy_selection.get("model_id") or "")
        selection_path = str(policy_selection.get("selection_path") or "runtime_policy_preferred")
        selection_reason = str(policy_selection.get("selection_reason") or "runtime_policy_selected")
        policy_version = policy_selection.get("policy_version")
        promotion_applied = bool(policy_selection.get("promotion_applied"))
        selected = next((item[0] for item in sorted_candidates if str(item[0].get("id") or "") == selected_id), selected)
    else:
        raise ValidationError(
            "runtime_policy_no_match",
            "No runtime policy match for deterministic model selection",
            status=503,
            details={
                "task_type": task_type,
                "available_model_ids": available_ids,
                "policy_required": True,
            },
        )

    selected_penalty = _recent_feedback_penalty(selected_id)
    return {
        "model": selected.get("id"),
        "reason": selection_reason,
        "selection_path": selection_path,
        "policy_version": policy_version,
        "promotion_applied": promotion_applied,
        "latency_budget_ms": latency_budget_for_operation(str(task_analysis.get("task_type") or "agent")),
        "memory_guard": {
            "threshold_ratio": 0.8,
            "strategy": "lru_eviction",
        },
        "selection_constraints": ["latency_budget", "memory_guard"],
        "tie_break": ["lower_memory", "lower_latency", "higher_precision"],
        "hysteresis": {
            "min_runs": MODEL_HYSTERESIS_MIN_RUNS,
            "cooldown_ms": MODEL_HYSTERESIS_COOLDOWN_MS,
        },
        "failure_isolation": {
            "threshold": MODEL_FAILURE_ISOLATION_THRESHOLD,
            "window": MODEL_FAILURE_ISOLATION_WINDOW,
        },
        "feedback_loop": {
            "recent_penalty": round(selected_penalty, 4),
            "window": MODEL_FAILURE_ISOLATION_WINDOW,
            "task_capability_key": capability_key,
        },
        "provisioning_policy": {
            "policy": "local_preprovisioned_only",
            "required_state": "installed",
            "selected_state": selected.get("installation_state"),
            "auto_pull_allowed": False,
        },
        "selection_progress": {
            "phase": "stable_selection",
            "considered": len(scored_candidates),
            "quarantined_excluded": len(quarantined),
            "final_model": selected.get("id"),
            "selection_path": selection_path,
        },
    }


def fixed_temperature_for_task(task_type: str) -> float:
    values = {
        "classification": 0.0,
        "extract": 0.0,
        "rewrite": 0.3,
        "analyze": 0.2,
        "summarize": 0.2,
        "agent": 0.2,
    }
    return float(values.get(str(task_type), 0.2))


def run_with_output_enforcement(
    *,
    trace_id: str,
    operation: str,
    execute_fn,
    validate_fn,
    max_attempts: int = 2,
):
    attempt = 1
    while attempt <= max_attempts:
        candidate = execute_fn()
        try:
            return validate_fn(candidate), attempt
        except ValidationError as e:
            if e.code != "invalid_model_output" or attempt >= max_attempts:
                raise
            emit_runtime_meta(
                event_type="RETRY_SCHEDULED",
                trace_id=trace_id,
                operation=operation,
                status="running",
                step="VALIDATE_OUTPUT",
                message="Model output failed schema validation; scheduling deterministic retry",
                details={
                    "attempt": attempt,
                    "next_attempt": attempt + 1,
                    "max_attempts": max_attempts,
                    "reason_code": e.code,
                },
            )
            attempt += 1


def enforce_runtime_response_invariants(path: str, response_payload: object) -> None:
    if not isinstance(response_payload, dict):
        raise ValidationError(
            "invalid_runtime_invariant",
            "Response payload must be an object",
            status=500,
            details={"path": path},
        )

    if path in {"/summarize", "/agent", "/extract"}:
        model = response_payload.get("model")
        source = response_payload.get("source")
        if not isinstance(model, str) or not model:
            raise ValidationError(
                "invalid_runtime_invariant",
                "Model identifier is required for deterministic response",
                status=500,
                details={"path": path, "field": "model"},
            )
        if not isinstance(source, str) or not source:
            raise ValidationError(
                "invalid_runtime_invariant",
                "Source is required for deterministic response",
                status=500,
                details={"path": path, "field": "source"},
            )

    if path == "/intent/compile":
        ir = response_payload.get("ir")
        if not isinstance(ir, dict) or not isinstance(ir.get("version"), str):
            raise ValidationError(
                "invalid_runtime_invariant",
                "Intent compiler response must include deterministic IR version",
                status=500,
                details={"path": path, "field": "ir.version"},
            )


def _is_local_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    return parsed.hostname in LOCAL_HOSTS


def build_privacy_proof(health: dict | None = None, port: int = DEFAULT_PORT) -> dict:
    snapshot = health or OLLAMA.health()
    bridge_base = f"http://127.0.0.1:{port}"
    ollama_base = str(snapshot.get("base_url", ""))
    external_targets: list[str] = []
    if ollama_base and not _is_local_url(ollama_base):
        external_targets.append(ollama_base)

    has_external_calls = len(external_targets) > 0
    return {
        "ok": bool(snapshot.get("reachable")) and bool(snapshot.get("model_available")) and not has_external_calls,
        "privacy_mode": "local-only",
        "active_model": snapshot.get("active_model", "unknown"),
        "active_embed_model": snapshot.get("active_embed_model", "unknown"),
        "runtime_profile": os.environ.get("CHROMEAI_RUNTIME_PROFILE", "fast"),
        "allowed_bridge_origins": [
            "http://127.0.0.1",
            "http://localhost",
            "chrome-extension://*",
        ],
        "allowed_endpoints": [f"{bridge_base}{path}" for path in ALLOWED_BRIDGE_ENDPOINT_PATHS],
        "outbound_observation": {
            "external_calls_registered": has_external_calls,
            "external_targets": external_targets,
            "statement": (
                "No external outbound calls registered in local runtime path."
                if not has_external_calls
                else "External outbound target detected. Privacy boundary degraded."
            ),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def transcribe(payload: dict) -> dict:
    source = payload.get("audioUrl") or payload.get("mediaId") or "audio"
    text = f"Transcribed from {source}"
    return {"text": text, "confidence": 0.95}


def vision(payload: dict) -> dict:
    blob = payload.get("imageBase64") or payload.get("videoFrame") or ""
    digest = hashlib.sha256(blob.encode("utf-8")).hexdigest() if blob else ""
    text = f"Image signature {digest[:16]}" if digest else "No image provided"
    return {"text": text, "tags": ["ocr", "frame"] if blob else []}


def embed(payload: dict) -> dict:
    text = payload.get("text", "")
    try:
        return OLLAMA.embed(text)
    except OllamaError as e:
        raise RuntimeError(str(e)) from e


def agent(payload: dict) -> dict:
    prompt = payload.get("prompt", "")
    ctx = payload.get("context", {})
    return OLLAMA.agent(prompt, ctx)


def extract(payload: dict) -> dict:
    return OLLAMA.extract(
        payload.get("text", ""),
        preset_key=payload.get("preset"),
        title=payload.get("title"),
        url=payload.get("url"),
        metadata=payload.get("metadata"),
    )

def runtime_profiles() -> dict:
    recommendation = recommend_runtime_profile()
    profiles = []
    for item in list_runtime_profiles():
        commands = build_bootstrap_commands(item["key"], PROJECT_ROOT)
        profiles.append({**item, **commands})
    return {
        "profiles": profiles,
        **recommendation,
    }


def benchmark_runtime() -> dict:
    recommendation = recommend_runtime_profile()
    result = OLLAMA.benchmark()
    return {
        **result,
        "auto_profile": recommendation["recommended_profile"],
        "auto_profile_reason": recommendation["reason"],
    }


def license_verify(payload: dict) -> dict:
    token = payload.get("token", "")
    tier = "pro" if "pro" in token else "plus" if "plus" in token else "essential"
    token_basis = str(token or "")
    token_hash = hashlib.sha256(token_basis.encode("utf-8")).hexdigest()
    now = 1_700_000_000_000 + int(token_hash[:8], 16)
    features_by_tier = {
        "essential": [
            "selection_clipping",
            "markdown_export",
            "clipboard_export",
            "side_panel_ui",
            "structured_extraction",
            "canonical_metadata",
            "local_processing",
        ],
        "plus": [
            "selection_clipping",
            "markdown_export",
            "clipboard_export",
            "side_panel_ui",
            "structured_extraction",
            "canonical_metadata",
            "local_processing",
            "text_summarization",
            "basic_local_agent",
            "export_obsidian",
            "export_notion",
            "export_mem_ai",
            "export_apple_notes",
            "format_adapters",
            "one_click_export",
            "batch_clipping",
            "structured_summaries",
        ],
        "pro": [
            "selection_clipping",
            "markdown_export",
            "clipboard_export",
            "side_panel_ui",
            "structured_extraction",
            "canonical_metadata",
            "local_processing",
            "text_summarization",
            "basic_local_agent",
            "export_obsidian",
            "export_notion",
            "export_mem_ai",
            "export_apple_notes",
            "format_adapters",
            "one_click_export",
            "batch_clipping",
            "structured_summaries",
            "audio_transcription",
            "video_frame_ocr",
            "image_ocr",
            "multimodal_clipper",
            "local_embeddings",
            "advanced_agent_reasoning",
            "project_memory",
            "knowledge_graph",
            "offline_search",
            "auto_history_indexing",
        ],
    }
    entitlement = {
        "token": token,
        "tier": tier,
        "features": features_by_tier.get(tier, []),
        "issuedAt": now,
        "expiresAt": now + 30 * 24 * 60 * 60 * 1000,
    }

    # Minimal signed payload support for MVP environments.
    # In production, replace with Ed25519 signing and public-key verification in client.
    signing_secret = os.environ.get("CHROMEAI_ENTITLEMENT_SIGNING_SECRET", "")
    canonical = json.dumps(entitlement, separators=(",", ":"), ensure_ascii=False)
    signature = ""
    if signing_secret:
        digest = hmac.new(signing_secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).digest()
        signature = base64.b64encode(digest).decode("ascii")

    response = {
        "entitlement": entitlement,
        "signature": signature,
        "alg": "HMAC-SHA256" if signing_secret else "none",
        "kid": "local-dev",
    }
    return response


class Handler(BaseHTTPRequestHandler):
    server_version = "ChromeAINano/1.0"

    def _set_headers(self):
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, Last-Event-ID, x-selectpilot-trace-id, x-trace-id")

    def _write_json(self, status: int, payload: dict):
        self.send_response(status)
        self._set_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def _write_error(self, status: int, code: str, message: str, details: dict | None = None):
        payload = {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
            },
        }
        if details:
            payload["error"]["details"] = details
        self._write_json(status, payload)

    def do_OPTIONS(self):
        self._write_json(204, {})

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        if path == '/health':
            health = OLLAMA.health()
            self._write_json(200, {
                "ok": bool(health.get("reachable")) and bool(health.get("model_available")),
                "service": self.server_version,
                "ollama": health,
            })
            return
        if path == '/privacy-proof':
            self._write_json(200, build_privacy_proof())
            return
        if path == '/profiles':
            self._write_json(200, runtime_profiles())
            return
        if path == '/runtime-meta/health':
            self._write_json(200, {
                "ok": True,
                "service": self.server_version,
                "stream_enabled": True,
                "active_streams": RUNTIME_META.active_stream_count(),
                "event_version": RUNTIME_META_EVENT_VERSION,
            })
            return
        if path == '/runtime-meta/stream':
            query = parse_qs(parsed.query)
            after = query.get("after", [""])[0]
            header_last_event = str(self.headers.get("Last-Event-ID") or "").strip()
            try:
                after_seq = int(after or header_last_event or 0)
            except ValueError:
                after_seq = 0

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            RUNTIME_META.increment_streams()
            try:
                hello = {
                    "type": "runtime_meta",
                    "event_type": "STREAM_CONNECTED",
                    "status": "ok",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "event_version": RUNTIME_META_EVENT_VERSION,
                }
                self.wfile.write(f"event: runtime_meta\ndata: {json.dumps(hello, ensure_ascii=False, separators=(',', ':'))}\n\n".encode("utf-8"))
                self.wfile.flush()

                while True:
                    events = RUNTIME_META.wait_for_events(after_seq, timeout_seconds=20.0)
                    if events:
                        for event in events:
                            seq = int(event.get("seq", 0))
                            payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
                            self.wfile.write(f"id: {seq}\nevent: runtime_meta\ndata: {payload}\n\n".encode("utf-8"))
                            after_seq = max(after_seq, seq)
                        self.wfile.flush()
                    else:
                        heartbeat = {
                            "type": "runtime_meta",
                            "event_type": "STREAM_HEARTBEAT",
                            "status": "idle",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                        self.wfile.write(f"event: heartbeat\ndata: {json.dumps(heartbeat, ensure_ascii=False, separators=(',', ':'))}\n\n".encode("utf-8"))
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                return
            finally:
                RUNTIME_META.decrement_streams()
            return
        self._write_json(404, {"error": "not_found"})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
        except Exception:
            self._write_error(400, "invalid_json", "Request body must be valid JSON")
            return

        if not isinstance(payload, dict):
            self._write_error(400, "invalid_request_payload", "Request payload must be a JSON object")
            return

        path = self.path.rstrip('/')
        contract = get_operation_contract(path)
        if contract is None:
            self._write_json(404, {"error": "not_found"})
            return

        header_map = {k.lower(): v for k, v in self.headers.items()}
        trace_id = _resolve_trace_id(payload, header_map)
        started_at = time.perf_counter()

        emit_runtime_meta(
            event_type="RUNTIME_STARTED",
            trace_id=trace_id,
            operation=contract.name,
            status="running",
            message=f"Started {contract.name}",
            latency_hint_ms=RUNTIME_META_DEFAULT_LATENCY_HINT_MS,
            details={
                "endpoint": contract.endpoint,
                "template": contract.template,
                "request_fields": sorted(payload.keys()),
            },
        )

        log_runtime_event(
            "request.received",
            trace_id,
            contract.name,
            "start",
            {
                "endpoint": contract.endpoint,
                "template": contract.template,
                "fields": sorted(payload.keys()),
            },
        )

        current_step = "VALIDATE_INPUT"
        runtime_model_id: str | None = None
        retry_count = 0
        try:
            emit_runtime_meta(
                event_type="STEP_STARTED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Validating request against deterministic contract",
                details={"request_fields": sorted(payload.keys())},
            )
            enforce_contract_fields(payload, contract)

            if path == '/summarize':
                payload = validate_summarize_payload(payload)
            elif path == '/intent/compile':
                payload = validate_intent_compile_payload(payload)
            elif path == '/embed':
                payload = validate_embed_payload(payload)
            elif path == '/agent':
                payload = validate_agent_payload(payload)
            elif path == '/extract':
                payload = validate_extract_payload(payload)

            emit_runtime_meta(
                event_type="STEP_COMPLETED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Request contract validation complete",
            )

            current_step = "EXECUTE_LOCAL_OPERATION"
            emit_runtime_meta(
                event_type="STEP_STARTED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Executing local runtime step",
            )

            if path == '/summarize':
                def _execute_summarize():
                    return OLLAMA.summarize(
                        payload.get('text', ''),
                        title=payload.get('title'),
                        url=payload.get('url'),
                        metadata=payload.get('metadata'),
                    )

                resp = run_with_output_enforcement(
                    trace_id=trace_id,
                    operation=contract.name,
                    execute_fn=_execute_summarize,
                    validate_fn=validate_summarize_response,
                )
                if isinstance(resp, tuple):
                    resp, attempts = resp
                    retry_count = max(0, int(attempts) - 1)
                runtime_model_id = str(resp.get("model") or "") if isinstance(resp, dict) else None
            elif path == '/intent/compile':
                compiled = compile_intent_to_ir(
                    str(payload.get('intent', '')),
                    has_selection=bool(payload.get('has_selection')),
                    has_page_text=bool(payload.get('has_page_text')),
                )
                if compiled.get("clarify_required"):
                    emit_runtime_meta(
                        event_type="CLARIFICATION_REQUIRED",
                        trace_id=trace_id,
                        operation=contract.name,
                        status="running",
                        step="COMPILE_INTENT",
                        message=str(compiled.get("question") or "Clarification is required before execution"),
                        details={
                            "ambiguity_score": compiled.get("ambiguity_score"),
                            "options": compiled.get("options", []),
                        },
                    )
                resp = {
                    "trace_id": trace_id,
                    **compiled,
                }
                model_info = compiled.get("model_selection") if isinstance(compiled, dict) else None
                runtime_model_id = str(model_info.get("model") or "") if isinstance(model_info, dict) else None
                emit_runtime_meta(
                    event_type="INTENT_COMPILED",
                    trace_id=trace_id,
                    operation=contract.name,
                    status="running",
                    step="COMPILE_INTENT",
                    message="Intent compiled into deterministic IR",
                    latency_hint_ms=latency_budget_for_operation(str((compiled.get("task_analysis") or {}).get("task_type") or "agent")),
                    details={
                        "operation": compiled.get("operation") or "clarify",
                        "ambiguity_score": compiled.get("ambiguity_score"),
                        "model": runtime_model_id,
                        "reason": ((compiled.get("model_selection") or {}).get("reason") if isinstance(compiled.get("model_selection"), dict) else ""),
                    },
                )
            elif path == '/transcribe':
                resp = transcribe(payload)
            elif path == '/vision':
                resp = vision(payload)
            elif path == '/embed':
                resp = embed(payload)
            elif path == '/agent':
                resp = run_with_output_enforcement(
                    trace_id=trace_id,
                    operation=contract.name,
                    execute_fn=lambda: agent(payload),
                    validate_fn=validate_agent_response,
                )
                if isinstance(resp, tuple):
                    resp, attempts = resp
                    retry_count = max(0, int(attempts) - 1)
                runtime_model_id = str(resp.get("model") or "") if isinstance(resp, dict) else None
            elif path == '/extract':
                resp = run_with_output_enforcement(
                    trace_id=trace_id,
                    operation=contract.name,
                    execute_fn=lambda: extract(payload),
                    validate_fn=validate_extract_response,
                )
                if isinstance(resp, tuple):
                    resp, attempts = resp
                    retry_count = max(0, int(attempts) - 1)
                runtime_model_id = str(resp.get("model") or "") if isinstance(resp, dict) else None
            elif path == '/license/verify':
                resp = license_verify(payload)
            elif path == '/benchmark':
                resp = benchmark_runtime()

            emit_runtime_meta(
                event_type="STEP_COMPLETED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Local runtime step completed",
            )

            current_step = "VALIDATE_OUTPUT"
            emit_runtime_meta(
                event_type="STEP_STARTED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Validating deterministic response schema",
            )

            # summarize/agent/extract are validated inside run_with_output_enforcement
            # so that schema failures can emit visible retry events before completion.

            emit_runtime_meta(
                event_type="STEP_COMPLETED",
                trace_id=trace_id,
                operation=contract.name,
                status="running",
                step=current_step,
                message="Response schema validation complete",
            )
        except ValidationError as e:
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            _append_live_feedback({
                "trace_id": trace_id,
                "operation": contract.name,
                "status": "validation_error",
                "duration_ms": duration_ms,
                "error_code": e.code,
                "step": current_step,
            })
            log_runtime_event(
                "request.failed",
                trace_id,
                contract.name,
                "validation_error",
                {"code": e.code, "message": e.message, "details": e.details},
            )
            emit_runtime_meta(
                event_type="STEP_FAILED",
                trace_id=trace_id,
                operation=contract.name,
                status="error",
                step=current_step,
                message=e.message,
                details={"code": e.code},
            )
            emit_runtime_meta(
                event_type="RUNTIME_FAILED",
                trace_id=trace_id,
                operation=contract.name,
                status="error",
                message=e.message,
                duration_ms=duration_ms,
                details={"code": e.code},
            )
            self._write_error(e.status, e.code, e.message, e.details)
            return
        except (RuntimeError, OllamaError) as e:
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            _append_live_feedback({
                "trace_id": trace_id,
                "operation": contract.name,
                "status": "runtime_error",
                "duration_ms": duration_ms,
                "error_code": "ollama_unavailable",
                "step": current_step,
            })
            log_runtime_event(
                "request.failed",
                trace_id,
                contract.name,
                "runtime_error",
                {"code": "ollama_unavailable", "message": str(e)},
            )
            emit_runtime_meta(
                event_type="STEP_FAILED",
                trace_id=trace_id,
                operation=contract.name,
                status="error",
                step=current_step,
                message=str(e),
                details={"code": "ollama_unavailable"},
            )
            emit_runtime_meta(
                event_type="RUNTIME_FAILED",
                trace_id=trace_id,
                operation=contract.name,
                status="error",
                message=str(e),
                duration_ms=duration_ms,
                details={"code": "ollama_unavailable"},
            )
            self._write_error(503, "ollama_unavailable", str(e))
            return

        if isinstance(resp, dict):
            resp.setdefault("trace_id", trace_id)

        try:
            enforce_runtime_response_invariants(path, resp)
        except ValidationError as e:
            duration_ms = round((time.perf_counter() - started_at) * 1000)
            _append_live_feedback({
                "trace_id": trace_id,
                "operation": contract.name,
                "status": "invariant_error",
                "duration_ms": duration_ms,
                "error_code": e.code,
                "step": "VALIDATE_RUNTIME_INVARIANTS",
            })
            emit_runtime_meta(
                event_type="RUNTIME_FAILED",
                trace_id=trace_id,
                operation=contract.name,
                status="error",
                message=e.message,
                duration_ms=duration_ms,
                details={"code": e.code},
            )
            self._write_error(e.status, e.code, e.message, e.details)
            return

        duration_ms = round((time.perf_counter() - started_at) * 1000)

        if runtime_model_id and path in {'/summarize', '/agent', '/extract'}:
            record_model_feedback(runtime_model_id, success=True, retries=retry_count, latency_ms=duration_ms)

        model_selection = resp.get("model_selection") if isinstance(resp, dict) else None
        _append_live_feedback({
            "trace_id": trace_id,
            "operation": contract.name,
            "endpoint": contract.endpoint,
            "status": "completed",
            "duration_ms": duration_ms,
            "retry_count": retry_count,
            "model_id": runtime_model_id,
            "selection_path": (
                str(model_selection.get("selection_path") or "")
                if isinstance(model_selection, dict)
                else ""
            ) or None,
            "policy_version": (
                model_selection.get("policy_version")
                if isinstance(model_selection, dict)
                else None
            ),
            "promotion_applied": (
                bool(model_selection.get("promotion_applied"))
                if isinstance(model_selection, dict)
                else None
            ),
        })

        log_runtime_event(
            "request.completed",
            trace_id,
            contract.name,
            "ok",
            {"endpoint": contract.endpoint},
        )
        emit_runtime_meta(
            event_type="RUNTIME_COMPLETED",
            trace_id=trace_id,
            operation=contract.name,
            status="completed",
            message=f"Completed {contract.name}",
            duration_ms=duration_ms,
            details={"endpoint": contract.endpoint},
        )
        self._write_json(200, resp)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--port-range', default=None)
    parser.add_argument('--run-dir', default=os.path.expanduser('~/Library/Application Support/SelectPilot/run'))
    parser.add_argument('--log-dir', default=os.path.expanduser('~/Library/Logs/SelectPilot'))
    parser.add_argument('--binary-path', default=None)
    parser.add_argument('--binary-hash', default=None)
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    log_dir = Path(args.log_dir)
    ensure_dirs(RUNTIME_DIR)
    ensure_dirs(run_dir)
    ensure_dirs(log_dir)
    port_file = run_dir / 'port.info'

    binary_path = Path(args.binary_path) if args.binary_path else Path(__file__)
    expected = args.binary_hash or os.environ.get('CHROMEAI_BINARY_HASH')
    verify_binary(binary_path, expected)

    auto_pull = os.environ.get('CHROMEAI_AUTO_PULL_MODELS', '1').strip().lower() not in {'0', 'false', 'no'}
    if auto_pull:
        ensure_runtime_models()

    port = args.port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError(f"port {port} is already in use")
    write_port_info(port_file, port)

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f"nano server listening on {port}")
    server.serve_forever()


if __name__ == '__main__':
    main()
