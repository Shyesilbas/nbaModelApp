"""Player-rating based opening Elo: roster LEVEL vs roster CHANGE, 1/2/3-season player ratings.

opening = chained Elo (existing) + k_d * z(talent change) + k_l * z(talent level)
Talent = star-weighted top-8 of player ratings (rating = GP x recency weighted per-game importance
over seasons before S). Same walk-forward scoring as roster_elo_exp.py.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import roster_elo_exp as R  # noqa: E402
from src.features.continuous_elo import build_season_opening_elo  # noqa: E402

WEIGHTS = {"1s": (1.0,), "2s": (0.5, 0.5), "3s": (0.5, 0.3, 0.2)}


def z(s):
    return (s - s.mean()) / s.std()


def adj(season, pg, weights, k_d, k_l, kind="star", clip=45.0):
    rating = R.ratings_before(season, pg, weights)
    prev, new = R.roster_end(pg[R.SEASONS[R.SEASONS.index(season) - 1]]), R.roster_start(pg[season])
    teams = sorted(set(prev) & set(new))
    t_new = pd.Series({t: R.talent(new[t], rating, kind) for t in teams})
    t_prev = pd.Series({t: R.talent(prev[t], rating, kind) for t in teams})
    out = k_d * z(t_new - t_prev) + k_l * z(t_new)
    return out.clip(-clip, clip).to_dict()


def main():
    pg = {s: R.load_player_games(s) for s in R.SEASONS}
    tgs = {s: R.team_games(s) for s in R.SEASONS}
    test = R.SEASONS[1:]
    base = {s: build_season_opening_elo(R.SEASONS[:R.SEASONS.index(s)]) for s in test}
    configs = [("none", None, 0, 0)]
    for w in WEIGHTS:
        for k_d, k_l in ((15, 0), (0, 5), (0, 10), (0, 15), (15, 5), (15, 10)):
            configs.append((f"{w}_d{k_d}_l{k_l}", w, k_d, k_l))
    rows = []
    for name, w, k_d, k_l in configs:
        for s in test:
            op = dict(base[s])
            if w:
                for t, a in adj(s, pg, WEIGHTS[w], k_d, k_l).items():
                    if t in op:
                        op[t] += a
            ll_all, ll_early, _ = R.score_season(s, op, tgs[s])
            rows.append({"config": name, "season": s, "ll_all": ll_all, "ll_early": ll_early})
    res = pd.DataFrame(rows)
    res.to_csv(R.OUT / "player_rating_by_season.csv", index=False)
    piv = res.pivot(index="season", columns="config", values="ll_early")
    summ = res.groupby("config").agg(ll_all=("ll_all", "mean"), ll_early=("ll_early", "mean"))
    summ["d_early"] = summ["ll_early"] - summ.loc["none", "ll_early"]
    summ["seasons_better"] = [(piv[c] < piv["none"]).sum() for c in summ.index]
    summ = summ.sort_values("ll_early").round(5)
    summ.to_csv(R.OUT / "player_rating_summary.csv")
    print(summ.to_string())


if __name__ == "__main__":
    main()
