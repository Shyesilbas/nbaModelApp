import importlib
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _load_rate_limit_module():
    import sys

    sys.path.insert(0, str(Path.cwd() / "ml-service"))
    module = importlib.import_module("app.rate_limit")
    return importlib.reload(module)


def _build_client(max_requests=2):
    rate_limit = _load_rate_limit_module()
    limiter = rate_limit.RateLimiter(
        rules=[rate_limit.RateLimitRule(name="predict", path_prefixes=("/predict/",), max_requests=max_requests, window_seconds=60)],
        exempt_paths={"/health"},
        trust_forwarded_for=False,
    )

    app = FastAPI()
    app.add_middleware(rate_limit.RateLimitMiddleware, limiter=limiter)

    @app.get("/predict/win-probability")
    def predict_win_probability():
        return {"ok": True}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return TestClient(app)


def test_rate_limit_blocks_after_threshold():
    client = _build_client(max_requests=2)

    assert client.get("/predict/win-probability").status_code == 200
    assert client.get("/predict/win-probability").status_code == 200

    response = client.get("/predict/win-probability")

    assert response.status_code == 429
    assert response.headers["x-ratelimit-limit"] == "2"
    assert response.headers["x-ratelimit-remaining"] == "0"
    assert response.json()["detail"] == "Rate limit exceeded"


def test_health_endpoint_stays_exempt():
    client = _build_client(max_requests=1)

    assert client.get("/health").status_code == 200
    assert client.get("/health").status_code == 200
