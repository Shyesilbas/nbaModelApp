from pathlib import Path
from dataclasses import dataclass
from src.core.season_utils import get_default_season, normalize_season, season_to_file_token

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"

# Cross-season inputs that are not rebuilt from the game logs.
REFERENCE_DIR = DATA_DIR / "reference"
PLAYER_METADATA_CSV = REFERENCE_DIR / "player_metadata.csv"
PLAYER_MOVEMENTS_CSV = REFERENCE_DIR / "player_movement.csv"
ESPN_TRANSACTIONS_CSV = REFERENCE_DIR / "espn_transactions.csv"

# Cross-season datasets the models are trained on, plus the PBP lookup the team features use.
TRAINING_DIR = DATA_DIR / "training"
PLAYER_TRAINING_CSV = TRAINING_DIR / "player_model_ready.csv"
PBP_SITUATIONAL_CSV = TRAINING_DIR / "pbp_situational_features.csv"
TEAM_TRAINING_GLOB = str(TRAINING_DIR / "team_model_ready_*.csv")

# Outputs of --output-scope experimental and --mock runs; never read by production code.
EXPERIMENTAL_DIR = DATA_DIR / "experimental"


def team_training_csv(season: str, root: Path = ROOT) -> Path:
    """The season's team model-ready dataset (WIN/SCORE training rows)."""
    token = season_to_file_token(normalize_season(season))
    return root / "data" / "training" / f"team_model_ready_{token}.csv"


@dataclass
class DataPaths:
    team_games_raw: str
    player_games_raw: str
    raw_schedule: str
    raw_finals_schedule: str
    raw_team_boxscores: str
    raw_player_boxscores: str
    raw_play_by_play_dir: str
    game_results: str
    schedule_combined: str
    upcoming_context: str
    team_features: str
    player_features: str
    win_model_dataset: str
    score_model_dataset: str
    team_model_ready_v2: str
    team_model_ready: str
    core_players: str
    team_rosters: str
    observed_affiliation_events: str
    season_dir: str


def get_data_paths(season: str = None) -> DataPaths:
    season = normalize_season(season or get_default_season())

    # Roots relative to the season partition folder
    season_dir = ROOT / "data" / f"season={season}"
    raw_root = season_dir / "raw"
    processed_root = season_dir / "processed"
    features_root = season_dir / "features"
    analysis_root = season_dir / "analysis"

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
        game_results=str(processed_root / "game_results.csv"),
        schedule_combined=str(processed_root / "schedule_combined.csv"),
        upcoming_context=str(processed_root / "upcoming_games_context.csv"),
        team_features=str(features_root / "team_features.csv"),
        player_features=str(features_root / "player_features.csv"),
        win_model_dataset=str(processed_root / win_dataset_name),
        score_model_dataset=str(processed_root / score_dataset_name),
        team_model_ready_v2=str(processed_root / "team_model_ready_v2.csv"),
        team_model_ready=str(team_training_csv(season)),
        core_players=str(analysis_root / "core_players.csv"),
        team_rosters=str(analysis_root / "team_rosters.csv"),
        observed_affiliation_events=str(analysis_root / "observed_affiliation_events.csv"),
        season_dir=str(season_dir),
    )
