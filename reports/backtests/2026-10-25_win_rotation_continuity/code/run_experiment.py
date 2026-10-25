"""Walk-forward evaluation of decoupled rotation continuity and missing minutes for the NBA Win Model.

Compares:
1. Pure Elo + Home baseline
2. Production v11 (8 features: IS_HOME, IS_B2B, OPP_IS_B2B, ABS_DIFF, ELO_DIFF, WINRATE_DIFF_LAST_10, REST_DIFF, CLEAN_NET_RTG_DIFF_LAST_10)
3. + ROTATION_CONTINUITY_DIFF
4. + MISSING_ROT_MINS_DIFF
5. + ROTATION_CONTINUITY_DIFF + MISSING_ROT_MINS_DIFF
6. Decoupled set (replacing ABS_DIFF with pure missing minutes + continuity + active weighted gs)
7. Other potential signals (FG3_REGRESSION_DIFF, FT_MARGIN_DIFF_LAST_5)
"""
import os
import sys
from pathlib import Path
import json
import time
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score, accuracy_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.core.data_paths import get_data_paths, team_training_csv
from src.features.win_strength_features import add_win_strength_features
from src.features.roster_absence import _prepare, WINDOW, MIN_ROTATION_MINUTES, MIN_HISTORY_GAMES

print("Building enhanced rotation and absence features from raw player games...")
t0 = time.time()
seasons = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

player_dfs = [pd.read_csv(get_data_paths(s).player_games_raw) for s in seasons]
all_pg = pd.concat(player_dfs, ignore_index=True)
d = _prepare(all_pg)

records = []
for (_, team), g in d.groupby(["_season", "TEAM_ABBREVIATION"]):
    order = g.groupby("GAME_ID")["GAME_DATE"].first().sort_values(kind="stable")
    ids = order.index
    played = g.pivot_table(index="GAME_ID", columns="Player_ID", values="MIN", aggfunc="sum").reindex(ids)
    gs = g.pivot_table(index="GAME_ID", columns="Player_ID", values="GS", aggfunc="sum").reindex(ids)
    on = played.notna().astype(float).fillna(0.0)
    mins, gsv = played.fillna(0.0), gs.fillna(0.0)
    
    roll = lambda f: f.shift(1).rolling(WINDOW, min_periods=1).sum()
    n = pd.Series(np.minimum(np.arange(len(ids)), WINDOW), index=ids, dtype=float)
    gp, msum, gssum = roll(on), roll(mins), roll(gsv)
    
    presence = gp.div(n.replace(0, np.nan), axis=0)
    avg_min = msum.div(gp.replace(0, np.nan))
    rotation = avg_min >= MIN_ROTATION_MINUTES
    gs_avg = gssum.div(gp.replace(0, np.nan))
    
    # 1. Standard ABS_DELTA (existing)
    abs_delta = ((on - presence) * gs_avg).where(rotation).sum(axis=1)
    abs_delta[n < MIN_HISTORY_GAMES] = 0.0
    
    # 2. Missing rotation minutes (pure minutes, decoupled from noisy GS)
    missing_rot_mins = ((presence - on).clip(lower=0) * avg_min).where(rotation).sum(axis=1)
    missing_rot_mins[n < MIN_HISTORY_GAMES] = 0.0
    
    # 3. Rotation continuity (fraction of expected regular rotation minutes active tonight)
    avail_rot_mins = (on * avg_min).where(rotation).sum(axis=1)
    exp_rot_mins = (presence * avg_min).where(rotation).sum(axis=1)
    rot_continuity = avail_rot_mins.div(exp_rot_mins.replace(0, np.nan)).fillna(1.0).clip(0.0, 1.2)
    rot_continuity[n < MIN_HISTORY_GAMES] = 1.0
    
    # 4. Active lineup weighted GS (quality of active players weighted by playing time)
    active_wt_gs = (on * avg_min * gs_avg).where(rotation).sum(axis=1).div(avail_rot_mins.replace(0, np.nan))
    # Fill with overall team rotation average if empty
    overall_gs = (avg_min * gs_avg).where(rotation).sum(axis=1).div(exp_rot_mins.replace(0, np.nan))
    active_wt_gs = active_wt_gs.fillna(overall_gs).fillna(10.0)
    active_wt_gs[n < MIN_HISTORY_GAMES] = 10.0

    df_team = pd.DataFrame({
        "GAME_ID": ids,
        "TEAM_ABBREVIATION": team,
        "ABS_DELTA": abs_delta.values,
        "MISSING_ROT_MINS": missing_rot_mins.values,
        "ROT_CONTINUITY": rot_continuity.values,
        "ACTIVE_WT_GS": active_wt_gs.values,
    })
    records.append(df_team)

