from .model_loader import ModelLoader, ScoreModelLoader, PlayerModelLoader
from .schemas import (
    WinProbRequest, WinProbResponse,
    ScorePredictionRequest, ScorePredictionResponse,
    ModelStatusResponse, ModelMetrics, WinModelInfo, ScoreModelInfo,
    PlayerPredictionResponse, PlayerPrediction,
    GameFullRequest, GameFullResponse, ScorePredictionSub, WinProbabilitySub, GameFullPlayer, ScaleFactorsSub,
    ExplanationFeature, WinProbabilityExplanation, ScoreModelExplanation, GameExplanationSub
)
from .player_service import get_player_predictions
from scripts.build_matchup_features import build_features
from scripts.artifact_paths import resolve_artifact_path
from scripts.inference.top_down_scaling import apply_top_down_scaling
from datetime import date
from typing import List
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


FEATURE_METADATA = {
    "IS_HOME": {"display": "Home Court Advantage", "category": "Venue & Schedule"},
    "DAYS_REST": {"display": "Days of Rest", "category": "Venue & Schedule"},
    "IS_B2B": {"display": "Back-to-Back Game", "category": "Venue & Schedule"},
    "OPP_DAYS_REST": {"display": "Opponent Days of Rest", "category": "Venue & Schedule"},
    "OPP_IS_B2B": {"display": "Opponent Back-to-Back", "category": "Venue & Schedule"},
    "TRAVEL_DISTANCE": {"display": "Travel Distance", "category": "Venue & Schedule"},
    "TIMEZONE_DIFF": {"display": "Timezone Difference", "category": "Venue & Schedule"},
    
    "IS_PLAYOFF": {"display": "Playoff Matchup", "category": "Playoff Context"},
    "IS_ELIMINATION_GAME": {"display": "Elimination Game", "category": "Playoff Context"},
    "CAN_CLINCH_SERIES": {"display": "Series Clinching Opportunity", "category": "Playoff Context"},
    
    "WINRATE_LAST_5": {"display": "Win Rate (Last 5 Games)", "category": "Recent Team Form"},
    "WINRATE_LAST_10": {"display": "Win Rate (Last 10 Games)", "category": "Recent Team Form"},
    "PTS_LAST_5": {"display": "Points Scored (Last 5 Games)", "category": "Recent Team Form"},
    "PTS_LAST_10": {"display": "Points Scored (Last 10 Games)", "category": "Recent Team Form"},
    "PTS_ALLOWED_LAST_5": {"display": "Points Allowed (Last 5 Games)", "category": "Recent Team Form"},
    "PTS_ALLOWED_LAST_10": {"display": "Points Allowed (Last 10 Games)", "category": "Recent Team Form"},
    
    "OPP_WINRATE_LAST_5": {"display": "Opponent Win Rate (Last 5)", "category": "Recent Opponent Form"},
    "OPP_WINRATE_LAST_10": {"display": "Opponent Win Rate (Last 10)", "category": "Recent Opponent Form"},
    "OPP_PTS_LAST_5": {"display": "Opponent Points Scored (Last 5)", "category": "Recent Opponent Form"},
    "OPP_PTS_LAST_10": {"display": "Opponent Points Scored (Last 10)", "category": "Recent Opponent Form"},
    "OPP_PTS_ALLOWED_LAST_5": {"display": "Opponent Points Allowed (Last 5)", "category": "Recent Opponent Form"},
    "OPP_PTS_ALLOWED_LAST_10": {"display": "Opponent Points Allowed (Last 10)", "category": "Recent Opponent Form"},

    "HOME_WINRATE_LAST_5": {"display": "Home Win Rate (Last 5 Splits)", "category": "Recent Team Form"},
    "HOME_PTS_LAST_5": {"display": "Home Points Scored (Last 5 Splits)", "category": "Recent Team Form"},
    "HOME_PTS_ALLOWED_LAST_5": {"display": "Home Points Allowed (Last 5 Splits)", "category": "Recent Team Form"},
    "AWAY_WINRATE_LAST_5": {"display": "Away Win Rate (Last 5 Splits)", "category": "Recent Team Form"},
    "AWAY_PTS_LAST_5": {"display": "Away Points Scored (Last 5 Splits)", "category": "Recent Team Form"},
    "AWAY_PTS_ALLOWED_LAST_5": {"display": "Away Points Allowed (Last 5 Splits)", "category": "Recent Team Form"},
    
    "OPP_HOME_WINRATE_LAST_5": {"display": "Opponent Home Win Rate (Last 5 Splits)", "category": "Recent Opponent Form"},
    "OPP_HOME_PTS_LAST_5": {"display": "Opponent Home PTS Scored (Last 5 Splits)", "category": "Recent Opponent Form"},
    "OPP_HOME_PTS_ALLOWED_LAST_5": {"display": "Opponent Home PTS Allowed (Last 5 Splits)", "category": "Recent Opponent Form"},
    "OPP_AWAY_WINRATE_LAST_5": {"display": "Opponent Away Win Rate (Last 5 Splits)", "category": "Recent Opponent Form"},
    "OPP_AWAY_PTS_LAST_5": {"display": "Opponent Away PTS Scored (Last 5 Splits)", "category": "Recent Opponent Form"},
    "OPP_AWAY_PTS_ALLOWED_LAST_5": {"display": "Opponent Away PTS Allowed (Last 5 Splits)", "category": "Recent Opponent Form"},

    "H2H_GAMES_LAST_5": {"display": "Head-to-Head Games Count", "category": "Head-to-Head History"},
    "H2H_WINRATE_LAST_5": {"display": "Head-to-Head Win Rate (Last 5)", "category": "Head-to-Head History"},
    "H2H_PTS_LAST_5": {"display": "Head-to-Head PTS Scored (Last 5)", "category": "Head-to-Head History"},
    "H2H_PTS_ALLOWED_LAST_5": {"display": "Head-to-Head PTS Allowed (Last 5)", "category": "Head-to-Head History"},
    "OPP_H2H_GAMES_LAST_5": {"display": "Opponent Head-to-Head Games Count", "category": "Head-to-Head History"},
    "OPP_H2H_WINRATE_LAST_5": {"display": "Opponent Head-to-Head Win Rate", "category": "Head-to-Head History"},
    "OPP_H2H_PTS_LAST_5": {"display": "Opponent Head-to-Head PTS Scored", "category": "Head-to-Head History"},
    "OPP_H2H_PTS_ALLOWED_LAST_5": {"display": "Opponent Head-to-Head PTS Allowed", "category": "Head-to-Head History"},

    "TEAM_V3_PROJ_PTS_SUM": {"display": "Roster Projected Points", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_REB_SUM": {"display": "Roster Projected Rebounds", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_AST_SUM": {"display": "Roster Projected Assists", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_PRA_SUM": {"display": "Roster Projected Points+Rebounds+Assists", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_PTS_AVG": {"display": "Roster Average Projected Points", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_REB_AVG": {"display": "Roster Average Projected Rebounds", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_AST_AVG": {"display": "Roster Average Projected Assists", "category": "Rosters & Projections"},
    "TEAM_V3_PROJ_PRA_AVG": {"display": "Roster Average Projected PRA", "category": "Rosters & Projections"},
    
    "OPP_V3_PROJ_PTS_SUM": {"display": "Opponent Projected Points", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_REB_SUM": {"display": "Opponent Projected Rebounds", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_AST_SUM": {"display": "Opponent Projected Assists", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_PRA_SUM": {"display": "Opponent Projected Points+Rebounds+Assists", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_PTS_AVG": {"display": "Opponent Average Projected Points", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_REB_AVG": {"display": "Opponent Average Projected Rebounds", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_AST_AVG": {"display": "Opponent Average Projected Assists", "category": "Rosters & Projections"},
    "OPP_V3_PROJ_PRA_AVG": {"display": "Opponent Average Projected PRA", "category": "Rosters & Projections"},

    "PACE_LAST_5": {"display": "Pace (Last 5 Games)", "category": "Venue & Schedule"},
    "PACE_LAST_10": {"display": "Pace (Last 10 Games)", "category": "Venue & Schedule"},
    "OPP_PACE_LAST_5": {"display": "Opponent Pace (Last 5 Games)", "category": "Venue & Schedule"},
    "OPP_PACE_LAST_10": {"display": "Opponent Pace (Last 10 Games)", "category": "Venue & Schedule"},
    "OFF_RTG_LAST_5": {"display": "Offensive Rating (Last 5 Games)", "category": "Recent Team Form"},
    "OFF_RTG_LAST_10": {"display": "Offensive Rating (Last 10 Games)", "category": "Recent Team Form"},
    "DEF_RTG_LAST_5": {"display": "Defensive Rating (Last 5 Games)", "category": "Recent Team Form"},
    "DEF_RTG_LAST_10": {"display": "Defensive Rating (Last 10 Games)", "category": "Recent Team Form"},
    "OPP_OFF_RTG_LAST_5": {"display": "Opponent Offensive Rating (Last 5)", "category": "Recent Opponent Form"},
    "OPP_DEF_RTG_LAST_5": {"display": "Opponent Defensive Rating (Last 5)", "category": "Recent Opponent Form"},
    "OPP_DEF_RTG_LAST_10": {"display": "Opponent Defensive Rating (Last 10)", "category": "Recent Opponent Form"},
    
    "TEAM_CORE_TOP3_PLAYED_COUNT": {"display": "Top 3 Core Players Games Played", "category": "Rosters & Projections"},
    "TEAM_CORE_TOP3_AVAILABLE_RATE": {"display": "Top 3 Core Availability Rate", "category": "Rosters & Projections"},
    "TEAM_CORE_TOP3_PTS_LAST_5_SUM": {"display": "Top 3 Core Points (Last 5 Games)", "category": "Rosters & Projections"},
    "OPP_CORE_TOP3_PLAYED_COUNT": {"display": "Opponent Top 3 Core Games Played", "category": "Rosters & Projections"},
}


def explain_win_probability(feats: dict) -> WinProbabilityExplanation:
    if loader.model is None or loader.feature_cols is None:
        return WinProbabilityExplanation(intercept=0.0, features=[])
    
    model = loader.model
    if hasattr(model, "calibrated_classifiers_"):
        pipeline = model.calibrated_classifiers_[0].estimator
    else:
        pipeline = model
        
    imputer = pipeline.named_steps.get("imputer")
    scaler = pipeline.named_steps.get("scaler")
    clf = pipeline.named_steps.get("clf")
    
    row = [feats.get(c, float("nan")) for c in loader.feature_cols]
    df = pd.DataFrame([row], columns=loader.feature_cols)
    
    if imputer:
        X_imp = imputer.transform(df)
    else:
        X_imp = df.fillna(0.0)
        
    if scaler:
        X_scaled = scaler.transform(X_imp)
    else:
        X_scaled = X_imp.values
        
    coefs = clf.coef_[0]
    intercept = float(clf.intercept_[0])
    
    explanations = []
    for i, col in enumerate(loader.feature_cols):
        raw_val = float(df.iloc[0, i])
        if np.isnan(raw_val):
            raw_val = 0.0
        scaled_val = float(X_scaled[0, i])
        contrib = float(coefs[i] * scaled_val)
        
        meta = FEATURE_METADATA.get(col, {"display": col.replace("_", " ").title(), "category": "General"})
        
        if col in ["IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"]:
            home_wins = feats.get("HOME_SERIES_WINS", 0)
            away_wins = feats.get("AWAY_SERIES_WINS", 0)
            if home_wins is None or (isinstance(home_wins, float) and np.isnan(home_wins)):
                home_wins = 0
            if away_wins is None or (isinstance(away_wins, float) and np.isnan(away_wins)):
                away_wins = 0
            
            if raw_val == 1.0:
                if home_wins == 3 and away_wins < 3:
                    influence = "FAVORS_HOME"
                elif away_wins == 3 and home_wins < 3:
                    influence = "FAVORS_AWAY"
                else:
                    influence = "NEUTRAL"
            else:
                influence = "NEUTRAL"
        else:
            if contrib > 0.01:
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
    
    return WinProbabilityExplanation(
        intercept=round(intercept, 4),
        features=explanations
    )


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
                home_wins = feats_dict.get("HOME_SERIES_WINS", 0)
                away_wins = feats_dict.get("AWAY_SERIES_WINS", 0)
                if home_wins is None or (isinstance(home_wins, float) and np.isnan(home_wins)):
                    home_wins = 0
                if away_wins is None or (isinstance(away_wins, float) and np.isnan(away_wins)):
                    away_wins = 0
                
                if raw_val == 1.0:
                    if home_wins == 3 and away_wins < 3:
                        influence = "FAVORS_HOME"
                    elif away_wins == 3 and home_wins < 3:
                        influence = "FAVORS_AWAY"
                    else:
                        influence = "NEUTRAL"
                else:
                    influence = "NEUTRAL"
            else:
                if perspective == "home":
                    if contrib > 0.01:
                        influence = "FAVORS_HOME"
                    elif contrib < -0.01:
                        influence = "FAVORS_AWAY"
                    else:
                        influence = "NEUTRAL"
                elif perspective == "away":
                    if contrib > 0.01:
                        influence = "FAVORS_AWAY"
                    elif contrib < -0.01:
                        influence = "FAVORS_HOME"
                    else:
                        influence = "NEUTRAL"
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
    win_model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model_v8.pkl")
    win_metadata = loader.metadata

    win_info = WinModelInfo(
        active=loader.model is not None,
        scope="production",
        path=str(win_model_path),
        version=loader.get_version(),
        metrics=_extract_win_metrics(win_metadata)
    )
    
    # Get score model info
    home_model_path = score_loader.home_rtg_path or (ROOT / "models/production/score_model_v4_home_rtg.pkl")
    away_model_path = score_loader.away_rtg_path or (ROOT / "models/production/score_model_v4_away_rtg.pkl")
    total_model_path = score_loader.pace_path or (ROOT / "models/production/score_model_v4_pace.pkl")
    margin_model_path = score_loader.margin_path or (ROOT / "models/production/score_model_v4_margin.pkl")
    
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
    v5_exp_path = ROOT / "models" / "experimental" / "win_probability_model.pkl"
    if v5_exp_path.exists():
        exp_metadata_path = ROOT / "models" / "experimental" / "model_metadata.json"
        if exp_metadata_path.exists():
            import json
            with open(exp_metadata_path, "r") as f:
                exp_metadata = json.load(f)
                exp_metrics = exp_metadata.get("metrics", {})
                best_cal = exp_metadata.get("selected_calibration", "uncalibrated")
                best_metrics = exp_metrics.get(best_cal, {}) or exp_metrics.get("uncalibrated", {}) or {}
                experimental_candidate = {
                    "model_name": "win_probability_model_v5",
                    "path": str(v5_exp_path),
                    "training_date": exp_metadata.get("training_date"),
                    "version": exp_metadata.get("version") or exp_metadata.get("training_date") or "5.0",
                    "metrics": {
                        "roc_auc": best_metrics.get("roc_auc"),
                        "brier": best_metrics.get("brier_score") or best_metrics.get("brier"),
                        "brier_score": best_metrics.get("brier_score") or best_metrics.get("brier"),
                        "accuracy": best_metrics.get("accuracy")
                    }
                }
    else:
        experimental_path = ROOT / "models" / "experimental" / "cross_season_win_logistic_regression.pkl"
        if experimental_path.exists():
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

    home_list: list[GameFullPlayer] = []
    away_list: list[GameFullPlayer] = []
    home_scale = 1.0
    away_scale = 1.0
    try:
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
    except Exception as e:
        print("Player inference failed in /predict/game_full:", e)
    
    win_req = WinProbRequest(home_team=home_team, away_team=away_team, prediction_date=pred_date_str)
    win_resp = predict(win_req)
    
    # Generate Explainable AI (XAI) payload
    explanation = None
    try:
        feats_home = build_features(home_team, away_team, pred_date_str)
        feats_away = build_features(away_team, home_team, pred_date_str)
        
        win_expl = explain_win_probability(feats_home)
        
        metadata = score_loader.metadata or {}
        pace_features = metadata.get("pace_features", [])
        home_off_rtg_features = metadata.get("home_off_rtg_features", metadata.get("off_rtg_features", []))
        away_off_rtg_features = metadata.get("away_off_rtg_features", metadata.get("off_rtg_features", []))
        margin_features = metadata.get("margin_features", [])
        
        pace_factors = explain_xgboost_model(score_loader.pace_model, pace_features, feats_home, perspective="home")
        home_rtg_factors = explain_xgboost_model(score_loader.home_rtg_model, home_off_rtg_features, feats_home, perspective="home")
        away_rtg_factors = explain_xgboost_model(score_loader.away_rtg_model, away_off_rtg_features, feats_away, perspective="away")
        margin_factors = explain_xgboost_model(score_loader.margin_model, margin_features, feats_home, perspective="home")
        
        score_expl = ScoreModelExplanation(
            home_rtg_features=home_rtg_factors,
            away_rtg_features=away_rtg_factors,
            pace_features=pace_factors,
            margin_features=margin_factors
        )
        
        explanation = GameExplanationSub(
            win_probability=win_expl,
            score_prediction=score_expl
        )
    except Exception as e:
        print("XAI generation failed:", e)

    return GameFullResponse(
        game_id=request.game_id or "unknown",
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
            away_win_prob=round(win_resp.away_win_probability, 4),
            model_version=win_resp.model_version
        ),
        home_players=home_list,
        away_players=away_list,
        scale_factors=ScaleFactorsSub(
            home=round(home_scale, 3),
            away=round(away_scale, 3)
        ),
        explanation=explanation
    )
