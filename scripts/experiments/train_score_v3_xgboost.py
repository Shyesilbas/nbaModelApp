import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import json
from datetime import datetime
import os
import glob

print("============================================================")
print("🚀 V3 XGBOOST SCORE MODEL TRAINING (PACE/RTG) 🚀")
print("============================================================\n")

# 1. Load Data
processed_dir = "data/processed"
files = glob.glob(f"{processed_dir}/team_model_ready_v3_*.csv")
print(f"Found {len(files)} V3 datasets: {[os.path.basename(f) for f in files]}")

df_list = []
for f in files:
    df_list.append(pd.read_csv(f))
df = pd.concat(df_list, ignore_index=True)

print(f"\nTotal rows loaded: {len(df)}")
# Drop NaNs
df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
print(f"Rows after dropping NaNs: {len(df)}")

# Separate Home and Away
df_home = df[df["IS_HOME"] == True].copy()
df_away = df[df["IS_HOME"] == False].copy()

# Base Features for Pace
pace_features = [
    "PACE_LAST_5", "PACE_LAST_10", "OPP_PACE_LAST_5", "OPP_PACE_LAST_10",
    "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "OPP_OFF_RTG_LAST_5", "OPP_DEF_RTG_LAST_5",
    "TEAM_CORE_TOP3_PLAYED_COUNT", "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST"
]

# Features for Off Rtg
off_rtg_features = [
    "OFF_RTG_LAST_5", "OFF_RTG_LAST_10", "PACE_LAST_5", "WINRATE_LAST_5", 
    "OPP_DEF_RTG_LAST_5", "OPP_DEF_RTG_LAST_10", "OPP_PACE_LAST_5",
    "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE", "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
    "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST"
]

# Features for Margin
margin_features = off_rtg_features + ["DEF_RTG_LAST_5", "DEF_RTG_LAST_10", "OPP_OFF_RTG_LAST_5"]

# Define targets
df_home["TARGET_PACE"] = df_home["PACE"]
df_home["TARGET_HOME_OFF_RTG"] = df_home["OFF_RTG"]
df_away["TARGET_AWAY_OFF_RTG"] = df_away["OFF_RTG"]

# Margin uses PLUS_MINUS of Home
# df_home already has PLUS_MINUS?
# Margin uses derived PTS and PTS_ALLOWED
df_home["TARGET_MARGIN"] = df_home["PACE"] * df_home["NET_RTG"] / 100.0

print("\n--- Training Pace Model ---")
X_pace = df_home[pace_features]
y_pace = df_home["TARGET_PACE"]
X_train, X_test, y_train, y_test = train_test_split(X_pace, y_pace, test_size=0.2, random_state=42)
pace_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
pace_model.fit(X_train, y_train)
preds = pace_model.predict(X_test)
pace_mae = mean_absolute_error(y_test, preds)
print(f"Pace MAE: {pace_mae:.2f}")

print("\n--- Training Home Off_Rtg Model ---")
X_home = df_home[off_rtg_features]
y_home = df_home["TARGET_HOME_OFF_RTG"]
X_train, X_test, y_train, y_test = train_test_split(X_home, y_home, test_size=0.2, random_state=42)
home_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
home_model.fit(X_train, y_train)
preds = home_model.predict(X_test)
home_mae = mean_absolute_error(y_test, preds)
print(f"Home Off_Rtg MAE: {home_mae:.2f}")

print("\n--- Training Away Off_Rtg Model ---")
X_away = df_away[off_rtg_features]
y_away = df_away["TARGET_AWAY_OFF_RTG"]
X_train, X_test, y_train, y_test = train_test_split(X_away, y_away, test_size=0.2, random_state=42)
away_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
away_model.fit(X_train, y_train)
preds = away_model.predict(X_test)
away_mae = mean_absolute_error(y_test, preds)
print(f"Away Off_Rtg MAE: {away_mae:.2f}")

print("\n--- Training Margin Model ---")
X_margin = df_home[margin_features]
y_margin = df_home["TARGET_MARGIN"]
X_train, X_test, y_train, y_test = train_test_split(X_margin, y_margin, test_size=0.2, random_state=42)
margin_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
margin_model.fit(X_train, y_train)
preds = margin_model.predict(X_test)
margin_mae = mean_absolute_error(y_test, preds)
print(f"Margin MAE: {margin_mae:.2f}")

# Overall Score Test
print("\n--- Evaluating Expected Score derived from Pace/OffRtg ---")
# Re-predict on df_home
pred_pace = pace_model.predict(df_home[pace_features])
pred_home_rtg = home_model.predict(df_home[off_rtg_features])

# For away rtg, we need to merge away predictions back to home rows
df_home_eval = df_home.copy()
df_home_eval["PRED_PACE"] = pred_pace
df_home_eval["PRED_HOME_RTG"] = pred_home_rtg
df_home_eval["ACTUAL_HOME_PTS"] = df_home_eval["PACE"] * df_home_eval["OFF_RTG"] / 100.0
df_home_eval["ACTUAL_AWAY_PTS"] = df_home_eval["PACE"] * df_home_eval["DEF_RTG"] / 100.0

# We need the AWAY rows for the same games to predict away rtg
df_away_eval = df_away[["GAME_ID"] + off_rtg_features].copy()
df_away_eval["PRED_AWAY_RTG"] = away_model.predict(df_away_eval[off_rtg_features])
df_away_eval = df_away_eval[["GAME_ID", "PRED_AWAY_RTG"]]

df_eval = df_home_eval.merge(df_away_eval, on="GAME_ID", how="inner")
df_eval["EXPECTED_HOME_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_HOME_RTG"] / 100.0
df_eval["EXPECTED_AWAY_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_AWAY_RTG"] / 100.0

home_score_mae = mean_absolute_error(df_eval["ACTUAL_HOME_PTS"], df_eval["EXPECTED_HOME_SCORE"])
away_score_mae = mean_absolute_error(df_eval["ACTUAL_AWAY_PTS"], df_eval["EXPECTED_AWAY_SCORE"])
print(f"Derived Home Score MAE: {home_score_mae:.2f}")
print(f"Derived Away Score MAE: {away_score_mae:.2f}")

# Save models
os.makedirs("models/production", exist_ok=True)
joblib.dump(pace_model, "models/production/score_model_v3_pace.pkl")
joblib.dump(home_model, "models/production/score_model_v3_home_rtg.pkl")
joblib.dump(away_model, "models/production/score_model_v3_away_rtg.pkl")
joblib.dump(margin_model, "models/production/score_model_v3_margin.pkl")

metadata = {
    "version": "3.0_XGBoost",
    "updated_at": datetime.utcnow().isoformat() + "Z",
    "pace_mae": float(pace_mae),
    "home_rtg_mae": float(home_mae),
    "away_rtg_mae": float(away_mae),
    "margin_mae": float(margin_mae),
    "derived_home_score_mae": float(home_score_mae),
    "derived_away_score_mae": float(away_score_mae),
    "pace_features": pace_features,
    "off_rtg_features": off_rtg_features,
    "margin_features": margin_features
}

with open("models/production/score_model_v3_metadata.json", "w") as f:
    json.dump(metadata, f, indent=4)

print("\n✅ V3 Models trained and saved to models/production/")