df_all_rot = pd.concat(records, ignore_index=True)
print(f"Computed rotation features for {len(df_all_rot)} team-games in {time.time()-t0:.2f}s")

# Load existing training csvs and merge new features
print("Loading team training data across seasons...")
team_frames = []
for s in seasons:
    f = team_training_csv(s)
    tf = pd.read_csv(f)
    tf["SEASON"] = s
    team_frames.append(tf)

full_team_df = pd.concat(team_frames, ignore_index=True)
full_team_df["_gid"] = full_team_df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
df_all_rot["_gid"] = df_all_rot["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)

# Merge own team features
merged = full_team_df.merge(
    df_all_rot[["_gid", "TEAM_ABBREVIATION", "MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"]],
    on=["_gid", "TEAM_ABBREVIATION"],
    how="left",
)

# Merge opponent features
opp_rot = df_all_rot[["_gid", "TEAM_ABBREVIATION", "MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"]].rename(
    columns={
        "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
        "MISSING_ROT_MINS": "OPP_MISSING_ROT_MINS",
        "ROT_CONTINUITY": "OPP_ROT_CONTINUITY",
        "ACTIVE_WT_GS": "OPP_ACTIVE_WT_GS",
    }
)
merged = merged.merge(opp_rot, on=["_gid", "OPPONENT_ABBREVIATION"], how="left")

# Fill missing and compute differentials
for c in ["MISSING_ROT_MINS", "OPP_MISSING_ROT_MINS"]:
    merged[c] = merged[c].fillna(0.0)
for c in ["ROT_CONTINUITY", "OPP_ROT_CONTINUITY"]:
    merged[c] = merged[c].fillna(1.0)
for c in ["ACTIVE_WT_GS", "OPP_ACTIVE_WT_GS"]:
    merged[c] = merged[c].fillna(10.0)

merged["MISSING_ROT_MINS_DIFF"] = merged["OPP_MISSING_ROT_MINS"] - merged["MISSING_ROT_MINS"] # positive is good for team
merged["ROT_CONTINUITY_DIFF"] = merged["ROT_CONTINUITY"] - merged["OPP_ROT_CONTINUITY"]
merged["ACTIVE_WT_GS_DIFF"] = merged["ACTIVE_WT_GS"] - merged["OPP_ACTIVE_WT_GS"]

# Add derived win strength features (ELO_DIFF, REST_DIFF, etc.)
merged = add_win_strength_features(merged)

# Filter to home games for honest match-level walk-forward evaluation
home_df = merged[merged["IS_HOME"] == 1].sort_values("GAME_DATE").reset_index(drop=True)
print(f"Total home match evaluations: {len(home_df)}")

# Define feature candidate sets
PROD_FEATURES = [
    "IS_HOME", "IS_B2B", "OPP_IS_B2B", "ABS_DIFF", "ELO_DIFF",
    "WINRATE_DIFF_LAST_10", "REST_DIFF", "CLEAN_NET_RTG_DIFF_LAST_10"
]

CANDIDATES = {
    "1. Baseline (Elo + Home)": ["IS_HOME", "ELO_DIFF"],
    "2. Production v11 (8 feats)": PROD_FEATURES,
    "3. + ROT_CONTINUITY_DIFF": PROD_FEATURES + ["ROT_CONTINUITY_DIFF"],
    "4. + MISSING_ROT_MINS_DIFF": PROD_FEATURES + ["MISSING_ROT_MINS_DIFF"],
    "5. + BOTH (ROT_CONT + MISS_MINS)": PROD_FEATURES + ["ROT_CONTINUITY_DIFF", "MISSING_ROT_MINS_DIFF"],
    "6. + ACTIVE_WT_GS_DIFF": PROD_FEATURES + ["ACTIVE_WT_GS_DIFF"],
    "7. + ALL THREE ROTATION FEATS": PROD_FEATURES + ["ROT_CONTINUITY_DIFF", "MISSING_ROT_MINS_DIFF", "ACTIVE_WT_GS_DIFF"],
    "8. Decoupled (replace ABS_DIFF)": [c for c in PROD_FEATURES if c != "ABS_DIFF"] + ["ROT_CONTINUITY_DIFF", "MISSING_ROT_MINS_DIFF", "ACTIVE_WT_GS_DIFF"],
    "9. + FG3_REGRESSION_DIFF": PROD_FEATURES + ["ROT_CONTINUITY_DIFF", "MISSING_ROT_MINS_DIFF", "FG3_REGRESSION_DIFF"],
}

test_seasons = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

results = {name: {"brier": [], "log_loss": [], "auc": [], "acc": [], "per_season": {}} for name in CANDIDATES}
pooled_preds = {name: [] for name in CANDIDATES}
pooled_targets = []

for ts in test_seasons:
    train_df = home_df[home_df["SEASON"] < ts].copy()
    test_df = home_df[home_df["SEASON"] == ts].copy()
    y_train = train_df["WIN"].astype(int).values
    y_test = test_df["WIN"].astype(int).values
    
    if len(pooled_targets) < len(home_df[home_df["SEASON"].isin(test_seasons)]):
        pooled_targets.extend(y_test)
        
    for name, feat_cols in CANDIDATES.items():
        pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(C=1.0, max_iter=1000, random_state=42))
        ])
        
        X_train = train_df[feat_cols].copy()
        X_test = test_df[feat_cols].copy()
        
        pipe.fit(X_train, y_train)
        probs = pipe.predict_proba(X_test)[:, 1]
        probs = np.clip(probs, 1e-6, 1 - 1e-6)
        preds = (probs >= 0.5).astype(int)
        
        brier = brier_score_loss(y_test, probs)
        ll = log_loss(y_test, probs)
        auc = roc_auc_score(y_test, probs)
        acc = accuracy_score(y_test, preds)
        
        results[name]["per_season"][ts] = {
            "brier": round(brier, 4),
            "log_loss": round(ll, 4),
            "auc": round(auc, 4),
            "acc": round(acc * 100, 2),
            "n": len(y_test)
        }
        pooled_preds[name].extend(probs)

