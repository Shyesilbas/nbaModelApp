from .model_loader import ModelLoader, ScoreModelLoader, PlayerModelLoader
from .schemas import (
    WinProbRequest, WinProbResponse,
    ScorePredictionRequest, ScorePredictionResponse,
    ModelStatusResponse, ModelMetrics, WinModelInfo, ScoreModelInfo,
    PlayerPredictionResponse, PlayerPrediction,
    GameFullRequest, GameFullResponse, ScorePredictionSub, WinProbabilitySub, GameFullPlayer, ScaleFactorsSub
)
from .player_service import get_player_predictions
from scripts.build_matchup_features import build_features
from scripts.artifact_paths import resolve_artifact_path
from scripts.inference.top_down_scaling import apply_top_down_scaling
from datetime import date
import pandas as pd
import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

loader = ModelLoader()
score_loader = ScoreModelLoader()
player_loader = PlayerModelLoader()


def init_model():
    loader.load()
    score_loader.load()
    try:
        player_loader.load()
    except Exception as e:
        print("Player models could not be loaded:", e)


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
    if (score_loader.pace_model is None or 
        score_loader.home_rtg_model is None or 
        score_loader.away_rtg_model is None or 
        score_loader.margin_model is None or 
        score_loader.metadata is None):
        raise FileNotFoundError("Score V3 models not fully loaded. Check service logs.")

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
    pace_features = metadata.get("pace_features", [])
    home_off_rtg_features = metadata.get("home_off_rtg_features", metadata.get("off_rtg_features", []))
    away_off_rtg_features = metadata.get("away_off_rtg_features", metadata.get("off_rtg_features", []))
    margin_features = metadata.get("margin_features", [])
    
    # We need the union of all features to verify they exist
    model_features = list(set(pace_features + home_off_rtg_features + away_off_rtg_features + margin_features))

    missing = [c for c in model_features if c not in features]
    if missing:
        raise ValueError(f"Missing features required by score model: {missing}")

    X_pace = pd.DataFrame([[features[c] for c in pace_features]], columns=pace_features)
    X_home_rtg = pd.DataFrame([[features[c] for c in home_off_rtg_features]], columns=home_off_rtg_features)
    X_margin = pd.DataFrame([[features[c] for c in margin_features]], columns=margin_features)

    # Predict Pace and Offensive Ratings
    pred_pace = float(score_loader.pace_model.predict(X_pace)[0])
    pred_home_rtg = float(score_loader.home_rtg_model.predict(X_home_rtg)[0])
    
    # For Away RTG, we need to map the features because X_rtg is built from the home team's perspective.
    # The build_matchup_features pipeline natively supports "home" and "away" perspective
    # But since build_features returns features from Home's perspective, we must fetch Away's perspective.
    features_away = build_features(away_team, home_team, pred_date_str)
    X_away_rtg = pd.DataFrame([[features_away[c] for c in away_off_rtg_features]], columns=away_off_rtg_features)
    pred_away_rtg = float(score_loader.away_rtg_model.predict(X_away_rtg)[0])

    # Derive Expected Scores
    pred_home = pred_pace * pred_home_rtg / 100.0
    pred_away = pred_pace * pred_away_rtg / 100.0
    pred_total = pred_home + pred_away

    # Margin prediction
    pred_margin = float(score_loader.margin_model.predict(X_margin)[0])

    # Enforce Win Probability Alignment and Mathematical Reconciliation
    # Win Probability model is our primary classification source.
    try:
        win_req = WinProbRequest(home_team=home_team, away_team=away_team, prediction_date=pred_date_str)
        win_resp = predict(win_req)
        win_winner = win_resp.predicted_winner
        
        # Check margin alignment
        if (win_winner == home_team and pred_margin < 0) or (win_winner == away_team and pred_margin > 0):
            pred_margin = -pred_margin
            
    except Exception:
        pass

    # Reconcile scores mathematically: Home - Away = Margin, Home + Away = Total
    # We use pred_total from Pace * OffRtg as the base expectation for game pace.
    pred_home = (pred_total + pred_margin) / 2.0
    pred_away = (pred_total - pred_margin) / 2.0

    # Apply empirical prediction intervals (we'll just mock 80% confidence offsets for V3 if not in metadata)
    offsets = metadata.get("prediction_interval_offsets_80pct", {
        "home": [-8.0, 8.0],
        "away": [-8.0, 8.0],
        "total": [-12.0, 12.0],
        "margin": [-10.0, 10.0]
    })
    
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


