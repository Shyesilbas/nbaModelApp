import os
import argparse
import pandas as pd
from src.ingestion.data_loader import load_team_games, load_player_games
from src.processing.validation import validate_team_games, validate_player_games
from src.processing.cleaning import clean_dates, sort_team_games, sort_player_games
from src.features import build_team_features, build_player_features, build_opponent_features, validate_opponent_join
from src.processing.mock_generator import generate_mock_team_games, generate_mock_player_games
from src.orchestration import PipelineOrchestrator

def _df_to_markdown(df: pd.DataFrame) -> str:
    """Helper to convert a pandas DataFrame to a markdown table string without tabulate."""
    headers = list(df.columns)
    header_str = "| " + " | ".join(headers) + " |\n"
    sep_str = "| " + " | ".join(["---"] * len(headers)) + " |\n"
    row_strs = []
    for _, row in df.iterrows():
        row_strs.append("| " + " | ".join(str(val) for val in row) + " |\n")
    return header_str + sep_str + "".join(row_strs)


def _run_schedule_context_pipeline():
    from src.orchestration.pipeline_workflows import run_schedule_context_pipeline
    run_schedule_context_pipeline()


def _run_boxscore_pipeline_cli(args):
    from src.orchestration.pipeline_workflows import run_boxscore_pipeline_cli
    run_boxscore_pipeline_cli(args)


def _export_boxscore_json(team_bs_df, player_bs_df, results_df):
    """Export the three box score datasets as frontend-ready JSON files."""
    import json
    out_dir = "frontend/public/data"
    os.makedirs(out_dir, exist_ok=True)

    def _save_json(df: "pd.DataFrame", filename: str, label: str):
        # Normalise dates to strings
        for col in df.select_dtypes(include=["datetime64[ns]"]).columns:
            df[col] = df[col].dt.strftime("%Y-%m-%d")
        path = os.path.join(out_dir, filename)
        df.to_json(path, orient="records", indent=2, double_precision=4, date_format="iso")
        print(f"  ✅ Exported {label} → {path} ({len(df):,} rows)")

    _save_json(results_df.copy(), "game_results.json", "Game results")

    # Team box scores — cap to recent 200 games to keep JSON size manageable
    # Sort newest first so the frontend gets the most recent data
    team_recent = team_bs_df.sort_values("GAME_DATE", ascending=False).head(2000).copy()
    _save_json(team_recent, "team_boxscores.json", "Team box scores (recent 2000 rows)")

    # Player box scores — cap to recent 3000 rows
    player_recent = player_bs_df.sort_values("GAME_DATE", ascending=False).head(3000).copy()
    _save_json(player_recent, "player_boxscores.json", "Player box scores (recent 3000 rows)")

    # Compute and save season highlights
    highlights = {
        "highest_scoring_games": [],
        "lowest_scoring_games": [],
        "top_points": [],
        "top_assists": [],
        "top_rebounds": []
    }

    if not results_df.empty:
        df_res = results_df.copy()
        df_res["TOTAL_PTS"] = df_res["HOME_SCORE"] + df_res["AWAY_SCORE"]
        
        # Highest scoring games
        df_high = df_res.sort_values("TOTAL_PTS", ascending=False).head(5)
        for _, row in df_high.iterrows():
            highlights["highest_scoring_games"].append({
                "GAME_ID": row["GAME_ID"],
                "GAME_DATE": str(row["GAME_DATE"]),
                "HOME_TEAM": row["HOME_TEAM_ABBREVIATION"],
                "AWAY_TEAM": row["AWAY_TEAM_ABBREVIATION"],
                "HOME_SCORE": int(row["HOME_SCORE"]),
                "AWAY_SCORE": int(row["AWAY_SCORE"]),
                "TOTAL_PTS": int(row["TOTAL_PTS"]),
                "SEASON_TYPE": row["SEASON_TYPE"]
            })
            
        # Lowest scoring games
        df_low = df_res.sort_values("TOTAL_PTS", ascending=True).head(5)
        for _, row in df_low.iterrows():
            highlights["lowest_scoring_games"].append({
                "GAME_ID": row["GAME_ID"],
                "GAME_DATE": str(row["GAME_DATE"]),
                "HOME_TEAM": row["HOME_TEAM_ABBREVIATION"],
                "AWAY_TEAM": row["AWAY_TEAM_ABBREVIATION"],
                "HOME_SCORE": int(row["HOME_SCORE"]),
                "AWAY_SCORE": int(row["AWAY_SCORE"]),
                "TOTAL_PTS": int(row["TOTAL_PTS"]),
                "SEASON_TYPE": row["SEASON_TYPE"]
            })

    if not player_bs_df.empty:
        df_player = player_bs_df.copy()
        
        # Top Points
        if "PTS" in df_player.columns:
            df_pts = df_player.sort_values("PTS", ascending=False).head(5)
            for _, row in df_pts.iterrows():
                highlights["top_points"].append({
                    "PLAYER_NAME": row["PLAYER_NAME"],
                    "TEAM": row["TEAM_ABBREVIATION"],
                    "MATCHUP": row.get("MATCHUP", ""),
                    "GAME_DATE": str(row["GAME_DATE"]),
                    "VALUE": int(row["PTS"]),
                    "GAME_ID": row["GAME_ID"]
                })
                
        # Top Assists
        if "AST" in df_player.columns:
            df_ast = df_player.sort_values("AST", ascending=False).head(5)
            for _, row in df_ast.iterrows():
                highlights["top_assists"].append({
                    "PLAYER_NAME": row["PLAYER_NAME"],
                    "TEAM": row["TEAM_ABBREVIATION"],
                    "MATCHUP": row.get("MATCHUP", ""),
                    "GAME_DATE": str(row["GAME_DATE"]),
                    "VALUE": int(row["AST"]),
                    "GAME_ID": row["GAME_ID"]
                })
                
        # Top Rebounds
        if "REB" in df_player.columns:
            df_reb = df_player.sort_values("REB", ascending=False).head(5)
            for _, row in df_reb.iterrows():
                highlights["top_rebounds"].append({
                    "PLAYER_NAME": row["PLAYER_NAME"],
                    "TEAM": row["TEAM_ABBREVIATION"],
                    "MATCHUP": row.get("MATCHUP", ""),
                    "GAME_DATE": str(row["GAME_DATE"]),
                    "VALUE": int(row["REB"]),
                    "GAME_ID": row["GAME_ID"]
                })
                
    highlights_path = os.path.join(out_dir, "highlights.json")
    with open(highlights_path, "w") as f:
        json.dump(highlights, f, indent=2)
    print(f"  ✅ Exported season highlights → {highlights_path}")


