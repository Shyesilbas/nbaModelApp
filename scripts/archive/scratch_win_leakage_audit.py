import os
import joblib
import pandas as pd
import numpy as np
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")

# Load datasets
team_v2_path = ROOT / "data/processed/team_model_ready_v2_2024_25.csv"
player_v4_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
player_features_path = ROOT / "models/production/player_v4_features.pkl"

if not team_v2_path.exists():
    print(f"Error: Team V2 dataset missing at {team_v2_path}")
    exit(1)
if not player_v4_path.exists():
    print(f"Error: Player V4 dataset missing at {player_v4_path}")
    exit(1)

print("Loading datasets...")
df_team = pd.read_csv(team_v2_path)
df_player = pd.read_csv(player_v4_path)
player_features = joblib.load(player_features_path)

print(f"Team V2 shape: {df_team.shape}")
print(f"Player V4 shape: {df_player.shape}")

# Generate player projections and aggregate to team-level (mirror prepare_win_probability_model.py)
print("Integrating player projections...")
player_df = df_player.dropna(subset=player_features).copy()
targets = ["pts", "reb", "ast"]
predictions = {}

for t in targets:
    model_path = ROOT / f"models/production/player_v4_lgb_{t}.pkl"
    if model_path.exists():
        model = joblib.load(model_path)
        pred = model.predict(player_df[player_features])
        player_df[f"PROJ_{t.upper()}"] = pred
        predictions[t] = pred
    else:
        player_df[f"PROJ_{t.upper()}"] = 0.0
        predictions[t] = 0.0

player_df["PROJ_PRA"] = predictions["pts"] + predictions["reb"] + predictions["ast"]
targets_with_pra = ["pts", "reb", "ast", "pra"]
proj_cols = [f"PROJ_{t.upper()}" for t in targets_with_pra]

team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(['sum', 'mean']).reset_index()
team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]

team_features_df = team_agg.rename(columns={
    "PROJ_PTS_sum": "TEAM_V3_PROJ_PTS_SUM",
    "PROJ_REB_sum": "TEAM_V3_PROJ_REB_SUM",
    "PROJ_AST_sum": "TEAM_V3_PROJ_AST_SUM",
    "PROJ_PRA_sum": "TEAM_V3_PROJ_PRA_SUM",
    "PROJ_PTS_mean": "TEAM_V3_PROJ_PTS_AVG",
    "PROJ_REB_mean": "TEAM_V3_PROJ_REB_AVG",
    "PROJ_AST_mean": "TEAM_V3_PROJ_AST_AVG",
    "PROJ_PRA_mean": "TEAM_V3_PROJ_PRA_AVG",
})

opp_features_df = team_agg.rename(columns={
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

df_merged = df_team.merge(team_features_df, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
df_merged = df_merged.merge(opp_features_df, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")

print(f"Merged dataset shape: {df_merged.shape}")

# Separate numeric features to check correlation
numeric_cols = df_merged.select_dtypes(include=[np.number]).columns.tolist()
features = [c for c in numeric_cols if c not in ["GAME_ID", "TEAM_ID", "WIN"]]

correlations = df_merged[features + ["WIN"]].corr()["WIN"].abs().sort_values(ascending=False)

print("\n--- Correlation Audit with Target 'WIN' ---")
print("Top 15 most correlated features:")
for col, val in correlations.head(15).items():
    if col == "WIN":
        continue
    print(f"  {col}: {val:.4f}")

print("\nChecking for potential target leakage (correlation > 0.85):")
high_corr = correlations[correlations > 0.85]
high_corr = high_corr.drop("WIN", errors="ignore")
if high_corr.empty:
    print("  No features have correlation > 0.85 with WIN. (PASS)")
else:
    for col, val in high_corr.items():
        print(f"  WARNING: {col} has very high correlation: {val:.4f}")

# Look for specific keywords in features that shouldn't be there (e.g. game outcomes, actual margins, etc.)
banned_keywords = ["margin", "pts_scored", "actual", "score", "game_pts"]
potential_leaky_names = []
for col in df_merged.columns:
    col_lower = col.lower()
    for kw in banned_keywords:
        if kw in col_lower and not any(x in col_lower for x in ["last_", "avg", "sum", "proj", "opp_pts_allowed"]):
            potential_leaky_names.append(col)
            break

print("\nChecking feature names for potential post-tipoff markers:")
if potential_leaky_names:
    print(f"  Warning: Found features with suspicious names: {potential_leaky_names}")
else:
    print("  No suspicious feature names found. (PASS)")

# Let's inspect the distribution of target class
print(f"\nTarget WIN distribution:\n{df_merged['WIN'].value_counts(normalize=True)}")
