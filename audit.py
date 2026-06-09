import os
import glob
import pandas as pd
import json

base_dir = '/Users/serhat/agProjects/nbaModelApp'
os.chdir(base_dir)

# Ensure audit dir exists
os.makedirs('reports/audits', exist_ok=True)

patterns = [
    '*2024_25*', '*2025_26*', '*win*model*ready*', '*score*model*ready*',
    '*team_games_features*', '*player_games_features*', '*game_results*',
    '*feature_columns*', '*metadata*', 'core_players.csv',
    'player_registry_2024_25.csv', 'observed_affiliation_events_2024_25.csv'
]

files = set()
for p in patterns:
    for root, dirs, filenames in os.walk('data'):
        for fn in glob.fnmatch.filter(filenames, p):
            files.add(os.path.join(root, fn))
    for root, dirs, filenames in os.walk('models'):
        for fn in glob.fnmatch.filter(filenames, p):
            files.add(os.path.join(root, fn))

files = list(files)

def load_file(fp):
    try:
        if fp.endswith('.csv'):
            return pd.read_csv(fp)
        elif fp.endswith('.parquet'):
            return pd.read_parquet(fp)
        elif fp.endswith('.json'):
            with open(fp, 'r') as f:
                return json.load(f)
    except:
        pass
    return None

def prefix_dist(df):
    if 'GAME_ID' in df.columns:
        df['GAME_ID'] = df['GAME_ID'].astype(str).str.zfill(10)
        return df['GAME_ID'].str[:5].value_counts().to_dict()
    return {}

# 1. Inventory All Relevant Files
inventory_lines = ["# Full Pipeline Truth Audit Inventory\n\n"]
file_stats = {}

for f in sorted(files):
    size = os.path.getsize(f)
    exists = os.path.exists(f)
    
    df = load_file(f)
    
    if isinstance(df, pd.DataFrame):
        row_count, col_count = df.shape
        has_game_date = 'GAME_DATE' in df.columns
        has_game_id = 'GAME_ID' in df.columns
        min_date, max_date = None, None
        unique_game_id = None
        prefixes = {}
        first_5_games = []
        first_5_dates = []
        
        if has_game_date:
            valid_dates = df['GAME_DATE'].dropna().astype(str)
            if not valid_dates.empty:
                min_date, max_date = valid_dates.min(), valid_dates.max()
                first_5_dates = valid_dates.head(5).tolist()
            else:
                min_date, max_date = None, None
                first_5_dates = []
            
        if has_game_id:
            unique_game_id = df['GAME_ID'].nunique()
            prefixes = prefix_dist(df)
            first_5_games = df['GAME_ID'].head(5).tolist()
            
        file_stats[f] = {
            'type': 'df',
            'rows': row_count,
            'cols': col_count,
            'min_date': min_date,
            'max_date': max_date,
            'unique_game_id': unique_game_id,
            'prefixes': prefixes,
            'first_5_games': first_5_games,
            'first_5_dates': first_5_dates,
            'cols_list': df.columns.tolist(),
            'df': df
        }
        
        inventory_lines.append(f"## {f}")
        inventory_lines.append(f"- **Exists?**: {exists}")
        inventory_lines.append(f"- **Size**: {size} bytes")
        inventory_lines.append(f"- **Rows**: {row_count}")
        inventory_lines.append(f"- **Cols**: {col_count}")
        if has_game_date:
            inventory_lines.append(f"- **GAME_DATE**: {min_date} to {max_date}")
            inventory_lines.append(f"- **First 5 Dates**: {first_5_dates}")
        if has_game_id:
            inventory_lines.append(f"- **Unique GAME_IDs**: {unique_game_id}")
            inventory_lines.append(f"- **GAME_ID Prefixes**: {prefixes}")
            inventory_lines.append(f"- **First 5 GAME_IDs**: {first_5_games}")
        inventory_lines.append("\n")
    else:
        file_stats[f] = {'type': 'json' if f.endswith('.json') else 'other', 'content': df}
        inventory_lines.append(f"## {f}")
        inventory_lines.append(f"- **Exists?**: {exists}")
        inventory_lines.append(f"- **Size**: {size} bytes")
        inventory_lines.append(f"- Not a DataFrame (JSON/Other)\n\n")

with open('reports/audits/full_pipeline_truth_audit_inventory.md', 'w') as f:
    f.writelines('\n'.join(inventory_lines))

# 2. Season Identity Audit
season_identity_lines = ["# Season Identity Truth Audit\n\n| File | Claimed Season | Actual Season | Evidence | Verdict |\n|---|---|---|---|---|\n"]

