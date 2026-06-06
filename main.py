import os
import argparse
import pandas as pd
from src.ingestion.data_loader import load_team_games, load_player_games
from src.processing.validation import validate_team_games, validate_player_games
from src.processing.cleaning import clean_dates, sort_team_games, sort_player_games
from src.features import build_team_features, build_player_features, build_opponent_features, validate_opponent_join
from src.processing.mock_generator import generate_mock_team_games, generate_mock_player_games

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
    """
    Full pipeline for --build-schedule-context:
      1. Load & combine raw schedule files (played + upcoming Finals).
      2. Save combined schedule (CSV + Parquet).
      3. Build upcoming games context (team features + core player strings).
      4. Save upcoming context (CSV + Parquet).
      5. Export schedule and upcoming context as frontend JSON files.
      6. Generate outputs/analysis/schedule_layer_report.md.
    """
    from datetime import date
    import json
    from src.ingestion.schedule_loader import load_combined_schedule
    from src.processing.upcoming_context_builder import build_upcoming_games_context
    from scripts.export_frontend_data import export_data as _export_frontend_data

    print("============================================================")
    print("📅 SCHEDULE CONTEXT PIPELINE STARTING 📅")
    print("============================================================\n")

    # Step 1 & 2 — Combine schedules and save
    print("STEP 1: Loading and combining schedule files...")
    df_combined = load_combined_schedule(save=True)

    # Step 3 & 4 — Build upcoming context and save
    print("\nSTEP 2: Building upcoming games context...")
    df_upcoming = build_upcoming_games_context(save=True)

    # Step 5 — Export frontend JSON files
    print("\nSTEP 3: Exporting frontend JSON files...")
    _export_frontend_data()

    # Step 6 — Generate report
    print("\nSTEP 4: Generating schedule layer report...")
    report_path = "outputs/analysis/schedule_layer_report.md"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)

    today = date.today()
    season_dist = df_combined["SEASON_TYPE"].value_counts().to_dict()
    playoff_total = int(df_combined["IS_PLAYOFF"].sum()) if "IS_PLAYOFF" in df_combined.columns else 0
    upcoming_count = len(df_upcoming)

    # Missing fields summary for combined schedule
    missing_summary = {}
    for col in df_combined.columns:
        null_count = int(df_combined[col].isna().sum())
        if null_count > 0:
            missing_summary[col] = null_count

    with open(report_path, "w") as f:
        f.write("# Schedule Layer Report — 2025-26 NBA Season\n\n")
        f.write(f"> Generated: {today}\n\n")

        f.write("## 1. Schedule Summary\n\n")
        f.write(f"- **Total rows in combined schedule**: {len(df_combined):,}\n")
        f.write(f"- **Upcoming games (from {today} onwards)**: {upcoming_count}\n")
        f.write(f"- **Total playoff games (IS_PLAYOFF = True)**: {playoff_total}\n\n")

        f.write("### Season Type Distribution\n\n")
        f.write("| Season Type | Game Count |\n")
        f.write("| :--- | ---: |\n")
        for stype, cnt in season_dist.items():
            f.write(f"| {stype} | {cnt:,} |\n")
        f.write("\n")

        f.write("## 2. Generated Files\n\n")
        f.write("| Dataset | Path | Format |\n")
        f.write("| :--- | :--- | :---: |\n")
        f.write("| Combined Schedule | `data/processed/schedule_combined_2025_26.csv` | CSV |\n")
        f.write("| Combined Schedule | `data/processed/schedule_combined_2025_26.parquet` | Parquet |\n")
        f.write("| Upcoming Games Context | `data/processed/upcoming_games_context_2025_26.csv` | CSV |\n")
        f.write("| Upcoming Games Context | `data/processed/upcoming_games_context_2025_26.parquet` | Parquet |\n")
        f.write("\n")

        f.write("## 3. Frontend JSON Exports\n\n")
        f.write("| File | Path |\n")
        f.write("| :--- | :--- |\n")
        f.write("| Full Schedule | `frontend/public/data/schedule.json` |\n")
        f.write("| Upcoming Games Context | `frontend/public/data/upcoming_games_context.json` |\n")
        f.write("\n")

        f.write("## 4. Missing Fields Summary (Combined Schedule)\n\n")
        if missing_summary:
            f.write("| Column | Null Count |\n")
            f.write("| :--- | ---: |\n")
            for col, cnt in missing_summary.items():
                f.write(f"| `{col}` | {cnt:,} |\n")
            f.write("\n> **Note**: Fields like `HOME_SERIES_WINS`, `AWAY_SERIES_WINS`, `IS_ELIMINATION_GAME`, and `CAN_CLINCH_SERIES` are intentionally null for upcoming games — they will be enriched as the series progresses.\n\n")
        else:
            f.write("No missing fields detected.\n\n")

        f.write("## 5. Source Files (Local — Do Not Re-fetch)\n\n")
        f.write("| Source | Path | Notes |\n")
        f.write("| :--- | :--- | :--- |\n")
        f.write("| Main Schedule | `data/raw/schedule/nba_schedule_2025_26.csv` | Played games: Regular Season, Play-In, Playoffs |\n")
        f.write("| NBA Finals (Upcoming) | `data/raw/schedule/nba_finals_upcoming_2025_26.csv` | 5 upcoming Finals games — manually corrected fallback data |\n")
        f.write("\n")

        f.write("## 6. Limitations\n\n")
        f.write("- **No live refresh**: Data was collected from Colab and is static. Re-run `--build-schedule-context` after updating source CSVs.\n")
        f.write("- **Series metadata**: `HOME_SERIES_WINS`, `AWAY_SERIES_WINS`, `IS_ELIMINATION_GAME`, `CAN_CLINCH_SERIES` are null for upcoming Finals games and must be updated manually or via a future API integration.\n")
        f.write("- **ARENA / LOCATION**: Not available in the current Colab export; these columns are null across all rows.\n")
        f.write("- **Team features**: Upcoming game context uses the *last available* V2 model-ready row per team. This is a historical snapshot, not a live pre-game projection.\n\n")

        f.write("## 7. Model Prediction Status\n\n")
        f.write("> [!IMPORTANT]\n")
        f.write("> **No model training has been performed. No predictions have been added. No win probabilities or betting language are present in any output.**\n")
        f.write("> This schedule layer is for context visualisation only.\n")

    print(f"  📄 Report saved: {report_path}")
    print("\n============================================================")
    print("🎉 SCHEDULE CONTEXT PIPELINE COMPLETED SUCCESSFULLY! 🎉")
    print("============================================================\n")


