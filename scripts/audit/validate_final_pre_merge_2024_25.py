import os
import sys
import pandas as pd
import json

def normalize_game_id(series):
    return series.astype(str).str.zfill(10)

def main():
    report = []
    
    def add_check(name, status, evidence, blocking):
        report.append({
            "name": name,
            "status": status,
            "evidence": evidence,
            "blocking": blocking
        })
    
    base_dir = "/Users/serhat/agProjects/nbaModelApp"
    exp_dir = os.path.join(base_dir, "data/experimental")
    prod_dir = os.path.join(base_dir, "data/production")
    
    win_exp_path = os.path.join(exp_dir, "team_win_model_ready_v2_2024_25.csv")
    score_exp_path = os.path.join(exp_dir, "team_score_model_ready_v2_2024_25.csv")
    game_results_path = os.path.join(exp_dir, "game_results_2024_25.csv")
    win_prod_path = os.path.join(prod_dir, "team_win_model_ready_v2_player_features.csv")
    score_prod_path = os.path.join(prod_dir, "team_score_model_ready_v2_player_features.csv")
    
    paths = {
        "Win Experimental File": win_exp_path,
        "Score Experimental File": score_exp_path,
        "Game Results File": game_results_path,
        "Win Production File": win_prod_path,
        "Score Production File": score_prod_path
    }
    
    missing_files = []
    for name, path in paths.items():
        if not os.path.exists(path):
            missing_files.append(name)
            
    if missing_files:
        add_check("Physical files exist", "FAIL", f"Missing files: {', '.join(missing_files)}", True)
        print("Missing required files. Writing failure report and exiting early.")
        write_report(base_dir, report)
        return
    else:
        add_check("Physical files exist", "PASS", "All required files found.", True)
    
    try:
        win_df = pd.read_csv(win_exp_path)
        score_df = pd.read_csv(score_exp_path)
        gr_df = pd.read_csv(game_results_path)
        win_prod_df = pd.read_csv(win_prod_path, nrows=0)
        score_prod_df = pd.read_csv(score_prod_path, nrows=0)
    except Exception as e:
        add_check("Dataset Loading", "FAIL", f"Failed to read datasets: {e}", True)
        write_report(base_dir, report)
        return
        
    win_df['GAME_ID'] = normalize_game_id(win_df['GAME_ID'])
    score_df['GAME_ID'] = normalize_game_id(score_df['GAME_ID'])
    gr_df['GAME_ID'] = normalize_game_id(gr_df['GAME_ID'])
    
    num_games = gr_df['GAME_ID'].nunique()
    
    if len(win_df) == 0:
        add_check("Win Dataset Row Count", "FAIL", "Zero rows", True)
    elif len(win_df) == 2 * num_games:
        add_check("Win Dataset Row Count", "PASS", f"{len(win_df)} rows matches 2 * {num_games} games", True)
    else:
        add_check("Win Dataset Row Count", "FAIL", f"Expected {2*num_games} rows, got {len(win_df)}", True)
        
    if len(score_df) == 0:
        add_check("Score Dataset Row Count", "FAIL", "Zero rows", True)
    elif len(score_df) == num_games:
        add_check("Score Dataset Row Count", "PASS", f"{len(score_df)} rows matches {num_games} games", True)
    else:
        add_check("Score Dataset Row Count", "FAIL", f"Expected {num_games} rows, got {len(score_df)}", True)
        
    win_issues = []
    if 'WIN' not in win_df.columns:
        win_issues.append("WIN column missing")
    else:
        if win_df['WIN'].isnull().any():
            win_issues.append("WIN contains nulls")
        if not set(win_df['WIN'].unique()).issubset({0, 1}):
            win_issues.append("WIN values not restricted to 0/1")
            
        win_dist = win_df.groupby('GAME_ID')['WIN'].sum()
        if not (win_dist == 1).all():
            win_issues.append("WIN distribution not balanced (not exactly 1 win and 1 loss per game)")
            
    if win_issues:
        add_check("Win Target Validation", "FAIL", "; ".join(win_issues), True)
    else:
        add_check("Win Target Validation", "PASS", "WIN column valid and balanced", True)
        
    score_issues = []
    for col in ['HOME_PTS', 'AWAY_PTS']:
        if col not in score_df.columns:
            score_issues.append(f"{col} column missing")
        elif score_df[col].isnull().any():
            score_issues.append(f"{col} contains nulls")
        else:
            if not pd.api.types.is_numeric_dtype(score_df[col]):
                score_issues.append(f"{col} not numeric")
            elif not ((score_df[col] >= 50) & (score_df[col] <= 250)).all():
                score_issues.append(f"{col} out of range 50-250")
                
    if score_issues:
        add_check("Score Target Validation", "FAIL", "; ".join(score_issues), True)
    else:
        add_check("Score Target Validation", "PASS", "HOME_PTS and AWAY_PTS valid", True)
        
    integrity_issues = []
    win_game_counts = win_df['GAME_ID'].value_counts()
    if not (win_game_counts == 2).all():
        integrity_issues.append("Win dataset does not have exactly 2 rows per GAME_ID")
        
    score_game_counts = score_df['GAME_ID'].value_counts()
    if not (score_game_counts == 1).all():
        integrity_issues.append("Score dataset does not have exactly 1 row per GAME_ID")
        
    win_games = set(win_df['GAME_ID'])
    score_games = set(score_df['GAME_ID'])
    gr_games = set(gr_df['GAME_ID'])
    if not win_games.issubset(gr_games):
        integrity_issues.append("Win GAME_IDs are not a subset of game_results")
    if not score_games.issubset(gr_games):
        integrity_issues.append("Score GAME_IDs are not a subset of game_results")
        
    if 'TEAM_ABBREVIATION' in win_df.columns:
        if win_df.duplicated(['GAME_ID', 'TEAM_ABBREVIATION']).any():
            integrity_issues.append("Duplicate GAME_ID + TEAM_ABBREVIATION in win dataset")
    if score_df.duplicated('GAME_ID').any():
        integrity_issues.append("Duplicate GAME_ID in score dataset")
        
    if integrity_issues:
        add_check("GAME_ID Integrity", "FAIL", "; ".join(integrity_issues), True)
    else:
        add_check("GAME_ID Integrity", "PASS", "All GAME_ID integrity checks passed", True)
        
    metadata_cols = {
        'SEASON_ID', 'TEAM_ID', 'TEAM_ABBREVIATION', 'TEAM_NAME', 
        'GAME_ID', 'GAME_DATE', 'MATCHUP', 'WL', 'MIN'
    }
    forbidden_leakage_cols = {
        'PTS', 'PLUS_MINUS', 'FGM', 'FGA', 'FG_PCT', 'FG3M', 'FG3A', 'FG3_PCT',
        'FTM', 'FTA', 'FT_PCT', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'PF'
    }
    
    win_targets = {'WIN'}
    win_features = set(win_df.columns) - metadata_cols - win_targets
    win_leakage = win_features.intersection(forbidden_leakage_cols)
    
    score_targets = {'HOME_PTS', 'AWAY_PTS', 'POINT_DIFF', 'TOTAL_POINTS'}
    score_features = set(score_df.columns) - metadata_cols - score_targets
    score_leakage = score_features.intersection(forbidden_leakage_cols)
    
    if win_leakage or score_leakage:
        evidence = f"Leakage found. Win: {win_leakage}, Score: {score_leakage}"
        add_check("Leakage Validation", "FAIL", evidence, True)
    else:
        add_check("Leakage Validation", "PASS", "No forbidden features found in feature set", True)

    player_cols = [
        'HOME_CORE_PLAYERS_AVAILABLE_COUNT', 'AWAY_CORE_PLAYERS_AVAILABLE_COUNT',
        'HOME_CORE_EXPECTED_PTS_SUM', 'AWAY_CORE_EXPECTED_PTS_SUM',
        'HOME_TOP3_EXPECTED_PRA_SUM', 'AWAY_TOP3_EXPECTED_PRA_SUM'
    ]
    
    win_roster_issues = []
    missing_player_cols = [c for c in player_cols if c not in win_df.columns]
    if missing_player_cols:
        win_roster_issues.append(f"Missing player columns in Win: {missing_player_cols}")
    else:
        for c in player_cols:
            null_pct = win_df[c].isnull().mean()
            if null_pct > 0.05:
                win_roster_issues.append(f"{c} null rate {null_pct*100:.1f}% > 5%")
            if (win_df[c] == 0).all():
                win_roster_issues.append(f"{c} is all zeroes")
                
    if win_roster_issues:
        add_check("Win Roster Features", "FAIL", "; ".join(win_roster_issues), True)
    else:
        add_check("Win Roster Features", "PASS", "All required roster features present and valid", True)

    score_prod_player_cols = [c for c in player_cols if c in score_prod_df.columns]
    score_roster_issues = []
    if score_prod_player_cols:
        missing_in_exp = [c for c in score_prod_player_cols if c not in score_df.columns]
        if missing_in_exp:
            score_roster_issues.append(f"Missing expected player cols in Score exp: {missing_in_exp}")
        else:
            for c in score_prod_player_cols:
                null_pct = score_df[c].isnull().mean()
                if null_pct > 0.05:
                    score_roster_issues.append(f"{c} null rate {null_pct*100:.1f}% > 5%")
                if (score_df[c] == 0).all():
                    score_roster_issues.append(f"{c} is all zeroes")
        if score_roster_issues:
             add_check("Score Roster Features", "FAIL", "; ".join(score_roster_issues), True)
        else:
             add_check("Score Roster Features", "PASS", "Score features match production roster columns", True)
    else:
        add_check("Score Roster Features", "WARN", "Score production schema does not include player/roster features. Proceeding without them.", False)
        
    high_null_cols_win = []
    warn_null_cols_win = []
    for c in win_features:
        null_pct = win_df[c].isnull().mean()
        if null_pct > 0.3:
            high_null_cols_win.append(f"{c} ({null_pct*100:.1f}%)")
        elif null_pct >= 0.05:
            warn_null_cols_win.append(f"{c} ({null_pct*100:.1f}%)")
            
    high_null_cols_score = []
    warn_null_cols_score = []
    for c in score_features:
        null_pct = score_df[c].isnull().mean()
        if null_pct > 0.3:
            high_null_cols_score.append(f"{c} ({null_pct*100:.1f}%)")
        elif null_pct >= 0.05:
            warn_null_cols_score.append(f"{c} ({null_pct*100:.1f}%)")
            
    if high_null_cols_win or high_null_cols_score:
        evidence = f"Fail: Win >30% nulls: {high_null_cols_win[:5]}. Score >30% nulls: {high_null_cols_score[:5]}"
        add_check("Missing Values", "FAIL", evidence, True)
    elif warn_null_cols_win or warn_null_cols_score:
        evidence = f"Warn: Win 5-30% nulls: {warn_null_cols_win[:5]}. Score 5-30% nulls: {warn_null_cols_score[:5]}"
        add_check("Missing Values", "WARN", evidence, False)
    else:
        add_check("Missing Values", "PASS", "No features with >5% nulls", False)

    win_exp_cols = list(win_df.columns)
    win_prod_cols = list(win_prod_df.columns)
    win_missing = [c for c in win_prod_cols if c not in win_exp_cols]
    win_extra = [c for c in win_exp_cols if c not in win_prod_cols]
    
    score_exp_cols = list(score_df.columns)
    score_prod_cols = list(score_prod_df.columns)
    score_missing = [c for c in score_prod_cols if c not in score_exp_cols]
    score_extra = [c for c in score_exp_cols if c not in score_prod_cols]
    
    parity_issues = []
    if win_missing: parity_issues.append(f"Win missing: {win_missing[:5]}")
    if score_missing: parity_issues.append(f"Score missing: {score_missing[:5]}")
    if win_extra: parity_issues.append(f"Win extra: {win_extra[:5]}")
    if score_extra: parity_issues.append(f"Score extra: {score_extra[:5]}")
    
    if parity_issues:
        add_check("Feature Parity", "WARN", "; ".join(parity_issues) + " (Needs review if acceptable)", False)
    else:
        if win_exp_cols != win_prod_cols or score_exp_cols != score_prod_cols:
            add_check("Feature Parity", "WARN", "Columns match exactly in elements but order differs", False)
        else:
            add_check("Feature Parity", "PASS", "Perfect column match with production", False)
            
    write_report(base_dir, report)

