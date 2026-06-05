import pandas as pd
import numpy as np

def build_core_player_availability_features(
    team_features_df: pd.DataFrame,
    player_features_df: pd.DataFrame,
    core_players_df: pd.DataFrame
) -> pd.DataFrame:
    """
    Computes pre-game availability, minutes, and rolling stats for discovered core players,
    and joins opponent-level counterparts.
    
    Args:
        team_features_df (pd.DataFrame): Team-level games dataset.
        player_features_df (pd.DataFrame): Player-level games dataset.
        core_players_df (pd.DataFrame): Discovered core rosters dataframe.
        
    Returns:
        pd.DataFrame: Augmented team-level dataset with team & opponent core features.
    """
    team_features_df = team_features_df.copy()
    player_features_df = player_features_df.copy()
    
    # 1. Standardize IDs and abbreviations
    team_features_df["GAME_ID"] = team_features_df["GAME_ID"].astype(str)
    player_features_df["Game_ID"] = player_features_df["Game_ID"].astype(str)
    
    # Extract Team Abbreviation from player MATCHUP first token
    player_features_df["TEAM_ABBREVIATION"] = player_features_df["MATCHUP"].str.split().str[0]
    
    # 2. Merge player logs with the discovered core players (takes only core 1-5 players)
    df_player_core = player_features_df.merge(
        core_players_df, 
        on=["TEAM_ABBREVIATION", "PLAYER_NAME"],
        how="inner"
    )
    
    # Cast numerical columns to floats
    num_cols = ["MIN", "PTS_LAST_5", "AST_LAST_5", "REB_LAST_5", "MIN_LAST_5", "PLUS_MINUS_LAST_5"]
    for col in num_cols:
        if col in df_player_core.columns:
            df_player_core[col] = pd.to_numeric(df_player_core[col], errors="coerce").fillna(0.0)
            
    # 3. Aggregate for Top 3 (CORE_RANK <= 3)
    df_top3 = df_player_core[df_player_core["CORE_RANK"] <= 3]
    agg_top3 = df_top3.groupby(["Game_ID", "TEAM_ABBREVIATION"]).agg(
        TEAM_CORE_TOP3_PLAYED_COUNT=("PLAYER_NAME", "count"),
        TEAM_CORE_TOP3_MINUTES_SUM=("MIN", "sum"),
        TEAM_CORE_TOP3_PTS_LAST_5_SUM=("PTS_LAST_5", "sum"),
        TEAM_CORE_TOP3_AST_LAST_5_SUM=("AST_LAST_5", "sum"),
        TEAM_CORE_TOP3_REB_LAST_5_SUM=("REB_LAST_5", "sum"),
        TEAM_CORE_TOP3_MIN_LAST_5_SUM=("MIN_LAST_5", "sum"),
        TEAM_CORE_TOP3_PLUS_MINUS_LAST_5_SUM=("PLUS_MINUS_LAST_5", "sum")
    ).reset_index().rename(columns={"Game_ID": "GAME_ID"})
    
    # 4. Aggregate for Top 5 (CORE_RANK <= 5)
    df_top5 = df_player_core[df_player_core["CORE_RANK"] <= 5]
    agg_top5 = df_top5.groupby(["Game_ID", "TEAM_ABBREVIATION"]).agg(
        TEAM_CORE_TOP5_PLAYED_COUNT=("PLAYER_NAME", "count"),
        TEAM_CORE_TOP5_MINUTES_SUM=("MIN", "sum"),
        TEAM_CORE_TOP5_PTS_LAST_5_SUM=("PTS_LAST_5", "sum"),
        TEAM_CORE_TOP5_AST_LAST_5_SUM=("AST_LAST_5", "sum"),
        TEAM_CORE_TOP5_REB_LAST_5_SUM=("REB_LAST_5", "sum"),
        TEAM_CORE_TOP5_MIN_LAST_5_SUM=("MIN_LAST_5", "sum"),
        TEAM_CORE_TOP5_PLUS_MINUS_LAST_5_SUM=("PLUS_MINUS_LAST_5", "sum")
    ).reset_index().rename(columns={"Game_ID": "GAME_ID"})
    
    # 5. Join back to team dataset
    df_out = team_features_df.merge(agg_top3, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    df_out = df_out.merge(agg_top5, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    
    # 6. Fill NaNs and compute expected/missing/rate fields
    # Top 3
    df_out["TEAM_CORE_TOP3_EXPECTED_COUNT"] = 3
    df_out["TEAM_CORE_TOP3_PLAYED_COUNT"] = df_out["TEAM_CORE_TOP3_PLAYED_COUNT"].fillna(0).astype(int)
    df_out["TEAM_CORE_TOP3_MISSING_COUNT"] = 3 - df_out["TEAM_CORE_TOP3_PLAYED_COUNT"]
    df_out["TEAM_CORE_TOP3_AVAILABLE_RATE"] = df_out["TEAM_CORE_TOP3_PLAYED_COUNT"] / 3.0
    
    sum_cols_top3 = [
        "TEAM_CORE_TOP3_MINUTES_SUM", "TEAM_CORE_TOP3_PTS_LAST_5_SUM", "TEAM_CORE_TOP3_AST_LAST_5_SUM", 
        "TEAM_CORE_TOP3_REB_LAST_5_SUM", "TEAM_CORE_TOP3_MIN_LAST_5_SUM", "TEAM_CORE_TOP3_PLUS_MINUS_LAST_5_SUM"
    ]
    df_out[sum_cols_top3] = df_out[sum_cols_top3].fillna(0.0)
    
    # Top 5
    df_out["TEAM_CORE_TOP5_EXPECTED_COUNT"] = 5
    df_out["TEAM_CORE_TOP5_PLAYED_COUNT"] = df_out["TEAM_CORE_TOP5_PLAYED_COUNT"].fillna(0).astype(int)
    df_out["TEAM_CORE_TOP5_MISSING_COUNT"] = 5 - df_out["TEAM_CORE_TOP5_PLAYED_COUNT"]
    df_out["TEAM_CORE_TOP5_AVAILABLE_RATE"] = df_out["TEAM_CORE_TOP5_PLAYED_COUNT"] / 5.0
    
    sum_cols_top5 = [
        "TEAM_CORE_TOP5_MINUTES_SUM", "TEAM_CORE_TOP5_PTS_LAST_5_SUM", "TEAM_CORE_TOP5_AST_LAST_5_SUM", 
        "TEAM_CORE_TOP5_REB_LAST_5_SUM", "TEAM_CORE_TOP5_MIN_LAST_5_SUM", "TEAM_CORE_TOP5_PLUS_MINUS_LAST_5_SUM"
    ]
    df_out[sum_cols_top5] = df_out[sum_cols_top5].fillna(0.0)
    
    # 7. Self-merge to bring opponent player availability features side-by-side
    team_core_cols = [
        "TEAM_CORE_TOP3_EXPECTED_COUNT", "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_MISSING_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE",
        "TEAM_CORE_TOP5_EXPECTED_COUNT", "TEAM_CORE_TOP5_PLAYED_COUNT", "TEAM_CORE_TOP5_MISSING_COUNT", "TEAM_CORE_TOP5_AVAILABLE_RATE",
        "TEAM_CORE_TOP3_MINUTES_SUM", "TEAM_CORE_TOP5_MINUTES_SUM",
        "TEAM_CORE_TOP3_PTS_LAST_5_SUM", "TEAM_CORE_TOP3_AST_LAST_5_SUM", "TEAM_CORE_TOP3_REB_LAST_5_SUM", "TEAM_CORE_TOP3_MIN_LAST_5_SUM", "TEAM_CORE_TOP3_PLUS_MINUS_LAST_5_SUM",
        "TEAM_CORE_TOP5_PTS_LAST_5_SUM", "TEAM_CORE_TOP5_AST_LAST_5_SUM", "TEAM_CORE_TOP5_REB_LAST_5_SUM", "TEAM_CORE_TOP5_MIN_LAST_5_SUM", "TEAM_CORE_TOP5_PLUS_MINUS_LAST_5_SUM"
    ]
    
    df_self = df_out[["GAME_ID", "TEAM_ID"] + team_core_cols].copy()
    
    df_merged = df_out.merge(
        df_self,
        on="GAME_ID",
        suffixes=("", "_opp")
    )
    
    # Filter out self-joins
    df_filtered = df_merged[df_merged["TEAM_ID"] != df_merged["TEAM_ID_opp"]].reset_index(drop=True)
    
    # Rename opponent features: replace TEAM_CORE_ with OPP_CORE_
    opp_renames = {f"{col}_opp": col.replace("TEAM_CORE_", "OPP_CORE_") for col in team_core_cols}
    df_result = df_filtered.rename(columns=opp_renames)
    
    # Drop suffix opponent helper columns
    cols_to_keep = [col for col in df_result.columns if not col.endswith("_opp")]
    df_result = df_result[cols_to_keep].copy()
    
    return df_result