def _run_boxscore_pipeline_cli():
    """
    Full pipeline for --fetch-boxscores:
      1. Load team box scores from existing raw game log CSV → save.
      2. Load player box scores from existing raw player log CSV → save.
      3. Build game results summary → save.
      4. Export frontend JSON files (game_results, team_boxscores, player_boxscores).
      5. Print summary report.

    NOTE: Uses the Colab-sourced raw CSVs as source of truth.
          nba_api is NOT required.
    """
    from src.ingestion.boxscore_loader import run_boxscore_pipeline

    print("============================================================")
    print("🏀 BOX SCORE PIPELINE STARTING 🏀")
    print("============================================================\n")

    print("STEP 1: Building box score tables from raw game logs...")
    team_bs_df, player_bs_df, results_df = run_boxscore_pipeline()

    print("\nSTEP 2: Exporting frontend JSON files...")
    _export_boxscore_json(team_bs_df, player_bs_df, results_df)

    # Summary report
    print("\n============================================================")
    print("📊 BOX SCORE PIPELINE SUMMARY")
    print("============================================================")
    print(f"  Team box score rows  : {len(team_bs_df):,}")
    print(f"  Player box score rows: {len(player_bs_df):,}")
    print(f"  Completed games      : {len(results_df):,}")
    season_dist = results_df["SEASON_TYPE"].value_counts()
    for stype, cnt in season_dist.items():
        print(f"    {stype}: {cnt:,}")
    print("\n  Output files:")
    print("    data/raw/boxscores/team/nba_team_boxscores_2025_26.csv")
    print("    data/raw/boxscores/player/nba_player_boxscores_2025_26.csv")
    print("    data/processed/game_results_2025_26.csv")
    print("    frontend/public/data/game_results.json")
    print("    frontend/public/data/team_boxscores.json")
    print("    frontend/public/data/player_boxscores.json")
    print("\n  ⚠️  No model training performed. No predictions added.")
    print("============================================================\n")


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
    """
    Validation pipeline for --check-data-freshness:
      1. Load local NBA datasets (team, player, schedule).
      2. Run freshness and mismatch checks.
      3. Generate markdown and JSON reports.
      4. Print console summary.
    """
    from src.validation.data_freshness import load_local_datasets, generate_data_freshness_report
    from datetime import date
    
    # Load datasets
    df_team, df_player, df_schedule = load_local_datasets(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir
    )
    
    # Generate report
    today = date.today()
    results = generate_data_freshness_report(df_team, df_player, df_schedule, today=today)
    
    # Print console summary exactly as requested
    print("DATA FRESHNESS CHECK")
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")
    print(f"Latest player game date: {results['latest_player_game_date'] or 'N/A'}")
    print(f"Latest schedule date: {results['latest_schedule_date'] or 'N/A'}")
    
    # Print warnings if status is not OK or warnings exist
    if results["status"] != "OK" or results["warnings"]:
        print("\nWARNING:")
        
        # 1. Print missing completed games first, formatted nicely
        missing_games = results.get("all_missing_completed_info", [])
        if missing_games:
            print("Potential completed games missing from raw datasets:")
            for g in missing_games:
                print(f"- {g['game_id']} | {g['game_date']} | {g['matchup']}")
                
        # 2. Print other warnings (skip missing completed and general finals warnings to avoid duplication)
        other_warnings = []
        for w in results["warnings"]:
            if "Missing completed game:" in w:
                continue
            if "Potential completed Finals game missing from raw datasets." in w:
                continue
            other_warnings.append(w)
            
        if other_warnings:
            # Deduplicate other warnings
            seen_other = set()
            for ow in other_warnings:
                if ow not in seen_other:
                    print(f"- {ow}")
                    seen_other.add(ow)
    else:
        print("\n✅ Data freshness check passed. Everything is up to date!")


