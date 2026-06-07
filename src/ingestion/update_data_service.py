from typing import List
from datetime import date
import os

from src.ingestion.schedule_fetcher import update_schedule_files
from src.validation.data_freshness_service import DataFreshnessService
from src.ingestion.team_games_fetcher import fetch_missing_team_games_by_game_ids, append_team_games_to_raw_dataset
from src.ingestion.player_games_fetcher import fetch_missing_player_games_by_game_ids, append_player_games_to_raw_dataset
from scripts.export_frontend_data import export_data


class UpdateDataService:
    """Service to perform the full update-data pipeline (refresh schedule, fetch missing games, append, and optionally rebuilds)."""

    def __init__(self, raw_team_dir: str = "data/raw/team_games", raw_player_dir: str = "data/raw/player_games", fetch_workers: int = 4, skip_post_update_rebuilds: bool = False, season: str = None):
        self.raw_team_dir = raw_team_dir
        self.raw_player_dir = raw_player_dir
        self.fetch_workers = fetch_workers
        self.skip_post_update_rebuilds = skip_post_update_rebuilds
        self.season = season

    def run(self, args) -> None:
        print("============================================================")
        print("🔄 STARTING LOCAL DATA UPDATE PIPELINE 🔄")
        print("============================================================\n")

        # Step 1: Refresh schedule
        print("Step 1: Refreshing league schedule from NBA API...")
        s_count, f_count = update_schedule_files(season=self.season or "2025-26")
        print(f"Schedule refreshed: {s_count} games, {f_count} Finals games.\n")

        # Step 2: Load local datasets and detect missing completed games
        print("Step 2: Performing data freshness validation...")
        dfs = DataFreshnessService(raw_team_dir=self.raw_team_dir, raw_player_dir=self.raw_player_dir, season=self.season)
        df_team_pre, df_player_pre, df_schedule = dfs.load_local_datasets(refresh_schedule=True)

        # Bulk fetch season if datasets are missing or empty
        from src.ingestion.team_games_fetcher import fetch_team_games_for_season
        from src.ingestion.player_games_fetcher import fetch_player_games_for_season

        season_str = self.season or "2025-26"
        if df_team_pre is None or df_team_pre.empty:
            print(f"Team raw games empty/missing. Performing bulk fetch for season {season_str}...")
            bulk_team_df = fetch_team_games_for_season(season=season_str)
            if not bulk_team_df.empty:
                append_team_games_to_raw_dataset(bulk_team_df, season=self.season)
                df_team_pre, _, _ = dfs.load_local_datasets(refresh_schedule=False)
            else:
                print("Bulk team fetch returned empty.")

        if df_player_pre is None or df_player_pre.empty:
            print(f"Player raw games empty/missing. Performing bulk fetch for season {season_str}...")
            bulk_player_df = fetch_player_games_for_season(season=season_str)
            if not bulk_player_df.empty:
                append_player_games_to_raw_dataset(bulk_player_df, season=self.season)
                _, df_player_pre, _ = dfs.load_local_datasets(refresh_schedule=False)
            else:
                print("Bulk player fetch returned empty.")

        pre_team_count = len(df_team_pre) if df_team_pre is not None else 0
        pre_player_count = len(df_player_pre) if df_player_pre is not None else 0

        today = date.today()
        freshness_results_pre = dfs.generate_data_freshness_report(df_team_pre, df_player_pre, df_schedule, today=today)

        missing_game_ids = list(freshness_results_pre["missing_completed_game_ids"])
        all_missing_info = list(freshness_results_pre["all_missing_completed_info"])

        # Also include finals warnings if they mention missing
        for fw in freshness_results_pre.get("finals_warnings", []):
            if "missing" in fw.lower():
                parts = fw.split(":")
                if len(parts) > 1:
                    gid_part = parts[1].split("|")[0].strip()
                    if gid_part not in missing_game_ids:
                        missing_game_ids.append(gid_part)
                        all_missing_info.append({
                            "game_id": gid_part,
                            "game_date": parts[1].split("|")[1].strip() if len(parts[1].split("|")) > 1 else "",
                            "matchup": parts[1].split("|")[2].strip() if len(parts[1].split("|")) > 2 else "",
                            "row_count": 0
                        })

        failed_api_calls: List[str] = []
        fetched_game_ids: List[str] = []

        if missing_game_ids:
            print(f"\nStep 3: Found {len(missing_game_ids)} missing completed games: {missing_game_ids}")

            # Fetch missing team games
            print("Fetching missing team game logs...")
            try:
                df_new_team = fetch_missing_team_games_by_game_ids(
                    missing_game_ids,
                    season=self.season or "2025-26",
                    schedule_df=df_schedule,
                    max_workers=self.fetch_workers
                )
                if not df_new_team.empty:
                    print(f"Fetched {len(df_new_team)} new team game rows.")
                    post_team_count = append_team_games_to_raw_dataset(df_new_team, season=self.season)
                    fetched_game_ids.extend(df_new_team["GAME_ID"].unique().tolist())
                else:
                    print("No team logs retrieved from API.")
                    failed_api_calls.append("team_games_fetcher: empty data")
                    post_team_count = pre_team_count
            except Exception as e:
                print(f"Error fetching/appending team game logs: {e}")
                failed_api_calls.append(f"team_games_fetcher error: {e}")
                post_team_count = pre_team_count

            # Fetch missing player games
            print("Fetching missing player game logs...")
            try:
                df_new_player = fetch_missing_player_games_by_game_ids(
                    missing_game_ids,
                    season=self.season or "2025-26",
                    schedule_df=df_schedule
                )
                if not df_new_player.empty:
                    print(f"Fetched {len(df_new_player)} new player game rows.")
                    post_player_count = append_player_games_to_raw_dataset(df_new_player, season=self.season)
                else:
                    print("No player logs retrieved from API.")
                    failed_api_calls.append("player_games_fetcher: empty data")
                    post_player_count = pre_player_count
            except Exception as e:
                print(f"Error fetching/appending player game logs: {e}")
                failed_api_calls.append(f"player_games_fetcher error: {e}")
                post_player_count = pre_player_count

        else:
            print("\nStep 3: No missing completed games detected. Local raw datasets are up to date.")
            post_team_count = pre_team_count
            post_player_count = pre_player_count

        rebuilds_ran = not self.skip_post_update_rebuilds
        if rebuilds_ran:
            # Step 6: Re-run feature pipeline sync and other rebuilds by invoking main's functions
            print("\nStep 6: Re-running feature pipeline sync...")
            from main import _run_sync_pipeline, _run_game_results_regeneration, _run_build_enhanced_v2, _run_schedule_context_pipeline

            _run_sync_pipeline(args)

            # Step 7: Regenerate game results
            print("\nStep 7: Normalizing matchups and regenerating game results summary...")
            _run_game_results_regeneration()

            # Step 8: Rebuild enhanced V2 dataset
            print("\nStep 8: Rebuilding enhanced V2 dataset...")
            _run_build_enhanced_v2(args)

            # Step 9: Export schedule/context and frontend data
            print("\nStep 9: Exporting schedule context and frontend datasets...")
            _run_schedule_context_pipeline()
            export_data()
        else:
            print("\nSteps 6-9: Skipped heavy rebuilds (--skip-post-update-rebuilds enabled).")

        # Step 10: Re-run data freshness validation to get post-update status
        print("\nStep 10: Re-running data freshness validation...")
        df_team_post, df_player_post, df_schedule_post = dfs.load_local_datasets(refresh_schedule=False)
        freshness_results_post = dfs.generate_data_freshness_report(df_team_post, df_player_post, df_schedule_post, today=today)

        print(f"\nFinal Freshness Status: {freshness_results_post['status']}")

        # Load V2 dataset stats and features counts
        post_v2_count = 0
        try:
            if os.path.exists("data/processed/team_model_ready_v2_2025_26.csv"):
                df_v2 = pd.read_csv("data/processed/team_model_ready_v2_2025_26.csv")
                post_v2_count = len(df_v2)
        except:
            pass

        post_feat_team = 0
        try:
            if os.path.exists("data/features/team_games_features_2025_26.csv"):
                df_feat = pd.read_csv("data/features/team_games_features_2025_26.csv")
                post_feat_team = len(df_feat)
        except:
            pass

        # Step 11: Report summary (freshness report already written in Step 10)
        post_status = freshness_results_post.get("status", "UNKNOWN")
        print(f"\nUpdate Summary:")
        print(f"  Team rows:   {pre_team_count} -> {post_team_count}")
        print(f"  Player rows: {pre_player_count} -> {post_player_count}")
        print(f"  V2 rows:     {post_v2_count}")
        print(f"  Freshness:   {freshness_results_pre.get('status', 'UNKNOWN')} -> {post_status}")

        print("\n" + "="*60)
        print("🎉 LOCAL DATA UPDATE PIPELINE COMPLETE! 🎉")
        print("="*60 + "\n")
