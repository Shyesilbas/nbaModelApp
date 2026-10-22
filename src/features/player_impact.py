"""Player impact from stints: ridge regression of stint margin on who was on court (RAPM style).

Each stint is one row. Home players enter as +1 and away players as -1, the target is the home point margin per 48
minutes and rows are weighted by stint seconds. Ridge shrinks every player toward zero, so players with little court
time stay near average. ``cutoff`` keeps the estimate point-in-time: only stints from games strictly before it are used.
"""
from __future__ import annotations

import pandas as pd
from scipy import sparse
from sklearn.linear_model import Ridge

DEFAULT_ALPHA = 3000.0


def _design(stints: pd.DataFrame) -> tuple[sparse.csr_matrix, list[int]]:
    home = stints["HOME_PLAYERS"].str.split("|")
    away = stints["AWAY_PLAYERS"].str.split("|")
    players = sorted({int(p) for row in list(home) + list(away) for p in row})
    index = {p: i for i, p in enumerate(players)}
    rows, cols, vals = [], [], []
    for r, (h, a) in enumerate(zip(home, away)):
        for p in h:
            rows.append(r)
            cols.append(index[int(p)])
            vals.append(1.0)
        for p in a:
            rows.append(r)
            cols.append(index[int(p)])
            vals.append(-1.0)
    return sparse.csr_matrix((vals, (rows, cols)), shape=(len(stints), len(players))), players


def fit_impact(stints: pd.DataFrame, alpha: float = DEFAULT_ALPHA, cutoff=None, min_seconds: int = 1) -> pd.Series:
    """Impact per player in points per 48 minutes above an average player, indexed by PLAYER_ID.

    ``stints`` needs HOME_PLAYERS, AWAY_PLAYERS, SECONDS, HOME_PTS, AWAY_PTS and, when ``cutoff`` is given, GAME_DATE.
    """
    data = stints
    if cutoff is not None:
        data = data[pd.to_datetime(data["GAME_DATE"]) < pd.Timestamp(cutoff)]
    data = data[data["SECONDS"] >= min_seconds]
    if data.empty:
        return pd.Series(dtype=float, name="IMPACT")
    X, players = _design(data)
    y = (data["HOME_PTS"] - data["AWAY_PTS"]).to_numpy(dtype=float) / data["SECONDS"].to_numpy(dtype=float) * 2880.0
    model = Ridge(alpha=alpha, fit_intercept=True)
    model.fit(X, y, sample_weight=data["SECONDS"].to_numpy(dtype=float))
    return pd.Series(model.coef_, index=pd.Index(players, name="PLAYER_ID"), name="IMPACT")
