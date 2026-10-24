"""Which parts of the game score carry the gain? Drop-one and add-one ablations on the shipped setup.

Groups: scoring (PTS), shooting efficiency (0.4 FGM - 0.7 FGA - 0.4 missed FT), rebounds (0.7 OREB + 0.3 DREB),
playmaking (0.7 AST), defense (STL + 0.7 BLK), discipline (-0.4 PF - TOV). Every variant is mapped to the mean and
spread of the full game score of its season, so the replacement level and shrink prior stay comparable.
Setup = shipped: carried Elo weight 0.75, level term 30, 2 seasons, games-played shrink.
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import rating_quality_exp as Q  # noqa: E402
import roster_elo_exp as R  # noqa: E402
from player_rating_exp import z  # noqa: E402
from src.features.continuous_elo import build_season_opening_elo  # noqa: E402

GROUPS = ["scoring", "shooting", "rebounds", "playmaking", "defense", "discipline"]


def add_components(df):
    df["c_scoring"] = df.PTS
    df["c_shooting"] = 0.4 * df.FGM - 0.7 * df.FGA - 0.4 * (df.FTA - df.FTM)
    df["c_rebounds"] = 0.7 * df.OREB + 0.3 * df.DREB
    df["c_playmaking"] = 0.7 * df.AST
    df["c_defense"] = df.STL + 0.7 * df.BLK
    df["c_discipline"] = -0.4 * df.PF - df.TOV
    full = df[[f"c_{g}" for g in GROUPS]].sum(axis=1) * 1.8 + 8.0
    df["full"] = full
    return df


def variant_score(df, groups):
    raw = df[[f"c_{g}" for g in groups]].sum(axis=1)
    return (raw - raw.mean()) / raw.std() * df["full"].std() + df["full"].mean()


def main():
    pg = {s: add_components(Q.load(s)) for s in R.SEASONS}
    tgs = {s: R.team_games(s) for s in R.SEASONS}
    test = R.SEASONS[1:]
    base = {s: build_season_opening_elo(R.SEASONS[:R.SEASONS.index(s)]) for s in test}
    variants = {"full": GROUPS, "none (no talent term)": None}
    for g in GROUPS:
        variants[f"drop {g}"] = [x for x in GROUPS if x != g]
    for g in GROUPS[1:]:
        variants[f"scoring + {g}"] = ["scoring", g]
    variants["scoring only"] = ["scoring"]
    rows = []
    for name, groups in variants.items():
        if groups is not None:
            frames = {}
            for s, df in pg.items():
                d = df.copy()
                d["V"] = variant_score(d, groups)
                frames[s] = d
        for s in test:
            op = dict(base[s])
            if groups is None:
                op = {t: 1500 + 0.75 * (v - 1500) for t, v in op.items()}
            else:
                rt = Q.ratings(s, frames, "V", "shrink")
                prev, new = R.roster_end(frames[R.SEASONS[R.SEASONS.index(s) - 1]]), R.roster_start(frames[s])
                teams = sorted(set(prev) & set(new))
                lvl = z(pd.Series({t: R.talent(new[t], rt, "star") for t in teams}))
                op = {t: 1500 + 0.75 * (v - 1500) + (30 * lvl[t] if t in lvl.index else 0) for t, v in op.items()}
            ll_all, ll_early, _ = R.score_season(s, op, tgs[s])
            rows.append({"variant": name, "season": s, "ll_all": ll_all, "ll_early": ll_early})
        print(name, flush=True)
    res = pd.DataFrame(rows)
    res.to_csv(R.OUT / "game_score_ablation_by_season.csv", index=False)
    summ = res.groupby("variant")[["ll_all", "ll_early"]].mean()
    piv = res.pivot(index="season", columns="variant", values="ll_early")
    summ["d_early_vs_full"] = summ["ll_early"] - summ.loc["full", "ll_early"]
    summ["seasons_better_than_full"] = [(piv[v] < piv["full"]).sum() for v in summ.index]
    summ = summ.sort_values("ll_early").round(5)
    summ.to_csv(R.OUT / "game_score_ablation_summary.csv")
    print(summ.to_string())


if __name__ == "__main__":
    main()
