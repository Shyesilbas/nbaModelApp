from pathlib import Path

# Only import shap inside functions or handle globally to not break the service if shap fails

ROOT = Path(__file__).resolve().parents[3]

from src.inference.shap_explainer import ShapExplainer


def explain_win_probability(home: str, away: str, features_dict: dict):
    explainer = ShapExplainer()
    return explainer.explain_win_probability(features_dict)


def explain_score_prediction(home: str, away: str, features_dict: dict):
    explainer = ShapExplainer()
    return explainer.explain_score_prediction(features_dict)
