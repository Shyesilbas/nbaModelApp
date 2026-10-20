from datetime import date
import logging
from typing import Any, Dict, List, Tuple
import pandas as pd

from scripts.build_matchup_features import build_features
from scripts.inference.top_down_scaling import apply_top_down_scaling

logger = logging.getLogger(__name__)

from .. import service as svc
from ..player_service import get_player_predictions
from .availability import assumed_out_ids, importance_score
from .explanation import explain_win_probability, explain_xgboost_model
from .score_prediction import predict_score
from ..schemas import (
    GameExplanationSub,
    GameFullPlayer,
    GameFullRequest,
    GameFullResponse,
    ScaleFactorsSub,
    ScoreModelExplanation,
    ScorePredictionRequest,
    ScorePredictionResponse,
    ScorePredictionSub,
    WinProbRequest,
    WinProbabilitySub,
)


def _manual_score_values(home_score: float, away_score: float) -> Dict[str, Any]:
    margin = home_score - away_score
    total = home_score + away_score
    return {
        "home_score": home_score,
        "home_range": [home_score - 8.0, home_score + 8.0],
        "away_score": away_score,
        "away_range": [away_score - 8.0, away_score + 8.0],
        "margin": margin,
        "margin_range": [margin - 10.0, margin + 10.0],
        "total": total,
        "total_range": [total - 12.0, total + 12.0],
        "model_version": "manual",
    }


def _score_values_from_response(score_resp: ScorePredictionResponse) -> Dict[str, Any]:
    return {
        "home_score": score_resp.predicted_home_score,
        "home_range": score_resp.home_score_range,
        "away_score": score_resp.predicted_away_score,
        "away_range": score_resp.away_score_range,
        "margin": score_resp.predicted_margin,
        "margin_range": score_resp.margin_range,
        "total": score_resp.predicted_total_points,
        "total_range": score_resp.total_points_range,
        "model_version": score_resp.model_version,
        "confidence_warning": getattr(score_resp, "confidence_warning", None),
    }


def _build_game_full_player_list(df, scaled_pts, scaled_reb, scaled_ast, scale) -> List[GameFullPlayer]:
    players = []
    for i, (_, r) in enumerate(df.iterrows()):
        pid = None
        if "PLAYER_ID" in r and pd.notna(r["PLAYER_ID"]):
            try:
                pid = int(r["PLAYER_ID"])
            except (ValueError, TypeError):
                pid = None

        stat_status = str(r.get("STATUS", "ACTIVE")).upper()
        p_min = round(float(r["PROJ_MIN"]), 1) if "PROJ_MIN" in r and pd.notna(r["PROJ_MIN"]) else 0.0

        if stat_status in ("OUT", "DNP") or p_min <= 0.0:
            s_pts = 0.0
            s_reb = 0.0
            s_ast = 0.0
            s_pra = 0.0
            raw_p = 0.0
        else:
            s_pts = round(scaled_pts[i], 1)
            s_reb = round(scaled_reb[i], 1)
            s_ast = round(scaled_ast[i], 1)
            s_pra = round(s_pts + s_reb + s_ast, 1)
            raw_p = round(r["RAW_PROJ_PTS"], 1)

        pos_name = str(r.get("PLAYER_POSITION_GROUP", r.get("POSITION_GROUP", "UNKNOWN")))
        if pid is not None and pid in svc.CANONICAL_POSITIONS:
            pos_name = svc.CANONICAL_POSITIONS[pid]

        players.append(GameFullPlayer(
            player_id=pid,
            player_name=str(r.get("PLAYER_NAME", f"Player {r.get('PLAYER_ID', '')}")),
            position_group=pos_name,
            proj_pts=s_pts,
            proj_reb=s_reb,
            proj_ast=s_ast,
            proj_pra=s_pra,
            raw_pts=raw_p,
            scale_factor=round(scale, 3),
            status=stat_status,
            proj_min=p_min,
            importance=importance_score(r),
        ))
    return sorted(players, key=lambda p: p.importance, reverse=True)



def _predict_game_full_players(
    home_team: str,
    away_team: str,
    pred_date_str: str,
    home_score: float,
    away_score: float,
    player_status_overrides: list = None,
    is_preseason: bool = None,
) -> Tuple[List[GameFullPlayer], List[GameFullPlayer], float, float]:
    players_df = get_player_predictions(
        home_team,
        away_team,
        pred_date_str,
        svc.player_loader,
        svc.score_loader,
        player_status_overrides=player_status_overrides,
        is_preseason=is_preseason,
    )
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

    return (
        _build_game_full_player_list(home_players_df, scaled_home_pts, scaled_home_reb, scaled_home_ast, home_scale),
        _build_game_full_player_list(away_players_df, scaled_away_pts, scaled_away_reb, scaled_away_ast, away_scale),
        home_scale,
        away_scale,
    )


def _build_game_explanation(feats_home: Dict[str, Any], feats_away: Dict[str, Any]) -> GameExplanationSub:
    win_expl = explain_win_probability(feats_home)

    metadata = svc.score_loader.metadata or {}
    pace_features = metadata.get("pace_features", [])
    home_off_rtg_features = metadata.get("home_off_rtg_features", metadata.get("off_rtg_features", []))
    away_off_rtg_features = metadata.get("away_off_rtg_features", metadata.get("off_rtg_features", []))
    margin_features = metadata.get("margin_features", [])

    score_expl = ScoreModelExplanation(
        home_rtg_features=explain_xgboost_model(svc.score_loader.home_rtg_model, home_off_rtg_features, feats_home, perspective="home"),
        away_rtg_features=explain_xgboost_model(svc.score_loader.away_rtg_model, away_off_rtg_features, feats_away, perspective="away"),
        pace_features=explain_xgboost_model(svc.score_loader.pace_model, pace_features, feats_home, perspective="home"),
        margin_features=explain_xgboost_model(svc.score_loader.margin_model, margin_features, feats_home, perspective="home"),
    )

    return GameExplanationSub(
        win_probability=win_expl,
        score_prediction=score_expl
    )


