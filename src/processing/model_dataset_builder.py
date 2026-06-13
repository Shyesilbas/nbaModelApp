import pandas as pd
from typing import Tuple

ALLOWED_COLUMNS = [
    "TEAM_ID",
    "TEAM_ABBREVIATION",
    "TEAM_NAME",
    "GAME_ID",
    "GAME_DATE",
    "MATCHUP",
    "OPPONENT_ABBREVIATION",
    "IS_HOME",
    "IS_PLAYOFF",
    "IS_ELIMINATION_GAME",
    "CAN_CLINCH_SERIES",
    "DAYS_REST",
    "IS_B2B",
    "PTS_LAST_5",
    "PTS_LAST_10",
    "WINRATE_LAST_5",
    "WINRATE_LAST_10",
    "WIN"
]

ROLLING_FEATURE_COLUMNS = [
    "DAYS_REST",
    "PTS_LAST_5",
    "PTS_LAST_10",
    "WINRATE_LAST_5",
    "WINRATE_LAST_10"
]

def build_team_model_dataset(team_features_df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Filters the team features DataFrame down to model-ready pre-game features,
    drops rows containing NaN values in rolling features (e.g., early season games),
    and retains metadata columns.
    
    Args:
        team_features_df (pd.DataFrame): The team game logs after feature engineering.
        
    Returns:
        Tuple[pd.DataFrame, int]:
            - Cleaned model-ready DataFrame.
            - Count of rows that were dropped due to NaN values in rolling features.
    """
    # Create copy and filter columns that exist in the dataframe
    existing_allowed_cols = [col for col in ALLOWED_COLUMNS if col in team_features_df.columns]
    df_filtered = team_features_df[existing_allowed_cols].copy()
    
    # Identify how many rows will be dropped due to NaNs in the rolling features
    rows_before = len(df_filtered)
    
    # Drop rows that have NaN in the rolling features (subset selection)
    existing_rolling_cols = [col for col in ROLLING_FEATURE_COLUMNS if col in df_filtered.columns]
    df_model_ready = df_filtered.dropna(subset=existing_rolling_cols).reset_index(drop=True)
    
    rows_after = len(df_model_ready)
    dropped_count = rows_before - rows_after
    
    print("=" * 60)
    print("BUILDING TEAM MODEL-READY DATASET")
    print("=" * 60)
    print(f"Original Row Count: {rows_before}")
    print(f"Cleaned Row Count:  {rows_after}")
    print(f"Dropped Row Count (NaN Rolling features): {dropped_count}")
    print(f"Selected Columns ({len(df_model_ready.columns)}): {list(df_model_ready.columns)}")
    print("=" * 60 + "\n")
    
    return df_model_ready, dropped_count

ALLOWED_COLUMNS_V2 = ALLOWED_COLUMNS + [
    "OPP_DAYS_REST",
    "OPP_IS_B2B",
    "OPP_PTS_LAST_5",
    "OPP_PTS_LAST_10",
    "OPP_WINRATE_LAST_5",
    "OPP_WINRATE_LAST_10",
    
    # Defensive rolling features
    "PTS_ALLOWED_LAST_5",
    "PTS_ALLOWED_LAST_10",
    "OPP_PTS_ALLOWED_LAST_5",
    "OPP_PTS_ALLOWED_LAST_10",
    
    # Home/Away form features
    "HOME_WINRATE_LAST_5",
    "HOME_PTS_LAST_5",
    "HOME_PTS_ALLOWED_LAST_5",
    "AWAY_WINRATE_LAST_5",
    "AWAY_PTS_LAST_5",
    "AWAY_PTS_ALLOWED_LAST_5",
    
    "OPP_HOME_WINRATE_LAST_5",
    "OPP_HOME_PTS_LAST_5",
    "OPP_HOME_PTS_ALLOWED_LAST_5",
    "OPP_AWAY_WINRATE_LAST_5",
    "OPP_AWAY_PTS_LAST_5",
    "OPP_AWAY_PTS_ALLOWED_LAST_5",
    
    # Head-to-Head features
    "H2H_GAMES_LAST_5",
    "H2H_WINRATE_LAST_5",
    "H2H_PTS_LAST_5",
    "H2H_PTS_ALLOWED_LAST_5",
    
    "OPP_H2H_GAMES_LAST_5",
    "OPP_H2H_WINRATE_LAST_5",
    "OPP_H2H_PTS_LAST_5",
    "OPP_H2H_PTS_ALLOWED_LAST_5"
]

ROLLING_FEATURE_COLUMNS_V2 = ROLLING_FEATURE_COLUMNS + [
    "OPP_DAYS_REST",
    "OPP_PTS_LAST_5",
    "OPP_PTS_LAST_10",
    "OPP_WINRATE_LAST_5",
    "OPP_WINRATE_LAST_10",
    
    "PTS_ALLOWED_LAST_5",
    "PTS_ALLOWED_LAST_10",
    "OPP_PTS_ALLOWED_LAST_5",
    "OPP_PTS_ALLOWED_LAST_10",
    
    "HOME_WINRATE_LAST_5",
    "HOME_PTS_LAST_5",
    "HOME_PTS_ALLOWED_LAST_5",
    "AWAY_WINRATE_LAST_5",
    "AWAY_PTS_LAST_5",
    "AWAY_PTS_ALLOWED_LAST_5",
    
    "OPP_HOME_WINRATE_LAST_5",
    "OPP_HOME_PTS_LAST_5",
    "OPP_HOME_PTS_ALLOWED_LAST_5",
    "OPP_AWAY_WINRATE_LAST_5",
    "OPP_AWAY_PTS_LAST_5",
    "OPP_AWAY_PTS_ALLOWED_LAST_5",
    
    # Drop NaNs if H2H stats are NaN (we only require H2H winrate to be valid, 
    # since early season H2H may not have occurred yet, we drop games where H2H is not established)
    "H2H_WINRATE_LAST_5",
    "H2H_PTS_LAST_5",
    "H2H_PTS_ALLOWED_LAST_5",
    
    "OPP_H2H_WINRATE_LAST_5",
    "OPP_H2H_PTS_LAST_5",
    "OPP_H2H_PTS_ALLOWED_LAST_5"
]

def build_team_model_dataset_v2(team_features_with_opp_df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Filters the team features (with opponent features merged) down to v2 model-ready 
    pre-game features, drops rows containing NaN values in rolling features (for either
    team or opponent), and retains metadata.
    
    Args:
        team_features_with_opp_df (pd.DataFrame): Team game logs after opponent join.
        
    Returns:
        Tuple[pd.DataFrame, int]:
            - Cleaned model-ready v2 DataFrame.
            - Count of rows that were dropped due to NaN values in rolling features.
    """
    # Create copy and filter columns that exist in the dataframe
    existing_allowed_cols = [col for col in ALLOWED_COLUMNS_V2 if col in team_features_with_opp_df.columns]
    df_filtered = team_features_with_opp_df[existing_allowed_cols].copy()
    
    # Identify how many rows will be dropped due to NaNs in the rolling features
    rows_before = len(df_filtered)
    
    # Drop rows that have NaN in the rolling features for team or opponent (subset selection)
    existing_rolling_cols = [col for col in ROLLING_FEATURE_COLUMNS_V2 if col in df_filtered.columns]
    df_model_ready = df_filtered.dropna(subset=existing_rolling_cols).reset_index(drop=True)
    
    rows_after = len(df_model_ready)
    dropped_count = rows_before - rows_after
    
    print("=" * 60)
    print("BUILDING TEAM MODEL-READY DATASET V2 (OPPONENT-AWARE)")
    print("=" * 60)
    print(f"Original Row Count: {rows_before}")
    print(f"Cleaned Row Count:  {rows_after}")
    print(f"Dropped Row Count (NaN Rolling/Opp features): {dropped_count}")
    print(f"Selected Columns ({len(df_model_ready.columns)}): {list(df_model_ready.columns)}")
    print("=" * 60 + "\n")
    
    return df_model_ready, dropped_count

ALLOWED_COLUMNS_V3 = ALLOWED_COLUMNS_V2 + [
    "TEAM_CORE_TOP3_EXPECTED_COUNT",
    "TEAM_CORE_TOP3_PLAYED_COUNT",
    "TEAM_CORE_TOP3_MISSING_COUNT",
    "TEAM_CORE_TOP3_AVAILABLE_RATE",
    "TEAM_CORE_TOP5_EXPECTED_COUNT",
    "TEAM_CORE_TOP5_PLAYED_COUNT",
    "TEAM_CORE_TOP5_MISSING_COUNT",
    "TEAM_CORE_TOP5_AVAILABLE_RATE",
    "TEAM_CORE_TOP3_MINUTES_SUM",
    "TEAM_CORE_TOP5_MINUTES_SUM",
    "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
    "TEAM_CORE_TOP3_AST_LAST_5_SUM",
    "TEAM_CORE_TOP3_REB_LAST_5_SUM",
    "TEAM_CORE_TOP3_MIN_LAST_5_SUM",
    "TEAM_CORE_TOP3_PLUS_MINUS_LAST_5_SUM",
    "TEAM_CORE_TOP5_PTS_LAST_5_SUM",
    "TEAM_CORE_TOP5_AST_LAST_5_SUM",
    "TEAM_CORE_TOP5_REB_LAST_5_SUM",
    "TEAM_CORE_TOP5_MIN_LAST_5_SUM",
    "TEAM_CORE_TOP5_PLUS_MINUS_LAST_5_SUM",
    "OPP_CORE_TOP3_EXPECTED_COUNT",
    "OPP_CORE_TOP3_PLAYED_COUNT",
    "OPP_CORE_TOP3_MISSING_COUNT",
    "OPP_CORE_TOP3_AVAILABLE_RATE",
    "OPP_CORE_TOP5_EXPECTED_COUNT",
    "OPP_CORE_TOP5_PLAYED_COUNT",
    "OPP_CORE_TOP5_MISSING_COUNT",
    "OPP_CORE_TOP5_AVAILABLE_RATE",
    "OPP_CORE_TOP3_MINUTES_SUM",
    "OPP_CORE_TOP5_MINUTES_SUM",
    "OPP_CORE_TOP3_PTS_LAST_5_SUM",
    "OPP_CORE_TOP3_AST_LAST_5_SUM",
    "OPP_CORE_TOP3_REB_LAST_5_SUM",
    "OPP_CORE_TOP3_MIN_LAST_5_SUM",
    "OPP_CORE_TOP3_PLUS_MINUS_LAST_5_SUM",
    "OPP_CORE_TOP5_PTS_LAST_5_SUM",
    "OPP_CORE_TOP5_REB_LAST_5_SUM",
    "OPP_CORE_TOP5_MIN_LAST_5_SUM",
    "OPP_CORE_TOP5_PLUS_MINUS_LAST_5_SUM",
    
    # V3 Advanced Metrics & Rolling Averages
    "PACE", "OFF_RTG", "DEF_RTG", "NET_RTG",
    "PACE_LAST_5", "PACE_LAST_10", 
    "OFF_RTG_LAST_5", "OFF_RTG_LAST_10",
    "DEF_RTG_LAST_5", "DEF_RTG_LAST_10",
    "NET_RTG_LAST_5", "NET_RTG_LAST_10",
    
    "OPP_PACE_LAST_5", "OPP_PACE_LAST_10",
    "OPP_OFF_RTG_LAST_5", "OPP_OFF_RTG_LAST_10",
    "OPP_DEF_RTG_LAST_5", "OPP_DEF_RTG_LAST_10",
    "OPP_NET_RTG_LAST_5", "OPP_NET_RTG_LAST_10"
]

ROLLING_FEATURE_COLUMNS_V3 = ROLLING_FEATURE_COLUMNS_V2 + [
    "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "NET_RTG_LAST_5",
    "OPP_PACE_LAST_5", "OPP_OFF_RTG_LAST_5", "OPP_DEF_RTG_LAST_5", "OPP_NET_RTG_LAST_5"
]

def build_team_model_dataset_v3(team_features_with_core_df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Filters the team features (with opponent and core player availability features merged) 
    down to v3 model-ready pre-game features, drops rows containing NaN values in rolling features
    (for either team or opponent), and retains metadata.
    
    Args:
        team_features_with_core_df (pd.DataFrame): Team game logs after opponent and core features joins.
        
    Returns:
        Tuple[pd.DataFrame, int]:
            - Cleaned model-ready v3 DataFrame.
            - Count of rows that were dropped due to NaN values in rolling features.
    """
    # Create copy and filter columns that exist in the dataframe
    existing_allowed_cols = [col for col in ALLOWED_COLUMNS_V3 if col in team_features_with_core_df.columns]
    df_filtered = team_features_with_core_df[existing_allowed_cols].copy()
    
    # Identify how many rows will be dropped due to NaNs in the rolling features
    rows_before = len(df_filtered)
    
    # Drop rows that have NaN in the rolling features (subset selection)
    existing_rolling_cols = [col for col in ROLLING_FEATURE_COLUMNS_V3 if col in df_filtered.columns]
    df_model_ready = df_filtered.dropna(subset=existing_rolling_cols).reset_index(drop=True)
    
    rows_after = len(df_model_ready)
    dropped_count = rows_before - rows_after
    
    print("=" * 60)
    print("BUILDING TEAM MODEL-READY DATASET V3 (CORE PLAYERS AWARE)")
    print("=" * 60)
    print(f"Original Row Count: {rows_before}")
    print(f"Cleaned Row Count:  {rows_after}")
    print(f"Dropped Row Count (NaN Rolling/Opp features): {dropped_count}")
    print(f"Selected Columns ({len(df_model_ready.columns)}): {list(df_model_ready.columns)}")
    print("=" * 60 + "\n")
    
    return df_model_ready, dropped_count

