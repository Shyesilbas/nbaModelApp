import json
import os
from pathlib import Path
import pandas as pd

# --- Configuration ---
INPUT_FILE = Path("data/experimental/team_win_model_ready_v2_2024_25.csv")
OUTPUT_DIR = Path("data/processed/win")
REPORT_DIR = Path("reports/audits")
REPORT_FILE = REPORT_DIR / "win_dataset_cleaning_2024_25_report.md"

# --- Column Definitions ---
LEAKAGE_COLS = [
    "WL", "MIN", "PTS", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
    "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", "STL", "BLK",
    "TOV", "PF", "PLUS_MINUS"
]
METADATA_COLS = [
    "SEASON_ID", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID",
    "GAME_DATE", "MATCHUP", "SEASON_TYPE", "OPPONENT_ABBREVIATION"
]
TARGET_COL = "WIN"
FORBIDDEN_PLAYER_COLS = [
    "PLAYER_ID", "PLAYER_NAME", "IS_CORE", "EXPECTED_POINTS", "EXPECTED_PRA"
]
SAFE_FEATURES = [
    'IS_HOME', 'IS_PLAYOFF', 'DAYS_REST', 'IS_B2B', 'PTS_LAST_5', 'PTS_LAST_10',
    'WINRATE_LAST_5', 'WINRATE_LAST_10', 'PTS_ALLOWED', 'PTS_ALLOWED_LAST_5',
    'PTS_ALLOWED_LAST_10', 'HOME_WINRATE_LAST_5', 'HOME_PTS_LAST_5',
    'HOME_PTS_ALLOWED_LAST_5', 'AWAY_WINRATE_LAST_5', 'AWAY_PTS_LAST_5',
    'AWAY_PTS_ALLOWED_LAST_5', 'H2H_GAMES_LAST_5', 'H2H_WINRATE_LAST_5',
    'H2H_PTS_LAST_5', 'H2H_PTS_ALLOWED_LAST_5',
    'HOME_CORE_PLAYERS_AVAILABLE_COUNT', 'HOME_CORE_PLAYERS_MISSING_COUNT',
    'HOME_TOP1_AVAILABLE', 'HOME_TOP2_AVAILABLE', 'HOME_TOP3_AVAILABLE',
    'HOME_CORE_EXPECTED_MIN_SUM', 'HOME_TOP3_EXPECTED_MIN_SUM',
    'HOME_CORE_MINUTES_SHARE', 'HOME_CORE_EXPECTED_PTS_SUM',
    'HOME_CORE_EXPECTED_AST_SUM', 'HOME_CORE_EXPECTED_REB_SUM',
    'HOME_CORE_EXPECTED_PRA_SUM', 'HOME_TOP3_EXPECTED_PTS_SUM',
    'HOME_TOP3_EXPECTED_AST_SUM', 'HOME_TOP3_EXPECTED_REB_SUM',
    'HOME_TOP3_EXPECTED_PRA_SUM', 'HOME_MISSING_CORE_EXPECTED_MIN',
    'HOME_MISSING_CORE_EXPECTED_PTS', 'HOME_MISSING_CORE_EXPECTED_AST',
    'HOME_MISSING_CORE_EXPECTED_REB', 'HOME_MISSING_CORE_EXPECTED_PRA',
    'AWAY_CORE_PLAYERS_AVAILABLE_COUNT', 'AWAY_CORE_PLAYERS_MISSING_COUNT',
    'AWAY_TOP1_AVAILABLE', 'AWAY_TOP2_AVAILABLE', 'AWAY_TOP3_AVAILABLE',
    'AWAY_CORE_EXPECTED_MIN_SUM', 'AWAY_TOP3_EXPECTED_MIN_SUM',
    'AWAY_CORE_MINUTES_SHARE', 'AWAY_CORE_EXPECTED_PTS_SUM',
    'AWAY_CORE_EXPECTED_AST_SUM', 'AWAY_CORE_EXPECTED_REB_SUM',
    'AWAY_CORE_EXPECTED_PRA_SUM', 'AWAY_TOP3_EXPECTED_PTS_SUM',
    'AWAY_TOP3_EXPECTED_AST_SUM', 'AWAY_TOP3_EXPECTED_REB_SUM',
    'AWAY_TOP3_EXPECTED_PRA_SUM', 'AWAY_MISSING_CORE_EXPECTED_MIN',
    'AWAY_MISSING_CORE_EXPECTED_PTS', 'AWAY_MISSING_CORE_EXPECTED_AST',
    'AWAY_MISSING_CORE_EXPECTED_REB', 'AWAY_MISSING_CORE_EXPECTED_PRA'
]

