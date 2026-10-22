import traceback
from typing import Callable

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

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
from .services.game_full import predict_game_full
from .services.frontend_data import (
    get_game_detail,
    get_game_index,
    get_game_results,
    get_multi_team_players,
    get_play_by_play,
    get_player_history,
    get_player_profiles,
    get_player_season_averages,
    get_season_weeks,
    get_seasons,
    get_team_rosters,
    get_trades,
)
from .services.paper_trading import paper_trading_report
from .services.player_prediction import predict_players
from .services.score_prediction import predict_score
from .services.status import get_model_status
from .services.shap_service import explain_win_probability, explain_score_prediction
from src.features.build_matchup_features import build_features

router = APIRouter()


class GameDataRefreshRequest(BaseModel):
    season: str


class BatchRefreshRequest(BaseModel):
    season: str
    game_ids: list[str]


@router.post("/frontend-data-api/games/refresh-batch")
def refresh_games_batch(req: BatchRefreshRequest, request: Request):
    from .services.game_data_refresh import start_batch_refresh

    def _start():
        from .services.frontend_data import _check_token
        _check_token(request)
        return start_batch_refresh(req.game_ids, req.season)

    return _run_endpoint(_start)


@router.get("/frontend-data-api/games/refresh-batch/pending")
def games_batch_pending(request: Request, season: str, ids: str):
    from .services.game_data_refresh import missing_game_ids

    def _pending():
        from .services.frontend_data import _check_token
        _check_token(request)
        return {"missing": missing_game_ids([i for i in ids.split(",") if i], season)}

    return _run_endpoint(_pending)


@router.get("/frontend-data-api/games/refresh-batch")
def games_batch_status(request: Request, ids: str):
    from .services.game_data_refresh import get_batch_status

    def _status():
        from .services.frontend_data import _check_token
        _check_token(request)
        return get_batch_status([i for i in ids.split(",") if i])

    return _run_endpoint(_status)


@router.post("/frontend-data-api/games/{game_id}/refresh")
def refresh_game_data(game_id: str, req: GameDataRefreshRequest, request: Request):
    from .services.game_data_refresh import start_refresh

    def _start():
        from .services.frontend_data import _check_token
        _check_token(request)
        return start_refresh(game_id, req.season)

    return _run_endpoint(_start)


@router.get("/frontend-data-api/games/{game_id}/refresh")
def game_data_refresh_status(game_id: str, request: Request):
    from .services.game_data_refresh import get_refresh_status

    def _status():
        from .services.frontend_data import _check_token
        _check_token(request)
        return get_refresh_status(game_id)

    return _run_endpoint(_status)


def _with_injury_report(req, home: str, away: str):
    """Fill missing player status overrides from the official injury report (today and tomorrow only).
    Returns the report summary that was applied, or None. Overrides the caller sent are never replaced."""
    if getattr(req, "player_status_overrides", None):
        return None
    from .services.auto_status import auto_overrides

    from datetime import datetime
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
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


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


@router.get("/frontend-data-api/paper-trading")
def frontend_paper_trading(request: Request, season: str = None):
    def _report():
        from .services.frontend_data import _check_token
        from src.core.season_utils import get_default_season
        _check_token(request)
        return paper_trading_report(season or get_default_season())
    return _run_endpoint(_report)


@router.get("/frontend-data-api/seasons")
def frontend_seasons(request: Request):
    return _run_endpoint(lambda: get_seasons(request))


@router.get("/frontend-data-api/player-profiles")
def frontend_player_profiles(request: Request):
    return _run_endpoint(lambda: get_player_profiles(request))


@router.get("/frontend-data-api/player-season-averages")
def frontend_player_season_averages(request: Request):
    return _run_endpoint(lambda: get_player_season_averages(request))


@router.get("/frontend-data-api/trades")
def frontend_trades(request: Request):
    return _run_endpoint(lambda: get_trades(request))


@router.get("/frontend-data-api/multi-team-players")
def frontend_multi_team_players(request: Request, season: str = None):
    return _run_endpoint(lambda: get_multi_team_players(request, season))


