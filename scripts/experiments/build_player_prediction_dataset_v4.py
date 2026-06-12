import os
import sys
import argparse
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT))

from scripts.data_paths import get_data_paths
from scripts.season_utils import season_to_file_token

def get_expected_score(elo_a, elo_b):
    return 1 / (1 + 10 ** ((elo_b - elo_a) / 400))

def update_elo(elo_a, elo_b, score_a, k=20):
    expected_a = get_expected_score(elo_a, elo_b)
    expected_b = 1 - expected_a
    score_b = 1 - score_a
    new_elo_a = elo_a + k * (score_a - expected_a)
    new_elo_b = elo_b + k * (score_b - expected_b)
    return new_elo_a, new_elo_b

def compute_team_features(seasons):
    print("Loading team raw games for seasons:", seasons)
    team_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        team_path = Path(dp.team_games_raw)
        if not team_path.exists():
            print(f"Warning: Team raw games path {team_path} not found.")
            continue
        team_dfs.append(pd.read_csv(team_path))
        
    if not team_dfs:
        raise FileNotFoundError("No team raw games files found.")
        
    df_team = pd.concat(team_dfs, ignore_index=True)
    
    # Clean up GAME_ID
    if "Game_ID" in df_team.columns:
        df_team = df_team.rename(columns={"Game_ID": "GAME_ID"})
    df_team["GAME_ID"] = df_team["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    df_team["GAME_DATE"] = pd.to_datetime(df_team["GAME_DATE"].astype(str).str[:10], errors='coerce')
    
    df_team = df_team.sort_values("GAME_DATE").reset_index(drop=True)
    
    # Compute Pace
    df_team["MIN"] = pd.to_numeric(df_team["MIN"], errors="coerce").fillna(240)
    df_team["GAME_PACE"] = (df_team["FGA"] + 0.44 * df_team["FTA"] - df_team["OREB"] + df_team["TOV"]) / (df_team["MIN"] / 5) * 48
    
    # Rolling pace (shifted by 1 to prevent leakage)
    df_team["TEAM_PACE"] = df_team.groupby("TEAM_ABBREVIATION")["GAME_PACE"].transform(
        lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
    )
    
    # Compute ELO chronologically game-by-game
    team_elos = {}
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
    opp_pace = df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE"]].copy()
    opp_pace = opp_pace.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", "TEAM_PACE": "OPP_TEAM_PACE"})
    
    return df_team_feats, opp_pace

def load_player_features(seasons):
    player_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        player_path = Path(dp.player_features)
        if not player_path.exists():
            print(f"Warning: Player features path {player_path} not found.")
            continue
        df = pd.read_csv(player_path)
        if "GAME_ID" in df.columns and "Game_ID" in df.columns:
            df = df.drop(columns=["Game_ID"])
        elif "Game_ID" in df.columns and "GAME_ID" not in df.columns:
            df = df.rename(columns={"Game_ID": "GAME_ID"})
            
        if "GAME_ID" in df.columns:
            df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
            
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"].astype(str).str[:10], errors='coerce')
        player_dfs.append(df)
        
    if not player_dfs:
        raise FileNotFoundError("No player feature files found.")
        
    return pd.concat(player_dfs, ignore_index=True)

def build_v4_dataset(seasons=None):
    if seasons is None:
        seasons = ["2024-25", "2025-26"]
        
    print("--- Building V4 Player Prediction Dataset (Usage Rate Feature Integration) ---")
    
    # 1. Compute Team Features
    df_team_feats, opp_pace = compute_team_features(seasons)
    
    # 2. Load Player Features (containing raw minutes, fga, fta, tov)
    print("Loading player features...")
    df_player = load_player_features(seasons)
    
    player_col = "Player_ID" if "Player_ID" in df_player.columns else "PLAYER_ID"
    df_player = df_player.sort_values([player_col, "GAME_DATE"]).reset_index(drop=True)
    
    # Parse TEAM_ABBREVIATION from MATCHUP
    df_player["TEAM_ABBREVIATION"] = df_player["MATCHUP"].str.split(" ").str[0]
    
    # Convert required columns for usage rate computation
    for col in ["MIN", "FGA", "FTA", "TOV"]:
        df_player[col] = pd.to_numeric(df_player[col], errors="coerce").fillna(0.0)
        
    # 3. Calculate Team Totals per Game for USG_PCT
    print("Calculating team totals for usage rate...")
    team_totals = df_player.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[["MIN", "FGA", "FTA", "TOV"]].sum().reset_index()
    team_totals = team_totals.rename(columns={
        "MIN": "TEAM_MIN",
        "FGA": "TEAM_FGA",
        "FTA": "TEAM_FTA",
        "TOV": "TEAM_TOV"
    })
    
    df_player = df_player.merge(team_totals, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    
    # Compute USG_PCT
    # USG_PCT = 100 * ((FGA + 0.44 * FTA + TOV) * (Team_MIN / 5)) / (Player_MIN * (Team_FGA + 0.44 * Team_FTA + Team_TOV))
    denom = df_player["MIN"] * (df_player["TEAM_FGA"] + 0.44 * df_player["TEAM_FTA"] + df_player["TEAM_TOV"])
    num = 100 * (df_player["FGA"] + 0.44 * df_player["FTA"] + df_player["TOV"]) * (df_player["TEAM_MIN"] / 5.0)
    
    df_player["USG_PCT"] = np.where(denom > 0, num / denom, 0.0)
    
    # 4. Compute Usage Rate Rolling Features (Shifted by 1 to prevent leakage)
    print("Computing rolling usage rate features...")
    grp_usg = df_player.groupby(player_col)["USG_PCT"]
    df_player["USG_PCT_LAST_3"] = grp_usg.transform(lambda x: x.shift(1).rolling(window=3, min_periods=1).mean())
    df_player["USG_PCT_LAST_10"] = grp_usg.transform(lambda x: x.shift(1).rolling(window=10, min_periods=1).mean())
    df_player["USG_PCT_EMA_5"] = grp_usg.transform(lambda x: x.shift(1).ewm(span=5, min_periods=1).mean())
    df_player["USG_PCT_EMA_10"] = grp_usg.transform(lambda x: x.shift(1).ewm(span=10, min_periods=1).mean())
    df_player["USG_PCT_STD_LAST_10"] = grp_usg.transform(lambda x: x.shift(1).rolling(window=10, min_periods=2).std())
    df_player["USG_PCT_TREND"] = df_player["USG_PCT_EMA_5"] - df_player["USG_PCT_EMA_10"]
    
    # 5. Compute Minutes Rolling Features
    print("Computing rolling minutes features...")
    grp_min = df_player.groupby(player_col)["MIN"]
    df_player["MIN_LAST_3"] = grp_min.transform(lambda x: x.shift(1).rolling(window=3, min_periods=1).mean())
    df_player["MIN_LAST_10"] = grp_min.transform(lambda x: x.shift(1).rolling(window=10, min_periods=1).mean())
    df_player["MIN_EMA_5"] = grp_min.transform(lambda x: x.shift(1).ewm(span=5, min_periods=1).mean())
    df_player["MIN_EMA_10"] = grp_min.transform(lambda x: x.shift(1).ewm(span=10, min_periods=1).mean())
    df_player["MIN_STD_LAST_10"] = grp_min.transform(lambda x: x.shift(1).rolling(window=10, min_periods=2).std())
    df_player["MIN_TREND"] = df_player["MIN_EMA_5"] - df_player["MIN_EMA_10"]
    
    # 6. Merge Team Features (ELO, Pace)
    print("Merging team features...")
    df_player = df_player.merge(
        df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE", "TEAM_ELO", "OPP_ELO"]],
        on=["GAME_ID", "TEAM_ABBREVIATION"],
        how="left"
    )
    
    # Merge Opponent Pace
    df_player = df_player.merge(
        opp_pace[["GAME_ID", "OPPONENT_ABBREVIATION", "OPP_TEAM_PACE"]],
        on=["GAME_ID", "OPPONENT_ABBREVIATION"],
        how="left"
    )
    
    # Derive Elo Diff and Blowout Risk Proxy
    df_player["ELO_DIFF"] = df_player["TEAM_ELO"] - df_player["OPP_ELO"]
    df_player["BLOWOUT_RISK_PROXY"] = df_player["ELO_DIFF"].abs()
    
    # 7. Merge Player Metadata Registry
    print("Merging player metadata registry...")
    meta_path = ROOT / "data/canonical/player_metadata.csv"
    if not meta_path.exists():
        raise FileNotFoundError(f"Player metadata not found at {meta_path}")
    df_meta = pd.read_csv(meta_path)
    
    df_player = df_player.merge(df_meta[["PLAYER_ID", "POSITION_GROUP"]], left_on=player_col, right_on="PLAYER_ID", how="left")
    df_player = df_player.rename(columns={"POSITION_GROUP": "PLAYER_POSITION_GROUP"})
    
    # 8. Load Raw Player Games for calculating Team-level position allowed stats
    print("Loading raw player games for matchup allowed features...")
    raw_player_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        raw_p_path = Path(dp.player_games_raw)
        if not raw_p_path.exists():
            print(f"Warning: Player games raw path {raw_p_path} not found.")
            continue
        raw_player_dfs.append(pd.read_csv(raw_p_path))
        
    df_raw = pd.concat(raw_player_dfs, ignore_index=True)
    
    df_raw["TEAM"] = df_raw["MATCHUP"].str[:3]
    df_raw["OPP_TEAM"] = df_raw["MATCHUP"].str[-3:]
    df_raw['GAME_DATE'] = pd.to_datetime(df_raw['GAME_DATE'], format='mixed')
    
    df_raw = df_raw.merge(df_meta[["PLAYER_ID", "POSITION_GROUP"]], left_on="Player_ID", right_on="PLAYER_ID", how="left")
    df_raw["POSITION_GROUP"] = df_raw["POSITION_GROUP"].fillna("UNKNOWN")
    
    print("Aggregating position stats per game...")
    pos_stats = df_raw.groupby(["Game_ID", "GAME_DATE", "TEAM", "OPP_TEAM", "POSITION_GROUP"]).agg({
        "PTS": "sum",
        "REB": "sum",
        "AST": "sum"
    }).reset_index()
    
    pivot_stats = pos_stats.pivot_table(
        index=["Game_ID", "GAME_DATE", "TEAM", "OPP_TEAM"],
        columns="POSITION_GROUP",
        values=["PTS", "REB", "AST"],
        fill_value=0
    ).reset_index()
    
    pivot_stats.columns = [f"{col[0]}_{col[1]}" if col[1] else col[0] for col in pivot_stats.columns]
    
    print("Calculating rolling 10-game allowed stats...")
    pivot_stats = pivot_stats.sort_values(["OPP_TEAM", "GAME_DATE"])
    stat_cols = [c for c in pivot_stats.columns if c.startswith("PTS_") or c.startswith("REB_") or c.startswith("AST_")]
    
    rolling_features = []
    for opp_team, group in pivot_stats.groupby("OPP_TEAM"):
        group = group.sort_values("GAME_DATE")
        rolled = group[stat_cols].shift(1).rolling(window=10, min_periods=1).mean()
        
        rename_dict = {col: f"OPP_{col.split('_')[1]}_{col.split('_')[0]}_ALLOWED_LAST_10" for col in stat_cols}
        rolled = rolled.rename(columns=rename_dict)
        
        rolled["Game_ID"] = group["Game_ID"]
        rolled["OPP_TEAM"] = opp_team
        rolling_features.append(rolled)
        
    df_rolling = pd.concat(rolling_features, ignore_index=True)
    
    # Clean GAME_ID of rolling features to ensure string format matching df_player
    df_rolling["Game_ID"] = df_rolling["Game_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    
    # 9. Merge features into player dataframe
    print("Merging allowed stats into player dataframe...")
    df_v4 = df_player.merge(df_rolling, left_on=["GAME_ID", "OPPONENT_ABBREVIATION"], right_on=["Game_ID", "OPP_TEAM"], how="left")
    
    if "OPP_TEAM" in df_v4.columns:
        df_v4 = df_v4.drop(columns=["OPP_TEAM"])
    if "Game_ID" in df_v4.columns:
        df_v4 = df_v4.drop(columns=["Game_ID"])
        
    new_cols = [c for c in df_rolling.columns if c.endswith("_LAST_10")]
    for col in new_cols:
        df_v4[col] = df_v4.groupby("OPPONENT_ABBREVIATION")[col].transform(lambda x: x.bfill())
        df_v4[col] = df_v4[col].fillna(df_v4[col].mean())
        
    # 10. Define targets and drop leakage columns
    df_v4["TARGET_PTS"] = df_v4["PTS"]
    df_v4["TARGET_REB"] = df_v4["REB"]
    df_v4["TARGET_AST"] = df_v4["AST"]
    
    leakage_cols = [
        "MIN", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
        "FTM", "FTA", "FT_PCT", "OREB", "DREB", "REB", "AST",
        "STL", "BLK", "TOV", "PF", "PTS", "PLUS_MINUS", "WL", "WIN",
        "TEAM_MIN", "TEAM_FGA", "TEAM_FTA", "TEAM_TOV", "USG_PCT"
    ]
    
    df_ready = df_v4.drop(columns=[c for c in leakage_cols if c in df_v4.columns])
    
    # Format date back to string for saving
    df_ready["GAME_DATE"] = df_ready["GAME_DATE"].dt.strftime("%Y-%m-%d")
    
    initial_len = len(df_ready)
    df_ready = df_ready.dropna(subset=["TARGET_PTS", "TARGET_REB", "TARGET_AST"])
    print(f"Dropped {initial_len - len(df_ready)} rows with null targets. Remaining: {len(df_ready)}")
    
    out_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    os.makedirs(out_path.parent, exist_ok=True)
    
    df_ready = df_ready.sort_values([player_col, "GAME_DATE"]).reset_index(drop=True)
    df_ready.to_csv(out_path, index=False)
    
    print(f"Done! V4 Dataset saved to {out_path} (Shape: {df_ready.shape})")
    print(f"New Features: USG_PCT_LAST_3, USG_PCT_LAST_10, USG_PCT_EMA_5, USG_PCT_EMA_10, USG_PCT_STD_LAST_10, USG_PCT_TREND")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build V4 player prediction dataset with Usage Rate features.")
    parser.add_argument("--season", type=str, default=None, help="Season string (e.g. 2024-25). If not specified, processes 2024-25 and 2025-26.")
    args = parser.parse_args()
    
    if args.season:
        build_v4_dataset(seasons=[args.season])
    else:
        build_v4_dataset()