def write_report(base_dir, report):
    num_blocks = sum(1 for c in report if c['status'] == 'FAIL' and c['blocking'])
    num_warns = sum(1 for c in report if c['status'] == 'WARN')
    num_fails = sum(1 for c in report if c['status'] == 'FAIL')
    
    if num_blocks > 0:
        verdict = "NOT READY"
        score = 0
    elif num_fails > 0:
        verdict = "NOT READY"
        score = 50
    elif num_warns > 0:
        verdict = "READY WITH WARNINGS"
        score = 90
    else:
        verdict = "READY"
        score = 100
        
    md_content = f"""# Final Pre-Merge Audit 2024-25

## Summary
- **Final Verdict:** {verdict}
- **Confidence Score:** {score}/100
- **Blocking Failures:** {num_blocks}
- **Warnings:** {num_warns}

## Detailed Checks
"""
    for ch in report:
        status_icon = "✅" if ch['status'] == "PASS" else ("⚠️" if ch['status'] == "WARN" else "❌")
        md_content += f"### {status_icon} {ch['name']} ({ch['status']})\n"
        md_content += f"- **Evidence:** {ch['evidence']}\n"
        md_content += f"- **Blocking:** {ch['blocking']}\n\n"
        
    report_path = os.path.join(base_dir, "reports/audits/final_pre_merge_audit_2024_25.md")
    os.makedirs(os.path.dirname(report_path), exist_ok=True)
    with open(report_path, "w") as f:
        f.write(md_content)
        
    print(f"Validation complete. Verdict: {verdict}. Score: {score}/100.")
    print(f"Report written to {report_path}")

if __name__ == "__main__":
    main()
