from typing import Dict, Any, Optional
import os
import glob
import pandas as pd
import numpy as np

from src.processing.pbp_cleaner import load_raw_pbp_json, clean_pbp_events
from src.processing.pbp_feature_extractor import extract_game_pbp_features


def build_season_pbp_features(season_dir: str) -> pd.DataFrame:
    """Scans raw play_by_play directory in season_dir and compiles PBP game features."""
    pbp_dir = os.path.join(season_dir, "raw", "play_by_play")
    if not os.path.exists(pbp_dir):
        return pd.DataFrame()
        
    json_files = glob.glob(os.path.join(pbp_dir, "*.json"))
    if not json_files:
        return pd.DataFrame()
        
    records = []
    for f in json_files:
        game_data = load_raw_pbp_json(f)
        if not game_data:
            continue
        df_events = clean_pbp_events(game_data)
        feat = extract_game_pbp_features(df_events)
        if feat:
            records.append(feat)
            
    if not records:
        return pd.DataFrame()
        
    df_pbp = pd.DataFrame(records)
    return df_pbp


def integrate_pbp_features(df_team_features: pd.DataFrame, season_dir: str) -> pd.DataFrame:
    """Merges PBP features into df_team_features with fallback for missing games."""
    df_pbp = build_season_pbp_features(season_dir)
    if df_pbp.empty or "GAME_ID" not in df_team_features.columns:
        # Fallback defaults
        df_team_features["GARBAGE_TIME_SHARE"] = 0.0
        df_team_features["CLUTCH_MARGIN"] = 0
        return df_team_features
        
    df_team = df_team_features.copy()
    orig_game_id = df_team["GAME_ID"].copy()
    df_team["_merge_game_id"] = df_team["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    df_pbp["_merge_game_id"] = df_pbp["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)

    pbp_cols = ["_merge_game_id", "GARBAGE_TIME_SHARE", "CLUTCH_MARGIN"]
    pbp_sub = df_pbp[pbp_cols].drop_duplicates(subset=["_merge_game_id"])
    df_merged = df_team.merge(pbp_sub, on="_merge_game_id", how="left")
    df_merged["GAME_ID"] = orig_game_id
    df_merged.drop(columns=["_merge_game_id"], inplace=True)
    df_merged["GARBAGE_TIME_SHARE"] = df_merged["GARBAGE_TIME_SHARE"].fillna(0.0)
    df_merged["CLUTCH_MARGIN"] = df_merged["CLUTCH_MARGIN"].fillna(0)
    return df_merged
