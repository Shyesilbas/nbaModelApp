"""
Unified SHAP Explainer module for Win Probability and Score Predictions.
Computes local feature impact distributions and calibration shifts.
"""

import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional

import shap
from scripts.artifact_paths import resolve_artifact_path


class ShapExplainer:
    def __init__(self, model_version: str = "v9"):
        self.model_version = model_version

    def explain_win_probability(
        self,
        features_dict: Dict[str, Any],
        win_model_path: Optional[Path] = None,
        win_features_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        m_path = win_model_path or resolve_artifact_path(
            "win_model", "model_path", f"models/production/win_probability_model_{self.model_version}.pkl"
        )
        f_path = win_features_path or resolve_artifact_path(
            "win_model", "feature_columns_path", f"models/production/feature_columns_{self.model_version}.json"
        )

        if not Path(m_path).exists() or not Path(f_path).exists():
            return None

        model = joblib.load(m_path)
        with open(f_path, "r", encoding="utf-8") as f:
            feature_cols = json.load(f)

        if hasattr(model, "estimator"):
            pipeline = model.estimator
        elif hasattr(model, "base_estimator"):
            pipeline = model.base_estimator
        else:
            pipeline = model

        row = [features_dict.get(c, 0.0) for c in feature_cols]
        X_local = pd.DataFrame([row], columns=feature_cols)

        scaler = pipeline.named_steps.get("scaler")
        imputer = pipeline.named_steps.get("imputer")
        clf = pipeline.named_steps.get("clf")

        if not clf:
            return None

        X_imp = imputer.transform(X_local) if imputer else X_local
        X_scaled = scaler.transform(X_imp) if scaler else X_imp

        explainer = shap.LinearExplainer(clf, X_scaled)
        shap_vals_raw = explainer.shap_values(X_scaled)

        base_val = explainer.expected_value
        if isinstance(base_val, np.ndarray):
            base_val = base_val[0]

        shap_vals = shap_vals_raw[0] if isinstance(shap_vals_raw, list) else shap_vals_raw
        if len(shap_vals.shape) > 1:
            shap_vals = shap_vals[0]

        factors = []
        for i, col in enumerate(feature_cols):
            val = shap_vals[i]
            if abs(val) > 0.001:
                factors.append({
                    "feature": col,
                    "impact": float(val),
                    "direction": "positive" if val > 0 else "negative",
                    "type": "shap_feature"
                })

        factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

        base_pred_logit = base_val + sum(f["impact"] for f in factors)
        base_pred_prob = 1.0 / (1.0 + np.exp(-base_pred_logit))
        final_prob = float(model.predict_proba(X_local)[0][1])
        calibration_shift = final_prob - base_pred_prob

        factors.append({
            "feature": "ISOTONIC_CALIBRATION_ADJUSTMENT",
            "impact": float(calibration_shift),
            "direction": "positive" if calibration_shift > 0 else "negative",
            "type": "calibration_adjustment"
        })

        return {
            "base_value": float(base_pred_prob),
            "final_prediction": float(final_prob),
            "top_factors": factors[:10],
            "unit": "probability",
            "model_type": "win_probability"
        }

    def explain_score_prediction(
        self,
        features_dict: Dict[str, Any],
        meta_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        m_path = meta_path or resolve_artifact_path(
            "score_model", "metadata_path", f"models/production/score_model_{self.model_version}_metadata.json"
        )
        pace_path = resolve_artifact_path(
            "score_model", "pace_model_path", f"models/production/score_model_{self.model_version}_pace.pkl"
        )
        home_rtg_path = resolve_artifact_path(
            "score_model", "home_rtg_model_path", f"models/production/score_model_{self.model_version}_home_rtg.pkl"
        )
        away_rtg_path = resolve_artifact_path(
            "score_model", "away_rtg_model_path", f"models/production/score_model_{self.model_version}_away_rtg.pkl"
        )

        if not all(Path(p).exists() for p in [m_path, pace_path, home_rtg_path, away_rtg_path]):
            return None

        with open(m_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

        pace_model = joblib.load(pace_path)
        home_rtg_model = joblib.load(home_rtg_path)
        away_rtg_model = joblib.load(away_rtg_path)

        pace_features = meta.get("pace_features", [])
        home_rtg_features = meta.get("home_off_rtg_features", meta.get("off_rtg_features", []))
        away_rtg_features = meta.get("away_off_rtg_features", meta.get("off_rtg_features", []))

        X_pace = pd.DataFrame([[features_dict.get(c, 0.0) for c in pace_features]], columns=pace_features)
        X_home = pd.DataFrame([[features_dict.get(c, 0.0) for c in home_rtg_features]], columns=home_rtg_features)

        pace_exp = shap.TreeExplainer(pace_model)
        home_exp = shap.TreeExplainer(home_rtg_model)

        pace_shap = pace_exp.shap_values(X_pace)[0]
        home_shap = home_exp.shap_values(X_home)[0]

        factors = []
        for i, col in enumerate(pace_features):
            val = pace_shap[i]
            if abs(val) > 0.1:
                factors.append({
                    "feature": f"PACE_{col}",
                    "impact": float(val),
                    "direction": "positive" if val > 0 else "negative",
                    "type": "pace_factor"
                })

        for i, col in enumerate(home_rtg_features):
            val = home_shap[i]
            if abs(val) > 0.1:
                factors.append({
                    "feature": f"HOME_OFF_RTG_{col}",
                    "impact": float(val),
                    "direction": "positive" if val > 0 else "negative",
                    "type": "efficiency_factor"
                })

        factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

        base_pace = float(pace_exp.expected_value)
        base_home = float(home_exp.expected_value)
        base_total = (base_pace * base_home / 100.0) * 2.0

        pred_pace = float(pace_model.predict(X_pace)[0])
        pred_home = float(home_rtg_model.predict(X_home)[0])
        pred_total = (pred_pace * pred_home / 100.0) * 2.0

        return {
            "base_value": float(base_total),
            "final_prediction": float(pred_total),
            "top_factors": factors[:10],
            "unit": "points",
            "model_type": "score_total"
        }
