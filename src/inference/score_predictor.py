"""
Unified Score Predictor for NBA matchups.
Uses active production V9 score models (Pace, Home Off_Rtg, Away Off_Rtg, Margin, and Ridge residual calibration).
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import pandas as pd
import joblib

from src.core.artifact_paths import resolve_artifact_path
from src.features.build_matchup_features import build_features


class ScorePredictor:
    def __init__(self, metadata_path: Optional[Path] = None):
        self.metadata_path = metadata_path or resolve_artifact_path(
            "score_model", "metadata_path", "models/production/score_metadata.json"
        )
        self.metadata = {}
        self.pace_model = None
        self.home_rtg_model = None
        self.away_rtg_model = None
        self.margin_model = None
        self.ridge_total_model = None
        self.ridge_margin_model = None
        self._load()

    def _load(self) -> None:
        pace_path = resolve_artifact_path("score_model", "total_model_path", "models/production/score_model_pace.pkl")
        home_path = resolve_artifact_path("score_model", "home_model_path", "models/production/score_model_home_rtg.pkl")
        away_path = resolve_artifact_path("score_model", "away_model_path", "models/production/score_model_away_rtg.pkl")
        margin_path = resolve_artifact_path("score_model", "margin_model_path", "models/production/score_model_margin.pkl")
        ridge_total_path = resolve_artifact_path("score_model", "ridge_total_path", "models/production/score_model_ridge_total.pkl")
        ridge_margin_path = resolve_artifact_path("score_model", "ridge_margin_path", "models/production/score_model_ridge_margin.pkl")

        if Path(self.metadata_path).exists():
            with open(self.metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

        if Path(pace_path).exists():
            self.pace_model = joblib.load(pace_path)
        if Path(home_path).exists():
            self.home_rtg_model = joblib.load(home_path)
        if Path(away_path).exists():
            self.away_rtg_model = joblib.load(away_path)
        if Path(margin_path).exists():
            self.margin_model = joblib.load(margin_path)
        if Path(ridge_total_path).exists():
            self.ridge_total_model = joblib.load(ridge_total_path)
        if Path(ridge_margin_path).exists():
            self.ridge_margin_model = joblib.load(ridge_margin_path)

    def predict(
        self,
        home_team: str,
        away_team: str,
        prediction_date: str,
        features: Optional[Dict[str, Any]] = None,
        away_features: Optional[Dict[str, Any]] = None,
        win_probability: Optional[float] = None,
    ) -> Dict[str, Any]:
        if features is None:
            features = build_features(home_team, away_team, prediction_date)

        pace_features = self.metadata.get("pace_features", [])
        home_off_rtg_features = self.metadata.get("home_off_rtg_features", self.metadata.get("off_rtg_features", []))
        away_off_rtg_features = self.metadata.get("away_off_rtg_features", self.metadata.get("off_rtg_features", []))
        margin_features = self.metadata.get("margin_features", [])

        X_pace = pd.DataFrame([[features.get(c, 0.0) for c in pace_features]], columns=pace_features)
        X_home_rtg = pd.DataFrame([[features.get(c, 0.0) for c in home_off_rtg_features]], columns=home_off_rtg_features)
        X_margin = pd.DataFrame([[features.get(c, 0.0) for c in margin_features]], columns=margin_features)

        pred_pace = float(self.pace_model.predict(X_pace)[0]) if self.pace_model else 100.0
        pred_home_rtg = float(self.home_rtg_model.predict(X_home_rtg)[0]) if self.home_rtg_model else 110.0

        if away_features is None:
            away_features = build_features(away_team, home_team, prediction_date, team_is_home=False)
        X_away_rtg = pd.DataFrame([[away_features.get(c, 0.0) for c in away_off_rtg_features]], columns=away_off_rtg_features)
        pred_away_rtg = float(self.away_rtg_model.predict(X_away_rtg)[0]) if self.away_rtg_model else 110.0

        pred_total = (pred_pace * pred_home_rtg / 100.0) + (pred_pace * pred_away_rtg / 100.0)
        pred_margin = float(self.margin_model.predict(X_margin)[0]) if self.margin_model else 0.0

        if self.ridge_total_model is not None and self.ridge_margin_model is not None:
            X_ind = pd.DataFrame([[
                float(features.get("IS_PLAYOFF", 0) == 1),
                float(features.get("IS_B2B", 0) == 1),
                float(features.get("OPP_IS_B2B", 0) == 1),
                float(features.get("DAYS_REST", 0) > features.get("OPP_DAYS_REST", 0)),
                float(features.get("OPP_DAYS_REST", 0) > features.get("DAYS_REST", 0)),
            ]], columns=["is_playoff", "home_b2b", "away_b2b", "home_rest_advantage", "away_rest_advantage"])
            # Same corrections as the API (src/api/services/score_prediction.py).
            pred_total -= float(self.ridge_total_model.predict(X_ind)[0])
            pred_margin -= float(self.ridge_margin_model.predict(X_ind)[0])

        pred_home = (pred_total + pred_margin) / 2.0
        pred_away = (pred_total - pred_margin) / 2.0

        # Enforce joint mathematical alignment if win_probability is provided
        if win_probability is not None:
            if (win_probability >= 0.5 and pred_margin < 0) or (win_probability < 0.5 and pred_margin > 0):
                pred_margin = -pred_margin
                pred_home = (pred_total + pred_margin) / 2.0
                pred_away = (pred_total - pred_margin) / 2.0

        offsets = self.metadata.get("prediction_interval_offsets_80pct", {
            "home": [-8.0, 8.0],
            "away": [-8.0, 8.0],
            "total": [-12.0, 12.0],
            "margin": [-10.0, 10.0]
        })

        return {
            "predicted_pace": pred_pace,
            "home_off_rtg": pred_home_rtg,
            "away_off_rtg": pred_away_rtg,
            "predicted_home_score": pred_home,
            "predicted_away_score": pred_away,
            "predicted_total": pred_total,
            "predicted_margin": pred_margin,
            "home_score_range": [pred_home + offsets["home"][0], pred_home + offsets["home"][1]],
            "away_score_range": [pred_away + offsets["away"][0], pred_away + offsets["away"][1]],
            "total_range": [pred_total + offsets["total"][0], pred_total + offsets["total"][1]],
            "margin_range": [pred_margin + offsets["margin"][0], pred_margin + offsets["margin"][1]],
        }
