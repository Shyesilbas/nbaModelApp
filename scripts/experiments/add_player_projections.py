import pandas as pd
import numpy as np
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib
import glob
import os

print("--- Player Projeksiyonları Hesaplanıyor ---")
# 1. Player Matchups Verisini Oku
player_df = pd.read_csv("data/experimental/player_model_ready_v3_matchups.csv")

# 2. Player Modellerini ve Feature'larını Yükle
features_path = "models/production/player_v3_features.pkl"
try:
    player_features = joblib.load(features_path)
except:
    print(f"Error loading {features_path}. Check if file exists.")
    player_features = [
        "PTS_LAST_5", "PTS_LAST_10", "REB_LAST_5", "AST_LAST_5", 
        "MIN_EMA_5", "MIN_EMA_10", "MIN_TREND", "MIN_STD_LAST_10",
        "DAYS_REST", "OPP_ELO", "TEAM_ELO", "BLOWOUT_RISK_PROXY",
        "OPP_GUARD_AST_ALLOWED_LAST_10", "OPP_WING_AST_ALLOWED_LAST_10"
    ] # Fallback if feature list differs

player_df = player_df.dropna(subset=player_features)

targets = ["pts", "reb", "ast", "pra"]
for t in targets:
    model_path = f"models/production/player_v3_ridge_{t}.pkl"
    if os.path.exists(model_path):
        model = joblib.load(model_path)
        player_df[f"PROJ_{t.upper()}"] = model.predict(player_df[player_features])
    else:
        print(f"Model not found: {model_path}")
        player_df[f"PROJ_{t.upper()}"] = 0

# 3. GAME_ID ve TEAM_ABBREVIATION bazında topla
proj_cols = [f"PROJ_{t.upper()}" for t in targets]
team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(['sum', 'mean']).reset_index()
team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]

new_features = [c for c in team_agg.columns if c not in ["GAME_ID", "TEAM_ABBREVIATION"]]
print(f"Oluşturulan Yeni Feature'lar ({len(new_features)} adet):", new_features)

# 4. Score Model Eğitim Setini Oku ve Birleştir
print("--- Score Model Verisi Hazırlanıyor ---")
processed_dir = "data/processed"
files = glob.glob(f"{processed_dir}/team_model_ready_v3_*.csv")
df_list = []
for f in files:
    df_list.append(pd.read_csv(f))
df = pd.concat(df_list, ignore_index=True)

df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
df = df.merge(team_agg, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
df = df.dropna(subset=new_features)

df_home = df[df["IS_HOME"] == True].copy()
df_away = df[df["IS_HOME"] == False].copy()

# Feature Listelerine Yeni Feature'ları Ekle
pace_features = [
    "PACE_LAST_5", "PACE_LAST_10", "OPP_PACE_LAST_5", "OPP_PACE_LAST_10",
    "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "OPP_OFF_RTG_LAST_5", "OPP_DEF_RTG_LAST_5",
    "TEAM_CORE_TOP3_PLAYED_COUNT", "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST"
] + new_features

off_rtg_features = [
    "OFF_RTG_LAST_5", "OFF_RTG_LAST_10", "PACE_LAST_5", "WINRATE_LAST_5", 
    "OPP_DEF_RTG_LAST_5", "OPP_DEF_RTG_LAST_10", "OPP_PACE_LAST_5",
    "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE", "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
    "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST"
] + new_features

margin_features = off_rtg_features + ["DEF_RTG_LAST_5", "DEF_RTG_LAST_10", "OPP_OFF_RTG_LAST_5"]

# Targets
df_home["TARGET_PACE"] = df_home["PACE"]
df_home["TARGET_HOME_OFF_RTG"] = df_home["OFF_RTG"]
df_away["TARGET_AWAY_OFF_RTG"] = df_away["OFF_RTG"]
df_home["TARGET_MARGIN"] = df_home["PACE"] * df_home["NET_RTG"] / 100.0

print("--- XGBoost Modelleri Yeniden Eğitiliyor ---")
# Pace
X_pace, y_pace = df_home[pace_features], df_home["TARGET_PACE"]
X_train, X_test, y_train, y_test = train_test_split(X_pace, y_pace, test_size=0.2, random_state=42)
pace_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
pace_model.fit(X_train, y_train)
pace_mae = mean_absolute_error(y_test, pace_model.predict(X_test))

# Home RTG
X_home, y_home = df_home[off_rtg_features], df_home["TARGET_HOME_OFF_RTG"]
X_train, X_test, y_train, y_test = train_test_split(X_home, y_home, test_size=0.2, random_state=42)
home_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
home_model.fit(X_train, y_train)
home_mae = mean_absolute_error(y_test, home_model.predict(X_test))

# Away RTG
X_away, y_away = df_away[off_rtg_features], df_away["TARGET_AWAY_OFF_RTG"]
X_train, X_test, y_train, y_test = train_test_split(X_away, y_away, test_size=0.2, random_state=42)
away_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
away_model.fit(X_train, y_train)
away_mae = mean_absolute_error(y_test, away_model.predict(X_test))

# Margin
X_margin, y_margin = df_home[margin_features], df_home["TARGET_MARGIN"]
X_train, X_test, y_train, y_test = train_test_split(X_margin, y_margin, test_size=0.2, random_state=42)
margin_model = xgb.XGBRegressor(n_estimators=150, max_depth=4, learning_rate=0.05, random_state=42)
margin_model.fit(X_train, y_train)
margin_mae = mean_absolute_error(y_test, margin_model.predict(X_test))

print("\n🚀 YENİ MAE DEĞERLERİ (Player Projeksiyonları İle) 🚀")
print(f"Pace MAE: {pace_mae:.2f}")
print(f"Home Off_Rtg MAE: {home_mae:.2f}")
print(f"Away Off_Rtg MAE: {away_mae:.2f}")
print(f"Margin MAE: {margin_mae:.2f}")
