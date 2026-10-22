import pandas as pd

from src.api.services import auto_status


def _fake_season(tmp_path, monkeypatch, groups=None):
    rows = []
    # Two earlier games for team AAA: players 1-5 start, 6 plays 25 min, 7 plays 10 min, 8 skipped game two.
    for gid, date in (("0022600001", "2026-10-20"), ("0022600002", "2026-10-22")):
        for pid in range(1, 8):
            if pid == 8:
                continue
            minutes = {6: 25.0, 7: 10.0}.get(pid, 30.0)
            rows.append({"Player_ID": pid, "Game_ID": gid, "GAME_DATE": date, "MATCHUP": "AAA vs. BBB", "MIN": minutes})
    rows.append({"Player_ID": 8, "Game_ID": "0022600001", "GAME_DATE": "2026-10-20", "MATCHUP": "AAA vs. BBB", "MIN": 28.0})
    games = tmp_path / "player_games.csv"
    pd.DataFrame(rows).to_csv(games, index=False)
    starters = tmp_path / "player_starters.csv"
    pd.DataFrame([
        {"Game_ID": gid, "Player_ID": pid, "TEAM_ABBREVIATION": "AAA", "IS_STARTER": int(pid <= 5)}
        for gid in ("0022600001", "0022600002") for pid in range(1, 8)
    ]).to_csv(starters, index=False)

    class Paths:
        player_games_raw = str(games)

    monkeypatch.setattr(auto_status, "get_data_paths", lambda season: Paths)
    monkeypatch.setattr(auto_status, "_position_groups", lambda: groups or {})
    monkeypatch.setattr(auto_status, "starters_path", lambda season: starters)


def test_out_starter_is_replaced_by_best_bench_minutes(tmp_path, monkeypatch):
    _fake_season(tmp_path, monkeypatch)
    assert auto_status.starter_replacements("AAA", "2026-10-23", {1}, "2026-27") == [6]


def test_two_out_starters_pull_two_players_and_skip_those_who_missed_the_last_game(tmp_path, monkeypatch):
    _fake_season(tmp_path, monkeypatch)
    assert auto_status.starter_replacements("AAA", "2026-10-23", {1, 2}, "2026-27") == [6, 7]


def test_no_change_when_no_starter_is_out(tmp_path, monkeypatch):
    _fake_season(tmp_path, monkeypatch)
    assert auto_status.starter_replacements("AAA", "2026-10-23", {7}, "2026-27") == []
    assert auto_status.starter_replacements("AAA", "2026-10-23", set(), "2026-27") == []


def test_dates_outside_report_window_get_no_overrides():
    assert auto_status.auto_overrides("PHI", "CLE", "2099-01-01") == (None, None)
    assert auto_status.auto_overrides("PHI", "CLE", "not a date") == (None, None)


def test_replacement_keeps_the_position_group(tmp_path, monkeypatch):
    # starter 1 is a big man; player 6 (most bench minutes) is a guard, player 7 is a big man
    groups = {1: "BIG", 2: "GUARD", 3: "GUARD", 4: "WING", 5: "WING", 6: "GUARD", 7: "BIG"}
    _fake_season(tmp_path, monkeypatch, groups)
    assert auto_status.starter_replacements("AAA", "2026-10-23", {1}, "2026-27") == [7]


def test_replacement_falls_back_to_the_closest_group(tmp_path, monkeypatch):
    # no big man on the bench: a wing is preferred to a guard
    groups = {1: "BIG", 2: "GUARD", 3: "GUARD", 4: "WING", 5: "WING", 6: "GUARD", 7: "WING"}
    _fake_season(tmp_path, monkeypatch, groups)
    assert auto_status.starter_replacements("AAA", "2026-10-23", {1}, "2026-27") == [7]
