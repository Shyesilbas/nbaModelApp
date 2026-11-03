import logging
from datetime import datetime
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from src.core.season_utils import get_default_season
from src.features.build_matchup_features import build_features
from src.ingestion.nba_injury_report import ET
from .schemas import (
    PlayerStatusOverride,
    GameFullRequest,
    GameFullResponse,
    ModelStatusResponse,
    PlayerPredictionResponse,
    ScorePredictionRequest,
    ScorePredictionResponse,
    WinProbRequest,
    WinProbResponse,
    ShapExplanationRequest,
    ShapExplanationResponse
)
from .services.win_prediction import (
    predict,
)
from .services.auto_status import auto_overrides
from .services.game_data_refresh import (
    get_batch_status,
    get_completed_detail,
    get_refresh_status,
    missing_game_ids,
    start_batch_refresh,
    start_refresh,
)
from .services.game_full import predict_game_full
from .services.injury_history import changes_for_game, injuries_payload
from .services.injury_views import injury_changes_payload, injury_report_payload
from .services.snapshot_publish import get_status as snapshot_status, start_publish
from .services.frontend_data import (
    _check_token,
    get_game_detail,
    get_game_index,
    get_game_results,
    get_multi_team_players,
    get_game_quarters,
    get_play_by_play,
    get_player_history,
    get_player_profiles,
    get_player_season_averages,
    get_season_weeks,
    get_seasons,
    get_team_rosters,
    get_trades,
)
from .services.paper_trading import backtest_calibration, paper_trading_report
from .services.player_prediction import predict_players
from .services.score_prediction import predict_score
from .services.status import get_model_status
from .services.shap_service import explain_win_probability, explain_score_prediction

logger = logging.getLogger(__name__)
router = APIRouter()


def require_data_token(request: Request) -> None:
    _check_token(request)


data_router = APIRouter(prefix="/frontend-data-api", dependencies=[Depends(require_data_token)])


class GameDataRefreshRequest(BaseModel):
    season: str


class BatchRefreshRequest(BaseModel):
    season: str
    game_ids: list[str]


@data_router.post("/games/refresh-batch")
def refresh_games_batch(req: BatchRefreshRequest):
    return _run_endpoint(lambda: start_batch_refresh(req.game_ids, req.season))


@data_router.get("/games/refresh-batch/pending")
def games_batch_pending(season: str, ids: str):
    return _run_endpoint(lambda: {"missing": missing_game_ids([i for i in ids.split(",") if i], season)})


@data_router.get("/games/refresh-batch")
def games_batch_status(ids: str):
    return _run_endpoint(lambda: get_batch_status([i for i in ids.split(",") if i]))


@data_router.post("/games/{game_id}/refresh")
def refresh_game_data(game_id: str, req: GameDataRefreshRequest):
    return _run_endpoint(lambda: start_refresh(game_id, req.season))


@data_router.get("/games/{game_id}/refresh")
def game_data_refresh_status(game_id: str):
    return _run_endpoint(lambda: get_refresh_status(game_id))


def _with_injury_report(req, home: str, away: str):
    """Fill missing player status overrides from the official injury report (today and tomorrow only).
    Returns the report summary that was applied, or None. Overrides the caller sent are never replaced."""
    if getattr(req, "player_status_overrides", None):
        return None
    game_date = str(req.prediction_date or datetime.now(ET).date())
    overrides, summary = auto_overrides(home, away, game_date)
    if overrides:
        req.player_status_overrides = [PlayerStatusOverride(**o) for o in overrides]
    return summary


def _run_endpoint(handler: Callable):
    try:
        return handler()
    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Unhandled error in endpoint")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/predict/win-probability", response_model=WinProbResponse)
def predict_endpoint(req: WinProbRequest):
    def _predict():
        _with_injury_report(req, req.home_team, req.away_team)
        return predict(req)

    return _run_endpoint(_predict)


@router.post("/predict/score", response_model=ScorePredictionResponse)
def predict_score_endpoint(req: ScorePredictionRequest):
    def _predict():
        _with_injury_report(req, req.home_team, req.away_team)
        return predict_score(req)

    return _run_endpoint(_predict)


@router.get("/health")
def health():
    return {"status": "ok"}


@data_router.get("/paper-trading")
def frontend_paper_trading(season: str = None):
    return _run_endpoint(lambda: paper_trading_report(season or get_default_season()))


@data_router.get("/backtest-calibration")
def frontend_backtest_calibration():
    return _run_endpoint(backtest_calibration)


@data_router.get("/seasons")
def frontend_seasons():
    return _run_endpoint(get_seasons)


