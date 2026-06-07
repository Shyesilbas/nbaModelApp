import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.data_paths import get_data_paths
from scripts.artifact_paths import load_production_manifest, resolve_artifact_path

def test_get_data_paths_values():
    print("Testing get_data_paths resolving expected values...")
    paths_explicit = get_data_paths("2025-26")
    paths_default = get_data_paths()
    
    # Assert defaults and normalization
    assert paths_explicit.team_games_raw == paths_default.team_games_raw
    assert "2025_26" in paths_default.team_games_raw
    
    # Check that paths point to correct file names
    assert paths_default.team_games_raw.endswith("nba_team_games_2025_26_regular_and_playoffs.csv")
    assert paths_default.player_games_raw.endswith("nba_player_games_2025_26_regular_and_playoffs.csv")
    assert paths_default.raw_schedule.endswith("nba_schedule_2025_26.csv")
    assert paths_default.raw_finals_schedule.endswith("nba_finals_upcoming_2025_26.csv")
    assert paths_default.raw_team_boxscores.endswith("nba_team_boxscores_2025_26.csv")
    assert paths_default.raw_player_boxscores.endswith("nba_player_boxscores_2025_26.csv")
    assert paths_default.game_results.endswith("game_results_2025_26.csv")
    assert paths_default.schedule_combined.endswith("schedule_combined_2025_26.csv")
    assert paths_default.upcoming_context.endswith("upcoming_games_context_2025_26.csv")
    assert paths_default.team_features.endswith("team_games_features_2025_26.csv")
    assert paths_default.player_features.endswith("player_games_features_2025_26.csv")
    
    # Assert legacy fallback paths for 2025_26 model datasets (without season suffix)
    assert paths_default.win_model_dataset.endswith("team_win_model_ready_v2_player_features.csv")
    assert paths_default.score_model_dataset.endswith("team_score_model_ready_v2_player_features.csv")
    
    # Test a different season resolves correctly
    paths_prev = get_data_paths("2024-25")
    assert "2024_25" in paths_prev.team_games_raw
    assert paths_prev.win_model_dataset.endswith("team_win_model_ready_v2_player_features_2024_25.csv")
    
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
