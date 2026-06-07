"""
Random Forest hyperparameter tuning for Win model (Phase 1)
Saves:
 - reports/rf_tuning_results.csv
 - reports/rf_hyperparameter_tuning_report.md

Operates on data/processed/team_win_model_ready_v2_player_features.csv
"""
import json
from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from sklearn.metrics import (roc_auc_score, accuracy_score, f1_score, brier_score_loss)
from sklearn.metrics import make_scorer
import time

ROOT = Path(__file__).resolve().parents[1]

import argparse
parser = argparse.ArgumentParser()
parser.add_argument("--season", help="Season string (e.g. 2025-26)")
args, unknown = parser.parse_known_args()

from scripts.data_paths import get_data_paths
from scripts.season_utils import season_to_file_token

paths = get_data_paths(args.season)
token = season_to_file_token(args.season or "2025-26")

DATASET = Path(paths.win_model_dataset)
FEATURE_COLS_JSON = ROOT / "models/win_probability_v2_feature_columns.json" if token == "2025_26" else ROOT / f"models/win_probability_v2_feature_columns_{token}.json"
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)
RESULTS_CSV = REPORT_DIR / ("rf_tuning_results.csv" if token == "2025_26" else f"rf_tuning_results_{token}.csv")
REPORT_MD = REPORT_DIR / ("rf_hyperparameter_tuning_report.md" if token == "2025_26" else f"rf_hyperparameter_tuning_report_{token}.md")

if not DATASET.exists():
    raise SystemExit(f"Dataset not found: {DATASET} — run scripts/train_win_probability_v2.py to prepare it")

print("Loading dataset:", DATASET)
df = pd.read_csv(DATASET, parse_dates=["GAME_DATE"], low_memory=False)
if "WIN" not in df.columns:
    raise SystemExit("WIN target missing in dataset")

# Load feature columns if available, else infer
if FEATURE_COLS_JSON.exists():
    feature_cols = json.loads(FEATURE_COLS_JSON.read_text())
    feature_cols = [c for c in feature_cols if c in df.columns]
else:
    # heuristics: drop known metadata and target
    meta = {"GAME_ID","GAME_DATE","MATCHUP","TEAM_NAME","TEAM_ABBREVIATION","OPPONENT_ABBREVIATION","WIN","IS_HOME"}
    feature_cols = [c for c in df.columns if c not in meta]

print(f"Using {len(feature_cols)} feature columns")
X = df[feature_cols].copy()
y = df["WIN"].astype(int)

# Chronological split like v2 script: 80% by GAME_DATE
df_dates = df.copy()
df_dates["GAME_DATE"] = pd.to_datetime(df_dates["GAME_DATE"]) 
split_date = df_dates["GAME_DATE"].quantile(0.8)
train_idx = df_dates.index[df_dates["GAME_DATE"] <= split_date].tolist()
test_idx = df_dates.index[df_dates["GAME_DATE"] > split_date].tolist()
X_train = X.loc[train_idx]
X_test = X.loc[test_idx]
y_train = y.loc[train_idx]
y_test = y.loc[test_idx]

print(f"Train size: {len(X_train)}, Test size: {len(X_test)}, split_date: {split_date}")

# Baseline logistic regression metrics
imp = SimpleImputer(strategy="mean")
scaler = StandardScaler()

lr_pipe = Pipeline([("imputer", imp), ("scaler", scaler), ("clf", LogisticRegression(max_iter=1000, random_state=42))])
print("Training baseline LogisticRegression...")
lr_pipe.fit(X_train, y_train)
try:
    y_proba_lr = lr_pipe.predict_proba(X_test)[:,1]
except Exception:
    y_proba_lr = lr_pipe.decision_function(X_test)
y_pred_lr = (y_proba_lr >= 0.5).astype(int)

baseline_metrics = {
    "roc_auc": float(roc_auc_score(y_test, y_proba_lr)),
    "brier": float(brier_score_loss(y_test, y_proba_lr)),
    "accuracy": float(accuracy_score(y_test, y_pred_lr)),
    "f1": float(f1_score(y_test, y_pred_lr, zero_division=0))
}

print("Baseline metrics:", baseline_metrics)

