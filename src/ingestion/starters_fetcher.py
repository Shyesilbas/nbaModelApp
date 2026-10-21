"""
Per-game starter flags. The season game logs (leaguegamelog) carry no starter column, so the
flag is read from BoxScoreTraditionalV3, where only the five starters have a ``position``.
Stored append-only next to the season's raw player games: one row per player per game.
"""
import os
import logging
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd

from src.ingestion.nba_api_client import call_nba_api
from src.ingestion.atomic_io import write_csv_atomic

logger = logging.getLogger(__name__)

STARTER_COLUMNS = ["Game_ID", "Player_ID", "TEAM_ABBREVIATION", "IS_STARTER"]


def starters_path(season: Optional[str] = None) -> Path:
    from scripts.data_paths import get_data_paths
    return Path(get_data_paths(season).player_games_raw).with_name("player_starters.csv")


def fetch_game_starters(game_id: str) -> pd.DataFrame:
    """Starter flag for every player listed in the game's box score; empty if unavailable."""
    gid = str(game_id).zfill(10)
    try:
        from nba_api.stats.endpoints import boxscoretraditionalv3
        frames = call_nba_api(boxscoretraditionalv3.BoxScoreTraditionalV3, max_retries=3, timeout=30, game_id=gid).get_data_frames()
    except Exception as exc:
        logger.warning(f"Starter fetch failed for {gid}: {exc}")
        return pd.DataFrame(columns=STARTER_COLUMNS)
    if not frames or frames[0].empty or "position" not in frames[0].columns:
        return pd.DataFrame(columns=STARTER_COLUMNS)
    raw = frames[0]
    out = pd.DataFrame({
        "Game_ID": gid,
        "Player_ID": raw["personId"].astype(int),
        "TEAM_ABBREVIATION": raw["teamTricode"],
        "IS_STARTER": raw["position"].fillna("").astype(str).str.strip().ne("").astype(int),
    })
    # A box score without exactly five starters per team is incomplete (game not final): keep nothing.
    per_team = out.groupby("TEAM_ABBREVIATION")["IS_STARTER"].sum()
    if len(per_team) != 2 or not (per_team == 5).all():
        logger.warning(f"Starter data for {gid} is incomplete ({per_team.to_dict()}); skipped.")
        return pd.DataFrame(columns=STARTER_COLUMNS)
    return out


def append_starters(new_rows: pd.DataFrame, season: Optional[str] = None) -> int:
    """Append to the season starters file, deduplicated by Game_ID + Player_ID. Returns total rows."""
    path = starters_path(season)
    if path.exists():
        existing = pd.read_csv(path, dtype={"Game_ID": str})
        new_rows = pd.concat([existing, new_rows], ignore_index=True)
    if new_rows.empty:
        return 0
    new_rows["Game_ID"] = new_rows["Game_ID"].astype(str).str.zfill(10)
    new_rows = new_rows.drop_duplicates(["Game_ID", "Player_ID"], keep="last")[STARTER_COLUMNS]
    os.makedirs(path.parent, exist_ok=True)
    write_csv_atomic(new_rows, path)
    return len(new_rows)


def collect_starters(game_ids: Iterable[str], season: Optional[str] = None) -> int:
    """Fetch and store starters for the given games. Returns the number of games stored."""
    frames = [f for f in (fetch_game_starters(g) for g in game_ids) if not f.empty]
    if frames:
        append_starters(pd.concat(frames, ignore_index=True), season)
    return len(frames)


def missing_starter_game_ids(season: Optional[str] = None, limit: int = 100) -> list:
    """Played non-preseason games of the season that have player logs but no starter record yet.

    A transient API failure at ingest time leaves a game here; the next update completes it.
    ``limit`` keeps one update short when a whole past season was never backfilled."""
    from scripts.data_paths import get_data_paths
    games_csv = Path(get_data_paths(season).player_games_raw)
    if not games_csv.exists():
        return []
    played = pd.read_csv(games_csv, usecols=["Game_ID"], dtype=str)["Game_ID"].str.zfill(10).unique()
    path = starters_path(season)
    have = set(pd.read_csv(path, dtype={"Game_ID": str})["Game_ID"].str.zfill(10)) if path.exists() else set()
    return [g for g in played if not g.startswith("001") and g not in have][:limit]
