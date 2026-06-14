from typing import List

import numpy as np
import pandas as pd

from .. import service as svc
from ..schemas import ExplanationFeature, WinProbabilityExplanation
from .feature_metadata import FEATURE_METADATA


def _playoff_influence(raw_val: float, feats: dict) -> str:
    home_wins = feats.get("HOME_SERIES_WINS", 0)
    away_wins = feats.get("AWAY_SERIES_WINS", 0)
    if home_wins is None or (isinstance(home_wins, float) and np.isnan(home_wins)):
        home_wins = 0
    if away_wins is None or (isinstance(away_wins, float) and np.isnan(away_wins)):
        away_wins = 0

    if raw_val != 1.0:
        return "NEUTRAL"
    if home_wins == 3 and away_wins < 3:
        return "FAVORS_HOME"
    if away_wins == 3 and home_wins < 3:
        return "FAVORS_AWAY"
    return "NEUTRAL"


def explain_win_probability(feats: dict) -> WinProbabilityExplanation:
    if svc.loader.model is None or svc.loader.feature_cols is None:
        return WinProbabilityExplanation(intercept=0.0, features=[])

    model = svc.loader.model
    if hasattr(model, "calibrated_classifiers_"):
        pipeline = model.calibrated_classifiers_[0].estimator
    else:
        pipeline = model

    imputer = pipeline.named_steps.get("imputer")
    scaler = pipeline.named_steps.get("scaler")
    clf = pipeline.named_steps.get("clf")

    row = [feats.get(c, float("nan")) for c in svc.loader.feature_cols]
    df = pd.DataFrame([row], columns=svc.loader.feature_cols)

    X_imp = imputer.transform(df) if imputer else df.fillna(0.0)
    X_scaled = scaler.transform(X_imp) if scaler else X_imp.values

    coefs = clf.coef_[0]
    intercept = float(clf.intercept_[0])

    explanations = []
    for i, col in enumerate(svc.loader.feature_cols):
        raw_val = float(df.iloc[0, i])
        if np.isnan(raw_val):
            raw_val = 0.0
        contrib = float(coefs[i] * float(X_scaled[0, i]))
        meta = FEATURE_METADATA.get(col, {"display": col.replace("_", " ").title(), "category": "General"})

        if col in ["IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]:
            influence = _playoff_influence(raw_val, feats)
        elif contrib > 0.01:
            influence = "FAVORS_HOME"
        elif contrib < -0.01:
            influence = "FAVORS_AWAY"
        else:
            influence = "NEUTRAL"

        explanations.append(ExplanationFeature(
            feature_name=col,
            display_name=meta["display"],
            category=meta["category"],
            value=round(raw_val, 2),
            contribution=round(contrib, 4),
            influence=influence
        ))

    explanations.sort(key=lambda x: abs(x.contribution), reverse=True)
    return WinProbabilityExplanation(intercept=round(intercept, 4), features=explanations)


def explain_xgboost_model(model, features_list, feats_dict, perspective: str = "home") -> List[ExplanationFeature]:
    if model is None or not features_list:
        return []

    import xgboost as xgb
    row = [feats_dict.get(c, 0.0) for c in features_list]
    X = pd.DataFrame([row], columns=features_list)

    try:
        booster = model.get_booster()
        dmat = xgb.DMatrix(X)
        contribs = booster.predict(dmat, pred_contribs=True)[0]

        explanations = []
        for i, col in enumerate(features_list):
            raw_val = float(feats_dict.get(col, 0.0))
            contrib = float(contribs[i])
            meta = FEATURE_METADATA.get(col, {"display": col.replace("_", " ").title(), "category": "General"})

            if col in ["IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]:
                influence = _playoff_influence(raw_val, feats_dict)
            elif perspective == "home":
                influence = "FAVORS_HOME" if contrib > 0.01 else ("FAVORS_AWAY" if contrib < -0.01 else "NEUTRAL")
            elif perspective == "away":
                influence = "FAVORS_AWAY" if contrib > 0.01 else ("FAVORS_HOME" if contrib < -0.01 else "NEUTRAL")
            else:
                influence = "NEUTRAL"

            explanations.append(ExplanationFeature(
                feature_name=col,
                display_name=meta["display"],
                category=meta["category"],
                value=round(raw_val, 2),
                contribution=round(contrib, 4),
                influence=influence
            ))

        explanations.sort(key=lambda x: abs(x.contribution), reverse=True)
        return explanations
    except Exception as e:
        print("XGBoost explanation failed:", e)
        return []
