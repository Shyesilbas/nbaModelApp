#!/usr/bin/env python3
"""Opening Elo of a season: chained earlier seasons, mean reversion, roster-talent adjustment.

Prints the ratings and the change against the existing file; writes it only with --write.
"""
import argparse
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.features.continuous_elo import build_season_opening_elo
from src.features.roster_talent import (
    CARRIED_WEIGHT,
    PLAYER_GAME_COLUMNS,
    SEASON_WEIGHTS,
    end_roster,
    player_ratings,
    regular_season_player_games,
    roster_elo_adjustment,
)


def prior_seasons(season: str) -> list[str]:
    found = sorted(
        p.parent.parent.name.split("=", 1)[1]
        for p in (ROOT / "data").glob("season=*/raw/team_games.csv")
        if p.parent.parent.name.split("=", 1)[1] < season
    )
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", help="Target season (e.g. 2026-27)")
    parser.add_argument("--write", action="store_true", help="Overwrite team_elo_initial.json")
    args = parser.parse_args()
    season = normalize_season(args.season) if args.season else get_default_season()
    dp = get_data_paths(season)
    prev = prior_seasons(season)

    games = [
        regular_season_player_games(pd.read_csv(get_data_paths(s).player_games_raw, usecols=PLAYER_GAME_COLUMNS))
        for s in prev[::-1][: len(SEASON_WEIGHTS)]
    ]
    ratings = player_ratings(games)
    signed = pd.read_csv(dp.team_rosters)
    new_roster = signed.groupby("TEAM_ABBREVIATION")["PLAYER_ID"].apply(list).to_dict()
    adjustment = roster_elo_adjustment(ratings, end_roster(games[0]), new_roster)

    opening = build_season_opening_elo(prev, roster_adjustment=adjustment, carried_weight=CARRIED_WEIGHT)

    out_file = Path(dp.season_dir) / "analysis" / "team_elo_initial.json"
    old = json.loads(out_file.read_text()) if out_file.exists() else {}
    print(f"{season} opening Elo (prior seasons {prev[0]}..{prev[-1]})")
    for rank, (team, elo) in enumerate(sorted(opening.items(), key=lambda x: -x[1]), 1):
        was = f"{old[team]:.1f}" if team in old else "n/a"
        print(f"{rank:2d}. {team}: {elo:7.1f}  (was {was}, roster {adjustment.get(team, 0.0):+.1f})")

    if args.write:
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(opening, indent=2))
        print(f"Saved {len(opening)} ratings to {out_file}")
    else:
        print("Dry run: pass --write to save.")


if __name__ == "__main__":
    main()