def determine_season(stats):
    claimed = '2024-25' if '2024_25' in f else ('2025-26' if '2025_26' in f else 'Unknown')
    if stats['type'] != 'df':
        return claimed, 'Unknown', 'Not a df', 'Unknown'
    
    min_date = stats.get('min_date')
    max_date = stats.get('max_date')
    prefixes = stats.get('prefixes', {})
    
    is_24_25 = False
    is_25_26 = False
    
    if min_date and max_date:
        if '2024-10' <= str(min_date) <= '2025-06': is_24_25 = True
        if '2025-10' <= str(min_date) <= '2026-06': is_25_26 = True
        
    for p in prefixes:
        if p in ['00224', '00424']: is_24_25 = True
        if p in ['00225', '00425', '225', '425']: is_25_26 = True
        
    actual = 'Mixed' if (is_24_25 and is_25_26) else ('2024-25' if is_24_25 else ('2025-26' if is_25_26 else 'Unknown'))
    evidence = f"Dates: {min_date} to {max_date}, Prefixes: {prefixes}"
    verdict = 'VALID' if actual == claimed else 'INVALID'
    
    return claimed, actual, evidence, verdict

for f, stats in file_stats.items():
    if '2024_25' in f or '2025_26' in f:
        claimed, actual, evidence, verdict = determine_season(stats)
        season_identity_lines.append(f"| {f} | {claimed} | {actual} | {evidence} | {verdict} |\n")

with open('reports/audits/season_identity_truth_audit.md', 'w') as f:
    f.writelines(''.join(season_identity_lines))


# 3. Dataset Grain Audit
grain_lines = ["# Dataset Grain Audit\n\n"]
for f, stats in file_stats.items():
    if 'win_model_ready' in f or 'score_model_ready' in f:
        if stats['type'] == 'df':
            df = stats['df']
            row_count = stats['rows']
            unique_game_id = stats['unique_game_id']
            rows_per_game = {}
            if 'GAME_ID' in df.columns:
                rows_per_game = df['GAME_ID'].value_counts().value_counts().to_dict()
                
            has_player_id = 'PLAYER_ID' in df.columns
            has_player_name = 'PLAYER_NAME' in df.columns
            
            grain = "Unknown"
            if 'win' in f:
                grain = "Team-Game" if not has_player_id and rows_per_game.get(2) == unique_game_id else "Mixed/Invalid"
            elif 'score' in f:
                grain = "Game-Level" if not has_player_id and rows_per_game.get(1) == unique_game_id else "Mixed/Invalid"
                
            grain_lines.append(f"## {f}")
            grain_lines.append(f"- **Rows**: {row_count}")
            grain_lines.append(f"- **Unique GAME_IDs**: {unique_game_id}")
            grain_lines.append(f"- **Rows per GAME_ID**: {rows_per_game}")
            grain_lines.append(f"- **Has PLAYER_ID**: {has_player_id}")
            grain_lines.append(f"- **Has PLAYER_NAME**: {has_player_name}")
            grain_lines.append(f"- **Grain Verdict**: {grain}\n")

with open('reports/audits/model_ready_dataset_grain_truth_audit.md', 'w') as f:
    f.writelines('\n'.join(grain_lines))

# 4. Leakage Audit
leakage_cols = ['WL', 'MIN', 'PTS', 'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT', 'FTM', 'FTA', 'FT_PCT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF', 'PLUS_MINUS', 'PTS_ALLOWED', 'HOME_PTS', 'AWAY_PTS', 'POINT_DIFF', 'TOTAL_POINTS']

leakage_lines = ["# Leakage Audit\n\n"]

def get_used_features():
    features = []
    # try finding feature columns
    for f, stats in file_stats.items():
        if 'feature_columns' in f and stats['type'] == 'json':
            features.extend(stats['content'])
        if 'score_model_v2_metadata' in f and stats['type'] == 'json':
            if 'feature_columns' in stats['content']:
                features.extend(stats['content']['feature_columns'])
    return set(features)

used_features = get_used_features()

for f, stats in file_stats.items():
    if 'win_model_ready' in f or 'score_model_ready' in f:
        if stats['type'] == 'df':
            cols = set(stats['cols_list'])
            present_leakage = cols.intersection(leakage_cols)
            used_leakage = present_leakage.intersection(used_features)
            excluded_leakage = present_leakage - used_leakage
            
            verdict = "LEAKAGE SAFE"
            if used_leakage:
                verdict = "LEAKAGE CONFIRMED IN MODEL INPUTS"
            elif present_leakage:
                verdict = "LEAKAGE PRESENT BUT EXCLUDED"
                
            leakage_lines.append(f"## {f}")
            leakage_lines.append(f"- **Present Leakage Cols**: {present_leakage}")
            leakage_lines.append(f"- **Used Leakage Cols**: {used_leakage}")
            leakage_lines.append(f"- **Excluded Leakage Cols**: {excluded_leakage}")
            leakage_lines.append(f"- **Verdict**: {verdict}\n")

