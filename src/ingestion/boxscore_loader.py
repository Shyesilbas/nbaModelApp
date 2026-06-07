"""
boxscore_loader.py
------------------
Builds the box score layer from the existing raw NBA game log CSVs.
"""

import os
import pandas as pd
from pathlib import Path
from scripts.data_paths import get_data_paths
from scripts.season_utils import season_to_file_token

ROOT = Path(__file__).resolve().parents[2]

def _normalize_season_type(game_id: str, season_type: str | None) -> str | None:
    """Normalize finals game ids to NBA Finals regardless of upstream label."""
    gid = str(game_id).zfill(10)
    if gid.startswith("00425004") or gid.startswith("00424004"):
        return "NBA Finals"
    return season_type


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
    "SEASON_TYPE", "RAW_MATCHUP", "NORMALIZED_MATCHUP"
]


def load_team_boxscores(save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Load and normalise team-level box scores from the raw game log CSV.
    """
    from src.processing.cleaning import normalize_game_matchups

    dp = get_data_paths(season)
    raw_team_path = dp.team_games_raw

    if not os.path.exists(raw_team_path):
        raise FileNotFoundError(f"Raw team game log not found: {raw_team_path}")

    df = pd.read_csv(raw_team_path, dtype={"GAME_ID": str, "TEAM_ID": str})

    # Normalise GAME_DATE
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Correct matchup pivot drops/anomalies (identical away-style MATCHUPs)
    df = normalize_game_matchups(df)

    # Select and reorder columns (keep only those that exist)
    existing_cols = [c for c in TEAM_BS_COLS if c in df.columns]
    df = df[existing_cols].copy()

    if "GAME_ID" in df.columns and "SEASON_TYPE" in df.columns:
        df["SEASON_TYPE"] = df.apply(
            lambda r: _normalize_season_type(r["GAME_ID"], r["SEASON_TYPE"]),
            axis=1,
        )

    # Ensure IS_PLAYOFF can be derived later
    if "IS_PLAYOFF" not in df.columns and "SEASON_TYPE" in df.columns:
        df["IS_PLAYOFF"] = df["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])

    df = df.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION"]).reset_index(drop=True)

    print(f"  ✅ Team box scores: {len(df):,} rows, {df['GAME_ID'].nunique():,} unique games")

    if save:
        token = season_to_file_token(season or "2025-26")
        out_team_dir = str(ROOT / "data/raw/boxscores/team")
        team_bs_csv = str(ROOT / f"data/raw/boxscores/team/nba_team_boxscores_{token}.csv")
        team_bs_parq = team_bs_csv.replace(".csv", ".parquet")
        
        os.makedirs(out_team_dir, exist_ok=True)
        df.to_csv(team_bs_csv, index=False)
        df.to_parquet(team_bs_parq, index=False, engine="pyarrow")
        print(f"  💾 Saved: {team_bs_csv}")
        print(f"  💾 Saved: {team_bs_parq}")

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


def load_player_boxscores(save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Load and normalise player-level box scores from the raw player log CSV.
    """
    dp = get_data_paths(season)
    raw_player_path = dp.player_games_raw

    if not os.path.exists(raw_player_path):
        raise FileNotFoundError(f"Raw player game log not found: {raw_player_path}")

    df = pd.read_csv(raw_player_path, dtype={"Game_ID": str})

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

    if "GAME_ID" in df.columns and "SEASON_TYPE" in df.columns:
        df["SEASON_TYPE"] = df.apply(
            lambda r: _normalize_season_type(r["GAME_ID"], r["SEASON_TYPE"]),
            axis=1,
        )

    df = df.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION", "PLAYER_NAME"]).reset_index(drop=True)

    print(f"  ✅ Player box scores: {len(df):,} rows, {df['PLAYER_ID'].nunique():,} unique players")

    if save:
        token = season_to_file_token(season or "2025-26")
        out_player_dir = str(ROOT / "data/raw/boxscores/player")
        player_bs_csv = str(ROOT / f"data/raw/boxscores/player/nba_player_boxscores_{token}.csv")
        player_bs_parq = player_bs_csv.replace(".csv", ".parquet")
        
        os.makedirs(out_player_dir, exist_ok=True)
        df.to_csv(player_bs_csv, index=False)
        df.to_parquet(player_bs_parq, index=False, engine="pyarrow")
        print(f"  💾 Saved: {player_bs_csv}")
        print(f"  💾 Saved: {player_bs_parq}")

    return df


# ─────────────────────────────────────────────
# Game results summary
# ─────────────────────────────────────────────
def build_game_results(team_bs_df: pd.DataFrame | None = None, save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Build a one-row-per-game results summary.
    """
    if team_bs_df is None:
        team_bs_df = load_team_boxscores(save=False, season=season, output_scope=output_scope)

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
    results["SEASON_TYPE"] = results.apply(
        lambda r: _normalize_season_type(r["GAME_ID"], r["SEASON_TYPE"]),
        axis=1,
    )
    results["IS_PLAYOFF"] = results["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])

    # GAME_STATUS — all rows here are completed
    results["GAME_STATUS"] = "Final"

    # Join schedule for extra playoff context fields if available
    dp = get_data_paths(season)
    combined_sched = dp.schedule_combined
    if os.path.exists(combined_sched):
        sched = pd.read_csv(combined_sched, dtype={"GAME_ID": str})[
            ["GAME_ID", "PLAYOFF_ROUND", "SERIES_GAME_NUMBER",
             "HOME_SERIES_WINS", "AWAY_SERIES_WINS",
             "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]
        ]
        results = results.merge(sched, on="GAME_ID", how="left")

    # Calculate week number relative to season start
    # 2024-25 starts Oct 22, 2024; 2025-26 starts Oct 21, 2025
    is_24_25 = (season_to_file_token(season or "2025-26") == "2024_25")
    season_start_str = "2024-10-22" if is_24_25 else "2025-10-21"
    season_start = pd.to_datetime(season_start_str)
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
        token = season_to_file_token(season or "2025-26")
        if output_scope == "experimental":
            os.makedirs(str(ROOT / "data/experimental"), exist_ok=True)
            results_csv = str(ROOT / f"data/experimental/game_results_{token}.csv")
        else:
            os.makedirs(str(ROOT / "data/processed"), exist_ok=True)
            results_csv = dp.game_results
            
        results_parq = results_csv.replace(".csv", ".parquet")
        results.to_csv(results_csv, index=False)
        results.to_parquet(results_parq, index=False, engine="pyarrow")
        print(f"  💾 Saved results summary: {results_csv}")
        print(f"  💾 Saved results summary: {results_parq}")

    return results


# ─────────────────────────────────────────────
# Full pipeline entry point
# ─────────────────────────────────────────────
def run_boxscore_pipeline(season: str = None, output_scope: str = "production") -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Run the full box score pipeline.
    """
    print("STEP A: Loading team box scores...")
    team_bs_df = load_team_boxscores(save=True, season=season, output_scope=output_scope)

    print("\nSTEP B: Loading player box scores...")
    player_bs_df = load_player_boxscores(save=True, season=season, output_scope=output_scope)

    print("\nSTEP C: Building game results summary...")
    results_df = build_game_results(team_bs_df=team_bs_df, save=True, season=season, output_scope=output_scope)

    return team_bs_df, player_bs_df, results_df

