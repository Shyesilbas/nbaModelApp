"""Schedule-derived game metadata must win over the pregame placeholder row in build_features."""
import contextlib
import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.core.data_paths import get_data_paths
from src.features import build_matchup_features as bmf

SEASON = "2025-26"
HOME, AWAY = "AAA", "BBB"


def _calendar(today, today_type, today_flag, series_winners=(), series_type="Playoffs"):
    """Two regular-season games, optional earlier series games between HOME and AWAY, and today's game."""
    rows = [
        {"GAME_ID": "0022500010", "GAME_DATE": "2026-01-10", "HOME_TEAM_ABBREVIATION": HOME, "AWAY_TEAM_ABBREVIATION": "CCC",
         "SEASON_TYPE": "Regular Season", "IS_PLAYOFF": False, "WINNER_TEAM_ABBREVIATION": HOME, "HOME_SCORE": 110, "AWAY_SCORE": 100},
        {"GAME_ID": "0022500011", "GAME_DATE": "2026-01-11", "HOME_TEAM_ABBREVIATION": "CCC", "AWAY_TEAM_ABBREVIATION": AWAY,
         "SEASON_TYPE": "Regular Season", "IS_PLAYOFF": False, "WINNER_TEAM_ABBREVIATION": AWAY, "HOME_SCORE": 100, "AWAY_SCORE": 105},
    ]
    start = pd.Timestamp(today) - pd.Timedelta(days=2 * len(series_winners))
    for i, winner in enumerate(series_winners):
        rows.append({"GAME_ID": f"00425004{i:02d}", "GAME_DATE": (start + pd.Timedelta(days=2 * i)).strftime("%Y-%m-%d"),
                     "HOME_TEAM_ABBREVIATION": HOME, "AWAY_TEAM_ABBREVIATION": AWAY, "SEASON_TYPE": series_type, "IS_PLAYOFF": True,
                     "WINNER_TEAM_ABBREVIATION": winner, "HOME_SCORE": 100, "AWAY_SCORE": 100})
    if today_type is not None:
        rows.append({"GAME_ID": "0042500499", "GAME_DATE": today, "HOME_TEAM_ABBREVIATION": HOME, "AWAY_TEAM_ABBREVIATION": AWAY,
                     "SEASON_TYPE": today_type, "IS_PLAYOFF": today_flag, "WINNER_TEAM_ABBREVIATION": np.nan,
                     "HOME_SCORE": np.nan, "AWAY_SCORE": np.nan})
    return pd.DataFrame(rows)


def _placeholder(team, date, stale_playoff, stale_type, stale_elim=0):
    """What the pregame rows hold for an unplayed game: training-code defaults, not the schedule."""
    return pd.Series({"GAME_ID": "PREGAME000", "GAME_DATE": pd.Timestamp(date), "TEAM_ABBREVIATION": team,
                      "IS_PLAYOFF": stale_playoff, "SEASON_TYPE": stale_type, "IS_ELIMINATION_GAME": stale_elim,
                      "CAN_CLINCH_SERIES": stale_elim, "PACE_LAST_10": 101.5 if team == HOME else 97.5,
                      "DAYS_REST": 2.0, "WINRATE_LAST_10": 0.5})


@pytest.fixture
def harness(monkeypatch, tmp_path):
    """build_features on synthetic inputs; every data loader is replaced, nothing is read from data/."""
    cols = tmp_path / "win_features.json"
    cols.write_text(json.dumps(["IS_HOME", "IS_B2B", "PACE_LAST_10"]))
    monkeypatch.setattr(bmf, "MODEL_FEATURE_COLS", cols)

    def run(today, calendar, stale_playoff=False, stale_type="Regular Season", stale_elim=0, team_is_home=True):
        team_rows = pd.DataFrame([
            {"GAME_ID": "0022500010", "GAME_DATE": "2026-01-10", "TEAM_ABBREVIATION": HOME, "PACE_LAST_10": 100.0},
            {"GAME_ID": "0022500011", "GAME_DATE": "2026-01-11", "TEAM_ABBREVIATION": AWAY, "PACE_LAST_10": 98.0},
        ])

        def only_current(frame):
            def load(season=None):
                if season != SEASON:
                    raise FileNotFoundError(season)
                return frame.copy()
            return load

        monkeypatch.setattr(bmf, "_load_team_features", only_current(team_rows))
        monkeypatch.setattr(bmf, "_load_game_results", only_current(calendar))
        monkeypatch.setattr(bmf, "_load_combined_schedule", lambda season=None: pd.DataFrame())
        monkeypatch.setattr(bmf, "_raw_season_games", lambda season: pd.DataFrame())
        monkeypatch.setattr(bmf, "compute_current_elo_state", lambda *a, **k: {})
        monkeypatch.setattr(bmf, "_prior_season_team_form", lambda season: {})
        monkeypatch.setattr(bmf, "_load_player_games", lambda season=None: pd.DataFrame())
        monkeypatch.setattr(bmf, "_load_absence_logs", lambda season: pd.DataFrame())
        monkeypatch.setattr(bmf, "live_absence_delta", lambda *a, **k: 0.0)
        monkeypatch.setattr(bmf, "current_roster_ids", lambda *a, **k: None)
        monkeypatch.setattr(bmf, "pregame_team_rows", lambda season, pred_dt, vh, va, full: {
            (HOME, vh, va): _placeholder(HOME, today, stale_playoff, stale_type, stale_elim),
            (AWAY, vh, va): _placeholder(AWAY, today, stale_playoff, stale_type, stale_elim),
        })
        team, opp = (HOME, AWAY) if team_is_home else (AWAY, HOME)
        with contextlib.redirect_stdout(io.StringIO()):
            return bmf.build_features(team, opp, today, season=SEASON, team_is_home=team_is_home)

    return run


