import os
import sys
from pathlib import Path
# Ensure repo root is on sys.path so scripts/ and models/ are importable
REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes import router
from .rate_limit import RateLimitMiddleware
from .service import init_model
import uvicorn

app = FastAPI(title="NBA Win Probability ML Service")

def _parse_allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "").strip()
    if not raw:
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


# Allow local frontend connections during development
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimitMiddleware)
app.include_router(router)


@app.on_event("startup")
def startup_event():
    try:
        init_model()
    except Exception as e:
        # Log but keep service up; predict will return 503 if model missing
        print("Model load failed on startup:", e)

    try:
        from .services.frontend_data import warm_up_cache
        warm_up_cache()
    except Exception as e:
        print("Frontend cache warmup failed on startup:", e)


if __name__ == '__main__':
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=False)
