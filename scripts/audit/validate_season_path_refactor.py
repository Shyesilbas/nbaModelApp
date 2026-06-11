import os
import sys
from pathlib import Path
from scripts.season_utils import get_default_season, season_to_file_token

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

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
    assert token in paths_default.team_games_raw
    
    # Check that paths point to correct file names
    assert paths_default.team_games_raw.endswith(f"nba_team_games_{token}_regular_and_playoffs.csv")
    assert paths_default.player_games_raw.endswith(f"nba_player_games_{token}_regular_and_playoffs.csv")
    assert paths_default.raw_schedule.endswith(f"nba_schedule_{token}.csv")
    assert paths_default.raw_finals_schedule.endswith(f"nba_finals_upcoming_{token}.csv")
    assert paths_default.raw_team_boxscores.endswith(f"nba_team_boxscores_{token}.csv")
    assert paths_default.raw_player_boxscores.endswith(f"nba_player_boxscores_{token}.csv")
    assert paths_default.game_results.endswith(f"game_results_{token}.csv")
    assert paths_default.schedule_combined.endswith(f"schedule_combined_{token}.csv")
    assert paths_default.upcoming_context.endswith(f"upcoming_games_context_{token}.csv")
    assert paths_default.team_features.endswith(f"team_games_features_{token}.csv")
    assert paths_default.player_features.endswith(f"player_games_features_{token}.csv")
    assert paths_default.win_model_dataset.endswith(f"team_win_model_ready_v2_player_features_{token}.csv")
    assert paths_default.score_model_dataset.endswith(f"team_score_model_ready_v2_player_features_{token}.csv")
    
    # Test a different season resolves correctly
    other_season = "2024-25" if season != "2024-25" else "2023-24"
    other_token = season_to_file_token(other_season)
    paths_prev = get_data_paths(other_season)
    assert other_token in paths_prev.team_games_raw
    assert paths_prev.win_model_dataset.endswith(f"team_win_model_ready_v2_player_features_{other_token}.csv")
    
    print("✅ get_data_paths tests passed successfully.")

def test_production_manifest():
    print("Testing production model manifest resolution...")
    manifest = load_production_manifest()
    assert isinstance(manifest, dict)
    assert "win_model" in manifest
    assert "score_model" in manifest
    
    win_model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model.pkl")
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