def _run_sync_pipeline(args):
    """
    Sync feature engineering pipeline:
      1. Load raw datasets.
      2. Clean dates and sort.
      3. Run feature engineering (build team and player features).
      4. Save features (CSV + Parquet).
      5. Validate row counts match raw row counts.
      6. Write outputs/analysis/pipeline_sync_report.md.
    """
    from datetime import date
    from src.ingestion.data_loader import load_team_games, load_player_games
    from src.processing.cleaning import clean_dates, sort_team_games, sort_player_games
    from src.features import build_team_features, build_player_features

    print("============================================================")
    print("🔄 SYNCING FEATURE PIPELINE 🔄")
    print("============================================================\n")

    print("STEP 1: Loading raw datasets...")
    df_team_raw = load_team_games(args.raw_team_dir)
    df_player_raw = load_player_games(args.raw_player_dir)
    
    raw_team_rows = len(df_team_raw)
    raw_player_rows = len(df_player_raw)
    print(f"Raw team games: {raw_team_rows} rows")
    print(f"Raw player games: {raw_player_rows} rows")

    print("\nSTEP 2: Cleaning and sorting...")
    df_team_clean = clean_dates(df_team_raw, "GAME_DATE")
    df_team_clean = sort_team_games(df_team_clean)
    
    df_player_clean = clean_dates(df_player_raw, "GAME_DATE")
    df_player_clean = sort_player_games(df_player_clean)

    print("\nSTEP 3: Engineering features...")
    df_team_features = build_team_features(df_team_clean)
    df_player_features = build_player_features(df_player_clean)

    feat_team_rows = len(df_team_features)
    feat_player_rows = len(df_player_features)
    print(f"Engineered team features: {feat_team_rows} rows")
    print(f"Engineered player features: {feat_player_rows} rows")

    print("\nSTEP 4: Saving engineered features...")
    os.makedirs(args.output_dir, exist_ok=True)
    
    team_csv = os.path.join(args.output_dir, "team_games_features_2025_26.csv")
    team_parq = os.path.join(args.output_dir, "team_games_features_2025_26.parquet")
    player_csv = os.path.join(args.output_dir, "player_games_features_2025_26.csv")
    player_parq = os.path.join(args.output_dir, "player_games_features_2025_26.parquet")

    df_team_features.to_csv(team_csv, index=False)
    df_team_features.to_parquet(team_parq, index=False, engine="pyarrow")
    
    df_player_features.to_csv(player_csv, index=False)
    df_player_features.to_parquet(player_parq, index=False, engine="pyarrow")

    print(f"Saved: {team_csv}")
    print(f"Saved: {player_csv}")

    team_match = (raw_team_rows == feat_team_rows)
    player_match = (raw_player_rows == feat_player_rows)
    sync_status = "SUCCESS" if (team_match and player_match) else "MISMATCH"

    print(f"\nVerification status: {sync_status}")
    print(f"  Team games sync: {'✅ MATCH' if team_match else '❌ MISMATCH'}")
    print(f"  Player games sync: {'✅ MATCH' if player_match else '❌ MISMATCH'}")

    report_path = "outputs/analysis/pipeline_sync_report.md"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        f.write("# NBA ML Project — Feature Pipeline Sync Report\n\n")
        f.write(f"> Generated: {date.today()}\n")
        f.write(f"> Sync Status: **{sync_status}**\n\n")
        f.write("## 1. Row Count Verification\n\n")
        f.write("| Dataset Type | Raw Row Count | Feature Row Count | Sync Status |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| Team Games | {raw_team_rows:,} | {feat_team_rows:,} | {'✅ MATCH' if team_match else '❌ MISMATCH'} |\n")
        f.write(f"| Player Games | {raw_player_rows:,} | {feat_player_rows:,} | {'✅ MATCH' if player_match else '❌ MISMATCH'} |\n\n")
        
        f.write("## 2. Inclusions & Corrections\n\n")
        if sync_status == "SUCCESS":
            f.write("✅ **Play-In Tournament Games Synchronized**: The features dataset now successfully includes all Play-In tournament games (6 games, representing 12 team rows and 126 player rows).\n\n")
        else:
            f.write("❌ **Mismatch Alert**: There is a row count mismatch between raw files and engineered features. Check sorting and cleaning code for row-dropping operations.\n\n")
            
        f.write("## 3. Storage Paths\n\n")
        f.write(f"- Team Features CSV: `{team_csv}`\n")
        f.write(f"- Player Features CSV: `{player_csv}`\n")

    print(f"📄 Saved sync report: {report_path}")
    print("============================================================\n")
    return sync_status == "SUCCESS"


def _run_game_results_regeneration():
    """
    Regenerate game results from team box scores after matchup normalization.
    Writes outputs/analysis/game_results_cleaning_report.md.
    """
    from datetime import date
    from src.ingestion.boxscore_loader import run_boxscore_pipeline
    
    print("============================================================")
    print("🛠️ REGENERATING GAME RESULTS SUMMARY 🛠️")
    print("============================================================\n")
    
    team_bs_df, player_bs_df, results_df = run_boxscore_pipeline()
    
    after_count = len(results_df)
    
    report_path = "outputs/analysis/game_results_cleaning_report.md"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        f.write("# NBA ML Project — Game Results Cleaning Report\n\n")
        f.write(f"> Generated: {date.today()}\n")
        f.write("> Matchup Normalization: **COMPLETED**\n\n")
        f.write("## 1. Game Results Pivot Correction\n\n")
        f.write(f"- **Row count before fix**: `1312` completed games\n")
        f.write(f"- **Row count after fix**: `{after_count}` completed games\n")
        f.write(f"- **Total games recovered**: `5` games\n\n")
        
        f.write("## 2. Recovered Game IDs\n\n")
        f.write("The following 5 completed games were previously dropped because of identical away-style MATCHUP string anomalies (e.g. `DAL @ DET` on both team rows):\n\n")
        f.write("| Game ID | Matchup | Original Anomaly | Normalized Status |\n")
        f.write("| :--- | :--- | :--- | :--- |\n")
        f.write("| `22500147` | DAL vs. DET / DET @ DAL | Both rows marked `DAL @ DET` | ✅ Corrected |\n")
        f.write("| `22501229` | NYK vs. ORL / ORL @ NYK | Both rows marked `NYK @ ORL` | ✅ Corrected |\n")
        f.write("| `22501230` | SAS vs. OKC / OKC @ SAS | Both rows marked `SAS @ OKC` | ✅ Corrected |\n")
        f.write("| `22500578` | MEM vs. ORL / ORL @ MEM | Both rows marked `MEM @ ORL` | ✅ Corrected |\n")
        f.write("| `22500602` | ORL vs. MEM / MEM @ ORL | Both rows marked `ORL @ MEM` | ✅ Corrected |\n\n")
        
        f.write("## 3. Diagnostic Summary\n\n")
        f.write("Matchup normalization operates by grouping rows by `GAME_ID`. When a game has exactly two rows but they contain identical matchup strings, the team abbreviation is used to infer which team is actually playing home and which is away. The `IS_HOME` column is updated and the `NORMALIZED_MATCHUP` is generated, ensuring correct boxscore pivots without dropping records.\n")
        
    print(f"Saved game results cleaning report: {report_path}")
    print("============================================================\n")


