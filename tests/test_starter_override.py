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


def test_role_model_replaces_fixed_rule_when_fitted():
    import numpy as np
    from src.features.starter_history import RoleMinutesModel

    # minutes = 0 + 1.0 * base + 5 * started: a starter is a shift, not a floor
    model = RoleMinutesModel(coef=np.array([0.0, 1.0, 5.0, 0.0, 0.0]))
    assert model.minutes(1, 10.0, True) == 15.0
    assert model.minutes(1, 30.0, False) == 30.0
    assert RoleMinutesModel().minutes(1, 30.0, True) is None  # unfitted: caller keeps the fixed rule

    ov = {2: _entry(is_starter=False), 9: _entry(is_starter=True)}
    fixed = redistribute_usage_and_minutes(_roster(), ov).set_index("PLAYER_ID")["PROJ_MIN"]
    learned = redistribute_usage_and_minutes(_roster(), ov, role_model=model).set_index("PLAYER_ID")["PROJ_MIN"]
    assert learned[9] < fixed[9]  # a 10-minute player flagged starter gets 15, not the 26 floor
    assert learned[2] > fixed[2]  # the benched 30-minute player keeps 30, not the 22 cap


def test_role_model_fit_and_fallback_on_small_data():
    from src.features.starter_history import fit_role_model
    gids = [f"00226000{i:02d}" for i in range(4)]
    starters = pd.DataFrame({"Game_ID": gids, "Player_ID": [7] * 4, "IS_STARTER": [1] * 4})
    games = pd.DataFrame({"Game_ID": gids, "Player_ID": [7] * 4, "GAME_DATE": "2026-10-20", "MIN": [32.0] * 4})
    assert fit_role_model(starters, games).coef is None  # too little data: the fixed rule stays
