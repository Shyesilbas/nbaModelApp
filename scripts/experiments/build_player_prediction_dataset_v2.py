import os
import sys
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def get_expected_score(elo_a, elo_b):
    return 1 / (1 + 10 ** ((elo_b - elo_a) / 400))

def update_elo(elo_a, elo_b, score_a, k=20):
    expected_a = get_expected_score(elo_a, elo_b)
    expected_b = 1 - expected_a
    score_b = 1 - score_a
    new_elo_a = elo_a + k * (score_a - expected_a)
    new_elo_b = elo_b + k * (score_b - expected_b)
    return new_elo_a, new_elo_b

def compute_team_features():
    print("Loading team raw games...")
    raw_24 = pd.read_csv(ROOT / "data/raw/team_games/nba_team_games_2024_25_regular_and_playoffs.csv")
    raw_25 = pd.read_csv(ROOT / "data/raw/team_games/nba_team_games_2025_26_regular_and_playoffs.csv")
    df_team = pd.concat([raw_24, raw_25], ignore_index=True)
    
    # Clean up GAME_ID
    if "Game_ID" in df_team.columns:
        df_team = df_team.rename(columns={"Game_ID": "GAME_ID"})
    df_team["GAME_ID"] = df_team["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    df_team["GAME_DATE"] = pd.to_datetime(df_team["GAME_DATE"].astype(str).str[:10], errors='coerce')
    
    df_team = df_team.sort_values("GAME_DATE").reset_index(drop=True)
    
    # Compute Pace
    # (FGA + 0.44 * FTA - OREB + TOV) / (MIN / 5) * 48
    # Team MIN in raw games is usually team total minutes (e.g. 240)
    df_team["MIN"] = pd.to_numeric(df_team["MIN"], errors="coerce").fillna(240)
    df_team["GAME_PACE"] = (df_team["FGA"] + 0.44 * df_team["FTA"] - df_team["OREB"] + df_team["TOV"]) / (df_team["MIN"] / 5) * 48
    
    # To properly compute rolling pace and ELO, we process chronologically
    team_elos = {}
    
    # To get rolling pace, we can group by team and use rolling
    df_team["TEAM_PACE"] = df_team.groupby("TEAM_ABBREVIATION")["GAME_PACE"].transform(
        lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
    )
    
    # For ELO, we must iterate game by game. Since team games has 2 rows per game, we can iterate unique games
    unique_games = df_team[["GAME_ID", "GAME_DATE"]].drop_duplicates().sort_values("GAME_DATE")
    
    pre_game_elos = []
    
    for _, row in unique_games.iterrows():
        game_id = row["GAME_ID"]
        game_rows = df_team[df_team["GAME_ID"] == game_id]
        if len(game_rows) != 2:
            continue
            
        team_a_idx = game_rows.index[0]
        team_b_idx = game_rows.index[1]
        
        team_a = game_rows.loc[team_a_idx, "TEAM_ABBREVIATION"]
        team_b = game_rows.loc[team_b_idx, "TEAM_ABBREVIATION"]
        
        elo_a = team_elos.get(team_a, 1500)
        elo_b = team_elos.get(team_b, 1500)
        
        pre_game_elos.append({"GAME_ID": game_id, "TEAM_ABBREVIATION": team_a, "TEAM_ELO": elo_a, "OPP_ELO": elo_b})
        pre_game_elos.append({"GAME_ID": game_id, "TEAM_ABBREVIATION": team_b, "TEAM_ELO": elo_b, "OPP_ELO": elo_a})
        
        wl_a = game_rows.loc[team_a_idx, "WL"]
        score_a = 1 if wl_a == "W" else 0
        
        new_elo_a, new_elo_b = update_elo(elo_a, elo_b, score_a)
        team_elos[team_a] = new_elo_a
        team_elos[team_b] = new_elo_b
        
    df_elo = pd.DataFrame(pre_game_elos)
    df_team_feats = df_team[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE", "GAME_DATE"]].merge(df_elo, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    
    # Get Opponent Pace
    # Cross join game_id to get opp pace
    opp_pace = df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE"]].copy()
    opp_pace = opp_pace.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", "TEAM_PACE": "OPP_TEAM_PACE"})
    
    # The player datasets don't reliably have GAME_ID as 10-char everywhere so we'll merge on GAME_DATE, TEAM_ABBREVIATION, OPPONENT_ABBREVIATION
    # Wait, we can merge opp_pace onto df_team_feats
    
    return df_team_feats, opp_pace

def load_player_features(season):
    if season == "2024_25":
        features_path = ROOT / "data/experimental/player_games_features_2024_25.csv"
    else:
        features_path = ROOT / "data/features/player_games_features_2025_26.csv"
        
    df = pd.read_csv(features_path)
    
    if "GAME_ID" in df.columns and "Game_ID" in df.columns:
        df = df.drop(columns=["Game_ID"])
    elif "Game_ID" in df.columns and "GAME_ID" not in df.columns:
        df = df.rename(columns={"Game_ID": "GAME_ID"})
        
    if "GAME_ID" in df.columns:
        df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
        
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"].astype(str).str[:10], errors='coerce')
    return df

def build_v2_dataset():
    print("Computing team ELO and PACE...")
    df_team_feats, opp_pace = compute_team_features()
    
    print("Loading player features...")
    df_24 = load_player_features("2024_25")
    df_25 = load_player_features("2025_26")
    df_player = pd.concat([df_24, df_25], ignore_index=True)
    
    # 1. Player Minute Features
    print("Computing minute features...")
    player_col = "Player_ID" if "Player_ID" in df_player.columns else "PLAYER_ID"
    df_player = df_player.sort_values([player_col, "GAME_DATE"]).reset_index(drop=True)
    
    df_player["MIN"] = pd.to_numeric(df_player["MIN"], errors="coerce")
    
    grp = df_player.groupby(player_col)["MIN"]
    df_player["MIN_LAST_3"] = grp.transform(lambda x: x.shift(1).rolling(3, min_periods=1).mean())
    df_player["MIN_LAST_10"] = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=1).mean())
    df_player["MIN_EMA_5"] = grp.transform(lambda x: x.shift(1).ewm(span=5, min_periods=1).mean())
    df_player["MIN_EMA_10"] = grp.transform(lambda x: x.shift(1).ewm(span=10, min_periods=1).mean())
    df_player["MIN_STD_LAST_10"] = grp.transform(lambda x: x.shift(1).rolling(10, min_periods=2).std())
    df_player["MIN_TREND"] = df_player["MIN_EMA_5"] - df_player["MIN_EMA_10"]
    
    # 2. Merge Team Features
    print("Merging team features...")
    # Map TEAM_ABBREVIATION from MATCHUP
    # e.g., "LAL vs. MIN" -> TEAM_ABBREVIATION=LAL, OPPONENT=MIN
    # Already have IS_HOME and OPPONENT_ABBREVIATION in df_player. 
    # But do we have TEAM_ABBREVIATION? Let's extract it.
    df_player["TEAM_ABBREVIATION"] = df_player["MATCHUP"].str.split(" ").str[0]
    
    # Merge TEAM_ELO, OPP_ELO, TEAM_PACE
    df_player = df_player.merge(
        df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE", "TEAM_ELO", "OPP_ELO"]],
        on=["GAME_ID", "TEAM_ABBREVIATION"],
        how="left"
    )
    
    # Merge OPP_TEAM_PACE
    df_player = df_player.merge(
        opp_pace[["GAME_ID", "OPPONENT_ABBREVIATION", "OPP_TEAM_PACE"]],
        on=["GAME_ID", "OPPONENT_ABBREVIATION"],
        how="left"
    )
    
    # Derive Elo Diff and Blowout Risk Proxy
    df_player["ELO_DIFF"] = df_player["TEAM_ELO"] - df_player["OPP_ELO"]
    df_player["BLOWOUT_RISK_PROXY"] = df_player["ELO_DIFF"].abs()
    
    # 3. Create targets and drop leakages
    df_player["TARGET_PTS"] = df_player["PTS"]
    df_player["TARGET_REB"] = df_player["REB"]
    df_player["TARGET_AST"] = df_player["AST"]
    df_player["TARGET_PRA"] = df_player["PTS"] + df_player["REB"] + df_player["AST"]
    
    leakage_cols = [
        "MIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", 
        "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST", 
        "STL", "BLK", "TOV", "PF", "PTS", "PLUS_MINUS", "WL", "WIN"
    ]
    
    df_ready = df_player.drop(columns=[c for c in leakage_cols if c in df_player.columns])
    
    initial_len = len(df_ready)
    df_ready = df_ready.dropna(subset=["TARGET_PTS", "TARGET_REB", "TARGET_AST", "TARGET_PRA"])
    print(f"Dropped {initial_len - len(df_ready)} rows with null targets. Remaining: {len(df_ready)}")
    
    # Format date back to string for saving
    df_ready["GAME_DATE"] = df_ready["GAME_DATE"].dt.strftime("%Y-%m-%d")
    
    output_path = ROOT / "data/experimental/player_model_ready_v2_extended.csv"
    df_ready.to_csv(output_path, index=False)
    print(f"Successfully saved V2 dataset to {output_path} (Shape: {df_ready.shape})")

if __name__ == "__main__":
    build_v2_dataset()
