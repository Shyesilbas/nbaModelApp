"""
schedule_loader.py
------------------
Loads, normalises, and combines the NBA schedule CSV files collected from Colab.

Source files (do NOT re-fetch – these are the local source of truth):
  data/raw/schedule/nba_schedule_2025_26.csv           — 1317 played games
  data/raw/schedule/nba_finals_upcoming_2025_26.csv    — 5 upcoming Finals games (manually corrected)

Public API
----------
  load_full_schedule()          -> pd.DataFrame
  load_finals_upcoming_schedule() -> pd.DataFrame
  load_combined_schedule()      -> pd.DataFrame  (also saves CSV + Parquet)
"""

import os
import pandas as pd

# ─────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────
RAW_SCHEDULE_PATH  = "data/raw/schedule/nba_schedule_2025_26.csv"
RAW_FINALS_PATH    = "data/raw/schedule/nba_finals_upcoming_2025_26.csv"
COMBINED_CSV_PATH  = "data/processed/schedule_combined_2025_26.csv"
COMBINED_PARQ_PATH = "data/processed/schedule_combined_2025_26.parquet"

# Full unified column schema (superset of both source files)
UNIFIED_COLUMNS = [
    "GAME_ID",
    "GAME_DATE",
    "HOME_TEAM_ABBREVIATION",
    "AWAY_TEAM_ABBREVIATION",
    "HOME_TEAM_NAME",
    "AWAY_TEAM_NAME",
    "SEASON_TYPE",
    "IS_PLAYOFF",
    "GAME_STATUS",
    "PLAYOFF_ROUND",
    "SERIES_GAME_NUMBER",
    "HOME_SERIES_WINS",
    "AWAY_SERIES_WINS",
    "IS_ELIMINATION_GAME",
    "CAN_CLINCH_SERIES",
    "ARENA",
    "LOCATION",
]


def _ensure_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Add any missing unified columns as NaN so the two sources can be merged."""
    for col in UNIFIED_COLUMNS:
        if col not in df.columns:
            df[col] = None
    return df[UNIFIED_COLUMNS]


def load_full_schedule() -> pd.DataFrame:
    """
    Load the main played-season schedule CSV (Regular Season + Play-In + Playoffs).

    Returns
    -------
    pd.DataFrame with UNIFIED_COLUMNS schema.
    """
    if not os.path.exists(RAW_SCHEDULE_PATH):
        raise FileNotFoundError(
            f"Main schedule file not found: {RAW_SCHEDULE_PATH}\n"
            "Place the Colab-exported CSV at that path and re-run."
        )

    df = pd.read_csv(RAW_SCHEDULE_PATH, dtype={"GAME_ID": str})
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")

    # IS_PLAYOFF: coerce to bool
    if "IS_PLAYOFF" in df.columns:
        df["IS_PLAYOFF"] = df["IS_PLAYOFF"].map(
            lambda v: True if str(v).strip().lower() in ("true", "1", "yes") else False
        )

    df = _ensure_columns(df)
    print(f"  ✅ Loaded full schedule: {len(df):,} games  ({RAW_SCHEDULE_PATH})")
    return df


def load_finals_upcoming_schedule() -> pd.DataFrame:
    """
    Load the upcoming NBA Finals schedule CSV (manually corrected Colab output).

    Returns
    -------
    pd.DataFrame with UNIFIED_COLUMNS schema.
    """
    if not os.path.exists(RAW_FINALS_PATH):
        raise FileNotFoundError(
            f"Finals upcoming schedule not found: {RAW_FINALS_PATH}\n"
            "Place the Colab-exported CSV at that path and re-run."
        )

    df = pd.read_csv(RAW_FINALS_PATH, dtype={"GAME_ID": str})
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")

    if "IS_PLAYOFF" in df.columns:
        df["IS_PLAYOFF"] = df["IS_PLAYOFF"].map(
            lambda v: True if str(v).strip().lower() in ("true", "1", "yes") else False
        )

    df = _ensure_columns(df)
    print(f"  ✅ Loaded Finals upcoming schedule: {len(df):,} games  ({RAW_FINALS_PATH})")
    return df


def load_combined_schedule(save: bool = True) -> pd.DataFrame:
    """
    Merge the full played schedule and the upcoming Finals schedule.

    Deduplicates on GAME_ID (Finals file wins on overlap since it has richer data).
    Saves the combined dataset to CSV and Parquet by default.

    Parameters
    ----------
    save : bool
        If True, writes combined output to disk.

    Returns
    -------
    pd.DataFrame with UNIFIED_COLUMNS schema sorted by GAME_DATE.
    """
    df_main   = load_full_schedule()
    df_finals = load_finals_upcoming_schedule()

    # Concatenate – Finals rows last so they override on dedup
    df_combined = pd.concat([df_main, df_finals], ignore_index=True)

    # Deduplicate: keep Finals version of any overlapping GAME_ID
    df_combined = df_combined.drop_duplicates(subset=["GAME_ID"], keep="last")

    # Sort chronologically
    df_combined = df_combined.sort_values("GAME_DATE").reset_index(drop=True)

    print(f"\n  📋 Combined schedule: {len(df_combined):,} total games")
    season_dist = df_combined["SEASON_TYPE"].value_counts()
    for stype, cnt in season_dist.items():
        print(f"     {stype}: {cnt:,} games")

    if save:
        os.makedirs("data/processed", exist_ok=True)
        df_combined.to_csv(COMBINED_CSV_PATH, index=False)
        df_combined.to_parquet(COMBINED_PARQ_PATH, index=False, engine="pyarrow")
        print(f"  💾 Saved: {COMBINED_CSV_PATH}")
        print(f"  💾 Saved: {COMBINED_PARQ_PATH}")

    return df_combined
