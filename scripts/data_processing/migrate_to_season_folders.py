import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.season_utils import normalize_season, season_to_file_token, discover_seasons
from scripts.data_paths import get_data_paths

def migrate_file(source_rel: str, target_abs: str) -> None:
    source_abs = str(ROOT / source_rel)
    if not os.path.exists(source_abs):
        return

    # Create target directory
    os.makedirs(os.path.dirname(target_abs), exist_ok=True)

    # Copy the file
    shutil.copy2(source_abs, target_abs)
    print(f"Migrated: {source_rel} -> {Path(target_abs).relative_to(ROOT)}")

    # Check for companion parquet file
    if source_rel.endswith(".csv"):
        source_parq = source_abs[:-4] + ".parquet"
        target_parq = target_abs[:-4] + ".parquet"
        if os.path.exists(source_parq):
            shutil.copy2(source_parq, target_parq)
            print(f"Migrated Parquet: {source_rel[:-4]}.parquet -> {Path(target_parq).relative_to(ROOT)}")

def main() -> None:
    print("Starting NBA Data migration to season-partitioned folders...")
    seasons = discover_seasons()

    for season in seasons.keys():
        normalized = normalize_season(season)
        token = season_to_file_token(normalized)
        paths = get_data_paths(normalized)

        print(f"\n--- Migrating Season: {normalized} (Token: {token}) ---")

        # Map legacy paths (relative to ROOT) to new paths resolved by get_data_paths
        migration_map = {
            f"data/raw/team_games/nba_team_games_{token}_regular_and_playoffs.csv": paths.team_games_raw,
            f"data/raw/player_games/nba_player_games_{token}_regular_and_playoffs.csv": paths.player_games_raw,
            f"data/raw/schedule/nba_schedule_{token}.csv": paths.raw_schedule,
            f"data/raw/schedule/nba_finals_upcoming_{token}.csv": paths.raw_finals_schedule,
            f"data/raw/boxscores/team/nba_team_boxscores_{token}.csv": paths.raw_team_boxscores,
            f"data/raw/boxscores/player/nba_player_boxscores_{token}.csv": paths.raw_player_boxscores,
            f"data/processed/game_results_{token}.csv": paths.game_results,
            f"data/processed/schedule_combined_{token}.csv": paths.schedule_combined,
            f"data/processed/upcoming_games_context_{token}.csv": paths.upcoming_context,
            f"data/features/team_games_features_{token}.csv": paths.team_features,
            f"data/features/player_games_features_{token}.csv": paths.player_features,
            f"data/processed/team_win_model_ready_v2_player_features_{token}.csv": paths.win_model_dataset,
            f"data/processed/team_score_model_ready_v2_player_features_{token}.csv": paths.score_model_dataset,
            f"data/processed/team_model_ready_v2_{token}.csv": paths.team_model_ready_v2,
            f"data/experimental/observed_affiliation_events_{token}.csv": str(ROOT / "data" / f"season={normalized}" / "experimental" / "observed_affiliation_events.csv"),
            f"data/experimental/player_registry_{token}.csv": str(ROOT / "data" / f"season={normalized}" / "experimental" / "player_registry.csv"),
        }

        for legacy_rel, target_abs in migration_map.items():
            migrate_file(legacy_rel, target_abs)

    print("\nMigration process completed successfully.")

if __name__ == "__main__":
    main()