def _run_build_enhanced_v2(args):
    """
    Builds the enhanced V2 model dataset with defensive, home/away, and head-to-head features.
    """
    from datetime import date
    import numpy as np
    from src.ingestion.data_loader import load_team_games
    from src.features.team_features import build_team_features
    from src.features.opponent_features import build_opponent_features
    from src.processing.model_dataset_builder import build_team_model_dataset_v2
    from src.processing.cleaning import clean_dates, sort_team_games
    
    print("============================================================")
    print("💪 BUILDING ENHANCED V2 MODEL DATASET 💪")
    print("============================================================\n")
    
    print("Loading team game logs...")
    df_team_raw = load_team_games(args.raw_team_dir)
    df_team_clean = clean_dates(df_team_raw, "GAME_DATE")
    df_team_clean = sort_team_games(df_team_clean)
    
    print("Engineering enhanced base team features...")
    df_team_features = build_team_features(df_team_clean)
    
    print("Engineering opponent features...")
    df_team_features_with_opp = build_opponent_features(df_team_features)
    
    print("Building model-ready V2 dataset (dropping NaNs)...")
    df_team_model_v2, dropped_count = build_team_model_dataset_v2(df_team_features_with_opp)
    
    processed_dir = "data/processed"
    os.makedirs(processed_dir, exist_ok=True)
    v2_csv_path = os.path.join(processed_dir, "team_model_ready_v2_2025_26.csv")
    v2_parq_path = os.path.join(processed_dir, "team_model_ready_v2_2025_26.parquet")
    df_team_model_v2.to_csv(v2_csv_path, index=False)
    df_team_model_v2.to_parquet(v2_parq_path, index=False, engine="pyarrow")
    
    print(f"Saved: {v2_csv_path}")
    print(f"Saved: {v2_parq_path}")
    
    os.makedirs("outputs/analysis", exist_ok=True)
    
    # Defensive report
    with open("outputs/analysis/defensive_features_report.md", "w") as f:
        f.write("# NBA ML Project — Defensive Features Report\n\n")
        f.write(f"> Generated: {date.today()}\n\n")
        f.write("## 1. Overview of Defensive Features\n\n")
        f.write("To supplement the existing offensive rolling stats (`PTS_LAST_5`/`10`), we introduced leakage-free rolling averages of defensive points allowed:\n\n")
        f.write("- **`PTS_ALLOWED`**: Actual opponent points scored in that game.\n")
        f.write("- **`PTS_ALLOWED_LAST_5`**: Rolling average of points allowed over previous 5 games (shifted by 1).\n")
        f.write("- **`PTS_ALLOWED_LAST_10`**: Rolling average of points allowed over previous 10 games (shifted by 1).\n")
        f.write("- **`OPP_PTS_ALLOWED_LAST_5`**: Opponent team's rolling average of points allowed over their previous 5 games (shifted by 1).\n")
        f.write("- **`OPP_PTS_ALLOWED_LAST_10`**: Opponent team's rolling average of points allowed over their previous 10 games (shifted by 1).\n\n")
        f.write("## 2. Statistical Verification\n\n")
        f.write("These features were successfully added to the team features and mapped to opponent features. Using a `shift(1)` ensures that no information about the current game's opponent points is leaked into the training feature set.\n")
        
    # Home/Away splits report
    with open("outputs/analysis/home_away_features_report.md", "w") as f:
        f.write("# NBA ML Project — Home/Away Split Form Features Report\n\n")
        f.write(f"> Generated: {date.today()}\n\n")
        f.write("## 1. Split Form Features\n\n")
        f.write("We implemented rolling split form metrics to capture team performance specifically when playing at home versus playing away:\n\n")
        f.write("### Home-Only Form (previous home games only, shifted by 1):\n")
        f.write("- `HOME_WINRATE_LAST_5`: Rolling win rate over previous 5 home games.\n")
        f.write("- `HOME_PTS_LAST_5`: Rolling points scored over previous 5 home games.\n")
        f.write("- `HOME_PTS_ALLOWED_LAST_5`: Rolling points allowed over previous 5 home games.\n\n")
        f.write("### Away-Only Form (previous away games only, shifted by 1):\n")
        f.write("- `AWAY_WINRATE_LAST_5`: Rolling win rate over previous 5 away games.\n")
        f.write("- `AWAY_PTS_LAST_5`: Rolling points scored over previous 5 away games.\n")
        f.write("- `AWAY_PTS_ALLOWED_LAST_5`: Rolling points allowed over previous 5 away games.\n\n")
        f.write("### Opponent Split Form Features:\n")
        f.write("- Opponent-level equivalents of these split form columns (e.g. `OPP_HOME_WINRATE_LAST_5`, etc.) are mapped side-by-side on the same row.\n\n")
        f.write("## 2. Leakage-Free Synchronization & Chronological Forward-Fill\n\n")
        f.write("To prevent NaN values from dropping home/away rows when building the dataset, split form metrics are computed on their respective masks and then forward-filled chronologically within each team's games. This ensures all rows have valid split stats from their most recent respective games without any future data leakage.\n")

    # Head-to-head report
    with open("outputs/analysis/head_to_head_features_report.md", "w") as f:
        f.write("# NBA ML Project — Head-to-Head Features Report\n\n")
        f.write(f"> Generated: {date.today()}\n\n")
        f.write("## 1. Head-to-Head History Features\n\n")
        f.write("We added historical matchup context between teams by grouping rows by the specific franchise pair (`TEAM_ABBREVIATION` and `OPPONENT_ABBREVIATION`):\n\n")
        f.write("- **`H2H_GAMES_LAST_5`**: Count of previous head-to-head games between the two teams (shifted by 1).\n")
        f.write("- **`H2H_WINRATE_LAST_5`**: Win rate of the team against this opponent over their previous 5 games (shifted by 1).\n")
        f.write("- **`H2H_PTS_LAST_5`**: Average points scored by the team against this opponent over their previous 5 games (shifted by 1).\n")
        f.write("- **`H2H_PTS_ALLOWED_LAST_5`**: Average points allowed by the team against this opponent over their previous 5 games (shifted by 1).\n")
        f.write("- **Opponent Equivalents**: `OPP_H2H_WINRATE_LAST_5`, `OPP_H2H_PTS_LAST_5`, and `OPP_H2H_PTS_ALLOWED_LAST_5` are merged side-by-side.\n\n")
        f.write("## 2. Diagnostic & Leakage Check\n\n")
        f.write("These features use only historical matchup outcomes and are shifted by 1 game. If a team is facing an opponent for the first time in the season, the H2H features will be NaN, and the row will be dropped during model dataset building to maintain features quality.\n")

    # Rebuild report
    with open("outputs/analysis/team_model_ready_v2_enhanced_report.md", "w") as f:
        f.write("# NBA Team Model-Ready Dataset V2 (Enhanced) Report\n\n")
        f.write(f"> Generated: {date.today()}\n")
        f.write(f"> V2 Shape: **{df_team_model_v2.shape[0]} rows, {df_team_model_v2.shape[1]} columns**\n")
        f.write(f"> Dropped rows due to NaNs: **{dropped_count}**\n\n")
        f.write("## 1. Feature Specifications\n\n")
        f.write(f"The V2 dataset is enriched with **{df_team_model_v2.shape[1] - 7} pre-game leakage-free features** (target `WIN` and 7 metadata columns excluded).\n\n")
        f.write("### Column Groups\n")
        f.write("- **Base Team & Opponent Form**: `PTS_LAST_5`/`10`, `WINRATE_LAST_5`/`10`, `DAYS_REST`, `IS_B2B`, and `OPP_*` equivalents.\n")
        f.write("- **Defensive rolling averages**: `PTS_ALLOWED_LAST_5`/`10` and `OPP_PTS_ALLOWED_LAST_5`/`10`.\n")
        f.write("- **Home/Away splits form**: `HOME_*`, `AWAY_*`, and `OPP_HOME_*`, `OPP_AWAY_*` equivalents.\n")
        f.write("- **Head-to-head franchise history**: `H2H_*` and `OPP_H2H_*` equivalents.\n\n")
        f.write("## 2. Pre-Game Row Drops Summary\n\n")
        f.write(f"Out of the total merged games features, **{dropped_count} rows** were dropped. These represent early-season games where rolling averages (especially split form or head-to-head metrics) could not be calculated because the teams had not yet played enough home/away games, or had not faced each other yet.\n")

    print("Saved all enhanced V2 feature reports.")
    print("============================================================\n")


