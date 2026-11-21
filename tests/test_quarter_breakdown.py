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


def _lineup_game_and_box(box_minutes):
    """One 12-minute period: home player 5 is replaced by player 6 at 06:00, nobody else moves."""
    home = [(i, f"Home Player{i}") for i in range(1, 7)]
    away = [(i, f"Away Guy{i}") for i in range(11, 16)]

    def ev(clock, action, pid, team, desc=""):
        return {"period": 1, "clock": clock, "action_type": action, "player_id": pid, "team": team, "description": desc}

    events = [ev("11:30", "Rebound", pid, "HOM" if pid < 10 else "AWY") for pid in (1, 2, 3, 4, 5, 11, 12, 13, 14, 15)]
    events.append(ev("06:00", "Substitution", 5, "HOM", "SUB: Player6 FOR Player5"))
    payload = {"game_id": "0022600001", "home_team": "HOM", "away_team": "AWY", "quarter_scores": [], "events": events}
    box = [
        {"PLAYER_ID": pid, "PLAYER_NAME": name, "TEAM_ABBREVIATION": team, "MIN": box_minutes.get(pid, 12.0)}
        for team, roster in (("HOM", home), ("AWY", away))
        for pid, name in roster
    ]
    return payload, box


def test_period_seconds_come_from_rebuilt_lineups_and_add_silent_players():
    payload, box = _lineup_game_and_box({5: 6.0, 6: 6.0})
    result = build_quarter_breakdown(payload, box)
    by_id = {p["player_id"]: p for p in result["players"]}
    assert result["minutes_available"] is True
    assert by_id[1]["periods"]["1"]["sec"] == 720
    assert by_id[5]["periods"]["1"]["sec"] == 360
    # Player 6 has no stat event of his own but played the last six minutes.
    assert by_id[6]["name"] == "Home Player6"
    assert by_id[6]["periods"]["1"]["sec"] == 360
    assert by_id[6]["periods"]["1"]["pts"] == 0


def test_period_seconds_are_withheld_without_box_score_or_when_minutes_disagree():
    payload, box = _lineup_game_and_box({5: 6.0, 6: 6.0})
    plain = build_quarter_breakdown(payload)
    assert plain["minutes_available"] is False
    assert all("sec" not in row for p in plain["players"] for row in p["periods"].values())

    _, wrong_box = _lineup_game_and_box({pid: 30.0 for pid in range(1, 16)})
    assert build_quarter_breakdown(payload, wrong_box)["minutes_available"] is False
