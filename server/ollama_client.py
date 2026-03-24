import json
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


def _json_loads_maybe(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except Exception:
        return value


def _parse_jsonish(raw: str) -> Any:
    if not raw:
        return raw
    direct = _json_loads_maybe(raw)
    if isinstance(direct, (dict, list)):
        return direct

    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", raw, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        inner = fenced.group(1).strip()
        parsed = _json_loads_maybe(inner)
        if isinstance(parsed, (dict, list)):
            return parsed

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = raw[start : end + 1]
        parsed = _json_loads_maybe(candidate)
        if isinstance(parsed, (dict, list)):
            return parsed

    return raw


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip('/')


def _build_markdown(summary: str, bullets: list[str], action_items: list[str] | None = None, title: str | None = None) -> str:
    heading = title.strip() if title and title.strip() else "Summary"
    lines = [f"## {heading}", "", summary.strip() or "No summary produced."]
    if bullets:
        lines.extend(["", "### Key Points"])
        lines.extend([f"- {bullet}" for bullet in bullets if bullet])
    if action_items:
        cleaned = [item for item in action_items if item]
        if cleaned:
            lines.extend(["", "### Action Items"])
            lines.extend([f"- {item}" for item in cleaned])
    return "\n".join(lines).strip() + "\n"


GENERATION_MODEL_PREFERENCES = [
    "llama3.2",
    "llama3.1",
    "qwen2.5",
    "mistral",
    "phi4",
    "gemma3",
    "glm-5-extended:latest",
    "glm-5:cloud",
    "gpt-oss:20b-cloud",
    "qwen3.5:cloud",
    "kimi-k2.5:cloud",
    "minimax-m2.5:cloud",
    "deepseek-v3.2:cloud",
]

EMBED_MODEL_PREFERENCES = [
    "nomic-embed-text-v2-moe:latest",
    "nomic-embed-text",
    "mxbai-embed-large",
]


@dataclass(frozen=True)
class OllamaConfig:
    base_url: str
    model: str
    embed_model: str
    timeout_seconds: float


class OllamaError(RuntimeError):
    pass


class OllamaClient:
    def __init__(self, config: OllamaConfig | None = None):
        if config is None:
            config = OllamaConfig(
                base_url=_normalize_base_url(os.environ.get("CHROMEAI_OLLAMA_BASE_URL", "http://127.0.0.1:11434")),
                model=os.environ.get("CHROMEAI_OLLAMA_MODEL", "llama3.2"),
                embed_model=os.environ.get("CHROMEAI_OLLAMA_EMBED_MODEL", "nomic-embed-text-v2-moe:latest"),
                timeout_seconds=float(os.environ.get("CHROMEAI_OLLAMA_TIMEOUT_SECONDS", "30")),
        )
        self.config = config

    def _tag_entries(self) -> list[dict[str, Any]]:
        tags = self.tags()
        entries = []
        for item in tags.get("models", []):
            if not isinstance(item, dict):
                continue
            entries.append(item)
        return entries

    def _model_names(self, local_only: bool = False) -> list[str]:
        models = []
        for item in self._tag_entries():
            if local_only and item.get("remote_host"):
                continue
            name = item.get("model") or item.get("name") or item.get("model_name")
            if name:
                models.append(str(name))
        return models

    def _resolve_model(self, requested: str, preferences: list[str], models: list[str]) -> str:
        if requested in models:
            return requested
        for candidate in preferences:
            for model in models:
                if model == candidate or model.startswith(f"{candidate}:"):
                    return model
        if models:
            return models[0]
        return requested

    def _request_json(self, path: str, payload: dict[str, Any] | None = None) -> Any:
        url = urljoin(self.config.base_url + "/", path.lstrip("/"))
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        req = Request(url, data=data, method="POST" if payload is not None else "GET")
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req, timeout=self.config.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace") if getattr(e, "fp", None) else ""
            raise OllamaError(f"{path} returned {e.code}: {raw or e.reason}") from e
        except URLError as e:
            raise OllamaError(f"cannot reach Ollama at {self.config.base_url}: {e.reason}") from e

        try:
            return json.loads(raw) if raw else {}
        except json.JSONDecodeError as e:
            raise OllamaError(f"invalid JSON from Ollama at {path}: {raw[:200]}") from e

    def tags(self) -> dict[str, Any]:
        return self._request_json("/api/tags", None)

    def active_generation_model(self, models: list[str] | None = None) -> str:
        models = models if models is not None else self._model_names()
        return self._resolve_model(self.config.model, GENERATION_MODEL_PREFERENCES, models)

    def active_embedding_model(self, models: list[str] | None = None) -> str:
        models = models if models is not None else self._model_names()
        return self._resolve_model(self.config.embed_model, EMBED_MODEL_PREFERENCES, models)

    def health(self) -> dict[str, Any]:
        try:
            all_models = self._model_names()
            local_models = self._model_names(local_only=True)
        except OllamaError as e:
            return {
                "configured": True,
                "base_url": self.config.base_url,
                "requested_model": self.config.model,
                "requested_embed_model": self.config.embed_model,
                "active_model": self.config.model,
                "active_embed_model": self.config.embed_model,
                "timeout_seconds": self.config.timeout_seconds,
                "reachable": False,
                "status": "degraded",
                "error": str(e),
                "models": [],
                "local_models": [],
                "ignored_remote_models": [],
                "model_available": False,
                "embed_model_available": False,
                "missing_models": [self.config.model, self.config.embed_model],
                "privacy_mode": "local-only",
                "hint": f"Start Ollama or point CHROMEAI_OLLAMA_BASE_URL at it.",
            }

        active_model = self.active_generation_model(local_models)
        active_embed_model = self.active_embedding_model(local_models)
        base = {
            "configured": True,
            "base_url": self.config.base_url,
            "requested_model": self.config.model,
            "requested_embed_model": self.config.embed_model,
            "active_model": active_model,
            "active_embed_model": active_embed_model,
            "timeout_seconds": self.config.timeout_seconds,
        }
        return {
            **base,
            "reachable": True,
            "status": "ok" if active_model in local_models else "degraded",
            "models": all_models,
            "local_models": local_models,
            "ignored_remote_models": [name for name in all_models if name not in local_models],
            "model_available": active_model in local_models,
            "embed_model_available": active_embed_model in local_models,
            "missing_models": [name for name, available in (
                (self.config.model, self.config.model in local_models),
                (self.config.embed_model, self.config.embed_model in local_models),
            ) if not available],
            "privacy_mode": "local-only",
            "hint": None if active_model in local_models else f"Pull a local model such as `{self.config.model}` or set CHROMEAI_OLLAMA_MODEL to an installed local model.",
        }

    def summarize(self, text: str, title: str | None = None, url: str | None = None, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        model = self.active_generation_model(self._model_names(local_only=True))
        schema = {
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "bullets": {"type": "array", "items": {"type": "string"}},
                "action_items": {"type": "array", "items": {"type": "string"}},
                "title": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["summary", "bullets", "action_items", "title", "tags"],
            "additionalProperties": False,
        }
        prompt = (
            "Summarize the selected web content for a browser copilot.\n"
            "Return concise, useful JSON only.\n"
            "Rules:\n"
            "- summary: 1 to 3 sentences.\n"
            "- bullets: 3 to 7 short bullets.\n"
            "- action_items: optional follow-up actions inferred from the content.\n"
            "- title: a compact title.\n"
            "- tags: 3 to 8 short tags.\n\n"
            f"Title: {title or ''}\n"
            f"URL: {url or ''}\n"
            f"Metadata: {json.dumps(metadata or {}, ensure_ascii=True)}\n\n"
            f"Content:\n{text.strip()}"
        )
        payload = {
            "model": model,
            "prompt": prompt,
            "system": "You write precise summaries for selected text in a browser side panel.",
            "stream": False,
            "format": schema,
            "options": {"temperature": 0.2},
        }
        response = self._request_json("/api/generate", payload)
        raw_response = str(response.get("response", "")).strip()
        content = _parse_jsonish(raw_response)
        if not isinstance(content, dict):
            content = {
                "summary": raw_response or "No summary produced.",
                "bullets": [],
                "action_items": [],
                "title": title or "Summary",
                "tags": ["ollama", "fallback"],
            }

        summary = str(content.get("summary", "")).strip()
        bullets = [str(item).strip() for item in content.get("bullets", []) if str(item).strip()]
        action_items = [str(item).strip() for item in content.get("action_items", []) if str(item).strip()]
        title_out = str(content.get("title", title or "Summary")).strip() or "Summary"
        tags = [str(item).strip() for item in content.get("tags", []) if str(item).strip()]
        markdown = _build_markdown(summary, bullets, action_items, title_out)
        return {
            "summary": summary,
            "markdown": markdown,
            "bullets": bullets,
            "action_items": action_items,
            "title": title_out,
            "tags": tags,
            "model": response.get("model", model),
            "source": "ollama",
            "raw_response": raw_response,
        }

    def agent(self, prompt: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
        model = self.active_generation_model(self._model_names(local_only=True))
        context = context or {}
        selected_text = str(context.get("selection") or context.get("markdown") or "").strip()
        schema = {
            "type": "object",
            "properties": {
                "reasoning": {"type": "array", "items": {"type": "string"}},
                "markdown": {"type": "string"},
                "json": {"type": "object"},
            },
            "required": ["reasoning", "markdown", "json"],
            "additionalProperties": False,
        }
        user_prompt = (
            "You are a local-first browser copilot.\n"
            "Use the selected text and user prompt to produce actionable output.\n"
            "Return JSON only. Keep reasoning high-level and short; do not expose hidden chain-of-thought.\n\n"
            f"User prompt: {prompt.strip()}\n"
            f"URL: {context.get('url', '')}\n"
            f"Title: {context.get('title', '')}\n"
            f"Selected text:\n{selected_text or 'No selected text provided.'}\n\n"
            f"Context JSON:\n{json.dumps(context, ensure_ascii=True)}\n\n"
            "Produce a concise browser-copilot response that helps the user use or transform the selected text."
        )
        payload = {
            "model": model,
            "prompt": user_prompt,
            "system": "You are a practical browser copilot that rewrites and structures selected text locally.",
            "stream": False,
            "format": schema,
            "options": {"temperature": 0.2},
        }
        response = self._request_json("/api/generate", payload)
        raw_response = str(response.get("response", "")).strip()
        content = _parse_jsonish(raw_response)
        if not isinstance(content, dict):
            content = {
                "reasoning": ["Model response was not valid JSON"],
                "markdown": raw_response or "No response produced.",
                "json": {
                    "raw": raw_response,
                    "prompt": prompt,
                },
            }

        if "reasoning" not in content or "markdown" not in content or "json" not in content:
            result = content.get("result", {}) if isinstance(content.get("result"), dict) else {}
            items = []
            if isinstance(content.get("action_items"), list) and content.get("action_items"):
                items = content.get("action_items", [])
            elif isinstance(content.get("items"), list) and content.get("items"):
                items = content.get("items", [])
            elif isinstance(result, dict) and isinstance(result.get("items"), list):
                items = result.get("items", [])
            summary = str(
                content.get("intent")
                or (result.get("summary") if isinstance(result, dict) else "")
                or content.get("summary")
                or prompt
            ).strip()
            reasoning = [
                "Model returned task-oriented JSON",
                f"Intent: {summary or 'analysis'}",
            ]
            markdown_lines = ["### Browser Copilot", "", summary]
            if isinstance(items, list) and items:
                markdown_lines.extend(["", "### Items"])
                for item in items:
                    if isinstance(item, dict):
                        task = str(item.get("task", "Item")).strip()
                        notes = str(item.get("notes") or item.get("details") or item.get("description") or "").strip()
                        priority = str(item.get("priority", "")).strip()
                        suffix = f" ({priority})" if priority else ""
                        markdown_lines.append(f"- {task}{suffix}" + (f" - {notes}" if notes else ""))
                    else:
                        markdown_lines.append(f"- {item}")
            suggestion = str(content.get("suggestion") or "").strip()
            output = str(
                content.get("output")
                or content.get("content")
                or content.get("answer")
                or (result.get("output") if isinstance(result, dict) else "")
                or ""
            ).strip()
            if suggestion:
                markdown_lines.extend(["", "### Suggestion", suggestion])
            if output:
                markdown_lines.extend(["", "### Result", output])
            markdown = "\n".join(markdown_lines).strip() + "\n"
            details = {
                "summary": summary,
                "items": items,
                "suggestion": suggestion if suggestion else None,
                "output": output if output else None,
                "raw": content,
            }
        else:
            reasoning = [str(item).strip() for item in content.get("reasoning", []) if str(item).strip()]
            markdown = str(content.get("markdown", "")).strip()
            details = content.get("json", {})
            if not isinstance(details, dict):
                details = {"value": details}
        return {
            "reasoning": reasoning,
            "markdown": markdown,
            "json": details,
            "model": response.get("model", model),
            "source": "ollama",
            "raw_response": raw_response,
        }

    def embed(self, text: str) -> dict[str, Any]:
        model = self.active_embedding_model(self._model_names(local_only=True))
        payload = {
            "model": model,
            "input": text,
        }
        response = self._request_json("/api/embed", payload)
        embeddings = response.get("embeddings")
        vector = []
        if isinstance(embeddings, list) and embeddings:
            vector = embeddings[0]
        elif isinstance(response.get("embedding"), list):
            vector = response.get("embedding")
        return {
            "vector": vector,
            "model": response.get("model", model),
            "source": "ollama",
        }
