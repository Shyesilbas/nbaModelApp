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
    ShapExplanationRequest,
    ShapExplanationResponse
)
from .service import (
    predict,
)
from .services.game_full import predict_game_full
from .services.frontend_data import get_frontend_json, get_game_detail, get_game_index, get_manifest, get_play_by_play, get_player_history, get_team_rosters
from .services.player_prediction import predict_players
from .services.score_prediction import predict_score
from .services.status import get_model_status
from .services.shap_service import explain_win_probability, explain_score_prediction
from scripts.build_matchup_features import build_features

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
    def _preview():
        from .player_service import get_player_predictions
        from . import service as svc
        import pandas as pd

        df_players = get_player_predictions(
            home_team.upper(),
            away_team.upper(),
            prediction_date,
            svc.player_loader,
            svc.score_loader,
        )
        home_df = df_players[df_players["IS_HOME"] == 1]
        away_df = df_players[df_players["IS_HOME"] == 0]

        def to_list(df):
            out = []
            for _, r in df.iterrows():
                pid = int(r["PLAYER_ID"]) if pd.notna(r.get("PLAYER_ID")) else None
                out.append({
                    "player_id": pid,
                    "player_name": str(r.get("PLAYER_NAME", f"Player {pid}")),
                    "position_group": svc.CANONICAL_POSITIONS.get(pid, str(r.get("PLAYER_POSITION_GROUP", "UNKNOWN"))),
                    "predicted_pts": round(float(r.get("RAW_PROJ_PTS", 0.0)), 1),
                    "predicted_reb": round(float(r.get("RAW_PROJ_REB", 0.0)), 1),
                    "predicted_ast": round(float(r.get("RAW_PROJ_AST", 0.0)), 1),
                    "status": "ACTIVE"
                })
            out.sort(key=lambda x: x["predicted_pts"], reverse=True)
            return out

        return {
            "home_team": home_team.upper(),
            "away_team": away_team.upper(),
            "prediction_date": prediction_date,
            "home_players": to_list(home_df),
            "away_players": to_list(away_df)
        }

    return _run_endpoint(_preview)


@router.post("/predict/explain", response_model=ShapExplanationResponse)
def explain_game_endpoint(req: ShapExplanationRequest):
    def _explain():
        pred_date_str = req.prediction_date.isoformat() if hasattr(req.prediction_date, 'isoformat') else str(req.prediction_date)
        feats = build_features(req.home_team.upper(), req.away_team.upper(), pred_date_str)
        
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

