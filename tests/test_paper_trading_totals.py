from src.api.services.paper_trading import build_record, grade
from src.ingestion.sportsgameodds import total_window


def _window(line):
    return total_window(line, {line: {"over": -110, "under": -110}})


def _record(pred_home, pred_away, line=None):
    rec = build_record("0022600001", "2026-10-20", "2026-10-20T19:00:00Z", "DET", "BOS", "v11",
                       0.6, pred_home, pred_away, total_line=line, total_window_rungs=_window(line) if line else None)
    return rec


def _grade(rec, home, away, closing=None):
    results = {"0022600001": {"home_team": "DET", "away_team": "BOS", "home_score": home, "away_score": away}}
    odds = {"0022600001": {"total_line_close": closing, "total_window": _window(closing)}} if closing else None
    return grade([rec], results, odds)[0]


def test_window_has_five_rungs_around_line():
    assert [r["line"] for r in _window(230.5)] == [228.5, 229.5, 230.5, 231.5, 232.5]


def test_over_lean_reached_when_model_and_game_clear_lowest_rung():
    row = _grade(_record(120, 114), 120, 112, closing=233.5)
    assert row["total_lean"] == "over" and row["total_lean_hit"] is True
    assert row["total_line_source"] == "closing"


def test_over_lean_missed_when_game_falls_below_lowest_rung():
    row = _grade(_record(120, 114), 110, 112, closing=233.5)
    assert row["total_lean_hit"] is False and row["line_bet_won"] is False


def test_under_lean_uses_highest_rung():
    row = _grade(_record(110, 112), 120, 113, closing=225.5)
    assert row["total_lean"] == "under"
    assert row["total_lean_hit"] is False
    row = _grade(_record(110, 112), 115, 114, closing=225.5)
    assert row["total_lean_hit"] is False
    row = _grade(_record(110, 112), 112, 112, closing=225.5)
    assert row["total_lean_hit"] is True


def test_frozen_snapshot_line_wins_over_closing():
    row = _grade(_record(120, 114, line=232.5), 118, 112, closing=240.5)
    assert row["total_line_source"] == "snapshot" and row["total_line_ref"] == 232.5
