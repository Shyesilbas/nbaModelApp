import numpy as np
import pandas as pd

from src.features.player_form import add_player_matchup_features


def test_opponent_allowance_follows_player_position():
    row = {f"OPP_{g}_{s}_ALLOWED_LAST_10": v for g, v in [("GUARD", 1.0), ("WING", 2.0), ("BIG", 3.0)] for s in ("PTS", "REB", "AST")}
    df = pd.DataFrame([{**row, "PLAYER_POSITION_GROUP": p} for p in ["GUARD", "big", None]])

    out = add_player_matchup_features(df)

    assert out["OPP_POS_PTS_ALLOWED_LAST_10"].tolist() == [1.0, 3.0, 2.0]  # missing position falls back to WING
    assert out["IS_GUARD"].tolist() == [1, 0, 0] and out["IS_BIG"].tolist() == [0, 1, 0]


def test_missing_opponent_columns_become_nan_not_error():
    out = add_player_matchup_features(pd.DataFrame({"PLAYER_POSITION_GROUP": ["WING"]}))

    assert np.isnan(out.loc[0, "OPP_POS_REB_ALLOWED_LAST_10"])
