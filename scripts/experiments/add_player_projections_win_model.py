import pandas as pd
import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, accuracy_score
import os
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline

print("--- Player Projeksiyonları Win Modeli İçin Hazırlanıyor ---")
# 1. Matchups Verisini Yükle
player_df = pd.read_csv("data/experimental/player_model_ready_v3_matchups.csv")

# 2. Özellikleri ve Ridge Modellerini Yükle
features_path = "models/production/player_v3_features.pkl"
try:
    player_features = joblib.load(features_path)
except:
    print(f"Error loading {features_path}.")
    player_features = []

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

# 3. GAME_ID ve TEAM_ABBREVIATION Bazında Topla ve Ortalamasını Al
proj_cols = [f"PROJ_{t.upper()}" for t in targets]
team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(['sum', 'mean']).reset_index()
team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]

# TEAM feature'ları
team_features = team_agg.rename(columns={
    "PROJ_PTS_sum": "TEAM_V3_PROJ_PTS_SUM",
    "PROJ_REB_sum": "TEAM_V3_PROJ_REB_SUM",
    "PROJ_AST_sum": "TEAM_V3_PROJ_AST_SUM",
    "PROJ_PRA_sum": "TEAM_V3_PROJ_PRA_SUM",
    "PROJ_PTS_mean": "TEAM_V3_PROJ_PTS_AVG",
    "PROJ_REB_mean": "TEAM_V3_PROJ_REB_AVG",
    "PROJ_AST_mean": "TEAM_V3_PROJ_AST_AVG",
    "PROJ_PRA_mean": "TEAM_V3_PROJ_PRA_AVG",
})

# OPP feature'ları (Join için TEAM_ABBREVIATION -> OPPONENT_ABBREVIATION yapılıyor)
opp_features = team_agg.rename(columns={
    "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
    "PROJ_PTS_sum": "OPP_V3_PROJ_PTS_SUM",
    "PROJ_REB_sum": "OPP_V3_PROJ_REB_SUM",
    "PROJ_AST_sum": "OPP_V3_PROJ_AST_SUM",
    "PROJ_PRA_sum": "OPP_V3_PROJ_PRA_SUM",
    "PROJ_PTS_mean": "OPP_V3_PROJ_PTS_AVG",
    "PROJ_REB_mean": "OPP_V3_PROJ_REB_AVG",
    "PROJ_AST_mean": "OPP_V3_PROJ_AST_AVG",
    "PROJ_PRA_mean": "OPP_V3_PROJ_PRA_AVG",
})

# 4. Win Model Eğitim Setini Yükle ve Birleştir
win_df_path = "data/processed/team_win_model_ready_v2_player_features.csv"
win_df = pd.read_csv(win_df_path)
print(f"Orijinal Win Dataset: {win_df.shape}")

win_df = win_df.merge(team_features, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
win_df = win_df.merge(opp_features, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
print(f"Featurelar Eklendikten Sonra Dataset: {win_df.shape}")

new_cols = [
    "TEAM_V3_PROJ_PTS_SUM", "TEAM_V3_PROJ_REB_SUM", "TEAM_V3_PROJ_AST_SUM", "TEAM_V3_PROJ_PRA_SUM",
    "OPP_V3_PROJ_PTS_SUM", "OPP_V3_PROJ_REB_SUM", "OPP_V3_PROJ_AST_SUM", "OPP_V3_PROJ_PRA_SUM",
    "TEAM_V3_PROJ_PTS_AVG", "TEAM_V3_PROJ_REB_AVG", "TEAM_V3_PROJ_AST_AVG", "TEAM_V3_PROJ_PRA_AVG",
    "OPP_V3_PROJ_PTS_AVG", "OPP_V3_PROJ_REB_AVG", "OPP_V3_PROJ_AST_AVG", "OPP_V3_PROJ_PRA_AVG"
]

win_df = win_df.dropna(subset=new_cols)

# 5. Logistic Regression Modelini Eğit
print("--- Lojistik Regresyon Modeli Eğitiliyor ---")
TARGET_COL = "WIN"

meta_candidates = [
    "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION",
    "OPPONENT_ABBREVIATION", "TEAM_ID"
]
meta = [c for c in win_df.columns if c in meta_candidates]
object_cols = win_df.select_dtypes(include=[object]).columns.tolist()
for c in object_cols:
    if c not in meta:
        meta.append(c)
meta = list(dict.fromkeys(meta))

features = [c for c in win_df.columns if c not in meta and c != TARGET_COL]

y = win_df[TARGET_COL].astype(int)
X = win_df[features]

# Zamansal (Chronological) Split (%80 Train, %20 Test) - Orijinal mantıkla aynı
df_meta = win_df[meta].copy()
df_meta["GAME_DATE"] = pd.to_datetime(df_meta["GAME_DATE"]) 
split_date = df_meta["GAME_DATE"].quantile(0.8)
train_idx = df_meta.index[df_meta["GAME_DATE"] <= split_date].tolist()
test_idx = df_meta.index[df_meta["GAME_DATE"] > split_date].tolist()

X_train = X.loc[train_idx]
X_test = X.loc[test_idx]
y_train = y.loc[train_idx]
y_test = y.loc[test_idx]

# Leakage önlemek adına hedef değişkene mükemmel korele olan şeyleri temizle (Orijinal scriptte vardı)
numeric = X_train.select_dtypes(include=[np.number])
drop_cols = []
for c in numeric.columns:
    if numeric[c].equals(y_train):
        drop_cols.append(c)
if drop_cols:
    X_train = X_train.drop(columns=drop_cols)
    X_test = X_test.drop(columns=drop_cols)

lr_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="mean")),
    ("scaler", StandardScaler()),
    ("clf", LogisticRegression(max_iter=1000, random_state=42))
])

lr_pipeline.fit(X_train, y_train)

y_proba = lr_pipeline.predict_proba(X_test)[:, 1]
y_pred = (y_proba >= 0.5).astype(int)

roc_auc = roc_auc_score(y_test, y_proba)
acc = accuracy_score(y_test, y_pred)

print(f"\n🚀 YENİ WIN MODEL DEĞERLERİ (Player Projeksiyonları İle) 🚀")
print(f"ROC-AUC: {roc_auc:.4f}")
print(f"Accuracy: {acc:.4f}")