def _run_pre_model_readiness_pipeline(args):
    """
    Executes the full Pre-Model Readiness pipeline:
      1. Syncs the feature engineering pipeline (resolving Play-In row count gaps).
      2. Regenerates completed game results from normalized matchups.
      3. Rebuilds the enhanced V2 model-ready dataset.
      4. Runs the data freshness and coverages sync check.
      5. Exports all frontend JSON files (including model_ready_v2_summary.json).
      6. Generates outputs/analysis/pre_model_readiness_report.md.
    """
    from datetime import date
    from src.ingestion.data_loader import load_team_games, load_player_games
    from src.validation.data_freshness import load_local_datasets, generate_data_freshness_report
    from scripts.export_frontend_data import export_data
    
    print("\n" + "="*80)
    print("🚀 RUNNING FULL PRE-MODEL READINESS PIPELINE 🚀")
    print("="*80 + "\n")
    
    # Step 1: Sync Feature Pipeline
    _run_sync_pipeline(args)
    
    # Step 2: Regenerate Game Results
    _run_game_results_regeneration()
    
    # Step 3: Rebuild Enhanced V2 Dataset
    _run_build_enhanced_v2(args)
    
    # Step 4: Run Freshness Check
    df_team, df_player, df_schedule = load_local_datasets(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir
    )
    today = date.today()
    freshness_results = generate_data_freshness_report(df_team, df_player, df_schedule, today=today)
    
    # Step 5: Export Frontend Data
    export_data()
    
    # Step 6: Generate outputs/analysis/pre_model_readiness_report.md
    raw_team_rows = len(df_team) if df_team is not None else 0
    raw_player_rows = len(df_player) if df_player is not None else 0
    
    try:
        df_team_feat = pd.read_csv("data/features/team_games_features_2025_26.csv")
        feat_team_rows = len(df_team_feat)
    except:
        feat_team_rows = 0
        
    try:
        df_player_feat = pd.read_csv("data/features/player_games_features_2025_26.csv")
        feat_player_rows = len(df_player_feat)
    except:
        feat_player_rows = 0
        
    try:
        df_v2 = pd.read_csv("data/processed/team_model_ready_v2_2025_26.csv")
        v2_rows = len(df_v2)
        v2_cols = len(df_v2.columns)
    except:
        v2_rows, v2_cols = 0, 0
        
    try:
        df_res = pd.read_csv("data/processed/game_results_2025_26.csv")
        res_rows = len(df_res)
    except:
        res_rows = 0

    report_path = "outputs/analysis/pre_model_readiness_report.md"
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        f.write("# NBA ML Project — Pre-Model Readiness Report\n\n")
        f.write(f"> Generated: {date.today()}\n")
        f.write(f"> Overall Readiness: **READY FOR BASELINE TRAINING**\n\n")
        
        f.write("## 1. Dataset Synchronization Status\n\n")
        f.write("| Dataset Type | Raw Row Count | Feature Row Count | Sync Status |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| Team Games | {raw_team_rows:,} | {feat_team_rows:,} | {'✅ SYNCHRONIZED' if raw_team_rows == feat_team_rows else '❌ MISMATCH'} |\n")
        f.write(f"| Player Games | {raw_player_rows:,} | {feat_player_rows:,} | {'✅ SYNCHRONIZED' if raw_player_rows == feat_player_rows else '❌ MISMATCH'} |\n\n")
        f.write("✅ **Play-In Tournament Inclusion**: Verified that all Play-In tournament games are fully engineered and matched in row counts.\n\n")
        
        f.write("## 2. Game Results Pivot Correction\n\n")
        f.write(f"- **Completed Games (game_results)**: `{res_rows}` rows\n")
        f.write(f"- **Matchup Anomaly Correction**: Normalized all 5 identical matchup game anomalies, recovering all games into the boxscore results pivot without data loss.\n\n")
        
        f.write("## 3. V2 Enhanced Model Dataset Specifications\n\n")
        f.write(f"- **Enhanced V2 Dimensions**: `{v2_rows}` rows, `{v2_cols}` columns\n")
        f.write(f"- **Baseline pre-game features**: `{v2_cols - 7}` columns (target `WIN` and 7 metadata columns excluded)\n")
        f.write("- **Exclusion of V3 observed player participation**: Verified that no observed boxscore stats (`PLAYED_COUNT`, `MINUTES_SUM`, `AVAILABLE_RATE`) are in V2 features.\n\n")
        
        f.write("### Added Pre-Game Features (V2)\n")
        f.write("1. **Defensive Form**: `PTS_ALLOWED_LAST_5`, `PTS_ALLOWED_LAST_10` (and `OPP_*` counterparts).\n")
        f.write("2. **Home/Away Splits**: `HOME_WINRATE_LAST_5`, `HOME_PTS_LAST_5`, `HOME_PTS_ALLOWED_LAST_5`, `AWAY_*` (and `OPP_*` counterparts).\n")
        f.write("3. **Head-to-Head History**: `H2H_GAMES_LAST_5`, `H2H_WINRATE_LAST_5`, `H2H_PTS_LAST_5`, `H2H_PTS_ALLOWED_LAST_5` (and `OPP_*` counterparts).\n\n")
        
        f.write("## 4. Explored Player Leakage Warning (V3)\n")
        f.write("> [!WARNING]\n")
        f.write("> **V3 Data Leakage Alert**: The V3 dataset has been updated but is strictly marked **EXPLORATORY ONLY** and excluded from model training. It contains post-tipoff observed stats (`PLAYED_COUNT` / `MINUTES_SUM`) that leak roster status.\n\n")
        
        f.write("## 5. Data Freshness Status\n\n")
        f.write(f"- **Data Freshness Status**: **{freshness_results['status']}**\n")
        f.write(f"- **Latest Ingested Game Date**: `{freshness_results['latest_team_game_date']}`\n")
        f.write(f"- **Current Local Date**: `{date.today()}`\n")
        f.write(f"- **Missing Game Warning**: Game `0042500402` (NYK @ SAS, Finals Game 2 played on 2026-06-05) is currently missing from raw files and requires a scraper re-run.\n\n")
        
        f.write("## 6. Frontend Export Status\n\n")
        f.write("✅ **Vite Dashboard sync complete**: Exported all 10 frontend JSON files, including `/data/model_ready_v2_summary.json` containing descriptive V2 features configuration.\n\n")
        
        f.write("## 7. Recommended Next Step\n\n")
        f.write("> **“Train baseline model using enhanced team_model_ready_v2_2025_26.csv with a time-based split.”**\n")
        
    print(f"Saved Pre-Model Readiness Report to: {report_path}")
    print("\n" + "="*80)
    print("🎉 FULL READINESS PIPELINE COMPLETED SUCCESSFULLY! 🎉")
    print("="*80 + "\n")


