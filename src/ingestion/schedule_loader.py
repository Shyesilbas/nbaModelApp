"""
schedule_loader.py
------------------
Loads, normalises, and combines the NBA schedule CSV files collected from Colab.

Public API
----------
  load_full_schedule()          -> pd.DataFrame
  load_finals_upcoming_schedule() -> pd.DataFrame
  load_combined_schedule()      -> pd.DataFrame  (also saves CSV + Parquet)
"""

import os
from typing import Optional
import pandas as pd
from scripts.season_utils import get_default_season
from src.ingestion.atomic_io import write_csv_atomic, write_parquet_atomic

# ─────────────────────────────────────────────
# Full unified column schema (superset of both source files)
UNIFIED_COLUMNS = [
    "GAME_ID",
    "GAME_DATE",
    "GAME_START_UTC",
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


def load_full_schedule(season: Optional[str] = None) -> pd.DataFrame:
    """
    Load the main played-season schedule CSV (Regular Season + Play-In + Playoffs).

    Returns
    -------
    pd.DataFrame with UNIFIED_COLUMNS schema.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season or get_default_season())
    raw_schedule_path = paths.raw_schedule

    if not os.path.exists(raw_schedule_path):
        team_games_path = paths.team_games_raw
        if os.path.exists(team_games_path):
            print(f"  ℹ️ Generating schedule.csv from team_games.csv ({team_games_path})...")
            df_tg = pd.read_csv(team_games_path, dtype={"GAME_ID": str})
            df_tg["GAME_ID"] = df_tg["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
            df_home = df_tg[df_tg["MATCHUP"].astype(str).str.contains("vs.", case=False, na=False)].copy()
            df_away = df_tg[df_tg["MATCHUP"].astype(str).str.contains("@", case=False, na=False)].copy()
            
            df_merged = df_home.merge(
                df_away,
                on="GAME_ID",
                suffixes=("_HOME", "_AWAY")
            )
            
            df_sched = pd.DataFrame()
            df_sched["GAME_ID"] = df_merged["GAME_ID"]
            df_sched["GAME_DATE"] = df_merged["GAME_DATE_HOME"]
            df_sched["HOME_TEAM_ABBREVIATION"] = df_merged["TEAM_ABBREVIATION_HOME"]
            df_sched["AWAY_TEAM_ABBREVIATION"] = df_merged["TEAM_ABBREVIATION_AWAY"]
            df_sched["HOME_SCORE"] = df_merged["PTS_HOME"]
            df_sched["AWAY_SCORE"] = df_merged["PTS_AWAY"]
            df_sched["SEASON_TYPE"] = df_merged["SEASON_TYPE_HOME"]
            df_sched["IS_PLAYOFF"] = df_merged["SEASON_TYPE_HOME"].astype(str).str.contains("Playoff", case=False, na=False)
            
            os.makedirs(os.path.dirname(raw_schedule_path), exist_ok=True)
            write_csv_atomic(df_sched, raw_schedule_path)
            print(f"  ✅ Saved generated schedule.csv ({len(df_sched)} games)")
        else:
            raise FileNotFoundError(
                f"Main schedule file not found: {raw_schedule_path}\n"
                "Place the Colab-exported CSV at that path and re-run."
            )

    df = pd.read_csv(raw_schedule_path, dtype={"GAME_ID": str})
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")

    # IS_PLAYOFF: coerce to bool
    if "IS_PLAYOFF" in df.columns:
        df["IS_PLAYOFF"] = df["IS_PLAYOFF"].map(
            lambda v: True if str(v).strip().lower() in ("true", "1", "yes") else False
        )

    df = _ensure_columns(df)
    print(f"  ✅ Loaded full schedule: {len(df):,} games  ({raw_schedule_path})")
    return df


def load_finals_upcoming_schedule(season: Optional[str] = None) -> pd.DataFrame:
    """
    Load the upcoming NBA Finals schedule CSV (manually corrected Colab output).

    Returns
    -------
    pd.DataFrame with UNIFIED_COLUMNS schema.
    """
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season or get_default_season())
    raw_finals_path = paths.raw_finals_schedule

    if not os.path.exists(raw_finals_path):
        return _ensure_columns(pd.DataFrame(columns=UNIFIED_COLUMNS))

    df = pd.read_csv(raw_finals_path, dtype={"GAME_ID": str})
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")

    if "IS_PLAYOFF" in df.columns:
        df["IS_PLAYOFF"] = df["IS_PLAYOFF"].map(
            lambda v: True if str(v).strip().lower() in ("true", "1", "yes") else False
        )

    df = _ensure_columns(df)
    print(f"  ✅ Loaded Finals upcoming schedule: {len(df):,} games  ({raw_finals_path})")
    return df


def load_combined_schedule(save: bool = True, season: Optional[str] = None) -> pd.DataFrame:
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
    from scripts.data_paths import get_data_paths
    paths = get_data_paths(season or get_default_season())
    combined_csv_path = paths.schedule_combined
    combined_parq_path = paths.schedule_combined.replace(".csv", ".parquet")

    df_main   = load_full_schedule(season)
    df_finals = load_finals_upcoming_schedule(season)

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
        os.makedirs(os.path.dirname(combined_csv_path), exist_ok=True)
        write_csv_atomic(df_combined, combined_csv_path)
        write_parquet_atomic(df_combined, combined_parq_path)
        print(f"  💾 Saved: {combined_csv_path}")
        print(f"  💾 Saved: {combined_parq_path}")

    return df_combined
