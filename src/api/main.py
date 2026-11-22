import threading
from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from .routes import router
from .rate_limit import RateLimitMiddleware
from .etag import ETagMiddleware
from .services.win_prediction import init_model
import uvicorn

logger = logging.getLogger(__name__)


def _warm_caches() -> None:
    """Prime caches after the server is already accepting requests (a request that beats a
    warmup step just computes the same cached value itself)."""
    try:
        # First: the Model Takibi page (paper trading) is the heaviest cold compute.
        from datetime import datetime
        from src.core.season_utils import get_default_season
        from .services.injury_history import injuries_payload
        from .services.paper_trading import paper_trading_report
        from src.ingestion.nba_injury_report import ET
        season = get_default_season()
        paper_trading_report(season)
        injuries_payload(season, datetime.now(ET).strftime("%Y-%m-%d"))
    except Exception as e:
        logger.warning("Paper trading / injuries warmup failed on startup: %s", e)

    try:
        from .services.frontend_data import warm_up_cache
        warm_up_cache()
    except Exception as e:
        logger.warning("Frontend cache warmup failed on startup: %s", e)

    try:
        # The first lineup request would otherwise spend ~6 s reading the season's player data.
        from src.core.season_utils import get_default_season
        from .services.player_projection import _load_player_dataset
        _load_player_dataset(get_default_season())
    except Exception as e:
        logger.warning("Player data warmup failed on startup: %s", e)


CATCH_UP_INTERVAL_SECONDS = 30 * 60


def _catch_up_loop() -> None:
    """Pull the cloud morning sync and rebuild the local store when it brought something new.

    Runs scripts/ops/local_catch_up.py now and every 30 minutes; a run with nothing new only does
    a git fetch. Enabled by NBA_AUTO_CATCH_UP=1 (scripts/start_all.sh sets it).
    """
    import subprocess
    import sys
    import time
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    log_path = root / "logs" / "local_catch_up.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    while True:
        try:
            with open(log_path, "a", encoding="utf-8") as log:
                subprocess.run(
                    [sys.executable, str(root / "scripts" / "ops" / "local_catch_up.py")],
                    cwd=root, stdout=log, stderr=subprocess.STDOUT, timeout=20 * 60,
                )
        except Exception as e:
            logger.warning("Local catch-up failed: %s", e)
        time.sleep(CATCH_UP_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_model()
    except Exception as e:
        logger.warning("Model load failed on startup: %s", e)

    threading.Thread(target=_warm_caches, name="cache-warmup", daemon=True).start()

    if os.environ.get("NBA_AUTO_CATCH_UP") == "1":
        threading.Thread(target=_catch_up_loop, name="local-catch-up", daemon=True).start()

    try:
        from .services.slate_warmup import start_background_warmup
        start_background_warmup()
    except Exception as e:
        logger.warning("Slate warmup could not start: %s", e)

    yield


app = FastAPI(title="NBA Win Probability ML Service", lifespan=lifespan)

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
app.add_middleware(ETagMiddleware)
app.add_middleware(RateLimitMiddleware)
# Store documents are JSON of 0.1-1.3 MB; gzip cuts them by roughly 85% on the wire.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)
app.include_router(router)


if __name__ == '__main__':
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, reload=False)
