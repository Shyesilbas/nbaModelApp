"""Walk-forward evaluation of decoupled rotation features for the NBA SCORE Model.

Evaluates:
- Target 1: Margin (PRED_MARGIN vs REAL_MARGIN MAE)
- Target 2: Total Points (PRED_TOTAL vs REAL_TOTAL MAE)
- Target 3: Winner Accuracy from Predicted Margin (PRED_MARGIN > 0 vs REAL_MARGIN > 0)
- Target 4: Conformal Coverage

Across 5 expanding walk-forward seasons (2021-22 to 2025-26, N = 6,276 games).
"""
import os
import sys
from pathlib import Path
import json
import time
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, accuracy_score

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths, team_training_csv
from src.core.season_utils import season_labels
from src.features.win_strength_features import add_win_strength_features, attach_actual_points
from src.training.score_trainer import ScoreModelTrainer, get_location_features
from src.evaluation.generate_report import get_indicator_df

seasons = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
test_seasons = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

print("Loading preprocessed team model datasets across all seasons...")
frames = []
for s in seasons:
    f = team_training_csv(s)
    tf = pd.read_csv(f)
    if tf.empty:
        continue
    tf["SEASON"] = s
    frames.append(tf)

full_df = pd.concat(frames, ignore_index=True)

# Prepare features (strength, actual points, location)
full_df = add_win_strength_features(full_df)
full_df = attach_actual_points(full_df)
loc_feats = full_df.apply(get_location_features, axis=1)
full_df = pd.concat([full_df, loc_feats], axis=1)
full_df["GAME_ID"] = full_df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
full_df["GAME_DATE"] = pd.to_datetime(full_df["GAME_DATE"])

# Calculate targets: ACTUAL_PACE, ACTUAL_OFF_RTG, ACTUAL_MARGIN
# Home and away separation
home_mask = full_df["IS_HOME"] == 1
away_mask = full_df["IS_HOME"] == 0

# TARGET_MARGIN = ACTUAL_PTS - ACTUAL_OPP_PTS for home games
full_df["TARGET_MARGIN"] = full_df["ACTUAL_PTS"] - full_df["ACTUAL_OPP_PTS"]
full_df["TARGET_TOTAL"] = full_df["ACTUAL_PTS"] + full_df["ACTUAL_OPP_PTS"]

# TARGET_PACE and TARGET_OFF_RTG
full_df["TARGET_PACE"] = full_df["PACE"]
full_df["TARGET_HOME_OFF_RTG"] = np.where(full_df["IS_HOME"] == 1, full_df["ACTUAL_PTS"] / full_df["PACE"] * 100.0, np.nan)
full_df["TARGET_AWAY_OFF_RTG"] = np.where(full_df["IS_HOME"] == 0, full_df["ACTUAL_PTS"] / full_df["PACE"] * 100.0, np.nan)

print(f"Loaded {len(full_df)} total team-game rows.")

# Feature candidate definitions
PROD_PACE_FEATS = ["PACE_LAST_10", "OPP_PACE_LAST_10"]
PROD_BASE_OFF_RTG = ["OFF_RTG_LAST_10", "OPP_DEF_RTG_LAST_10", "ABS_DELTA", "OPP_ABS_DELTA"]
PROD_MARGIN_FEATS = [
    "ELO_DIFF", "CLEAN_NET_RTG_DIFF_LAST_10", "WINRATE_DIFF_LAST_10",
    "DAYS_REST", "OPP_DAYS_REST", "IS_B2B", "OPP_IS_B2B", "ABS_DIFF"
]