def test_playoff_game_overrides_stale_placeholder(harness):
    f = harness("2026-04-25", _calendar("2026-04-25", "Playoffs", True))
    assert f["IS_PLAYOFF"] == 1 and f["SEASON_TYPE"] == "Playoffs"
    assert f["OPP_IS_PLAYOFF"] == 1 and f["OPP_SEASON_TYPE"] == "Playoffs"
    # unrelated fields keep their existing source (the pregame row)
    assert f["PACE_LAST_10"] == 101.5 and f["DAYS_REST"] == 2.0


def test_away_view_gets_the_same_playoff_flag(harness):
    f = harness("2026-04-25", _calendar("2026-04-25", "Playoffs", True), team_is_home=False)
    assert f["IS_PLAYOFF"] == 1 and f["IS_HOME"] == 0


def test_play_in_game_is_playoff_without_series_context(harness):
    f = harness("2026-04-15", _calendar("2026-04-15", "PlayIn", True))
    assert f["IS_PLAYOFF"] == 1 and f["SEASON_TYPE"] == "Playoffs"
    assert f["IS_ELIMINATION_GAME"] == 0 and f["CAN_CLINCH_SERIES"] == 0


def test_finals_game_carries_series_state(harness):
    cal = _calendar("2026-06-12", "NBA Finals", True, series_winners=(HOME, AWAY, HOME, AWAY, HOME), series_type="NBA Finals")
    f = harness("2026-06-12", cal)
    assert f["IS_PLAYOFF"] == 1 and f["SEASON_TYPE"] == "Playoffs"
    assert f["HOME_SERIES_WINS"] == 3 and f["AWAY_SERIES_WINS"] == 2
    assert f["IS_ELIMINATION_GAME"] == 1 and f["CAN_CLINCH_SERIES"] == 1


def test_regular_season_game_is_unchanged(harness):
    f = harness("2026-01-20", _calendar("2026-01-20", "Regular Season", False))
    assert f["IS_PLAYOFF"] == 0 and f["SEASON_TYPE"] == "Regular Season"
    assert f["IS_ELIMINATION_GAME"] == 0 and f["HOME_SERIES_WINS"] == 0 and f["AWAY_SERIES_WINS"] == 0


@pytest.mark.parametrize("today,expected", [("2026-05-10", 1), ("2026-01-20", 0)])
def test_missing_calendar_row_falls_back_to_month(harness, today, expected):
    f = harness(today, _calendar(today, None, None))
    assert f["IS_PLAYOFF"] == expected


@pytest.mark.parametrize("season_type,expected", [("Regular Season", 0), ("Playoffs", 1)])
def test_missing_calendar_flag_uses_season_type(harness, season_type, expected):
    cal = _calendar("2026-04-25", season_type, np.nan)
    cal["IS_PLAYOFF"] = cal["IS_PLAYOFF"].astype(object)
    f = harness("2026-04-25", cal)
    assert f["IS_PLAYOFF"] == expected


def test_calendar_wins_over_conflicting_placeholder(harness):
    f = harness("2026-01-20", _calendar("2026-01-20", "Regular Season", False),
                stale_playoff=True, stale_type="Playoffs", stale_elim=1)
    assert f["IS_PLAYOFF"] == 0 and f["SEASON_TYPE"] == "Regular Season"
    assert f["IS_ELIMINATION_GAME"] == 0 and f["CAN_CLINCH_SERIES"] == 0
    assert f["OPP_IS_PLAYOFF"] == 0 and f["OPP_IS_ELIMINATION_GAME"] == 0


def test_series_metadata_overrides_placeholder(harness):
    cal = _calendar("2026-05-02", "Playoffs", True, series_winners=(HOME, HOME, AWAY, HOME))
    f = harness("2026-05-02", cal, stale_playoff=False, stale_elim=0)
    assert f["HOME_SERIES_WINS"] == 3 and f["AWAY_SERIES_WINS"] == 1
    assert f["IS_ELIMINATION_GAME"] == 1 and f["CAN_CLINCH_SERIES"] == 1
    assert f["OPP_IS_ELIMINATION_GAME"] == 1 and f["OPP_CAN_CLINCH_SERIES"] == 1


REAL_DATA = all(Path(getattr(get_data_paths(SEASON), a)).exists() for a in ("game_results", "team_games_raw", "team_features"))


@pytest.mark.skipif(not REAL_DATA, reason="2025-26 season files not available locally")
@pytest.mark.parametrize("home,away,date,expected", [
    ("SAS", "NYK", "2026-06-05", 1),   # NBA Finals
    ("CHA", "MIA", "2026-04-14", 1),   # play-in
    ("OKC", "HOU", "2025-10-21", 0),   # regular season
])
def test_real_2025_26_games(home, away, date, expected):
    cal = bmf._load_game_results(SEASON)
    row = cal[(cal["HOME_TEAM_ABBREVIATION"] == home) & (cal["AWAY_TEAM_ABBREVIATION"] == away) & (cal["GAME_DATE"].astype(str).str[:10] == date)]
    if row.empty:
        pytest.skip(f"{home}-{away} {date} not in the local calendar")
    with contextlib.redirect_stdout(io.StringIO()):
        f = bmf.build_features(home, away, date, season=SEASON)
    assert f["IS_PLAYOFF"] == expected
    assert (f["SEASON_TYPE"] == "Playoffs") == bool(expected)