def predict_game_full(request: GameFullRequest) -> GameFullResponse:
    pred_date_str = request.prediction_date.isoformat() if request.prediction_date else date.today().isoformat()
    home_team = request.home_team_id.upper()
    away_team = request.away_team_id.upper()
    features_home = None
    features_away = None
    win_resp = None

    def get_features_home():
        nonlocal features_home
        if features_home is None:
            features_home = build_features(
                home_team,
                away_team,
                pred_date_str,
                player_status_overrides=request.player_status_overrides,
            )
        return features_home

    def get_features_away():
        nonlocal features_away
        if features_away is None:
            features_away = build_features(
                away_team,
                home_team,
                pred_date_str,
                player_status_overrides=request.player_status_overrides,
                team_is_home=False,
            )
        return features_away

    if request.home_score_prediction is not None and request.away_score_prediction is not None:
        score_values = _manual_score_values(request.home_score_prediction, request.away_score_prediction)
    else:
        score_req = ScorePredictionRequest(
            home_team=home_team,
            away_team=away_team,
            prediction_date=pred_date_str,
            player_status_overrides=request.player_status_overrides,
        )
        win_req = WinProbRequest(
            home_team=home_team,
            away_team=away_team,
            prediction_date=pred_date_str,
            player_status_overrides=request.player_status_overrides,
        )
        win_resp = svc.predict(win_req, features=get_features_home())
        score_resp = predict_score(
            score_req,
            features=get_features_home(),
            away_features=get_features_away(),
            win_response=win_resp,
        )
        score_values = _score_values_from_response(score_resp)

    feat_h = get_features_home()
    is_preseason = bool(feat_h.get("IS_PRESEASON", 0) == 1) or (feat_h.get("SEASON_TYPE") in ("Pre Season", "Preseason"))

    home_list: list[GameFullPlayer] = []
    away_list: list[GameFullPlayer] = []
    home_scale = 1.0
    away_scale = 1.0
    try:
        home_list, away_list, home_scale, away_scale = _predict_game_full_players(
            home_team,
            away_team,
            pred_date_str,
            score_values["home_score"],
            score_values["away_score"],
            player_status_overrides=request.player_status_overrides,
            is_preseason=is_preseason,
        )
    except Exception as e:
        logger.warning("Player inference failed in /predict/game_full: %s", e)

    try:
        for players, team in ((home_list, home_team), (away_list, away_team)):
            flagged = assumed_out_ids(team, pred_date_str, preseason=is_preseason)  # the default, independent of overrides, so the UI can keep an explicit ACTIVE
            for p in players:
                p.assumed_out = p.player_id in flagged
    except Exception as e:
        logger.warning("Could not flag assumed-out players: %s", e)

    if win_resp is None:
        win_req = WinProbRequest(
            home_team=home_team,
            away_team=away_team,
            prediction_date=pred_date_str,
            player_status_overrides=request.player_status_overrides,
        )
        win_resp = svc.predict(win_req, features=feat_h)

    if is_preseason and win_resp is not None:
        win_resp.home_win_probability = round(0.50 + 0.50 * (win_resp.home_win_probability - 0.50), 4)
        win_resp.away_win_probability = round(1.0 - win_resp.home_win_probability, 4)

    explanation = None
    try:
        explanation = _build_game_explanation(feat_h, get_features_away())
    except Exception as e:
        logger.warning("XAI generation failed: %s", e)

    try:
        from .shadow_logger import log_game_prediction
        log_game_prediction(
            game_id=request.game_id or "unknown",
            home_team=home_team,
            away_team=away_team,
            prediction_date=pred_date_str,
            model_version=win_resp.model_version if win_resp else "v10.1",
            win_probability=win_resp.home_win_probability if win_resp else 0.5,
            predicted_home_score=score_values["home_score"],
            predicted_away_score=score_values["away_score"],
            predicted_total=score_values["total"],
            predicted_margin=score_values["margin"],
            home_range=score_values.get("home_range"),
            away_range=score_values.get("away_range"),
            total_range=score_values.get("total_range"),
            margin_range=score_values.get("margin_range"),
            features_snapshot={
                k: round(float(v), 4)
                for k, v in feat_h.items()
                if isinstance(v, (int, float)) and k in ["ELO_DIFF", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "REST_DIFF"]
            } if feat_h else None,
        )
    except Exception as e:
        logger.warning("Shadow prediction logging failed: %s", e)

    conf_warning = score_values.get("confidence_warning")
    if is_preseason:
        preseason_warning = "Hazirlik Maci (Pre-Season): Rotasyonlar ve as oyuncu sureleri koclara bagli olarak kisitlidir."
        conf_warning = f"{conf_warning} | {preseason_warning}" if conf_warning else preseason_warning

    return GameFullResponse(
        game_id=request.game_id or "unknown",
        score_prediction=ScorePredictionSub(
            home=round(score_values["home_score"], 1),
            home_range=score_values["home_range"],
            away=round(score_values["away_score"], 1),
            away_range=score_values["away_range"],
            margin=round(score_values["margin"], 1),
            margin_range=score_values["margin_range"],
            total=round(score_values["total"], 1),
            total_range=score_values["total_range"],
            model_version=score_values["model_version"],
            confidence_warning=conf_warning
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
        explanation=explanation,
        is_preseason=is_preseason,
        season_type=str(feat_h.get("SEASON_TYPE", "Pre Season" if is_preseason else "Regular Season"))
    )
