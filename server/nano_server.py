#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import random
import socket
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone

from ollama_client import OllamaClient, OllamaError
from runtime_profiles import build_bootstrap_commands, list_runtime_profiles, recommend_runtime_profile

ALLOWED_MIN = 8080
ALLOWED_MAX = 8100


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


def find_free_port(rng: range) -> int:
    for _ in range(len(rng)):
        port = random.choice(list(rng))
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("no free port in range")


def ensure_dirs(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def write_port_info(port_file: Path, port: int):
    port_file.write_text(f"set $nano_port {port};\n", encoding="utf-8")


OLLAMA = OllamaClient()
PROJECT_ROOT = Path(__file__).resolve().parents[1]


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port-range', default='8080-8100')
    parser.add_argument('--run-dir', default='/usr/local/var/run/chromeai')
    parser.add_argument('--log-dir', default='/usr/local/var/log/chromeai')
    parser.add_argument('--binary-path', default=None)
    parser.add_argument('--binary-hash', default=None)
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    log_dir = Path(args.log_dir)
    ensure_dirs(run_dir)
    ensure_dirs(log_dir)
    port_file = run_dir / 'port.info'

    try:
        pr = args.port_range.split('-')
        rng = range(int(pr[0]), int(pr[1]) + 1)
    except Exception:
        rng = range(ALLOWED_MIN, ALLOWED_MAX + 1)

    binary_path = Path(args.binary_path) if args.binary_path else Path(__file__)
    expected = args.binary_hash or os.environ.get('CHROMEAI_BINARY_HASH')
    verify_binary(binary_path, expected)

    port = find_free_port(rng)
    write_port_info(port_file, port)

    server = HTTPServer(('127.0.0.1', port), Handler)
    print(f"nano server listening on {port}")
    server.serve_forever()


if __name__ == '__main__':
    main()
