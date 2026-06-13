import sys
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ml-service"))

import pandas as pd
import numpy as np

# Mock request schemas and service
from app.schemas import GameFullRequest
from app.service import init_model, predict_game_full

# Initialize
init_model()

# Setup test request
req = GameFullRequest(
    home_team_id="SAS",
    away_team_id="NYK",
    prediction_date="2026-06-13"
)

# Run full prediction containing XAI explanations
resp = predict_game_full(req)

print("--- Prediction results ---")
print(f"Winner: {resp.win_probability.home_win_prob >= 0.5 and 'SAS' or 'NYK'}")
print(f"Home Win Prob: {resp.win_probability.home_win_prob}")
print(f"Away Win Prob: {resp.win_probability.away_win_prob}")

if resp.explanation:
    print("\n--- XAI Features ---")
    for f in resp.explanation.win_probability.features:
        if f.feature_name in ["IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES", "HOME_SERIES_WINS", "AWAY_SERIES_WINS"]:
            print(f"Feature: {f.feature_name} | Value: {f.value} | Contrib: {f.contribution} | Influence: {f.influence}")
else:
    print("\nNo explanation found!")
