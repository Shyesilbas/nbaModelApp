"""
Build boxscore-aligned minimal player features for a given season.

Outputs (experimental scope only for 2024-25 work):
- data/experimental/player_games_features_{YYYY_YY}_boxscore_aligned.csv
- data/experimental/player_games_features_{YYYY_YY}_boxscore_aligned.parquet

Notes:
- Uses raw player boxscores as canonical source to ensure GAME_ID alignment with game_results.
- Augments with opponent abbreviation and IS_HOME derived from team-level matchups.
- This file is primarily for audits and parity checks; the score dataset builder computes
  player-level aggregate features at merge time, but aligned IDs are still useful.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


def _derive_opponent_and_home_flags(df_players: pd.DataFrame, df_team: pd.DataFrame) -> pd.DataFrame:
    # Reduce team frame to unique GAME_ID+TEAM rows with opponent and home flag
    # Reuse logic by reconstructing from team boxscores
    req_team_cols = [
        "GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "MATCHUP",
    ]
    missing = [c for c in req_team_cols if c not in df_team.columns]
    if missing:
        raise RuntimeError(f"Team boxscores missing columns: {missing}")

    # Build opponent abbrev by self-joining on GAME_ID
    t_left = df_team[req_team_cols + ["PTS"]].copy()
    t_right = df_team[req_team_cols + ["PTS"]].copy().rename(columns={
        "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
        "PTS": "OPP_PTS",
        "MATCHUP": "OPP_MATCHUP",
    })
    tm = t_left.merge(t_right, on=["GAME_ID", "GAME_DATE"], suffixes=("", "_r"))
    tm = tm[tm["TEAM_ABBREVIATION"] != tm["OPPONENT_ABBREVIATION"]].copy()
    tm["IS_HOME"] = tm["MATCHUP"].str.contains("vs.").astype(int)
    tm = tm[["GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME"]].drop_duplicates()

    # Attach to players by GAME_ID+TEAM_ABBREVIATION
    cols_players = [
        c for c in df_players.columns
        if c in {
            "GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "PLAYER_ID", "PLAYER_NAME", "MATCHUP", "WL",
            "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "PF", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA",
        }
    ]
    p = df_players[cols_players].copy()
    p["GAME_ID"] = p["GAME_ID"].astype(str)
    p["GAME_DATE"] = pd.to_datetime(p["GAME_DATE"]).dt.strftime("%Y-%m-%d")
    out = p.merge(tm, on=["GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION"], how="left")
    return out


def build_player_features_from_boxscores(season: str, output_scope: str = "experimental") -> Tuple[Path, Path]:
    import sys
    sys.path.append(str(ROOT / "scripts"))
    from scripts.data_paths import get_data_paths
    from scripts.season_utils import season_to_file_token

    if output_scope != "experimental":
        raise ValueError("This builder only writes experimental outputs for safety.")

    dp = get_data_paths(season)
    token = season_to_file_token(season)

    team_path = Path(dp.raw_team_boxscores)
    player_path = Path(dp.raw_player_boxscores)
    if not team_path.exists() or not player_path.exists():
        raise FileNotFoundError(f"Missing raw boxscores: team={team_path} player={player_path}")

    df_team = pd.read_csv(team_path)
    df_player = pd.read_csv(player_path)
    out = _derive_opponent_and_home_flags(df_player, df_team)

    csv_out = ROOT / f"data/experimental/player_games_features_{token}_boxscore_aligned.csv"
    pq_out = ROOT / f"data/experimental/player_games_features_{token}_boxscore_aligned.parquet"
    csv_out.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(csv_out, index=False)
    try:
        out.to_parquet(pq_out, index=False)
    except Exception:
        pass
    return csv_out, pq_out


def main():
    parser = argparse.ArgumentParser(description="Build boxscore-aligned minimal player features")
    parser.add_argument("--season", type=str, required=True, help="Season string, e.g., 2024-25")
    parser.add_argument("--output-scope", type=str, default="experimental", help="Output scope (experimental only)")
    args = parser.parse_args()

    csv_p, pq_p = build_player_features_from_boxscores(args.season, args.output_scope)
    print(f"Saved: {csv_p}")
    if pq_p.exists():
        print(f"Saved: {pq_p}")


if __name__ == "__main__":
    main()
