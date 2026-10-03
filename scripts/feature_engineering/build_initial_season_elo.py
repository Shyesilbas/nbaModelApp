#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.features.continuous_elo import build_season_opening_elo, build_continuous_elo_dataset


def main():
    prev_seasons = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
    target_season = "2026-27"

    r25_path = ROOT / "data/season=2025-26/analysis/team_rosters.csv"
    r26_path = ROOT / f"data/season={target_season}/analysis/team_rosters.csv"

    r25_df = pd.read_csv(r25_path) if r25_path.exists() else None
    r26_df = pd.read_csv(r26_path) if r26_path.exists() else None

    print(f"Building initial Elo ratings for {target_season}...")
    opening_ratings = build_season_opening_elo(
        prev_seasons=prev_seasons,
        prev_roster_df=r25_df,
        curr_roster_df=r26_df,
    )

    out_dir = ROOT / "data/production"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"team_elo_initial_{target_season.replace('-', '_')}.json"

    with open(out_file, "w") as f:
        json.dump(opening_ratings, f, indent=2)

    # Also save in target season analysis directory if exists
    season_analysis_dir = ROOT / f"data/season={target_season}/analysis"
    if season_analysis_dir.exists():
        with open(season_analysis_dir / "team_elo_initial.json", "w") as f:
            json.dump(opening_ratings, f, indent=2)

    print(f"Saved initial Elo ratings ({len(opening_ratings)} teams) to {out_file}")
    
    sorted_ratings = sorted(opening_ratings.items(), key=lambda x: x[1], reverse=True)
    print("\n--- 2026-27 Season Opening Elo Rankings ---")
    for rank, (team, elo) in enumerate(sorted_ratings, 1):
        print(f"{rank:2d}. {team}: {elo:.1f}")


if __name__ == "__main__":
    main()