with open('reports/audits/leakage_truth_audit.md', 'w') as f:
    f.writelines('\n'.join(leakage_lines))

# 5. Schema Parity Audit
schema_lines = ["# Schema Parity Audit\n\n"]
win_24 = [f for f in file_stats if 'win_model_ready' in f and '2024_25' in f]
win_25 = [f for f in file_stats if 'win_model_ready' in f and '2025_26' in f]
score_24 = [f for f in file_stats if 'score_model_ready' in f and '2024_25' in f]
score_25 = [f for f in file_stats if 'score_model_ready' in f and '2025_26' in f]

def compare_schema(f24, f25, label):
    if not f24 or not f25:
        schema_lines.append(f"## {label} Schema Compare")
        schema_lines.append("Missing one of the datasets to compare.\n")
        return
    f24 = sorted(f24)[-1] # pick best guess
    f25 = sorted(f25)[-1]
    
    cols24 = file_stats[f24]['cols_list']
    cols25 = file_stats[f25]['cols_list']
    
    set24 = set(cols24)
    set25 = set(cols25)
    
    shared = set24.intersection(set25)
    missing = set25 - set24
    extra = set24 - set25
    
    order_diff = cols24[:min(len(cols24), len(cols25))] != cols25[:min(len(cols24), len(cols25))]
    
    schema_lines.append(f"## {label} Schema Compare")
    schema_lines.append(f"- **2024-25 File**: {f24}")
    schema_lines.append(f"- **2025-26 File**: {f25}")
    schema_lines.append(f"- **Cols 24**: {len(cols24)}")
    schema_lines.append(f"- **Cols 25**: {len(cols25)}")
    schema_lines.append(f"- **Shared Cols**: {len(shared)}")
    schema_lines.append(f"- **Missing in 24**: {missing}")
    schema_lines.append(f"- **Extra in 24**: {extra}")
    schema_lines.append(f"- **Order Differs?**: {order_diff}\n")

compare_schema(win_24, win_25, "Win Model")
compare_schema(score_24, score_25, "Score Model")

with open('reports/audits/schema_parity_truth_audit.md', 'w') as f:
    f.writelines('\n'.join(schema_lines))

# 6. Roster Feature Consistency Audit
roster_lines = ["# Roster Feature Consistency Audit\n\n"]
roster_cols = ['HOME_CORE', 'AWAY_CORE', 'HOME_TOP3', 'AWAY_TOP3', 'HOME_MISSING_CORE', 'AWAY_MISSING_CORE']

for f, stats in file_stats.items():
    if 'win_model_ready' in f or 'score_model_ready' in f:
        if stats['type'] == 'df':
            df = stats['df']
            present = [c for c in df.columns if any(rc in c for rc in roster_cols)]
            
            roster_lines.append(f"## {f}")
            roster_lines.append(f"- **Roster Cols Present**: {present}")
            
            for c in present:
                null_rate = df[c].isnull().mean()
                mean = df[c].mean() if pd.api.types.is_numeric_dtype(df[c]) else 'N/A'
                roster_lines.append(f"  - `{c}`: null_rate={null_rate:.2f}, mean={mean}")
            
            roster_lines.append("\n")

with open('reports/audits/roster_feature_consistency_truth_audit.md', 'w') as f:
    f.writelines('\n'.join(roster_lines))

# 7. Path Resolution Audit
import subprocess
path_lines = ["# Season Path Resolution Audit\n\n"]

files_to_check = [
    'main.py',
    'scripts/data_paths.py',
    'scripts/season_utils.py',
    'src/ingestion/data_loader.py',
    'scripts/train_win_probability_v2.py',
    'scripts/prepare_score_model.py',
    'scripts/build_matchup_features.py',
    'src/processing/build_player_features.py'
]

for fp in files_to_check:
    if os.path.exists(fp):
        with open(fp, 'r') as file:
            content = file.read()
            has_25 = '2025_26' in content
            has_24 = '2024_25' in content
            path_lines.append(f"## {fp}")
            path_lines.append(f"- **Hardcoded 2024_25**: {has_24}")
            path_lines.append(f"- **Hardcoded 2025_26**: {has_25}\n")

with open('reports/audits/season_path_resolution_truth_audit.md', 'w') as f:
    f.writelines('\n'.join(path_lines))

# 8. Master Report Placeholder
with open('reports/audits/full_pipeline_truth_audit_master_report.md', 'w') as f:
    f.write("# Master Report\nGenerated.\n")