def validate_dataset(df, name, report_sections, expected_rows, expected_unique_games):
    """Runs a series of checks on a dataframe and updates the report."""
    section = f"### Validation for: `{name}`\n\n"
    errors = []
    
    # Check rows and unique games
    if len(df) == 0:
        errors.append("- Dataset is empty (0 rows).")
    elif len(df) != expected_rows:
        errors.append(f"- Expected {expected_rows} rows, but got {len(df)}.")
        
    if "GAME_ID" in df.columns:
        actual_unique_games = df["GAME_ID"].nunique()
        if actual_unique_games != expected_unique_games:
            errors.append(f"- Expected {expected_unique_games} unique games, but got {actual_unique_games}.")
    else:
        errors.append("- `GAME_ID` column is missing.")

    if "TEAM_ID" not in df.columns: errors.append("- `TEAM_ID` column is missing.")
    if TARGET_COL not in df.columns: errors.append(f"- Target column `{TARGET_COL}` is missing.")

    # Grain validation
    if "GAME_ID" in df.columns and "TEAM_ID" in df.columns:
        if df.duplicated(subset=["GAME_ID", "TEAM_ID"]).any():
            errors.append("- `GAME_ID` + `TEAM_ID` is not unique.")
        game_counts = df.groupby("GAME_ID").size()
        if not (game_counts == 2).all():
            errors.append(f"- Not all `GAME_ID` have exactly 2 rows. Distribution:\n{game_counts.value_counts().to_string()}")

    # Leakage and forbidden columns
    remaining_leakage = [col for col in LEAKAGE_COLS if col in df.columns]
    if remaining_leakage:
        errors.append(f"- Found remaining leakage columns: {remaining_leakage}")
    
    remaining_forbidden = [col for col in FORBIDDEN_PLAYER_COLS if col in df.columns]
    if remaining_forbidden:
        errors.append(f"- Found forbidden player columns: {remaining_forbidden}")

    # Feature and metadata columns
    missing_features = [col for col in SAFE_FEATURES if col not in df.columns]
    if missing_features:
        errors.append(f"- Missing safe feature columns: {missing_features}")
        
    present_metadata = [col for col in METADATA_COLS if col in df.columns]
    if not present_metadata:
        errors.append("- No metadata columns found.")

    if not errors:
        section += "**Result**: ✅ PASSED\n"
    else:
        section += "**Result**: ❌ FAILED\n"
        section += "\n".join(errors) + "\n"
        raise ValueError(f"Validation failed for {name}:\n" + "\n".join(errors))
        
    report_sections.append(section)

