import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.season_utils import get_default_season, season_to_file_token
from scripts.data_paths import get_data_paths
from scripts.artifact_paths import load_production_manifest, resolve_artifact_path

def test_get_data_paths_values():
    print("Testing get_data_paths resolving expected values...")
    season = get_default_season()
    token = season_to_file_token(season)
    paths_explicit = get_data_paths(season)
    paths_default = get_data_paths()
    
    # Assert defaults and normalization
    assert paths_explicit.team_games_raw == paths_default.team_games_raw
    assert token in paths_default.team_games_raw or f"season={season}" in paths_default.team_games_raw
    
    # Check that paths point to correct file names
    assert paths_default.team_games_raw.endswith(f"season={season}/raw/team_games.csv")
    assert paths_default.player_games_raw.endswith(f"season={season}/raw/player_games.csv")
    assert paths_default.raw_schedule.endswith(f"season={season}/raw/schedule.csv")
    assert paths_default.raw_finals_schedule.endswith(f"season={season}/raw/finals_schedule.csv")
    assert paths_default.raw_team_boxscores.endswith(f"season={season}/raw/boxscores/team_boxscores.csv")
    assert paths_default.raw_player_boxscores.endswith(f"season={season}/raw/boxscores/player_boxscores.csv")
    assert paths_default.game_results.endswith(f"season={season}/processed/game_results.csv")
    assert paths_default.schedule_combined.endswith(f"season={season}/processed/schedule_combined.csv")
    assert paths_default.upcoming_context.endswith(f"season={season}/processed/upcoming_games_context.csv")
    assert paths_default.team_features.endswith(f"season={season}/features/team_features.csv")
    assert paths_default.player_features.endswith(f"season={season}/features/player_features.csv")
    assert paths_default.win_model_dataset.endswith(f"season={season}/processed/team_win_model_ready_v2_player_features.csv")
    assert paths_default.score_model_dataset.endswith(f"season={season}/processed/team_score_model_ready_v2_player_features.csv")
    assert paths_default.team_model_ready_v2.endswith(f"season={season}/processed/team_model_ready_v2.csv")
    
    # Test a different season resolves correctly
    other_season = "2024-25" if season != "2024-25" else "2023-24"
    other_token = season_to_file_token(other_season)
    paths_prev = get_data_paths(other_season)
    assert other_token in paths_prev.team_games_raw or f"season={other_season}" in paths_prev.team_games_raw
    assert paths_prev.win_model_dataset.endswith(f"season={other_season}/processed/team_win_model_ready_v2_player_features.csv")
    
    print("✅ get_data_paths tests passed successfully.")

def test_production_manifest():
    print("Testing production model manifest resolution...")
    manifest = load_production_manifest()
    assert isinstance(manifest, dict)
    assert "win_model" in manifest
    assert "score_model" in manifest
    
    win_model_path = resolve_artifact_path("win_model", "model_path", "models/production/win_model.pkl")
    assert win_model_path.exists()
    
    score_model_path = resolve_artifact_path("score_model", "home_model_path", "models/home_score_model_v2.pkl")
    assert score_model_path.exists()
    
    print("✅ Production manifest verification passed successfully.")

def main():
    try:
        test_get_data_paths_values()
        test_production_manifest()
        print("\n🎉 ALL PATH REFACTOR VALIDATION CHECKS PASSED SUCCESSFULLY! 🎉\n")
    except AssertionError as e:
        print(f"\n❌ Validation assertion failed: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected validation error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