@router.get("/frontend-data-api/game-results")
def frontend_game_results(request: Request, season: str = None):
    return _run_endpoint(lambda: get_game_results(request, season))


@router.get("/frontend-data-api/games")
def frontend_game_index(
    request: Request,
    season: str = None,
    start_date: str = None,
    end_date: str = None,
):
    return _run_endpoint(lambda: get_game_index(request, season, start_date, end_date))


@router.get("/frontend-data-api/weeks")
def frontend_season_weeks(request: Request, season: str = None):
    return _run_endpoint(lambda: get_season_weeks(request, season))


@router.get("/frontend-data-api/games/{game_id}")
def frontend_game_detail(game_id: str, request: Request, season: str = None):
    def _detail():
        from .services.game_data_refresh import get_completed_detail
        from .services.frontend_data import _check_token
        _check_token(request)
        refreshed = get_completed_detail(game_id)
        return refreshed if refreshed is not None else get_game_detail(game_id, request, season)

    return _run_endpoint(_detail)


@router.get("/frontend-data-api/play-by-play/{game_id}")
def frontend_play_by_play(game_id: str, request: Request, season: str = None):
    return _run_endpoint(lambda: get_play_by_play(game_id, request, season))


@router.get("/frontend-data-api/players/{player_id}")
def frontend_player_history(player_id: str, request: Request):
    return _run_endpoint(lambda: get_player_history(player_id, request))


@router.get("/frontend-data-api/team-rosters")
def frontend_team_rosters(request: Request, season: str = None):
    return _run_endpoint(lambda: get_team_rosters(request, season))


@router.get("/frontend-data-api/injury-report")
def frontend_injury_report(request: Request, season: str = None, date: str = None):
    """Injury report entries for one game day: today and later from the latest live report,
    earlier days from the stored history. `error` says why nothing could be read."""
    def _injury():
        from datetime import datetime
        from .services.frontend_data import _check_token
        from .services.auto_status import cached_report
        from .services.injury_history import read_history
        from src.core.season_utils import get_default_season, normalize_season

        _check_token(request)
        s = normalize_season(season or get_default_season())
        today = datetime.now(ET).strftime("%Y-%m-%d")
        d = date or today
        if d < today:
            rows = read_history(s)
            rows = rows[rows["game_date"] == d]
            entries = [{"team": r.team, "player_name": r.player_name, "status": r.status, "reason": r.reason}
                       for r in rows.itertuples()]
            return {"published_et": rows["report_time_et"].iloc[0] if len(rows) else None, "date": d,
                    "entries": entries, "not_submitted": [], "error": None if entries else "No stored report for this day"}
        report = cached_report(s, today)
        if report is None:
            return {"published_et": None, "date": d, "entries": [], "not_submitted": [],
                    "error": "Official injury report could not be read"}
        mmddyyyy = datetime.strptime(d, "%Y-%m-%d").strftime("%m/%d/%Y")
        return {
            "published_et": report.published_et,
            "date": d,
            "entries": [e for e in report.entries if e["game_date"] == mmddyyyy],
            "not_submitted": [list(x) for x in report.not_submitted],
            "error": None,
        }

    return _run_endpoint(_injury)


@router.get("/frontend-data-api/injuries")
def frontend_injuries(request: Request, season: str = None, date: str = None):
    def _injuries():
        from .services.frontend_data import _check_token
        from .services.injury_history import injuries_payload

        _check_token(request)
        return injuries_payload(season, date)

    return _run_endpoint(_injuries)


@router.post("/frontend-data-api/snapshot-publish")
def start_snapshot_publish(request: Request):
    from .services.snapshot_publish import start_publish

    def _start():
        from .services.frontend_data import _check_token
        _check_token(request)
        return start_publish()

    return _run_endpoint(_start)


@router.get("/frontend-data-api/snapshot-publish")
def snapshot_publish_status(request: Request):
    from .services.snapshot_publish import get_status

    def _status():
        from .services.frontend_data import _check_token
        _check_token(request)
        return get_status()

    return _run_endpoint(_status)


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
            from datetime import datetime
            from src.core.season_utils import get_default_season
            from .services.injury_history import changes_for_game

            day = str(req.prediction_date or datetime.now(ET).date())
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
