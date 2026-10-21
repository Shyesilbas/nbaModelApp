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
from src.core.artifact_paths import resolve_artifact_path


def linear_contributions(model, X: pd.DataFrame):
    """Exact SHAP of an imputer/scaler/linear pipeline against the training mean: coef * scaled value.

    Returns (per-feature contributions for the first row, intercept = prediction for an average row).
    """
    steps = model.named_steps
    Z = steps["imputer"].transform(X) if "imputer" in steps else X.to_numpy(dtype=float)
    Z = steps["scaler"].transform(Z) if "scaler" in steps else Z
    est = model.steps[-1][1]
    return Z[0] * np.ravel(est.coef_), float(np.ravel(est.intercept_)[0])


class ShapExplainer:
    def explain_win_probability(
        self,
        features_dict: Dict[str, Any],
        win_model_path: Optional[Path] = None,
        win_features_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        m_path = win_model_path or resolve_artifact_path(
            "win_model", "model_path", "models/production/win_model.pkl"
        )
        f_path = win_features_path or resolve_artifact_path(
            "win_model", "feature_columns_path", "models/production/win_features.json"
        )

        if not Path(m_path).exists() or not Path(f_path).exists():
            return None

        model = joblib.load(m_path)
        with open(f_path, "r", encoding="utf-8") as f:
            feature_cols = json.load(f)

        if hasattr(model, "calibrated_classifiers_") and len(model.calibrated_classifiers_) > 0:
            pipeline = model.calibrated_classifiers_[0].estimator
        elif hasattr(model, "estimator"):
            pipeline = model.estimator
        elif hasattr(model, "base_estimator"):
            pipeline = model.base_estimator
        else:
            pipeline = model

        row = [features_dict.get(c, 0.0) for c in feature_cols]
        X_local = pd.DataFrame([row], columns=feature_cols)

        scaler = pipeline.named_steps.get("scaler") if hasattr(pipeline, "named_steps") else None
        imputer = pipeline.named_steps.get("imputer") if hasattr(pipeline, "named_steps") else None
        clf = pipeline.named_steps.get("clf") if hasattr(pipeline, "named_steps") else pipeline

        if not clf:
            return None

        X_imp = imputer.transform(X_local) if imputer else X_local
        X_scaled = scaler.transform(X_imp) if scaler else X_imp

        clf_type = type(clf).__name__.lower()
        if "lgbm" in clf_type or "xgb" in clf_type or "catboost" in clf_type or "tree" in clf_type or "forest" in clf_type:
            explainer = shap.TreeExplainer(clf)
            shap_vals_raw = explainer.shap_values(X_scaled)
            base_val = explainer.expected_value
        else:
            # Background is the training mean (zero after scaling); using the row itself made every SHAP value 0.
            background = np.zeros((1, X_scaled.shape[1])) if scaler else imputer.statistics_.reshape(1, -1) if imputer else X_scaled
            explainer = shap.LinearExplainer(clf, background)
            shap_vals_raw = explainer.shap_values(X_scaled)
            base_val = explainer.expected_value

        if isinstance(base_val, (list, np.ndarray)):
            base_val = float(base_val[1] if len(base_val) > 1 else base_val[0])
        else:
            base_val = float(base_val)

        if isinstance(shap_vals_raw, list) and len(shap_vals_raw) > 1:
            shap_vals = shap_vals_raw[1]
        else:
            shap_vals = shap_vals_raw

        shap_vals = np.array(shap_vals)
        if len(shap_vals.shape) > 1:
            shap_vals = shap_vals[0]

        factors = []
        for i, col in enumerate(feature_cols):
            val = float(shap_vals[i])
            if abs(val) > 0.0001:
                factors.append({
                    "feature": col,
                    "impact": val,
                    "direction": "positive" if val > 0 else "negative",
                    "type": "shap_feature"
                })

        factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

        try:
            final_prob = float(model.predict_proba(X_local)[0][1])
        except Exception:
            final_prob = 0.5

        base_pred_logit = base_val + sum(f["impact"] for f in factors)
        base_pred_prob = 1.0 / (1.0 + np.exp(-np.clip(base_pred_logit, -20.0, 20.0)))
        calibration_shift = final_prob - base_pred_prob

        factors.append({
            "feature": "CALIBRATION_ADJUSTMENT",
            "impact": float(calibration_shift),
            "direction": "positive" if calibration_shift > 0 else "negative",
            "type": "calibration_adjustment"
        })

        return {
            "base_value": float(1.0 / (1.0 + np.exp(-base_val))),
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
            "score_model", "metadata_path", "models/production/score_metadata.json"
        )
        pace_path = resolve_artifact_path(
            "score_model", "total_model_path", "models/production/score_model_pace.pkl"
        )
        if not Path(pace_path).exists():
            pace_path = resolve_artifact_path(
                "score_model", "pace_model_path", "models/production/score_model_pace.pkl"
            )

        home_rtg_path = resolve_artifact_path(
            "score_model", "home_model_path", "models/production/score_model_home_rtg.pkl"
        )
        if not Path(home_rtg_path).exists():
            home_rtg_path = resolve_artifact_path(
                "score_model", "home_rtg_model_path", "models/production/score_model_home_rtg.pkl"
            )

        away_rtg_path = resolve_artifact_path(
            "score_model", "away_model_path", "models/production/score_model_away_rtg.pkl"
        )
        if not Path(away_rtg_path).exists():
            away_rtg_path = resolve_artifact_path(
                "score_model", "away_rtg_model_path", "models/production/score_model_away_rtg.pkl"
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
        X_away = pd.DataFrame([[features_dict.get(c, 0.0) for c in away_rtg_features]], columns=away_rtg_features)

        def contributions(model, X):
            if hasattr(model, "named_steps"):  # Ridge pipeline (score_v10 estimator: ridge)
                return linear_contributions(model, X)
            exp = shap.TreeExplainer(model)
            vals = exp.shap_values(X)
            base = exp.expected_value
            return (vals[0] if len(np.shape(vals)) > 1 else vals), float(base[0] if isinstance(base, (list, np.ndarray)) else base)

        pace_shap, base_pace = contributions(pace_model, X_pace)
        home_shap, base_home = contributions(home_rtg_model, X_home)

        factors = []
        for i, col in enumerate(pace_features):
            val = float(pace_shap[i])
            if abs(val) > 0.01:
                factors.append({
                    "feature": f"PACE_{col}",
                    "impact": val,
                    "direction": "positive" if val > 0 else "negative",
                    "type": "pace_factor"
                })

        for i, col in enumerate(home_rtg_features):
            val = float(home_shap[i])
            if abs(val) > 0.01:
                factors.append({
                    "feature": f"HOME_OFF_RTG_{col}",
                    "impact": val,
                    "direction": "positive" if val > 0 else "negative",
                    "type": "efficiency_factor"
                })

        factors.sort(key=lambda x: abs(x["impact"]), reverse=True)

        base_total = (base_pace * base_home / 100.0) * 2.0

        pred_pace = float(pace_model.predict(X_pace)[0])
        pred_home = float(home_rtg_model.predict(X_home)[0])
        pred_away = float(away_rtg_model.predict(X_away)[0])
        pred_total = (pred_pace * (pred_home + pred_away) / 200.0) * 2.0

        return {
            "base_value": float(base_total),
            "final_prediction": float(pred_total),
            "top_factors": factors[:10],
            "unit": "points",
            "model_type": "score_total"
        }

