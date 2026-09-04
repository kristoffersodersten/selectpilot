"""module_name: installation_manager; spec_ref: "provisioning_layer"."""
from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from urllib.request import Request, urlopen

from ollama_client import (
    DEFAULT_GENERATION_KEEP_ALIVE_SECONDS,
    GENERATION_KEEP_ALIVE_ENV,
    parse_generation_keep_alive_seconds,
)
from runtime_profiles import get_runtime_profile, recommend_runtime_profile, required_generation_models

OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/Ollama-darwin.zip"
OLLAMA_TEAM_ID = "3MU9H2V9Y9"
OLLAMA_IDENTIFIER = "com.electron.ollama"


class InstallationManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = {
            "state": "idle",
            "label": "Ready to install",
            "progress": 0,
            "profile": None,
            "action_required": None,
        }

    def status(self) -> dict:
        with self._lock:
            return dict(self._state)

    def _update(self, **values: object) -> None:
        with self._lock:
            self._state.update(values)

    def start(self, consent: bool) -> dict:
        if consent is not True:
            raise ValueError("installation_consent_required")
        if platform.system() != "Darwin":
            raise RuntimeError("macos_required")
        with self._lock:
            if self._state["state"] == "installing":
                return dict(self._state)
            self._state.update(state="installing", label="Preparing", progress=4, action_required=None)
        threading.Thread(target=self._run, name="selectpilot-installation", daemon=True).start()
        return self.status()

    def _ollama_cli(self) -> Path | None:
        candidates = [
            Path("/Applications/Ollama.app/Contents/Resources/ollama"),
            Path.home() / "Applications/Ollama.app/Contents/Resources/ollama",
        ]
        executable = shutil.which("ollama")
        if executable:
            candidates.insert(0, Path(executable))
        return next((path for path in candidates if path.is_file() and os.access(path, os.X_OK)), None)

    def _install_ollama(self) -> Path:
        existing = self._ollama_cli()
        if existing:
            return existing
        self._update(label="Installing", progress=12)
        with tempfile.TemporaryDirectory(prefix="selectpilot-ollama-") as temporary:
            root = Path(temporary)
            archive = root / "Ollama-darwin.zip"
            with urlopen(OLLAMA_DOWNLOAD_URL, timeout=60) as response, archive.open("wb") as output:
                total = int(response.headers.get("Content-Length") or 0)
                received = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    received += len(chunk)
                    if total:
                        self._update(progress=min(38, 12 + round(26 * received / total)))
            subprocess.run(["/usr/bin/ditto", "-x", "-k", str(archive), str(root)], check=True)
            application = root / "Ollama.app"
            requirement = (
                f'anchor apple generic and certificate leaf[subject.OU] = "{OLLAMA_TEAM_ID}" '
                f'and identifier "{OLLAMA_IDENTIFIER}"'
            )
            subprocess.run(
                ["/usr/bin/codesign", "--verify", "--deep", "--strict", f"-R={requirement}", str(application)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            destination_root = Path.home() / "Applications"
            destination_root.mkdir(mode=0o700, parents=True, exist_ok=True)
            destination = destination_root / "Ollama.app"
            if destination.exists():
                shutil.rmtree(destination)
            shutil.move(str(application), str(destination))
        return destination / "Contents/Resources/ollama"

    def _wait_for_ollama(self) -> None:
        for _ in range(60):
            try:
                with urlopen("http://127.0.0.1:11434/api/version", timeout=1) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(1)
        raise RuntimeError("ollama_start_timeout")

    def _pull_model(self, model: str, start: int, end: int) -> None:
        request = Request(
            "http://127.0.0.1:11434/api/pull",
            data=json.dumps({"model": model, "stream": True}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=3600) as response:
            for line in response:
                event = json.loads(line)
                total = event.get("total")
                completed = event.get("completed")
                if isinstance(total, int) and total > 0 and isinstance(completed, int):
                    self._update(progress=min(end, start + round((end - start) * completed / total)))
                if event.get("error"):
                    raise RuntimeError("model_download_failed")

    def _warm_model(self, model: str, num_ctx: int) -> None:
        seed = int(os.environ.get("CHROMEAI_OLLAMA_SEED", "42"))
        if seed < 0:
            raise RuntimeError("model_warmup_failed")
        keep_alive_seconds = parse_generation_keep_alive_seconds(
            os.environ.get(GENERATION_KEEP_ALIVE_ENV, DEFAULT_GENERATION_KEEP_ALIVE_SECONDS),
        )
        request = Request(
            "http://127.0.0.1:11434/api/generate",
            data=json.dumps({
                "model": model,
                "prompt": "Return only: ready",
                "stream": False,
                "keep_alive": keep_alive_seconds,
                "options": {
                    "temperature": 0,
                    "seed": seed,
                    "num_ctx": num_ctx,
                    "num_predict": 8,
                },
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=600) as response:
            result = json.load(response)
        if result.get("done") is not True:
            raise RuntimeError("model_warmup_failed")

    def _run(self) -> None:
        try:
            recommendation = recommend_runtime_profile()
            profile = get_runtime_profile(recommendation["recommended_profile"])
            generation_models = required_generation_models(profile)
            self._update(profile=profile.key, model_bundle=[model for model, _ in generation_models])
            ollama = self._install_ollama()
            self._update(label="Starting local processing", progress=42)
            subprocess.run(["/usr/bin/open", str(ollama.parents[2]), "--args", "hidden"], check=True)
            self._wait_for_ollama()
            self._update(label="Optimizing for this Mac", progress=48)
            model_span = 40 / max(1, len(generation_models))
            for index, (model, _) in enumerate(generation_models):
                start = round(48 + index * model_span)
                end = round(48 + (index + 1) * model_span)
                self._pull_model(model, start, end)
            self._pull_model(profile.embedding_model, 88, 94)
            self._update(label="Final checks", progress=96)
            for model, num_ctx in reversed(generation_models):
                self._warm_model(model, num_ctx)
            time.sleep(0.2)
            self._update(state="ready", label="Go", progress=100)
        except Exception as error:
            code = str(error) if str(error) in {
                "ollama_start_timeout", "model_download_failed", "model_warmup_failed", "macos_required"
            } else "installation_failed"
            self._update(
                state="action_required",
                label="A little more time is needed",
                action_required=code,
            )


INSTALLATION = InstallationManager()
