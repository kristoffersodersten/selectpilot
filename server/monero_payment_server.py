#!/usr/bin/env python3
"""
Minimal Monero -> entitlement bridge for local-first billing MVP.

Flow:
1) POST /order                -> creates unique Monero subaddress per order
2) background polling loop    -> checks wallet RPC incoming transfers
3) payment confirmed          -> grants entitlement token
4) GET /order/<id>            -> client polls paid/token status
5) POST /license/verify       -> extension verifies entitlement tier

This is intentionally simple and file-based for MVP use.
"""

import json
import os
import secrets
import time
from pathlib import Path
from threading import Lock, Thread

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

# ---- CONFIG ----
RPC_URL = os.environ.get("CHROMEAI_MONERO_RPC_URL", "http://127.0.0.1:18083/json_rpc")
DB_FILE = Path(os.environ.get("CHROMEAI_MONERO_DB_FILE", "monero-billing-db.json"))
ADMIN_SECRET = os.environ.get("CHROMEAI_ADMIN_SECRET", "CHANGE_ME")
CONFIRMATIONS_REQUIRED = int(os.environ.get("CHROMEAI_MONERO_CONFIRMATIONS", "10"))
POLL_INTERVAL_SECONDS = int(os.environ.get("CHROMEAI_MONERO_POLL_SECONDS", "20"))
ORDER_EXPIRY_MS = int(os.environ.get("CHROMEAI_MONERO_ORDER_EXPIRY_MS", str(30 * 60 * 1000)))

db_lock = Lock()


# ---- DB ----
def _default_db():
    return {"orders": {}, "entitlements": {}}


def load_db():
    if not DB_FILE.exists():
        return _default_db()
    return json.loads(DB_FILE.read_text(encoding="utf-8"))


def save_db(db):
    tmp = DB_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(db, indent=2), encoding="utf-8")
    tmp.replace(DB_FILE)


# ---- RPC ----
def rpc(method, params=None):
    r = requests.post(
        RPC_URL,
        json={
            "jsonrpc": "2.0",
            "id": "0",
            "method": method,
            "params": params or {},
        },
        timeout=10,
    )
    r.raise_for_status()
    payload = r.json()
    if "error" in payload:
        raise RuntimeError(f"Monero RPC error: {payload['error']}")
    return payload["result"]


def xmr_to_atomic(xmr_amount: float) -> int:
    return int(xmr_amount * 1e12)


# ---- CREATE ORDER ----
@app.post("/order")
def create_order():
    body = request.get_json(silent=True) or {}
    xmr = body.get("xmr")
    if xmr is None:
        return jsonify({"error": "xmr_required"}), 400

    try:
        xmr = float(xmr)
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_xmr"}), 400

    if xmr <= 0:
        return jsonify({"error": "xmr_must_be_positive"}), 400

    tier = body.get("tier", "plus")
    if tier not in {"essential", "plus", "pro"}:
        return jsonify({"error": "invalid_tier"}), 400

    order_id = body.get("order_id") or ("SP-" + secrets.token_hex(4))

    res = rpc(
        "create_address",
        {
            "account_index": 0,
            "label": order_id,
        },
    )

    now = int(time.time() * 1000)
    order = {
        "order_id": order_id,
        "address": res["address"],
        "address_index": res["address_index"],
        "expected_xmr": xmr,
        "expected_atomic": xmr_to_atomic(xmr),
        "confirmations": 0,
        "paid": False,
        "tier": tier,
        "created": now,
        "expires_at": now + ORDER_EXPIRY_MS,
    }

    with db_lock:
        db = load_db()
        db["orders"][order_id] = order
        save_db(db)

    return jsonify(
        {
            "order_id": order_id,
            "address": order["address"],
            "xmr": xmr,
            "expires_at": order["expires_at"],
            "confirmations_required": CONFIRMATIONS_REQUIRED,
        }
    )


# ---- VERIFY TRANSFERS ----
def check_payments():
    with db_lock:
        db = load_db()

    transfers = rpc("get_transfers", {"in": True}).get("in", [])
    now = int(time.time() * 1000)

    changed = False
    for order_id, order in db["orders"].items():
        if order.get("paid"):
            continue
        if now > order.get("expires_at", 0):
            continue

        best_confirmations = 0
        for tx in transfers:
            idx = tx.get("subaddr_index", {}).get("minor")
            if idx != order["address_index"]:
                continue

            confirmations = int(tx.get("confirmations", 0))
            amount = int(tx.get("amount", 0))
            best_confirmations = max(best_confirmations, confirmations)

            if amount >= order["expected_atomic"] and confirmations >= CONFIRMATIONS_REQUIRED:
                order["paid"] = True
                order["confirmations"] = confirmations
                token = "sp_" + secrets.token_urlsafe(24)
                issued = int(time.time() * 1000)

                db["entitlements"][token] = {
                    "tier": order["tier"],
                    "issuedAt": issued,
                    "expiresAt": issued + 30 * 24 * 60 * 60 * 1000,
                    "revoked": False,
                    "order_id": order_id,
                }

                order["token"] = token
                changed = True
                break

        if not order.get("paid") and best_confirmations != order.get("confirmations", 0):
            order["confirmations"] = best_confirmations
            changed = True

    if changed:
        with db_lock:
            save_db(db)


# ---- POLL LOOP ----
def background_loop():
    while True:
        try:
            check_payments()
        except Exception as e:
            print("poll error:", e)
        time.sleep(POLL_INTERVAL_SECONDS)


# ---- GET STATUS ----
@app.get("/order/<order_id>")
def order_status(order_id):
    with db_lock:
        db = load_db()
        order = db["orders"].get(order_id)

    if not order:
        return jsonify({"error": "not_found"}), 404

    return jsonify(
        {
            "order_id": order_id,
            "paid": bool(order.get("paid")),
            "confirmations": int(order.get("confirmations", 0)),
            "confirmations_required": CONFIRMATIONS_REQUIRED,
            "expires_at": order.get("expires_at"),
            "token": order.get("token") if order.get("paid") else None,
        }
    )


# ---- VERIFY LICENSE ----
@app.post("/license/verify")
def verify_license():
    body = request.get_json(silent=True) or {}
    token = (body.get("token") or "").strip()
    if not token:
        return jsonify({"error": "missing_token"}), 400

    with db_lock:
        db = load_db()
        record = db["entitlements"].get(token)

    if not record or record.get("revoked"):
        return jsonify({"error": "invalid"}), 401

    return jsonify(
        {
            "tier": record["tier"],
            "issuedAt": record["issuedAt"],
            "expiresAt": record.get("expiresAt"),
        }
    )


# ---- ADMIN REVOKE ----
@app.post("/admin/revoke")
def revoke():
    if request.headers.get("x-admin-secret") != ADMIN_SECRET:
        return jsonify({"error": "forbidden"}), 403

    body = request.get_json(silent=True) or {}
    token = body.get("token")
    if not token:
        return jsonify({"error": "missing_token"}), 400

    with db_lock:
        db = load_db()
        if token in db["entitlements"]:
            db["entitlements"][token]["revoked"] = True
            save_db(db)

    return jsonify({"ok": True})


@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "monero-payment-server"})


if __name__ == "__main__":
    Thread(target=background_loop, daemon=True).start()
    app.run(host="127.0.0.1", port=8090)
