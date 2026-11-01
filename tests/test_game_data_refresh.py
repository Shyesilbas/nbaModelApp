import importlib
import threading
import time


def test_single_and_batch_refreshes_never_overlap(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")

    running, overlaps = [0], []

    def fake_refresh(game_id, season, home, away):
        running[0] += 1
        overlaps.append(running[0])
        time.sleep(0.05)  # long enough for the other thread to try to start
        running[0] -= 1

    monkeypatch.setattr(refresh, "_refresh_locked", fake_refresh)
    threads = [threading.Thread(target=refresh._run_refresh, args=(f"002260000{i}", "2026-27", None, None)) for i in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert overlaps == [1, 1, 1]


def test_batch_rebuilds_the_season_once(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")
    ingested, finalized = [], []
    monkeypatch.setattr(refresh, "_ingest_raw", lambda gid, season: ingested.append(gid))
    monkeypatch.setattr(refresh, "_finalize", lambda games, season: finalized.append([g[0] for g in games]))
    gids = ["0022600001", "0022600002", "0022600003"]
    for g in gids:
        refresh._jobs[g] = {"status": "queued", "detail": None, "error": None}

    refresh._refresh_many_locked([(g, "2026-27", None, None) for g in gids])

    assert ingested == gids
    assert finalized == [gids]


def test_batch_failure_of_one_game_does_not_block_the_rest(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")
    finalized = []

    def ingest(gid, season):
        if gid.endswith("2"):
            raise RuntimeError("no rows")

    monkeypatch.setattr(refresh, "_ingest_raw", ingest)
    monkeypatch.setattr(refresh, "_finalize", lambda games, season: finalized.append([g[0] for g in games]))
    gids = ["0022600011", "0022600012", "0022600013"]
    for g in gids:
        refresh._jobs[g] = {"status": "queued", "detail": None, "error": None}

    refresh._refresh_many_locked([(g, "2026-27", None, None) for g in gids])

    assert refresh._jobs["0022600012"]["status"] == "failed"
    assert finalized == [["0022600011", "0022600013"]]


def test_boxscore_frames_are_requested_once_per_game(monkeypatch):
    import sys
    import types

    import pandas as pd

    client = importlib.import_module("src.ingestion.nba_api_client")
    calls = []

    class FakeEndpoint:
        def __init__(self, **kwargs):
            calls.append(kwargs["game_id"])

        def get_data_frames(self):
            return [pd.DataFrame({"a": [1]})]

    fake_mod = types.ModuleType("nba_api.stats.endpoints.boxscoretraditionalv3")
    fake_mod.BoxScoreTraditionalV3 = FakeEndpoint
    monkeypatch.setitem(sys.modules, "nba_api.stats.endpoints.boxscoretraditionalv3", fake_mod)
    monkeypatch.setattr("nba_api.stats.endpoints.boxscoretraditionalv3", fake_mod, raising=False)
    monkeypatch.setattr(client, "call_nba_api", lambda cls, **kw: cls(**kw))
    client._boxscore_cache.clear()

    client.fetch_boxscore_v3_frames("22600001")
    client.fetch_boxscore_v3_frames("0022600001")

    assert calls == ["0022600001"]
