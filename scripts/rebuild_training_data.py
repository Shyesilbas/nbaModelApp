"""Rebuild every training dataset from the raw game logs with the current feature code.

Run this after any change to feature engineering (it is what the 2026-10 model
fixes need), then retrain:

    python scripts/rebuild_training_data.py
    python scripts/retrain_pipeline.py

Per season it rebuilds team/player features and team_model_ready_v3, then
reapplies the v3 boxscore enrichment and rebuilds the v4 player dataset.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)

from scripts.data_paths import get_data_paths
from scripts.feature_engineering.enrich_v3_boxscore_features import enrich_all_seasons
from scripts.season_utils import season_to_file_token
from src.training.training_manifest import load_training_manifest
from src.analysis.roster_analysis import get_core_players
from src.features import build_opponent_features, build_player_features, build_team_features
from src.features.core_player_availability_features import build_core_player_availability_features
from src.features.roster_absence import add_absence_columns
from src.processing import build_team_model_dataset_v3
from src.processing.cleaning import clean_dates, sort_player_games, sort_team_games
from src.processing.player_dataset_builder import build_player_dataset_v4

TEAM_SEASONS = ["2018-19", "2019-20", "2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


def rebuild_season(season: str) -> None:
    dp = get_data_paths(season)
    team = sort_team_games(clean_dates(pd.read_csv(dp.team_games_raw, dtype={"GAME_ID": str}), "GAME_DATE"))
    player = sort_player_games(clean_dates(pd.read_csv(dp.player_games_raw, dtype={"Game_ID": str}), "GAME_DATE"))
    team_features = build_team_features(team, season_dir=dp.season_dir)
    player_features = build_player_features(player)
    os.makedirs(os.path.dirname(dp.team_features), exist_ok=True)
    team_features.to_csv(dp.team_features, index=False)
    player_features.to_csv(dp.player_features, index=False)

    with_core = build_core_player_availability_features(
        build_opponent_features(team_features), player_features, get_core_players(player_features)
    )
    v3, _ = build_team_model_dataset_v3(with_core)
    v3 = add_absence_columns(v3, player)
    os.makedirs("data/processed", exist_ok=True)
    v3.to_csv(f"data/processed/team_model_ready_v3_{season_to_file_token(season)}.csv", index=False)
    print(f"{season}: {len(team_features)} team rows, {len(player_features)} player rows, {len(v3)} model rows", flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--seasons", nargs="+", default=TEAM_SEASONS)
    args = parser.parse_args()

    for season in args.seasons:
        if Path(get_data_paths(season).team_games_raw).exists():
            rebuild_season(season)
        else:
            print(f"{season}: no raw team games, skipped")
    enrich_all_seasons()

    manifest = load_training_manifest(ROOT / "config/training_manifest.yaml")
    player_seasons = list(manifest.modeling_seasons)
    if manifest.validation_season not in player_seasons:
        player_seasons.append(manifest.validation_season)
    build_player_dataset_v4(seasons=player_seasons, output_path=ROOT / "data/experimental/player_model_ready_v4_usg.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