@data_router.get("/player-profiles")
def frontend_player_profiles():
    return _run_endpoint(get_player_profiles)


@data_router.get("/player-season-averages")
def frontend_player_season_averages():
    return _run_endpoint(get_player_season_averages)


@data_router.get("/trades")
def frontend_trades():
    return _run_endpoint(get_trades)


@data_router.get("/multi-team-players")
def frontend_multi_team_players(season: str = None):
    return _run_endpoint(lambda: get_multi_team_players(season))


@data_router.get("/game-results")
def frontend_game_results(season: str = None):
    return _run_endpoint(lambda: get_game_results(season))


@data_router.get("/games")
def frontend_game_index(season: str = None, start_date: str = None, end_date: str = None):
    return _run_endpoint(lambda: get_game_index(season, start_date, end_date))


@data_router.get("/weeks")
def frontend_season_weeks(season: str = None):
    return _run_endpoint(lambda: get_season_weeks(season))


@data_router.get("/games/{game_id}")
def frontend_game_detail(game_id: str, season: str = None):
    def _detail():
        refreshed = get_completed_detail(game_id)
        return refreshed if refreshed is not None else get_game_detail(game_id, season)

    return _run_endpoint(_detail)


@data_router.get("/play-by-play/{game_id}")
def frontend_play_by_play(game_id: str, season: str = None):
    return _run_endpoint(lambda: get_play_by_play(game_id, season))


@data_router.get("/game-quarters/{game_id}")
def frontend_game_quarters(game_id: str, season: str = None):
    return _run_endpoint(lambda: get_game_quarters(game_id, season))


@data_router.get("/players/{player_id}")
def frontend_player_history(player_id: str):
    return _run_endpoint(lambda: get_player_history(player_id))


@data_router.get("/team-rosters")
def frontend_team_rosters(season: str = None):
    return _run_endpoint(lambda: get_team_rosters(season))


@data_router.get("/injury-report")
def frontend_injury_report(season: str = None, date: str = None):
    return _run_endpoint(lambda: injury_report_payload(season, date))


@data_router.get("/injury-changes")
def frontend_injury_changes(home: str, away: str, date: str, season: str = None):
    return _run_endpoint(lambda: injury_changes_payload(season, home, away, date))


@data_router.get("/injuries")
def frontend_injuries(season: str = None, date: str = None):
    return _run_endpoint(lambda: injuries_payload(season, date))


@data_router.post("/snapshot-publish")
def start_snapshot_publish():
    return _run_endpoint(start_publish)


@data_router.get("/snapshot-publish")
def snapshot_publish_status():
    return _run_endpoint(snapshot_status)


@router.post("/predict/players", response_model=PlayerPredictionResponse)
def predict_players_endpoint(req: ScorePredictionRequest):
    def _predict():
        _with_injury_report(req, req.home_team, req.away_team)
        return predict_players(req)

    return _run_endpoint(_predict)


@router.get("/model-status", response_model=ModelStatusResponse)
def model_status():
    return _run_endpoint(get_model_status)


@router.post("/predict/game_full", response_model=GameFullResponse)
def predict_game_full_endpoint(req: GameFullRequest):
    def _predict():
        summary = _with_injury_report(req, req.home_team_id, req.away_team_id)
        response = predict_game_full(req)
        if summary is not None:
            day =str(req.prediction_date or datetime.now(ET).date())
            summary["changes"] = changes_for_game(get_default_season(), day, req.away_team_id.upper(), req.home_team_id.upper())
        response.injury_report = summary
        return response

    return _run_endpoint(_predict)


@router.post("/predict/explain", response_model=ShapExplanationResponse)
def explain_game_endpoint(req: ShapExplanationRequest):
    def _explain():
        _with_injury_report(req, req.home_team, req.away_team)
        pred_date_str = req.prediction_date.isoformat() if hasattr(req.prediction_date, 'isoformat') else str(req.prediction_date)
        feats = build_features(
            req.home_team.upper(),
            req.away_team.upper(),
            pred_date_str,
            player_status_overrides=req.player_status_overrides,
        )
        
        win_exp = explain_win_probability(req.home_team, req.away_team, feats)
        score_exp = explain_score_prediction(req.home_team, req.away_team, feats)
        
        return ShapExplanationResponse(
            home_team=req.home_team.upper(),
            away_team=req.away_team.upper(),
            prediction_date=pred_date_str,
            win_model_explanation=win_exp,
            score_model_explanation=score_exp
        )
    return _run_endpoint(_explain)


router.include_router(data_router)
