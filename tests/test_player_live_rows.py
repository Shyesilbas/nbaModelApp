import pandas as pd

from src.api.services import player_projection as pp


def _raw(games):
    """Two players per team; AAA hosts BBB on each date. Game ids 0012... are preseason."""
    rows = []
    for gid, date in games:
        for pid, team, opp, home, pts in [(1, "AAA", "BBB", True, 20), (2, "AAA", "BBB", True, 10),
                                          (3, "BBB", "AAA", False, 15), (4, "BBB", "AAA", False, 5)]:
            rows.append(dict(SEASON_ID="22026", Player_ID=pid, Game_ID=gid, GAME_DATE=date, PLAYER_NAME=f"P{pid}",
                             MATCHUP=f"{team} vs. {opp}" if home else f"{team} @ {opp}", SEASON_TYPE="Regular Season",
                             MIN=24.0, FGA=10, FTA=2, TOV=1, PTS=pts, REB=4, AST=3, PLUS_MINUS=0))
    return pd.DataFrame(rows)


def test_season_rows_skip_preseason_and_carry_usage(monkeypatch):
    raw = _raw([("0012600001", "2026-10-05"), ("0022600001", "2026-10-21")])
    monkeypatch.setattr(pp, "_non_preseason_logs", lambda season: raw[~raw["Game_ID"].str.startswith("001")])
    rows = pp.season_rows_from_raw("2026-27")
    assert set(rows["GAME_ID"]) == {"0022600001"}
    assert (rows["GAME_USG_PCT"] > 0).all() and rows["_LIVE_ROW"].all()
    assert rows.loc[rows["PLAYER_ID"] == 1, "GAME_PTS"].item() == 20


def test_opponent_allowance_is_the_mean_of_the_last_games_before_the_date(monkeypatch):
    raw = _raw([("0022600001", "2026-10-21"), ("0022600002", "2026-10-23"), ("0022600003", "2026-10-25")])
    monkeypatch.setattr(pp, "_non_preseason_logs", lambda season: raw if season == "2026-27" else raw.iloc[0:0])
    pp._position_totals.cache_clear()
    meta = pd.DataFrame({"PLAYER_ID": [1, 2, 3, 4], "POSITION_GROUP": ["GUARD", "BIG", "GUARD", "BIG"]})
    monkeypatch.setattr(pp.pd, "read_csv", lambda *a, **k: meta)
    out = pp.opponent_allowance("BBB", pd.Timestamp("2026-10-25"), "2026-27")
    # BBB allowed AAA's guard 20 points in both earlier games; the game on the date itself is excluded
    assert out["OPP_GUARD_PTS_ALLOWED_LAST_10"] == 20 and out["OPP_BIG_PTS_ALLOWED_LAST_10"] == 10
    assert pp.opponent_allowance("BBB", pd.Timestamp("2026-10-21"), "2026-27") == {}
    pp._position_totals.cache_clear()
