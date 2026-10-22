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


def test_changes_between_first_and_latest_report(monkeypatch):
    from datetime import datetime

    first = _report("10/22/26 12:00 AM", [("CLE", "Jarrett Allen", "Questionable"), ("PHI", "Dean Wade", "Out")])
    last = _report("10/22/26 04:15 PM", [("CLE", "Jarrett Allen", "Out"), ("CLE", "Evan Mobley", "Questionable")])
    reports = {"u1": first, "u2": last}
    when = datetime(2026, 10, 22, tzinfo=ih.inj.ET)
    monkeypatch.setattr(ih, "_urls", lambda season: [(when, "u1"), (when, "u2")])
    monkeypatch.setattr(ih, "_report", lambda url: reports[url])
    changes = {(c["player_name"]): (c["from"], c["to"]) for c in ih.changes_for_day("2026-27", "2026-10-22")}
    assert changes == {
        "Jarrett Allen": ("Questionable", "Out"),
        "Dean Wade": ("Out", None),
        "Evan Mobley": (None, "Questionable"),
    }


def test_no_changes_with_a_single_report(monkeypatch):
    from datetime import datetime

    when = datetime(2026, 10, 22, tzinfo=ih.inj.ET)
    monkeypatch.setattr(ih, "_urls", lambda season: [(when, "u1")])
    assert ih.changes_for_day("2026-27", "2026-10-22") == []


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
