from __future__ import annotations

import os
from datetime import date
from typing import Any


from src.ingestion.boxscore_loader import run_boxscore_pipeline
from src.orchestration.pipeline_reports import generate_sync_report
from src.orchestration.pipeline_runner import PipelineRunner
from src.validation.data_freshness_service import DataFreshnessService
from src.core.data_paths import get_data_paths
from src.frontend_store.builders import build_frontend_store
from src.frontend_store.store import season_db_path
from src.core.season_manifest import write_season_manifest
from src.core.season_utils import get_default_season, normalize_season, season_to_file_token
from src.processing.player_dataset_builder import build_player_dataset_v4
from src.training.player_trainer import PlayerModelTrainer
from src.training.score_trainer import ScoreModelTrainer
from src.training.win_trainer import WinModelTrainer


def run_schedule_context_pipeline(args: Any = None) -> None:
    season = getattr(args, "season", None) if args else None
    PipelineRunner(season=season).build_schedule_context(save=True)
    build_frontend_store([season or get_default_season()])


def run_boxscore_pipeline_cli(args: Any) -> None:
    from src.ingestion.boxscore_service import BoxscoreService

    svc = BoxscoreService(save=True, season=args.season, output_scope=args.output_scope)
    svc.run_and_export()


def run_data_freshness_pipeline(args: Any) -> None:
    dfs = DataFreshnessService(season=args.season)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    results = dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    print("DATA FRESHNESS CHECK")
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")
    print(f"Latest player game date: {results['latest_player_game_date'] or 'N/A'}")
    print(f"Latest schedule date: {results['latest_schedule_date'] or 'N/A'}")


def run_sync_pipeline(args: Any) -> bool:
    runner = PipelineRunner(season=args.season, output_scope=args.output_scope)
    result = runner.sync_features()
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)
    team_match = result.metadata["raw_team_rows"] == result.metadata["team_feature_rows"]
    player_match = result.metadata["raw_player_rows"] == result.metadata["player_feature_rows"]
    generate_sync_report(
        season=season,
        token=token,
        raw_team_rows=result.metadata["raw_team_rows"],
        raw_player_rows=result.metadata["raw_player_rows"],
        feat_team_rows=result.metadata["team_feature_rows"],
        feat_player_rows=result.metadata["player_feature_rows"],
        team_match=team_match,
        player_match=player_match,
        team_csv=result.metadata["team_features_path"],
        player_csv=result.metadata["player_features_path"],
    )
    return team_match and player_match


def run_game_results_regeneration() -> None:
    run_boxscore_pipeline()


def run_build_enhanced_v2(args: Any) -> None:
    runner = PipelineRunner(season=args.season, output_scope=args.output_scope)
    df_team_model_v2, _ = runner.build_model_ready_v2()
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)
    # Production writes the season file; experimental runs stay out of it.
    if args.output_scope == "experimental":
        v2_csv = os.path.join("data/experimental", f"team_model_ready_v2_{token}.csv")
    else:
        v2_csv = runner.paths.team_model_ready_v2
    os.makedirs(os.path.dirname(v2_csv), exist_ok=True)
    df_team_model_v2.to_csv(v2_csv, index=False)


def run_pre_model_readiness_pipeline(args: Any) -> None:
    run_sync_pipeline(args)
    run_game_results_regeneration()
    run_build_enhanced_v2(args)
    dfs = DataFreshnessService(season=args.season)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    build_frontend_store([args.season or get_default_season()])


def run_bootstrap_season_pipeline(args: Any) -> None:
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)

    print(f"Bootstrapping season {season} ({token})")
    sync_result = run_sync_pipeline(args)
    run_game_results_regeneration()
    run_build_enhanced_v2(args)
    # Training-ready team dataset for this season (v3 + boxscore enrichment), so a new
    # season can join the training manifest without a separate rebuild.
    from src.features.enrich_v3_boxscore_features import enrich_all_seasons
    from src.processing.rebuild_training_data import rebuild_season

    rebuild_season(season)
    enrich_all_seasons([season])
    dfs = DataFreshnessService(season=args.season)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    build_frontend_store([season or get_default_season()])

    artifacts = {
        "team_features": get_data_paths(season).team_features,
        "player_features": get_data_paths(season).player_features,
        "game_results": get_data_paths(season).game_results,
        "schedule_combined": get_data_paths(season).schedule_combined,
        "upcoming_games_context": get_data_paths(season).upcoming_context,
        "team_model_ready_v2": get_data_paths(season).team_model_ready_v2,
        "team_model_ready_v3": get_data_paths(season).team_model_ready,
        "frontend_store": str(season_db_path(season)),
        "sync_passed": sync_result,
    }
    manifest_path = write_season_manifest(
        season=season,
        command=f"python3 main.py --season {season} --bootstrap-season",
        artifacts=artifacts,
    )
    print(f"Season manifest written: {manifest_path}")


def run_startup_check(args: Any) -> None:
    dfs = DataFreshnessService(season=args.season)
    # Read-only diagnostic: keep the rebuilt schedule and the report in memory.
    df_team, df_player, df_schedule = dfs.load_local_datasets(save_schedule=False)
    results = dfs.generate_data_freshness_report(
        df_team, df_player, df_schedule, today=date.today(), write_files=False
    )
    print(f"Status: {results['status']}")
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")
    print(f"Latest player game date: {results['latest_player_game_date'] or 'N/A'}")
    print(f"Missing completed games: {len(results['missing_completed_game_ids'])}")
    print(f"Team/player game ID mismatches: {len(results['team_player_mismatch_game_ids'])}")
    for warning in results["warnings"]:
        print(f"  {warning}")


def run_update_data(args: Any) -> None:
    # Imported here: update_data_service imports src.orchestration, which imports this module.
    from src.ingestion.update_data_service import UpdateDataService

    svc =UpdateDataService(
        fetch_workers=args.fetch_workers,
        skip_post_update_rebuilds=args.skip_post_update_rebuilds,
        season=args.season,
    )
    svc.run(args)


def run_build_player_dataset_pipeline(args: Any) -> None:
    if args.season:
        seasons = [args.season]
    else:
        from src.core.season_utils import discover_seasons
        seasons = list(discover_seasons().keys())
    build_player_dataset_v4(seasons=seasons)


def run_train_player_models_pipeline(args: Any) -> None:
    trainer = PlayerModelTrainer()
    trainer.train_and_export()


def run_train_score_models_pipeline(args: Any) -> None:
    trainer = ScoreModelTrainer()
    trainer.train_and_export()


def run_train_win_model_pipeline(args: Any) -> None:
    trainer = WinModelTrainer()
    trainer.train_and_export()