def _run_data_freshness_pipeline(args):
    from src.orchestration.pipeline_workflows import run_data_freshness_pipeline
    run_data_freshness_pipeline(args)


def _run_sync_pipeline(args):
    from src.orchestration.pipeline_workflows import run_sync_pipeline
    return run_sync_pipeline(args)


def _run_game_results_regeneration():
    from src.orchestration.pipeline_workflows import run_game_results_regeneration
    run_game_results_regeneration()


def _run_build_enhanced_v2(args):
    from src.orchestration.pipeline_workflows import run_build_enhanced_v2
    run_build_enhanced_v2(args)


def _run_pre_model_readiness_pipeline(args):
    from src.orchestration.pipeline_workflows import run_pre_model_readiness_pipeline
    run_pre_model_readiness_pipeline(args)


def _run_startup_check(args):
    from src.orchestration.pipeline_workflows import run_startup_check
    run_startup_check(args)


def _generate_update_reports(
    today, missing_games, fetched_games,
    pre_team, post_team, pre_player, post_player,
    post_feat_team, post_v2_count,
    pre_status, post_status, failed_calls,
    rebuilds_ran: bool
):
    from src.orchestration.pipeline_reports import generate_update_reports
    generate_update_reports(
        today=today,
        missing_games=missing_games,
        fetched_games=fetched_games,
        pre_team=pre_team,
        post_team=post_team,
        pre_player=pre_player,
        post_player=post_player,
        post_feat_team=post_feat_team,
        post_v2_count=post_v2_count,
        pre_status=pre_status,
        post_status=post_status,
        failed_calls=failed_calls,
        rebuilds_ran=rebuilds_ran,
    )


