from src.frontend_store.quarter_breakdown import build_quarter_breakdown

ZERO = {"pts": 0, "fgm": 0, "fga": 0, "fg3m": 0, "fg3a": 0, "ftm": 0, "fta": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0, "pf": 0, "tov": 0}


def _event(period, pid, name, team, before, after, assist=None):
    return {
        "period": period,
        "player_id": pid,
        "player_name": name,
        "team": team,
        "player_stats_before": {**ZERO, **before},
        "player_stats_after": {**ZERO, **after},
        "assist_player_name": assist,
    }


def test_player_stats_are_split_by_period_and_assists_credit_the_passer():
    payload = {
        "game_id": "0022600001",
        "home_team": "MIA",
        "away_team": "NOP",
        "quarter_scores": [],
        "events": [
            _event(1, 1, "Dončić", "NOP", {}, {"pts": 2, "fgm": 1, "fga": 1}),
            _event(1, 2, "Poole", "NOP", {}, {"pts": 3, "fgm": 1, "fga": 1, "fg3m": 1, "fg3a": 1}, assist="Doncic"),
            _event(2, 1, "Dončić", "NOP", {"pts": 2, "fgm": 1, "fga": 1}, {"pts": 2, "fgm": 1, "fga": 2, "reb": 0}),
        ],
    }
    result = build_quarter_breakdown(payload)
    by_id = {p["player_id"]: p for p in result["players"]}
    assert by_id[1]["periods"]["1"]["pts"] == 2
    assert by_id[1]["periods"]["1"]["ast"] == 1
    assert by_id[1]["periods"]["2"]["fga"] == 1
    assert by_id[2]["periods"]["1"]["fg3m"] == 1
    assert [p["label"] for p in result["periods"]] == ["Q1", "Q2"]
