"""Live display roster for the in-progress season.

Merges the bootstrap roster (``analysis/team_rosters.csv``, built before the
season from the previous season's stats) with regular-season player game logs
of the current season. The result is written to
``analysis/team_rosters_live.csv`` and is used only by frontend exports.
The bootstrap file is never modified, so model/prediction inputs stay intact.
"""

import os
from typing import Optional

import pandas as pd

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season, normalize_season
from src.analysis.roster_transactions import roster_as_of
from src.processing.cleaning import clean_minutes_column

LIVE_ROSTER_FILENAME = "team_rosters_live.csv"
ROSTER_COLUMNS = [
    "TEAM_ABBREVIATION", "PLAYER_ID", "PLAYER_NAME", "GP", "TOTAL_MIN",
    "AVG_MIN", "AVG_PTS", "AVG_REB", "AVG_AST", "IMPORTANCE_SCORE",
]


def _importance(df: pd.DataFrame) -> pd.Series:
    return df["AVG_MIN"] * 0.5 + df["AVG_PTS"] * 1.0 + df["AVG_AST"] * 0.8 + df["AVG_REB"] * 0.6


def _regular_season_games(player_games_path: str) -> pd.DataFrame:
    if not os.path.exists(player_games_path):
        return pd.DataFrame()
    df = pd.read_csv(player_games_path, dtype={"Game_ID": str})
    if df.empty:
        return df
    gid = df["Game_ID"].astype(str).str.replace(r"\D", "", regex=True).str.zfill(10)
    mask = gid.str.startswith("002")
    if "SEASON_TYPE" in df.columns:
        mask |= df["SEASON_TYPE"].astype(str).str.lower().eq("regular season")
    df = df[mask].copy()
    if df.empty:
        return df
    df = clean_minutes_column(df, "MIN")
    for col in ["PTS", "REB", "AST", "MIN"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["TEAM_ABBREVIATION"] = df["MATCHUP"].astype(str).str.split().str[0]
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    return df


def build_live_roster(season: Optional[str] = None) -> Optional[pd.DataFrame]:
    """Build and save the live roster. Returns None if no bootstrap roster exists."""
    season = normalize_season(season or get_default_season())
    paths = get_data_paths(season)
    analysis_dir = os.path.join(os.path.dirname(os.path.dirname(paths.player_games_raw)), "analysis")
    base_path = os.path.join(analysis_dir, "team_rosters.csv")
    if not os.path.exists(base_path):
        print(f"[live-roster] No bootstrap roster at {base_path}; skipping.")
        return None

    base = pd.read_csv(base_path)
    base["STATS_SEASON"] = "previous"
    games = _regular_season_games(paths.player_games_raw)

    if games.empty:
        live = base
        n_current = 0
        last_game_dates = {}
    else:
        agg = games.groupby(["Player_ID"]).agg(
            PLAYER_NAME=("PLAYER_NAME", "last"),
            GP=("GAME_DATE", "count"),
            TOTAL_MIN=("MIN", "sum"),
            AVG_MIN=("MIN", "mean"),
            AVG_PTS=("PTS", "mean"),
            AVG_REB=("REB", "mean"),
            AVG_AST=("AST", "mean"),
        ).reset_index().rename(columns={"Player_ID": "PLAYER_ID"})
        latest_team = (
            games.sort_values("GAME_DATE").groupby("Player_ID")["TEAM_ABBREVIATION"].last()
        )
        agg["TEAM_ABBREVIATION"] = agg["PLAYER_ID"].map(latest_team)
        agg["IMPORTANCE_SCORE"] = _importance(agg)
        agg["STATS_SEASON"] = season
        n_current = len(agg)

        # Players with current-season games use those stats and their latest team;
        # the rest keep the bootstrap row (previous-season stats, signed roster team).
        remaining = base[~base["PLAYER_ID"].isin(agg["PLAYER_ID"])]
        live = pd.concat([agg, remaining], ignore_index=True)
        last_game_dates = games.groupby("Player_ID")["GAME_DATE"].max().to_dict()

    # Moves after a player's latest game (trades, signings, waivers) are not in the logs yet.
    live = roster_as_of(live, season, pd.Timestamp.today(), last_game_dates)

    live = live[ROSTER_COLUMNS + ["STATS_SEASON"]]
    for col in ["AVG_MIN", "AVG_PTS", "AVG_REB", "AVG_AST", "IMPORTANCE_SCORE"]:
        live[col] = pd.to_numeric(live[col], errors="coerce").round(2)
    live = live.sort_values(["TEAM_ABBREVIATION", "AVG_MIN"], ascending=[True, False]).reset_index(drop=True)

    out_path = os.path.join(analysis_dir, LIVE_ROSTER_FILENAME)
    live.to_csv(out_path, index=False)
    print(f"[live-roster] {season}: {n_current} players with regular-season stats, "
          f"{len(live) - n_current} on bootstrap stats -> {out_path}")
    return live


def preferred_roster_path(analysis_dir: str) -> str:
    """Return the live roster path if present, else the bootstrap roster path."""
    live = os.path.join(analysis_dir, LIVE_ROSTER_FILENAME)
    return live if os.path.exists(live) else os.path.join(analysis_dir, "team_rosters.csv")
