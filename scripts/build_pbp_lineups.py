"""Build stints and on-court player games from cached play-by-play for one season, with a box score quality check.

Writes data/season=YYYY-YY/processed/pbp_stints.csv, pbp_player_games.csv and pbp_game_quality.csv. No API calls.
Also available as `python3 main.py --season YYYY-YY --build-pbp-lineups`.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.processing.pbp_lineups import build_and_write  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", required=True, help="Season label, e.g. 2025-26.")
    parser.add_argument("--limit", type=int, help="Only the first N cached games (smoke test).")
    parser.add_argument("--dry-run", action="store_true", help="Report coverage without writing files.")
    args = parser.parse_args()
    return build_and_write(args.season, args.limit, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
