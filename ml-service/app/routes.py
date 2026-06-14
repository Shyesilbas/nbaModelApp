import traceback
from typing import Callable

from fastapi import APIRouter, HTTPException, Request

from .schemas import (
    GameFullRequest,
    GameFullResponse,
    ModelStatusResponse,
    PlayerPredictionResponse,
    ScorePredictionRequest,
    ScorePredictionResponse,
    WinProbRequest,
    WinProbResponse,
)
from .service import (
    predict,
)
from .services.game_full import predict_game_full
from .services.frontend_data import get_frontend_json, get_game_detail, get_game_index, get_manifest, get_player_history, get_team_rosters
from .services.player_prediction import predict_players
from .services.score_prediction import predict_score
from .services.status import get_model_status

router = APIRouter()


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
def frontend_game_index(request: Request, season: str = None):
    return _run_endpoint(lambda: get_game_index(request, season))


@router.get("/frontend-data-api/games/{game_id}")
def frontend_game_detail(game_id: str, request: Request, season: str = None):
    return _run_endpoint(lambda: get_game_detail(game_id, request, season))


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
