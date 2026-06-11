import pandas as pd
from typing import Dict, Any

def build_opponent_features(team_features_df: pd.DataFrame) -> pd.DataFrame:
    """
    Creates opponent-based pre-game features by performing a self-merge on GAME_ID.
    
    Expected input columns:
        GAME_ID, TEAM_ID, DAYS_REST, IS_B2B, PTS_LAST_5, PTS_LAST_10, 
        WINRATE_LAST_5, WINRATE_LAST_10
        
    Engineered features:
        - OPP_DAYS_REST: Opponent's DAYS_REST
        - OPP_IS_B2B: Opponent's IS_B2B
        - OPP_PTS_LAST_5: Opponent's PTS_LAST_5
        - OPP_PTS_LAST_10: Opponent's PTS_LAST_10
        - OPP_WINRATE_LAST_5: Opponent's WINRATE_LAST_5
        - OPP_WINRATE_LAST_10: Opponent's WINRATE_LAST_10
        
    Args:
        team_features_df (pd.DataFrame): Team game logs with base features.
        
    Returns:
        pd.DataFrame: DataFrame containing original columns plus the new OPP_ features.
    """
    # 1. Self-merge on GAME_ID
    df_merged = team_features_df.merge(
        team_features_df,
        on="GAME_ID",
        suffixes=("", "_opp")
    )
    
    # 2. Filter out self-joins (each team joining with itself)
    df_filtered = df_merged[df_merged["TEAM_ID"] != df_merged["TEAM_ID_opp"]].reset_index(drop=True)
    
    # 3. Keep original team columns, and map opponent columns to new names
    opp_renames = {
        "DAYS_REST_opp": "OPP_DAYS_REST",
        "IS_B2B_opp": "OPP_IS_B2B",
        "PTS_LAST_5_opp": "OPP_PTS_LAST_5",
        "PTS_LAST_10_opp": "OPP_PTS_LAST_10",
        "WINRATE_LAST_5_opp": "OPP_WINRATE_LAST_5",
        "WINRATE_LAST_10_opp": "OPP_WINRATE_LAST_10",
        
        "PTS_ALLOWED_LAST_5_opp": "OPP_PTS_ALLOWED_LAST_5",
        "PTS_ALLOWED_LAST_10_opp": "OPP_PTS_ALLOWED_LAST_10",
        
        "HOME_WINRATE_LAST_5_opp": "OPP_HOME_WINRATE_LAST_5",
        "HOME_PTS_LAST_5_opp": "OPP_HOME_PTS_LAST_5",
        "HOME_PTS_ALLOWED_LAST_5_opp": "OPP_HOME_PTS_ALLOWED_LAST_5",
        "AWAY_WINRATE_LAST_5_opp": "OPP_AWAY_WINRATE_LAST_5",
        "AWAY_PTS_LAST_5_opp": "OPP_AWAY_PTS_LAST_5",
        "AWAY_PTS_ALLOWED_LAST_5_opp": "OPP_AWAY_PTS_ALLOWED_LAST_5",
        
        "H2H_GAMES_LAST_5_opp": "OPP_H2H_GAMES_LAST_5",
        "H2H_WINRATE_LAST_5_opp": "OPP_H2H_WINRATE_LAST_5",
        "H2H_PTS_LAST_5_opp": "OPP_H2H_PTS_LAST_5",
        "H2H_PTS_ALLOWED_LAST_5_opp": "OPP_H2H_PTS_ALLOWED_LAST_5",
        
        # Advanced Metrics Opponent mapping
        "PACE_LAST_5_opp": "OPP_PACE_LAST_5",
        "PACE_LAST_10_opp": "OPP_PACE_LAST_10",
        "OFF_RTG_LAST_5_opp": "OPP_OFF_RTG_LAST_5",
        "OFF_RTG_LAST_10_opp": "OPP_OFF_RTG_LAST_10",
        "DEF_RTG_LAST_5_opp": "OPP_DEF_RTG_LAST_5",
        "DEF_RTG_LAST_10_opp": "OPP_DEF_RTG_LAST_10",
        "NET_RTG_LAST_5_opp": "OPP_NET_RTG_LAST_5",
        "NET_RTG_LAST_10_opp": "OPP_NET_RTG_LAST_10"
    }
    
    # Verify columns exist before renaming
    valid_renames = {k: v for k, v in opp_renames.items() if k in df_filtered.columns}
    df_result = df_filtered.rename(columns=valid_renames)
    
    # 4. Drop suffix columns we don't need (those ending with _opp)
    cols_to_keep = [col for col in df_result.columns if not col.endswith("_opp")]
    df_result = df_result[cols_to_keep].copy()
    
    return df_result

def validate_opponent_join(
    df_before: pd.DataFrame, 
    df_after: pd.DataFrame
) -> Dict[str, Any]:
    """
    Performs validation checks on the opponent features merge.
    
    Args:
        df_before (pd.DataFrame): Dataset before joining.
        df_after (pd.DataFrame): Dataset after joining and filtering.
        
    Returns:
        Dict[str, Any]: Summary metrics of the validation.
    """
    rows_before = len(df_before)
    rows_after = len(df_after)
    
    # 1. Every GAME_ID has exactly two rows in the joined dataset
    game_counts = df_after["GAME_ID"].value_counts()
    invalid_games = game_counts[game_counts != 2]
    all_games_have_two_rows = len(invalid_games) == 0
    
    # 2. Opponent join success rate
    # A successful match means a row has a corresponding opponent row
    # The count of unique successfully matched rows
    matched_game_ids = set(df_after["GAME_ID"])
    matched_rows_count = df_before[df_before["GAME_ID"].isin(matched_game_ids)].shape[0]
    success_rate = (matched_rows_count / rows_before) * 100 if rows_before > 0 else 0.0
    
    # 3. Identify GAME_IDs that fail matching (no opponent row exists in input)
    input_game_ids = set(df_before["GAME_ID"])
    failed_game_ids = list(input_game_ids - matched_game_ids)
    
    # 4. Count missing opponent feature fields (NaN counts)
    opp_features = ["OPP_DAYS_REST", "OPP_IS_B2B", "OPP_PTS_LAST_5", "OPP_PTS_LAST_10", "OPP_WINRATE_LAST_5", "OPP_WINRATE_LAST_10"]
    missing_counts = {}
    for feat in opp_features:
        if feat in df_after.columns:
            missing_counts[feat] = int(df_after[feat].isnull().sum())
        else:
            missing_counts[feat] = rows_after  # completely missing column
            
    return {
        "rows_before": rows_before,
        "rows_after": rows_after,
        "all_games_have_two_rows": all_games_have_two_rows,
        "invalid_game_ids_count": len(invalid_games),
        "invalid_game_ids": list(invalid_games.index)[:10],  # show first 10
        "success_rate_percent": success_rate,
        "failed_game_ids": failed_game_ids,
        "missing_opponent_feature_counts": missing_counts
    }
