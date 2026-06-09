import sys
import os
import pandas as pd
from pathlib import Path

# Add project root to sys.path
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from scripts.season_utils import validate_season_data

def main():
    print("============================================================")
    print("🚀 RECOVERING 2024-25 MODEL-READY DATASETS (REGULAR SEASON) 🚀")
    print("============================================================")
    
    # 1. Load valid sources
    print("Loading valid experimental sources...")
    team_feats_path = ROOT / "data/experimental/team_games_features_2024_25.csv"
    player_feats_path = ROOT / "data/experimental/player_games_features_2024_25.csv"
    results_path = ROOT / "data/experimental/game_results_2024_25.csv"
    
    df_team = pd.read_csv(team_feats_path)
    df_player = pd.read_csv(player_feats_path)
    df_results = pd.read_csv(results_path)
    
    # 2. Strict Season Guards
    print("Running strict season guards...")
    validate_season_data(df_team, "2024-25")
    validate_season_data(df_player, "2024-25")
    validate_season_data(df_results, "2024-25")
    
    # 3. Filter to Regular Season only
    print("Filtering to Regular Season only...")
    df_team = df_team[df_team["SEASON_TYPE"] == "Regular Season"].copy()
    df_player = df_player[df_player["SEASON_TYPE"] == "Regular Season"].copy()
    df_results = df_results[df_results["SEASON_TYPE"] == "Regular Season"].copy()

    # 4. Generate WIN Model Ready Dataset
    from src.features.opponent_features import build_opponent_features
    from src.processing.model_dataset_builder import ALLOWED_COLUMNS_V2
    
    print("Building opponent features...")
    df_team_opp = build_opponent_features(df_team)
    
    # Select ALLOWED_COLUMNS_V2 but DO NOT dropna to preserve exactly 2460 rows
    existing_allowed = [c for c in ALLOWED_COLUMNS_V2 if c in df_team_opp.columns]
    df_win_base = df_team_opp[existing_allowed].copy()
    
    import scripts.data_paths
    import scripts.build_matchup_features
    
    original_get_data_paths = scripts.data_paths.get_data_paths
    df_player.to_csv(ROOT / "data/experimental/temp_player_games.csv", index=False)
    df_team.to_csv(ROOT / "data/experimental/temp_team_games.csv", index=False)
    
    def mock_get_data_paths_temp(season=None):
        dp = original_get_data_paths(season)
        dp.player_games_raw = str(ROOT / "data/experimental/temp_player_games.csv")
        dp.team_games_raw = str(ROOT / "data/experimental/temp_team_games.csv")
        return dp
        
    scripts.data_paths.get_data_paths = mock_get_data_paths_temp
    scripts.build_matchup_features.get_data_paths = mock_get_data_paths_temp
    
    print("Computing player features for each matchup...")
    rows = []
    from scripts.build_matchup_features import compute_player_features_for_inference
    
    for i, row in df_win_base.iterrows():
        home = row["TEAM_ABBREVIATION"]
        away = row["OPPONENT_ABBREVIATION"]
        pred_date = pd.to_datetime(row["GAME_DATE"]).strftime("%Y-%m-%d")
        try:
            p_feats = compute_player_features_for_inference(home, away, pred_date, season="2024-25")
        except Exception as e:
            p_feats = {}
        rows.append(p_feats)
        if (i+1) % 200 == 0:
            print(f"  Processed {i+1} matchups")
            
    df_player_feats = pd.DataFrame(rows)
    df_win_final = pd.concat([df_win_base.reset_index(drop=True), df_player_feats.reset_index(drop=True)], axis=1)
    
    # Drop leakage columns
    leakage = ["WL", "MIN", "PTS", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
               "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", "STL", "BLK",
               "TOV", "PF", "PLUS_MINUS", "PTS_ALLOWED"]
    drop_cols = [c for c in leakage if c in df_win_final.columns]
    drop_cols.extend([c for c in ["PLAYER_ID", "PLAYER_NAME"] if c in df_win_final.columns])
    df_win_final.drop(columns=drop_cols, inplace=True, errors="ignore")
    
    win_out = ROOT / "data/experimental/team_win_model_ready_v2_2024_25_valid.csv"
    df_win_final.to_csv(win_out, index=False)
    print(f"Saved Win Model dataset: {win_out} ({len(df_win_final)} rows)")
    
    # 5. Generate SCORE Model Ready Dataset
    print("Generating SCORE Model Ready dataset...")
    df_score = df_win_final.drop_duplicates(subset=["GAME_ID"]).copy()
    
    res_subset = df_results[["GAME_ID", "HOME_SCORE", "AWAY_SCORE"]].rename(
        columns={"HOME_SCORE": "HOME_PTS", "AWAY_SCORE": "AWAY_PTS"}
    )
    res_subset["GAME_ID"] = res_subset["GAME_ID"].astype(str).str.zfill(10)
    df_score["GAME_ID"] = df_score["GAME_ID"].astype(str).str.zfill(10)
    
    df_score_final = df_score.merge(res_subset, on="GAME_ID", how="inner")
    
    score_out = ROOT / "data/experimental/team_score_model_ready_v2_2024_25_valid.csv"
    df_score_final.to_csv(score_out, index=False)
    print(f"Saved Score Model dataset: {score_out} ({len(df_score_final)} rows)")

    # Cleanup temp files
    (ROOT / "data/experimental/temp_player_games.csv").unlink(missing_ok=True)
    (ROOT / "data/experimental/temp_team_games.csv").unlink(missing_ok=True)

if __name__ == "__main__":
    main()