def predict_players(request: ScorePredictionRequest) -> PlayerPredictionResponse:
    if player_loader.pts_model is None:
        raise FileNotFoundError("Player models not loaded.")

    home_team = request.home_team.upper()
    away_team = request.away_team.upper()
    pred_date_str = request.prediction_date.isoformat() if hasattr(request.prediction_date, 'isoformat') else str(request.prediction_date)

    # 1. Get raw player predictions
    players_df = get_player_predictions(home_team, away_team, pred_date_str, player_loader, score_loader)

    # 2. Get Team Score Predictions for Top-Down Scaling
    score_resp = predict_score(request)
    exp_home_score = score_resp.predicted_home_score
    exp_away_score = score_resp.predicted_away_score

    # 3. Apply Scaling
    home_players_df = players_df[players_df["IS_HOME"] == 1]
    away_players_df = players_df[players_df["IS_HOME"] == 0]

    raw_home_pts = home_players_df["RAW_PROJ_PTS"].sum()
    raw_away_pts = away_players_df["RAW_PROJ_PTS"].sum()

    home_scale = exp_home_score / raw_home_pts if raw_home_pts > 0 else 1.0
    away_scale = exp_away_score / raw_away_pts if raw_away_pts > 0 else 1.0

    def parse_players(df, scale):
        res = []
        for _, r in df.iterrows():
            res.append(PlayerPrediction(
                player_id=int(r["PLAYER_ID"]),
                player_name=str(r.get("PLAYER_NAME", f"Player {r['PLAYER_ID']}")),
                position_group=str(r.get("PLAYER_POSITION_GROUP", "UNKNOWN")),
                predicted_pts=round(r["RAW_PROJ_PTS"] * scale, 1),
                predicted_reb=round(r["RAW_PROJ_REB"], 1),
                predicted_ast=round(r["RAW_PROJ_AST"], 1),
                predicted_pra=round((r["RAW_PROJ_PTS"] * scale) + r["RAW_PROJ_REB"] + r["RAW_PROJ_AST"], 1)
            ))
        return res

    home_list = parse_players(home_players_df, home_scale)
    away_list = parse_players(away_players_df, away_scale)

    # Sort by projected pts
    home_list.sort(key=lambda x: x.predicted_pts, reverse=True)
    away_list.sort(key=lambda x: x.predicted_pts, reverse=True)

    return PlayerPredictionResponse(
        home_team=home_team,
        away_team=away_team,
        prediction_date=pred_date_str,
        home_players=home_list,
        away_players=away_list,
        score_model_sync=True,
        model_version=player_loader.get_version()
    )


