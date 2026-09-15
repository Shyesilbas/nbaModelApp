import os
import yaml
from pathlib import Path
from dataclasses import dataclass
from scripts.season_utils import get_default_season, normalize_season, season_to_file_token

ROOT = Path(__file__).resolve().parents[1]

@dataclass
class DataPaths:
    team_games_raw: str
    player_games_raw: str
    raw_schedule: str
    raw_finals_schedule: str
    raw_team_boxscores: str
    raw_player_boxscores: str
    raw_play_by_play_dir: str
    processed_pbp_events: str
    processed_quarter_scores: str
    game_results: str
    schedule_combined: str
    upcoming_context: str
    team_features: str
    player_features: str
    win_model_dataset: str
    score_model_dataset: str
    team_model_ready_v2: str
    season_dir: str

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
    if not season:
        season = config.get("current_season") or get_default_season()
    
    season = normalize_season(season)
    token = season_to_file_token(season)

    # Roots relative to the season partition folder
    season_dir = ROOT / "data" / f"season={season}"
    raw_root = season_dir / "raw"
    processed_root = season_dir / "processed"
    features_root = season_dir / "features"

    win_dataset_name = "team_win_model_ready_v2_player_features.csv"
    score_dataset_name = "team_score_model_ready_v2_player_features.csv"

    return DataPaths(
        team_games_raw=str(raw_root / "team_games.csv"),
        player_games_raw=str(raw_root / "player_games.csv"),
        raw_schedule=str(raw_root / "schedule.csv"),
        raw_finals_schedule=str(raw_root / "finals_schedule.csv"),
        raw_team_boxscores=str(raw_root / "boxscores" / "team_boxscores.csv"),
        raw_player_boxscores=str(raw_root / "boxscores" / "player_boxscores.csv"),
        raw_play_by_play_dir=str(raw_root / "play_by_play"),
        processed_pbp_events=str(processed_root / "pbp_events.parquet"),
        processed_quarter_scores=str(processed_root / "quarter_scores.parquet"),
        game_results=str(processed_root / "game_results.csv"),
        schedule_combined=str(processed_root / "schedule_combined.csv"),
        upcoming_context=str(processed_root / "upcoming_games_context.csv"),
        team_features=str(features_root / "team_features.csv"),
        player_features=str(features_root / "player_features.csv"),
        win_model_dataset=str(processed_root / win_dataset_name),
        score_model_dataset=str(processed_root / score_dataset_name),
        team_model_ready_v2=str(processed_root / "team_model_ready_v2.csv"),
        season_dir=str(season_dir),
    )
