"""
boxscore_loader.py
------------------
Builds the box score layer from the existing raw NBA game log CSVs.
"""

import os
import pandas as pd
from pathlib import Path
from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, season_to_file_token
from src.ingestion.atomic_io import write_csv_atomic

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


def normalize_team_boxscores(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize team-level box score rows in memory (dates, matchups, columns, sort)."""
    from src.processing.cleaning import normalize_game_matchups

    if df.empty:
        return pd.DataFrame(columns=[c for c in TEAM_BS_COLS if c not in ("RAW_MATCHUP", "NORMALIZED_MATCHUP")])

    out = df.copy()
    out["GAME_ID"] = out["GAME_ID"].astype(str).str.zfill(10)
    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"], errors="coerce", format="mixed").dt.strftime("%Y-%m-%d")
    out = normalize_game_matchups(out)

    existing_cols = [c for c in TEAM_BS_COLS if c in out.columns]
    out = out[existing_cols].copy()

    if "GAME_ID" in out.columns and "SEASON_TYPE" in out.columns:
        finals_mask = out["GAME_ID"].str.startswith(("00425004", "00424004"))
        out["SEASON_TYPE"] = out["SEASON_TYPE"].where(~finals_mask, "NBA Finals")

    if "IS_PLAYOFF" not in out.columns and "SEASON_TYPE" in out.columns:
        out["IS_PLAYOFF"] = out["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])

    return out.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION"]).reset_index(drop=True)


def load_team_boxscores(save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Load and normalise team-level box scores from the raw game log CSV.
    """
    dp = get_data_paths(season)
    raw_team_path = dp.team_games_raw

    if not os.path.exists(raw_team_path):
        raise FileNotFoundError(f"Raw team game log not found: {raw_team_path}")

    df = pd.read_csv(raw_team_path, dtype={"GAME_ID": str, "TEAM_ID": str})
    df = normalize_team_boxscores(df)

    print(f"  Team box scores: {len(df):,} rows, {df['GAME_ID'].nunique():,} unique games")

    if save:
        team_bs_csv = get_data_paths(season).raw_team_boxscores
        os.makedirs(os.path.dirname(team_bs_csv), exist_ok=True)
        write_csv_atomic(df, team_bs_csv)
        print(f"  Saved: {team_bs_csv}")

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
    "SEASON_TYPE", "IS_STARTER",
]


