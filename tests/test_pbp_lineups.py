import pandas as pd

from src.features.player_impact import fit_impact
from src.processing.pbp_lineups import extract_stints, game_quality, player_games_from_stints

HOME = [(i, f"Home Player{i}") for i in range(1, 7)]
AWAY = [(i, f"Away Guy{i}") for i in range(11, 17)]


def _box():
    rows = [{"PLAYER_ID": pid, "PLAYER_NAME": name, "TEAM_ABBREVIATION": "HOM"} for pid, name in HOME]
    rows += [{"PLAYER_ID": pid, "PLAYER_NAME": name, "TEAM_ABBREVIATION": "AWY"} for pid, name in AWAY]
    return pd.DataFrame(rows)


def _event(clock, action, pid, team, desc="", sh=0, sa=0, period=1):
    return {"period": period, "clock": clock, "action_type": action, "player_id": pid, "team": team,
            "description": desc, "score_home": sh, "score_away": sa}


def _game():
    events = [
        _event("12:00", "period", 0, None),
        _event("11:00", "Made Shot", 1, "HOM", sh=2, sa=0),
        _event("10:00", "Made Shot", 11, "AWY", sh=2, sa=3),
        _event("06:00", "Substitution", 5, "HOM", "SUB: Player6 FOR Player5", sh=2, sa=3),
        _event("05:00", "Made Shot", 6, "HOM", sh=4, sa=3),
    ]
    for pid in (1, 2, 3, 4, 5, 11, 12, 13, 14, 15):
        events.append(_event("11:30", "Rebound", pid, "HOM" if pid < 10 else "AWY", sh=0, sa=0))
    events.sort(key=lambda e: e["clock"], reverse=True)
    events.append(_event("00:00", "period", 0, None, sh=4, sa=3))
    return {"game_id": "22400001", "home_team": "HOM", "away_team": "AWY", "events": events}


def test_stints_split_at_substitution_and_resolve_entering_player():
    stints, status = extract_stints(_game(), _box())
    assert status["ok"], status
    assert len(stints) == 2
    first, second = stints
    assert first["HOME_PLAYERS"] == "1|2|3|4|5" and second["HOME_PLAYERS"] == "1|2|3|4|6"
    assert first["SECONDS"] == 360 and second["SECONDS"] == 360
    assert (first["HOME_PTS"], first["AWAY_PTS"]) == (2, 3)
    assert (second["HOME_PTS"], second["AWAY_PTS"]) == (2, 0)


def test_player_games_sum_to_court_time_and_margin():
    stints, _ = extract_stints(_game(), _box())
    pg = player_games_from_stints(pd.DataFrame(stints))
    p1 = pg[pg["PLAYER_ID"] == 1].iloc[0]
    p5 = pg[pg["PLAYER_ID"] == 5].iloc[0]
    assert p1["SECONDS"] == 720 and p1["ON_COURT_MARGIN"] == 1
    assert p5["SECONDS"] == 360 and p5["ON_COURT_MARGIN"] == -1


def test_unresolvable_substitution_marks_game_not_ok():
    game = _game()
    for e in game["events"]:
        if e["action_type"] == "Substitution":
            e["description"] = "SUB: Nobody FOR Player5"
    _, status = extract_stints(game, _box())
    assert not status["ok"]


def test_game_quality_flags_large_errors():
    qc = pd.DataFrame({"GAME_ID": ["a", "a", "b", "b"], "PM_DIFF": [1, -1, 9, 8], "MIN_DIFF": [0.2, 0.3, 0.2, 0.2]})
    q = game_quality(qc).set_index("GAME_ID")
    assert bool(q.loc["a", "USABLE"]) and not bool(q.loc["b", "USABLE"])


def test_fit_impact_ranks_the_player_who_wins_minutes():
    rows = []
    for _ in range(200):
        rows.append({"HOME_PLAYERS": "1|2|3|4|5", "AWAY_PLAYERS": "11|12|13|14|15", "SECONDS": 300, "HOME_PTS": 12, "AWAY_PTS": 6})
        rows.append({"HOME_PLAYERS": "1|2|3|4|6", "AWAY_PLAYERS": "11|12|13|14|15", "SECONDS": 300, "HOME_PTS": 6, "AWAY_PTS": 6})
    impact = fit_impact(pd.DataFrame(rows), alpha=10.0)
    assert impact[5] > impact[6]
