#!/usr/bin/env python3
"""Build a slim backend runtime bundle for local or container deployment.

The bundle keeps the backend code, model artifacts, and only the current season
runtime data needed by the API. Historical play-by-play and older seasons stay
out unless explicitly included.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.export_frontend_public_bundle import build_public_bundle as build_frontend_public_bundle
from scripts.export_player_profiles import export_player_profiles
from scripts.season_utils import get_default_season, normalize_season

CODE_DIRS = ("ml-service", "src", "scripts", "config")
MODEL_DIR = "models/production"

RUNTIME_FILES = (
    "data/canonical/player_metadata.csv",
    "data/season={season}/analysis/team_rosters.csv",
    "data/season={season}/analysis/core_players.csv",
    "data/season={season}/features/team_features.csv",
    "data/season={season}/features/player_features.csv",
    "data/season={season}/processed/game_results.csv",
    "data/season={season}/processed/schedule_combined.csv",
    "data/season={season}/processed/upcoming_games_context.csv",
    "data/season={season}/raw/team_games.csv",
    "data/season={season}/raw/player_games.csv",
)


def _copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(
        src,
        dst,
        ignore=shutil.ignore_patterns(
            ".venv",
            "__pycache__",
            "*.pyc",
            "*.pyo",
            "*.pyd",
            ".pytest_cache",
            ".mypy_cache",
        ),
    )


def _copy_file(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def _write_bundle_marker(out_dir: Path, season: str, include_play_by_play: bool) -> None:
    marker = out_dir / "backend-runtime-manifest.txt"
    lines = [
        f"season={season}",
        f"include_play_by_play={str(include_play_by_play).lower()}",
        f"generated_by={Path(__file__).name}",
    ]
    marker.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_empty_data_stubs(out_dir: Path) -> None:
    import json

    # All files served by /frontend-data/{filename} endpoint in the API.
    # Write empty stubs for any that are missing so the frontend gets [] instead of 404.
    all_expected = {
        "core_players.json": [],
        "game_results.json": [],
        "highlights.json": [],
        "multi_team_players.json": [],
        "player_name_lookup.json": [],
        "player_profiles.json": [],
        "player_season_averages.json": {},
        "player_season_games.json": {},
        "schedule.json": [],
        "seasons.json": [],
        "star_candidates.json": [],
        "team_rosters.json": [],
        "upcoming_games_context.json": [],
        # games/all_seasons/boxscores are not in GENERIC_ALLOWED_FILES but write stubs too
        "games.json": [],
        "all_seasons_games.json": [],
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, empty_value in all_expected.items():
        path = out_dir / filename
        if not path.exists():
            with open(path, "w") as fh:
                json.dump(empty_value, fh)
            print(f"[WARN] Wrote empty stub -> {path}", file=sys.stderr)


def build_backend_runtime_bundle(
    out_dir: Path,
    season: str | None = None,
    include_play_by_play: bool = False,
) -> None:
    active_season = normalize_season(season or get_default_season())

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for dirname in CODE_DIRS:
        _copy_tree(REPO_ROOT / dirname, out_dir / dirname)

    _copy_tree(REPO_ROOT / MODEL_DIR, out_dir / MODEL_DIR)

    frontend_out = out_dir / "data" / "frontend"
    build_frontend_public_bundle(frontend_out, active_season)
    try:
        export_player_profiles(season=active_season, out_dir=str(frontend_out))
    except FileNotFoundError as exc:
        print(f"[WARN] Skipping player profiles export: {exc}", file=sys.stderr)
    _write_empty_data_stubs(frontend_out)

    for rel_path in RUNTIME_FILES:
        source = REPO_ROOT / rel_path.format(season=active_season)
        if source.exists():
            _copy_file(source, out_dir / rel_path.format(season=active_season))

    if include_play_by_play:
        pbp_src = REPO_ROOT / f"data/season={active_season}/raw/play_by_play"
        if pbp_src.exists():
            _copy_tree(pbp_src, out_dir / f"data/season={active_season}/raw/play_by_play")

    _write_bundle_marker(out_dir, active_season, include_play_by_play)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a slim backend runtime bundle.")
    parser.add_argument(
        "--out-dir",
        default=str(REPO_ROOT / ".deploy" / "backend-runtime"),
        help="Output directory for the runtime bundle.",
    )
    parser.add_argument(
        "--season",
        default=None,
        help="Season to package. Defaults to the configured active season.",
    )
    parser.add_argument(
        "--include-play-by-play",
        action="store_true",
        help="Include current-season play-by-play JSON files in the bundle.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    build_backend_runtime_bundle(out_dir, args.season, args.include_play_by_play)
    print(f"Backend runtime bundle written to {out_dir}")


if __name__ == "__main__":
    main()