pooled_targets = np.array(pooled_targets)

print("\n" + "=" * 90)
print(f"{'EXPANDING WALK-FORWARD (5 SEASONS: 2021-22 TO 2025-26, N = ' + str(len(pooled_targets)) + ' GAMES)':^90}")
print("=" * 90)
header = f"{'Configuration':<35} | {'Log-Loss':>9} | {'Brier':>8} | {'ROC-AUC':>8} | {'Accuracy':>9} | {'vs Prod LL':>11}"
print(header)
print("-" * 90)

prod_ll = None
prod_brier = None

summary_table = []
for name in CANDIDATES:
    probs = np.array(pooled_preds[name])
    ll = log_loss(pooled_targets, probs)
    brier = brier_score_loss(pooled_targets, probs)
    auc = roc_auc_score(pooled_targets, probs)
    acc = accuracy_score(pooled_targets, (probs >= 0.5).astype(int))
    
    if name == "2. Production v11 (8 feats)":
        prod_ll = ll
        prod_brier = brier
        delta_str = "0.0000 (ref)"
    elif prod_ll is not None:
        delta_ll = ll - prod_ll
        delta_str = f"{delta_ll:+.4f}"
    else:
        delta_str = "-"
        
    print(f"{name:<35} | {ll:9.4f} | {brier:8.4f} | {auc:8.4f} | {acc*100:8.2f}% | {delta_str:>11}")
    summary_table.append({
        "name": name,
        "log_loss": ll,
        "brier": brier,
        "auc": auc,
        "accuracy": acc * 100,
        "delta_ll": ll - (prod_ll or ll)
    })

print("\n" + "=" * 90)
print("PER-SEASON LOG LOSS COMPARISON:")
print(f"{'Configuration':<35} | " + " | ".join([f"{s:>7}" for s in test_seasons]))
print("-" * 90)
for name in CANDIDATES:
    row_str = f"{name:<35} | "
    row_str += " | ".join([f"{results[name]['per_season'][s]['log_loss']:7.4f}" for s in test_seasons])
    print(row_str)

print("\n" + "=" * 90)
print("PER-SEASON BRIER SCORE COMPARISON:")
print(f"{'Configuration':<35} | " + " | ".join([f"{s:>7}" for s in test_seasons]))
print("-" * 90)
for name in CANDIDATES:
    row_str = f"{name:<35} | "
    row_str += " | ".join([f"{results[name]['per_season'][s]['brier']:7.4f}" for s in test_seasons])
    print(row_str)
print("=" * 90)
