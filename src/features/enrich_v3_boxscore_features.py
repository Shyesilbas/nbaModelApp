#!/usr/bin/env python3
import os
import sys
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths
from src.core.season_utils import season_to_file_token
from src.features.boxscore_advanced_features import compute_team_boxscore_advanced_features

SEASONS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

def enrich_all_seasons(seasons=SEASONS):
    print("=== Enriching V3 Team Datasets with Advanced Boxscore Features ===")
    
    for season in seasons:
        token = season_to_file_token(season)
        dp = get_data_paths(season)
        
        raw_path = Path(dp.team_games_raw)
        v3_csv = Path(dp.team_model_ready)
        features_csv = Path(dp.team_features)
        
        if not raw_path.exists() or not v3_csv.exists():
            print(f"Skipping {season} (files missing)")
            continue
            
        print(f"Processing season {season}...")
        df_raw = pd.read_csv(raw_path)
        adv_feats = compute_team_boxscore_advanced_features(df_raw)
        
        # Ensure GAME_ID formatting
        adv_feats["GAME_ID"] = adv_feats["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
        
        # Columns to merge (excluding merge keys)
        new_cols = [c for c in adv_feats.columns if c not in ["GAME_ID", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION"]]
        
        # 1. Update team_model_ready_v3
        df_v3 = pd.read_csv(v3_csv)
        df_v3["GAME_ID"] = df_v3["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
        
        # Drop any existing new_cols to avoid duplicate columns
        existing_drop = [c for c in new_cols if c in df_v3.columns]
        if existing_drop:
            df_v3 = df_v3.drop(columns=existing_drop)
            
        df_v3_enriched = df_v3.merge(
            adv_feats[["GAME_ID", "TEAM_ABBREVIATION"] + new_cols],
            on=["GAME_ID", "TEAM_ABBREVIATION"],
            how="left"
        )
        
        df_v3_enriched.to_csv(v3_csv, index=False)
        print(f"  -> Saved team_model_ready_v3_{token} ({len(df_v3_enriched)} rows, {len(df_v3_enriched.columns)} columns)")
        
        # 2. Update team_features.csv if exists
        if features_csv.exists():
            df_feat = pd.read_csv(features_csv)
            df_feat["GAME_ID"] = df_feat["GAME_ID"].astype(str).apply(lambda x: x.split('.')[0].zfill(10))
            existing_feat_drop = [c for c in new_cols if c in df_feat.columns]
            if existing_feat_drop:
                df_feat = df_feat.drop(columns=existing_feat_drop)
            df_feat_enriched = df_feat.merge(
                adv_feats[["GAME_ID", "TEAM_ABBREVIATION"] + new_cols],
                on=["GAME_ID", "TEAM_ABBREVIATION"],
                how="left"
            )
            df_feat_enriched.to_csv(features_csv, index=False)
            print(f"  -> Updated {features_csv.name} ({len(df_feat_enriched)} rows, {len(df_feat_enriched.columns)} columns)")

    print(f"=== {len(seasons)} season(s) enriched with advanced boxscore features ===")

if __name__ == "__main__":
    enrich_all_seasons()
