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

import pandas as pd

SEASONS = {
    "2022-23": "data/season=2022-23",
    "2023-24": "data/season=2023-24",
    "2024-25": "data/season=2024-25",
    "2025-26": "data/season=2025-26",
}
OUT_DIR = "frontend/public/data"


def nan_safe(val):
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, (int, float)) and not math.isfinite(val):
        return None
    return val


def load_game_results(season_key: str, season_path: str) -> list[dict]:
    path = os.path.join(season_path, "processed", "game_results.csv")
    if not os.path.exists(path):
        print(f"  [WARN] missing: {path}")
        return []
    df = pd.read_csv(path)
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "GAME_ID": str(row["GAME_ID"]).strip(),
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

    all_games = []
    for season_key, season_path in SEASONS.items():
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


if __name__ == "__main__":
    main()
