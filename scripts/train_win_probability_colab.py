"""
Colab-compatible script to train win probability models on Final Enhanced V2 dataset.
Saves RandomForest pipeline to models/win_probability_model.pkl
Writes metrics and feature importances to reports/metrics/*.csv

Usage in Colab:
- Upload this file or open from repo
- Run the cells / execute the script with python

"""

import os
from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
import joblib

# Paths (adjust if dataset lives elsewhere)
DATA_PATH = "data/processed/team_model_ready_v2_2025_26.csv"
MODEL_OUT = "models/win_probability_model.pkl"
METRICS_DIR = "reports/metrics"

# Ensure output dirs exist
os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
os.makedirs(METRICS_DIR, exist_ok=True)


def leakage_check(df, target_col="WIN", thresh=0.95):
    """Basic leakage checks:
    - Find features nearly perfectly correlated with target (abs(corr)>thresh)
    - Find columns that are constant or duplicate of target
    Returns list of suspected leakage columns.
    """
    suspects = []
    numeric = df.select_dtypes(include=[np.number]).copy()
    if target_col not in numeric.columns:
        raise ValueError(f"Target column {target_col} not found in numeric columns")
    corrs = numeric.corr()[target_col].abs().sort_values(ascending=False)
    # Skip the first which is correlation of target with itself
    for col, val in corrs.items():
        if col == target_col:
            continue
        if val >= thresh:
            suspects.append((col, float(val)))
    # Exact duplicates
    for col in numeric.columns:
        if col == target_col:
            continue
        if numeric[col].equals(numeric[target_col]):
            suspects.append((col, 1.0))
    return suspects


def separate_metadata(df):
    """Heuristic: metadata are identifiers, strings, or obviously non-feature columns.
    Returns df_features, df_meta
    """
    meta_candidates = [
        "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION",
        "OPPONENT_ABBREVIATION", "TEAM_ID"
    ]
    meta = [c for c in df.columns if c in meta_candidates]
    # Also treat object/string columns as metadata (names, matchups)
    object_cols = df.select_dtypes(include=[object]).columns.tolist()
    for c in object_cols:
        if c not in meta:
            meta.append(c)
    meta = list(dict.fromkeys(meta))
    features = [c for c in df.columns if c not in meta]
    return df[features].copy(), df[meta].copy()


def build_and_eval(df, target_col="WIN"):
    # Separate metadata
    df_features, df_meta = separate_metadata(df)

    # Ensure target exists
    if target_col not in df_features.columns:
        raise ValueError(f"Target {target_col} not found in dataset columns")

    # Leakage check
    suspects = leakage_check(df_features, target_col=target_col, thresh=0.95)
    if suspects:
        print("Potential leakage columns detected (name, corr):", suspects)
        # Drop exact duplicates of target
        exact_dups = [c for c, corr in suspects if corr == 1.0]
        if exact_dups:
            print("Dropping exact-duplicate columns:", exact_dups)
            df_features = df_features.drop(columns=exact_dups)

    # Prepare X,y
    y = df_features[target_col].astype(int)
    X = df_features.drop(columns=[target_col])

    # Chronological split by GAME_DATE in metadata if available to prevent temporal leakage
    if "GAME_DATE" in df_meta.columns:
        df_meta["GAME_DATE"] = pd.to_datetime(df_meta["GAME_DATE"]) 
        split_date = df_meta["GAME_DATE"].quantile(0.8)
        # Align index
        train_idx = df_meta.index[df_meta["GAME_DATE"] <= split_date].tolist()
        test_idx = df_meta.index[df_meta["GAME_DATE"] > split_date].tolist()
        if len(train_idx) == 0 or len(test_idx) == 0:
            # fallback to random split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        else:
            X_train = X.loc[train_idx]
            X_test = X.loc[test_idx]
            y_train = y.loc[train_idx]
            y_test = y.loc[test_idx]
    else:
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # Pipelines
    numeric_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    # Imputer + scaler for Logistic Regression
    lr_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42))
    ])

    # Imputer only for Random Forest
    rf_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("clf", RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1))
    ])

    print("Training Logistic Regression baseline...")
    lr_pipeline.fit(X_train, y_train)
    print("Training Random Forest...")
    rf_pipeline.fit(X_train, y_train)

    # Predictions and metrics
    models = {"logistic_regression": lr_pipeline, "random_forest": rf_pipeline}
    results = []

    for name, model in models.items():
        y_pred = model.predict(X_test)
        y_proba = None
        try:
            y_proba = model.predict_proba(X_test)[:, 1]
        except Exception:
            # some classifiers may not support predict_proba
            y_proba = model.decision_function(X_test)
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        roc = roc_auc_score(y_test, y_proba)
        cm = confusion_matrix(y_test, y_pred)
        print(f"Model: {name} -- Acc: {acc:.4f}, Prec: {prec:.4f}, Rec: {rec:.4f}, F1: {f1:.4f}, ROC-AUC: {roc:.4f}")
        results.append({
            "model": name,
            "accuracy": acc,
            "precision": prec,
            "recall": rec,
            "f1": f1,
            "roc_auc": roc
        })
        # Save confusion matrix figure
        fig, ax = plt.subplots(figsize=(4,4))
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False, ax=ax)
        ax.set_title(f"Confusion Matrix: {name}")
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        fig_path = os.path.join(METRICS_DIR, f"confusion_matrix_{name}.png")
        fig.savefig(fig_path, bbox_inches="tight")
        plt.close(fig)

        # Feature importance / coefficients
        if name == "logistic_regression":
            # Coefficients correspond to numeric feature order after pipeline transformations.
            # We approximate by applying imputer+scaler to X_train and using numeric column order.
            transformed = model.named_steps["imputer"].fit_transform(X_train)
            # scaler exists
            scaled = model.named_steps["scaler"].fit_transform(transformed)
            coefs = model.named_steps["clf"].coef_.ravel()
            features = X_train.columns.tolist()
            coef_df = pd.DataFrame({"feature": features, "coefficient": coefs})
            coef_df = coef_df.sort_values(by="coefficient", key=lambda x: x.abs(), ascending=False)
            coef_df.to_csv(os.path.join(METRICS_DIR, f"coefficients_{name}.csv"), index=False)
        else:
            importances = model.named_steps["clf"].feature_importances_
            features = X_train.columns.tolist()
            imp_df = pd.DataFrame({"feature": features, "importance": importances})
            imp_df = imp_df.sort_values(by="importance", ascending=False)
            imp_df.to_csv(os.path.join(METRICS_DIR, f"feature_importances_{name}.csv"), index=False)

    # Save metrics summary as CSV
    metrics_df = pd.DataFrame(results)
    metrics_df.to_csv(os.path.join(METRICS_DIR, "win_model_metrics.csv"), index=False)

    # Choose Random Forest as final model to save
    final_model = rf_pipeline
    joblib.dump(final_model, MODEL_OUT)
    print(f"Saved Random Forest pipeline to {MODEL_OUT}")

    return metrics_df


if __name__ == "__main__":
    # Load dataset
    print("Loading dataset:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)
    print("Rows, cols:", df.shape)
    metrics = build_and_eval(df, target_col="WIN")
    print("Done. Metrics written to:", METRICS_DIR)