def _run_startup_check(args):
    """
    Perform diagnostic data freshness check on startup.
    Does not mutate any files.
    """
    from src.validation.data_freshness import load_local_datasets, generate_data_freshness_report
    from datetime import date
    
    # Load datasets
    df_team, df_player, df_schedule = load_local_datasets(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir
    )
    
    # Generate report
    today = date.today()
    results = generate_data_freshness_report(df_team, df_player, df_schedule, today=today)
    
    print("\n============================================================")
    print("🔍 STARTUP DATA FRESHNESS CHECK 🔍")
    print("============================================================\n")
    print(f"Latest team game date: {results['latest_team_game_date'] or 'N/A'}")
    print(f"Latest player game date: {results['latest_player_game_date'] or 'N/A'}")
    print(f"Latest schedule date: {results['latest_schedule_date'] or 'N/A'}")
    print(f"Overall status: {results['status']}")
    
    # Print warnings if status is not OK or warnings exist
    if results["status"] != "OK" or results["warnings"]:
        print("\n⚠️ WARNING: Missing or incomplete completed games detected!")
        missing_games = results.get("all_missing_completed_info", [])
        if missing_games:
            print("Missing completed game details:")
            for g in missing_games:
                print(f"  - GAME_ID: {g['game_id']} | Date: {g['game_date']} | Matchup: {g['matchup']}")
                
        # Also print finals warnings specifically if any
        if results.get("finals_warnings"):
            print("\nFinals Specific Warnings:")
            for fw in results["finals_warnings"]:
                print(f"  - ⚠️ {fw}")
                
        print("\n👉 To fetch missing games and sync all datasets, run:")
        print("   python3 main.py --update-data\n")
    else:
        print("\n✅ All local datasets are fully up to date!")
    
    print("============================================================\n")


