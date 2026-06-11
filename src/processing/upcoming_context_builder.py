"""
upcoming_context_builder.py
----------------------------
Builds an enriched upcoming-games context dataset by joining:

  1. Upcoming games (GAME_DATE > today) from the combined schedule.
  2. Latest available pre-game team features from the V2 model-ready dataset
     (WINRATE_LAST_5/10, PTS_LAST_5/10, DAYS_REST, IS_B2B) for both home and away teams.
  3. Core player lists (Top 3 and Top 5) from the core_players analysis dataset.

Outputs
-------
  season-aware upcoming_games_context CSV and Parquet outputs

No model training.  No predictions.  No betting language.
"""

import os
from datetime import date

import numpy as np
import pandas as pd

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season

# ─────────────────────────────────────────────
def _get_latest_team_features(v2_df: pd.DataFrame) -> pd.DataFrame:
    """
    For each TEAM_ABBREVIATION, return the single row with the most recent GAME_DATE.
    This represents the best available pre-game context for that team.
    """
    v2_df = v2_df.copy()
    v2_df["GAME_DATE"] = pd.to_datetime(v2_df["GAME_DATE"], errors="coerce")
    latest = (
        v2_df.sort_values("GAME_DATE")
             .groupby("TEAM_ABBREVIATION", as_index=False)
             .last()
    )
    feature_cols = [
        "TEAM_ABBREVIATION",
        "WINRATE_LAST_5",
        "WINRATE_LAST_10",
        "PTS_LAST_5",
        "PTS_LAST_10",
        "DAYS_REST",
        "IS_B2B",
    ]
    existing = [c for c in feature_cols if c in latest.columns]
    return latest[existing]


