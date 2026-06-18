#!/usr/bin/env python3
"""Build a lean frontend/public/data bundle for static deployment.

This keeps only the lightweight, user-facing datasets and removes large
training/detail exports that are only needed by the backend or local analysis.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts.export_frontend_data import export_data as export_public_data
from scripts.export_player_profiles import export_player_profiles


HEAVY_FILE_PATTERNS = (
    "all_seasons_games.json",
    "game_details.json",
    "game_results_*.json",
    "player_season_games.json",
    "player_boxscores_*.json",
    "team_boxscores_*.json",
    "schedule_details_*.json",
    "model_ready_v2_summary.json",
)

SLIM_SUMMARY_FILES = {
    "Raw Team Game Logs",
    "Raw Player Game Logs",
    "Team Rosters",
    "Core Players List",
    "Star Candidates",
    "Multi-Team Players",
    "Player Name Lookup",
    "Combined Schedule",
    "Upcoming Games Context",
}

SLIM_SUMMARY_KEYS = {
    "total_teams",
    "total_players",
    "total_player_game_rows",
    "total_team_game_rows",
    "player_games_regular",
    "player_games_playin",
    "player_games_playoffs",
    "player_games_finals",
    "team_games_regular",
    "team_games_playin",
    "team_games_playoffs",
    "team_games_finals",
}


def _write_manifest(out_dir: Path, season: str) -> None:
    files: dict[str, dict[str, object]] = {}
    for path in sorted(out_dir.glob("*.json")):
        if path.name == "manifest.json":
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        files[path.name] = {
            "path": f"/data/{path.name}",
            "size_bytes": path.stat().st_size,
            "sha256": digest,
        }

    manifest = {
        "season": season,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": hashlib.sha256(
            json.dumps(files, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16],
        "files": files,
    }

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def _write_seasons_file(out_dir: Path, season: str) -> None:
    seasons_path = out_dir / "seasons.json"
    seasons_path.write_text(json.dumps([season], indent=2), encoding="utf-8")


def _remove_heavy_artifacts(out_dir: Path) -> None:
    for pattern in HEAVY_FILE_PATTERNS:
        for path in out_dir.glob(pattern):
            path.unlink(missing_ok=True)

    pbp_dir = out_dir / "play_by_play"
    if pbp_dir.exists():
        shutil.rmtree(pbp_dir)


def _write_slim_summary(out_dir: Path) -> None:
    summary_path = out_dir / "dataset_summary.json"
    if not summary_path.exists():
        return

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    slim_summary = {key: summary.get(key) for key in SLIM_SUMMARY_KEYS if key in summary}
    slim_summary["files_status"] = [
        file_status for file_status in summary.get("files_status", [])
        if file_status.get("name") in SLIM_SUMMARY_FILES
    ]
    summary_path.write_text(json.dumps(slim_summary, indent=2), encoding="utf-8")


def _has_source_season_data(season: str) -> bool:
    season_root = REPO_ROOT / f"data/season={season}"
    return (
        (season_root / "processed" / "schedule_combined.csv").exists()
        and (season_root / "raw" / "player_games.csv").exists()
    )


def _copy_committed_public_data(out_dir: Path) -> bool:
    source_dir = REPO_ROOT / "frontend" / "public" / "data"
    if not source_dir.exists() or source_dir.resolve() == out_dir.resolve():
        return False

    out_dir.mkdir(parents=True, exist_ok=True)
    for path in source_dir.glob("*.json"):
        shutil.copy2(path, out_dir / path.name)

    player_games_src = source_dir / "player_games"
    if player_games_src.exists():
        player_games_dst = out_dir / "player_games"
        if player_games_dst.exists():
            shutil.rmtree(player_games_dst)
        shutil.copytree(player_games_src, player_games_dst)

    return True


def _split_player_game_history(out_dir: Path) -> None:
    games_path = out_dir / "player_season_games.json"
    if not games_path.exists():
        return

    player_games = json.loads(games_path.read_text(encoding="utf-8"))
    player_games_dir = out_dir / "player_games"
    if player_games_dir.exists():
        shutil.rmtree(player_games_dir)
    player_games_dir.mkdir(parents=True, exist_ok=True)

    for player_id, seasons in player_games.items():
        safe_id = "".join(ch for ch in str(player_id) if ch.isdigit())
        if not safe_id:
            continue
        (player_games_dir / f"{safe_id}.json").write_text(
            json.dumps(seasons, separators=(",", ":")),
            encoding="utf-8",
        )


def build_public_bundle(out_dir: Path, season: str | None = None) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    active_season = season or "2025-26"
    if not _has_source_season_data(active_season) and _copy_committed_public_data(out_dir):
        _write_manifest(out_dir, active_season)
        print(f"Copied committed frontend data bundle to {out_dir}")
        return

    os.environ["FRONTEND_DATA_DIR"] = str(out_dir)
    export_public_data(season)
    export_player_profiles(season=season, out_dir=str(out_dir))
    _split_player_game_history(out_dir)
    _remove_heavy_artifacts(out_dir)
    _write_seasons_file(out_dir, active_season)
    _write_slim_summary(out_dir)
    _write_manifest(out_dir, active_season)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a lean frontend/public/data bundle.")
    parser.add_argument(
        "--out-dir",
        default=str(Path("frontend") / "public" / "data"),
        help="Target directory for the browser-visible data bundle.",
    )
    parser.add_argument(
        "--season",
        default=None,
        help="Season to export for the lightweight public bundle. Defaults to the active season.",
    )
    args = parser.parse_args()

    out_dir = Path(args.out_dir).resolve()
    build_public_bundle(out_dir, args.season)

    print(f"Lean frontend bundle written to {out_dir}")


if __name__ == "__main__":
    main()
