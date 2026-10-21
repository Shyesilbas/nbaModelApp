"""Apply official player movements (trades, signings, waivers) to a season roster.

The season roster (``analysis/team_rosters.csv``) is a snapshot taken when the season
was bootstrapped, and game logs only reveal a move once the player plays for his new
team. The NBA player movement feed (``data/reference/player_movement.csv``, written by
``src/ingestion/ingest_transactions.py``) closes that gap:

* Trade / Signing / AwardOnWaivers: the player moves to (or joins) ``TEAM_ID``;
* Waive: the player leaves ``TEAM_ID`` if he is still listed there;
* other types (e.g. ContractConverted) do not change the roster.

Only moves from the season's offseason (July 1) up to ``as_of`` are applied, in feed
order, so replaying moves the snapshot already reflects is a no-op.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping, Optional

import pandas as pd

from src.core.data_paths import PLAYER_MOVEMENTS_CSV

ROOT = Path(__file__).resolve().parents[2]
MOVEMENTS_PATH = PLAYER_MOVEMENTS_CSV
JOIN_TYPES = {"Trade", "Signing", "AwardOnWaivers"}
LEAVE_TYPES = {"Waive"}


def _team_abbreviations() -> dict[int, str]:
    from nba_api.stats.static import teams

    return {int(t["id"]): t["abbreviation"] for t in teams.get_teams()}


def load_season_movements(season: str, as_of, path: Path = MOVEMENTS_PATH) -> pd.DataFrame:
    """Roster-changing moves between July 1 of the season's first year and ``as_of`` (inclusive)."""
    if not os.path.exists(path):
        return pd.DataFrame(columns=["TRANSACTION_DATE", "Transaction_Type", "PLAYER_ID", "TEAM_ABBREVIATION", "PLAYER_SLUG"])
    df = pd.read_csv(path)
    df = df[df["Transaction_Type"].isin(JOIN_TYPES | LEAVE_TYPES)].dropna(subset=["PLAYER_ID", "TEAM_ID"])
    df = df[df["PLAYER_ID"] > 0]
    df["TRANSACTION_DATE"] = pd.to_datetime(df["TRANSACTION_DATE"])
    start = pd.Timestamp(f"{season[:4]}-07-01")
    df = df[(df["TRANSACTION_DATE"] >= start) & (df["TRANSACTION_DATE"] <= pd.Timestamp(as_of))]
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(int)
    df["TEAM_ABBREVIATION"] = df["TEAM_ID"].astype(int).map(_team_abbreviations())
    df = df.dropna(subset=["TEAM_ABBREVIATION"])
    sort_cols = ["TRANSACTION_DATE"] + (["GroupSort"] if "GroupSort" in df.columns else [])
    return df.sort_values(sort_cols, kind="stable").reset_index(drop=True)


def apply_movements(
    roster: pd.DataFrame,
    movements: pd.DataFrame,
    last_game_dates: Optional[Mapping[int, pd.Timestamp]] = None,
) -> pd.DataFrame:
    """Return ``roster`` with ``movements`` applied.

    ``last_game_dates`` (player id -> date of his latest game) skips moves on or before a
    player's latest game, when the roster team already comes from that game log.
    """
    rows = {int(r["PLAYER_ID"]): r for r in roster.to_dict("records")}
    last_game_dates = last_game_dates or {}
    for mv in movements.itertuples(index=False):
        pid, team = int(mv.PLAYER_ID), mv.TEAM_ABBREVIATION
        last_game = last_game_dates.get(pid)
        if last_game is not None and mv.TRANSACTION_DATE <= last_game:
            continue
        if mv.Transaction_Type in LEAVE_TYPES:
            if pid in rows and rows[pid]["TEAM_ABBREVIATION"] == team:
                del rows[pid]
        elif pid in rows:
            rows[pid] = {**rows[pid], "TEAM_ABBREVIATION": team}
        else:
            name = str(getattr(mv, "PLAYER_SLUG", "") or pid).replace("-", " ").title()
            rows[pid] = {"TEAM_ABBREVIATION": team, "PLAYER_ID": pid, "PLAYER_NAME": name}
    out = pd.DataFrame(list(rows.values()), columns=roster.columns)
    numeric = [c for c in roster.columns if pd.api.types.is_numeric_dtype(roster[c]) and c != "PLAYER_ID"]
    out[numeric] = out[numeric].fillna(0)
    out["PLAYER_ID"] = out["PLAYER_ID"].astype(int)
    return out


def roster_as_of(roster: pd.DataFrame, season: str, as_of, last_game_dates=None) -> pd.DataFrame:
    return apply_movements(roster, load_season_movements(season, as_of), last_game_dates)
