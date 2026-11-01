import numpy as np
import pandas as pd

from src.api.services.usage_redistribution import redistribute_usage_and_minutes
from src.ingestion import nba_injury_report as inj
from src.inference.team_reconciliation import reconciliation_factors, team_reconciliation


def _roster():
    mins = [34, 33, 32, 30, 28, 26, 24, 22, 20, 18]
    return pd.DataFrame({
        "PLAYER_ID": range(1, 11), "PLAYER_NAME": [f"P{i}" for i in range(1, 11)], "TEAM_ABBREVIATION": "AAA",
        "PLAYER_POSITION_GROUP": "WING", "MIN_EMA_10": mins, "USG_PCT_LAST_10": 20.0,
        "RAW_PROJ_PTS": [m * 0.5 for m in mins], "RAW_PROJ_REB": 4.0, "RAW_PROJ_AST": 2.0,
    })


def _run(entry):
    return redistribute_usage_and_minutes(_roster(), {1: entry}).set_index("PLAYER_ID")


def test_report_statuses_are_not_labelled_restricted():
    assert inj.STATUS_LABEL["Questionable"] == "QUESTIONABLE"
    assert inj.STATUS_LABEL["Doubtful"] == "DOUBTFUL"
    assert "RESTRICTED" not in inj.STATUS_LABEL.values()


def test_questionable_player_keeps_his_own_line_but_teammates_gain_the_expected_loss():
    healthy = _run({"status": "ACTIVE", "factor": 1.0})
    questionable = _run({"status": "QUESTIONABLE", "factor": 0.56})
    restricted = _run({"status": "RESTRICTED", "factor": 0.5})
    out = _run({"status": "OUT", "factor": 0.0})

    # his line is the one for a game in which he plays; a restricted starter plays about half
    assert abs(questionable.loc[1, "RAW_PROJ_PTS"] - healthy.loc[1, "RAW_PROJ_PTS"]) < 1.0
    assert restricted.loc[1, "PROJ_MIN"] < 0.7 * healthy.loc[1, "PROJ_MIN"]

    # teammates sit between "he plays" and "he is out"
    mates = slice(2, 10)
    assert (healthy["RAW_PROJ_PTS"].loc[mates].sum()
            < questionable["RAW_PROJ_PTS"].loc[mates].sum()
            < out["RAW_PROJ_PTS"].loc[mates].sum())


def test_doubtful_hands_over_almost_everything_but_keeps_a_line():
    doubtful = _run({"status": "DOUBTFUL", "factor": 0.05})
    out = _run({"status": "OUT", "factor": 0.0})
    assert doubtful.loc[1, "RAW_PROJ_PTS"] > 0
    gap = out["RAW_PROJ_PTS"].loc[2:10].sum() - doubtful["RAW_PROJ_PTS"].loc[2:10].sum()
    assert 0 <= gap < 1.0


def test_reconciliation_counts_questionable_as_playing_and_uses_the_reported_probability():
    pts = pd.Series([28.0, 20.0, 12.0])
    mins = pd.Series([35.0, 32.0, 30.0])
    base = reconciliation_factors(pts, mins, 55.0)
    uncertain = reconciliation_factors(pts, mins, 55.0, [np.nan, np.nan, 0.3])
    assert uncertain[2] < base[2]
    assert abs((pts * uncertain).sum() - 55.0) < 1e-6

    df = _roster().assign(STATUS="ACTIVE", PLAY_PROB=np.nan)
    df.loc[0, ["STATUS", "PLAY_PROB"]] = ["QUESTIONABLE", 0.56]
    factors, _ = team_reconciliation(df, 90.0)
    assert factors[0] != 1.0 or factors[1:].min() < 1.0  # the questionable player takes part in the cut
