import os
import sys

import pandas as pd

from src.features import build_opponent_features, build_player_features, build_team_features, validate_opponent_join
from src.features.roster_absence import add_absence_columns
from src.ingestion.data_loader import load_player_games, load_team_games
from src.processing.cleaning import clean_dates, sort_player_games, sort_team_games
from src.processing.mock_generator import generate_mock_player_games, generate_mock_team_games
from src.processing.validation import validate_player_games, validate_team_games


def _df_to_markdown(df: pd.DataFrame) -> str:
    """Helper to convert a pandas DataFrame to a markdown table string without tabulate."""
    headers = list(df.columns)
    header_str = "| " + " | ".join(headers) + " |\n"
    sep_str = "| " + " | ".join(["---"] * len(headers)) + " |\n"
    row_strs = []
    for _, row in df.iterrows():
        row_strs.append("| " + " | ".join(str(val) for val in row) + " |\n")
    return header_str + sep_str + "".join(row_strs)


def run_feature_pipeline(args, season, token, paths) -> None:
    print("============================================================")
    print("🏀 STARTING NBA ML PREPROCESSING & FEATURE ENGINEERING PIPELINE 🏀")
    print("============================================================\n")

    # 1. LOAD DATASETS
    print("--- STEP 1: LOADING DATASETS ---")
    
    # Mock mode only runs when asked for, and its outputs never land on the
    # real season files (data/ is gitignored, so an overwrite is unrecoverable).
    if args.mock:
        print("Generating mock/synthetic NBA datasets...")
        df_team_raw = generate_mock_team_games()
        df_player_raw = generate_mock_player_games()
        print(f"Generated mock team games: {df_team_raw.shape[0]} rows.")
        print(f"Generated mock player games: {df_player_raw.shape[0]} rows.")
    else:
        try:
            df_team_raw = load_team_games(season=args.season)
            df_player_raw = load_player_games(season=args.season)
        except Exception as e:
            print(f"❌ Error loading raw datasets: {e}")
            sys.exit(1)
        if df_team_raw.empty or df_player_raw.empty:
            print(f"❌ Raw team/player game logs for season {season} are missing or empty.")
            print("   Run --update-data first, or pass --mock to test the pipeline with synthetic data.")
            sys.exit(1)

    if args.mock:
        mock_dir = os.path.join("data", "experimental", "mock")
        team_csv_path = os.path.join(mock_dir, "team_features.csv")
        player_csv_path = os.path.join(mock_dir, "player_features.csv")
        model_v2_csv_path = os.path.join(mock_dir, f"team_model_ready_v2_{token}.csv")
        report_path = os.path.join(mock_dir, "opponent_feature_report.md")
        v3_report_path = os.path.join(mock_dir, "team_model_ready_v3_report.md")
    else:
        team_csv_path = paths.team_features
        player_csv_path = paths.player_features
        model_v2_csv_path = paths.team_model_ready_v2
        report_path = "reports/audits/opponent_feature_report.md"
        v3_report_path = "reports/operations/team_model_ready_v3_report.md"

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
    df_team_features = build_team_features(df_team_clean, season_dir=paths.season_dir)
    print(f"Team features completed. Final shape: {df_team_features.shape}")
    
    print("Building player features (individual rest days, back-to-backs, rolling stats)...")
    df_player_features = build_player_features(df_player_clean)
    print(f"Player features completed. Final shape: {df_player_features.shape}")
    print("Feature engineering completed.\n")

    # 5. SAVE OUTPUTS
    print("--- STEP 5: SAVING PREPROCESSED FEATURES ---")
    
    os.makedirs(os.path.dirname(team_csv_path), exist_ok=True)
    os.makedirs(os.path.dirname(player_csv_path), exist_ok=True)

    # Save team games
    print(f"Saving team features to CSV: {team_csv_path}")
    df_team_features.to_csv(team_csv_path, index=False)
    
    # Save player games
    print(f"Saving player features to CSV: {player_csv_path}")
    df_player_features.to_csv(player_csv_path, index=False)
    
    # 6. BUILD MODEL-READY DATASETS
    if args.build_model_dataset or args.build_v3_dataset:
        print("\n--- STEP 6: BUILDING MODEL-READY TEAM DATASETS ---")
        from src.processing import build_team_model_dataset_v2, build_team_model_dataset_v3

        # Build V2 Dataset (Opponent-Aware)
        print("\nEngineering opponent features...")
        df_team_features_with_opp = build_opponent_features(df_team_features)
        
        # Validate opponent join
        val_metrics = validate_opponent_join(df_team_features, df_team_features_with_opp)
        
        # Build V2 Model-Ready Dataset
        df_team_model_v2, dropped_count_v2 = build_team_model_dataset_v2(df_team_features_with_opp)

        print(f"Saving model-ready team features (V2) to CSV: {model_v2_csv_path}")
        df_team_model_v2.to_csv(model_v2_csv_path, index=False)
        
        # Generate Opponent Feature Report
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
            
            print("Discovering season core players (report only; features use pre-game cores)...")
            core_players_df = get_core_players(df_player_features)
            
            print("Building core player availability features...")
            df_team_features_with_core = build_core_player_availability_features(
                df_team_features_with_opp,
                df_player_features,
            )
            
            # Build V3 Model-Ready Dataset
            df_team_model_v3, dropped_count_v3 = build_team_model_dataset_v3(df_team_features_with_core)
            try:
                df_team_model_v3 = add_absence_columns(df_team_model_v3, df_player_raw)
            except KeyError as e:  # mock player logs lack box-score columns
                print(f"Skipping roster absence features: missing column {e}")
            
            model_v3_csv_path = (
                os.path.join(mock_dir, f"team_model_ready_v3_{token}.csv") if args.mock else paths.team_model_ready
            )
            os.makedirs(os.path.dirname(model_v3_csv_path), exist_ok=True)
            
            print(f"Saving model-ready team features (V3) to CSV: {model_v3_csv_path}")
            df_team_model_v3.to_csv(model_v3_csv_path, index=False)
            
            # Programmatically generate the V3 report (reports/operations/ unless mock)
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

    # The team features and V3 written above lack the box-score features; add them so this run
    # leaves the same files as rebuild_training_data and --update-data (38 columns otherwise lost).
    if not args.mock:
        from src.features.enrich_v3_boxscore_features import enrich_all_seasons
        enrich_all_seasons([season])

    print("\n============================================================")
    print("🎉 PIPELINE RUN COMPLETED SUCCESSFULLY! 🎉")
    if args.build_v3_dataset:
        print(f"All features and model-ready datasets (V2, V3) saved successfully.")
    elif args.build_model_dataset:
        print(f"All preprocessed features saved to '{os.path.dirname(team_csv_path)}/' and the V2 model-ready dataset saved to '{os.path.dirname(model_v2_csv_path)}/'")
    else:
        print(f"All preprocessed features saved to '{os.path.dirname(team_csv_path)}/'")
    print("============================================================")
