import traceback
from typing import Callable

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .schemas import (
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
from .service import (
    predict,
)
from .services.game_full import predict_game_full
from .services.frontend_data import (
    get_frontend_json,
    get_game_detail,
    get_game_index,
    get_manifest,
    get_play_by_play,
    get_player_history,
    get_season_weeks,
    get_team_rosters,
)
from .services.player_prediction import predict_players
from .services.score_prediction import predict_score
from .services.status import get_model_status
from .services.shap_service import explain_win_probability, explain_score_prediction
from scripts.build_matchup_features import build_features

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
    return _run_endpoint(lambda: predict(req))


@router.post("/predict/score", response_model=ScorePredictionResponse)
def predict_score_endpoint(req: ScorePredictionRequest):
    return _run_endpoint(lambda: predict_score(req))


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/frontend-data/manifest")
def frontend_data_manifest(request: Request):
    return _run_endpoint(lambda: get_manifest(request))


@router.get("/frontend-data/{filename}")
def frontend_data_file(filename: str, request: Request):
    return _run_endpoint(lambda: get_frontend_json(filename, request))


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


@router.post("/predict/players", response_model=PlayerPredictionResponse)
def predict_players_endpoint(req: ScorePredictionRequest):
    return _run_endpoint(lambda: predict_players(req))


@router.get("/model-status", response_model=ModelStatusResponse)
def model_status():
    return _run_endpoint(get_model_status)


@router.post("/predict/game_full", response_model=GameFullResponse)
def predict_game_full_endpoint(req: GameFullRequest):
    return _run_endpoint(lambda: predict_game_full(req))


@router.get("/predict/rosters-preview")
def rosters_preview_endpoint(home_team: str, away_team: str, prediction_date: str):
    """Rosters and importance only. No player model runs here; projections come with the prediction."""
    def _preview():
        from . import service as svc
        from .player_service import get_roster_preview
        from .services.availability import assumed_out_ids, importance_score
        import pandas as pd

        home, away = home_team.upper(), away_team.upper()
        df_players = get_roster_preview(home, away, prediction_date)

        def to_list(df, team):
            flagged = assumed_out_ids(team, prediction_date)
            out = []
            for _, r in df.iterrows():
                pid = int(r["PLAYER_ID"]) if pd.notna(r.get("PLAYER_ID")) else None
                out.append({
                    "player_id": pid,
                    "player_name": str(r.get("PLAYER_NAME", f"Player {pid}")),
                    "position_group": svc.CANONICAL_POSITIONS.get(pid, str(r.get("PLAYER_POSITION_GROUP", "UNKNOWN"))),
                    "status": "ACTIVE",
                    "importance": importance_score(r),
                    "assumed_out": pid in flagged,
                })
            out.sort(key=lambda x: x["importance"], reverse=True)
            return out

        return {
            "home_team": home,
            "away_team": away,
            "prediction_date": prediction_date,
            "home_players": to_list(df_players[df_players["IS_HOME"] == 1], home),
            "away_players": to_list(df_players[df_players["IS_HOME"] == 0], away),
        }

    return _run_endpoint(_preview)


@router.post("/predict/explain", response_model=ShapExplanationResponse)
def explain_game_endpoint(req: ShapExplanationRequest):
    def _explain():
        pred_date_str = req.prediction_date.isoformat() if hasattr(req.prediction_date, 'isoformat') else str(req.prediction_date)
        feats = build_features(
            req.home_team.upper(),
            req.away_team.upper(),
            pred_date_str,
            player_status_overrides=req.player_status_overrides,
        )
        
        win_exp = explain_win_probability(req.home_team, req.away_team, feats, req.model_version)
        score_exp = explain_score_prediction(req.home_team, req.away_team, feats, req.model_version)
        
        return ShapExplanationResponse(
            home_team=req.home_team.upper(),
            away_team=req.away_team.upper(),
            prediction_date=pred_date_str,
            win_model_explanation=win_exp,
            score_model_explanation=score_exp
        )
    return _run_endpoint(_explain)
