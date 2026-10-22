import pandas as pd

from src.api.services import injury_history as ih
from src.ingestion.nba_injury_report import InjuryReport

TEAM_DATES = ["2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26"]


def test_streak_counts_back_from_the_latest_game_date():
    assert ih._streak({"2026-10-22", "2026-10-24", "2026-10-26"}, TEAM_DATES) == ["2026-10-22", "2026-10-24", "2026-10-26"]


def test_streak_is_broken_by_a_game_he_was_not_listed_for():
    assert ih._streak({"2026-10-20", "2026-10-26"}, TEAM_DATES) == ["2026-10-26"]


def test_streak_is_empty_when_not_listed_at_the_last_game():
    assert ih._streak({"2026-10-20", "2026-10-22"}, TEAM_DATES) == []


def _report(time, rows):
    entries = [{"game_date": "10/22/2026", "game_time": "07:00 (ET)", "matchup": "CLE@PHI", "team": t,
                "player_name": n, "status": st, "reason": ""} for t, n, st in rows]
    return InjuryReport(published_et=time, entries=entries)


def _stub_day(monkeypatch, reports):
    from datetime import datetime, timedelta

    base = datetime(2026, 10, 22, 12, 0, tzinfo=ih.inj.ET)
    urls = [(base + timedelta(hours=i), f"u{i}") for i in range(len(reports))]
    monkeypatch.setattr(ih, "_urls", lambda season: urls)
    monkeypatch.setattr(ih, "_report", lambda url: reports[int(url[1:])])


def test_status_changes_keep_every_step_with_its_report_time(monkeypatch):
    _stub_day(monkeypatch, [
        _report("10/22/26 12:00 PM", [("CLE", "Jarrett Allen", "Out"), ("PHI", "Dean Wade", "Out")]),
        _report("10/22/26 01:00 PM", [("CLE", "Jarrett Allen", "Out"), ("PHI", "Dean Wade", "Out")]),
        _report("10/22/26 02:00 PM", [("CLE", "Jarrett Allen", "Questionable"), ("CLE", "Evan Mobley", "Questionable")]),
    ])
    changes = {c["player_name"]: [(s["status"], s["at"]) for s in c["steps"]]
               for c in ih.status_changes("2026-27", "2026-10-22", game_date="2026-10-22")}
    assert changes == {
        "Jarrett Allen": [("Out", "10/22/26 12:00 PM"), ("Questionable", "10/22/26 02:00 PM")],
        "Dean Wade": [("Out", "10/22/26 12:00 PM"), (None, "10/22/26 02:00 PM")],
        "Evan Mobley": [(None, "10/22/26 12:00 PM"), ("Questionable", "10/22/26 02:00 PM")],
    }


def test_no_changes_with_a_single_report(monkeypatch):
    _stub_day(monkeypatch, [_report("10/22/26 12:00 PM", [("CLE", "Jarrett Allen", "Out")])])
    assert ih.status_changes("2026-27", "2026-10-22", game_date="2026-10-22") == []


def test_unchanged_players_are_left_out(monkeypatch):
    rows = [("CLE", "Jarrett Allen", "Out")]
    _stub_day(monkeypatch, [_report("10/22/26 12:00 PM", rows), _report("10/22/26 01:00 PM", rows)])
    assert ih.status_changes("2026-27", "2026-10-22", game_date="2026-10-22") == []


def test_recent_returns_need_a_serious_listing_and_a_game_after(monkeypatch):
    history = pd.DataFrame([
        {"game_date": "2026-10-20", "team": "PHI", "player_name": "Dean Wade", "status": "Out"},
        {"game_date": "2026-10-22", "team": "PHI", "player_name": "Dean Wade", "status": "Out"},
        {"game_date": "2026-10-20", "team": "PHI", "player_name": "Minor Guy", "status": "Probable"},
    ])
    teams = pd.DataFrame({"TEAM_ABBREVIATION": ["PHI"] * 4,
                          "GAME_DATE": ["2026-10-20", "2026-10-22", "2026-10-24", "2026-10-26"]})
    players = pd.DataFrame([
        {"team": "PHI", "plain": "dean wade", "GAME_DATE": "2026-10-26"},
        {"team": "PHI", "plain": "minor guy", "GAME_DATE": "2026-10-24"},
    ])
    returned = ih.recent_returns("2026-27", "2026-10-27", history, teams, players)
    assert [(r["player_name"], r["returned_on"], r["games_missed"]) for r in returned] == [("Dean Wade", "2026-10-26", 3)]


def test_a_team_that_had_not_filed_is_not_treated_as_available(monkeypatch):
    early = _report("10/22/26 12:00 PM", [])
    early.not_submitted = {("CLE@PHI", "CLE")}
    late = _report("10/22/26 02:00 PM", [("CLE", "Jarrett Allen", "Out")])
    _stub_day(monkeypatch, [early, late])
    assert ih.status_changes("2026-27", "2026-10-22", game_date="2026-10-22") == []
