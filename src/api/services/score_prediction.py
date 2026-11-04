import logging
from typing import Any, Dict, Optional

import pandas as pd

from src.features.build_matchup_features import build_features
from src.inference.score_predictor import interval_offsets_80

from . import win_prediction as svc
from ..schemas import ScorePredictionRequest, ScorePredictionResponse, WinProbRequest, WinProbResponse

logger = logging.getLogger(__name__)


def predict_score(
    request: ScorePredictionRequest,
    features: Optional[Dict[str, Any]] = None,
    away_features: Optional[Dict[str, Any]] = None,
    win_response: Optional[WinProbResponse] = None,
) -> ScorePredictionResponse:
    if (
        svc.score_loader.pace_model is None
        or svc.score_loader.home_rtg_model is None
        or svc.score_loader.away_rtg_model is None
        or svc.score_loader.margin_model is None
        or svc.score_loader.metadata is None
    ):
        svc.init_model()

    if (
        svc.score_loader.pace_model is None
        or svc.score_loader.home_rtg_model is None
        or svc.score_loader.away_rtg_model is None
        or svc.score_loader.margin_model is None
        or svc.score_loader.metadata is None
    ):
        raise FileNotFoundError("Score models not fully loaded. Check service logs.")

    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, "isoformat") else str(request.prediction_date)
    home_team = request.home_team.upper()
    away_team = request.away_team.upper()

    if features is None:
        try:
            features = build_features(
                home_team,
                away_team,
                pred_date_str,
                season=getattr(request, "season", None),
                player_status_overrides=getattr(request, "player_status_overrides", None),
            )
        except Exception as e:
            if "No historical games" in str(e) or "Leakage" in str(e) or "No team-level games" in str(e):
                raise ValueError(str(e))
            raise e

    metadata = svc.score_loader.metadata
    pace_features = metadata.get("pace_features", [])
    home_off_rtg_features = metadata.get("home_off_rtg_features", metadata.get("off_rtg_features", []))
    away_off_rtg_features = metadata.get("away_off_rtg_features", metadata.get("off_rtg_features", []))
    margin_features = metadata.get("margin_features", [])

    model_features = list(set(pace_features + home_off_rtg_features + away_off_rtg_features + margin_features))
    missing = [c for c in model_features if c not in features]
    if missing:
        raise ValueError(f"Missing features required by score model: {missing}")

    X_pace = pd.DataFrame([[features[c] for c in pace_features]], columns=pace_features)
    X_home_rtg = pd.DataFrame([[features[c] for c in home_off_rtg_features]], columns=home_off_rtg_features)
    X_margin = pd.DataFrame([[features[c] for c in margin_features]], columns=margin_features)

    pred_pace = float(svc.score_loader.pace_model.predict(X_pace)[0])
    pred_home_rtg = float(svc.score_loader.home_rtg_model.predict(X_home_rtg)[0])

    features_away = (
        away_features
        if away_features is not None
        else build_features(
            away_team,
            home_team,
            pred_date_str,
            season=getattr(request, "season", None),
            player_status_overrides=getattr(request, "player_status_overrides", None),
            team_is_home=False,
        )
    )
    X_away_rtg = pd.DataFrame([[features_away[c] for c in away_off_rtg_features]], columns=away_off_rtg_features)
    pred_away_rtg = float(svc.score_loader.away_rtg_model.predict(X_away_rtg)[0])

    pred_total = (pred_pace * pred_home_rtg / 100.0) + (pred_pace * pred_away_rtg / 100.0)
    pred_margin = float(svc.score_loader.margin_model.predict(X_margin)[0])

    if svc.score_loader.ridge_total_model is not None and svc.score_loader.ridge_margin_model is not None:
        X_ind = pd.DataFrame([[
            float(features.get("IS_PLAYOFF", 0) == 1),
            float(features.get("IS_B2B", 0) == 1),
            float(features.get("OPP_IS_B2B", 0) == 1),
            float(features.get("DAYS_REST", 0) > features.get("OPP_DAYS_REST", 0)),
            float(features.get("OPP_DAYS_REST", 0) > features.get("DAYS_REST", 0)),
        ]], columns=["is_playoff", "home_b2b", "away_b2b", "home_rest_advantage", "away_rest_advantage"])

        pred_total -= float(svc.score_loader.ridge_total_model.predict(X_ind)[0])
        pred_margin -= float(svc.score_loader.ridge_margin_model.predict(X_ind)[0])

    confidence_warning = None
    try:
        win_resp = win_response
        if win_resp is None:
            win_req = WinProbRequest(home_team=home_team, away_team=away_team, prediction_date=pred_date_str)
            win_resp = svc.predict(win_req, features=features)
        if (win_resp.predicted_winner == home_team and pred_margin < 0) or (win_resp.predicted_winner == away_team and pred_margin > 0):
            score_favored = home_team if pred_margin > 0 else away_team
            confidence_warning = (
                f"Winner divergence: win model favors {win_resp.predicted_winner}, "
                f"while score margin favors {score_favored} (margin: {pred_margin:+.1f})"
            )
    except Exception as e:
        logger.warning(
            f"Failed to check win/margin consistency for {home_team} vs {away_team} on {pred_date_str}. Error: {str(e)}"
        )
        confidence_warning = "win/margin consistency check failed"

    pred_home = (pred_total + pred_margin) / 2.0
    pred_away = (pred_total - pred_margin) / 2.0

    offsets = interval_offsets_80(metadata, features.get("IS_PLAYOFF", 0) == 1, {
        "home": [-16.1, 16.1],
        "away": [-15.7, 15.7],
        "total": [-25.2, 25.2],
        "margin": [-20.1, 20.1]
    })

    return ScorePredictionResponse(
        home_team=home_team,
        away_team=away_team,
        predicted_home_score=round(pred_home, 1),
        home_score_range=[round(pred_home + offsets["home"][0], 1), round(pred_home + offsets["home"][1], 1)],
        predicted_away_score=round(pred_away, 1),
        away_score_range=[round(pred_away + offsets["away"][0], 1), round(pred_away + offsets["away"][1], 1)],
        predicted_total_points=round(pred_total, 1),
        total_points_range=[round(pred_total + offsets["total"][0], 1), round(pred_total + offsets["total"][1], 1)],
        predicted_margin=round(pred_margin, 1),
        margin_range=[round(pred_margin + offsets["margin"][0], 1), round(pred_margin + offsets["margin"][1], 1)],
        score_model_winner=home_team if pred_margin >= 0 else away_team,
        note="Score prediction has high natural variance. Use win probability model as primary winner signal.",
        model_version=svc.score_loader.get_version(),
        prediction_date=pred_date_str,
        confidence_warning=confidence_warning,
        predicted_pace=round(pred_pace, 1),
        predicted_home_off_rtg=round(pred_home_rtg, 1),
        predicted_away_off_rtg=round(pred_away_rtg, 1),
    )
