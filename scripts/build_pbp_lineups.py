"""Build stints and on-court player games from cached play-by-play for one season, with a box score quality check.

Writes data/season=YYYY-YY/processed/pbp_stints.csv and pbp_player_games.csv. No API calls.
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from src.core.data_paths import get_data_paths  # noqa: E402
from src.processing.pbp_lineups import build_season, game_quality, quality_check  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", required=True, help="Season label, e.g. 2025-26.")
    parser.add_argument("--limit", type=int, help="Only the first N cached games (smoke test).")
    parser.add_argument("--dry-run", action="store_true", help="Report coverage without writing files.")
    args = parser.parse_args()

    stints, pg, summary = build_season(args.season, args.limit)
    print(f"{args.season}: {summary['games_ok']}/{summary['games_cached']} games rebuilt")
    for gid, reasons in list(summary["failed"].items())[:10]:
        print(f"  failed {gid}: {reasons[0]}")
    if pg.empty:
        return 1

    box = pd.read_csv(get_data_paths(args.season).raw_player_boxscores)
    qc = quality_check(pg, box)
    print(f"player-games {len(qc)}: plus-minus exact {(qc['PM_DIFF'] == 0).mean():.3f}, "
          f"within 2 {(qc['PM_DIFF'].abs() <= 2).mean():.3f}, minutes MAE {qc['MIN_DIFF'].abs().mean():.3f}")
    quality = game_quality(qc)
    print(f"usable games {int(quality['USABLE'].sum())}/{len(quality)} (plus-minus and minutes within limits)")
    if args.dry_run:
        return 0

    out_dir = Path(get_data_paths(args.season).game_results).parent
    out_dir.mkdir(parents=True, exist_ok=True)
    stints.to_csv(out_dir / "pbp_stints.csv", index=False)
    pg.to_csv(out_dir / "pbp_player_games.csv", index=False)
    quality.to_csv(out_dir / "pbp_game_quality.csv", index=False)
    print(f"wrote pbp_stints.csv, pbp_player_games.csv and pbp_game_quality.csv under {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