def normalize_player_boxscores(
    df: pd.DataFrame,
    starters_df: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """Normalize player-level box score rows in memory and attach starter flags if available."""
    if df.empty:
        return pd.DataFrame(columns=PLAYER_BS_COLS)

    out = df.rename(columns={"Player_ID": "PLAYER_ID", "Game_ID": "GAME_ID"}).copy()
    out["GAME_ID"] = out["GAME_ID"].astype(str).str.zfill(10)
    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"], errors="coerce", format="mixed").dt.strftime("%Y-%m-%d")

    if "TEAM_ABBREVIATION" not in out.columns and "MATCHUP" in out.columns:
        out["TEAM_ABBREVIATION"] = out["MATCHUP"].str.split(r"\s+").str[0]

    if starters_df is not None and not starters_df.empty:
        st = starters_df.copy()
        st["GAME_ID"] = st["Game_ID"].astype(str).str.zfill(10)
        out = out.merge(
            st[["GAME_ID", "Player_ID", "IS_STARTER"]].rename(columns={"Player_ID": "PLAYER_ID"}),
            on=["GAME_ID", "PLAYER_ID"],
            how="left",
        )
        out["IS_STARTER"] = out["IS_STARTER"].astype("Int64")

    existing_cols = [c for c in PLAYER_BS_COLS if c in out.columns]
    out = out[existing_cols].copy()

    if "GAME_ID" in out.columns and "SEASON_TYPE" in out.columns:
        finals_mask = out["GAME_ID"].str.startswith(("00425004", "00424004"))
        out["SEASON_TYPE"] = out["SEASON_TYPE"].where(~finals_mask, "NBA Finals")

    return out.sort_values(["GAME_DATE", "GAME_ID", "TEAM_ABBREVIATION", "PLAYER_NAME"]).reset_index(drop=True)


def load_player_boxscores(save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Load and normalise player-level box scores from the raw player log CSV.
    """
    dp = get_data_paths(season)
    raw_player_path = dp.player_games_raw

    if not os.path.exists(raw_player_path):
        raise FileNotFoundError(f"Raw player game log not found: {raw_player_path}")

    df = pd.read_csv(raw_player_path, dtype={"Game_ID": str})

    # Starter flags are recorded per game from the box score; games without a record keep it empty.
    from src.ingestion.starters_fetcher import starters_path
    starters_csv = starters_path(season)
    starters_df = pd.read_csv(starters_csv, dtype={"Game_ID": str}) if starters_csv.exists() else None
    df = normalize_player_boxscores(df, starters_df=starters_df)

    print(f"  Player box scores: {len(df):,} rows, {df['PLAYER_ID'].nunique():,} unique players")

    if save:
        player_bs_csv = get_data_paths(season).raw_player_boxscores
        os.makedirs(os.path.dirname(player_bs_csv), exist_ok=True)
        write_csv_atomic(df, player_bs_csv)
        print(f"  Saved: {player_bs_csv}")

    return df


# ─────────────────────────────────────────────
# Game results summary
# ─────────────────────────────────────────────
def assemble_game_results(
    team_bs_df: pd.DataFrame,
    schedule_df: pd.DataFrame | None = None,
    season: str | None = None,
) -> pd.DataFrame:
    """Assemble one-row-per-game results summary from normalized team box scores."""
    df = team_bs_df.copy()
    if "MATCHUP" not in df.columns:
        raise ValueError("MATCHUP column is required to determine home/away split.")

    df["GAME_ID"] = df["GAME_ID"].astype(str).str.zfill(10)
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

    results["WINNER_TEAM_ABBREVIATION"] = results.apply(
        lambda r: r["HOME_TEAM_ABBREVIATION"] if r["HOME_WL"] == "W" else r["AWAY_TEAM_ABBREVIATION"],
        axis=1,
    )
    results["LOSER_TEAM_ABBREVIATION"] = results.apply(
        lambda r: r["AWAY_TEAM_ABBREVIATION"] if r["HOME_WL"] == "W" else r["HOME_TEAM_ABBREVIATION"],
        axis=1,
    )

    results["SEASON_TYPE"] = results.apply(
        lambda r: _normalize_season_type(r["GAME_ID"], r["SEASON_TYPE"]),
        axis=1,
    )
    results["IS_PLAYOFF"] = results["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])
    results["GAME_STATUS"] = "Final"

    if schedule_df is None:
        dp = get_data_paths(season)
        combined_sched = dp.schedule_combined
        if os.path.exists(combined_sched):
            schedule_df = pd.read_csv(combined_sched, dtype={"GAME_ID": str})

    if schedule_df is not None and not schedule_df.empty:
        sched_df = schedule_df.copy()
        sched_df["GAME_ID"] = sched_df["GAME_ID"].astype(str).str.zfill(10)
        desired_cols = [
            "GAME_ID", "PLAYOFF_ROUND", "SERIES_GAME_NUMBER",
            "HOME_SERIES_WINS", "AWAY_SERIES_WINS",
            "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES",
            "ARENA", "LOCATION"
        ]
        available_cols = [c for c in desired_cols if c in sched_df.columns]
        results = results.merge(sched_df[available_cols], on="GAME_ID", how="left")

    start_year = int((season or get_default_season()).split("-")[0])
    season_start = pd.to_datetime(f"{start_year}-10-21")
    game_dates_dt = pd.to_datetime(results["GAME_DATE"])
    results["WEEK"] = (game_dates_dt - season_start).dt.days // 7 + 1
    results.loc[results["SEASON_TYPE"] != "Regular Season", "WEEK"] = None

    final_cols = [
        "GAME_ID", "GAME_DATE",
        "HOME_TEAM_ABBREVIATION", "HOME_TEAM_NAME", "HOME_SCORE",
        "AWAY_TEAM_ABBREVIATION", "AWAY_TEAM_NAME", "AWAY_SCORE",
        "WINNER_TEAM_ABBREVIATION", "LOSER_TEAM_ABBREVIATION",
        "SEASON_TYPE", "IS_PLAYOFF", "GAME_STATUS", "WEEK",
    ]
    extra = [c for c in ["PLAYOFF_ROUND", "SERIES_GAME_NUMBER",
                         "HOME_SERIES_WINS", "AWAY_SERIES_WINS",
                         "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES",
                         "ARENA", "LOCATION"]
             if c in results.columns]
    final_cols += extra

    return results[final_cols].sort_values(["GAME_DATE", "GAME_ID"]).reset_index(drop=True)


def build_game_results(team_bs_df: pd.DataFrame | None = None, save: bool = True, season: str = None, output_scope: str = "production") -> pd.DataFrame:
    """
    Build a one-row-per-game results summary.
    """
    if team_bs_df is None:
        team_bs_df = load_team_boxscores(save=False, season=season, output_scope=output_scope)

    results = assemble_game_results(team_bs_df, season=season)

    print(f"  Game results: {len(results):,} completed games")

    if save:
        dp = get_data_paths(season)
        token = season_to_file_token(season or get_default_season())
        if output_scope == "experimental":
            os.makedirs(str(ROOT / "data/experimental"), exist_ok=True)
            results_csv = str(ROOT / f"data/experimental/game_results_{token}.csv")
        else:
            results_csv = dp.game_results
            os.makedirs(os.path.dirname(results_csv), exist_ok=True)
            
        write_csv_atomic(results, results_csv)
        print(f"  Saved results summary: {results_csv}")

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