def _build_core_player_strings(core_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate core player names into comma-separated strings per team.

    Returns a DataFrame with:
        TEAM_ABBREVIATION | TOP3_CORE_PLAYERS | TOP5_CORE_PLAYERS
    """
    rows = []
    for team, grp in core_df.groupby("TEAM_ABBREVIATION"):
        grp = grp.sort_values("CORE_RANK")
        top3 = grp[grp["IS_TOP3_CORE"] == True]["PLAYER_NAME"].tolist()
        top5 = grp[grp["IS_TOP5_CORE"] == True]["PLAYER_NAME"].tolist()
        rows.append({
            "TEAM_ABBREVIATION": team,
            "TOP3_CORE_PLAYERS": ", ".join(top3),
            "TOP5_CORE_PLAYERS": ", ".join(top5),
        })
    return pd.DataFrame(rows)


def build_upcoming_games_context(save: bool = True) -> pd.DataFrame:
    """
    Build the upcoming games context dataset.

    Parameters
    ----------
    save : bool
        If True, writes output to disk (CSV + Parquet).

    Returns
    -------
    pd.DataFrame — one row per upcoming game, enriched with team features
    and core player strings.
    """
    season = get_default_season()
    paths = get_data_paths(season)
    combined_schedule_path = paths.schedule_combined
    v2_model_path = paths.team_model_ready_v2
    core_players_path = "data/analysis/core_players.csv"
    out_csv = paths.upcoming_context
    out_parq = paths.upcoming_context.replace(".csv", ".parquet")

    # ── 1. Load combined schedule ──────────────────────────────────────────
    if not os.path.exists(combined_schedule_path):
        raise FileNotFoundError(
            f"Combined schedule not found at {combined_schedule_path}.\n"
            "Run `python3 main.py --build-schedule-context` first (or call "
            "load_combined_schedule() to generate it)."
        )

    schedule_df = pd.read_csv(combined_schedule_path, dtype={"GAME_ID": str})
    schedule_df["GAME_DATE"] = pd.to_datetime(schedule_df["GAME_DATE"], errors="coerce")

    today = pd.Timestamp(date.today())
    upcoming = schedule_df[schedule_df["GAME_DATE"] >= today].copy()
    print(f"\n  📅 Upcoming games found: {len(upcoming)} (from {today.date()} onwards)")

    if upcoming.empty:
        print("  ⚠️  No upcoming games found in the combined schedule.")
        return upcoming

    # ── 2. Load V2 team features and get latest per team ──────────────────
    if not os.path.exists(v2_model_path):
        raise FileNotFoundError(
            f"V2 model-ready dataset not found at {v2_model_path}.\n"
            "Run `python3 main.py --build-model-dataset` first."
        )

    v2_df = pd.read_csv(v2_model_path)
    latest_features = _get_latest_team_features(v2_df)
    print(f"  📊 Loaded V2 team features for {len(latest_features)} teams")

    # ── 3. Join home team features ─────────────────────────────────────────
    home_features = latest_features.rename(columns={
        "TEAM_ABBREVIATION": "HOME_TEAM_ABBREVIATION",
        "WINRATE_LAST_5":    "HOME_TEAM_WINRATE_LAST_5",
        "WINRATE_LAST_10":   "HOME_TEAM_WINRATE_LAST_10",
        "PTS_LAST_5":        "HOME_TEAM_PTS_LAST_5",
        "PTS_LAST_10":       "HOME_TEAM_PTS_LAST_10",
        "DAYS_REST":         "HOME_TEAM_DAYS_REST",
        "IS_B2B":            "HOME_TEAM_IS_B2B",
    })

    away_features = latest_features.rename(columns={
        "TEAM_ABBREVIATION": "AWAY_TEAM_ABBREVIATION",
        "WINRATE_LAST_5":    "AWAY_TEAM_WINRATE_LAST_5",
        "WINRATE_LAST_10":   "AWAY_TEAM_WINRATE_LAST_10",
        "PTS_LAST_5":        "AWAY_TEAM_PTS_LAST_5",
        "PTS_LAST_10":       "AWAY_TEAM_PTS_LAST_10",
        "DAYS_REST":         "AWAY_TEAM_DAYS_REST",
        "IS_B2B":            "AWAY_TEAM_IS_B2B",
    })

    ctx = upcoming.merge(home_features, on="HOME_TEAM_ABBREVIATION", how="left")
    ctx = ctx.merge(away_features, on="AWAY_TEAM_ABBREVIATION", how="left")

    # ── 4. Add core player strings ─────────────────────────────────────────
    if not os.path.exists(core_players_path):
        print(f"  ⚠️  Core players file not found at {core_players_path}. Skipping player context.")
        ctx["HOME_TOP3_CORE_PLAYERS"] = None
        ctx["HOME_TOP5_CORE_PLAYERS"] = None
        ctx["AWAY_TOP3_CORE_PLAYERS"] = None
        ctx["AWAY_TOP5_CORE_PLAYERS"] = None
    else:
        core_df  = pd.read_csv(core_players_path)
        core_str = _build_core_player_strings(core_df)

        home_core = core_str.rename(columns={
            "TEAM_ABBREVIATION": "HOME_TEAM_ABBREVIATION",
            "TOP3_CORE_PLAYERS": "HOME_TOP3_CORE_PLAYERS",
            "TOP5_CORE_PLAYERS": "HOME_TOP5_CORE_PLAYERS",
        })
        away_core = core_str.rename(columns={
            "TEAM_ABBREVIATION": "AWAY_TEAM_ABBREVIATION",
            "TOP3_CORE_PLAYERS": "AWAY_TOP3_CORE_PLAYERS",
            "TOP5_CORE_PLAYERS": "AWAY_TOP5_CORE_PLAYERS",
        })
        ctx = ctx.merge(home_core, on="HOME_TEAM_ABBREVIATION", how="left")
        ctx = ctx.merge(away_core, on="AWAY_TEAM_ABBREVIATION", how="left")
        print(f"  🏀 Core player strings added for {len(core_str)} teams")

    # ── 5. Sort and reset index ────────────────────────────────────────────
    ctx = ctx.sort_values("GAME_DATE").reset_index(drop=True)

    # ── 6. Save ────────────────────────────────────────────────────────────
    if save:
        os.makedirs("data/processed", exist_ok=True)
        ctx.to_csv(out_csv, index=False)
        ctx.to_parquet(out_parq, index=False, engine="pyarrow")
        print(f"  💾 Saved: {out_csv}")
        print(f"  💾 Saved: {out_parq}")

    return ctx
