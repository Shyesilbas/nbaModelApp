from datetime import datetime, timezone

from src.api.services import paper_trading as pt


def _rec(gid, p, created="2026-10-22T15:00:00+00:00", start="2026-10-22T23:00:00Z", hs=110, as_=100):
    return pt.build_record(gid, "2026-10-22", start, "BOS", "NYK", "v11", p, hs, as_,
                           now=datetime.fromisoformat(created))


def test_append_is_first_write_wins(tmp_path):
    assert pt.append_records("2026-27", [_rec("22600001", 0.7)], tmp_path) == 1
    assert pt.append_records("2026-27", [_rec("22600001", 0.2), _rec("22600002", 0.6)], tmp_path) == 1
    rows = pt.read_ledger("2026-27", tmp_path)
    assert [r["game_id"] for r in rows] == ["0022600001", "0022600002"]
    assert rows[0]["home_win_probability"] == 0.7


def test_grade_and_summary():
    results = {
        "0022600001": {"home_team": "BOS", "away_team": "NYK", "home_score": 105, "away_score": 99},
        "0022600002": {"home_team": "BOS", "away_team": "NYK", "home_score": 90, "away_score": 100},
    }
    recs = [_rec("22600001", 0.7), _rec("22600002", 0.8), _rec("22600003", 0.6)]
    graded = pt.grade(recs, results)
    assert [g["status"] for g in graded] == ["final", "final", "pending"]
    assert [g["correct"] for g in graded[:2]] == [True, False]
    s = pt.summarize(graded)
    assert s["games_graded"] == 2 and s["games_pending"] == 1
    assert s["accuracy"] == 0.5
    assert s["brier"] == round(((0.7 - 1) ** 2 + (0.8 - 0) ** 2) / 2, 4)
    assert s["mae_margin"] == round((abs(10 - 6) + abs(10 - -10)) / 2, 2)


def test_record_made_after_tipoff_is_not_counted():
    late = _rec("22600001", 0.9, created="2026-10-22T23:30:00+00:00")
    results = {"0022600001": {"home_team": "BOS", "away_team": "NYK", "home_score": 105, "away_score": 99}}
    s = pt.summarize(pt.grade([late], results))
    assert s["games_graded"] == 0 and s["invalid_late"] == 1 and s["accuracy"] is None
