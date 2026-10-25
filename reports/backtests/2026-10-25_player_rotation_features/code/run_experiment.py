"""Player props feature experiment.

Walk-forward backtest across seasons 2021-22 to 2025-26 (or 2023-24 to 2025-26)
evaluating the impact of:
1. PACE features (TEAM_PACE, OPP_TEAM_PACE)
2. Matchup blowout risk (BLOWOUT_RISK_PROXY, ELO_DIFF)
3. Team rotation absence / missing minutes (MISSING_ROT_MINS, ROT_CONTINUITY)
merged from team_model_ready datasets.
"""
import time
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.metrics import mean_absolute_error
from src.training.player_trainer import PlayerModelTrainer
from src.features.player_form import add_player_matchup_features
from src.core.data_paths import team_training_csv

root = Path(__file__).resolve().parents[4]
player_data_path = root / "data/training/player_model_ready.csv"

print("Loading player model ready dataset...")
t0 = time.time()
df_player = pd.read_csv(player_data_path)
df_player = add_player_matchup_features(df_player)
df_player["GAME_DATE"] = pd.to_datetime(df_player["GAME_DATE"])
df_player["GAME_ID"] = df_player["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)

# Merge team rotation features from team_model_ready files
print("Loading team rotation features...")
team_frames = []
for s in ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]:
    tf_path = team_training_csv(s)
    if tf_path.exists():
        tdf = pd.read_csv(tf_path)
        if not tdf.empty:
            tdf["GAME_ID"] = tdf["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
            team_frames.append(tdf[["GAME_ID", "TEAM_ABBREVIATION", "MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS", "ABS_DELTA"]])

if team_frames:
    all_team = pd.concat(team_frames, ignore_index=True).drop_duplicates(subset=["GAME_ID", "TEAM_ABBREVIATION"])
    df_player = df_player.merge(all_team, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    print(f"Merged team features. Columns added: MISSING_ROT_MINS, ROT_CONTINUITY, ACTIVE_WT_GS, ABS_DELTA")

# Map SEASON from SEASON_ID
def season_from_id(val):
    s = str(val)
    if len(s) >= 5:
        yr = int(s[1:5])
        return f"{yr}-{str(yr+1)[2:]}"
    return "UNKNOWN"

df_player["_SEASON"] = df_player["SEASON_ID"].apply(season_from_id)
print(f"Total rows: {len(df_player)}, seasons: {sorted(df_player['_SEASON'].unique())}")

prod_features = [
    "IS_HOME", "IS_PLAYOFF", "DAYS_REST", "IS_GUARD", "IS_BIG",
    "PTS_LAST_5", "PTS_EMA_10", "PTS_PER_MIN_LAST_10",
    "REB_LAST_5", "REB_EMA_10", "REB_PER_MIN_LAST_10",
    "AST_LAST_5", "AST_EMA_10", "AST_PER_MIN_LAST_10",
    "MIN_LAST_3", "MIN_EMA_10", "MIN_TREND", "USG_PCT_EMA_10",
    "OPP_POS_PTS_ALLOWED_LAST_10", "OPP_POS_REB_ALLOWED_LAST_10", "OPP_POS_AST_ALLOWED_LAST_10"
]

feature_variants = {
    "1. Prod Baseline (21 feats)": prod_features,
    "2. Prod + Team Pace (23 feats)": prod_features + ["TEAM_PACE", "OPP_TEAM_PACE"],
    "3. Prod + Blowout Risk (23 feats)": prod_features + ["BLOWOUT_RISK_PROXY", "ELO_DIFF"],
    "4. Prod + Missing Rot Mins (22 feats)": prod_features + ["MISSING_ROT_MINS"],
    "5. Prod + Team Rot Features (24 feats)": prod_features + ["MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"],
    "6. Prod + Pace + Missing Mins (24 feats)": prod_features + ["TEAM_PACE", "OPP_TEAM_PACE", "MISSING_ROT_MINS"],
    "7. Full Combo (27 feats)": prod_features + ["TEAM_PACE", "OPP_TEAM_PACE", "BLOWOUT_RISK_PROXY", "ELO_DIFF", "MISSING_ROT_MINS", "ROT_CONTINUITY", "ACTIVE_WT_GS"],
}

test_seasons = ["2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]

results = {name: {"pts": [], "reb": [], "ast": []} for name in feature_variants}
baseline_errors = {"pts": [], "reb": [], "ast": []}

trainer = PlayerModelTrainer()

for ts_idx, ts in enumerate(test_seasons):
    train_seasons = [s for s in ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"] if s < ts]
    train_df = df_player[df_player["_SEASON"].isin(train_seasons)]
    test_df = df_player[df_player["_SEASON"] == ts]
    
    print(f"\n--- Testing Season {ts} (Train seasons: {train_seasons}, Train N={len(train_df)}, Test N={len(test_df)}) ---")
    
    for target_name in ["pts", "reb", "ast"]:
        target_col = f"TARGET_{target_name.upper()}"
        base_col = f"{target_name.upper()}_EMA_10"
        
        tr_valid = train_df.dropna(subset=[target_col])
        te_valid = test_df.dropna(subset=[target_col, base_col])
        y_train = tr_valid[target_col]
        y_test = te_valid[target_col]
        
        if ts_idx == 0:
            base_mae = mean_absolute_error(y_test, te_valid[base_col])
            baseline_errors[target_name].append((len(y_test), base_mae))
        else:
            base_mae = mean_absolute_error(y_test, te_valid[base_col])
            baseline_errors[target_name].append((len(y_test), base_mae))
            
        for var_name, feats in feature_variants.items():
            pipe = trainer._model_pipeline(target_name)
            pipe.fit(tr_valid[feats], y_train)
            preds = pipe.predict(te_valid[feats])
            mae = mean_absolute_error(y_test, preds)
            results[var_name][target_name].append((len(y_test), mae))
            print(f"  [{target_name.upper()}] {var_name:38s} MAE: {mae:.4f} (Base: {base_mae:.4f})")

print("\n" + "="*80)
print("OVERALL 5-SEASON WEIGHTED WALK-FORWARD SUMMARY")
print("="*80)

for target_name in ["pts", "reb", "ast"]:
    total_samples = sum(n for n, _ in baseline_errors[target_name])
    base_weighted = sum(n * m for n, m in baseline_errors[target_name]) / total_samples
    print(f"\nTarget: {target_name.upper()} (N = {total_samples:,} player games across 5 seasons)")
    print(f"  {'EMA-10 Baseline':42s} : MAE = {base_weighted:.4f}")
    
    for var_name in feature_variants:
        weighted_mae = sum(n * m for n, m in results[var_name][target_name]) / total_samples
        delta = weighted_mae - base_weighted
        prod_weighted = sum(n * m for n, m in results["1. Prod Baseline (21 feats)"][target_name]) / total_samples
        delta_vs_prod = weighted_mae - prod_weighted
        print(f"  {var_name:42s} : MAE = {weighted_mae:.4f} (vs Prod: {delta_vs_prod:+.4f})")
