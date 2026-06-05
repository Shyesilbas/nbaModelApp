"""
boxscore_loader.py
------------------
Builds the box score layer from the existing raw NBA game log CSVs.

Source of truth (already collected from Colab — do NOT re-fetch):
  data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv
  data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv

These logs contain full box score data (PTS, FGM, FGA, REB, AST, STL, BLK,
TOV, PLUS_MINUS …) for every played game in the 2025-26 season.

This module:
  - Reshapes the raw game logs into clean, schema-normalised box score tables.
  - Derives a one-row-per-game results summary table (scores + winner/loser).
  - Joins schedule metadata (SEASON_TYPE, IS_PLAYOFF) from the combined schedule.

Public API
----------
  load_team_boxscores()   -> pd.DataFrame
  load_player_boxscores() -> pd.DataFrame
  build_game_results()    -> pd.DataFrame  (also saves CSV + Parquet)
  run_boxscore_pipeline() -> None  (full pipeline: load → save → results → export)

NOTE: nba_api is intentionally NOT used here.
The raw game logs sourced from Colab already contain the complete box score data.
"""

import os
import pandas as pd

# ─────────────────────────────────────────────
# Source paths
# ─────────────────────────────────────────────
RAW_TEAM_PATH      = "data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv"
RAW_PLAYER_PATH    = "data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv"
COMBINED_SCHED     = "data/processed/schedule_combined_2025_26.csv"

# Output paths
OUT_TEAM_DIR       = "data/raw/boxscores/team"
OUT_PLAYER_DIR     = "data/raw/boxscores/player"
TEAM_BS_CSV        = "data/raw/boxscores/team/nba_team_boxscores_2025_26.csv"
TEAM_BS_PARQ       = "data/raw/boxscores/team/nba_team_boxscores_2025_26.parquet"
PLAYER_BS_CSV      = "data/raw/boxscores/player/nba_player_boxscores_2025_26.csv"
PLAYER_BS_PARQ     = "data/raw/boxscores/player/nba_player_boxscores_2025_26.parquet"
RESULTS_CSV        = "data/processed/game_results_2025_26.csv"
RESULTS_PARQ       = "data/processed/game_results_2025_26.parquet"


# ─────────────────────────────────────────────
# Team box scores
# ─────────────────────────────────────────────
TEAM_BS_COLS = [
    "GAME_ID", "GAME_DATE", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME",
    "MATCHUP", "WL", "MIN",
    "PTS", "FGM", "FGA", "FG_PCT",
    "FG3M", "FG3A", "FG3_PCT",
    "FTM", "FTA", "FT_PCT",
    "OREB", "DREB", "REB",
    "AST", "STL", "BLK", "TOV", "PF", "PLUS_MINUS",
    "SEASON_TYPE",
]