def get_model_status() -> ModelStatusResponse:
    """Get the current model status and metadata."""
    
    def _extract_win_metrics(metadata):
        metrics = ModelMetrics()
        if not metadata:
            return metrics
        flat = metadata.get("metrics", {})
        uncal = flat.get("uncalibrated", {}) if isinstance(flat.get("uncalibrated", {}), dict) else {}
        metrics.roc_auc = flat.get("roc_auc", uncal.get("roc_auc"))
        metrics.brier = flat.get("brier", uncal.get("brier_score"))
        metrics.accuracy = flat.get("accuracy", uncal.get("accuracy"))
        return metrics

    # Get win model info
    win_model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model.pkl")
    win_metadata = loader.metadata

    win_info = WinModelInfo(
        active=loader.model is not None,
        scope="production",
        path=str(win_model_path),
        version=loader.get_version(),
        metrics=_extract_win_metrics(win_metadata)
    )
    
    # Get score model info
    home_model_path = ROOT / "models/production/score_model_v4_home_rtg.pkl"
    away_model_path = ROOT / "models/production/score_model_v4_away_rtg.pkl"
    total_model_path = ROOT / "models/production/score_model_v4_pace.pkl"
    margin_model_path = ROOT / "models/production/score_model_v4_margin.pkl"
    
    score_metrics = ModelMetrics()
    score_metadata = score_loader.metadata
    
    if score_metadata:
        score_metrics.home_mae = score_metadata.get("derived_home_score_mae")
        score_metrics.away_mae = score_metadata.get("derived_away_score_mae")
    
    score_info = ScoreModelInfo(
        active=score_loader.home_rtg_model is not None,
        home_model_path=str(home_model_path),
        away_model_path=str(away_model_path),
        total_model_path=str(total_model_path),
        margin_model_path=str(margin_model_path),
        version=score_loader.get_version(),
        metrics=score_metrics
    )
    
    # Check for experimental candidate
    experimental_candidate = None
    experimental_path = ROOT / "models" / "experimental" / "cross_season_win_logistic_regression.pkl"
    if experimental_path.exists():
        # Try to load experimental metadata if it exists
        exp_metadata_path = experimental_path.parent / "cross_season_win_metadata.json"
        if exp_metadata_path.exists():
            import json
            with open(exp_metadata_path, "r") as f:
                exp_metadata = json.load(f)
                exp_metrics = exp_metadata.get("metrics", {})
                uncalibrated_metrics = exp_metrics.get("uncalibrated", {}) if isinstance(exp_metrics.get("uncalibrated", {}), dict) else {}
                experimental_candidate = {
                    "model_name": "cross_season_win_logistic_regression",
                    "path": str(experimental_path),
                    "training_date": exp_metadata.get("training_date"),
                    "version": exp_metadata.get("version") or exp_metadata.get("training_date"),
                    "metrics": {
                        "roc_auc": exp_metrics.get("roc_auc", uncalibrated_metrics.get("roc_auc")),
                        "brier": exp_metrics.get("brier", uncalibrated_metrics.get("brier_score")),
                        "brier_score": exp_metrics.get("brier_score", uncalibrated_metrics.get("brier_score")),
                        "accuracy": exp_metrics.get("accuracy", uncalibrated_metrics.get("accuracy"))
                    }
                }
        else:
            # Use training report data as fallback
            experimental_candidate = {
                "model_name": "cross_season_win_logistic_regression",
                "path": str(experimental_path),
                "training_date": "2026-06-09",
                "version": "2026-06-09",
                "metrics": {
                    "roc_auc": 0.7048,
                    "brier": 0.2190,
                    "accuracy": 0.6422
                },
                "note": "Best experimental candidate from cross-season training"
            }
    
    return ModelStatusResponse(
        win_model=win_info,
        score_model=score_info,
        experimental_candidate=experimental_candidate
    )


