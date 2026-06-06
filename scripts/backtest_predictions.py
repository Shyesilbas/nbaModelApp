"""
Backtest prediction pipeline over historical completed games.
Walks through game_results chronologically, for each completed game builds features using only prior games,
makes a prediction, and computes evaluation metrics: accuracy, precision, recall, f1, roc_auc, brier score.

Usage:
  python scripts/backtest_predictions.py --out-csv /tmp/predictions.csv

Notes:
 - This simulates deployment: predictions are generated using only historical games before tip-off.
 - Saves detailed per-game predictions and a metrics summary printed at the end.
"""
import argparse
import json
from pathlib import Path
from datetime import datetime
import pandas as pd
import numpy as np
import joblib
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, brier_score_loss
import sys

ROOT = Path(__file__).resolve().parents[1]
GAME_RESULTS = ROOT / "data/processed/game_results_2025_26.csv"
MODEL_PATH = ROOT / "models/win_probability_model.pkl"
FEATURES_PATH = ROOT / "models/feature_columns.json"

# Local import
sys.path.insert(0, str(ROOT))
from scripts.build_matchup_features import build_features  # type: ignore


def load_model_and_features():
    if not MODEL_PATH.exists():
        raise FileNotFoundError("Model not found; run training first")
    if not FEATURES_PATH.exists():
        raise FileNotFoundError("Feature columns file not found; run training first")
    model = joblib.load(MODEL_PATH)
    feature_cols = json.loads(FEATURES_PATH.read_text())
    return model, feature_cols


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-csv", help="Path to save per-game predictions CSV", default=None)
    parser.add_argument("--start-date", help="Optional start date (YYYY-MM-DD) to limit backtest")
    parser.add_argument("--end-date", help="Optional end date (YYYY-MM-DD) to limit backtest")
    args = parser.parse_args()

    if not GAME_RESULTS.exists():
        raise FileNotFoundError("game_results CSV not found at data/processed/game_results_2025_26.csv")

    games = pd.read_csv(GAME_RESULTS, parse_dates=["GAME_DATE"])\
              .sort_values("GAME_DATE")

    if args.start_date:
        games = games[games["GAME_DATE"] >= pd.to_datetime(args.start_date)]
    if args.end_date:
        games = games[games["GAME_DATE"] <= pd.to_datetime(args.end_date)]

    # Only completed games
    completed = games[games["GAME_STATUS"].str.contains("Final", na=False)].copy()
    print(f"Backtesting on {len(completed)} completed games")

    model, feature_cols = load_model_and_features()

    records = []
    y_true = []
    y_pred_probs = []
    y_pred_labels = []

    for idx, row in completed.iterrows():
        date_str = row["GAME_DATE"].strftime("%Y-%m-%d")
        home = row["HOME_TEAM_ABBREVIATION"]
        away = row["AWAY_TEAM_ABBREVIATION"]
        actual_home_win = 1 if row["WINNER_TEAM_ABBREVIATION"] == home else 0

        try:
            feats = build_features(home, away, date_str)
        except Exception as e:
            # Skip games where features cannot be built (e.g., season start and no prior games)
            print(f"Skipping {row['GAME_ID']} {home} vs {away} on {date_str}: {e}")
            continue

        # Ensure order
        X = pd.DataFrame([[feats[c] for c in feature_cols]], columns=feature_cols)
        try:
            probs = model.predict_proba(X)[0]
        except Exception as e:
            print(f"Model prediction failed for {row['GAME_ID']}: {e}")
            continue

        p_home = float(probs[1])
        pred_label = 1 if p_home >= 0.5 else 0

        records.append({
            "GAME_ID": row["GAME_ID"],
            "GAME_DATE": date_str,
            "HOME": home,
            "AWAY": away,
            "P_HOME": p_home,
            "P_AWAY": float(probs[0]),
            "PRED_LABEL": pred_label,
            "ACTUAL_HOME_WIN": actual_home_win
        })

        y_true.append(actual_home_win)
        y_pred_probs.append(p_home)
        y_pred_labels.append(pred_label)

    if len(records) == 0:
        print("No predictions were generated; check data and date filters")
        return

    df_out = pd.DataFrame(records)

    # Compute metrics
    acc = accuracy_score(y_true, y_pred_labels)
    prec = precision_score(y_true, y_pred_labels, zero_division=0)
    rec = recall_score(y_true, y_pred_labels, zero_division=0)
    f1 = f1_score(y_true, y_pred_labels, zero_division=0)
    try:
        roc = roc_auc_score(y_true, y_pred_probs)
    except Exception:
        roc = float('nan')
    brier = brier_score_loss(y_true, y_pred_probs)

    summary = {
        "n_predictions": len(df_out),
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "roc_auc": roc,
        "brier_score": brier
    }

    print(json.dumps(summary, indent=2))

    if args.out_csv:
        df_out.to_csv(args.out_csv, index=False)
        print(f"Saved per-game predictions to {args.out_csv}")

    # Also save a short metrics CSV in reports/
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / "backtest_summary.json").write_text(json.dumps(summary, indent=2))
    (reports / "backtest_predictions.csv").write_text(df_out.to_csv(index=False))
    print("Saved reports/backtest_summary.json and reports/backtest_predictions.csv")


if __name__ == '__main__':
    main()
