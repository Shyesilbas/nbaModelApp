"""Backfill per-game starter flags (player_starters.csv) for past seasons from BoxScoreTraditionalV3.

Resumable: games already stored are skipped, and progress is saved every SAVE_EVERY games.
Preseason games are skipped. Usage: python scripts/backfill_starters.py [season ...]
"""
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths  # noqa: E402
from src.ingestion.starters_fetcher import append_starters, fetch_game_starters, starters_path  # noqa: E402

SEASONS = ["2025-26", "2024-25", "2023-24"]
SAVE_EVERY = 50
SLEEP = 1.0
MAX_CONSECUTIVE_FAILURES = 5  # the API is throttling or down: stop instead of burning hours on timeouts


def backfill(season: str) -> None:
    games_csv = get_data_paths(season).player_games_raw
    if not Path(games_csv).exists():
        print(f"{season}: no player_games.csv, skipped")
        return
    ids = pd.read_csv(games_csv, usecols=["Game_ID"], dtype=str)["Game_ID"].str.zfill(10).unique()
    ids = [g for g in ids if not g.startswith("001")]  # preseason
    path = starters_path(season)
    done = set(pd.read_csv(path, dtype={"Game_ID": str})["Game_ID"].str.zfill(10)) if path.exists() else set()
    todo = [g for g in ids if g not in done]
    print(f"{season}: {len(todo)} to fetch ({len(done)} already stored)", flush=True)

    buffer, failed, streak = [], [], 0
    for i, gid in enumerate(todo, 1):
        df = fetch_game_starters(gid)
        if df.empty:
            failed.append(gid)
            streak += 1
            if streak >= MAX_CONSECUTIVE_FAILURES:
                if buffer:
                    append_starters(pd.concat(buffer, ignore_index=True), season)
                print(f"{season}: stopped after {streak} consecutive failures at {i}/{len(todo)}; rerun to resume", flush=True)
                sys.exit(1)
        else:
            buffer.append(df)
            streak = 0
        if len(buffer) >= SAVE_EVERY or (i == len(todo) and buffer):
            append_starters(pd.concat(buffer, ignore_index=True), season)
            buffer = []
            print(f"{season}: {i}/{len(todo)} fetched, {len(failed)} failed", flush=True)
        time.sleep(SLEEP)
    print(f"{season}: done, failed={failed}", flush=True)


if __name__ == "__main__":
    for s in (sys.argv[1:] or SEASONS):
        backfill(s)
