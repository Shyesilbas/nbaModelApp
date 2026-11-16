"""Slim copy of the player training dataset for inference without the full file.

Live player projections recompute every form feature from each player's raw game lines
(the GAME_* columns), so the 120 MB model-ready dataset is only needed for those lines.
The slim file keeps exactly the columns that current-season rows built from the raw box
scores carry, which lets the cloud snapshot produce the same projections as the local API.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.core.data_paths import PLAYER_HISTORY_SLIM_CSV, PLAYER_TRAINING_CSV
from src.features.player_form import RAW_GAME_COLUMNS

ID_COLUMNS = ["SEASON_ID", "Player_ID", "PLAYER_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "PLAYER_NAME",
              "SEASON_TYPE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME",
              "PLAYER_POSITION_GROUP", "POSITION_GROUP"]


def build_player_history_slim(source: Path = PLAYER_TRAINING_CSV, target: Path = PLAYER_HISTORY_SLIM_CSV) -> Path:
    """Write the slim file; rounding keeps the stored precision of the box score values."""
    header = pd.read_csv(source, nrows=0).columns
    keep = [c for c in [*ID_COLUMNS, *RAW_GAME_COLUMNS, *RAW_GAME_COLUMNS.values()] if c in header]
    df = pd.read_csv(source, usecols=keep, dtype={"GAME_ID": str})[keep]
    tmp = target.with_suffix(".tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(target)
    return target


def slim_is_stale(source: Path = PLAYER_TRAINING_CSV, target: Path = PLAYER_HISTORY_SLIM_CSV) -> bool:
    return source.exists() and (not target.exists() or target.stat().st_mtime < source.stat().st_mtime)
