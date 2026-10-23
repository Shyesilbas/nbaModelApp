import sys
import argparse
from src.orchestration import PipelineOrchestrator


def main():
    scripts_epilog = """standalone scripts (run with PYTHONPATH=. python3 <script> --help for details):
  scripts/update_all_game_data.py [--season YYYY-YY] [--pbp-limit N]
      One-shot daily refresh: --update-data, box scores, play-by-play, then rebuild the
      PBP situational table (data/training/) and the frontend store.
  scripts/build_play_by_play.py --season YYYY-YY [--limit N] [--dry-run]
      Fetch and cache play-by-play JSON per game (NBA API calls; resumes where it stopped).
  scripts/build_pbp_lineups.py --season YYYY-YY [--limit N] [--dry-run]
      Rebuild lineup stints and on-court player games from the cached play-by-play and
      check them against box scores (same as main.py --season YYYY-YY --build-pbp-lineups).
  scripts/refresh_current_season_views.py --season YYYY-YY
      Refresh the live roster (team_rosters_live.csv) and the season's frontend store
      with current regular-season games. Also runs automatically in --update-data (Step 9b).
  scripts/build_frontend_store.py [--season YYYY-YY] [--force]
      Build the SQLite store the API serves frontend data from. Closed seasons are built once.
  scripts/predict_daily_schedule.py --date YYYY-MM-DD --season YYYY-YY
      Predict all matchups for a given date with the production models.
  scripts/retrain_pipeline.py [--dry-run | --promote] [--models {win,score,player} ...]
      Retrain, compare against the production champion, and promote if eligible (asks
      first unless --promote). Seasons come from config/training_manifest.yaml.
  scripts/generate_report.py --season YYYY-YY --evaluate [--model-dir DIR]
      Evaluate the production models (or DIR) on a season; --compare-models DIR1 DIR2.
  scripts/detect_drift_and_leakage.py --reference-season YYYY-YY --target-season YYYY-YY
      Data drift and feature leakage detector.
"""
    parser = argparse.ArgumentParser(
        description=(
            "NBA ML project CLI: data updates, feature pipeline, model training and the\n"
            "frontend store. Pass one command flag; with none, it runs the feature\n"
            "pipeline for --season (default: current season)."
        ),
        epilog=scripts_epilog,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--season", 
        type=str, 
        default=None,
        help="Season string (e.g., 2024-25)"
    )
    parser.add_argument(
        "--output-scope", 
        type=str, 
        choices=["production", "experimental"],
        default="production",
        help="Output scope (production or experimental)"
    )
    parser.add_argument(
        "--mock", 
        action="store_true", 
        help="Run the feature pipeline on synthetic data; outputs go to data/experimental/mock/"
    )
    parser.add_argument(
        "--build-model-dataset",
        action="store_true",
        help="Filter and save a model-ready team dataset with pre-game features only"
    )
    parser.add_argument(
        "--build-v3-dataset",
        action="store_true",
        help="Build the V3 team model-ready dataset with core player availability features"
    )
    parser.add_argument(
        "--run-roster-analysis",
        action="store_true",
        help="Run roster discovery and player importance score analysis"
    )
    parser.add_argument(
        "--build-player-dataset-v4",
        action="store_true",
        help="Build V4 player prediction dataset with usage rate features"
    )
    parser.add_argument(
        "--train-player-models",
        action="store_true",
        help="Train LightGBM player statistic prediction models"
    )
    parser.add_argument(
        "--train-score-models",
        action="store_true",
        help="Train XGBoost game score component prediction models"
    )
    parser.add_argument(
        "--train-win-model",
        action="store_true",
        help="Train calibrated Logistic Regression win probability model"
    )
    parser.add_argument(
        "--build-schedule-context",
        action="store_true",
        help="Combine raw schedule files, build upcoming games context, export frontend JSONs, and generate report"
    )
    parser.add_argument(
        "--fetch-boxscores",
        action="store_true",
        help="Build team/player box score tables and game results summary from existing raw game logs"
    )
    parser.add_argument(
        "--check-data-freshness",
        action="store_true",
        help="Check local NBA datasets freshness and sync issues"
    )
    parser.add_argument(
        "--sync-pipeline",
        action="store_true",
        help="Sync feature engineering pipeline with raw data"
    )
    parser.add_argument(
        "--pre-model-readiness",
        action="store_true",
        help="Run full pre-model readiness pipeline"
    )
    parser.add_argument(
        "--bootstrap-season",
        action="store_true",
        help="Run the full season bootstrap workflow: sync, rebuild, build the frontend store, and write a manifest"
    )
    parser.add_argument(
        "--build-frontend-store",
        "--export-frontend-data",
        dest="export_frontend_data",
        action="store_true",
        help="Rebuild the season's frontend store (data/frontend_store/) and the global store"
    )
    parser.add_argument(
        "--build-pbp-lineups",
        action="store_true",
        help="Rebuild lineup stints and on-court player games from cached play-by-play (no API calls) and check them against the box scores"
    )
    parser.add_argument(
        "--update-data",
        action="store_true",
        help="Update NBA schedule and fetch/append missing completed game logs locally"
    )
    parser.add_argument(
        "--skip-post-update-rebuilds",
        action="store_true",
        help="Skip heavy feature/game-results/schedule-context/frontend rebuilds after fetching missing games"
    )
    parser.add_argument(
        "--fetch-workers",
        type=int,
        default=4,
        help="Number of parallel workers to use when fetching missing games"
    )
    parser.add_argument(
        "--startup-check",
        action="store_true",
        help="Perform diagnostic data freshness check on startup without modifying data"
    )
    args = parser.parse_args()

    # Each run does one command; dispatch would otherwise run the first and
    # silently drop the rest.
    command_flags = {
        "update_data": "--update-data",
        "build_player_dataset_v4": "--build-player-dataset-v4",
        "train_player_models": "--train-player-models",
        "train_score_models": "--train-score-models",
        "train_win_model": "--train-win-model",
        "startup_check": "--startup-check",
        "sync_pipeline": "--sync-pipeline",
        "pre_model_readiness": "--pre-model-readiness",
        "bootstrap_season": "--bootstrap-season",
        "export_frontend_data": "--build-frontend-store",
        "build_schedule_context": "--build-schedule-context",
        "fetch_boxscores": "--fetch-boxscores",
        "check_data_freshness": "--check-data-freshness",
        "run_roster_analysis": "--run-roster-analysis",
        "build_pbp_lineups": "--build-pbp-lineups",
    }
    pipeline_flags = {
        "mock": "--mock",
        "build_model_dataset": "--build-model-dataset",
        "build_v3_dataset": "--build-v3-dataset",
    }
    chosen = [flag for dest, flag in command_flags.items() if getattr(args, dest)]
    if len(chosen) > 1:
        parser.error(f"run one command at a time, got: {' '.join(chosen)}")
    pipeline_chosen = [flag for dest, flag in pipeline_flags.items() if getattr(args, dest)]
    if chosen and pipeline_chosen:
        parser.error(f"{' '.join(pipeline_chosen)} cannot be combined with {chosen[0]} (default feature pipeline only)")
    if args.skip_post_update_rebuilds and not args.update_data:
        parser.error("--skip-post-update-rebuilds only applies to --update-data")

    from src.core.data_paths import get_data_paths
    from src.core.season_utils import season_to_file_token, normalize_season
    
    paths = get_data_paths(args.season)
    from src.core.season_utils import get_default_season
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)

    # An explicit season always writes the production season files.
    if args.season:
        args.output_scope = "production"

    if args.build_pbp_lineups:
        from src.processing.pbp_lineups import build_and_write
        sys.exit(build_and_write(season))

    if PipelineOrchestrator(args).dispatch():
        return

    if args.run_roster_analysis:
        from src.orchestration.roster_report import run_roster_analysis_report
        run_roster_analysis_report(season, paths)
        return

    from src.orchestration.feature_pipeline import run_feature_pipeline
    run_feature_pipeline(args, season, token, paths)


if __name__ == "__main__":
    main()
