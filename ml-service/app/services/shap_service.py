import json
import joblib
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.linear_model import LogisticRegression

# Only import shap inside functions or handle globally to not break the service if shap fails
import shap

ROOT = Path(__file__).resolve().parents[3]

from src.inference.shap_explainer import ShapExplainer


def explain_win_probability(home: str, away: str, features_dict: dict, model_ver: str = "v9"):
    explainer = ShapExplainer(model_version=model_ver)
    return explainer.explain_win_probability(features_dict)


def explain_score_prediction(home: str, away: str, features_dict: dict, model_ver: str = "v9"):
    explainer = ShapExplainer(model_version=model_ver)
    return explainer.explain_score_prediction(features_dict)
