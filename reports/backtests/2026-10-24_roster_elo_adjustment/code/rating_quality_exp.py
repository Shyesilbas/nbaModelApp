"""Does a better player rating (efficiency, availability) improve the roster adjustment to the opening Elo?

Score variants (per game): imp = 0.5 MIN + PTS + 0.8 AST + 0.6 REB; poa = imp + points over league-average
efficiency on the same shots; gs = Hollinger game score. Reliability variants on the player rating:
none; shrink = (GP r + m REPL) / (GP + m); avail = a r + (1 - a) REPL with a = games played share of 82.
Evaluated for two opening setups: shipped (w 1.0, level 10, change 15) and blend (w 0.75, level 30, change 0).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import roster_elo_exp as R  # noqa: E402
from player_rating_exp import z  # noqa: E402
from src.features.continuous_elo import build_season_opening_elo  # noqa: E402

COLS = ["Player_ID", "Game_ID", "GAME_DATE", "MATCHUP", "MIN", "PTS", "AST", "REB", "FGM", "FGA", "FTM", "FTA",
        "OREB", "DREB", "STL", "BLK", "TOV", "PF"]
REPL = 20.0
WEIGHTS = (0.5, 0.5)


def load(season):
    df = pd.read_csv(R.ROOT / f"data/season={season}/raw/player_games.csv", dtype={"Game_ID": str}, usecols=COLS)
    gid = df["Game_ID"].str.split(".").str[0].str.zfill(10)
    df = df[gid.str.startswith("002")].copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["TEAM"] = df["MATCHUP"].str.split().str[0]
    df["GID"] = gid[df.index]
    df = df.fillna({c: 0 for c in COLS[4:]})
    df["imp"] = df.MIN * 0.5 + df.PTS + df.AST * 0.8 + df.REB * 0.6
    tsa = 2 * (df.FGA + 0.44 * df.FTA)
    lg_ts = df.PTS.sum() / tsa.sum()
    df["poa"] = df["imp"] + (df.PTS - lg_ts * tsa)
    gs = (df.PTS + 0.4 * df.FGM - 0.7 * df.FGA - 0.4 * (df.FTA - df.FTM) + 0.7 * df.OREB + 0.3 * df.DREB
          + df.STL + 0.7 * df.AST + 0.7 * df.BLK - 0.4 * df.PF - df.TOV)
    df["gs"] = gs * 1.8 + 8.0  # rescale to the importance range so REPL and weights stay comparable
    return df


def ratings(season, pg, score, rel):
    idx = R.SEASONS.index(season)
    num, den, gp = {}, {}, {}
    for k, w in enumerate(WEIGHTS):
        j = idx - 1 - k
        if j < 0:
            break
        st = pg[R.SEASONS[j]].groupby("Player_ID").agg(GP=(score, "size"), S=(score, "mean"))
        for pid, row in st[st.GP >= 5].iterrows():
            wt = w * min(row.GP, 70)
            num[pid] = num.get(pid, 0.0) + wt * row.S
            den[pid] = den.get(pid, 0.0) + wt
            a, b = gp.get(pid, (0.0, 0.0))
            gp[pid] = (a + w * row.GP, b + w * 82.0)
    out = {}
    for p in num:
        r = num[p] / den[p]
        g, cap = gp[p]
        if rel == "shrink":
            r = (g / sum(WEIGHTS) * r + 20 * REPL) / (g / sum(WEIGHTS) + 20)
        elif rel == "avail":
            a = min(1.0, g / cap)
            r = a * r + (1 - a) * REPL
        out[p] = r
    return out


def main():
    pg = {s: load(s) for s in R.SEASONS}
    tgs = {s: R.team_games(s) for s in R.SEASONS}
    test = R.SEASONS[1:]
    base = {s: build_season_opening_elo(R.SEASONS[:R.SEASONS.index(s)]) for s in test}
    setups = {"shipped": (1.0, 10, 15), "blend": (0.75, 30, 0)}
    rows = []
    for score in ("imp", "poa", "gs"):
        for rel in ("none", "shrink", "avail"):
            for s in test:
                rt = ratings(s, pg, score, rel)
                prev, new = R.roster_end(pg[R.SEASONS[R.SEASONS.index(s) - 1]]), R.roster_start(pg[s])
                teams = sorted(set(prev) & set(new))
                t_new = pd.Series({t: R.talent(new[t], rt, "star") for t in teams})
                t_prev = pd.Series({t: R.talent(prev[t], rt, "star") for t in teams})
                lvl, chg = z(t_new), z(t_new - t_prev)
                for name, (w, k_l, k_c) in setups.items():
                    op = {t: 1500 + w * (v - 1500) for t, v in base[s].items()}
                    for t in lvl.index:
                        if t in op:
                            op[t] += k_l * lvl[t] + k_c * chg[t]
                    ll_all, ll_early, _ = R.score_season(s, op, tgs[s])
                    rows.append({"score": score, "reliability": rel, "setup": name, "season": s,
                                 "ll_all": ll_all, "ll_early": ll_early})
            print(score, rel, flush=True)
    res = pd.DataFrame(rows)
    res.to_csv(R.OUT / "rating_quality_by_season.csv", index=False)
    summ = res.groupby(["setup", "score", "reliability"])[["ll_all", "ll_early"]].mean().round(5)
    piv = res.pivot_table(index=["setup", "score", "reliability"], columns="season", values="ll_early")
    ref = piv.loc[("shipped", "imp", "none")]
    summ["seasons_better_than_shipped_imp"] = [(piv.loc[i] < ref).sum() for i in summ.index]
    summ.to_csv(R.OUT / "rating_quality_summary.csv")
    print(summ.to_string())


if __name__ == "__main__":
    main()
