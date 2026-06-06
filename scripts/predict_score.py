"""
Prediction pipeline for team-level NBA score prediction (V2).
Loads models trained with player-level features and outputs expected score ranges.
Usage:
  python scripts/predict_score.py --home LAL --away BOS --prediction-date 2026-03-15
"""
import argparse
import json
import sys
from pathlib import Path
import joblib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
HOME_MODEL_PATH = ROOT / "models/home_score_model_v2.pkl"
AWAY_MODEL_PATH = ROOT / "models/away_score_model_v2.pkl"
TOTAL_MODEL_PATH = ROOT / "models/direct_total_points_model_v2.pkl"
DIFF_MODEL_PATH = ROOT / "models/direct_point_diff_model_v2.pkl"
METADATA_PATH = ROOT / "models/score_model_v2_metadata.json"

# Insert ROOT to sys.path to allow imports from scripts
sys.path.insert(0, str(ROOT))
from scripts.build_matchup_features import build_features  # type: ignore


def load_models_and_metadata():
    for p in [HOME_MODEL_PATH, AWAY_MODEL_PATH, TOTAL_MODEL_PATH, DIFF_MODEL_PATH, METADATA_PATH]:
        if not p.exists():
            raise FileNotFoundError(f"Model file not found at {p}. Run training script prepare_score_model.py first.")
            
    home_model = joblib.load(HOME_MODEL_PATH)
    away_model = joblib.load(AWAY_MODEL_PATH)
    total_model = joblib.load(TOTAL_MODEL_PATH)
    diff_model = joblib.load(DIFF_MODEL_PATH)
    
    with open(METADATA_PATH, "r") as f:
        metadata = json.load(f)
        
    return home_model, away_model, total_model, diff_model, metadata


def main():
    parser = argparse.ArgumentParser(description="Predict NBA scores and margins for a matchup (V2).")
    parser.add_argument("--home", required=True, help="Home team abbreviation (e.g., LAL)")
    parser.add_argument("--away", required=True, help="Away team abbreviation (e.g., BOS)")
    parser.add_argument("--prediction-date", required=True, help="YYYY-MM-DD tip-off date")
    args = parser.parse_args()

    home_team = args.home.upper()
    away_team = args.away.upper()
    pred_date = args.prediction_date

    # 1. Build pre-game features
    try:
        features = build_features(home_team, away_team, pred_date)
    except Exception as e:
        print(json.dumps({"error": f"Failed to build features: {e}"}))
        sys.exit(2)

    # 2. Load V2 models and metadata
    try:
        home_model, away_model, total_model, diff_model, metadata = load_models_and_metadata()
    except Exception as e:
        print(json.dumps({"error": f"Failed to load models or metadata: {e}"}))
        sys.exit(2)

    # 3. Construct input dataframe in the correct order using the V2 features list
    v1_features = metadata["features"]["v1"]
    player_features = metadata["features"]["player"]
    model_features = v1_features + player_features
    
    missing = [c for c in model_features if c not in features]
    if missing:
        print(json.dumps({"error": f"Missing features required by model: {missing}"}))
        sys.exit(2)

    row = [features[c] for c in model_features]
    X = pd.DataFrame([row], columns=model_features)

    # 4. Predict scores using models
    try:
        pred_home = float(home_model.predict(X)[0])
        pred_away = float(away_model.predict(X)[0])
        
        # Select direct or derived total points
        total_type = metadata["v2_model_evaluation"].get("primary_total_selection", "derived")
        if total_type == "direct":
            pred_total = float(total_model.predict(X)[0])
        else:
            pred_total = pred_home + pred_away
            
        # Select direct or derived margin
        margin_type = metadata["v2_model_evaluation"].get("primary_margin_selection", "derived")
        if margin_type == "direct":
            pred_margin = float(diff_model.predict(X)[0])
        else:
            pred_margin = pred_home - pred_away
            
    except Exception as e:
        print(json.dumps({"error": f"Model prediction failed: {e}"}))
        sys.exit(2)

    # 5. Apply empirical prediction intervals (80% confidence offsets)
    offsets = metadata["prediction_interval_offsets_80pct"]
    
    home_range = [round(pred_home + offsets["home"][0], 1), round(pred_home + offsets["home"][1], 1)]
    away_range = [round(pred_away + offsets["away"][0], 1), round(pred_away + offsets["away"][1], 1)]
    total_points_range = [round(pred_total + offsets["total"][0], 1), round(pred_total + offsets["total"][1], 1)]
    margin_range = [round(pred_margin + offsets["margin"][0], 1), round(pred_margin + offsets["margin"][1], 1)]

    # Determine score model winner (using predicted margin >= 0)
    score_model_winner = home_team if pred_margin >= 0 else away_team

    out = {
        "home_team": home_team,
        "away_team": away_team,
        "predicted_home_score": round(pred_home, 1),
        "home_score_range": home_range,
        "predicted_away_score": round(pred_away, 1),
        "away_score_range": away_range,
        "predicted_total_points": round(pred_total, 1),
        "total_points_range": total_points_range,
        "predicted_margin": round(pred_margin, 1),
        "margin_range": margin_range,
        "score_model_winner": score_model_winner,
        "note": "Score prediction has high natural variance. Use win probability model as primary winner signal."
    }

    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
