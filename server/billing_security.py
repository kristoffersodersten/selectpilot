"""module_name: billing_security; spec_ref: "validation_layer"."""

from __future__ import annotations

import hmac
import json
import os
import secrets
from pathlib import Path
from urllib.parse import urlparse


LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def validated_wallet_rpc_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in LOCAL_HOSTS or parsed.path != "/json_rpc":
        raise RuntimeError("wallet_rpc_must_be_explicit_loopback_http")
    return value


def new_order_id() -> str:
    return "SP-" + secrets.token_hex(16)


def admin_secret_matches(configured: str, supplied: str | None) -> bool:
    if len(configured) < 32 or supplied is None:
        return False
    return hmac.compare_digest(configured, supplied)


def save_private_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if temporary.exists():
            temporary.unlink()
