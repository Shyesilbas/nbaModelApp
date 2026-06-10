import pandas as pd
import numpy as np

def compute_possessions(df: pd.DataFrame) -> pd.Series:
    """Compute POSS using proxy formula.
    Uses only historical rows; caller must ensure df is filtered for rows prior to the target game.
    """
    return df['FGA'] + 0.44 * df['FTA'] - df['OREB'] + df['TOV']

def compute_offensive_rating(df: pd.DataFrame, poss: pd.Series) -> pd.Series:
    """OFF_RTG = 100 * PTS / POSS"""
    # avoid division by zero
    return 100 * df['PTS'] / poss.replace(0, np.nan)

def compute_defensive_rating(df: pd.DataFrame, opp_poss: pd.Series) -> pd.Series:
    """DEF_RTG = 100 * PTS_ALLOWED / OPP_POSS"""
    return 100 * df['PTS_ALLOWED'] / opp_poss.replace(0, np.nan)

def compute_pace(poss: pd.Series, opp_poss: pd.Series) -> pd.Series:
    """PACE = (POSS + OPP_POSS) / 2 when both available, else POSS"""
    return (poss + opp_poss) / 2

def add_rolling_features(df: pd.DataFrame, col: str, windows: list[int]) -> pd.DataFrame:
    """Add LAST_N and EMA_N rolling features for a given column.
    Assumes df is sorted by GAME_DATE per TEAM_ABBREVIATION and contains a column with name `col`.
    All features are shifted by 1 to avoid leakage.
    """
    for w in windows:
        # LAST_N
        df[f"{col}_LAST_{w}"] = df.groupby('TEAM_ABBREVIATION')[col].transform(
            lambda x: x.shift(1).rolling(window=w, min_periods=1).mean()
        )
        # EMA_N using pandas ewm (span = N)
        df[f"{col}_EMA_{w}"] = df.groupby('TEAM_ABBREVIATION')[col].transform(
            lambda x: x.shift(1).ewm(span=w, adjust=False).mean()
        )
    return df

def add_opponent_features(df: pd.DataFrame, feature_prefixes: list[str]) -> pd.DataFrame:
    """Self‑join to add opponent versions of the given feature prefixes.
    Expects columns: GAME_ID, TEAM_ABBREVIATION, OPPONENT_ABBREVIATION and the feature columns.
    """
    opp_df = df[['GAME_ID', 'TEAM_ABBREVIATION', 'OPPONENT_ABBREVIATION'] + 
                  [f"{p}_LAST_5" for p in feature_prefixes] +
                  [f"{p}_LAST_10" for p in feature_prefixes] +
                  [f"{p}_EMA_5" for p in feature_prefixes] +
                  [f"{p}_EMA_10" for p in feature_prefixes]
                 ].copy()
    # rename opponent columns with OPP_ prefix
    rename_map = {col: f"OPP_{col}" for col in opp_df.columns if col not in ['GAME_ID', 'OPPONENT_ABBREVIATION']}
    opp_df = opp_df.rename(columns=rename_map)
    # merge on GAME_ID and opponent abbreviation
    merged = df.merge(
        opp_df,
        left_on=['GAME_ID', 'OPPONENT_ABBREVIATION'],
        right_on=['GAME_ID', 'OPPONENT_ABBREVIATION'],
        how='left',
        suffixes=('','_dup')
    )
    return merged

def drop_raw_efficiency_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove raw POSS, OFF_RTG, DEF_RTG, PACE columns to enforce leakage rule."""
    return df.drop(columns=[c for c in ['POSS','OFF_RTG','DEF_RTG','PACE'] if c in df.columns])