def predict_game_full(request: GameFullRequest) -> GameFullResponse:
    pred_date_str = request.prediction_date.isoformat() if request.prediction_date else date.today().isoformat()
    home_team = request.home_team_id.upper()
    away_team = request.away_team_id.upper()
    
    if request.home_score_prediction is not None and request.away_score_prediction is not None:
        home_score = request.home_score_prediction
        away_score = request.away_score_prediction
        margin = home_score - away_score
        total = home_score + away_score
        home_range = [home_score - 8.0, home_score + 8.0]
        away_range = [away_score - 8.0, away_score + 8.0]
        margin_range = [margin - 10.0, margin + 10.0]
        total_range = [total - 12.0, total + 12.0]
        model_version = "manual"
    else:
        score_req = ScorePredictionRequest(home_team=home_team, away_team=away_team, prediction_date=pred_date_str)
        score_resp = predict_score(score_req)
        home_score = score_resp.predicted_home_score
        home_range = score_resp.home_score_range
        away_score = score_resp.predicted_away_score
        away_range = score_resp.away_score_range
        margin = score_resp.predicted_margin
        margin_range = score_resp.margin_range
        total = score_resp.predicted_total_points
        total_range = score_resp.total_points_range
        model_version = score_resp.model_version

    players_df = get_player_predictions(home_team, away_team, pred_date_str, player_loader, score_loader)
    
    home_players_df = players_df[players_df["IS_HOME"] == 1]
    away_players_df = players_df[players_df["IS_HOME"] == 0]

    raw_home_pts = home_players_df["RAW_PROJ_PTS"].tolist()
    raw_home_reb = home_players_df["RAW_PROJ_REB"].tolist()
    raw_home_ast = home_players_df["RAW_PROJ_AST"].tolist()

    raw_away_pts = away_players_df["RAW_PROJ_PTS"].tolist()
    raw_away_reb = away_players_df["RAW_PROJ_REB"].tolist()
    raw_away_ast = away_players_df["RAW_PROJ_AST"].tolist()

    scaled_home_pts, home_scale = apply_top_down_scaling(home_score, raw_home_pts)
    scaled_away_pts, away_scale = apply_top_down_scaling(away_score, raw_away_pts)
    
    scaled_home_reb = [max(0.0, r * home_scale) for r in raw_home_reb]
    scaled_home_ast = [max(0.0, a * home_scale) for a in raw_home_ast]
    
    scaled_away_reb = [max(0.0, r * away_scale) for r in raw_away_reb]
    scaled_away_ast = [max(0.0, a * away_scale) for a in raw_away_ast]
    
    def build_player_list(df, scaled_pts, scaled_reb, scaled_ast, scale):
        res = []
        for i, (_, r) in enumerate(df.iterrows()):
            res.append(GameFullPlayer(
                player_name=str(r.get("PLAYER_NAME", f"Player {r['PLAYER_ID']}")),
                position_group=str(r.get("PLAYER_POSITION_GROUP", "UNKNOWN")),
                proj_pts=round(scaled_pts[i], 1),
                proj_reb=round(scaled_reb[i], 1),
                proj_ast=round(scaled_ast[i], 1),
                proj_pra=round(scaled_pts[i] + scaled_reb[i] + scaled_ast[i], 1),
                raw_pts=round(r["RAW_PROJ_PTS"], 1),
                scale_factor=round(scale, 3)
            ))
        return res

    home_list = build_player_list(home_players_df, scaled_home_pts, scaled_home_reb, scaled_home_ast, home_scale)
    away_list = build_player_list(away_players_df, scaled_away_pts, scaled_away_reb, scaled_away_ast, away_scale)
    
    win_req = WinProbRequest(home_team=home_team, away_team=away_team, prediction_date=pred_date_str)
    win_resp = predict(win_req)
    
    return GameFullResponse(
        game_id=request.game_id,
        score_prediction=ScorePredictionSub(
            home=round(home_score, 1),
            home_range=home_range,
            away=round(away_score, 1),
            away_range=away_range,
            margin=round(margin, 1),
            margin_range=margin_range,
            total=round(total, 1),
            total_range=total_range,
            model_version=model_version
        ),
        win_probability=WinProbabilitySub(
            home_win_prob=round(win_resp.home_win_probability, 4),
            away_win_prob=round(win_resp.away_win_probability, 4)
        ),
        home_players=home_list,
        away_players=away_list,
        scale_factors=ScaleFactorsSub(
            home=round(home_scale, 3),
            away=round(away_scale, 3)
        )
    )
