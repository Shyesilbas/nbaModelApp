import os
import yaml
from pathlib import Path
from dataclasses import dataclass
from scripts.season_utils import normalize_season, season_to_file_token

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class DataPaths:
    team_games_raw: str
    player_games_raw: str
    raw_schedule: str
    raw_finals_schedule: str
    raw_team_boxscores: str
    raw_player_boxscores: str
    game_results: str
    schedule_combined: str
    upcoming_context: str
    team_features: str
    player_features: str
    win_model_dataset: str
    score_model_dataset: str
    team_model_ready_v2: str

def get_data_paths(season: str = None) -> DataPaths:
    # 1. Load config
    config_path = ROOT / "config" / "data_sources.yaml"
    config = {}
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
        except Exception:
            pass

    # 2. Extract current season
    default_season = config.get("current_season", "2025-26")
    if not season:
        season = default_season
    
    season = normalize_season(season)
    token = season_to_file_token(season)

    # Roots
    raw_root = config.get("raw_data_root", "data/raw")
    processed_root = config.get("processed_data_root", "data/processed")
    features_root = config.get("features_data_root", "data/features")

    # Resolve win/score model dataset paths with fallback/legacy support for 2025_26
    win_dataset_name = "team_win_model_ready_v2_player_features.csv" if token == "2025_26" else f"team_win_model_ready_v2_player_features_{token}.csv"
    score_dataset_name = "team_score_model_ready_v2_player_features.csv" if token == "2025_26" else f"team_score_model_ready_v2_player_features_{token}.csv"

    return DataPaths(
        team_games_raw=str(ROOT / raw_root / "team_games" / f"nba_team_games_{token}_regular_and_playoffs.csv"),
        player_games_raw=str(ROOT / raw_root / "player_games" / f"nba_player_games_{token}_regular_and_playoffs.csv"),
        raw_schedule=str(ROOT / raw_root / "schedule" / f"nba_schedule_{token}.csv"),
        raw_finals_schedule=str(ROOT / raw_root / "schedule" / f"nba_finals_upcoming_{token}.csv"),
        raw_team_boxscores=str(ROOT / raw_root / "boxscores" / "team" / f"nba_team_boxscores_{token}.csv"),
        raw_player_boxscores=str(ROOT / raw_root / "boxscores" / "player" / f"nba_player_boxscores_{token}.csv"),
        game_results=str(ROOT / processed_root / f"game_results_{token}.csv"),
        schedule_combined=str(ROOT / processed_root / f"schedule_combined_{token}.csv"),
        upcoming_context=str(ROOT / processed_root / f"upcoming_games_context_{token}.csv"),
        team_features=str(ROOT / features_root / f"team_games_features_{token}.csv"),
        player_features=str(ROOT / features_root / f"player_games_features_{token}.csv"),
        win_model_dataset=str(ROOT / processed_root / win_dataset_name),
        score_model_dataset=str(ROOT / processed_root / score_dataset_name),
        team_model_ready_v2=str(ROOT / processed_root / f"team_model_ready_v2_{token}.csv"),
    )
