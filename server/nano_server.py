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


def summarize(text: str) -> dict:
    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    summary = ". ".join(sentences[:3]) + ("." if sentences else "")
    markdown = f"## Summary\n\n{summary}\n\n**Sentences:** {len(sentences)}"
    return {"summary": summary, "markdown": markdown}


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
    vec = []
    seed = hashlib.sha256(text.encode("utf-8")).digest()
    while len(vec) < 128:
        seed = hashlib.sha256(seed).digest()
        vec.extend([(b - 128) / 128 for b in seed])
    return {"vector": vec[:128]}


def agent(payload: dict) -> dict:
    prompt = payload.get("prompt", "")
    ctx = payload.get("context", {})
    reasoning = [
        "1. Detect input",
        "2. Classify content",
        "3. Normalize markdown",
        "4. Optional multimodal extraction",
        "5. Execute reasoning chain",
        "6. Produce structured output"
    ]
    markdown = f"### Agent Response\n\nPrompt: {prompt}\n\nContext keys: {list(ctx.keys())}"
    json_out = {"prompt": prompt, "context_keys": list(ctx.keys()), "ts": datetime.now(timezone.utc).isoformat()}
    return {"reasoning": reasoning, "markdown": markdown, "json": json_out}


def license_verify(payload: dict) -> dict:
    token = payload.get("token", "")
    tier = "pro" if "pro" in token else "plus" if "plus" in token else "essential"
    now = int(datetime.utcnow().timestamp() * 1000)
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
            self._write_json(200, {"ok": True, "service": self.server_version})
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
            resp = summarize(payload.get('text', ''))
        elif path == '/transcribe':
            resp = transcribe(payload)
        elif path == '/vision':
            resp = vision(payload)
        elif path == '/embed':
            resp = embed(payload)
        elif path == '/agent':
            resp = agent(payload)
        elif path == '/license/verify':
            resp = license_verify(payload)
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
