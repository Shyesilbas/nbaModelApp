"""Refresh game logs, build boxscores/results, and fetch play-by-play in one run."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run_step(label: str, command: list[str]) -> None:
    print(f"\n=== {label} ===", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Update NBA game logs, boxscores/results, and play-by-play together."
    )
    parser.add_argument("--season", help="Season, e.g. 2025-26. Defaults to the current season.")
    parser.add_argument("--fetch-workers", type=int, default=4)
    parser.add_argument("--skip-post-update-rebuilds", action="store_true")
    parser.add_argument("--pbp-limit", type=int, help="Limit PBP fetches, useful for a partial run.")
    parser.add_argument("--pbp-sleep", type=float, default=0.6)
    parser.add_argument("--force-pbp", action="store_true", help="Refetch PBP even when cached.")
    args = parser.parse_args()

    main_script = str(ROOT / "main.py")
    common = [sys.executable, main_script]
    season_args = ["--season", args.season] if args.season else []

    run_step(
        "1/3 Update schedule and missing game logs",
        common + season_args + ["--update-data", "--fetch-workers", str(args.fetch_workers)]
        + (["--skip-post-update-rebuilds"] if args.skip_post_update_rebuilds else []),
    )
    run_step(
        "2/3 Build boxscores and game results",
        common + season_args + ["--fetch-boxscores"],
    )

    pbp_command = [sys.executable, str(ROOT / "scripts" / "build_play_by_play.py")]
    if args.season:
        pbp_command += ["--season", args.season]
    else:
        # Resolve the season once so both ingestion stages use the same target.
        from scripts.season_utils import get_default_season

        pbp_command += ["--season", get_default_season()]
    if args.pbp_limit:
        pbp_command += ["--limit", str(args.pbp_limit)]
    pbp_command += ["--sleep", str(args.pbp_sleep)]
    if args.force_pbp:
        pbp_command.append("--force")
    run_step("3/3 Fetch play-by-play", pbp_command)

    run_step(
        "4/4 Update situational dataset & frontend store",
        [
            sys.executable,
            "-c",
            "from src.features.pbp_situational import build_situational_dataset; "
            "df = build_situational_dataset('data'); "
            "df.to_csv('data/processed/pbp_situational_features.csv', index=False); "
            "from src.frontend_store.builders import build_frontend_store; "
            "build_frontend_store()",
        ],
    )
    print("\nAll game data steps completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
