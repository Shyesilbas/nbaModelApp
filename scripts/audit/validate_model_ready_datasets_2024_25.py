import pandas as pd
from pathlib import Path
import sys

def validate_datasets(season):
    """
    Validates the generated model-ready datasets for the given season.
    """
    base_path = Path('data/experimental')
    win_dataset_path = base_path / f'team_win_model_ready_v2_{season}.csv'
    score_dataset_path = base_path / f'team_score_model_ready_v2_{season}.csv'

    print(f"Validating datasets for season: {season}")

    # --- Validation Checks ---
    errors = []

    # 1. File Existence
    if not win_dataset_path.exists():
        errors.append(f"Win dataset not found at: {win_dataset_path}")
    if not score_dataset_path.exists():
        errors.append(f"Score dataset not found at: {score_dataset_path}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        sys.exit(1)

    win_df = pd.read_csv(win_dataset_path)
    score_df = pd.read_csv(score_dataset_path)

    # 2. Row Counts
    if len(win_df) == 0:
        errors.append("Win dataset is empty.")
    if len(score_df) == 0:
        errors.append("Score dataset is empty.")

    # 3. Required Target Columns
    required_win_targets = ['WIN']
    required_score_targets = ['HOME_PTS', 'AWAY_PTS', 'POINT_DIFF', 'TOTAL_POINTS']
    
    for col in required_win_targets:
        if col not in win_df.columns:
            errors.append(f"Target column '{col}' missing in win dataset.")
    
    for col in required_score_targets:
        if col not in score_df.columns:
            errors.append(f"Target column '{col}' missing in score dataset.")

    # 4. Required Feature Columns (sample)
    required_features = ['IS_HOME', 'DAYS_REST', 'OPP_DAYS_REST']
    for col in required_features:
        if col not in win_df.columns:
            errors.append(f"Feature column '{col}' missing in win dataset.")
        if col not in score_df.columns:
            errors.append(f"Feature column '{col}' missing in score dataset.")

    # 5. GAME_ID Coverage
    if 'GAME_ID' not in win_df.columns or win_df['GAME_ID'].isnull().any():
        errors.append("GAME_ID coverage is not valid in win dataset.")
    if 'GAME_ID' not in score_df.columns or score_df['GAME_ID'].isnull().any():
        errors.append("GAME_ID coverage is not valid in score dataset.")

    # 6. Duplicate Keys
    if win_df.duplicated(subset=['GAME_ID', 'TEAM_ABBREVIATION']).any():
        errors.append("Duplicate keys found in win dataset.")
    if score_df.duplicated(subset=['GAME_ID']).any():
        errors.append("Duplicate keys found in score dataset.")

    # 7. Date Range
    season_start = f'{int(season.split("_")[0])}-10-22'
    season_end = f'{int(season.split("_")[0])+1}-06-22'
    
    win_df['GAME_DATE'] = pd.to_datetime(win_df['GAME_DATE'])
    if not (win_df['GAME_DATE'].min() >= pd.to_datetime(season_start) and win_df['GAME_DATE'].max() <= pd.to_datetime(season_end)):
        errors.append(f"Win dataset date range is not within {season_start} to {season_end}.")

    score_df['GAME_DATE'] = pd.to_datetime(score_df['GAME_DATE'])
    if not (score_df['GAME_DATE'].min() >= pd.to_datetime(season_start) and score_df['GAME_DATE'].max() <= pd.to_datetime(season_end)):
        errors.append(f"Score dataset date range is not within {season_start} to {season_end}.")

    # 8. Leakage Columns
    leakage_cols = ['PTS', 'WL', 'PLUS_MINUS', 'HOME_PTS', 'AWAY_PTS', 'POINT_DIFF', 'TOTAL_POINTS']
    win_feature_cols = [col for col in win_df.columns if col not in ['GAME_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'GAME_DATE', 'MATCHUP', 'WIN']]
    
    for col in leakage_cols:
        if col in win_feature_cols:
            errors.append(f"Leakage column '{col}' found in win dataset features.")

    # --- Report Generation ---
    report = []
    report.append(f"# Validation Report for {season} Datasets")
    report.append("\n## 1. File Information")
    report.append(f"- Win Dataset: `{win_dataset_path}` ({len(win_df)} rows, {len(win_df.columns)} columns)")
    report.append(f"- Score Dataset: `{score_dataset_path}` ({len(score_df)} rows, {len(score_df.columns)} columns)")

    report.append("\n## 2. Validation Checks")
    if errors:
        report.append("\n**Result: FAIL**")
        for error in errors:
            report.append(f"- {error}")
    else:
        report.append("\n**Result: PASS**")
        report.append("- All validation checks passed.")

    # --- Missing Value Analysis ---
    report.append("\n## 3. Missing Value Analysis")
    win_missing = win_df.isnull().sum().sum()
    score_missing = score_df.isnull().sum().sum()
    report.append(f"- Total missing values in win dataset: {win_missing}")
    report.append(f"- Total missing values in score dataset: {score_missing}")

    print("\n" + "\n".join(report))

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", required=True, help="The season to validate (e.g., 2024_25).")
    args = parser.parse_args()
    
    validate_datasets(args.season)
