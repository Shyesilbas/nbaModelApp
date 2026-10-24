"""How much of the opening Elo should be carried-over Elo vs player-rating talent?

opening = 1500 + w * (chained Elo - 1500) + k_level * z(talent level) + k_change * z(talent change)
w = 1: carried Elo only (+ talent terms); w = 0: pure player-rating team strength.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import roster_elo_exp as R  # noqa: E402
from player_rating_exp import WEIGHTS, z  # noqa: E402
from src.features.continuous_elo import build_season_opening_elo  # noqa: E402


def terms(season, pg, weights, avail=False):
    rating = R.ratings_before(season, pg, weights)
    prev, new = R.roster_end(pg[R.SEASONS[R.SEASONS.index(season) - 1]]), R.roster_start(pg[season])
    teams = sorted(set(prev) & set(new))
    t_new = pd.Series({t: R.talent(new[t], rating, "star") for t in teams})
    t_prev = pd.Series({t: R.talent(prev[t], rating, "star") for t in teams})
    return z(t_new), z(t_new - t_prev)


def main():
    pg = {s: R.load_player_games(s) for s in R.SEASONS}
    tgs = {s: R.team_games(s) for s in R.SEASONS}
    test = R.SEASONS[1:]
    base = {s: build_season_opening_elo(R.SEASONS[:R.SEASONS.index(s)]) for s in test}
    tm = {s: terms(s, pg, WEIGHTS["2s"]) for s in test}
    rows = []
    for w in (1.0, 0.75, 0.5, 0.25, 0.0):
        for k_l in (0, 10, 20, 30, 45, 60):
            for k_c in (0, 15):
                if w == 1.0 and k_l == 0 and k_c == 0:
                    pass
                for s in test:
                    lvl, chg = tm[s]
                    op = {t: 1500 + w * (v - 1500) for t, v in base[s].items()}
                    for t in lvl.index:
                        if t in op:
                            op[t] += k_l * lvl[t] + k_c * chg[t]
                    ll_all, ll_early, _ = R.score_season(s, op, tgs[s])
                    rows.append({"w": w, "k_level": k_l, "k_change": k_c, "season": s, "ll_all": ll_all, "ll_early": ll_early})
        print("w", w, flush=True)
    res = pd.DataFrame(rows)
    res.to_csv(R.OUT / "talent_only_by_season.csv", index=False)
    s = res.groupby(["w", "k_level", "k_change"])[["ll_all", "ll_early"]].mean().round(5)
    s.to_csv(R.OUT / "talent_only_summary.csv")
    ref = res[(res.w == 1.0) & (res.k_level == 0) & (res.k_change == 0)].set_index("season").ll_early
    print("no talent term, carried only:", round(ref.mean(), 5))
    print(s.sort_values("ll_early").head(12).to_string())
    print(s.loc[0.0].to_string())


if __name__ == "__main__":
    main()
