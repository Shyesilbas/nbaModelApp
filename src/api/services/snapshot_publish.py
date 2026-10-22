"""Publish the snapshot inputs (scripts/ops/publish_snapshot_data.py) from the frontend.

One background job at a time; the frontend polls the status. The script commits the data files
the cloud snapshot reads and pushes them, so the cloud predicts from the same games this machine
has fetched.
"""
from __future__ import annotations

import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[3]
TIMEOUT_SECONDS = 300

_lock = threading.Lock()
_state: Dict[str, Any] = {"status": "idle", "started_at": None, "finished_at": None, "message": None, "error": None}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_status() -> Dict[str, Any]:
    with _lock:
        return dict(_state)


def _run(command: List[str]) -> None:
    try:
        proc = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=TIMEOUT_SECONDS)
        lines = [l for l in proc.stdout.splitlines() if l.strip()]
        if proc.returncode == 0:
            update = {"status": "done", "message": lines[-1] if lines else "Done", "error": None}
        else:
            tail = (proc.stderr or proc.stdout).strip().splitlines()
            update = {"status": "failed", "message": None, "error": tail[-1] if tail else f"exit code {proc.returncode}"}
    except Exception as exc:
        update = {"status": "failed", "message": None, "error": str(exc)}
    with _lock:
        _state.update(update, finished_at=_now())


def start_publish(command: Optional[List[str]] = None) -> Dict[str, Any]:
    """Start the publish job unless one is already running; returns the current status."""
    with _lock:
        if _state["status"] == "running":
            return dict(_state)
        _state.update(status="running", started_at=_now(), finished_at=None, message=None, error=None)
        snapshot = dict(_state)
    cmd = command or [sys.executable, "scripts/ops/publish_snapshot_data.py"]
    threading.Thread(target=_run, args=(cmd,), daemon=True).start()
    return snapshot
