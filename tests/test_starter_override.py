import pandas as pd

from src.api.services.usage_redistribution import redistribute_usage_and_minutes


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

    # promoted reserve: 17 + 0.5*base, benched starter: 5 + 0.65*base; rate 0 = usual reserve, 1 = usual starter
    model = RoleMinutesModel(coef=np.array([17.0, 0.5, 5.0, 0.65]), rates={1: 0.0, 2: 1.0, 3: 1.0, 4: 0.0})
    assert abs(model.minutes(1, 10.0, True) - 22.0) < 1e-9    # promoted: not the 26 floor
    assert abs(model.minutes(2, 30.0, False) - 24.5) < 1e-9   # benched starter
    assert model.minutes(3, 30.0, True) == 30.0               # usual starter starting: baseline
    assert model.minutes(4, 12.0, False) == 12.0              # usual reserve on the bench: baseline
    assert RoleMinutesModel().minutes(1, 30.0, True) is None  # unfitted: caller keeps the fixed rule

    ov = {2: _entry(is_starter=False), 9: _entry(is_starter=True)}
    fixed = redistribute_usage_and_minutes(_roster(), ov).set_index("PLAYER_ID")["PROJ_MIN"]
    learned = redistribute_usage_and_minutes(_roster(), ov, role_model=model).set_index("PLAYER_ID")["PROJ_MIN"]
    assert learned[9] < fixed[9]  # a 10-minute reserve flagged starter gets ~22, not the 26 floor
    assert learned[2] > fixed[2]  # a benched usual starter drops to ~27, not to the 22 cap


def test_role_model_fit_and_fallback_on_small_data():
    from src.features.starter_history import fit_role_model
    gids = [f"00226000{i:02d}" for i in range(4)]
    starters = pd.DataFrame({"Game_ID": gids, "Player_ID": [7] * 4, "IS_STARTER": [1] * 4})
    games = pd.DataFrame({"Game_ID": gids, "Player_ID": [7] * 4, "GAME_DATE": "2026-10-20", "MIN": [32.0] * 4})
    assert fit_role_model(starters, games).coef is None  # too little data: the fixed rule stays
