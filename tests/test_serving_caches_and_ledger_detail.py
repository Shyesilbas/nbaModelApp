"""Serving caches, conditional GET and the detail fields of the paper ledger."""
import numpy as np
import pandas as pd
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.etag import ETagMiddleware
from src.api.services import paper_trading as pt
from src.evaluation import ledger_detail
from src.features import roster_absence as ra


def _logs(n_games: int = 8) -> pd.DataFrame:
    rows = []
    for g in range(n_games):
        for pid in range(1, 9):
            if pid == 8 and g == n_games - 1:
                continue  # player 8 skips the last game
            rows.append({
                "Game_ID": f"00226{g:05d}", "Player_ID": pid, "PLAYER_NAME": f"P{pid}", "MATCHUP": "AAA vs. BBB",
                "GAME_DATE": f"2026-11-{g + 1:02d}", "MIN": 30 - pid, "PTS": 20 - pid, "FGM": 7, "FGA": 15, "FTA": 4,
                "FTM": 3, "OREB": 1, "DREB": 4, "STL": 1, "AST": 4, "BLK": 0, "PF": 2, "TOV": 2,
            })
    return pd.DataFrame(rows)


def test_live_rotation_cache_matches_uncached_and_follows_new_data():
    logs = _logs()
    first = ra.live_roster_metrics(logs, "AAA", "2026-11-20")
    again = ra.live_roster_metrics(logs, "AAA", "2026-11-20")
    fresh = ra._live_rotation_uncached(ra._prepare(logs), "AAA", "2026-11-20", False)
    cached = ra._live_rotation(logs, "AAA", "2026-11-20")
    assert first == again
    assert cached[1] == fresh[1] and cached[0].equals(fresh[0])
    assert first["MISSING_ROT_MINS"] > 0  # player 8 is assumed out

    updated = _logs(9)  # a new frame object, as after a data refresh
    assert ra.live_roster_metrics(updated, "AAA", "2026-11-20") == ra.live_roster_metrics(updated.copy(), "AAA", "2026-11-20")
    assert ra.assumed_out_players(updated, "AAA", "2026-11-20") == {8}


def test_etag_revalidation_only_on_data_endpoints():
    app = FastAPI()
    app.add_middleware(ETagMiddleware)
    state = {"body": {"v": 1}}
    app.get("/frontend-data-api/doc")(lambda: state["body"])
    app.get("/other")(lambda: state["body"])
    client = TestClient(app)

    first = client.get("/frontend-data-api/doc")
    tag = first.headers["etag"]
    assert first.status_code == 200 and first.headers["cache-control"] == "no-cache"
    same = client.get("/frontend-data-api/doc", headers={"If-None-Match": tag})
    assert same.status_code == 304 and same.content == b""
    state["body"] = {"v": 2}
    changed = client.get("/frontend-data-api/doc", headers={"If-None-Match": tag})
    assert changed.status_code == 200 and changed.json() == {"v": 2} and changed.headers["etag"] != tag
    assert "etag" not in client.get("/other").headers


def test_build_record_detail_fields_are_optional_and_kept_out_of_the_page():
    base = pt.build_record("22600001", "2026-11-16", "2026-11-17T00:00:00Z", "AAA", "BBB", "v15", 0.61, 110.2, 104.9)
    assert not set(pt.DETAIL_FIELDS) & set(base)
    rec = pt.build_record("22600001", "2026-11-16", "2026-11-17T00:00:00Z", "AAA", "BBB", "v15", 0.61, 110.2, 104.9,
                          features={"home": {"ELO_DIFF": 12.5}}, players=[{"id": 1}], shadow={"cand": 0.6})
    assert rec["features"]["home"]["ELO_DIFF"] == 12.5 and rec["shadow"] == {"cand": 0.6}
    assert rec["home_win_probability"] == base["home_win_probability"]


def _graded(n_days: int = 12) -> list[dict]:
    rows = []
    for d in range(n_days):
        y = float(d % 2)
        rows.append({
            "game_id": f"00226{d:05d}", "game_date": f"2026-11-{d + 1:02d}", "y": y, "home_win_probability": 0.5,
            "elo_prob": 0.5, "shadow": {"cand": 0.9 if y else 0.1},
            "players": [
                {"id": 1, "team": "AAA", "status": "ACTIVE", "min": 30.0, "pts": 20.0, "reb": 5.0, "ast": 5.0, "raw_pts": 20.0},
                {"id": 2, "team": "AAA", "status": "OUT", "min": 0.0, "pts": 0.0, "reb": 0.0, "ast": 0.0, "raw_pts": 0.0},
                {"id": 3, "team": "AAA", "status": "ACTIVE", "min": 20.0, "pts": 9.0, "reb": 3.0, "ast": 2.0, "raw_pts": 9.0},
            ],
        })
    return rows


def test_shadow_summary_compares_on_the_same_games():
    out = ledger_detail.shadow_summary(_graded())["cand"]
    assert out["games"] == 12
    assert out["shadow_brier"] == pytest.approx(0.01) and out["production_brier"] == pytest.approx(0.25)
    assert out["shadow_vs_production"]["ci_high"] < 0 and out["shadow_vs_elo"]["mean_diff"] == pytest.approx(-0.24)
    assert ledger_detail.shadow_summary([{"y": 1.0, "home_win_probability": 0.5}]) == {}


def test_player_summary_grades_only_expected_players_who_played(monkeypatch):
    graded = _graded()
    box = pd.DataFrame([
        {"Player_ID": pid, "Game_ID": g["game_id"], "GAME_DATE": pd.Timestamp(g["game_date"]), "MIN": 32.0,
         "PTS": 22.0, "REB": 5.0, "AST": 4.0, "PTS_EMA": 25.0, "REB_EMA": 5.0, "AST_EMA": np.nan}
        for g in graded for pid in (1, 2)  # player 2 was listed OUT but played; player 3 did not play
    ])
    monkeypatch.setattr(ledger_detail, "player_actuals", lambda season: box)
    out = ledger_detail.player_summary(graded, "2026-27")
    assert out["rows"] == 12 and out["projected_to_play"] == 24
    assert out["played_share_of_projected"] == pytest.approx(0.5) and out["box_score_players_listed"] == pytest.approx(1.0)
    assert out["minutes_mae"] == pytest.approx(2.0)
    assert out["stats"]["pts"]["model_mae"] == pytest.approx(2.0) and out["stats"]["pts"]["ema10_mae"] == pytest.approx(3.0)
    assert out["stats"]["ast"]["rows"] == 0  # no earlier game, no baseline
    assert ledger_detail.player_summary([{"game_id": "x"}], "2026-27") is None
