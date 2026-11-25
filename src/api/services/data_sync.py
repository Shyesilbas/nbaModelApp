"""Background catch-up with the cloud morning sync and the status the frontend polls.

scripts/ops/local_catch_up.py pulls the cloud commits and rebuilds the local frontend store when they
brought something new. The API runs it at startup and every 30 minutes when NBA_AUTO_CATCH_UP=1
(scripts/start_all.sh sets it). The frontend polls `status()` and reloads its data whenever the
store's `built_at` changes, so new games appear without a manual refresh.
"""
from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]
INTERVAL_SECONDS = 30 * 60
LOG_PATH = REPO_ROOT / "logs" / "local_catch_up.log"

_state: dict[str, Any] = {"enabled": False, "running": False, "last_finished_at": None, "last_exit_code": None}
_lock = threading.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def run_once() -> int:
    with _lock:
        if _state["running"]:
            return 0
        _state["running"] = True
    code = -1
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as log:
            code = subprocess.run(
                [sys.executable, str(REPO_ROOT / "scripts" / "ops" / "local_catch_up.py")],
                cwd=REPO_ROOT, stdout=log, stderr=subprocess.STDOUT, timeout=20 * 60,
            ).returncode
    except Exception as e:
        logger.warning("Local catch-up failed: %s", e)
    finally:
        with _lock:
            _state.update(running=False, last_finished_at=_now(), last_exit_code=code)
    return code


def _loop() -> None:
    while True:
        run_once()
        time.sleep(INTERVAL_SECONDS)


def start_background_catch_up() -> None:
    with _lock:
        _state["enabled"] = True
    threading.Thread(target=_loop, name="local-catch-up", daemon=True).start()


def status(season: str | None = None) -> dict[str, Any]:
    """Whether a catch-up is running, and when the season's frontend store was last built."""
    from src.core.season_utils import get_default_season
    from src.frontend_store.store import read_meta, season_db_path

    db = season_db_path(season or get_default_season())
    built_at = read_meta(db).get("built_at") if db.exists() else None
    with _lock:
        return {**_state, "store_built_at": built_at}
