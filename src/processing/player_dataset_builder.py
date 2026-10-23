import os
import pandas as pd
from src.processing.cleaning import regulation_team_minutes
from src.features.player_form import RAW_GAME_COLUMNS, add_player_form_features
import numpy as np
from pathlib import Path

from src.core.data_paths import get_data_paths

from src.features.continuous_elo import ContinuousEloEngine

def compute_team_features(seasons):
    team_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        team_path = Path(dp.team_games_raw)
        if not team_path.exists():
            continue
        team_dfs.append(pd.read_csv(team_path))
        
    if not team_dfs:
        raise FileNotFoundError("No team raw games files found.")
        
    df_team = pd.concat(team_dfs, ignore_index=True)
    
    if "Game_ID" in df_team.columns:
        df_team = df_team.rename(columns={"Game_ID": "GAME_ID"})
    df_team["GAME_ID"] = df_team["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    df_team["GAME_DATE"] = pd.to_datetime(df_team["GAME_DATE"].astype(str).str[:10], errors='coerce')
    
    if "IS_HOME" not in df_team.columns and "MATCHUP" in df_team.columns:
        df_team["IS_HOME"] = df_team["MATCHUP"].astype(str).str.contains("vs.", case=False, na=False)
    if "OPPONENT_ABBREVIATION" not in df_team.columns and "MATCHUP" in df_team.columns:
        df_team["OPPONENT_ABBREVIATION"] = df_team["MATCHUP"].astype(str).str.split().str[-1]

    df_team = df_team.sort_values("GAME_DATE").reset_index(drop=True)
    
    df_team["MIN"] = regulation_team_minutes(df_team["MIN"]).fillna(240)
    df_team["GAME_PACE"] = (df_team["FGA"] + 0.44 * df_team["FTA"] - df_team["OREB"] + df_team["TOV"]) / (df_team["MIN"] / 5) * 48
    
    df_team["TEAM_PACE"] = df_team.groupby("TEAM_ABBREVIATION")["GAME_PACE"].transform(
        lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
    )
    
    # Continuous multi-season Elo calculation
    engine = ContinuousEloEngine()
    df_elo_team = engine.transform_games(df_team)
    df_team["TEAM_ELO"] = df_elo_team["PRE_GAME_ELO"]
    df_team["OPP_ELO"] = df_elo_team["OPP_PRE_GAME_ELO"]
    
    df_team_feats = df_team[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE", "GAME_DATE", "TEAM_ELO", "OPP_ELO"]].copy()
    
    opp_pace = df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE"]].copy()
    opp_pace = opp_pace.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", "TEAM_PACE": "OPP_TEAM_PACE"})
    
    return df_team_feats, opp_pace

def load_player_features(seasons):
    player_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        player_path = Path(dp.player_features)
        if not player_path.exists():
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

ALLOWANCE_WINDOW = 10


def add_usage_pct(df_player: pd.DataFrame) -> pd.DataFrame:
    """USG_PCT per player game from team totals of the same game (shared by training and live inference)."""
    df_player = df_player.copy()
    for col in ["MIN", "FGA", "FTA", "TOV"]:
        df_player[col] = pd.to_numeric(df_player[col], errors="coerce").fillna(0.0)

    team_totals = df_player.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[["MIN", "FGA", "FTA", "TOV"]].sum().reset_index()
    team_totals = team_totals.rename(columns={
        "MIN": "TEAM_MIN",
        "FGA": "TEAM_FGA",
        "FTA": "TEAM_FTA",
        "TOV": "TEAM_TOV"
    })

    df_player = df_player.merge(team_totals, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")

    denom = df_player["MIN"] * (df_player["TEAM_FGA"] + 0.44 * df_player["TEAM_FTA"] + df_player["TEAM_TOV"])
    num = 100 * (df_player["FGA"] + 0.44 * df_player["FTA"] + df_player["TOV"]) * (df_player["TEAM_MIN"] / 5.0)

    df_player["USG_PCT"] = np.where(denom > 0, num / denom, 0.0)
    return df_player


def position_totals_by_game(df_raw: pd.DataFrame, df_meta: pd.DataFrame):
    """PTS/REB/AST each team scored per position group in each game, keyed by the opponent (OPP_TEAM)."""
    df_raw = df_raw.copy()
    df_raw["TEAM"] = df_raw["MATCHUP"].str[:3]
    df_raw["OPP_TEAM"] = df_raw["MATCHUP"].str[-3:]
    df_raw['GAME_DATE'] = pd.to_datetime(df_raw['GAME_DATE'], format='mixed')

    df_raw = df_raw.merge(df_meta[["PLAYER_ID", "POSITION_GROUP"]], left_on="Player_ID", right_on="PLAYER_ID", how="left")
    df_raw["POSITION_GROUP"] = df_raw["POSITION_GROUP"].fillna("UNKNOWN")

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

    pivot_stats = pivot_stats.sort_values(["OPP_TEAM", "GAME_DATE"])
    stat_cols = [c for c in pivot_stats.columns if c.startswith("PTS_") or c.startswith("REB_") or c.startswith("AST_")]
    return pivot_stats, stat_cols


def allowance_column_names(stat_cols) -> dict:
    """PTS_GUARD -> OPP_GUARD_PTS_ALLOWED_LAST_10."""
    return {col: f"OPP_{col.split('_')[1]}_{col.split('_')[0]}_ALLOWED_LAST_{ALLOWANCE_WINDOW}" for col in stat_cols}


def build_player_dataset_v4(seasons=None, output_path=None, custom_metadata_df=None):
    if seasons is None:
        seasons = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
        
    root_dir = Path(__file__).resolve().parents[2]
    
    df_team_feats, opp_pace = compute_team_features(seasons)
    
    df_player = load_player_features(seasons)
    
    player_col = "Player_ID" if "Player_ID" in df_player.columns else "PLAYER_ID"
    df_player = df_player.sort_values([player_col, "GAME_DATE"]).reset_index(drop=True)
    
    df_player["TEAM_ABBREVIATION"] = df_player["MATCHUP"].str.split(" ").str[0]
    
    df_player = add_usage_pct(df_player)
    
    for col in ["PTS", "REB", "AST", "PLUS_MINUS"]:
        df_player[col] = pd.to_numeric(df_player[col], errors="coerce")
    # One definition of player form for training and live inference (cross-season, shift(1)).
    df_player = add_player_form_features(df_player, player_col).reset_index(drop=True)
    for raw, kept in RAW_GAME_COLUMNS.items():
        df_player[kept] = df_player[raw]
    
    df_player = df_player.merge(
        df_team_feats[["GAME_ID", "TEAM_ABBREVIATION", "TEAM_PACE", "TEAM_ELO", "OPP_ELO"]],
        on=["GAME_ID", "TEAM_ABBREVIATION"],
        how="left"
    )
    
    df_player = df_player.merge(
        opp_pace[["GAME_ID", "OPPONENT_ABBREVIATION", "OPP_TEAM_PACE"]],
        on=["GAME_ID", "OPPONENT_ABBREVIATION"],
        how="left"
    )
    
    df_player["ELO_DIFF"] = df_player["TEAM_ELO"] - df_player["OPP_ELO"]
    df_player["BLOWOUT_RISK_PROXY"] = df_player["ELO_DIFF"].abs()
    
    if custom_metadata_df is not None:
        df_meta = custom_metadata_df
    else:
        meta_path = root_dir / "data/reference/player_metadata.csv"
        if not meta_path.exists():
            raise FileNotFoundError(f"Player metadata not found at {meta_path}")
        df_meta = pd.read_csv(meta_path)
    
    df_player = df_player.merge(df_meta[["PLAYER_ID", "POSITION_GROUP"]], left_on=player_col, right_on="PLAYER_ID", how="left")
    df_player = df_player.rename(columns={"POSITION_GROUP": "PLAYER_POSITION_GROUP"})
    
    raw_player_dfs = []
    for s in seasons:
        dp = get_data_paths(s)
        raw_p_path = Path(dp.player_games_raw)
        if not raw_p_path.exists():
            continue
        raw_player_dfs.append(pd.read_csv(raw_p_path))
        
    df_raw = pd.concat(raw_player_dfs, ignore_index=True)
    
    pivot_stats, stat_cols = position_totals_by_game(df_raw, df_meta)

    rolling_features = []
    for opp_team, group in pivot_stats.groupby("OPP_TEAM"):
        group = group.sort_values("GAME_DATE")
        rolled = group[stat_cols].shift(1).rolling(window=ALLOWANCE_WINDOW, min_periods=1).mean()
        rolled = rolled.rename(columns=allowance_column_names(stat_cols))
        
        rolled["Game_ID"] = group["Game_ID"]
        rolled["OPP_TEAM"] = opp_team
        rolling_features.append(rolled)
        
    df_rolling = pd.concat(rolling_features, ignore_index=True)
    df_rolling["Game_ID"] = df_rolling["Game_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
    
    df_v4 = df_player.merge(df_rolling, left_on=["GAME_ID", "OPPONENT_ABBREVIATION"], right_on=["Game_ID", "OPP_TEAM"], how="left")
    
    if "OPP_TEAM" in df_v4.columns:
        df_v4 = df_v4.drop(columns=["OPP_TEAM"])
    if "Game_ID" in df_v4.columns:
        df_v4 = df_v4.drop(columns=["Game_ID"])
        
    new_cols = [c for c in df_rolling.columns if c.endswith("_LAST_10")]
    for col in new_cols:
        # These are pregame opponent tendencies. Backfilling or using a
        # whole-dataset mean imports future opponents' results into the past.
        # Leave unavailable early-season values missing; each fold's imputer
        # is fitted only on its training rows.
        df_v4[col] = pd.to_numeric(df_v4[col], errors="coerce")
        
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
    df_ready["GAME_DATE"] = df_ready["GAME_DATE"].dt.strftime("%Y-%m-%d")
    df_ready = df_ready.dropna(subset=["TARGET_PTS", "TARGET_REB", "TARGET_AST"])
    df_ready = df_ready.sort_values([player_col, "GAME_DATE"]).reset_index(drop=True)
    
    if output_path is None:
        output_path = root_dir / "data/training/player_model_ready.csv"
        
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    df_ready.to_csv(output_path, index=False)
    
    return df_ready
