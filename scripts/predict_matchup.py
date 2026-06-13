"""
Prediction pipeline for a single matchup.
Usage:
  python scripts/predict_matchup.py --home LAL --away BOS --prediction-date 2026-03-15

Outputs JSON with:
{
  "home_team": "LAL",
  "away_team": "BOS",
  "predicted_winner": "LAL",
  "home_win_probability": 0.63,
  "away_win_probability": 0.37,
  "confidence_bucket": "Moderate confidence"
}

This script builds features (using only past games), loads the active win model artifacts, makes prediction, and validates inputs.
"""
import argparse
import json
import sys
from pathlib import Path
import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]

# Local import of builder (ensure scripts folder's parent is on sys.path)
sys.path.insert(0, str(ROOT))
from scripts.artifact_paths import resolve_artifact_path
from scripts.build_matchup_features import build_features  # type: ignore

CONFIDENCE_BUCKETS = [
    (0.5, 0.55, "Toss-up"),
    (0.55, 0.60, "Slight edge"),
    (0.60, 0.70, "Moderate confidence"),
    (0.70, 1.01, "Strong confidence")
]


def bucket_confidence(p):
    for lo, hi, name in CONFIDENCE_BUCKETS:
        if lo <= p < hi:
            return name
    return "Unknown"


def load_model_and_features():
    model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model_v8.pkl")
    features_path = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns_v8.json")
    if not model_path.exists():
        raise FileNotFoundError(f"Model not found at {model_path}. Run training first.")
    if not features_path.exists():
        raise FileNotFoundError(f"Feature columns file not found at {features_path}. Run training first.")
    model = joblib.load(model_path)
    feature_cols = json.loads(features_path.read_text())
    return model, feature_cols


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("--away", required=True)
    parser.add_argument("--prediction-date", required=True)
    args = parser.parse_args()

    # Build features
    try:
        features = build_features(args.home.upper(), args.away.upper(), args.prediction_date)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(2)

    model, feature_cols = load_model_and_features()

    # Ensure the model expects the same features
    missing = [c for c in feature_cols if c not in features]
    if missing:
        print(json.dumps({"error": f"Missing features required by model: {missing}"}))
        sys.exit(2)

    # Construct ordered DataFrame
    row = [features[c] for c in feature_cols]
    X = pd.DataFrame([row], columns=feature_cols)

    # Predict
    try:
        probs = model.predict_proba(X)[0]
    except Exception as e:
        print(json.dumps({"error": f"Model prediction failed: {e}"}))
        sys.exit(2)

    # probs assumed [P(class=0), P(class=1)] where class=1 means the team in row (home) wins
    p_home_win = float(probs[1])
    p_away_win = float(probs[0])

    predicted_winner = args.home.upper() if p_home_win >= 0.5 else args.away.upper()
    confidence_bucket = bucket_confidence(max(p_home_win, p_away_win))

    out = {
        "home_team": args.home.upper(),
        "away_team": args.away.upper(),
        "predicted_winner": predicted_winner,
        "home_win_probability": round(p_home_win, 4),
        "away_win_probability": round(p_away_win, 4),
        "confidence_bucket": confidence_bucket
    }

    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