def main():
    """Main function to clean and validate the dataset."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(REPORT_DIR, exist_ok=True)
    
    report_sections = ["# Win Dataset Cleaning & Validation Report (2024-25)\n"]

    # --- 1. Load Data ---
    print(f"Loading data from {INPUT_FILE}...")
    df = pd.read_csv(INPUT_FILE, dtype={"GAME_ID": str, "TEAM_ID": str, "SEASON_ID": str})
    
    # --- Fix GAME_ID leading zeros ---
    df["GAME_ID"] = df["GAME_ID"].astype(str).str.strip().str.zfill(10)
    df["GAME_ID_PREFIX"] = df["GAME_ID"].str[:3]

    # --- Input Stats ---
    report_sections.append("## 1. Input Dataset Profile\n")
    report_sections.append(f"- **Shape**: {df.shape}")
    report_sections.append(f"- **Season Distribution**:\n{df['SEASON_TYPE'].value_counts().to_string() if 'SEASON_TYPE' in df.columns else 'N/A'}")
    report_sections.append(f"- **GAME_ID Prefix Distribution**:\n{df['GAME_ID_PREFIX'].value_counts().to_string()}")

    # --- 2. Initial Grain Validation ---
    print("Validating initial grain...")
    initial_grain_report = "## 2. Initial Grain Status\n"
    try:
        assert "GAME_ID" in df.columns, "GAME_ID not found"
        assert "TEAM_ID" in df.columns, "TEAM_ID not found"
        assert "WIN" in df.columns, "WIN not found"
        assert df[["GAME_ID", "TEAM_ID"]].duplicated().sum() == 0, "Duplicate GAME_ID+TEAM_ID rows"
        assert (df.groupby("GAME_ID").size() == 2).all(), "Not all games have 2 rows"
        initial_grain_report += "- **Status**: ✅ PASSED\n"
        initial_grain_report += f"- **Rows**: {len(df)}\n"
        initial_grain_report += f"- **Unique GAME_ID**: {df['GAME_ID'].nunique()}\n"
        initial_grain_report += f"- **Unique TEAM_ID**: {df['TEAM_ID'].nunique()}\n"
        initial_grain_report += f"- **Unique GAME_ID + TEAM_ID**: {len(df[['GAME_ID', 'TEAM_ID']].drop_duplicates())}\n"
    except AssertionError as e:
        initial_grain_report += f"- **Status**: ❌ FAILED: {e}\n"
        report_sections.append(initial_grain_report)
        with open(REPORT_FILE, "w") as f:
            f.write("\n".join(report_sections))
        raise
    report_sections.append(initial_grain_report)

    # --- 3. Clean and Prepare Columns ---
    print("Cleaning columns...")
    actual_metadata = [col for col in METADATA_COLS if col in df.columns]
    actual_features = [col for col in SAFE_FEATURES if col in df.columns]
    dropped_leakage = [col for col in LEAKAGE_COLS if col in df.columns]
    
    # Include GAME_ID_PREFIX temporarily for filtering
    final_cols = actual_metadata + [TARGET_COL] + actual_features + ["GAME_ID_PREFIX"]
    df_clean = df[final_cols].copy()

    report_sections.append("## 3. Column Management\n")
    report_sections.append(f"- **Dropped Leakage Columns**: {dropped_leakage}")
    report_sections.append(f"- **Metadata Columns**: {actual_metadata}")
    report_sections.append(f"- **Target Column**: {TARGET_COL}")
    report_sections.append(f"- **Feature Columns**: {actual_features}")

    # --- 4. Create and Save Datasets ---
    print("Creating and saving output files...")
    report_sections.append("\n## 4. Output Files & Validation\n")
    
    outputs = {
        "regular": {
            "file": OUTPUT_DIR / "win_dataset_regular_2024_25_clean.csv",
            "filter": df_clean['GAME_ID_PREFIX'] == "002",
            "scope": "Regular Season",
            "expected_rows": 2460,
            "expected_unique_games": 1230
        },
        "postseason": {
            "file": OUTPUT_DIR / "win_dataset_postseason_2024_25_clean.csv",
            "filter": df_clean['GAME_ID_PREFIX'].isin(["004", "005"]),
            "scope": "Postseason (Playoffs + Play-In)",
            "expected_rows": 176,
            "expected_unique_games": 88
        },
        "all_games": {
            "file": OUTPUT_DIR / "win_dataset_all_games_2024_25_clean.csv",
            "filter": pd.Series(True, index=df_clean.index),
            "scope": "All Games",
            "expected_rows": 2636,
            "expected_unique_games": 1318
        }
    }

    for name, config in outputs.items():
        print(f"  - Processing {name}...")
        df_out = df_clean[config["filter"]].copy()
        
        # Drop the temporary GAME_ID_PREFIX column before saving
        if "GAME_ID_PREFIX" in df_out.columns:
            df_out = df_out.drop(columns=["GAME_ID_PREFIX"])
            
        # Save CSV
        df_out.to_csv(config["file"], index=False)
        
        # Create and save JSON
        json_path = config["file"].with_suffix(".json")
        info = {
            "target_column": TARGET_COL,
            "metadata_columns": actual_metadata,
            "feature_columns": actual_features,
            "dropped_leakage_columns": dropped_leakage,
            "row_count": len(df_out),
            "unique_games": df_out['GAME_ID'].nunique(),
            "unique_team_games": len(df_out[['GAME_ID', 'TEAM_ID']].drop_duplicates()),
            "season_scope": config["scope"]
        }
        with open(json_path, 'w') as f:
            json.dump(info, f, indent=4)
            
        report_sections.append(f"**{name.replace('_', ' ').title()}**\n")
        report_sections.append(f"- **File**: `{config['file']}`")
        report_sections.append(f"- **Rows**: {len(df_out)}")
        report_sections.append(f"- **JSON**: `{json_path}`")

        # --- 5. Post-Save Validation ---
        print(f"    - Validating {name} output...")
        df_check = pd.read_csv(config["file"], dtype={"GAME_ID": str, "TEAM_ID": str, "SEASON_ID": str})
        df_check["GAME_ID"] = df_check["GAME_ID"].astype(str).str.strip().str.zfill(10)
        validate_dataset(
            df=df_check, 
            name=name, 
            report_sections=report_sections, 
            expected_rows=config["expected_rows"], 
            expected_unique_games=config["expected_unique_games"]
        )

    # --- Final Decision ---
    report_sections.append("\n## 5. Final Decision\n")
    report_sections.append("**SAFE TO PROCEED TO CROSS-SEASON MERGE ONLY AFTER USING CLEANED OUTPUTS**")

    # --- Write Report ---
    print(f"Writing report to {REPORT_FILE}...")
    with open(REPORT_FILE, "w") as f:
        f.write("\n".join(report_sections))
        
    print("\nScript completed successfully!")

if __name__ == "__main__":
    main()