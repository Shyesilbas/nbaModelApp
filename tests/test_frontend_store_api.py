import importlib
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.frontend_store import store

GID = "0042500405"


def _season_db(season, games=(), details=(), team_bs=(), player_bs=(), player_games=(), moments=(), docs=None):
    with store.build_db(store.season_db_path(season), store.SEASON_SCHEMA) as conn:
        conn.executemany("INSERT INTO games VALUES (?, ?, ?)", [(g["GAME_ID"], g["GAME_DATE"], json.dumps(g)) for g in games])
        conn.executemany("INSERT INTO game_details VALUES (?, ?)", [(d["game_id"], json.dumps(d)) for d in details])
        conn.executemany("INSERT INTO team_boxscores VALUES (?, ?)", [(r["GAME_ID"], json.dumps(r)) for r in team_bs])
        conn.executemany("INSERT INTO player_boxscores VALUES (?, ?, ?)", [(r["GAME_ID"], r["PLAYER_ID"], json.dumps(r)) for r in player_bs])
        conn.executemany("INSERT INTO player_games VALUES (?, ?, ?)", [(pid, json.dumps(g), json.dumps(a)) for pid, g, a in player_games])
        conn.executemany("INSERT INTO pbp_moments VALUES (?, ?)", [(gid, json.dumps(m)) for gid, m in moments])
        conn.executemany("INSERT INTO docs VALUES (?, ?)", [(k, json.dumps(v)) for k, v in (docs or {}).items()])


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STORE_DIR", tmp_path / "store")
    _season_db(
        "2025-26",
        games=[{"GAME_ID": GID, "GAME_DATE": "2026-06-14", "HOME_TEAM_ABBREVIATION": "NYK"},
               {"GAME_ID": "0022500001", "GAME_DATE": "2025-10-21", "HOME_TEAM_ABBREVIATION": "BOS"}],
        details=[{"game_id": GID, "home_team": {"team_id": "NYK"}}],
        team_bs=[{"GAME_ID": GID, "TEAM_ABBREVIATION": "NYK"}, {"GAME_ID": GID, "TEAM_ABBREVIATION": "SAS"}],
        player_bs=[{"GAME_ID": GID, "PLAYER_ID": 7, "PTS": 30}],
        player_games=[("7", [{"GAME_ID": GID}], {"PTS": 30.0})],
        moments=[(GID, {"game_id": GID, "events": [{"n": 1}]})],
        docs={"team_rosters": [{"TEAM_ABBREVIATION": "NYK", "PLAYER_ID": 7}]},
    )
    _season_db("2024-25", player_games=[("7", [{"GAME_ID": "0022400001"}], {"PTS": 20.0})])
    with store.build_db(store.global_db_path(), store.GLOBAL_SCHEMA) as conn:
        conn.execute("INSERT INTO docs VALUES ('seasons', ?)", (json.dumps(["2024-25", "2025-26"]),))

    repo_root = tmp_path / "repo"
    raw_pbp = repo_root / "data" / "season=2025-26" / "raw" / "play_by_play"
    raw_pbp.mkdir(parents=True)
    (raw_pbp / "0042500406.json").write_text(json.dumps({"events": []}), encoding="utf-8")

    monkeypatch.setenv("NBA_DATA_API_TOKEN", "")
    frontend_data = importlib.reload(importlib.import_module("src.api.services.frontend_data"))
    monkeypatch.setattr(frontend_data, "REPO_ROOT", repo_root)
    monkeypatch.setattr(frontend_data, "DEFAULT_SEASON", "2025-26")
    frontend_data._doc.cache_clear()
    routes = importlib.reload(importlib.import_module("src.api.routes"))
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app)


def test_game_index_is_sorted_and_filterable(client):
    games = client.get("/frontend-data-api/games?season=2025-26").json()
    assert [g["GAME_ID"] for g in games] == ["0022500001", GID]
    late = client.get("/frontend-data-api/games?season=2025-26&start_date=2026-01-01").json()
    assert [g["GAME_ID"] for g in late] == [GID]


def test_game_detail_infers_season_and_attaches_team_stats(client):
    body = client.get(f"/frontend-data-api/games/{GID}").json()
    assert body["game_detail"]["home_team"]["team_id"] == "NYK"
    assert len(body["game_detail"]["team_stats"]) == 2
    assert body["player_boxscores"][0]["PTS"] == 30


def test_play_by_play_from_store_then_raw_fallback(client):
    assert client.get(f"/frontend-data-api/play-by-play/{GID}").json()["events"] == [{"n": 1}]
    fallback = client.get("/frontend-data-api/play-by-play/0042500406?season=2025-26")
    assert fallback.status_code == 200
    assert client.get("/frontend-data-api/play-by-play/0042500999?season=2025-26").status_code == 404


def test_player_history_spans_season_stores(client):
    body = client.get("/frontend-data-api/players/7").json()
    assert set(body["games"]) == {"2024-25", "2025-26"}
    assert body["averages"]["2024-25"]["PTS"] == 20.0


def test_docs_and_missing_season(client):
    assert client.get("/frontend-data-api/seasons").json() == ["2024-25", "2025-26"]
    assert client.get("/frontend-data-api/team-rosters?season=2025-26").json()[0]["PLAYER_ID"] == 7
    assert client.get("/frontend-data-api/games?season=2019-20").status_code == 404


def test_private_token(client, monkeypatch):
    import src.api.services.frontend_data as frontend_data

    monkeypatch.setattr(frontend_data, "DATA_TOKEN", "secret")
    assert client.get("/frontend-data-api/seasons").status_code == 401
    assert client.get("/frontend-data-api/seasons", headers={"x-data-token": "secret"}).status_code == 200
