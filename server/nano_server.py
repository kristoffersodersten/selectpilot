#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse

from ollama_client import OllamaClient, OllamaError
from runtime_profiles import build_bootstrap_commands, list_runtime_profiles, recommend_runtime_profile

DEFAULT_PORT = 8083
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}

ALLOWED_BRIDGE_ENDPOINT_PATHS = [
    "/health",
    "/privacy-proof",
    "/profiles",
    "/benchmark",
    "/summarize",
    "/extract",
    "/agent",
    "/embed",
    "/transcribe",
    "/vision",
    "/license/verify",
]


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
    text = f"Transcribed from {source} at {datetime.now(timezone.utc).isoformat()}"
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
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {"token": token, "tier": tier, "issuedAt": now, "expiresAt": now + 30 * 24 * 60 * 60 * 1000}


class Handler(BaseHTTPRequestHandler):
    server_version = "ChromeAINano/1.0"

    def _set_headers(self):
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _write_json(self, status: int, payload: dict):
        self.send_response(status)
        self._set_headers()
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

    def do_OPTIONS(self):
        self._write_json(204, {})

    def do_GET(self):
        if self.path.rstrip('/') == '/health':
            health = OLLAMA.health()
            self._write_json(200, {
                "ok": bool(health.get("reachable")) and bool(health.get("model_available")),
                "service": self.server_version,
                "ollama": health,
            })
            return
        if self.path.rstrip('/') == '/privacy-proof':
            self._write_json(200, build_privacy_proof())
            return
        if self.path.rstrip('/') == '/profiles':
            self._write_json(200, runtime_profiles())
            return
        self._write_json(404, {"error": "not_found"})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', '0'))
        body = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
        except Exception:
            payload = {}
        path = self.path.rstrip('/')
        if path == '/summarize':
            try:
                resp = OLLAMA.summarize(
                    payload.get('text', ''),
                    title=payload.get('title'),
                    url=payload.get('url'),
                    metadata=payload.get('metadata'),
                )
            except OllamaError as e:
                self._write_json(503, {"ok": False, "error": {"code": "ollama_unavailable", "message": str(e)}})
                return
        elif path == '/transcribe':
            resp = transcribe(payload)
        elif path == '/vision':
            resp = vision(payload)
        elif path == '/embed':
            try:
                resp = embed(payload)
            except RuntimeError as e:
                self._write_json(503, {"ok": False, "error": {"code": "ollama_unavailable", "message": str(e)}})
                return
        elif path == '/agent':
            try:
                resp = agent(payload)
            except OllamaError as e:
                self._write_json(503, {"ok": False, "error": {"code": "ollama_unavailable", "message": str(e)}})
                return
        elif path == '/extract':
            try:
                resp = extract(payload)
            except OllamaError as e:
                self._write_json(503, {"ok": False, "error": {"code": "ollama_unavailable", "message": str(e)}})
                return
        elif path == '/license/verify':
            resp = license_verify(payload)
        elif path == '/benchmark':
            try:
                resp = benchmark_runtime()
            except OllamaError as e:
                self._write_json(503, {"ok": False, "error": {"code": "ollama_unavailable", "message": str(e)}})
                return
        else:
            self._write_json(404, {"error": "not_found"})
            return
        self._write_json(200, resp)


def _default_run_dir() -> str:
    env = os.environ.get('CHROMEAI_RUN_DIR')
    if env:
        return env
    import platform
    if platform.system() == 'Darwin':
        return os.path.expanduser('~/Library/Application Support/SelectPilot/run')
    return os.path.expanduser('~/.local/share/SelectPilot/run')


def _default_log_dir() -> str:
    env = os.environ.get('CHROMEAI_LOG_DIR')
    if env:
        return env
    import platform
    if platform.system() == 'Darwin':
        return os.path.expanduser('~/Library/Logs/SelectPilot')
    return os.path.expanduser('~/.local/share/SelectPilot/logs')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=DEFAULT_PORT)
    parser.add_argument('--port-range', default=None)
    parser.add_argument('--bind', default=os.environ.get('CHROMEAI_BIND_HOST', '127.0.0.1'),
                        help='Address to bind the server to (default: 127.0.0.1; '
                             'override with CHROMEAI_BIND_HOST env var)')
    parser.add_argument('--run-dir', default=_default_run_dir())
    parser.add_argument('--log-dir', default=_default_log_dir())
    parser.add_argument('--binary-path', default=None)
    parser.add_argument('--binary-hash', default=None)
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    log_dir = Path(args.log_dir)
    ensure_dirs(run_dir)
    ensure_dirs(log_dir)
    port_file = run_dir / 'port.info'

    binary_path = Path(args.binary_path) if args.binary_path else Path(__file__)
    expected = args.binary_hash or os.environ.get('CHROMEAI_BINARY_HASH')
    verify_binary(binary_path, expected)
    port = args.port
    bind = args.bind
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex((bind, port)) == 0:
            raise RuntimeError(f"port {port} is already in use")
    write_port_info(port_file, port)

    server = HTTPServer((bind, port), Handler)
    print(f"nano server listening on {bind}:{port}")
    server.serve_forever()


if __name__ == '__main__':
    main()
