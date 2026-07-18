import json
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression

# Only import shap inside functions or handle globally to not break the service if shap fails
import shap

ROOT = Path(__file__).resolve().parents[3]

def explain_win_probability(home: str, away: str, features_dict: dict, model_ver: str = "v9"):
    win_model_path = ROOT / f"models/production/win_probability_model_{model_ver}.pkl"
    win_features_path = ROOT / f"models/production/feature_columns_{model_ver}.json"
    
    if not win_model_path.exists() or not win_features_path.exists():
        return None
        
    model = joblib.load(win_model_path)
    feature_cols = json.loads(win_features_path.read_text())
    
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
    
    # Calculate isotonic shift
    base_pred_logit = base_val + sum(f["impact"] for f in factors)
    base_pred_prob = 1 / (1 + np.exp(-base_pred_logit))
    final_prob = float(model.predict_proba(X_local)[0][1])
    calibration_shift = final_prob - base_pred_prob
    
    # Add calibration as a distinct factor type
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

def explain_score_prediction(home: str, away: str, features_dict: dict, model_ver: str = "v9"):
    # Focus on TOTAL score for simplicity of explanation
    meta_path = ROOT / f"models/production/score_model_{model_ver}_metadata.json"
    pace_path = ROOT / f"models/production/score_model_{model_ver}_pace.pkl"
    home_rtg_path = ROOT / f"models/production/score_model_{model_ver}_home_rtg.pkl"
    away_rtg_path = ROOT / f"models/production/score_model_{model_ver}_away_rtg.pkl"
    ridge_total_path = ROOT / f"models/production/score_model_{model_ver}_ridge_total.pkl"
    
    if not all(p.exists() for p in [meta_path, pace_path, home_rtg_path, away_rtg_path, ridge_total_path]):
        return None
        
    meta = json.loads(meta_path.read_text())
    
    # Load base models
    pace_model = joblib.load(pace_path)
    home_model = joblib.load(home_rtg_path)
    
    # We will explain PACE as the primary driver to keep it simple, or we can explain PACE + HOME_RTG.
    # Let's explain PACE for the scorecard.
    row_pace = [features_dict.get(c, 0.0) for c in meta["pace_features"]]
    X_pace = pd.DataFrame([row_pace], columns=meta["pace_features"])
    
    explainer = shap.TreeExplainer(pace_model)
    shap_vals = explainer.shap_values(X_pace)[0]
    base_val = explainer.expected_value
    if isinstance(base_val, np.ndarray):
        base_val = base_val[0]
        
    factors = []
    for i, col in enumerate(meta["pace_features"]):
        val = shap_vals[i]
        if abs(val) > 0.01:
            factors.append({
                "feature": f"PACE_{col}",
                "impact": float(val),
                "direction": "positive" if val > 0 else "negative",
                "type": "shap_feature"
            })
            
    factors.sort(key=lambda x: abs(x["impact"]), reverse=True)
    
    # Ridge Adjustment
    ridge_total = joblib.load(ridge_total_path)
    
    ind_df = pd.DataFrame([{
        "is_playoff": float(features_dict.get("IS_PLAYOFF", 0.0)),
        "home_b2b": float(features_dict.get("IS_B2B", 0.0)),
        "away_b2b": float(features_dict.get("OPP_IS_B2B", 0.0)),
        "home_rest_advantage": float(features_dict.get("DAYS_REST", 3.0) > features_dict.get("OPP_DAYS_REST", 3.0)),
        "away_rest_advantage": float(features_dict.get("OPP_DAYS_REST", 3.0) > features_dict.get("DAYS_REST", 3.0)),
    }])
    ridge_adj = float(ridge_total.predict(ind_df)[0])
    
    factors.append({
        "feature": "RIDGE_RESIDUAL_CORRECTION",
        "impact": float(-ridge_adj), # prediction = raw - ridge_adj
        "direction": "positive" if -ridge_adj > 0 else "negative",
        "type": "calibration_adjustment"
    })
    
    pred_pace = float(pace_model.predict(X_pace)[0])
    return {
        "base_value": float(pred_pace),
        "final_prediction": float(pred_pace - ridge_adj),
        "top_factors": factors[:10],
        "unit": "pace",
        "model_type": "pace"
    }
