import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
from app.services.usage_redistribution import redistribute_usage_and_minutes  # noqa: E402


def _roster():
    mins = [34, 32, 30, 28, 26, 22, 18, 14, 10, 8]
    return pd.DataFrame({
        "PLAYER_ID": range(1, 11),
        "PLAYER_NAME": [f"P{i}" for i in range(1, 11)],
        "TEAM_ABBREVIATION": "AAA",
        "MIN_EMA_10": mins,
        "RAW_PROJ_PTS": [m * 0.5 for m in mins],
        "RAW_PROJ_REB": 4.0,
        "RAW_PROJ_AST": 3.0,
    })


def _proj(overrides):
    out = redistribute_usage_and_minutes(_roster(), overrides)
    return out.set_index("PLAYER_ID")["PROJ_MIN"]


def _entry(**kw):
    return {"status": "ACTIVE", "factor": 1.0, "minute_limit": None, **kw}


def test_no_starter_override_is_unchanged():
    assert _proj({}).equals(_proj({1: _entry(is_starter=None)}))


def test_bench_role_lowers_minutes_and_others_absorb_them():
    base, bench = _proj({}), _proj({1: _entry(is_starter=False)})
    assert bench[1] < base[1]
    assert bench[2] > base[2]
    assert abs(bench.sum() - 240.0) < 0.6


def test_starter_role_raises_minutes():
    base, starter = _proj({}), _proj({9: _entry(is_starter=True)})
    assert starter[9] > base[9]


def test_benched_player_lowers_team_availability_like_restricted():
    from src.features.roster_absence import BENCH_MIN_CAP, _override_availability

    full = {"factor": 1.0}
    assert _override_availability(full, 35.0) == 1.0
    assert _override_availability({**full, "is_starter": True}, 35.0) == 1.0
    assert _override_availability({**full, "is_starter": False}, 35.0) == BENCH_MIN_CAP / 35.0
    assert _override_availability({**full, "is_starter": False}, 15.0) == 1.0  # already a bench-level role
    assert _override_availability({"factor": 0.0, "is_starter": False}, 35.0) == 0.0