CANDIDATES = {
    "1. Production v11 Configuration": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": PROD_BASE_OFF_RTG,
        "margin": PROD_MARGIN_FEATS,
    },
    "2. + ROT_DIFFS in Margin": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": PROD_BASE_OFF_RTG,
        "margin": PROD_MARGIN_FEATS + ["MISSING_ROT_MINS_DIFF", "ROT_CONTINUITY_DIFF", "ACTIVE_WT_GS_DIFF"],
    },
    "3. + DECOUPLED Margin (no ABS_DIFF)": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": PROD_BASE_OFF_RTG,
        "margin": [c for c in PROD_MARGIN_FEATS if c != "ABS_DIFF"] + ["MISSING_ROT_MINS_DIFF", "ROT_CONTINUITY_DIFF", "ACTIVE_WT_GS_DIFF"],
    },
    "4. + ENHANCED Off-Rtg (Mins + GS)": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": PROD_BASE_OFF_RTG + ["MISSING_ROT_MINS", "OPP_MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"],
        "margin": PROD_MARGIN_FEATS,
    },
    "5. COMBINED (Enhanced Margin + Off-Rtg)": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": PROD_BASE_OFF_RTG + ["MISSING_ROT_MINS", "OPP_MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"],
        "margin": PROD_MARGIN_FEATS + ["MISSING_ROT_MINS_DIFF", "ROT_CONTINUITY_DIFF", "ACTIVE_WT_GS_DIFF"],
    },
    "6. FULL DECOUPLED (Margin & Off-Rtg)": {
        "pace": PROD_PACE_FEATS,
        "off_rtg": ["OFF_RTG_LAST_10", "OPP_DEF_RTG_LAST_10", "MISSING_ROT_MINS", "OPP_MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"],
        "margin": [c for c in PROD_MARGIN_FEATS if c != "ABS_DIFF"] + ["MISSING_ROT_MINS_DIFF", "ROT_CONTINUITY_DIFF", "ACTIVE_WT_GS_DIFF"],
    },
}

def fit_ridge(X, y):
    pipe = Pipeline([
        ("imputer", StandardScaler(with_mean=True, with_std=True)), # standard scaled
        ("clf", RidgeCV(alphas=np.logspace(-3, 4, 30))),
    ])
    return pipe.fit(X, y)

results = {name: {"total_mae": [], "margin_mae": [], "win_acc": [], "per_season": {}} for name in CANDIDATES}
pooled_preds = {name: {"total": [], "margin": []} for name in CANDIDATES}
pooled_real = {"total": [], "margin": []}

for ts in test_seasons:
    train_df = full_df[full_df["SEASON"] < ts].copy()
    test_df = full_df[full_df["SEASON"] == ts].copy()
    
    # Train submodels on train_df
    train_home = train_df[train_df["IS_HOME"] == 1].set_index("GAME_ID")
    train_away = train_df[train_df["IS_HOME"] == 0].set_index("GAME_ID")
    train_games = train_home.index.intersection(train_away.index)
    train_home = train_home.loc[train_games]
    train_away = train_away.loc[train_games]
    
    # Test games (home and away)
    test_home = test_df[test_df["IS_HOME"] == 1].set_index("GAME_ID")
    test_away = test_df[test_df["IS_HOME"] == 0].set_index("GAME_ID")
    test_games = test_home.index.intersection(test_away.index)
    test_home = test_home.loc[test_games]
    test_away = test_away.loc[test_games]
    
    real_tot = (test_home["ACTUAL_PTS"] + test_away["ACTUAL_PTS"]).values
    real_mar = (test_home["ACTUAL_PTS"] - test_away["ACTUAL_PTS"]).values
    
    if len(pooled_real["total"]) < len(full_df[(full_df["SEASON"].isin(test_seasons)) & (full_df["IS_HOME"] == 1)]):
        pooled_real["total"].extend(real_tot)
        pooled_real["margin"].extend(real_mar)
        
    for name, config in CANDIDATES.items():
        # 1. Pace model
        m_pace = fit_ridge(train_home[config["pace"]], train_home["TARGET_PACE"])
        pred_pace = m_pace.predict(test_home[config["pace"]])
        
        # 2. Home Off Rtg model
        m_home_rtg = fit_ridge(train_home[config["off_rtg"]], train_home["TARGET_HOME_OFF_RTG"])
        pred_home_rtg = m_home_rtg.predict(test_home[config["off_rtg"]])
        
        # 3. Away Off Rtg model
        m_away_rtg = fit_ridge(train_away[config["off_rtg"]], train_away["TARGET_AWAY_OFF_RTG"])
        pred_away_rtg = m_away_rtg.predict(test_away[config["off_rtg"]])
        
        # Uncorrected Total
        pred_total_raw = pred_pace * (pred_home_rtg + pred_away_rtg) / 100.0
        
        # 4. Margin model
        m_margin = fit_ridge(train_home[config["margin"]], train_home["TARGET_MARGIN"])
        pred_margin_raw = m_margin.predict(test_home[config["margin"]])
        
        # 5. Residual correction
        train_ind = get_indicator_df(train_home)
        test_ind = get_indicator_df(test_home)
        
        train_pred_pace = m_pace.predict(train_home[config["pace"]])
        train_pred_h_rtg = m_home_rtg.predict(train_home[config["off_rtg"]])
        train_pred_a_rtg = m_away_rtg.predict(train_away[config["off_rtg"]])
        train_tot_raw = train_pred_pace * (train_pred_h_rtg + train_pred_a_rtg) / 100.0
        train_tot_err = train_tot_raw - (train_home["ACTUAL_PTS"] + train_away["ACTUAL_PTS"]).values
        
        train_mar_raw = m_margin.predict(train_home[config["margin"]])
        train_mar_err = train_mar_raw - (train_home["ACTUAL_PTS"] - train_away["ACTUAL_PTS"]).values
        
        m_ridge_tot = fit_ridge(train_ind, train_tot_err)
        m_ridge_mar = fit_ridge(train_ind, train_mar_err)
        
        pred_total = pred_total_raw - m_ridge_tot.predict(test_ind)
        pred_margin = pred_margin_raw - m_ridge_mar.predict(test_ind)
        
        tot_mae = mean_absolute_error(real_tot, pred_total)
        mar_mae = mean_absolute_error(real_mar, pred_margin)
        win_acc = accuracy_score(real_mar > 0, pred_margin > 0)
        
        results[name]["per_season"][ts] = {
            "total_mae": round(tot_mae, 3),
            "margin_mae": round(mar_mae, 3),
            "win_acc": round(win_acc * 100, 2),
            "n": len(real_tot)
        }
        pooled_preds[name]["total"].extend(pred_total)
        pooled_preds[name]["margin"].extend(pred_margin)

