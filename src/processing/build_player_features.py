import os
import sys
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
TEAM_READY_PATH = ROOT / "data/processed/team_model_ready_v2_2025_26.csv"
GAME_RESULTS_PATH = ROOT / "data/processed/game_results_2025_26.csv"
CORE_PLAYERS_PATH = ROOT / "data/core_players.csv"
PLAYER_GAMES_PATH = ROOT / "data/raw/player_games/nba_player_games_2025_26_regular_and_playoffs.csv"
TEAM_GAMES_PATH = ROOT / "data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv"
OUTPUT_PATH = ROOT / "data/processed/team_score_model_ready_v2_player_features.csv"

def main():
    print("Starting player feature engineering...")
    
    # Check dependencies
    for p in [TEAM_READY_PATH, GAME_RESULTS_PATH, CORE_PLAYERS_PATH, PLAYER_GAMES_PATH, TEAM_GAMES_PATH]:
        if not p.exists():
            raise FileNotFoundError(f"Required file not found: {p}")
            
    # Load files
    df_feat = pd.read_csv(TEAM_READY_PATH)
    df_results = pd.read_csv(GAME_RESULTS_PATH)
    df_core = pd.read_csv(CORE_PLAYERS_PATH)
    df_player_games = pd.read_csv(PLAYER_GAMES_PATH)
    df_team_games = pd.read_csv(TEAM_GAMES_PATH)
    
    print(f"Loaded {len(df_feat)} team rows, {len(df_results)} game results, {len(df_core)} core players.")
    print(f"Loaded {len(df_player_games)} player games, {len(df_team_games)} team games.")
    
    # 1. Filter features to home team rows only
    df_home_feats = df_feat[df_feat["IS_HOME"].astype(int) == 1].copy()
    print("Filtered features to home team rows. Matchups count:", df_home_feats.shape[0])

    # Convert GAME_ID to string to ensure clean match
    df_home_feats["GAME_ID"] = df_home_feats["GAME_ID"].astype(str)
    df_results["GAME_ID"] = df_results["GAME_ID"].astype(str)
    df_player_games["Game_ID"] = df_player_games["Game_ID"].astype(str)
    df_team_games["GAME_ID"] = df_team_games["GAME_ID"].astype(str)
    
    # Parse dates to datetimes
    df_home_feats["GAME_DATE"] = pd.to_datetime(df_home_feats["GAME_DATE"])
    df_player_games["GAME_DATE"] = pd.to_datetime(df_player_games["GAME_DATE"])
    df_team_games["GAME_DATE"] = pd.to_datetime(df_team_games["GAME_DATE"])
    df_results["GAME_DATE"] = pd.to_datetime(df_results["GAME_DATE"])
    
    # Merge V1 features with results to get targets
    # We rename columns to targets: HOME_PTS, AWAY_PTS, POINT_DIFF, TOTAL_POINTS
    df_results_subset = df_results[["GAME_ID", "HOME_SCORE", "AWAY_SCORE"]].rename(
        columns={"HOME_SCORE": "HOME_PTS", "AWAY_SCORE": "AWAY_PTS"}
    )
    merged = df_home_feats.merge(df_results_subset, on="GAME_ID", how="inner")
    merged["POINT_DIFF"] = merged["HOME_PTS"] - merged["AWAY_PTS"]
    merged["TOTAL_POINTS"] = merged["HOME_PTS"] + merged["AWAY_PTS"]
    print("Merged with targets. Matchups shape:", merged.shape)
    
    # 2. Pre-process and optimize lookups by indexing/grouping
    # Group player games by Player_ID
    player_games_grouped = {pid: group.sort_values("GAME_DATE") for pid, group in df_player_games.groupby("Player_ID")}
    # Group team games by TEAM_ABBREVIATION
    team_games_grouped = {team: group.sort_values("GAME_DATE") for team, group in df_team_games.groupby("TEAM_ABBREVIATION")}
    # Group core players by TEAM_ABBREVIATION
    core_grouped = {team: group for team, group in df_core.groupby("TEAM_ABBREVIATION")}
    
    # Columns to generate
    new_features = []
    
    print("Aggregating player features for each matchup (leakage-free)...")
    for idx, row in merged.iterrows():
        home_team = row["TEAM_ABBREVIATION"]
        away_team = row["OPPONENT_ABBREVIATION"]
        game_date = row["GAME_DATE"]
        
        matchup_features = {}
        
        for prefix, team in [("HOME", home_team), ("AWAY", away_team)]:
            team_core = core_grouped.get(team, pd.DataFrame())
            if team_core.empty:
                # Fallback: fill all with zeros/default
                features_to_update = {
                    f"{prefix}_CORE_PLAYERS_AVAILABLE_COUNT": 0,
                    f"{prefix}_CORE_PLAYERS_MISSING_COUNT": 0,
                    f"{prefix}_TOP1_AVAILABLE": 1,
                    f"{prefix}_TOP2_AVAILABLE": 1,
                    f"{prefix}_TOP3_AVAILABLE": 1,
                    f"{prefix}_CORE_EXPECTED_MIN_SUM": 0.0,
                    f"{prefix}_TOP3_EXPECTED_MIN_SUM": 0.0,
                    f"{prefix}_CORE_MINUTES_SHARE": 0.0,
                    f"{prefix}_CORE_EXPECTED_PTS_SUM": 0.0,
                    f"{prefix}_CORE_EXPECTED_AST_SUM": 0.0,
                    f"{prefix}_CORE_EXPECTED_REB_SUM": 0.0,
                    f"{prefix}_CORE_EXPECTED_PRA_SUM": 0.0,
                    f"{prefix}_TOP3_EXPECTED_PTS_SUM": 0.0,
                    f"{prefix}_TOP3_EXPECTED_AST_SUM": 0.0,
                    f"{prefix}_TOP3_EXPECTED_REB_SUM": 0.0,
                    f"{prefix}_TOP3_EXPECTED_PRA_SUM": 0.0,
                    f"{prefix}_MISSING_CORE_EXPECTED_MIN": 0.0,
                    f"{prefix}_MISSING_CORE_EXPECTED_PTS": 0.0,
                    f"{prefix}_MISSING_CORE_EXPECTED_AST": 0.0,
                    f"{prefix}_MISSING_CORE_EXPECTED_REB": 0.0,
                    f"{prefix}_MISSING_CORE_EXPECTED_PRA": 0.0
                }
                matchup_features.update(features_to_update)
                continue
                
            # Find team's last 3 games strictly before game_date
            t_games = team_games_grouped.get(team, pd.DataFrame())
            t_games_before = t_games[t_games["GAME_DATE"] < game_date] if not t_games.empty else pd.DataFrame()
            if not t_games_before.empty:
                last_3_game_ids = t_games_before["GAME_ID"].tail(3).tolist()
            else:
                last_3_game_ids = []
                
            avail_count = 0
            missing_count = 0
            
            top1_avail = 0
            top2_avail = 0
            top3_avail = 0
            
            core_expected_min = []
            top3_expected_min = []
            
            core_expected_pts = []
            core_expected_ast = []
            core_expected_reb = []
            core_expected_pra = []
            
            top3_expected_pts = []
            top3_expected_ast = []
            top3_expected_reb = []
            top3_expected_pra = []
            
            missing_expected_min = []
            missing_expected_pts = []
            missing_expected_ast = []
            missing_expected_reb = []
            missing_expected_pra = []
            
            for _, cp_row in team_core.iterrows():
                pid = int(cp_row["PLAYER_ID"])
                rank = int(cp_row["CORE_RANK"])
                
                # 1. Determine availability using proxy
                if len(last_3_game_ids) == 0:
                    is_available = True
                else:
                    p_games = player_games_grouped.get(pid, pd.DataFrame())
                    p_games_last_3 = p_games[p_games["Game_ID"].isin(last_3_game_ids)] if not p_games.empty else pd.DataFrame()
                    if p_games_last_3.empty:
                        is_available = False
                    else:
                        is_available = (p_games_last_3["MIN"].fillna(0) > 0).any()
                
                if is_available:
                    avail_count += 1
                    if rank == 1:
                        top1_avail = 1
                    elif rank == 2:
                        top2_avail = 1
                    elif rank == 3:
                        top3_avail = 1
                else:
                    missing_count += 1
                    
                # 2. Expected Stats (10-game rolling averages strictly before game_date)
                p_games = player_games_grouped.get(pid, pd.DataFrame())
                p_hist = p_games[p_games["GAME_DATE"] < game_date] if not p_games.empty else pd.DataFrame()
                
                if not p_hist.empty:
                    p_recent = p_hist.tail(10)
                    exp_min = float(p_recent["MIN"].mean())
                    exp_pts = float(p_recent["PTS"].mean())
                    exp_ast = float(p_recent["AST"].mean())
                    exp_reb = float(p_recent["REB"].mean())
                    exp_pra = float((p_recent["PTS"] + p_recent["REB"] + p_recent["AST"]).mean())
                else:
                    # Player has no games played yet
                    exp_min = 0.0
                    exp_pts = 0.0
                    exp_ast = 0.0
                    exp_reb = 0.0
                    exp_pra = 0.0
                    
                core_expected_min.append(exp_min)
                core_expected_pts.append(exp_pts)
                core_expected_ast.append(exp_ast)
                core_expected_reb.append(exp_reb)
                core_expected_pra.append(exp_pra)
                
                if rank <= 3:
                    top3_expected_min.append(exp_min)
                    top3_expected_pts.append(exp_pts)
                    top3_expected_ast.append(exp_ast)
                    top3_expected_reb.append(exp_reb)
                    top3_expected_pra.append(exp_pra)
                    
                if not is_available:
                    missing_expected_min.append(exp_min)
                    missing_expected_pts.append(exp_pts)
                    missing_expected_ast.append(exp_ast)
                    missing_expected_reb.append(exp_reb)
                    missing_expected_pra.append(exp_pra)
            
            # Sums
            min_sum = sum(core_expected_min)
            matchup_features.update({
                f"{prefix}_CORE_PLAYERS_AVAILABLE_COUNT": avail_count,
                f"{prefix}_CORE_PLAYERS_MISSING_COUNT": missing_count,
                f"{prefix}_TOP1_AVAILABLE": top1_avail,
                f"{prefix}_TOP2_AVAILABLE": top2_avail,
                f"{prefix}_TOP3_AVAILABLE": top3_avail,
                f"{prefix}_CORE_EXPECTED_MIN_SUM": min_sum,
                f"{prefix}_TOP3_EXPECTED_MIN_SUM": sum(top3_expected_min),
                f"{prefix}_CORE_MINUTES_SHARE": min_sum / 240.0,
                f"{prefix}_CORE_EXPECTED_PTS_SUM": sum(core_expected_pts),
                f"{prefix}_CORE_EXPECTED_AST_SUM": sum(core_expected_ast),
                f"{prefix}_CORE_EXPECTED_REB_SUM": sum(core_expected_reb),
                f"{prefix}_CORE_EXPECTED_PRA_SUM": sum(core_expected_pra),
                f"{prefix}_TOP3_EXPECTED_PTS_SUM": sum(top3_expected_pts),
                f"{prefix}_TOP3_EXPECTED_AST_SUM": sum(top3_expected_ast),
                f"{prefix}_TOP3_EXPECTED_REB_SUM": sum(top3_expected_reb),
                f"{prefix}_TOP3_EXPECTED_PRA_SUM": sum(top3_expected_pra),
                f"{prefix}_MISSING_CORE_EXPECTED_MIN": sum(missing_expected_min),
                f"{prefix}_MISSING_CORE_EXPECTED_PTS": sum(missing_expected_pts),
                f"{prefix}_MISSING_CORE_EXPECTED_AST": sum(missing_expected_ast),
                f"{prefix}_MISSING_CORE_EXPECTED_REB": sum(missing_expected_reb),
                f"{prefix}_MISSING_CORE_EXPECTED_PRA": sum(missing_expected_pra)
            })
            
        new_features.append(matchup_features)
        
        if (idx + 1) % 100 == 0:
            print(f"Processed {idx + 1} / {len(merged)} matchups...")
            
    df_new_feats = pd.DataFrame(new_features)
    final_df = pd.concat([merged.reset_index(drop=True), df_new_feats], axis=1)
    
    # Save the processed dataset
    os.makedirs(OUTPUT_PATH.parent, exist_ok=True)
    # Write back GAME_DATE as string format YYYY-MM-DD
    final_df["GAME_DATE"] = final_df["GAME_DATE"].dt.strftime("%Y-%m-%d")
    final_df.to_csv(OUTPUT_PATH, index=False)
    print(f"Saved enhanced dataset to {OUTPUT_PATH} (Shape: {final_df.shape})")

if __name__ == "__main__":
    main()
