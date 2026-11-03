#!/usr/bin/env python3
"""Morning routine in one command: refresh the game data, then publish the snapshot inputs.

Runs scripts/update_all_game_data.py (game logs, box scores, play-by-play, PBP table, frontend
store) and, only if that succeeds, scripts/ops/publish_snapshot_data.py, so GitHub Actions never
predicts from a half-updated dataset. Last, scripts/refresh_reports.py regrades the ledger against
the refreshed results and rewrites every generated report and doc block, rerunning the walk-forward
benchmark when the production models changed (a failure there is reported but does not undo the publish).
Extra arguments go to the data refresh, for example `--pbp-limit 20`.
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(label: str, command: list) -> None:
    print(f"\n=== {label} ===", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-update", action="store_true", help="Only publish; the data is already refreshed")
    parser.add_argument("--dry-run", action="store_true", help="Publish step lists the files without committing")
    args, refresh_args = parser.parse_known_args()

    try:
        if not args.skip_update:
            run("Refresh game data", [sys.executable, "scripts/update_all_game_data.py", *refresh_args])
        publish = [sys.executable, "scripts/ops/publish_snapshot_data.py"]
        run("Publish snapshot inputs", publish + (["--dry-run"] if args.dry_run else []))
    except subprocess.CalledProcessError as exc:
        print(f"\nStopped: step failed with exit code {exc.returncode}; nothing was published after it.", file=sys.stderr)
        return exc.returncode
    try:
        run("Refresh reports", [sys.executable, "scripts/refresh_reports.py"])
    except subprocess.CalledProcessError as exc:
        print(f"\nReport refresh failed with exit code {exc.returncode}; the publish above stands.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
