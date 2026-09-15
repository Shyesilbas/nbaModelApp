from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Mapping, Optional
import numpy as np
import pandas as pd


def compute_team_boxscore_advanced_features(df_raw: pd.DataFrame) -> pd.DataFrame:
    """
    Computes leakage-free advanced box score features for NBA team games.
    All rolling and expanding features are strictly shifted by 1.
    
    Expected raw columns:
        GAME_ID, GAME_DATE, TEAM_ABBREVIATION, OPPONENT_ABBREVIATION,
        PTS, FGM, FGA, FG3M, FG3A, FG3_PCT, FTM, FTA,
        OREB, DREB, REB, AST, STL, BLK, TOV, PF
    """
    df = df_raw.copy()
    team_col = "TEAM_ABBREVIATION" if "TEAM_ABBREVIATION" in df.columns else "TEAM_ID"
    
    if "GAME_DATE" in df.columns:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    if team_col in df.columns and "GAME_DATE" in df.columns:
        df = df.sort_values(by=[team_col, "GAME_DATE"]).reset_index(drop=True)
        
    if "GAME_ID" in df.columns:
        df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10))
        
    if "OPPONENT_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
        df["OPPONENT_ABBREVIATION"] = df["MATCHUP"].str.split().str[-1]

    # Numeric conversions
    box_cols = ["PTS", "FGM", "FGA", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", "PF"]
    for c in box_cols:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    # Estimate possessions if not present: 0.96 * (FGA + 0.44 * FTA - OREB + TOV)
    if "POSS" not in df.columns and all(c in df.columns for c in ["FGA", "FTA", "OREB", "TOV"]):
        df["POSS"] = 0.96 * (df["FGA"] + 0.44 * df["FTA"] - df["OREB"] + df["TOV"])
    elif "POSS" in df.columns:
        df["POSS"] = pd.to_numeric(df["POSS"], errors="coerce").fillna(100.0)
    else:
        df["POSS"] = 100.0

    poss_safe = df["POSS"].replace(0, np.nan)
    pts_safe = df["PTS"].replace(0, np.nan)
    fgm_safe = df["FGM"].replace(0, np.nan)
    fga_safe = df["FGA"].replace(0, np.nan)
    tov_safe = df["TOV"].replace(0, np.nan)

    # 1. Playmaking & Ball Security Ratios (Single Game)
    df["AST_TO_TOV"] = df["AST"] / tov_safe
    df["AST_TO_FGM"] = df["AST"] / fgm_safe

    # 2. Defensive Havoc & Discipline (Single Game)
    df["HAVOC_RATE"] = (df["STL"] + df["BLK"]) / poss_safe
    df["FOUL_RATE"] = df["PF"] / poss_safe

    # 3. Scoring Diet Shares (Single Game)
    df["PTS_SHARE_3PT"] = (df["FG3M"] * 3.0) / pts_safe
    df["PTS_SHARE_PAINT"] = ((df["FGM"] - df["FG3M"]) * 2.0) / pts_safe
    df["PTS_SHARE_FT"] = df["FTM"] / pts_safe

    # 4. Map Opponent Box Stats for Def/Margin features
    opp_map = df[["GAME_ID", "TEAM_ABBREVIATION", "FGA", "FG3A", "FTM"]].copy()
    opp_map = opp_map.rename(columns={
        "FGA": "OPP_FGA_TMP",
        "FG3A": "OPP_FG3A_TMP",
        "FTM": "OPP_FTM_TMP"
    })
    df = df.merge(
        opp_map,
        left_on=["GAME_ID", "OPPONENT_ABBREVIATION"],
        right_on=["GAME_ID", "TEAM_ABBREVIATION"],
        how="left",
        suffixes=("", "_opp_drop")
    )
    if "TEAM_ABBREVIATION_opp_drop" in df.columns:
        df = df.drop(columns=["TEAM_ABBREVIATION_opp_drop"])

    df["FT_MARGIN"] = df["FTM"] - df.get("OPP_FTM_TMP", 0.0)
    opp_2pa_safe = (df.get("OPP_FGA_TMP", 0.0) - df.get("OPP_FG3A_TMP", 0.0)).replace(0, np.nan)
    df["BLOCK_RATE"] = df["BLK"] / opp_2pa_safe

    drop_tmps = [c for c in df.columns if c.endswith("_TMP")]
    df = df.drop(columns=drop_tmps)

    # 5. 3-Point Shooting Luck & Regression to Mean
    df["FG3_PCT_CALC"] = np.where(df["FG3A"] > 0, df["FG3M"] / fga_safe, 0.35)
    df["FG3_PCT_LAST_5"] = df.groupby(team_col)["FG3_PCT_CALC"].transform(
        lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
    )
    df["FG3_PCT_SEASON_AVG"] = df.groupby(team_col)["FG3_PCT_CALC"].transform(
        lambda x: x.shift(1).expanding(min_periods=1).mean()
    )
    df["FG3_REGRESSION_DELTA"] = (df["FG3_PCT_LAST_5"] - df["FG3_PCT_SEASON_AVG"]).fillna(0.0)

    # 6. Rolling Shifted Features (Strictly shifted by 1)
    rolling_target_cols = [
        "AST_TO_TOV", "AST_TO_FGM", "HAVOC_RATE", "FOUL_RATE",
        "FT_MARGIN", "BLOCK_RATE", "PTS_SHARE_3PT", "PTS_SHARE_PAINT", "PTS_SHARE_FT"
    ]
    for col in rolling_target_cols:
        df[f"{col}_LAST_5"] = df.groupby(team_col)[col].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        ).fillna(0.0)
        df[f"{col}_LAST_10"] = df.groupby(team_col)[col].transform(
            lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
        ).fillna(0.0)

    # 7. Generate Opponent (OPP_) Features via Self-Merge
    feature_cols = ["FG3_REGRESSION_DELTA"] + [f"{c}_LAST_5" for c in rolling_target_cols] + [f"{c}_LAST_10" for c in rolling_target_cols]
    opp_features = df[["GAME_ID", "TEAM_ABBREVIATION"] + feature_cols].copy()
    rename_dict = {c: f"OPP_{c}" for c in feature_cols}
    rename_dict["TEAM_ABBREVIATION"] = "OPPONENT_ABBREVIATION"
    opp_features = opp_features.rename(columns=rename_dict)

    df = df.merge(
        opp_features,
        on=["GAME_ID", "OPPONENT_ABBREVIATION"],
        how="left"
    )

    keep_cols = ["GAME_ID", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION"] + feature_cols + [f"OPP_{c}" for c in feature_cols]
    return df[keep_cols].copy()


def enrich_matchup_boxscore_features(
    home_row: Mapping[str, object],
    away_row: Mapping[str, object]
) -> Dict[str, float]:
    """
    Computes advanced box score features for inference from home and away team historical rows.
    """
    res = {}
    cols = [
        "FG3_REGRESSION_DELTA", "AST_TO_TOV_LAST_5", "AST_TO_TOV_LAST_10",
        "AST_TO_FGM_LAST_5", "AST_TO_FGM_LAST_10", "HAVOC_RATE_LAST_5",
        "HAVOC_RATE_LAST_10", "FOUL_RATE_LAST_5", "FOUL_RATE_LAST_10",
        "FT_MARGIN_LAST_5", "FT_MARGIN_LAST_10", "BLOCK_RATE_LAST_5", "BLOCK_RATE_LAST_10",
        "PTS_SHARE_3PT_LAST_5", "PTS_SHARE_3PT_LAST_10", "PTS_SHARE_PAINT_LAST_5",
        "PTS_SHARE_PAINT_LAST_10", "PTS_SHARE_FT_LAST_5", "PTS_SHARE_FT_LAST_10"
    ]
    defaults = {
        "FG3_REGRESSION_DELTA": 0.0,
        "AST_TO_TOV_LAST_5": 1.8,
        "AST_TO_TOV_LAST_10": 1.8,
        "AST_TO_FGM_LAST_5": 0.60,
        "AST_TO_FGM_LAST_10": 0.60,
        "HAVOC_RATE_LAST_5": 0.12,
        "HAVOC_RATE_LAST_10": 0.12,
        "FOUL_RATE_LAST_5": 0.19,
        "FOUL_RATE_LAST_10": 0.19,
        "FT_MARGIN_LAST_5": 0.0,
        "FT_MARGIN_LAST_10": 0.0,
        "BLOCK_RATE_LAST_5": 0.08,
        "BLOCK_RATE_LAST_10": 0.08,
        "PTS_SHARE_3PT_LAST_5": 0.35,
        "PTS_SHARE_3PT_LAST_10": 0.35,
        "PTS_SHARE_PAINT_LAST_5": 0.45,
        "PTS_SHARE_PAINT_LAST_10": 0.45,
        "PTS_SHARE_FT_LAST_5": 0.18,
        "PTS_SHARE_FT_LAST_10": 0.18,
    }
    for c in cols:
        def_val = defaults.get(c, 0.0)
        h_val = float(home_row.get(c, def_val)) if pd.notna(home_row.get(c)) else def_val
        a_val = float(away_row.get(c, def_val)) if pd.notna(away_row.get(c)) else def_val
        res[c] = h_val
        res[f"OPP_{c}"] = a_val
    return res