# RF pipeline
rf_pipe = Pipeline([("imputer", SimpleImputer(strategy="mean")), ("scaler", StandardScaler()), ("clf", RandomForestClassifier(random_state=42, n_jobs=-1))])

param_dist = {
    "clf__n_estimators": [100, 200, 300, 500, 800],
    "clf__max_depth": [None, 5, 10, 20, 30, 50],
    "clf__min_samples_split": [2, 4, 6, 10],
    "clf__min_samples_leaf": [1, 2, 4, 6],
    "clf__max_features": ["sqrt", "log2", 0.2, 0.5, 0.8],
    "clf__class_weight": [None, "balanced", "balanced_subsample"]
}

scoring = {
    "roc_auc": "roc_auc",
    "brier": make_scorer(brier_score_loss, greater_is_better=False),
    "f1": "f1"
}

cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)

n_iter = 80
print(f"Starting RandomizedSearchCV with n_iter={n_iter} (this may take a while)")
start = time.time()
search = RandomizedSearchCV(rf_pipe, param_distributions=param_dist, n_iter=n_iter, scoring=scoring, refit="roc_auc", cv=cv, verbose=2, random_state=42, n_jobs=-1)
search.fit(X_train, y_train)
end = time.time()
print(f"Randomized search completed in {(end-start)/60:.1f} minutes")

# Prepare results dataframe
cvres = pd.DataFrame(search.cv_results_)
# Keep useful columns
keep_cols = [c for c in cvres.columns if c.startswith("param_") or c.startswith("mean_test_") or c.startswith("std_test_") or c in ["mean_fit_time","mean_score_time"]]
cvres_trim = cvres[keep_cols].copy()
cvres_trim.to_csv(RESULTS_CSV, index=False)
print("Saved tuning CV results to:", RESULTS_CSV)

# Evaluate best estimator on test set
best = search.best_estimator_
try:
    y_proba_best = best.predict_proba(X_test)[:,1]
except Exception:
    y_proba_best = best.decision_function(X_test)
y_pred_best = (y_proba_best >= 0.5).astype(int)

best_metrics = {
    "roc_auc": float(roc_auc_score(y_test, y_proba_best)),
    "brier": float(brier_score_loss(y_test, y_proba_best)),
    "accuracy": float(accuracy_score(y_test, y_pred_best)),
    "f1": float(f1_score(y_test, y_pred_best, zero_division=0))
}

print("Best RF test metrics:", best_metrics)

# Save report markdown
with open(REPORT_MD, "w") as f:
    f.write("# Random Forest Hyperparameter Tuning Report\n\n")
    f.write(f"Run time: {(end-start)/60:.2f} minutes\n\n")
    f.write("## Baseline (Logistic Regression) metrics on chronological test split\n")
    f.write(json.dumps(baseline_metrics, indent=2))
    f.write("\n\n")
    f.write("## Best Random Forest configuration\n")
    f.write(json.dumps(search.best_params_, indent=2))
    f.write("\n\n")
    f.write("## Best Random Forest test metrics\n")
    f.write(json.dumps(best_metrics, indent=2))
    f.write("\n\n")
    f.write("## CV results summary (top 10 by mean_test_roc_auc)\n")
    # try to extract top rows
    try:
        top = cvres.sort_values(by="mean_test_roc_auc", ascending=False).head(10)
        f.write(top.to_csv(index=False))
    except Exception:
        f.write(cvres_trim.head(10).to_csv(index=False))

print("Saved report to:", REPORT_MD)

# Also save best params JSON
(BEST_JSON := REPORT_DIR / ("rf_best_params.json" if token == "2025_26" else f"rf_best_params_{token}.json")).write_text(json.dumps(search.best_params_, indent=2))
print("Saved best params to:", BEST_JSON)

# Final decision guidance printed to console
print('\n=== SUMMARY ===')
print('Baseline (Logistic):', baseline_metrics)
print('Best RF:', best_metrics)

if best_metrics['roc_auc'] > baseline_metrics['roc_auc'] and best_metrics['brier'] <= baseline_metrics['brier']:
    print('Tuned Random Forest improves on baseline by ROC-AUC and Brier. Consider replacement candidate.')
else:
    print('Tuned Random Forest does NOT clearly improve on baseline. Keep Logistic as production.')

# End
