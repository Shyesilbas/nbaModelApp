"""Pregame player form features shared by dataset building and live inference.

Every column is computed from games strictly before the row's game (shift(1)),
grouped by player across seasons. The live service appends a placeholder row
for the game being predicted and runs the same function, so the features it
feeds the model describe the game being predicted, not the player's previous one.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from scripts.season_utils import SEASON_START_MONTH, date_to_season

# Raw per-game columns the form features are built from. The model-ready dataset
# keeps them under GAME_* names so inference can roll the history forward.
RAW_GAME_COLUMNS = {
    "PTS": "GAME_PTS",
    "REB": "GAME_REB",
    "AST": "GAME_AST",
    "MIN": "GAME_MIN",
    "USG_PCT": "GAME_USG_PCT",
    "PLUS_MINUS": "GAME_PLUS_MINUS",
}


def _shifted(group, fn):
    return group.transform(lambda x: fn(x.shift(1)))


def add_player_form_features(df: pd.DataFrame, player_col: str) -> pd.DataFrame:
    """Add rolling, EWMA and per-minute form columns from PTS/REB/AST/MIN/USG_PCT/PLUS_MINUS."""
    df = df.sort_values([player_col, "GAME_DATE"], kind="stable").copy()
    g = df.groupby(player_col, sort=False)

    def roll(col, window, min_periods=1, how="mean"):
        return _shifted(g[col], lambda x: getattr(x.rolling(window=window, min_periods=min_periods), how)())

    def ewm(col, span):
        return _shifted(g[col], lambda x: x.ewm(span=span, min_periods=1).mean())

    for stat in ("PTS", "REB", "AST"):
        df[f"{stat}_LAST_5"] = roll(stat, 5)
        df[f"{stat}_LAST_10"] = roll(stat, 10)
        df[f"{stat}_EMA_10"] = ewm(stat, 10)
        # Production per minute over the last 10 games: separates role (minutes)
        # from efficiency, so a minutes change moves the projection proportionally.
        stat_sum = roll(stat, 10, how="sum")
        min_sum = roll("MIN", 10, how="sum")
        df[f"{stat}_PER_MIN_LAST_10"] = np.where(min_sum > 0, stat_sum / min_sum.where(min_sum > 0), np.nan)

    df["MIN_LAST_3"] = roll("MIN", 3)
    df["MIN_LAST_5"] = roll("MIN", 5)
    df["MIN_LAST_10"] = roll("MIN", 10)
    df["MIN_EMA_5"] = ewm("MIN", 5)
    df["MIN_EMA_10"] = ewm("MIN", 10)
    df["MIN_STD_LAST_10"] = roll("MIN", 10, min_periods=2, how="std")
    df["MIN_TREND"] = df["MIN_EMA_5"] - df["MIN_EMA_10"]

    df["USG_PCT_LAST_3"] = roll("USG_PCT", 3)
    df["USG_PCT_LAST_10"] = roll("USG_PCT", 10)
    df["USG_PCT_EMA_5"] = ewm("USG_PCT", 5)
    df["USG_PCT_EMA_10"] = ewm("USG_PCT", 10)
    df["USG_PCT_STD_LAST_10"] = roll("USG_PCT", 10, min_periods=2, how="std")
    df["USG_PCT_TREND"] = df["USG_PCT_EMA_5"] - df["USG_PCT_EMA_10"]

    if "PLUS_MINUS" in df.columns:
        df["PLUS_MINUS_LAST_5"] = roll("PLUS_MINUS", 5)
    return df


def add_player_matchup_features(df: pd.DataFrame) -> pd.DataFrame:
    """Position flags and what the opponent allowed to this player's position group.

    The dataset stores OPP_{GUARD,WING,BIG}_*_ALLOWED_LAST_10 for every row; the model
    needs only the one matching the player, so training and inference both call this.
    """
    out = df.copy()
    pos = out["PLAYER_POSITION_GROUP"].fillna("WING").astype(str).str.upper()
    out["IS_GUARD"] = (pos == "GUARD").astype(int)
    out["IS_BIG"] = (pos == "BIG").astype(int)
    for stat in ("PTS", "REB", "AST"):
        by_pos = {g: pd.to_numeric(out.get(f"OPP_{g}_{stat}_ALLOWED_LAST_10", np.nan), errors="coerce") for g in ("GUARD", "WING", "BIG")}
        out[f"OPP_POS_{stat}_ALLOWED_LAST_10"] = np.select([pos == "GUARD", pos == "BIG"], [by_pos["GUARD"], by_pos["BIG"]], by_pos["WING"])
    return out


def pregame_player_rows(history: pd.DataFrame, player_col: str, prediction_date) -> pd.DataFrame:
    """One row per player with form features for a game on ``prediction_date``.

    ``history`` holds model-ready rows (with GAME_* raw columns) for games before
    the prediction date. Each player's last row is copied as a placeholder dated
    ``prediction_date`` and the form columns are recomputed over the full history.
    """
    pred_dt = pd.Timestamp(prediction_date)
    hist = history.copy()
    hist["GAME_DATE"] = pd.to_datetime(hist["GAME_DATE"], errors="coerce")
    for raw, kept in RAW_GAME_COLUMNS.items():
        if kept in hist.columns:
            kept_vals = pd.to_numeric(hist[kept], errors="coerce")
            hist[raw] = kept_vals.combine_first(pd.to_numeric(hist[raw], errors="coerce")) if raw in hist.columns else kept_vals
    missing = [raw for raw in ("PTS", "REB", "AST", "MIN", "USG_PCT") if raw not in hist.columns]
    if missing:
        raise ValueError(f"Player history lacks raw game columns {missing}; rebuild the player dataset.")

    last = hist.sort_values("GAME_DATE").groupby(player_col, sort=False).tail(1).copy()
    last_dates = last["GAME_DATE"].copy()
    last["GAME_DATE"] = pred_dt
    for raw in RAW_GAME_COLUMNS:
        if raw in last.columns:
            last[raw] = np.nan
    last["_PREGAME"] = True
    hist["_PREGAME"] = False

    rolled = add_player_form_features(pd.concat([hist, last], ignore_index=True), player_col)
    out = rolled[rolled["_PREGAME"].astype(bool)].drop(columns=["_PREGAME"])
    out = out.set_index(player_col, drop=False)
    days = (pred_dt - last_dates.set_axis(last[player_col]).reindex(out.index)).dt.days.to_numpy()
    # Training rows reset DAYS_REST at each season's first game, so a gap that
    # crosses the offseason is unknown, not "rested".
    season_start = pd.Timestamp(year=int(date_to_season(pred_dt)[:4]), month=SEASON_START_MONTH, day=1)
    prev_dates = last_dates.set_axis(last[player_col]).reindex(out.index)
    out["DAYS_REST"] = np.where(prev_dates.to_numpy() >= np.datetime64(season_start), days, np.nan)
    out["IS_B2B"] = out["DAYS_REST"] == 1
    for raw in RAW_GAME_COLUMNS:
        out = out.drop(columns=[raw], errors="ignore")
    return out.reset_index(drop=True)
