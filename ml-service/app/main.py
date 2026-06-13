import sys
from pathlib import Path
# Ensure repo root is on sys.path so scripts/ and models/ are importable
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .schemas import (
    WinProbRequest, WinProbResponse, ScorePredictionRequest, ScorePredictionResponse,
    ModelStatusResponse, PlayerPredictionResponse, PlayerPrediction,
    GameFullRequest, GameFullResponse
)
from .service import init_model, predict, predict_score, get_model_status, predict_players, predict_game_full
import uvicorn
import traceback

app = FastAPI(title="NBA Win Probability ML Service")

# Allow local connections from frontend/backend during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    try:
        init_model()
    except Exception as e:
        # Log but keep service up; predict will return 503 if model missing
        print("Model load failed on startup:", e)


@app.post("/predict/win-probability", response_model=WinProbResponse)
def predict_endpoint(req: WinProbRequest):
    try:
        return predict(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/score", response_model=ScorePredictionResponse)
def predict_score_endpoint(req: ScorePredictionRequest):
    try:
        return predict_score(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict/players", response_model=PlayerPredictionResponse)
def predict_players_endpoint(req: ScorePredictionRequest):
    try:
        return predict_players(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model-status", response_model=ModelStatusResponse)
def model_status():
    try:
        return get_model_status()
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/game_full", response_model=GameFullResponse)
def predict_game_full_endpoint(req: GameFullRequest):
    try:
        return predict_game_full(req)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == '__main__':
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=False)
