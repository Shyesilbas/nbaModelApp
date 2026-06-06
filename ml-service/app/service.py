from .model_loader import ModelLoader, ScoreModelLoader
from .schemas import WinProbRequest, WinProbResponse, ScorePredictionRequest, ScorePredictionResponse
from scripts.build_matchup_features import build_features
import pandas as pd
import numpy as np

loader = ModelLoader()
score_loader = ScoreModelLoader()


def init_model():
    loader.load()
    score_loader.load()


def predict(request: WinProbRequest) -> WinProbResponse:
    # Normalize and validate prediction_date (pydantic date ensures valid YYYY-MM-DD)
    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, 'isoformat') else str(request.prediction_date)

    # Build features using shared pipeline
    try:
        feats = build_features(request.home_team.upper(), request.away_team.upper(), pred_date_str)
    except Exception as e:
        if "No historical games" in str(e) or "Leakage" in str(e) or "No team-level games" in str(e):
            raise ValueError(str(e))
        raise e

    # Order features accordingly
    feature_cols = loader.feature_cols
    row = [feats.get(c, float("nan")) for c in feature_cols]
    X = pd.DataFrame([row], columns=feature_cols)

    probs = loader.predict_proba(X)[0]
    p_home = float(probs[1])
    p_away = float(probs[0])

    model_version = loader.get_version()

    return WinProbResponse(
        home_team=request.home_team.upper(),
        away_team=request.away_team.upper(),
        predicted_winner=request.home_team.upper() if p_home >= 0.5 else request.away_team.upper(),
        home_win_probability=round(p_home, 4),
        away_win_probability=round(p_away, 4),
        confidence_bucket=("Strong confidence" if max(p_home,p_away)>=0.7 else ("Moderate confidence" if max(p_home,p_away)>=0.6 else ("Slight edge" if max(p_home,p_away)>=0.55 else "Toss-up"))),
        model_version=model_version,
        prediction_date=pred_date_str
    )


def predict_score(request: ScorePredictionRequest) -> ScorePredictionResponse:
    if (score_loader.home_model is None or 
        score_loader.away_model is None or 
        score_loader.total_model is None or 
        score_loader.diff_model is None or 
        score_loader.metadata is None):
        raise FileNotFoundError("Score V2 models not fully loaded. Check service logs.")

    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, 'isoformat') else str(request.prediction_date)
    home_team = request.home_team.upper()
    away_team = request.away_team.upper()

    # Build features using shared pipeline
    try:
        features = build_features(home_team, away_team, pred_date_str)
    except Exception as e:
        if "No historical games" in str(e) or "Leakage" in str(e) or "No team-level games" in str(e):
            raise ValueError(str(e))
        raise e

    metadata = score_loader.metadata
    v1_features = metadata["features"]["v1"]
    player_features = metadata["features"]["player"]
    model_features = v1_features + player_features

    missing = [c for c in model_features if c not in features]
    if missing:
        raise ValueError(f"Missing features required by score model: {missing}")

    row = [features[c] for c in model_features]
    X = pd.DataFrame([row], columns=model_features)

    # Predict scores using models
    pred_home = float(score_loader.home_model.predict(X)[0])
    pred_away = float(score_loader.away_model.predict(X)[0])

    # Select direct or derived total points
    total_type = metadata.get("v2_model_evaluation", {}).get("primary_total_selection", "derived")
    if total_type == "direct":
        pred_total = float(score_loader.total_model.predict(X)[0])
    else:
        pred_total = pred_home + pred_away

    # Select direct or derived margin
    margin_type = metadata.get("v2_model_evaluation", {}).get("primary_margin_selection", "derived")
    if margin_type == "direct":
        pred_margin = float(score_loader.diff_model.predict(X)[0])
    else:
        pred_margin = pred_home - pred_away

    # Apply empirical prediction intervals (80% confidence offsets)
    offsets = metadata["prediction_interval_offsets_80pct"]
    home_range = [round(pred_home + offsets["home"][0], 1), round(pred_home + offsets["home"][1], 1)]
    away_range = [round(pred_away + offsets["away"][0], 1), round(pred_away + offsets["away"][1], 1)]
    total_points_range = [round(pred_total + offsets["total"][0], 1), round(pred_total + offsets["total"][1], 1)]
    margin_range = [round(pred_margin + offsets["margin"][0], 1), round(pred_margin + offsets["margin"][1], 1)]

    # Determine score model winner (using predicted margin >= 0)
    score_model_winner = home_team if pred_margin >= 0 else away_team
    model_version = score_loader.get_version()

    return ScorePredictionResponse(
        home_team=home_team,
        away_team=away_team,
        predicted_home_score=round(pred_home, 1),
        home_score_range=home_range,
        predicted_away_score=round(pred_away, 1),
        away_score_range=away_range,
        predicted_total_points=round(pred_total, 1),
        total_points_range=total_points_range,
        predicted_margin=round(pred_margin, 1),
        margin_range=margin_range,
        score_model_winner=score_model_winner,
        note="Score prediction has high natural variance. Use win probability model as primary winner signal.",
        model_version=model_version,
        prediction_date=pred_date_str
    )

