import importlib
import json
import threading
import time

import pandas as pd


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


def test_batch_completes_games_progressively_and_flushes_once(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")
    builders = importlib.import_module("src.frontend_store.builders")

    flushed, enriched, mid_batch_snapshots = [], [], []
    gate = threading.Event()

    def fake_fetch(gid, season, sched):
        if gid != "0022600001":
            # Wait until game 1 is observed as complete before later games finish
            gate.wait(timeout=2.0)
        return (
            pd.DataFrame({"GAME_ID": [gid]}),
            pd.DataFrame({"Game_ID": [gid]}),
            pd.DataFrame(),
        )

    def fake_detail(gid, season, t, p, s, sched):
        if gid == "0022600001":
            # Signal after a short tick once game 1 completes
            threading.Timer(0.05, gate.set).start()
        return {"game_id": gid, "game_detail": {}, "team_boxscores": [], "player_boxscores": []}, {"GAME_ID": gid}

    monkeypatch.setattr(refresh, "_get_schedule", lambda s, c: pd.DataFrame())
    monkeypatch.setattr(refresh, "_fetch_game_raw", fake_fetch)
    monkeypatch.setattr(refresh, "_build_in_memory_detail", fake_detail)
    monkeypatch.setattr(refresh, "_resolve_teams_from_df", lambda df, gid, h, a: (h, a))
    monkeypatch.setattr(builders, "upsert_game_to_season_store", lambda *a, **kw: True)
    monkeypatch.setattr(refresh, "_flush_season_raw", lambda season, rows: flushed.append((season, [r[0] for r in rows])))
    monkeypatch.setattr(refresh, "_enrich_season_secondary", lambda season, games: enriched.append((season, [g[0] for g in games])))

    gids = ["0022600001", "0022600002", "0022600003"]
    for g in gids:
        refresh._jobs[g] = {"status": "queued", "detail": None, "error": None}
    refresh._pending_flush.clear()

    worker = threading.Thread(
        target=refresh._refresh_many_locked,
        args=([(g, "2026-27", None, None) for g in gids],),
    )
    worker.start()

    deadline = time.time() + 2.0
    while time.time() < deadline:
        if refresh._jobs["0022600001"]["status"] == "complete":
            mid_batch_snapshots.append((
                refresh._jobs["0022600001"]["status"],
                refresh._jobs["0022600003"]["status"],
                len(flushed),
            ))
            break
        time.sleep(0.01)
    gate.set()
    worker.join(timeout=5.0)

    # Game 1 became complete before the batch flushed or finished all games
    assert mid_batch_snapshots == [("complete", "running", 0)] or mid_batch_snapshots == [("complete", "queued", 0)]
    assert len(flushed) == 1 and sorted(flushed[0][1]) == gids
    assert len(enriched) == 1 and sorted(enriched[0][1]) == gids
    assert all(refresh._jobs[g]["status"] == "complete" for g in gids)


def test_batch_failure_of_one_game_does_not_block_the_rest(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")
    builders = importlib.import_module("src.frontend_store.builders")
    flushed, enriched = [], []

    def fake_fetch(gid, season, sched):
        if gid.endswith("2"):
            raise RuntimeError("no rows")
        return pd.DataFrame({"GAME_ID": [gid]}), pd.DataFrame({"Game_ID": [gid]}), pd.DataFrame()

    monkeypatch.setattr(refresh, "_get_schedule", lambda s, c: pd.DataFrame())
    monkeypatch.setattr(refresh, "_fetch_game_raw", fake_fetch)
    monkeypatch.setattr(
        refresh,
        "_build_in_memory_detail",
        lambda gid, s, t, p, st, sc: ({"game_id": gid, "game_detail": {}, "team_boxscores": [], "player_boxscores": []}, {"GAME_ID": gid}),
    )
    monkeypatch.setattr(refresh, "_resolve_teams_from_df", lambda df, gid, h, a: (h, a))
    monkeypatch.setattr(builders, "upsert_game_to_season_store", lambda *a, **kw: True)
    monkeypatch.setattr(refresh, "_flush_season_raw", lambda season, rows: flushed.append([r[0] for r in rows]))
    monkeypatch.setattr(refresh, "_enrich_season_secondary", lambda season, games: enriched.append([g[0] for g in games]))

    gids = ["0022600011", "0022600012", "0022600013"]
    for g in gids:
        refresh._jobs[g] = {"status": "queued", "detail": None, "error": None}
    refresh._pending_flush.clear()

    refresh._refresh_many_locked([(g, "2026-27", None, None) for g in gids])

    assert refresh._jobs["0022600012"]["status"] == "failed"
    assert sorted(flushed[0]) == ["0022600011", "0022600013"]
    assert sorted(enriched[0]) == ["0022600011", "0022600013"]


def test_boxscore_frames_are_requested_once_per_game(monkeypatch):
    import sys
    import types

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


def test_boxscore_service_respects_warm_summaries_and_game_filter(monkeypatch):
    svc_mod = importlib.import_module("src.ingestion.boxscore_service")
    summary_mod = importlib.import_module("src.ingestion.game_summary_fetcher")
    status_mod = importlib.import_module("src.frontend_store.season_status")

    results_df = pd.DataFrame({
        "GAME_ID": ["0022600001", "0022600002"],
        "HOME_SCORE": [110, 105],
    })
    monkeypatch.setattr(svc_mod, "run_boxscore_pipeline", lambda **kw: (pd.DataFrame(), pd.DataFrame(), results_df))
    monkeypatch.setattr(status_mod, "season_status", lambda s: "active")

    fetched = []
    monkeypatch.setattr(summary_mod, "fetch_game_summary", lambda gid, season=None: fetched.append(gid))

    svc_mod.BoxscoreService(save=True, season="2026-27", warm_summaries=False).run_and_export()
    assert fetched == []

    svc_mod.BoxscoreService(save=True, season="2026-27", summary_game_ids=["0022600002"]).run_and_export()
    assert fetched == ["0022600002"]


def test_upsert_game_to_season_store_updates_single_game(monkeypatch, tmp_path):
    store = importlib.import_module("src.frontend_store.store")
    builders = importlib.import_module("src.frontend_store.builders")

    monkeypatch.setattr(store, "STORE_DIR", tmp_path)
    db_path = store.season_db_path("2026-27")
    with store.build_db(db_path, store.SEASON_SCHEMA) as conn:
        conn.execute(
            "INSERT INTO games VALUES (?, ?, ?)",
            ("0022600001", "2026-10-25", json.dumps({"GAME_ID": "0022600001", "GAME_TIME": "7:30 PM ET", "GAME_STATUS": "Scheduled"})),
        )

    ok = builders.upsert_game_to_season_store(
        "2026-27",
        "0022600001",
        {"GAME_ID": "0022600001", "GAME_DATE": "2026-10-25", "GAME_STATUS": "Final", "HOME_SCORE": 112, "AWAY_SCORE": 104},
        [{"GAME_ID": "0022600001", "TEAM_ABBREVIATION": "BOS", "PTS": 112}],
        [{"GAME_ID": "0022600001", "PLAYER_ID": 1, "PTS": 30}],
        {"game_id": "0022600001", "game_status": "Final", "team_stats": [{"TEAM_ABBREVIATION": "BOS"}]},
    )
    assert ok is True

    conn = store.connect_ro(db_path)
    try:
        row = json.loads(conn.execute("SELECT data_json FROM games WHERE game_id = '0022600001'").fetchone()[0])
        detail = json.loads(conn.execute("SELECT data_json FROM game_details WHERE game_id = '0022600001'").fetchone()[0])
        team_count = conn.execute("SELECT COUNT(*) FROM team_boxscores WHERE game_id = '0022600001'").fetchone()[0]
        player_count = conn.execute("SELECT COUNT(*) FROM player_boxscores WHERE game_id = '0022600001'").fetchone()[0]
    finally:
        conn.close()

    assert row["GAME_STATUS"] == "Final"
    assert row["HOME_SCORE"] == 112
    assert row["GAME_TIME"] == "7:30 PM ET"
    assert "team_stats" not in detail
    assert team_count == 1
    assert player_count == 1


def test_single_refresh_releases_ingest_lock_before_store_rebuild(monkeypatch):
    refresh = importlib.import_module("src.api.services.game_data_refresh")
    builders = importlib.import_module("src.frontend_store.builders")

    rebuild_started = threading.Event()
    allow_rebuild_finish = threading.Event()
    second_started = threading.Event()

    monkeypatch.setattr(refresh, "_load_schedule_df", lambda s: pd.DataFrame())
    monkeypatch.setattr(
        refresh,
        "_fetch_game_raw",
        lambda gid, s, sched: (pd.DataFrame({"GAME_ID": [gid]}), pd.DataFrame({"Game_ID": [gid]}), pd.DataFrame()),
    )
    monkeypatch.setattr(refresh, "_fetch_summary_safe", lambda gid, s: None)
    monkeypatch.setattr(refresh, "_fetch_and_write_pbp", lambda gid, s, h, a: (None, None))
    monkeypatch.setattr(refresh, "_resolve_teams_from_df", lambda df, gid, h, a: ("HOM", "AWY"))
    monkeypatch.setattr(
        refresh,
        "_build_in_memory_detail",
        lambda gid, s, t, p, st, sc: ({"game_id": gid, "game_detail": {}, "team_boxscores": [], "player_boxscores": []}, {"GAME_ID": gid}),
    )
    monkeypatch.setattr(refresh, "_flush_season_raw", lambda s, rows: None)
    monkeypatch.setattr(builders, "upsert_game_to_season_store", lambda *a, **kw: True)

    def slow_rebuild(season_key):
        rebuild_started.set()
        allow_rebuild_finish.wait(timeout=3.0)

    monkeypatch.setattr(refresh, "_rebuild_frontend_store", slow_rebuild)

    refresh._jobs["0022600091"] = {"status": "queued", "detail": None, "error": None}
    refresh._run_refresh("0022600091", "2026-27", "HOM", "AWY")
    assert refresh._jobs["0022600091"]["status"] == "complete"
    assert rebuild_started.wait(timeout=2.0)

    # Second refresh must acquire _ingest_lock without waiting for slow_rebuild to finish.
    def quick_second():
        refresh._jobs["0022600092"] = {"status": "queued", "detail": None, "error": None}
        refresh._run_refresh("0022600092", "2026-27", "HOM", "AWY")
        second_started.set()

    t = threading.Thread(target=quick_second)
    t.start()
    try:
        assert second_started.wait(timeout=2.0)
    finally:
        allow_rebuild_finish.set()
        t.join(timeout=2.0)
        assert refresh.wait_for_store_rebuild(timeout=3.0)


def test_v3_failure_is_short_circuited_and_v2_shared(monkeypatch):
    import sys
    import types

    client = importlib.import_module("src.ingestion.nba_api_client")
    refresh = importlib.import_module("src.api.services.game_data_refresh")

    v3_calls, v2_calls = [], []

    class BrokenV3:
        def __init__(self, **kwargs):
            v3_calls.append(kwargs["game_id"])
            raise RuntimeError("V3 temporarily unavailable")

    class FakeV2:
        def __init__(self, **kwargs):
            v2_calls.append(kwargs["game_id"])

        def get_data_frames(self):
            p_df = pd.DataFrame({
                "PLAYER_ID": [10],
                "PLAYER_NAME": ["Test Player"],
                "TEAM_ID": [1610612738],
                "TEAM_ABBREVIATION": ["BOS"],
                "COMMENT": [""],
                "MIN": ["24:00"],
                "FGM": [5], "FGA": [10], "FG_PCT": [0.5],
                "FG3M": [2], "FG3A": [4], "FG3_PCT": [0.5],
                "FTM": [2], "FTA": [2], "FT_PCT": [1.0],
                "OREB": [1], "DREB": [3], "REB": [4],
                "AST": [3], "STL": [1], "BLK": [0], "TO": [1], "PF": [2], "PTS": [14], "PLUS_MINUS": [5],
            })
            t_df = pd.DataFrame({
                "TEAM_ID": [1610612738, 1610612752],
                "TEAM_ABBREVIATION": ["BOS", "NYK"],
                "TEAM_NAME": ["Boston Celtics", "New York Knicks"],
                "MIN": ["240:00", "240:00"],
                "FGM": [40, 38], "FGA": [85, 84], "FG_PCT": [0.471, 0.452],
                "FG3M": [12, 10], "FG3A": [32, 30], "FG3_PCT": [0.375, 0.333],
                "FTM": [18, 16], "FTA": [22, 20], "FT_PCT": [0.818, 0.800],
                "OREB": [10, 9], "DREB": [34, 31], "REB": [44, 40],
                "AST": [25, 22], "STL": [7, 6], "BLK": [5, 4], "TO": [12, 14], "PF": [18, 20],
                "PTS": [110, 102], "PLUS_MINUS": [8, -8],
            })
            return [p_df, t_df]

    mod_v3 = types.ModuleType("nba_api.stats.endpoints.boxscoretraditionalv3")
    mod_v3.BoxScoreTraditionalV3 = BrokenV3
    mod_v2 = types.ModuleType("nba_api.stats.endpoints.boxscoretraditionalv2")
    mod_v2.BoxScoreTraditionalV2 = FakeV2
    monkeypatch.setitem(sys.modules, "nba_api.stats.endpoints.boxscoretraditionalv3", mod_v3)
    monkeypatch.setattr("nba_api.stats.endpoints.boxscoretraditionalv3", mod_v3, raising=False)
    monkeypatch.setitem(sys.modules, "nba_api.stats.endpoints.boxscoretraditionalv2", mod_v2)
    monkeypatch.setattr("nba_api.stats.endpoints.boxscoretraditionalv2", mod_v2, raising=False)
    monkeypatch.setattr(client, "call_nba_api", lambda cls, **kw: cls(**kw))
    client.clear_boxscore_cache()

    sched = pd.DataFrame({
        "GAME_ID": ["0099900099"],
        "GAME_DATE": ["2026-11-01"],
        "HOME_TEAM_ABBREVIATION": ["BOS"],
        "AWAY_TEAM_ABBREVIATION": ["NYK"],
        "SEASON_TYPE": ["Regular Season"],
    })
    team_df, player_df, starters_df = refresh._fetch_game_raw("0099900099", "2026-27", schedule_df=sched)

    assert len(team_df) == 2
    assert len(player_df) == 1
    assert starters_df.empty
    assert v3_calls == ["0099900099"]
    assert v2_calls == ["0099900099"]
