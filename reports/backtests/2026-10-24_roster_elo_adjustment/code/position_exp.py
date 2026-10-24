"""Position-relative game score: rebounds, assists, steals/blocks measured against the player's position group.

GUARD / WING / BIG from data/reference/player_metadata.csv (UNKNOWN -> WING). A stat is replaced by
stat - MIN x (group total stat / group total MIN) of the same season, i.e. production above a typical
player of that position in the same minutes. Shipped setup (carried 0.75, level 30, 2 seasons, shrink).
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import game_score_ablation as G  # noqa: E402
import rating_quality_exp as Q  # noqa: E402
import roster_elo_exp as R  # noqa: E402
from player_rating_exp import z  # noqa: E402
from src.features.continuous_elo import build_season_opening_elo  # noqa: E402

META = R.ROOT / "data/reference/player_metadata.csv"


def add_position(df, pos):
    df = G.add_components(df)
    df["POS"] = df["Player_ID"].map(pos).fillna("WING")
    mins = df.groupby("POS")["MIN"].transform("sum")

    def rel(col):
        return df[col] - df["MIN"] * df.groupby("POS")[col].transform("sum") / mins

    df["REB_T"] = df["OREB"] + df["DREB"]
    for c in ("REB_T", "AST", "STL", "BLK", "PTS"):
        df[f"rel_{c}"] = rel(c)
    df["rel_rebounds"] = 0.7 * rel("OREB") + 0.3 * rel("DREB")
    df["rel_playmaking"] = 0.7 * df["rel_AST"]
    df["rel_defense"] = df["rel_STL"] + 0.7 * df["rel_BLK"]
    return df


def score(df, kind):
    base = df[["c_scoring", "c_shooting", "c_discipline"]].sum(axis=1)
    if kind == "full":
        raw = df[[f"c_{g}" for g in G.GROUPS]].sum(axis=1)
    elif kind == "rel_reb_ast_def":
        raw = base + df["rel_rebounds"] + df["rel_playmaking"] + df["rel_defense"]
    elif kind == "rel_reb_ast":
        raw = base + df["rel_rebounds"] + df["rel_playmaking"] + df["c_defense"]
    elif kind == "full_plus_rel_reb_ast":
        raw = df[[f"c_{g}" for g in G.GROUPS]].sum(axis=1) + 0.6 * df["rel_REB_T"] + 0.8 * df["rel_AST"]
    elif kind == "rel_all":
        raw = (df["rel_PTS"] + df["c_shooting"] + df["rel_rebounds"] + df["rel_playmaking"] + df["rel_defense"]
               + df["c_discipline"])
    else:
        raise ValueError(kind)
    return (raw - raw.mean()) / raw.std() * df["full"].std() + df["full"].mean()


def main():
    meta = pd.read_csv(META)
    pos = dict(zip(meta.PLAYER_ID, meta.POSITION_GROUP.replace("UNKNOWN", "WING").fillna("WING")))
    pg = {s: add_position(Q.load(s), pos) for s in R.SEASONS}
    tgs = {s: R.team_games(s) for s in R.SEASONS}
    test = R.SEASONS[1:]
    base = {s: build_season_opening_elo(R.SEASONS[:R.SEASONS.index(s)]) for s in test}
    rows = []
    for kind in ("full", "rel_reb_ast_def", "rel_reb_ast", "full_plus_rel_reb_ast", "rel_all"):
        frames = {}
        for s, df in pg.items():
            d = df.copy()
            d["V"] = score(d, kind)
            frames[s] = d
        for s in test:
            rt = Q.ratings(s, frames, "V", "shrink")
            prev, new = R.roster_end(frames[R.SEASONS[R.SEASONS.index(s) - 1]]), R.roster_start(frames[s])
            teams = sorted(set(prev) & set(new))
            lvl = z(pd.Series({t: R.talent(new[t], rt, "star") for t in teams}))
            op = {t: 1500 + 0.75 * (v - 1500) + (30 * lvl[t] if t in lvl.index else 0) for t, v in base[s].items()}
            ll_all, ll_early, _ = R.score_season(s, op, tgs[s])
            rows.append({"variant": kind, "season": s, "ll_all": ll_all, "ll_early": ll_early})
        print(kind, flush=True)
    res = pd.DataFrame(rows)
    res.to_csv(R.OUT / "position_by_season.csv", index=False)
    summ = res.groupby("variant")[["ll_all", "ll_early"]].mean()
    piv = res.pivot(index="season", columns="variant", values="ll_early")
    summ["d_early_vs_full"] = summ["ll_early"] - summ.loc["full", "ll_early"]
    summ["seasons_better_than_full"] = [(piv[v] < piv["full"]).sum() for v in summ.index]
    summ = summ.sort_values("ll_early").round(5)
    summ.to_csv(R.OUT / "position_summary.csv")
    print(summ.to_string())


if __name__ == "__main__":
    main()
