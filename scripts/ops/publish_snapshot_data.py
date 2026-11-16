#!/usr/bin/env python3
"""Publish the small data subset the pre-tip snapshot needs, so GitHub Actions can run it.

Run after `main.py --update-data` each morning. Force-adds the whitelisted files (data/ is
git-ignored), commits them if they changed and pushes. The Actions workflow owns the paper
ledger, so this pulls first to receive its latest commits.
"""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.season_utils import get_default_season, normalize_season

CURRENT_SEASON_FILES = (
    "raw/team_games.csv", "raw/player_games.csv", "raw/player_starters.csv", "raw/schedule.csv", "features/team_features.csv",
    "analysis/*.csv", "analysis/*.json", "processed/game_results.csv", "processed/schedule_combined.csv",
)
PREVIOUS_SEASON_FILES = ("raw/team_games.csv", "raw/player_games.csv", "raw/player_starters.csv", "features/team_features.csv", "analysis/*.csv")
ALL_SEASONS_FILES = ("processed/game_results.csv",)


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, check=check, text=True, capture_output=True)


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[2:]}"


def whitelist(season: str) -> list:
    data = ROOT / "data"
    paths = set(data.glob("reference/*.csv"))
    paths.update(data.glob("training/pbp_situational_features.csv"))
    # PLAYER projections in the snapshot: raw game lines of the training seasons (see player_history_slim).
    paths.update(data.glob("training/player_history_slim.csv"))
    # Shadow WIN candidates scored next to production (src/inference/win_shadow.py).
    paths.update((ROOT / "models" / "experimental").glob("win_live_roster_shadow.*"))
    for pattern in CURRENT_SEASON_FILES:
        paths.update(data.glob(f"season={season}/{pattern}"))
    for pattern in PREVIOUS_SEASON_FILES:
        paths.update(data.glob(f"season={previous_season(season)}/{pattern}"))
    for pattern in ALL_SEASONS_FILES:
        paths.update(data.glob(f"season=*/{pattern}"))
    return sorted(p.relative_to(ROOT).as_posix() for p in paths if p.is_file())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    season = normalize_season(args.season or get_default_season())
    from src.processing.player_history_slim import build_player_history_slim, slim_is_stale
    if slim_is_stale():
        print(f"rebuilt {build_player_history_slim().name} from the player training dataset")
    files = whitelist(season)
    size = sum((ROOT / f).stat().st_size for f in files) / 1e6
    print(f"{len(files)} files, {size:.1f} MB")
    if args.dry_run:
        return 0

    git("pull", "--rebase", "--autostash")
    git("add", "-f", "--", *files)
    if git("diff", "--cached", "--quiet", check=False).returncode == 0:
        print("snapshot inputs unchanged, nothing to publish")
        return 0
    stat = git("diff", "--cached", "--shortstat").stdout.strip()
    git("commit", "-m", f"data: snapshot inputs for {season}")
    git("push")
    print(f"published: {stat}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
