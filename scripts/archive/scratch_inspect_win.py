import joblib
import json
from pathlib import Path

ROOT = Path("/Users/serhat/agProjects/nbaModelApp")
win_model_path = ROOT / "models/production/win_probability_model.pkl"
win_features_path = ROOT / "models/production/feature_columns.json"

print("Loading win probability model and feature list...")
try:
    model = joblib.load(win_model_path)
    print("Model loaded successfully.")
    print("Model Pipeline Steps:", [step[0] for step in model.steps] if hasattr(model, 'steps') else "No steps")
except Exception as e:
    print(f"Error loading model: {e}")

try:
    with open(win_features_path, "r") as f:
        features = json.load(f)
    print(f"Number of features: {len(features)}")
    print("Features list:")
    for i, feat in enumerate(features):
        print(f"  {i+1}: {feat}")
except Exception as e:
    print(f"Error loading features: {e}")