def load_team_boxscores(save: bool = True) -> pd.DataFrame:
    """
    Load and normalise team-level box scores from the raw game log CSV.

    Returns
    -------
    pd.DataFrame — one row per team per game.
    """
    if not os.path.exists(RAW_TEAM_PATH):
        raise FileNotFoundError(f"Raw team game log not found: {RAW_TEAM_PATH}")

    df = pd.read_csv(RAW_TEAM_PATH, dtype={"GAME_ID": str, "TEAM_ID": str})

    # Normalise GAME_DATE
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Select and reorder columns (keep only those that exist)
    existing_cols = [c for c in TEAM_BS_COLS if c in df.columns]
    df = df[existing_cols].copy()

    # Ensure IS_PLAYOFF can be derived later
    if "IS_PLAYOFF" not in df.columns and "SEASON_TYPE" in df.columns:
        df["IS_PLAYOFF"] = df["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])

    df = df.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION"]).reset_index(drop=True)

    print(f"  ✅ Team box scores: {len(df):,} rows, {df['GAME_ID'].nunique():,} unique games")

    if save:
        os.makedirs(OUT_TEAM_DIR, exist_ok=True)
        df.to_csv(TEAM_BS_CSV, index=False)
        df.to_parquet(TEAM_BS_PARQ, index=False, engine="pyarrow")
        print(f"  💾 Saved: {TEAM_BS_CSV}")
        print(f"  💾 Saved: {TEAM_BS_PARQ}")

    return df


# ─────────────────────────────────────────────
# Player box scores
# ─────────────────────────────────────────────
PLAYER_BS_COLS = [
    "GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION",
    "PLAYER_ID", "PLAYER_NAME",
    "MATCHUP", "WL", "MIN",
    "PTS", "FGM", "FGA", "FG_PCT",
    "FG3M", "FG3A", "FG3_PCT",
    "FTM", "FTA", "FT_PCT",
    "OREB", "DREB", "REB",
    "AST", "STL", "BLK", "TOV", "PF", "PLUS_MINUS",
    "SEASON_TYPE",
]


def load_player_boxscores(save: bool = True) -> pd.DataFrame:
    """
    Load and normalise player-level box scores from the raw player log CSV.

    Returns
    -------
    pd.DataFrame — one row per player per game.
    """
    if not os.path.exists(RAW_PLAYER_PATH):
        raise FileNotFoundError(f"Raw player game log not found: {RAW_PLAYER_PATH}")

    df = pd.read_csv(RAW_PLAYER_PATH, dtype={"Game_ID": str})

    # Normalise column names from the player CSV schema
    rename_map = {
        "Player_ID": "PLAYER_ID",
        "Game_ID":   "GAME_ID",
    }
    df = df.rename(columns=rename_map)

    # Normalise GAME_DATE
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Derive TEAM_ABBREVIATION from MATCHUP if not present
    if "TEAM_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
        df["TEAM_ABBREVIATION"] = df["MATCHUP"].str.split(r"\s+").str[0]

    # Select and reorder columns
    existing_cols = [c for c in PLAYER_BS_COLS if c in df.columns]
    df = df[existing_cols].copy()

    df = df.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION", "PLAYER_NAME"]).reset_index(drop=True)

    print(f"  ✅ Player box scores: {len(df):,} rows, {df['PLAYER_ID'].nunique():,} unique players")

    if save:
        os.makedirs(OUT_PLAYER_DIR, exist_ok=True)
        df.to_csv(PLAYER_BS_CSV, index=False)
        df.to_parquet(PLAYER_BS_PARQ, index=False, engine="pyarrow")
        print(f"  💾 Saved: {PLAYER_BS_CSV}")
        print(f"  💾 Saved: {PLAYER_BS_PARQ}")

    return df


# ─────────────────────────────────────────────
# Game results summary
# ─────────────────────────────────────────────
def build_game_results(team_bs_df: pd.DataFrame | None = None, save: bool = True) -> pd.DataFrame:
    """
    Build a one-row-per-game results summary:
      HOME_SCORE, AWAY_SCORE, WINNER, LOSER, SEASON_TYPE, IS_PLAYOFF.

    Strategy
    --------
    The team game log has one row per team per game.  We identify HOME vs AWAY
    from the MATCHUP string ("vs." = home, "@" = away), then pivot to get
    both teams' PTS on a single row and join schedule metadata.

    Returns
    -------
    pd.DataFrame — one row per completed game.
    """
    if team_bs_df is None:
        team_bs_df = load_team_boxscores(save=False)

    df = team_bs_df.copy()
    if "MATCHUP" not in df.columns:
        raise ValueError("MATCHUP column is required to determine home/away split.")

    df["IS_HOME"] = df["MATCHUP"].str.contains(r"\bvs\.", case=False, regex=True)

    home_df = df[df["IS_HOME"]].rename(columns={
        "TEAM_ABBREVIATION": "HOME_TEAM_ABBREVIATION",
        "TEAM_NAME":         "HOME_TEAM_NAME",
        "PTS":               "HOME_SCORE",
        "WL":                "HOME_WL",
    })[["GAME_ID", "GAME_DATE", "HOME_TEAM_ABBREVIATION", "HOME_TEAM_NAME", "HOME_SCORE", "HOME_WL", "SEASON_TYPE"]]

    away_df = df[~df["IS_HOME"]].rename(columns={
        "TEAM_ABBREVIATION": "AWAY_TEAM_ABBREVIATION",
        "TEAM_NAME":         "AWAY_TEAM_NAME",
        "PTS":               "AWAY_SCORE",
    })[["GAME_ID", "AWAY_TEAM_ABBREVIATION", "AWAY_TEAM_NAME", "AWAY_SCORE"]]

    results = home_df.merge(away_df, on="GAME_ID", how="inner")

    # Determine winner / loser
    results["WINNER_TEAM_ABBREVIATION"] = results.apply(
        lambda r: r["HOME_TEAM_ABBREVIATION"] if r["HOME_WL"] == "W" else r["AWAY_TEAM_ABBREVIATION"],
        axis=1,
    )
    results["LOSER_TEAM_ABBREVIATION"] = results.apply(
        lambda r: r["AWAY_TEAM_ABBREVIATION"] if r["HOME_WL"] == "W" else r["HOME_TEAM_ABBREVIATION"],
        axis=1,
    )

    # IS_PLAYOFF from SEASON_TYPE
    results["IS_PLAYOFF"] = results["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])

    # GAME_STATUS — all rows here are completed
    results["GAME_STATUS"] = "Final"

    # Join schedule for extra playoff context fields if available
    if os.path.exists(COMBINED_SCHED):
        sched = pd.read_csv(COMBINED_SCHED, dtype={"GAME_ID": str})[
            ["GAME_ID", "PLAYOFF_ROUND", "SERIES_GAME_NUMBER",
             "HOME_SERIES_WINS", "AWAY_SERIES_WINS",
             "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]
        ]
        results = results.merge(sched, on="GAME_ID", how="left")

    # Calculate week number relative to season start Tuesday Oct 21, 2025
    season_start = pd.to_datetime("2025-10-21")
    game_dates_dt = pd.to_datetime(results["GAME_DATE"])
    results["WEEK"] = (game_dates_dt - season_start).dt.days // 7 + 1
    # For non-Regular Season, set WEEK to None
    results.loc[results["SEASON_TYPE"] != "Regular Season", "WEEK"] = None

    # Final column order
    final_cols = [
        "GAME_ID", "GAME_DATE",
        "HOME_TEAM_ABBREVIATION", "HOME_TEAM_NAME", "HOME_SCORE",
        "AWAY_TEAM_ABBREVIATION", "AWAY_TEAM_NAME", "AWAY_SCORE",
        "WINNER_TEAM_ABBREVIATION", "LOSER_TEAM_ABBREVIATION",
        "SEASON_TYPE", "IS_PLAYOFF", "GAME_STATUS", "WEEK",
    ]
    # Append schedule-joined cols that may exist
    extra = [c for c in ["PLAYOFF_ROUND", "SERIES_GAME_NUMBER",
                         "HOME_SERIES_WINS", "AWAY_SERIES_WINS",
                         "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]
             if c in results.columns]
    final_cols += extra

    results = results[final_cols].sort_values(["GAME_DATE", "GAME_ID"]).reset_index(drop=True)

    print(f"  ✅ Game results: {len(results):,} completed games")

    if save:
        os.makedirs("data/processed", exist_ok=True)
        results.to_csv(RESULTS_CSV, index=False)
        results.to_parquet(RESULTS_PARQ, index=False, engine="pyarrow")
        print(f"  💾 Saved: {RESULTS_CSV}")
        print(f"  💾 Saved: {RESULTS_PARQ}")

    return results


# ─────────────────────────────────────────────
# Full pipeline entry point
# ─────────────────────────────────────────────
def run_boxscore_pipeline() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Run the full box score pipeline:
      1. Load & save team box scores.
      2. Load & save player box scores.
      3. Build & save game results summary.

    Returns
    -------
    (team_bs_df, player_bs_df, results_df)
    """
    print("STEP A: Loading team box scores...")
    team_bs_df = load_team_boxscores(save=True)

    print("\nSTEP B: Loading player box scores...")
    player_bs_df = load_player_boxscores(save=True)

    print("\nSTEP C: Building game results summary...")
    results_df = build_game_results(team_bs_df=team_bs_df, save=True)

    return team_bs_df, player_bs_df, results_df
