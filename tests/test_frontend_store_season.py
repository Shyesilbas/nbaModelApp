from types import SimpleNamespace

import pandas as pd

from src.frontend_store import builders, season_status, store


def _team_games(tmp_path, finals_wins):
    """Finals games of 2025-26 (GAME_ID 0042500401...) with the given W counts per team."""
    rows, game = [], 1
    for team, wins in finals_wins.items():
        for _ in range(wins):
            gid = f"00425004{game:02d}"
            rows += [dict(GAME_ID=gid, TEAM_ABBREVIATION=team, WL="W"), dict(GAME_ID=gid, TEAM_ABBREVIATION="OPP", WL="L")]
            game += 1
    rows.append(dict(GAME_ID="0022500001", TEAM_ABBREVIATION="NYK", WL="W"))  # regular season, ignored
    path = tmp_path / "team_games.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


def _patch_paths(monkeypatch, path):
    monkeypatch.setattr(season_status, "get_data_paths", lambda season: SimpleNamespace(team_games_raw=str(path)))


def test_season_closes_on_fourth_finals_win(tmp_path, monkeypatch):
    _patch_paths(monkeypatch, _team_games(tmp_path, {"NYK": 3, "SAS": 3}))
    assert season_status.season_status("2025-26") == season_status.ACTIVE

    _patch_paths(monkeypatch, _team_games(tmp_path, {"NYK": 4, "SAS": 3}))
    assert season_status.finals_winner("2025-26") == "NYK"
    assert season_status.season_status("2025-26") == season_status.CLOSED


def test_missing_raw_games_means_active(tmp_path, monkeypatch):
    _patch_paths(monkeypatch, tmp_path / "missing.csv")
    assert season_status.season_status("2027-28") == season_status.ACTIVE


def _write_meta(season, **meta):
    with store.build_db(store.season_db_path(season), store.SEASON_SCHEMA) as conn:
        conn.executemany("INSERT INTO meta VALUES (?, ?)", list(meta.items()))


def test_only_closed_stores_of_the_current_version_are_sealed(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STORE_DIR", tmp_path)
    _write_meta("2024-25", status="closed", store_version=store.STORE_VERSION)
    _write_meta("2025-26", status="closed", store_version="old")
    _write_meta("2026-27", status="active", store_version=store.STORE_VERSION)

    assert builders.season_store_is_current("2024-25")
    assert not builders.season_store_is_current("2025-26")  # builder changed since: rebuild once
    assert not builders.season_store_is_current("2026-27")  # active seasons are always rebuilt
    assert builders.build_season_store("2024-25") is False


def test_failed_build_keeps_the_previous_file(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "STORE_DIR", tmp_path)
    _write_meta("2024-25", status="closed", store_version="keep-me")
    try:
        with store.build_db(store.season_db_path("2024-25"), store.SEASON_SCHEMA) as conn:
            conn.execute("INSERT INTO meta VALUES ('status', 'half-built')")
            raise RuntimeError("source data broke mid-build")
    except RuntimeError:
        pass
    assert store.read_meta(store.season_db_path("2024-25"))["store_version"] == "keep-me"
    assert [p.name for p in tmp_path.iterdir()] == ["season_2024_25.db"]
