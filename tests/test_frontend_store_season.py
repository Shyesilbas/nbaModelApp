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


def test_incremental_pbp_moments_reuses_unchanged_games(tmp_path, monkeypatch):
    import json
    from types import SimpleNamespace
    from src.frontend_store import pbp_moments

    monkeypatch.setattr(store, "STORE_DIR", tmp_path / "store")
    monkeypatch.setattr(builders, "ROOT", tmp_path)

    pbp_dir = tmp_path / "data" / "season=2026-27" / "raw" / "play_by_play"
    pbp_dir.mkdir(parents=True)
    for gid in ("0022600001", "0022600002"):
        (pbp_dir / f"{gid}.json").write_text(
            json.dumps({"game_id": gid, "home_team": "HOM", "away_team": "AWY", "quarter_scores": [], "events": []}),
            encoding="utf-8",
        )

    monkeypatch.setattr(builders, "finals_winner", lambda s: None)
    monkeypatch.setattr(builders, "build_games_feed", lambda s: pd.DataFrame())
    monkeypatch.setattr(builders, "_boxscores", lambda s, k: pd.DataFrame())
    monkeypatch.setattr(builders, "_roster", lambda s: pd.DataFrame())
    monkeypatch.setattr(builders, "_analysis_csv", lambda s, n: pd.DataFrame())
    monkeypatch.setattr(
        builders,
        "get_data_paths",
        lambda s: SimpleNamespace(game_results=str(tmp_path / "missing_results.csv")),
    )
    monkeypatch.setattr(
        builders,
        "build_player_season",
        lambda s, p, r: {"games": {}, "averages": {}, "index": {}},
    )

    condensed = []
    orig_condense = pbp_moments.condense_payload

    def tracked_condense(payload):
        condensed.append(payload["game_id"])
        return orig_condense(payload)

    monkeypatch.setattr(pbp_moments, "condense_payload", tracked_condense)

    builders.build_season_store("2026-27", force=True)
    assert sorted(condensed) == ["0022600001", "0022600002"]

    condensed.clear()
    # Update only the second PBP file; the first must be reused without calling condense_payload.
    (pbp_dir / "0022600002.json").write_text(
        json.dumps({"game_id": "0022600002", "home_team": "HOM", "away_team": "AWY", "quarter_scores": [{"quarter": "Q1"}], "events": []}),
        encoding="utf-8",
    )
    builders.build_season_store("2026-27", force=True)
    assert condensed == ["0022600002"]

    conn = store.connect_ro(store.season_db_path("2026-27"))
    try:
        rows = dict(conn.execute("SELECT game_id, data_json FROM pbp_moments").fetchall())
    finally:
        conn.close()
    assert set(rows) == {"0022600001", "0022600002"}
    assert json.loads(rows["0022600002"])["quarter_scores"] == [{"quarter": "Q1"}]


def test_normalize_game_matchups_sparse_conflict():
    from src.processing.cleaning import normalize_game_matchups

    df = pd.DataFrame([
        {"GAME_ID": "0022600001", "TEAM_ABBREVIATION": "BOS", "MATCHUP": "BOS vs. NYK"},
        {"GAME_ID": "0022600001", "TEAM_ABBREVIATION": "NYK", "MATCHUP": "NYK @ BOS"},
        {"GAME_ID": "0022600002", "TEAM_ABBREVIATION": "DAL", "MATCHUP": "DAL @ DET"},
        {"GAME_ID": "0022600002", "TEAM_ABBREVIATION": "DET", "MATCHUP": "DAL @ DET"},
    ])
    out = normalize_game_matchups(df)
    assert out["IS_HOME"].tolist() == [True, False, False, True]
    assert out["NORMALIZED_MATCHUP"].tolist() == [
        "BOS vs. NYK", "NYK @ BOS", "DAL @ DET", "DET vs. DAL",
    ]
