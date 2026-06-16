import importlib
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _load_routes(monkeypatch, tmp_path, token=None):
    repo_root = tmp_path / "repo"
    pbp_dir = repo_root / "data" / "season=2025-26" / "raw" / "play_by_play"
    pbp_dir.mkdir(parents=True)
    (pbp_dir / "0042500405.json").write_text(
        json.dumps({"gameId": "0042500405", "events": [{"actionNumber": 1}]}),
        encoding="utf-8",
    )

    monkeypatch.setenv("NBA_DATA_API_TOKEN", token or "")
    monkeypatch.syspath_prepend(str(Path.cwd() / "ml-service"))
    frontend_data = importlib.import_module("app.services.frontend_data")
    frontend_data = importlib.reload(frontend_data)
    routes = importlib.import_module("app.routes")
    routes = importlib.reload(routes)
    monkeypatch.setattr(frontend_data, "REPO_ROOT", repo_root)
    frontend_data._read_json_file.cache_clear()

    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app), frontend_data


def test_play_by_play_endpoint_serves_raw_pbp_by_season(tmp_path, monkeypatch):
    client, _ = _load_routes(monkeypatch, tmp_path)

    response = client.get("/frontend-data-api/play-by-play/0042500405?season=2025-26")

    assert response.status_code == 200
    assert response.json()["gameId"] == "0042500405"
    assert len(response.json()["events"]) == 1


def test_play_by_play_endpoint_infers_season_from_game_id(tmp_path, monkeypatch):
    client, _ = _load_routes(monkeypatch, tmp_path)

    response = client.get("/frontend-data-api/play-by-play/0042500405")

    assert response.status_code == 200
    assert response.json()["gameId"] == "0042500405"


def test_play_by_play_endpoint_returns_404_for_missing_game(tmp_path, monkeypatch):
    client, _ = _load_routes(monkeypatch, tmp_path)

    response = client.get("/frontend-data-api/play-by-play/0042500999?season=2025-26")

    assert response.status_code == 404
    assert "play_by_play not found" in response.json()["detail"]


def test_play_by_play_endpoint_respects_private_token(tmp_path, monkeypatch):
    client, _ = _load_routes(monkeypatch, tmp_path, token="secret")

    unauthorized = client.get("/frontend-data-api/play-by-play/0042500405?season=2025-26")
    authorized = client.get(
        "/frontend-data-api/play-by-play/0042500405?season=2025-26",
        headers={"x-data-token": "secret"},
    )

    assert unauthorized.status_code == 401
    assert authorized.status_code == 200