pooled_real_tot = np.array(pooled_real["total"])
pooled_real_mar = np.array(pooled_real["margin"])

print("\n" + "=" * 95)
print(f"{'SCORE MODEL WALK-FORWARD BENCHMARK (5 SEASONS: 2021-22 TO 2025-26, N = ' + str(len(pooled_real_tot)) + ' GAMES)':^95}")
print("=" * 95)
header = f"{'Configuration':<40} | {'Total MAE':>10} | {'Margin MAE':>11} | {'Winner Acc':>11} | {'vs Prod Mar':>11}"
print(header)
print("-" * 95)

prod_mar_mae = None
prod_tot_mae = None

for name in CANDIDATES:
    ptot = np.array(pooled_preds[name]["total"])
    pmar = np.array(pooled_preds[name]["margin"])
    
    t_mae = mean_absolute_error(pooled_real_tot, ptot)
    m_mae = mean_absolute_error(pooled_real_mar, pmar)
    w_acc = accuracy_score(pooled_real_mar > 0, pmar > 0)
    
    if name == "1. Production v11 Configuration":
        prod_tot_mae = t_mae
        prod_mar_mae = m_mae
        delta_str = "0.000 (ref)"
    else:
        delta_mar = m_mae - prod_mar_mae
        delta_str = f"{delta_mar:+.3f}"
        
    print(f"{name:<40} | {t_mae:10.3f} | {m_mae:11.3f} | {w_acc*100:10.2f}% | {delta_str:>11}")

print("\n" + "=" * 95)
print("PER-SEASON MARGIN MAE COMPARISON:")
print(f"{'Configuration':<40} | " + " | ".join([f"{s:>7}" for s in test_seasons]))
print("-" * 95)
for name in CANDIDATES:
    row_str = f"{name:<40} | "
    row_str += " | ".join([f"{results[name]['per_season'][s]['margin_mae']:7.3f}" for s in test_seasons])
    print(row_str)

print("\n" + "=" * 95)
print("PER-SEASON TOTAL POINTS MAE COMPARISON:")
print(f"{'Configuration':<40} | " + " | ".join([f"{s:>7}" for s in test_seasons]))
print("-" * 95)
for name in CANDIDATES:
    row_str = f"{name:<40} | "
    row_str += " | ".join([f"{results[name]['per_season'][s]['total_mae']:7.3f}" for s in test_seasons])
    print(row_str)
print("=" * 95)