def _run_update_data(args):
    from src.orchestration.pipeline_workflows import run_update_data
    run_update_data(args)


def _run_build_player_dataset_v4(args):
    from src.orchestration.pipeline_workflows import run_build_player_dataset_pipeline
    run_build_player_dataset_pipeline(args)


def _run_train_player_models(args):
    from src.orchestration.pipeline_workflows import run_train_player_models_pipeline
    run_train_player_models_pipeline(args)


def _run_train_score_models(args):
    from src.orchestration.pipeline_workflows import run_train_score_models_pipeline
    run_train_score_models_pipeline(args)


def _run_train_win_model(args):
    from src.orchestration.pipeline_workflows import run_train_win_model_pipeline
    run_train_win_model_pipeline(args)


def main():
    parser = argparse.ArgumentParser(description="NBA ML Project Preprocessing & Feature Engineering Pipeline")
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
        "--raw-team-dir", 
        type=str, 
        default="data/raw/team_games",
        help="Directory containing raw team game log CSVs"
    )
    parser.add_argument(
        "--raw-player-dir", 
        type=str, 
        default="data/raw/player_games",
        help="Directory containing raw player game log CSVs"
    )
    parser.add_argument(
        "--output-dir", 
        type=str, 
        default="data/features",
        help="Directory to save engineered features"
    )
    parser.add_argument(
        "--mock", 
        action="store_true", 
        help="Generate and use mock/synthetic data if raw data is not yet available"
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
        help="Run the full season bootstrap workflow: sync, rebuild, export frontend data, and write a manifest"
    )
    parser.add_argument(
        "--export-frontend-data",
        action="store_true",
        help="Export data for frontend"
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

    from scripts.data_paths import get_data_paths
    from scripts.season_utils import season_to_file_token, normalize_season
    
    paths = get_data_paths(args.season)
    from scripts.season_utils import get_default_season
    season = normalize_season(args.season or get_default_season())
    token = season_to_file_token(season)

    # Overwrite dirs dynamically if a specific season is provided
    if args.season:
        args.raw_team_dir = os.path.dirname(paths.team_games_raw)
        args.raw_player_dir = os.path.dirname(paths.player_games_raw)
        args.output_dir = os.path.dirname(paths.team_features)
        args.output_scope = "production"

    if PipelineOrchestrator(args).dispatch():
        return

    if args.run_roster_analysis:
        from src.analysis.roster_analysis import run_roster_analysis
        player_csv = paths.player_games_raw
        season_data_dir = os.path.join("data", f"season={season}", "analysis")
        season_output_dir = os.path.join("reports", "operations", f"season={season}")
        roster_df, core_players_df, star_candidates_df, multi_team_players_df, player_name_lookup_df = run_roster_analysis(
            player_csv,
            data_dir=season_data_dir,
            output_dir=season_output_dir
        )
        
        print("\n============================================================")
        print("📊 ROSTER ANALYSIS DATASETS GENERATED SUCCESSFULLY 📊")
        print("============================================================\n")
        
        # Shapes & Storage locations
        print("1. TEAM ROSTERS:")
        print(f"   - CSV Path:     {os.path.join(season_data_dir, 'team_rosters.csv')}")
        print(f"   - Parquet Path: {os.path.join(season_data_dir, 'team_rosters.parquet')}")
        print(f"   - Shape:        {roster_df.shape}")
        print("   - Sample Rows:")
        print(roster_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("2. CORE PLAYERS:")
        print(f"   - CSV Path:     {os.path.join(season_data_dir, 'core_players.csv')}")
        print(f"   - Parquet Path: {os.path.join(season_data_dir, 'core_players.parquet')}")
        print(f"   - Shape:        {core_players_df.shape}")
        print("   - Sample Rows:")
        print(core_players_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("3. LEAGUE-WIDE STAR CANDIDATES:")
        print(f"   - CSV Path:     {os.path.join(season_data_dir, 'star_candidates.csv')}")
        print(f"   - Parquet Path: {os.path.join(season_data_dir, 'star_candidates.parquet')}")
        print(f"   - Shape:        {star_candidates_df.shape}")
        print("   - Sample (Top 3):")
        print(star_candidates_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("4. MULTI-TEAM PLAYERS:")
        print(f"   - CSV Path:     {os.path.join(season_data_dir, 'multi_team_players.csv')}")
        print(f"   - Parquet Path: {os.path.join(season_data_dir, 'multi_team_players.parquet')}")
        print(f"   - Shape:        {multi_team_players_df.shape}")
        print("   - Sample Rows:")
        print(multi_team_players_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("5. NAME NORMALIZATION LOOKUP:")
        print(f"   - CSV Path:     {os.path.join(season_data_dir, 'player_name_lookup.csv')}")
        print(f"   - Parquet Path: {os.path.join(season_data_dir, 'player_name_lookup.parquet')}")
        print(f"   - Shape:        {player_name_lookup_df.shape}")
        print("   - Sample Rows (with Accent Characters):")
        accented_samples = player_name_lookup_df[
            player_name_lookup_df["RAW_PLAYER_NAME"].str.contains("ć|ć|ž|š|č|č|ö|ä|í|ņ|ģ|ł", case=False, regex=True)
        ].head(5)
        if not accented_samples.empty:
            print(accented_samples.to_string(index=False))
        else:
            print(player_name_lookup_df.head(5).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        # Check for duplicate PLAYER_ID issues in player_name_lookup
        print("🔍 INTEGRITY CHECKS:")
        dup_ids = player_name_lookup_df[player_name_lookup_df.duplicated(subset=["PLAYER_ID"])]
        if len(dup_ids) > 0:
            print(f"❌ Warning: Found duplicate PLAYER_ID values in name lookup! count={len(dup_ids)}")
            print(dup_ids.head(5))
        else:
            print("✅ Success: No duplicate PLAYER_ID issues detected in name lookup.")
            
        # Check for name normalization conflicts: 
        # Same normalized name mapping to different PLAYER_IDs (which can be normal for different players, but useful to report)
        dup_normalized = player_name_lookup_df[player_name_lookup_df.duplicated(subset=["NORMALIZED_PLAYER_NAME"], keep=False)]
        if len(dup_normalized) > 0:
            print(f"ℹ️ Info: Detected {dup_normalized['NORMALIZED_PLAYER_NAME'].nunique()} normalized names sharing multiple PLAYER_IDs:")
            # Display grouping
            for name, group in dup_normalized.groupby("NORMALIZED_PLAYER_NAME"):
                ids_str = ", ".join(group["PLAYER_ID"].astype(str).tolist())
                raw_names_str = ", ".join(group["RAW_PLAYER_NAME"].tolist())
                print(f"   - '{name}': IDs [{ids_str}] -> Raw names: [{raw_names_str}]")
        else:
            print("✅ Success: No name normalization conflicts found (all normalized names map to unique PLAYER_IDs).")
            
        print("====================================================\n")
        return

    print("============================================================")
    print("🏀 STARTING NBA ML PREPROCESSING & FEATURE ENGINEERING PIPELINE 🏀")
    print("============================================================\n")

    # 1. LOAD DATASETS
    print("--- STEP 1: LOADING DATASETS ---")
    
    # Check if raw files exist. If not, check if we should run in mock mode
    run_mock = args.mock
    if not run_mock:
        # Check if the directories are empty or missing
        team_empty = not os.path.exists(args.raw_team_dir) or not any(f.endswith('.csv') for f in os.listdir(args.raw_team_dir))
        player_empty = not os.path.exists(args.raw_player_dir) or not any(f.endswith('.csv') for f in os.listdir(args.raw_player_dir))
        
        if team_empty or player_empty:
            print("⚠️ Raw dataset files not found in standard directories.")
            print("💡 Automatically enabling --mock mode to run the pipeline with synthetic test data.")
            print("   (You can place your real CSVs in the raw/ folders later to process them.)")
            run_mock = True

    if run_mock:
        print("Generating mock/synthetic NBA datasets...")
        df_team_raw = generate_mock_team_games()
        df_player_raw = generate_mock_player_games()
        print(f"Generated mock team games: {df_team_raw.shape[0]} rows.")
        print(f"Generated mock player games: {df_player_raw.shape[0]} rows.")
    else:
        try:
            df_team_raw = load_team_games(args.raw_team_dir, season=args.season)
            df_player_raw = load_player_games(args.raw_player_dir, season=args.season)
        except Exception as e:
            print(f"❌ Error loading raw datasets: {e}")
            print("Please check your directories or run with --mock to test the pipeline.")
            return

    # 2. VALIDATION
    print("\n--- STEP 2: RUNNING VALIDATION CHECKS ---")
    team_valid = validate_team_games(df_team_raw)
    player_valid = validate_player_games(df_player_raw)

    if not team_valid or not player_valid:
        print("⚠️ Warning: Validation found discrepancies. Proceeding with caution...\n")
    else:
        print("✅ Validation checks passed successfully.\n")

    # 3. DATE CLEANING & SORTING
    print("--- STEP 3: DATE CLEANING & SORTING ---")
    
    print("Cleaning team game dates and sorting chronologically...")
    df_team_clean = clean_dates(df_team_raw, "GAME_DATE")
    df_team_clean = sort_team_games(df_team_clean)
    
    print("Cleaning player game dates and sorting chronologically...")
    df_player_clean = clean_dates(df_player_raw, "GAME_DATE")
    df_player_clean = sort_player_games(df_player_clean)
    
    print("Cleaning completed.\n")

    # 4. FEATURE ENGINEERING
    print("--- STEP 4: ENGINEERING FEATURES ---")
    
    print("Building team features (home/away, rest days, back-to-backs, rolling averages)...")
    df_team_features = build_team_features(df_team_clean)
    print(f"Team features completed. Final shape: {df_team_features.shape}")
    
    print("Building player features (individual rest days, back-to-backs, rolling stats)...")
    df_player_features = build_player_features(df_player_clean)
    print(f"Player features completed. Final shape: {df_player_features.shape}")
    print("Feature engineering completed.\n")

    # 5. SAVE OUTPUTS
    print("--- STEP 5: SAVING PREPROCESSED FEATURES ---")
    
    os.makedirs(args.output_dir, exist_ok=True)
    
    # File paths
    team_csv_path = paths.team_features
    team_parquet_path = paths.team_features.replace(".csv", ".parquet")
    player_csv_path = paths.player_features
    player_parquet_path = paths.player_features.replace(".csv", ".parquet")
    
    # Save team games
    print(f"Saving team features to CSV: {team_csv_path}")
    df_team_features.to_csv(team_csv_path, index=False)
    print(f"Saving team features to Parquet: {team_parquet_path}")
    df_team_features.to_parquet(team_parquet_path, index=False, engine="pyarrow")
    
    # Save player games
    print(f"Saving player features to CSV: {player_csv_path}")
    df_player_features.to_csv(player_csv_path, index=False)
    print(f"Saving player features to Parquet: {player_parquet_path}")
    df_player_features.to_parquet(player_parquet_path, index=False, engine="pyarrow")
    
    # 6. BUILD MODEL-READY DATASETS
    if args.build_model_dataset or args.build_v3_dataset:
        print("\n--- STEP 6: BUILDING MODEL-READY TEAM DATASETS ---")
        from src.processing import build_team_model_dataset, build_team_model_dataset_v2, build_team_model_dataset_v3
        
        # Build V1 Dataset
        df_team_model, dropped_count_v1 = build_team_model_dataset(df_team_features)
        
        processed_dir = "data/processed"
        os.makedirs(processed_dir, exist_ok=True)
        
        model_csv_path = os.path.join(processed_dir, f"team_model_ready_{token}.csv")
        model_parquet_path = os.path.join(processed_dir, f"team_model_ready_{token}.parquet")
        
        print(f"Saving model-ready team features (V1) to CSV: {model_csv_path}")
        df_team_model.to_csv(model_csv_path, index=False)
        print(f"Saving model-ready team features (V1) to Parquet: {model_parquet_path}")
        df_team_model.to_parquet(model_parquet_path, index=False, engine="pyarrow")
        
        # Build V2 Dataset (Opponent-Aware)
        print("\nEngineering opponent features...")
        df_team_features_with_opp = build_opponent_features(df_team_features)
        
        # Validate opponent join
        val_metrics = validate_opponent_join(df_team_features, df_team_features_with_opp)
        
        # Build V2 Model-Ready Dataset
        df_team_model_v2, dropped_count_v2 = build_team_model_dataset_v2(df_team_features_with_opp)
        
        model_v2_csv_path = paths.team_model_ready_v2
        model_v2_parquet_path = paths.team_model_ready_v2.replace(".csv", ".parquet")
        
        print(f"Saving model-ready team features (V2) to CSV: {model_v2_csv_path}")
        df_team_model_v2.to_csv(model_v2_csv_path, index=False)
        print(f"Saving model-ready team features (V2) to Parquet: {model_v2_parquet_path}")
        df_team_model_v2.to_parquet(model_v2_parquet_path, index=False, engine="pyarrow")
        
        # Generate Opponent Feature Report
        report_path = "reports/audits/opponent_feature_report.md"
        print(f"Generating Opponent Join validation report: {report_path}")
        
        # Compute distributions for report
        win_dist = df_team_model_v2["WIN"].value_counts(dropna=False).to_dict() if "WIN" in df_team_model_v2.columns else {}
        home_dist = df_team_model_v2["IS_HOME"].value_counts(dropna=False).to_dict() if "IS_HOME" in df_team_model_v2.columns else {}
        playoff_dist = df_team_model_v2["IS_PLAYOFF"].value_counts(dropna=False).to_dict() if "IS_PLAYOFF" in df_team_model_v2.columns else {}
        
        # Write report
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w") as f:
            f.write("# NBA Team Model-Ready Dataset V2 (Opponent-Aware) Report\n\n")
            f.write("## 1. Dataset Dimensions & Paths\n")
            f.write(f"- **V2 CSV Output File**: `{model_v2_csv_path}`\n")
            f.write(f"- **V2 Parquet Output File**: `{model_v2_parquet_path}`\n")
            f.write(f"- **Final V2 Shape**: **{df_team_model_v2.shape[0]} rows, {df_team_model_v2.shape[1]} columns**\n")
            f.write(f"- **Total Features**: **{df_team_model_v2.shape[1] - 7} features** (Target `WIN` and 6 Metadata columns excluded)\n\n")
            
            f.write("## 2. Opponent Join Validation Metrics\n")
            f.write(f"- **Number of Rows Before Join**: {val_metrics['rows_before']}\n")
            f.write(f"- **Number of Rows After Join**: {val_metrics['rows_after']}\n")
            f.write(f"- **Join Success Rate**: {val_metrics['success_rate_percent']:.2f}%\n")
            f.write(f"- **Every GAME_ID has exactly 2 rows?**: {'Yes ✅' if val_metrics['all_games_have_two_rows'] else 'No ❌'}\n")
            f.write(f"- **Number of Invalid GAME_ID row counts**: {val_metrics['invalid_game_ids_count']}\n")
            f.write(f"- **Failed Matching GAME_IDs**: {val_metrics['failed_game_ids'] if val_metrics['failed_game_ids'] else 'None'}\n\n")
            
            f.write("### Missing Opponent Feature Counts (In Joined Feature Set)\n")
            f.write("| Feature | Missing (NaN) Count | Percentage |\n")
            f.write("| :--- | :---: | :---: |\n")
            for feat, count in val_metrics["missing_opponent_feature_counts"].items():
                pct = (count / val_metrics['rows_after']) * 100 if val_metrics['rows_after'] > 0 else 0.0
                f.write(f"| `{feat}` | {count} | {pct:.2f}% |\n")
            f.write("\n")
            
            f.write("## 3. Pre-Game Rolling Feature Row Drops\n")
            f.write(f"- **Row count after join (raw features)**: {val_metrics['rows_after']}\n")
            f.write(f"- **Row count after dropping NaNs (clean dataset)**: {df_team_model_v2.shape[0]}\n")
            f.write(f"- **Rows dropped due to NaNs**: {dropped_count_v2}\n")
            f.write("  *(Explanation: These drops represent early-season games where either the team itself or its opponent had not played enough previous games to calculate the 10-game/5-game rolling features or scheduling rest variables.)*\n\n")
            
            f.write("## 4. Feature and Target Distributions (Clean V2 Set)\n")
            f.write("### Target Variable: `WIN`\n")
            for val, count in win_dist.items():
                f.write(f"- **{val}**: {count} ({count/len(df_team_model_v2)*100:.2f}%)\n")
            f.write("\n")
            f.write("### Feature: `IS_HOME`\n")
            for val, count in home_dist.items():
                f.write(f"- **{val}**: {count} ({count/len(df_team_model_v2)*100:.2f}%)\n")
            f.write("\n")
            f.write("### Feature: `IS_PLAYOFF`\n")
            for val, count in playoff_dist.items():
                f.write(f"- **{val}**: {count} ({count/len(df_team_model_v2)*100:.2f}%)\n")
            f.write("\n")
            
            f.write("## 5. Sample Rows Side-by-Side (Team vs Opponent Features)\n")
            # Get some columns side by side
            cols_sample = [
                "GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", 
                "DAYS_REST", "OPP_DAYS_REST", "PTS_LAST_5", "OPP_PTS_LAST_5", 
                "WINRATE_LAST_5", "OPP_WINRATE_LAST_5", "WIN"
            ]
            existing_sample_cols = [c for c in cols_sample if c in df_team_model_v2.columns]
            sample_df = df_team_model_v2[existing_sample_cols].head(8)
            f.write(_df_to_markdown(sample_df))
            f.write("\n")

        # Build V3 Dataset (Core Player Availability & Opponent Core Features)
        if args.build_v3_dataset:
            print("\n--- STEP 7: BUILDING MODEL-READY DATASET V3 (CORE PLAYER AWARE) ---")
            from src.analysis.roster_analysis import get_core_players
            from src.features.core_player_availability_features import build_core_player_availability_features
            
            print("Discovering core players dynamically from player logs...")
            core_players_df = get_core_players(df_player_features)
            
            print("Building core player availability features...")
            df_team_features_with_core = build_core_player_availability_features(
                df_team_features_with_opp,
                df_player_features,
                core_players_df
            )
            
            # Build V3 Model-Ready Dataset
            df_team_model_v3, dropped_count_v3 = build_team_model_dataset_v3(df_team_features_with_core)
            
            model_v3_csv_path = os.path.join(processed_dir, f"team_model_ready_v3_{token}.csv")
            model_v3_parquet_path = os.path.join(processed_dir, f"team_model_ready_v3_{token}.parquet")
            
            print(f"Saving model-ready team features (V3) to CSV: {model_v3_csv_path}")
            df_team_model_v3.to_csv(model_v3_csv_path, index=False)
            print(f"Saving model-ready team features (V3) to Parquet: {model_v3_parquet_path}")
            df_team_model_v3.to_parquet(model_v3_parquet_path, index=False, engine="pyarrow")
            
            # Programmatically generate reports/operations/team_model_ready_v3_report.md
            v3_report_path = "reports/operations/team_model_ready_v3_report.md"
            print(f"Generating V3 core player availability report: {v3_report_path}")
            
            # We want to show core rosters for LAL, BOS, NYK, SAS, GSW, HOU, POR, TOR
            report_teams = ["LAL", "BOS", "NYK", "SAS", "GSW", "HOU", "POR", "TOR"]
            core_rosters_md = []
            for team in report_teams:
                team_cores = core_players_df[core_players_df["TEAM_ABBREVIATION"] == team].sort_values("CORE_RANK")
                if not team_cores.empty:
                    core_rosters_md.append(f"### {team} Core Players\n")
                    for _, row in team_cores.iterrows():
                        role = "Core (Top 3)" if row['CORE_RANK'] <= 3 else "Secondary (Top 4-5)"
                        core_rosters_md.append(f"- Rank {row['CORE_RANK']} ({role}): **{row['PLAYER_NAME']}** (Importance Score: {row['IMPORTANCE_SCORE']:.2f})\n")
                    core_rosters_md.append("\n")
            
            # Get some columns sample for V3 report
            v3_cols_sample = [
                "GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION",
                "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE",
                "OPP_CORE_TOP3_PLAYED_COUNT", "OPP_CORE_TOP3_AVAILABLE_RATE",
                "TEAM_CORE_TOP3_MINUTES_SUM", "OPP_CORE_TOP3_MINUTES_SUM", "WIN"
            ]
            existing_v3_sample_cols = [c for c in v3_cols_sample if c in df_team_model_v3.columns]
            v3_sample_df = df_team_model_v3[existing_v3_sample_cols].head(10)
            
            os.makedirs(os.path.dirname(v3_report_path), exist_ok=True)
            with open(v3_report_path, "w") as f:
                f.write("# NBA Team Model-Ready Dataset V3 (Core Player Availability) Report\n\n")
                
                f.write("## 1. Dataset Dimensions & Paths\n")
                f.write(f"- **V3 CSV Output File**: `{model_v3_csv_path}`\n")
                f.write(f"- **V3 Parquet Output File**: `{model_v3_parquet_path}`\n")
                f.write(f"- **Final V3 Shape**: **{df_team_model_v3.shape[0]} rows, {df_team_model_v3.shape[1]} columns**\n")
                f.write(f"- **Total Features**: **{df_team_model_v3.shape[1] - 7} features** (Target `WIN` and 6 Metadata columns excluded)\n\n")
                
                f.write("## 2. Pre-Game Rolling Feature Row Drops\n")
                f.write(f"- **Row count after joining core availability features**: {df_team_features_with_core.shape[0]}\n")
                f.write(f"- **Row count after dropping NaNs (clean dataset)**: {df_team_model_v3.shape[0]}\n")
                f.write(f"- **Rows dropped due to NaNs in base rolling features**: {dropped_count_v3}\n")
                f.write("  *(Explanation: These drops represent early-season games where team or opponent features are NaN because of insufficient previous history.)*\n\n")
                
                f.write("## 3. Discovered Core Roster Highlights\n")
                f.write("Below are the discovered top 5 players for a subset of prominent teams:\n\n")
                f.write("".join(core_rosters_md))
                
                f.write("## 4. Post-Tipoff Proxy Feature Warning (Potential Leakage)\n")
                f.write("> [!WARNING]\n")
                f.write("> **Potential Data Leakage Warning**: The features tracking player attendance (`PLAYED_COUNT`) and playing time (`MINUTES_SUM`) are computed from the box scores of the game being predicted. These are **post-tipoff observed stats** and are included as proxy features for analysis. In a real-world pre-game prediction environment, these features must be replaced with pre-game projections or injury reports to prevent data leakage.\n\n")
                
                f.write("## 5. Sample Rows (Core Player Availability & Metrics)\n")
                f.write(_df_to_markdown(v3_sample_df))
                f.write("\n")
    
    print("\n============================================================")
    print("🎉 PIPELINE RUN COMPLETED SUCCESSFULLY! 🎉")
    if args.build_v3_dataset:
        print(f"All features and model-ready datasets (V1, V2, V3) saved successfully.")
    elif args.build_model_dataset:
        print(f"All preprocessed features saved to '{args.output_dir}/' and model-ready datasets (V1, V2) saved to 'data/processed/'")
    else:
        print(f"All preprocessed features saved to '{args.output_dir}/'")
    print("============================================================")

if __name__ == "__main__":
    main()