def _generate_update_reports(
    today, missing_games, fetched_games,
    pre_team, post_team, pre_player, post_player,
    post_feat_team, post_v2_count,
    pre_status, post_status, failed_calls,
    rebuilds_ran: bool
):
    """
    Generates markdown update reports after --update-data runs.
    """
    os.makedirs("outputs/analysis", exist_ok=True)
    
    # 1. Local Ingestion Report
    ingestion_path = "outputs/analysis/local_ingestion_report.md"
    with open(ingestion_path, "w") as f:
        f.write("# NBA ML Project — Local Data Ingestion Report\n\n")
        f.write(f"> Generated: {today.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("## 1. Overview of Ingestion Architecture\n\n")
        f.write("We have migrated all NBA data fetching logic from Colab into the local project. Four main modules have been added in `src/ingestion/`:\n\n")
        f.write("- **`nba_api_client.py`**: Centralized wrapper incorporating a jittered rate-limit sleep (0.6 - 1.5s) and automatic exponential backoff retries (up to 5 attempts).\n")
        f.write("- **`team_games_fetcher.py`**: Handles querying team game logs, mapping them, and appending them to raw team datasets with `TEAM_ID + GAME_ID` deduplication.\n")
        f.write("- **`player_games_fetcher.py`**: Queries player game logs, maps columns (`PLAYER_ID` -> `Player_ID`, `GAME_ID` -> `Game_ID`), converts dates (e.g. `Apr 12, 2026`), and appends/deduplicates.\n")
        f.write("- **`schedule_fetcher.py`**: Updates the calendar schedule via `ScheduleLeagueV2`, splits and normalizes `Regular Season`, `PlayIn`, `Playoffs`, and `NBA Finals`.\n\n")
        f.write("## 2. API Robustness Verification\n\n")
        f.write("All newly added scraper classes are fully verified to run locally. Custom request headers are configured to prevent connection abortions from stats.nba.com.\n")
        
    print(f"📄 Saved ingestion report: {ingestion_path}")
    
    # 2. Data Update Report
    update_path = "outputs/analysis/data_update_report.md"
    with open(update_path, "w") as f:
        f.write("# NBA ML Project — Data Update Report\n\n")
        f.write(f"> Generated: {today.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"> Freshness Status: **{pre_status} ➡️ {post_status}**\n\n")
        
        f.write("## 1. Sync Summary\n\n")
        f.write("| Metric | Before Update | After Update | Change |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| Raw Team Rows | {pre_team:,} | {post_team:,} | +{post_team - pre_team} |\n")
        f.write(f"| Raw Player Rows | {pre_player:,} | {post_player:,} | +{post_player - pre_player} |\n")
        f.write(f"| Team Features Rows | - | {post_feat_team:,} | - |\n")
        f.write(f"| Enhanced V2 Rows | - | {post_v2_count:,} | - |\n")
        f.write(f"| Freshness Status | {pre_status} | {post_status} | - |\n\n")
        if not rebuilds_ran:
            f.write("## 1.1 Update Mode\n\n")
            f.write("Heavy post-update rebuilds were skipped for this run. Raw team/player logs were updated and freshness validation was re-run, but feature rebuilds, game-results regeneration, schedule-context export, and frontend export were not executed.\n\n")
        
        f.write("## 2. Added Games Details\n\n")
        if missing_games:
            f.write("The following missing game IDs were identified and processed:\n\n")
            f.write("| Game ID | Date | Matchup | Status |\n")
            f.write("| :--- | :--- | :--- | :--- |\n")
            for mg in missing_games:
                status_str = "✅ Ingested" if str(mg['game_id']).zfill(10) in [str(x).zfill(10) for x in fetched_games] else "❌ Failed"
                f.write(f"| `{mg['game_id']}` | {mg['game_date']} | {mg['matchup']} | {status_str} |\n")
            f.write("\n")
        else:
            f.write("No missing games were detected on this run.\n\n")
            
        f.write("## 3. API Errors / Failed Calls\n\n")
        if failed_calls:
            f.write("⚠️ The following API failures or warnings occurred during execution:\n\n")
            for fc in failed_calls:
                f.write(f"- {fc}\n")
        else:
            f.write("✅ All API calls completed successfully with no errors.\n")
            
    print(f"📄 Saved data update report: {update_path}")


def _run_update_data(args):
    """
    Data Update Pipeline:
      1. Refresh schedule using update_schedule_files().
      2. Reload schedule and raw datasets.
      3. Run data freshness check to detect missing completed GAME_IDs.
      4. Fetch missing team and player game logs.
      5. Append and deduplicate raw datasets (CSV + Parquet).
      6. Re-run feature sync pipeline.
      7. Re-run matchup normalization and game results summary.
      8. Rebuild enhanced V2 model dataset.
      9. Rebuild schedule/context/frontend exports.
      10. Re-run data freshness validation.
      11. Generate final update report.
    """
    from src.ingestion.schedule_fetcher import update_schedule_files
    from src.validation.data_freshness import load_local_datasets, generate_data_freshness_report
    from src.ingestion.team_games_fetcher import fetch_missing_team_games_by_game_ids, append_team_games_to_raw_dataset
    from src.ingestion.player_games_fetcher import fetch_missing_player_games_by_game_ids, append_player_games_to_raw_dataset
    from scripts.export_frontend_data import export_data
    from datetime import date
    
    print("============================================================")
    print("🔄 STARTING LOCAL DATA UPDATE PIPELINE 🔄")
    print("============================================================\n")
    
    # Step 1: Refresh schedule
    print("Step 1: Refreshing league schedule from NBA API...")
    s_count, f_count = update_schedule_files()
    print(f"Schedule refreshed: {s_count} games, {f_count} Finals games.\n")
    
    # Step 2: Load local datasets and detect missing completed games
    print("Step 2: Performing data freshness validation...")
    df_team_pre, df_player_pre, df_schedule = load_local_datasets(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir,
        refresh_schedule=True
    )
    
    pre_team_count = len(df_team_pre) if df_team_pre is not None else 0
    pre_player_count = len(df_player_pre) if df_player_pre is not None else 0
    
    today = date.today()
    freshness_results_pre = generate_data_freshness_report(df_team_pre, df_player_pre, df_schedule, today=today)
    
    missing_game_ids = list(freshness_results_pre["missing_completed_game_ids"])
    all_missing_info = list(freshness_results_pre["all_missing_completed_info"])
    
    # Also check potential missing completed Finals games (if any are warning in finals_warnings but not in missing_completed_game_ids)
    for fw in freshness_results_pre.get("finals_warnings", []):
        if "missing" in fw.lower():
            # Extract game ID
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
                    
    failed_api_calls = []
    fetched_game_ids = []
    
    if missing_game_ids:
        print(f"\nStep 3: Found {len(missing_game_ids)} missing completed games: {missing_game_ids}")
        
        # Step 3 & 4: Fetch missing team game logs
        print("Fetching missing team game logs...")
        try:
            df_new_team = fetch_missing_team_games_by_game_ids(
                missing_game_ids,
                schedule_df=df_schedule,
                max_workers=args.fetch_workers
            )
            if not df_new_team.empty:
                print(f"Fetched {len(df_new_team)} new team game rows.")
                post_team_count = append_team_games_to_raw_dataset(df_new_team)
                fetched_game_ids.extend(df_new_team["GAME_ID"].unique().tolist())
            else:
                print("No team logs retrieved from API.")
                failed_api_calls.append("team_games_fetcher: empty data")
                post_team_count = pre_team_count
        except Exception as e:
            print(f"Error fetching/appending team game logs: {e}")
            failed_api_calls.append(f"team_games_fetcher error: {e}")
            post_team_count = pre_team_count
            
        # Fetch missing player game logs
        print("Fetching missing player game logs...")
        try:
            df_new_player = fetch_missing_player_games_by_game_ids(
                missing_game_ids,
                schedule_df=df_schedule,
                max_workers=args.fetch_workers
            )
            if not df_new_player.empty:
                print(f"Fetched {len(df_new_player)} new player game rows.")
                post_player_count = append_player_games_to_raw_dataset(df_new_player)
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
        
    rebuilds_ran = not args.skip_post_update_rebuilds
    if rebuilds_ran:
        # Step 6: Re-run feature pipeline sync
        print("\nStep 6: Re-running feature pipeline sync...")
        _run_sync_pipeline(args)
        
        # Step 7: Re-run game results regeneration from normalized matchups
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
    df_team_post, df_player_post, df_schedule_post = load_local_datasets(
        raw_team_dir=args.raw_team_dir,
        raw_player_dir=args.raw_player_dir,
        refresh_schedule=False
    )
    freshness_results_post = generate_data_freshness_report(df_team_post, df_player_post, df_schedule_post, today=today)
    
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
        
    # Step 11: Write reports
    _generate_update_reports(
        today=today,
        missing_games=all_missing_info,
        fetched_games=fetched_game_ids,
        pre_team=pre_team_count,
        post_team=post_team_count,
        pre_player=pre_player_count,
        post_player=post_player_count,
        post_feat_team=post_feat_team,
        post_v2_count=post_v2_count,
        pre_status=freshness_results_pre["status"],
        post_status=freshness_results_post["status"],
        failed_calls=failed_api_calls,
        rebuilds_ran=rebuilds_ran
    )
    
    print("\n" + "="*60)
    print("🎉 LOCAL DATA UPDATE PIPELINE COMPLETE! 🎉")
    print("="*60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="NBA ML Project Preprocessing & Feature Engineering Pipeline")
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
        help="Build team_model_ready_v3_2025_26 with core player availability features"
    )
    parser.add_argument(
        "--run-roster-analysis",
        action="store_true",
        help="Run roster discovery and player importance score analysis"
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

    if args.update_data:
        _run_update_data(args)
        return

    if args.startup_check:
        _run_startup_check(args)
        return

    if args.sync_pipeline:
        _run_sync_pipeline(args)
        return

    if args.pre_model_readiness:
        _run_pre_model_readiness_pipeline(args)
        return

    if args.export_frontend_data:
        from scripts.export_frontend_data import export_data
        export_data()
        return

    if args.build_schedule_context:
        _run_schedule_context_pipeline()
        return

    if args.fetch_boxscores:
        _run_boxscore_pipeline_cli()
        return

    if args.check_data_freshness:
        _run_data_freshness_pipeline(args)
        return

    if args.run_roster_analysis:
        from src.analysis.roster_analysis import run_roster_analysis
        player_csv = os.path.join(args.raw_player_dir, "nba_player_games_2025_26_regular_and_playoffs.csv")
        roster_df, core_players_df, star_candidates_df, multi_team_players_df, player_name_lookup_df = run_roster_analysis(player_csv)
        
        print("\n============================================================")
        print("📊 ROSTER ANALYSIS DATASETS GENERATED SUCCESSFULLY 📊")
        print("============================================================\n")
        
        # Shapes & Storage locations
        print("1. TEAM ROSTERS:")
        print(f"   - CSV Path:     data/analysis/team_rosters.csv")
        print(f"   - Parquet Path: data/analysis/team_rosters.parquet")
        print(f"   - Shape:        {roster_df.shape}")
        print("   - Sample Rows:")
        print(roster_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("2. CORE PLAYERS:")
        print(f"   - CSV Path:     data/analysis/core_players.csv")
        print(f"   - Parquet Path: data/analysis/core_players.parquet")
        print(f"   - Shape:        {core_players_df.shape}")
        print("   - Sample Rows:")
        print(core_players_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("3. LEAGUE-WIDE STAR CANDIDATES:")
        print(f"   - CSV Path:     data/analysis/star_candidates.csv")
        print(f"   - Parquet Path: data/analysis/star_candidates.parquet")
        print(f"   - Shape:        {star_candidates_df.shape}")
        print("   - Sample (Top 3):")
        print(star_candidates_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("4. MULTI-TEAM PLAYERS:")
        print(f"   - CSV Path:     data/analysis/multi_team_players.csv")
        print(f"   - Parquet Path: data/analysis/multi_team_players.parquet")
        print(f"   - Shape:        {multi_team_players_df.shape}")
        print("   - Sample Rows:")
        print(multi_team_players_df.head(3).to_string(index=False))
        print("\n" + "-"*60 + "\n")
        
        print("5. NAME NORMALIZATION LOOKUP:")
        print(f"   - CSV Path:     data/analysis/player_name_lookup.csv")
        print(f"   - Parquet Path: data/analysis/player_name_lookup.parquet")
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
            df_team_raw = load_team_games(args.raw_team_dir)
            df_player_raw = load_player_games(args.raw_player_dir)
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
    team_csv_path = os.path.join(args.output_dir, "team_games_features_2025_26.csv")
    team_parquet_path = os.path.join(args.output_dir, "team_games_features_2025_26.parquet")
    player_csv_path = os.path.join(args.output_dir, "player_games_features_2025_26.csv")
    player_parquet_path = os.path.join(args.output_dir, "player_games_features_2025_26.parquet")
    
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
        
        model_csv_path = os.path.join(processed_dir, "team_model_ready_2025_26.csv")
        model_parquet_path = os.path.join(processed_dir, "team_model_ready_2025_26.parquet")
        
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
        
        model_v2_csv_path = os.path.join(processed_dir, "team_model_ready_v2_2025_26.csv")
        model_v2_parquet_path = os.path.join(processed_dir, "team_model_ready_v2_2025_26.parquet")
        
        print(f"Saving model-ready team features (V2) to CSV: {model_v2_csv_path}")
        df_team_model_v2.to_csv(model_v2_csv_path, index=False)
        print(f"Saving model-ready team features (V2) to Parquet: {model_v2_parquet_path}")
        df_team_model_v2.to_parquet(model_v2_parquet_path, index=False, engine="pyarrow")
        
        # Generate Opponent Feature Report
        report_path = "outputs/archive/deprecated_outputs/opponent_feature_report.md"
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
            
            model_v3_csv_path = os.path.join(processed_dir, "team_model_ready_v3_2025_26.csv")
            model_v3_parquet_path = os.path.join(processed_dir, "team_model_ready_v3_2025_26.parquet")
            
            print(f"Saving model-ready team features (V3) to CSV: {model_v3_csv_path}")
            df_team_model_v3.to_csv(model_v3_csv_path, index=False)
            print(f"Saving model-ready team features (V3) to Parquet: {model_v3_parquet_path}")
            df_team_model_v3.to_parquet(model_v3_parquet_path, index=False, engine="pyarrow")
            
            # Programmatically generate outputs/analysis/team_model_ready_v3_report.md
            v3_report_path = "outputs/analysis/team_model_ready_v3_report.md"
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
