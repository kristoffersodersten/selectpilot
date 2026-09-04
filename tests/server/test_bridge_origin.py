"""module_name: bridge_origin_tests; spec_ref: "testing_strategy.integration_tests"."""

from __future__ import annotations

import http.client
import json
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SERVER_DIR = ROOT / "server"
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from nano_server import Handler, MAX_REQUEST_BYTES  # noqa: E402


class BridgeOriginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(
        self,
        method: str,
        path: str,
        *,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        response_headers = dict(response.getheaders())
        connection.close()
        return response.status, response_headers, body

    def test_rejects_web_origin_without_wildcard_cors(self) -> None:
        status, headers, body = self.request("OPTIONS", "/extract", headers={"Origin": "https://malicious.example"})
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(json.loads(body)["error"]["code"], "origin_not_allowed")

    def test_accepts_valid_extension_origin_without_dynamic_cors_header(self) -> None:
        origin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
        status, headers, _body = self.request("OPTIONS", "/extract", headers={"Origin": origin})
        self.assertEqual(status, 204)
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_rejects_oversized_request_before_reading_body(self) -> None:
        status, _headers, body = self.request(
            "POST",
            "/extract",
            headers={"Content-Length": str(MAX_REQUEST_BYTES + 1)},
        )
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["error"]["code"], "request_too_large")

    def test_ollama_transport_timeout_returns_explicit_service_error(self) -> None:
        payload = json.dumps({"text": "selected text"}).encode("utf-8")
        with patch("ollama_client.urlopen", side_effect=TimeoutError("timed out")):
            status, _headers, body = self.request(
                "POST",
                "/extract",
                body=payload,
                headers={"Content-Type": "application/json"},
            )

        self.assertEqual(status, 503)
        self.assertEqual(json.loads(body)["error"]["code"], "ollama_unavailable")


if __name__ == "__main__":
    unittest.main()
