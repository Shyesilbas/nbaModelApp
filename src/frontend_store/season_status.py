"""A season is closed once the NBA Finals are decided (a team has won four Finals games).

Closed seasons never change, so their frontend store is built once and reused.
"""
from __future__ import annotations

import os

import pandas as pd

from scripts.data_paths import get_data_paths

CLOSED = "closed"
ACTIVE = "active"


def finals_winner(season: str) -> str | None:
    path = get_data_paths(season).team_games_raw
    if not os.path.exists(path):
        return None
    df = pd.read_csv(path, usecols=["GAME_ID", "TEAM_ABBREVIATION", "WL"], dtype={"GAME_ID": str})
    finals_prefix = f"004{season[2:4]}004"  # e.g. 0042500401 = 2025-26 Finals, game 1
    finals = df[df["GAME_ID"].str.zfill(10).str.startswith(finals_prefix) & (df["WL"] == "W")]
    wins = finals["TEAM_ABBREVIATION"].value_counts()
    return str(wins.index[0]) if not wins.empty and wins.iloc[0] >= 4 else None


def season_status(season: str) -> str:
    return CLOSED if finals_winner(season) else ACTIVE
