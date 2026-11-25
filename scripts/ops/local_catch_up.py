#!/usr/bin/env python3
"""Bring this machine up to date with the cloud morning sync, only when something is new.

GitHub Actions (.github/workflows/morning-sync.yml) commits the new game logs and results, but the
frontend store (data/frontend_store/), the box score files and the play-by-play cache are local and
gitignored. This script:

1. fetches origin and fast-forwards the current branch when origin is ahead (never merges, rebases or
   stashes). The in-app refresh button rewrites cloud-published data files (game logs, starters,
   rosters) from stats.nba.com; such local edits to files the incoming commits also change would block
   the pull, so they are restored to HEAD first, but only when the local game logs hold no game the
   upstream logs lack. Any other conflicting edit or a diverged branch is reported and the pull skipped;
2. when new commits arrived or the local derived files lag the raw game logs, rebuilds the frontend store
   right away (scores show within seconds), then box scores and game results, then missing play-by-play,
   rebuilding the store after each so the app gains detail as it lands.

When nothing is new it exits after the fetch (about a second). The API runs it at startup and every
30 minutes when NBA_AUTO_CATCH_UP=1 (set by scripts/start_all.sh); it can also be run by hand.
"""
from __future__ import annotations

import argparse
import fcntl
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

LOCK_PATH = ROOT / "logs" / "local_catch_up.lock"


def _log(message: str) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(f"[catch-up {stamp}] {message}", flush=True)


def _git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=check)


def pull_if_behind() -> bool:
    """Fast-forward to the upstream branch; True when new commits arrived."""
    if _git("fetch", "--quiet", check=False).returncode != 0:
        _log("git fetch failed (offline?); using local data as is")
        return False
    behind = _git("rev-list", "--count", "HEAD..@{upstream}", check=False)
    if behind.returncode != 0 or not behind.stdout.strip().isdigit():
        _log("no upstream branch; skipping pull")
        return False
    if int(behind.stdout.strip()) == 0:
        return False
    restore_cloud_owned_edits()
    pulled = _git("pull", "--ff-only", "--quiet", check=False)
    if pulled.returncode != 0:
        _log(f"git pull --ff-only refused, pull by hand: {(pulled.stderr or pulled.stdout).strip()}")
        return False
    _log(f"pulled {behind.stdout.strip()} new commit(s)")
    return True


def _cloud_owned_files() -> set[str]:
    result = subprocess.run(
        [sys.executable, "scripts/ops/publish_snapshot_data.py", "--list-files"],
        cwd=ROOT, capture_output=True, text=True, env={**os.environ, "PYTHONPATH": str(ROOT)},
    )
    return set(result.stdout.split()) if result.returncode == 0 else set()


def _game_ids(text: str, column: str) -> set[str]:
    import io

    import pandas as pd

    frame = pd.read_csv(io.StringIO(text), usecols=[column], dtype=str)
    return set(frame[column].str.zfill(10))


def restore_cloud_owned_edits() -> None:
    """Restore cloud-published files edited locally that the incoming commits also change.

    Only when every locally edited game log holds no game missing from its upstream version, so the
    restore never drops a game the cloud has not fetched.
    """
    dirty = set(_git("diff", "--name-only", check=False).stdout.split())
    incoming = set(_git("diff", "--name-only", "HEAD", "@{upstream}", check=False).stdout.split())
    blocking = dirty & incoming
    if not blocking:
        return
    owned = _cloud_owned_files()
    if not blocking <= owned:
        _log(f"local edits outside the cloud-published files block the pull: {sorted(blocking - owned)}")
        return
    for path, column in (("raw/team_games.csv", "GAME_ID"), ("raw/player_games.csv", "Game_ID")):
        for name in sorted(n for n in blocking if n.endswith(path)):
            local = (ROOT / name).read_text(encoding="utf-8")
            upstream = _git("show", f"@{{upstream}}:{name}", check=False).stdout
            extra = _game_ids(local, column) - _game_ids(upstream, column) if upstream else {"?"}
            if extra:
                _log(f"{name} holds {len(extra)} game(s) the cloud lacks; keeping local edits, pull skipped")
                return
    _git("checkout", "--", *sorted(blocking))
    _log(f"restored {len(blocking)} cloud-published file(s) rewritten locally: {sorted(blocking)}")


def derived_data_lags(season: str) -> bool:
    """True when box scores or the frontend store are older than the raw game logs."""
    import pandas as pd

    from src.core.data_paths import get_data_paths
    from src.frontend_store.store import read_meta, season_db_path

    paths = get_data_paths(season)
    raw = Path(paths.player_games_raw)
    box = Path(paths.raw_player_boxscores)
    if not raw.exists():
        return False
    if not box.exists():
        return True
    raw_max = pd.read_csv(raw, usecols=["GAME_DATE"])["GAME_DATE"].max()
    box_max = pd.read_csv(box, usecols=["GAME_DATE"])["GAME_DATE"].max()
    if str(box_max) < str(raw_max):
        return True
    db = season_db_path(season)
    built_at = read_meta(db).get("built_at") if db.exists() else None
    if not built_at:
        return True
    return datetime.fromisoformat(built_at).timestamp() < max(raw.stat().st_mtime, box.stat().st_mtime)


def rebuild(season: str) -> None:
    python = sys.executable
    store = ("frontend store", [python, "scripts/build_frontend_store.py", "--season", season])
    steps = [
        store,
        ("box scores and game results", [python, "main.py", "--season", season, "--fetch-boxscores"]),
        store,
        ("play-by-play", [python, "scripts/build_play_by_play.py", "--season", season, "--sleep", "0.6"]),
        store,
    ]
    for label, command in steps:
        _log(f"building {label}")
        env = {**os.environ, "PYTHONPATH": str(ROOT)}
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env)
        if result.returncode != 0:
            tail = "\n".join((result.stderr or result.stdout).strip().splitlines()[-5:])
            raise RuntimeError(f"{label} failed (exit {result.returncode}):\n{tail}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", help="Season to rebuild (default: active season)")
    parser.add_argument("--no-pull", action="store_true", help="Only rebuild local derived files if they lag")
    args = parser.parse_args()

    from src.core.season_utils import get_default_season, normalize_season

    season = normalize_season(args.season or get_default_season())
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK_PATH, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            _log("another catch-up is running; skipping")
            return 0
        pulled = False if args.no_pull else pull_if_behind()
        if not pulled and not derived_data_lags(season):
            _log("up to date")
            return 0
        try:
            rebuild(season)
        except RuntimeError as exc:
            _log(str(exc))
            return 1
        _log(f"{season} frontend store rebuilt")
    return 0


if __name__ == "__main__":
    sys.exit(main())
