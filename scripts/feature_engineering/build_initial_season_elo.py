#!/usr/bin/env python3
"""Opening Elo of a season: chained earlier seasons, mean reversion, roster-talent adjustment.

Prints the ratings and the change against the existing file; writes it only with --write.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.features.opening_elo import build_opening_elo


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", help="Target season (e.g. 2026-27)")
    parser.add_argument("--write", action="store_true", help="Overwrite team_elo_initial.json")
    args = parser.parse_args()
    season = normalize_season(args.season) if args.season else get_default_season()
    dp = get_data_paths(season)
    opening, adjustment, prev = build_opening_elo(season)

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
