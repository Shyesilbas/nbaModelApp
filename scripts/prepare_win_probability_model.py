"""
Train Logistic Regression, calibrate (sigmoid & isotonic), evaluate and save best model and metadata.
Usage: python scripts/prepare_win_probability_model.py
"""
import os
from pathlib import Path
import json
from datetime import datetime
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             roc_auc_score, brier_score_loss)
import joblib

# Paths
ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data/processed/team_model_ready_v2_2025_26.csv"
MODELS_DIR = ROOT / "models"
REPORTS_DIR = ROOT / "reports"

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

TARGET_COL = "WIN"


def separate_metadata(df):
    meta_candidates = [
        "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION",
        "OPPONENT_ABBREVIATION", "TEAM_ID"
    ]
    meta = [c for c in df.columns if c in meta_candidates]
    object_cols = df.select_dtypes(include=[object]).columns.tolist()
    for c in object_cols:
        if c not in meta:
            meta.append(c)
    meta = list(dict.fromkeys(meta))
    features = [c for c in df.columns if c not in meta]
    return df[features].copy(), df[meta].copy()


def leakage_check(df, target_col=TARGET_COL, thresh=0.95):
    suspects = []
    numeric = df.select_dtypes(include=[np.number]).copy()
    if target_col not in numeric.columns:
        raise ValueError(f"Target column {target_col} not found in numeric columns")
    corrs = numeric.corr()[target_col].abs().sort_values(ascending=False)
    for col, val in corrs.items():
        if col == target_col:
            continue
        if val >= thresh:
            suspects.append((col, float(val)))
    for col in numeric.columns:
        if col == target_col:
            continue
        if numeric[col].equals(numeric[target_col]):
            suspects.append((col, 1.0))
    return suspects


def eval_metrics(y_true, y_proba, threshold=0.5):
    y_pred = (y_proba >= threshold).astype(int)
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    roc = roc_auc_score(y_true, y_proba)
    brier = brier_score_loss(y_true, y_proba)
    return dict(accuracy=acc, precision=prec, recall=rec, f1=f1, roc_auc=roc, brier_score=brier)


def main():
    print("Loading dataset:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    print("Rows, cols:", df.shape)

    df_features, df_meta = separate_metadata(df)
    if TARGET_COL not in df_features.columns:
        raise ValueError(f"Target {TARGET_COL} not found in dataset columns")

    suspects = leakage_check(df_features, target_col=TARGET_COL, thresh=0.95)
    if suspects:
        print("Potential leakage columns detected (name, corr):", suspects)
        exact_dups = [c for c, corr in suspects if corr == 1.0]
        if exact_dups:
            print("Dropping exact-duplicate columns:", exact_dups)
            df_features = df_features.drop(columns=exact_dups)

    y = df_features[TARGET_COL].astype(int)
    X = df_features.drop(columns=[TARGET_COL])

    # Chronological split if GAME_DATE available
    if "GAME_DATE" in df_meta.columns:
        df_meta["GAME_DATE"] = pd.to_datetime(df_meta["GAME_DATE"]) 
        split_date = df_meta["GAME_DATE"].quantile(0.8)
        train_idx = df_meta.index[df_meta["GAME_DATE"] <= split_date].tolist()
        test_idx = df_meta.index[df_meta["GAME_DATE"] > split_date].tolist()
        if len(train_idx) == 0 or len(test_idx) == 0:
            X_train_full, X_test, y_train_full, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        else:
            X_train_full = X.loc[train_idx]
            X_test = X.loc[test_idx]
            y_train_full = y.loc[train_idx]
            y_test = y.loc[test_idx]
    else:
        X_train_full, X_test, y_train_full, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # Split train_full into train and calibration sets
    X_train, X_cal, y_train, y_cal = train_test_split(X_train_full, y_train_full, test_size=0.2, random_state=42, stratify=y_train_full)

    # Build LR pipeline
    lr_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42))
    ])

    # Fit base LR
    print("Fitting base Logistic Regression on training split...")
    lr_pipeline.fit(X_train, y_train)

    # Uncalibrated predictions on test
    try:
        y_proba_uncal = lr_pipeline.predict_proba(X_test)[:, 1]
    except Exception:
        y_proba_uncal = lr_pipeline.decision_function(X_test)
    metrics_uncal = eval_metrics(y_test, y_proba_uncal)
    print("Uncalibrated LR metrics:", metrics_uncal)

    # Calibrate with sigmoid and isotonic using prefit estimator
    print("Calibrating (sigmoid)...")
    calibrator_sig = CalibratedClassifierCV(estimator=lr_pipeline, method="sigmoid", cv='prefit')
    # For cv='prefit', CalibratedClassifierCV expects estimator already fitted; fit using calibration set
    calibrator_sig.fit(X_cal, y_cal)
    y_proba_sig = calibrator_sig.predict_proba(X_test)[:, 1]
    metrics_sig = eval_metrics(y_test, y_proba_sig)
    print("Sigmoid-calibrated metrics:", metrics_sig)

    print("Calibrating (isotonic)...")
    calibrator_iso = CalibratedClassifierCV(estimator=lr_pipeline, method="isotonic", cv='prefit')
    # Isotonic requires more data; wrap in try/except
    try:
        calibrator_iso.fit(X_cal, y_cal)
        y_proba_iso = calibrator_iso.predict_proba(X_test)[:, 1]
        metrics_iso = eval_metrics(y_test, y_proba_iso)
        print("Isotonic-calibrated metrics:", metrics_iso)
    except Exception as e:
        print("Isotonic calibration failed:", e)
        metrics_iso = None
        y_proba_iso = None
        calibrator_iso = None

    # Compare models: choose best by Brier then ROC-AUC
    candidates = [
        ("uncalibrated", lr_pipeline, metrics_uncal),
        ("sigmoid", calibrator_sig, metrics_sig)
    ]
    if metrics_iso is not None and calibrator_iso is not None:
        candidates.append(("isotonic", calibrator_iso, metrics_iso))

    # Filter out any None metrics
    candidates = [c for c in candidates if c[2] is not None]

    # Sort by brier (ascending), then by roc_auc (descending)
    candidates_sorted = sorted(candidates, key=lambda item: (item[2]["brier_score"], -item[2]["roc_auc"]))
    best_name, best_model, best_metrics = candidates_sorted[0]
    print(f"Selected best model: {best_name}")

    # Save model
    model_path = MODELS_DIR / "win_probability_model.pkl"
    joblib.dump(best_model, model_path)
    print("Saved model to", model_path)

    # Save feature columns
    feature_cols = X.columns.tolist()
    feat_path = MODELS_DIR / "feature_columns.json"
    with open(feat_path, "w") as f:
        json.dump(feature_cols, f, indent=2)
    print("Saved feature column list to", feat_path)

    # Save metadata
    metadata = {
        "model_name": "logistic_regression",
        "training_date": datetime.utcnow().isoformat() + "Z",
        "number_of_rows": int(df.shape[0]),
        "number_of_features": int(X.shape[1]),
        "metrics": {
            "uncalibrated": metrics_uncal,
            "sigmoid": metrics_sig,
            "isotonic": metrics_iso
        },
        "selected_calibration": best_name,
        "target_column": TARGET_COL
    }
    meta_path = MODELS_DIR / "model_metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print("Saved model metadata to", meta_path)

    print("Done.")


if __name__ == '__main__':
    main()
