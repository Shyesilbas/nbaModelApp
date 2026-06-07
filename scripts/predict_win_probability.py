"""
Predict win probabilities for a single matchup row.
Usage: python scripts/predict_win_probability.py --input-json path/to/row.json
The JSON should be a mapping of feature_name: value for all required features (feature_columns.json).
"""
import argparse
import json
import sys
from pathlib import Path
import pandas as pd
import joblib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.artifact_paths import resolve_artifact_path

MODEL_PATH = resolve_artifact_path("win_model", "model_path", "models/win_probability_model.pkl")
FEATURES_PATH = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns.json")

CONFIDENCE_BUCKETS = [
    (0.5, 0.55, "Toss-up"),
    (0.55, 0.60, "Slight edge"),
    (0.60, 0.70, "Moderate confidence"),
    (0.70, 1.01, "Strong confidence")
]


def load_model_and_features():
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model not found at {MODEL_PATH}. Please run the training script first.")
    if not FEATURES_PATH.exists():
        raise FileNotFoundError(f"Feature column file not found at {FEATURES_PATH}. Please run the training script first.")
    model = joblib.load(MODEL_PATH)
    with open(FEATURES_PATH, "r") as f:
        feature_cols = json.load(f)
    return model, feature_cols


def bucket_confidence(p):
    for lo, hi, name in CONFIDENCE_BUCKETS:
        if lo <= p < hi:
            return name
    return "Unknown"


def validate_input(feature_cols, input_dict):
    missing = [c for c in feature_cols if c not in input_dict]
    extra = [c for c in input_dict.keys() if c not in feature_cols]
    return missing, extra


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-json", required=True, help="Path to JSON file with a single feature row mapping")
    args = parser.parse_args()

    model, feature_cols = load_model_and_features()

    # Load input
    inp_path = Path(args.input_json)
    if not inp_path.exists():
        print(f"Input file not found: {inp_path}")
        sys.exit(2)
    with open(inp_path, "r") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        print("Input JSON must be an object mapping feature names to values for a single row.")
        sys.exit(2)

    missing, extra = validate_input(feature_cols, data)
    if missing:
        print("Missing required features:", missing)
        sys.exit(2)
    if extra:
        print("Warning: extra fields present in input (they will be ignored):", extra)

    # Build dataframe with correct column order
    row = {c: data.get(c, None) for c in feature_cols}
    X = pd.DataFrame([row], columns=feature_cols)

    # Predict
    try:
        probs = model.predict_proba(X)[0]
    except Exception as e:
        print("Model failed to produce probabilities:", e)
        sys.exit(2)

    # probs order: classes may be [0,1] -> second is home win probability if target was WIN==1 for home
    # We'll assume WIN==1 corresponds to the first class being 0 and second being 1; determine which index is 'home win'
    # The model was trained to predict the target column WIN (1 means team in row won). For matchup rows, expect 'home' row to be the row's team. For generic single-row input, return prob for class 1 as 'win prob' and class 0 as 'lose prob'.
    p_win = float(probs[1])
    p_lose = float(probs[0])

    predicted_winner = "home" if p_win >= 0.5 else "away"
    confidence_bucket = bucket_confidence(max(p_win, p_lose))

    out = {
        "predicted_winner": predicted_winner,
        "home_win_probability": p_win,
        "away_win_probability": p_lose,
        "confidence_bucket": confidence_bucket
    }

    print(json.dumps(out, indent=2))

if __name__ == '__main__':
    main()
