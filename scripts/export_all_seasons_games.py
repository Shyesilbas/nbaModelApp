"""
Builds all_seasons_games.json: merged game results from all 4 seasons.

Combines:
  - data/season=2022-23/processed/game_results.csv  (same schema)
  - data/season=2023-24/processed/game_results.csv
  - data/season=2024-25/processed/game_results.csv
  - data/season=2025-26/processed/game_results.csv  <- current (already in games.json)

Also enriches with team/player boxscores per season for boxscore lookup.

Output: frontend/public/data/all_seasons_games.json
"""

import json
import math
import os
import hashlib
from datetime import datetime, timezone

import pandas as pd
from scripts.season_utils import discover_seasons

OUT_DIR = os.environ.get("FRONTEND_DATA_DIR", "data/frontend")


def nan_safe(val):
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, (int, float)) and not math.isfinite(val):
        return None
    return val


def write_manifest(out_dir: str):
    files = {}
    for filename in sorted(os.listdir(out_dir)):
        if not filename.endswith(".json") or filename == "manifest.json":
            continue
        path = os.path.join(out_dir, filename)
        with open(path, "rb") as f:
            digest = hashlib.sha256(f.read()).hexdigest()
        files[filename] = {
            "path": f"/data/{filename}",
            "size_bytes": os.path.getsize(path),
            "sha256": digest,
        }

    manifest = {
        "season": "multi",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "version": hashlib.sha256(
            json.dumps(files, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16],
        "files": files,
    }
    out_path = os.path.join(out_dir, "manifest.json")
    with open(out_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Wrote manifest -> {out_path}")


def load_game_results(season_key: str, season_path: str) -> list[dict]:
    path = os.path.join(season_path, "processed", "game_results.csv")
    if not os.path.exists(path):
        print(f"  [WARN] missing: {path}")
        return []
    df = pd.read_csv(path)
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "GAME_ID": str(int(str(row["GAME_ID"]).strip())).zfill(10),
            "GAME_DATE": nan_safe(row.get("GAME_DATE")),
            "HOME_TEAM_ABBREVIATION": nan_safe(row.get("HOME_TEAM_ABBREVIATION")),
            "HOME_TEAM_NAME": nan_safe(row.get("HOME_TEAM_NAME")),
            "HOME_SCORE": nan_safe(row.get("HOME_SCORE")),
            "AWAY_TEAM_ABBREVIATION": nan_safe(row.get("AWAY_TEAM_ABBREVIATION")),
            "AWAY_TEAM_NAME": nan_safe(row.get("AWAY_TEAM_NAME")),
            "AWAY_SCORE": nan_safe(row.get("AWAY_SCORE")),
            "WINNER_TEAM_ABBREVIATION": nan_safe(row.get("WINNER_TEAM_ABBREVIATION")),
            "LOSER_TEAM_ABBREVIATION": nan_safe(row.get("LOSER_TEAM_ABBREVIATION")),
            "SEASON_TYPE": nan_safe(row.get("SEASON_TYPE")),
            "IS_PLAYOFF": bool(row.get("IS_PLAYOFF", False)),
            "GAME_STATUS": nan_safe(row.get("GAME_STATUS")),
            "WEEK": nan_safe(row.get("WEEK")),
            # Extra fields for compatibility with GameResults.tsx (gameFeed type)
            "PLAYOFF_ROUND": None,
            "SERIES_GAME_NUMBER": None,
            "IS_ELIMINATION_GAME": False,
            "SEASON": season_key,
        })
    return rows


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    seasons = discover_seasons()

    all_games = []
    for season_key, season_path in seasons.items():
        print(f"Loading {season_key}...")
        games = load_game_results(season_key, season_path)
        all_games.extend(games)
        print(f"  {len(games)} games")

    # Sort descending by date
    all_games.sort(key=lambda g: g["GAME_DATE"] or "", reverse=True)
    print(f"Total: {len(all_games)} games across all seasons")

    out_path = os.path.join(OUT_DIR, "all_seasons_games.json")
    with open(out_path, "w") as f:
        json.dump(all_games, f, separators=(",", ":"))
    print(f"Wrote -> {out_path}")

    # Write dynamically discovered seasons list
    seasons_list = sorted(list(seasons.keys()), reverse=True)
    seasons_path = os.path.join(OUT_DIR, "seasons.json")
    with open(seasons_path, "w") as f:
        json.dump(seasons_list, f, separators=(",", ":"))
    print(f"Wrote seasons list -> {seasons_path}")

    write_manifest(OUT_DIR)


if __name__ == "__main__":
    main()
