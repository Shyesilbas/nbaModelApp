from __future__ import annotations

import os
from datetime import date
from typing import Any

import pandas as pd

from src.analysis.roster_analysis import get_core_players, run_roster_analysis
from src.features import build_opponent_features, build_team_features, validate_opponent_join
from src.features.core_player_availability_features import build_core_player_availability_features
from src.ingestion.boxscore_loader import run_boxscore_pipeline
from src.ingestion.data_loader import load_player_games, load_team_games
from src.ingestion.update_data_service import UpdateDataService
from src.orchestration.pipeline_reports import generate_sync_report, generate_update_reports
from src.orchestration.pipeline_runner import PipelineRunner
from src.processing.cleaning import clean_dates, sort_player_games, sort_team_games
from src.processing.model_dataset_builder import (
    build_team_model_dataset,
    build_team_model_dataset_v2,
    build_team_model_dataset_v3,
)
from src.validation.data_freshness_service import DataFreshnessService
from scripts.data_paths import get_data_paths
from scripts.export_frontend_data import export_data
from scripts.season_manifest import write_season_manifest
from scripts.season_utils import get_default_season, normalize_season, season_to_file_token
from src.processing.player_dataset_builder import build_player_dataset_v4
from src.training.player_trainer import PlayerModelTrainer
from src.training.score_trainer import ScoreModelTrainer
from src.training.win_trainer import WinModelTrainer


def run_schedule_context_pipeline(args: Any = None) -> None:
    season = getattr(args, "season", None) if args else None
    PipelineRunner(season=season).build_schedule_context(save=True)


def run_boxscore_pipeline_cli(args: Any) -> None:
    from src.ingestion.boxscore_service import BoxscoreService

    svc = BoxscoreService(save=True, season=args.season, output_scope=args.output_scope)
    svc.run_and_export()


def run_data_freshness_pipeline(args: Any) -> None:
    dfs = DataFreshnessService(raw_team_dir=args.raw_team_dir, raw_player_dir=args.raw_player_dir)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    results = dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    print("DATA FRESHNESS CHECK")
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")
    print(f"Latest player game date: {results['latest_player_game_date'] or 'N/A'}")
    print(f"Latest schedule date: {results['latest_schedule_date'] or 'N/A'}")


def run_sync_pipeline(args: Any) -> bool:
    runner = PipelineRunner(
        season=args.season,
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir,
        output_scope=args.output_scope,
        output_dir=args.output_dir,
    )
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
    runner = PipelineRunner(
        season=args.season,
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir,
        output_scope=args.output_scope,
        output_dir=args.output_dir,
    )
    df_team_model_v2, _ = runner.build_model_ready_v2()
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)
    out_root = "data/experimental" if args.output_scope == "experimental" else "data/processed"
    os.makedirs(out_root, exist_ok=True)
    v2_csv = os.path.join(out_root, f"team_model_ready_v2_{token}.csv")
    df_team_model_v2.to_csv(v2_csv, index=False)
    df_team_model_v2.to_parquet(v2_csv.replace(".csv", ".parquet"), index=False, engine="pyarrow")


def run_pre_model_readiness_pipeline(args: Any) -> None:
    run_sync_pipeline(args)
    run_game_results_regeneration()
    run_build_enhanced_v2(args)
    dfs = DataFreshnessService(raw_team_dir=args.raw_team_dir, raw_player_dir=args.raw_player_dir)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    export_data(season=args.season or get_default_season())


def run_bootstrap_season_pipeline(args: Any) -> None:
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)

    print(f"Bootstrapping season {season} ({token})")
    sync_result = run_sync_pipeline(args)
    run_game_results_regeneration()
    run_build_enhanced_v2(args)
    dfs = DataFreshnessService(raw_team_dir=args.raw_team_dir, raw_player_dir=args.raw_player_dir)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    export_data(season=season)

    artifacts = {
        "team_features": get_data_paths(season).team_features,
        "player_features": get_data_paths(season).player_features,
        "game_results": get_data_paths(season).game_results,
        "schedule_combined": get_data_paths(season).schedule_combined,
        "upcoming_games_context": get_data_paths(season).upcoming_context,
        "team_model_ready_v2": get_data_paths(season).team_model_ready_v2,
        "frontend_export_dir": "frontend/public/data",
        "sync_passed": sync_result,
    }
    manifest_path = write_season_manifest(
        season=season,
        command=f"python3 main.py --season {season} --bootstrap-season",
        artifacts=artifacts,
    )
    print(f"Season manifest written: {manifest_path}")


def run_startup_check(args: Any) -> None:
    dfs = DataFreshnessService(raw_team_dir=args.raw_team_dir, raw_player_dir=args.raw_player_dir)
    df_team, df_player, df_schedule = dfs.load_local_datasets()
    results = dfs.generate_data_freshness_report(df_team, df_player, df_schedule, today=date.today())
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")


def run_update_data(args: Any) -> None:
    svc = UpdateDataService(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir,
        fetch_workers=args.fetch_workers,
        skip_post_update_rebuilds=args.skip_post_update_rebuilds,
        season=args.season,
    )
    svc.run(args)


def run_build_player_dataset_pipeline(args: Any) -> None:
    if args.season:
        seasons = [args.season]
    else:
        from scripts.season_utils import discover_seasons
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
