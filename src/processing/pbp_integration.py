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


def integrate_pbp_features(df_team_features: pd.DataFrame, season_dir: Optional[str] = None) -> pd.DataFrame:
    """Merges PBP features into df_team_features with fallback for missing games."""
    df_team = df_team_features.copy()
    if "GAME_ID" not in df_team.columns:
        df_team["GARBAGE_TIME_SHARE"] = 0.0
        df_team["CLUTCH_MARGIN"] = 0.0
        return df_team

    from src.features.pbp_situational import load_situational_lookup
    situational_map = load_situational_lookup()

    team_col = "TEAM_ABBREVIATION" if "TEAM_ABBREVIATION" in df_team.columns else ("TEAM_ID" if "TEAM_ID" in df_team.columns else None)

    clean_margins = []
    clutch_margins = []
    garbage_shares = []

    gids = df_team["GAME_ID"].astype(str).str.split(".").str[0].str.strip().str.zfill(10)
    teams = df_team[team_col].astype(str).str.strip() if team_col else [""] * len(df_team)
    if "PTS" in df_team.columns:
        pts = pd.to_numeric(df_team["PTS"], errors="coerce").fillna(0)
    else:
        pts = pd.Series([0.0] * len(df_team), index=df_team.index)

    if "PTS_ALLOWED" in df_team.columns:
        pts_allowed = pd.to_numeric(df_team["PTS_ALLOWED"], errors="coerce").fillna(0)
    else:
        pts_allowed = pd.Series([0.0] * len(df_team), index=df_team.index)


    for gid, team, p, pa in zip(gids, teams, pts, pts_allowed):
        data = situational_map.get((gid, team))
        if data:
            clean_margins.append(float(data["CLEAN_MARGIN"]))
            clutch_margins.append(float(data["CLUTCH_MARGIN"]))
            garbage_shares.append(float(data["GARBAGE_TIME_SHARE"]))
        else:
            clean_margins.append(float(p - pa))
            clutch_margins.append(0.0)
            garbage_shares.append(0.0)

    df_team["CLEAN_MARGIN"] = clean_margins
    df_team["CLUTCH_MARGIN"] = clutch_margins
    df_team["GARBAGE_TIME_SHARE"] = garbage_shares

    # Calculate Clean and Clutch Net Ratings
    if "POSS" in df_team.columns:
        poss = pd.to_numeric(df_team["POSS"], errors="coerce").replace(0, np.nan)
    else:
        poss = pd.Series([np.nan] * len(df_team), index=df_team.index)
    df_team["CLEAN_NET_RTG"] = 100.0 * (df_team["CLEAN_MARGIN"] / poss)
    df_team["CLUTCH_NET_RTG"] = 100.0 * (df_team["CLUTCH_MARGIN"] / poss)


    # Fallbacks
    if "NET_RTG" in df_team.columns:
        df_team["CLEAN_NET_RTG"] = df_team["CLEAN_NET_RTG"].fillna(df_team["NET_RTG"])
    df_team["CLUTCH_NET_RTG"] = df_team["CLUTCH_NET_RTG"].fillna(0.0)

    # Rolling averages (shifted by 1 to prevent data leakage)
    if team_col:
        for metric in ["CLEAN_NET_RTG", "CLUTCH_NET_RTG", "GARBAGE_TIME_SHARE"]:
            df_team[f"{metric}_LAST_5"] = df_team.groupby(team_col)[metric].transform(
                lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
            )
            df_team[f"{metric}_LAST_10"] = df_team.groupby(team_col)[metric].transform(
                lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
            )

    return df_team

