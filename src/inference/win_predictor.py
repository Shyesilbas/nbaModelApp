"""
Unified Win Probability Predictor for NBA matchups.
Uses active production V9 win model and feature schema.
"""

import json
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import pandas as pd
import joblib

from src.core.artifact_paths import resolve_artifact_path

CONFIDENCE_BUCKETS = [
    (0.5, 0.55, "Toss-up"),
    (0.55, 0.60, "Slight edge"),
    (0.60, 0.70, "Moderate confidence"),
    (0.70, 1.01, "Strong confidence"),
]


class WinPredictor:
    def __init__(
        self,
        model_path: Optional[Path] = None,
        features_path: Optional[Path] = None,
    ):
        self.model_path = model_path or resolve_artifact_path(
            "win_model", "model_path", "models/production/win_model.pkl"
        )
        self.features_path = features_path or resolve_artifact_path(
            "win_model", "feature_columns_path", "models/production/win_features.json"
        )
        self.model = None
        self.feature_cols = []
        self._load()

    def _load(self) -> None:
        if not Path(self.model_path).exists():
            raise FileNotFoundError(f"Win model not found at {self.model_path}")
        if not Path(self.features_path).exists():
            raise FileNotFoundError(f"Win feature columns file not found at {self.features_path}")

        self.model = joblib.load(self.model_path)
        with open(self.features_path, "r", encoding="utf-8") as f:
            self.feature_cols = json.load(f)

    @staticmethod
    def get_confidence_bucket(prob: float) -> str:
        for lo, hi, name in CONFIDENCE_BUCKETS:
            if lo <= prob < hi:
                return name
        return "Unknown"

    def predict_from_dict(self, input_dict: Dict[str, Any]) -> Dict[str, Any]:
        row = {c: input_dict.get(c, 0.0) for c in self.feature_cols}
        X = pd.DataFrame([row], columns=self.feature_cols)

        probs = self.model.predict_proba(X)[0]
        p_win = float(probs[1])
        p_lose = float(probs[0])

        predicted_winner = "home" if p_win >= 0.5 else "away"
        confidence_bucket = self.get_confidence_bucket(max(p_win, p_lose))

        return {
            "predicted_winner": predicted_winner,
            "home_win_probability": p_win,
            "away_win_probability": p_lose,
            "confidence_bucket": confidence_bucket,
        }
