"""Walk-forward test of the offseason roster adjustment to the opening Elo.

For each season S (2021-22..2025-26) the opening Elo is the chained rating of earlier seasons
plus an adjustment from roster turnover, built only from information known before S:
player ratings come from seasons < S, the "before" roster is each team's last regular-season
game of S-1, the "after" roster is the team a player appeared for in the first 15 games of S.
The adjusted opening ratings are then run through the Elo engine over season S and scored on
home-win log loss (all games, and games where both teams have played <= 20).
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from src.features.continuous_elo import ContinuousEloEngine, build_season_opening_elo  # noqa: E402

SEASONS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
OUT = Path(__file__).resolve().parents[1]
REPLACEMENT = 20.0
TOP_N = 8


def load_player_games(season):
    df = pd.read_csv(ROOT / f"data/season={season}/raw/player_games.csv", dtype={"Game_ID": str},
                     usecols=["Player_ID", "Game_ID", "GAME_DATE", "MATCHUP", "MIN", "PTS", "AST", "REB"])
    gid = df["Game_ID"].str.split(".").str[0].str.zfill(10)
    df = df[gid.str.startswith("002")].copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df["TEAM"] = df["MATCHUP"].str.split().str[0]
    df["GID"] = gid[df.index]
    df["SCORE"] = df["MIN"] * 0.5 + df["PTS"] + df["AST"] * 0.8 + df["REB"] * 0.6
    return df


def season_stats(df):
    g = df.groupby("Player_ID").agg(GP=("SCORE", "size"), SCORE=("SCORE", "mean"))
    return g[g["GP"] >= 5]


def ratings_before(season, pg, weights):
    """Player rating from earlier seasons: GP x recency weighted mean of per-game importance."""
    idx = SEASONS.index(season)
    num, den = {}, {}
    for k, w in enumerate(weights):
        j = idx - 1 - k
        if j < 0:
            break
        st = season_stats(pg[SEASONS[j]])
        for pid, row in st.iterrows():
            wt = w * min(row["GP"], 70)
            num[pid] = num.get(pid, 0.0) + wt * row["SCORE"]
            den[pid] = den.get(pid, 0.0) + wt
    return {p: num[p] / den[p] for p in num}


def roster_end(df):
    last = df.sort_values("GAME_DATE").groupby("Player_ID").tail(1)
    return last.groupby("TEAM")["Player_ID"].apply(list).to_dict()


def roster_start(df, n_games=15):
    first_games = (df.groupby(["TEAM", "GID"])["GAME_DATE"].first().reset_index()
                   .sort_values("GAME_DATE").groupby("TEAM").head(n_games))
    keep = df.merge(first_games[["TEAM", "GID"]], on=["TEAM", "GID"])
    first = keep.sort_values("GAME_DATE").groupby("Player_ID").head(1)
    return first.groupby("TEAM")["Player_ID"].apply(list).to_dict()


def talent(players, rating, kind):
    r = sorted([rating.get(p, REPLACEMENT) for p in players], reverse=True)[:TOP_N]
    r += [REPLACEMENT] * (TOP_N - len(r))
    r = np.array(r)
    if kind == "flat":
        return float(r.sum())
    if kind == "star":
        return float((r * np.array([1.6, 1.4, 1.2, 1.0, 0.8, 0.7, 0.6, 0.5])).sum())
    if kind == "square":
        return float(((r / 40.0) ** 2).sum() * 40.0)
    raise ValueError(kind)


def adjustment(season, pg, kind, weights, k, clip=45.0):
    rating = ratings_before(season, pg, weights)
    prev, new = roster_end(pg[SEASONS[SEASONS.index(season) - 1]]), roster_start(pg[season])
    teams = sorted(set(prev) & set(new))
    d = pd.Series({t: talent(new[t], rating, kind) - talent(prev[t], rating, kind) for t in teams})
    z = (d - d.mean()) / d.std()
    return (z * k).clip(-clip, clip).to_dict()


def team_games(season):
    df = pd.read_csv(ROOT / f"data/season={season}/raw/team_games.csv", dtype={"GAME_ID": str})
    gid = df["GAME_ID"].str.split(".").str[0].str.zfill(10)
    return df[gid.str.startswith("002")].copy()


def score_season(season, opening, tg):
    eng = ContinuousEloEngine(initial_ratings=dict(opening))
    out = eng.transform_games(tg)
    out = out[out["IS_HOME"].astype(bool)].copy()
    out["Y"] = (out["WL"] == "W").astype(float)
    out = out.sort_values("GAME_DATE")
    n = tg.assign(D=pd.to_datetime(tg["GAME_DATE"])).sort_values("D")
    n["N"] = n.groupby("TEAM_ABBREVIATION").cumcount()
    cnt = n.set_index(["GAME_ID", "TEAM_ABBREVIATION"])["N"]
    out["EARLY"] = [
        max(cnt.get((g, t), 99), cnt.get((g, o), 99)) < 20
        for g, t, o in zip(out["GAME_ID"], out["TEAM_ABBREVIATION"], out["OPPONENT_ABBREVIATION"])
    ] if "OPPONENT_ABBREVIATION" in out else False
    p = out["ELO_EXPECTED_WIN_PROB"].clip(1e-4, 1 - 1e-4)
    ll = -(out["Y"] * np.log(p) + (1 - out["Y"]) * np.log(1 - p))
    return float(ll.mean()), float(ll[out["EARLY"]].mean()), int(out["EARLY"].sum())


def main():
    pg = {s: load_player_games(s) for s in SEASONS}
    tgs = {s: team_games(s) for s in SEASONS}
    test_seasons = SEASONS[1:]
    base = {s: build_season_opening_elo(SEASONS[:SEASONS.index(s)]) for s in test_seasons}
    configs = [("none", None, None, 0)]
    for kind in ("flat", "star", "square"):
        for w_name, w in (("1s", (1.0,)), ("3s", (0.5, 0.3, 0.2))):
            for k in (8, 15, 25):
                configs.append((f"{kind}_{w_name}_k{k}", kind, w, k))
    rows = []
    for name, kind, w, k in configs:
        for s in test_seasons:
            op = dict(base[s])
            if kind:
                for t, a in adjustment(s, pg, kind, w, k).items():
                    if t in op:
                        op[t] += a
            ll_all, ll_early, n_early = score_season(s, op, tgs[s])
            rows.append({"config": name, "season": s, "ll_all": ll_all, "ll_early": ll_early, "n_early": n_early})
        print(name, flush=True)
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "results_by_season.csv", index=False)
    summ = res.groupby("config").agg(ll_all=("ll_all", "mean"), ll_early=("ll_early", "mean"),
                                    worst_early=("ll_early", "max")).sort_values("ll_early")
    none = summ.loc["none"]
    summ["d_early_vs_none"] = summ["ll_early"] - none["ll_early"]
    summ["d_all_vs_none"] = summ["ll_all"] - none["ll_all"]
    wins = res.pivot(index="season", columns="config", values="ll_early")
    summ["seasons_better_early"] = [(wins[c] < wins["none"]).sum() for c in summ.index]
    summ.round(5).to_csv(OUT / "summary.csv")
    print(summ.round(5).to_string())


if __name__ == "__main__":
    main()
