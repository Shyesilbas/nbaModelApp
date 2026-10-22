"""Compare player value ratings as the weight inside an ABS_DELTA style absence feature.

Ratings: GS (production Hollinger game score), IMP (IMPORTANCE_SCORE formula), FANTASY, PM (shrunk raw plus-minus),
ONOFF (plus-minus minus the minutes share of the team margin, shrunk). Same rotation / presence rule as
src/features/roster_absence.py; only the per-game value changes. Reports split-half stability of each rating and
the walk-forward WIN Brier when ABS_DIFF is swapped for the variant.

Run: PYTHONPATH=. python3 reports/backtests/2026-10-22_recency_weight/code/rating_compare.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd

from scripts.walk_forward_benchmark import SEASONS, load_dataset
from src.features.roster_absence import MIN_HISTORY_GAMES, MIN_ROTATION_MINUTES, WINDOW, _prepare

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("rw", Path(__file__).with_name("recency_weight_exp.py"))
rw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rw)


def load_logs() -> pd.DataFrame:
    frames = []
    for s in SEASONS:
        pg = pd.read_csv(ROOT / f"data/season={s}/raw/player_games.csv")
        tg = pd.read_csv(ROOT / f"data/season={s}/raw/team_games.csv", usecols=["GAME_ID", "TEAM_ABBREVIATION", "PLUS_MINUS"])
        d = _prepare(pg)
        tg["GAME_ID"] = tg["GAME_ID"].astype(str).str.zfill(10)
        tg = tg.rename(columns={"PLUS_MINUS": "TEAM_MARGIN"})
        d = d.merge(tg, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
        d["PM"] = pd.to_numeric(d["PLUS_MINUS"], errors="coerce").fillna(0.0)
        d["TEAM_MARGIN"] = d["TEAM_MARGIN"].fillna(0.0)
        for c in ("REB", "AST", "STL", "BLK", "TOV"):
            d[c] = pd.to_numeric(d[c], errors="coerce").fillna(0.0)
        d["IMP"] = 0.5 * d["MIN"] + d["PTS"] + 0.8 * d["AST"] + 0.6 * d["REB"]
        d["FANTASY"] = d["PTS"] + 1.2 * d["REB"] + 1.5 * d["AST"] + 3 * d["STL"] + 3 * d["BLK"] - d["TOV"]
        d["ONOFF"] = d["PM"] - d["MIN"] / 48.0 * d["TEAM_MARGIN"]
        frames.append(d)
    return pd.concat(frames, ignore_index=True)


SHRINK = {"GS": 0, "IMP": 0, "FANTASY": 0, "PM": 8, "ONOFF": 8}  # pseudo-games of zero value added to the average


def deltas(d: pd.DataFrame, val: str) -> pd.DataFrame:
    k = SHRINK[val]
    out = []
    for (_, team), g in d.groupby(["_season", "TEAM_ABBREVIATION"]):
        ids = g.groupby("GAME_ID")["GAME_DATE"].first().sort_values(kind="stable").index
        piv = lambda c: g.pivot_table(index="GAME_ID", columns="Player_ID", values=c, aggfunc="sum").reindex(ids)
        played, v = piv("MIN"), piv(val)
        on = played.notna().astype(float).fillna(0.0)
        mins, vv = played.fillna(0.0), v.fillna(0.0)
        roll = lambda f: f.shift(1).rolling(WINDOW, min_periods=1).sum()
        n = pd.Series(np.minimum(np.arange(len(ids)), WINDOW), index=ids, dtype=float)
        gp, msum, vsum = roll(on), roll(mins), roll(vv)
        presence = gp.div(n.replace(0, np.nan), axis=0)
        rotation = msum.div(gp.replace(0, np.nan)) >= MIN_ROTATION_MINUTES
        avg = vsum.div((gp + k).replace(0, np.nan))
        delta = ((on - presence) * avg).where(rotation).sum(axis=1)
        delta[n < MIN_HISTORY_GAMES] = 0.0
        out.append(pd.DataFrame({"GAME_ID": ids, "TEAM_ABBREVIATION": team, val + "_DELTA": delta.values}))
    return pd.concat(out, ignore_index=True)


def split_half(d: pd.DataFrame, val: str) -> float:
    """Correlation of a player's per-game rating between odd and even games (players with 40+ games, 15+ min)."""
    x = d[d["MIN"] >= 15].copy()
    x["k"] = x.groupby(["_season", "Player_ID"]).cumcount() % 2
    g = x.groupby(["_season", "Player_ID", "k"])[val].agg(["mean", "count"]).unstack("k").dropna()
    g = g[(g[("count", 0)] >= 20) & (g[("count", 1)] >= 20)]
    return float(np.corrcoef(g[("mean", 0)], g[("mean", 1)])[0, 1])


def main() -> None:
    d = load_logs()
    print("split-half stability (higher = steadier rating):")
    for v in SHRINK:
        print(f"  {v:8s}{split_half(d, v):7.3f}")

    data = load_dataset()
    data["GAME_ID"] = data["GAME_ID"].astype(str).str.zfill(10)
    for v in SHRINK:
        dl = deltas(d, v)
        data = data.merge(dl, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
        opp = dl.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", v + "_DELTA": "O" + v + "_DELTA"})
        data = data.merge(opp, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="left")
        data[v + "_DIFF"] = data[v + "_DELTA"].fillna(0.0) - data["O" + v + "_DELTA"].fillna(0.0)

    wf = [f for f in json.loads((ROOT / "models/production/win_features.json").read_text()) if f in data.columns]
    no_abs = [f for f in wf if f != "ABS_DIFF"]
    variants = {
        "no absence feature": no_abs,
        "production ABS_DIFF": wf,
        "GS (recomputed)": no_abs + ["GS_DIFF"],
        "IMP": no_abs + ["IMP_DIFF"],
        "FANTASY": no_abs + ["FANTASY_DIFF"],
        "PM": no_abs + ["PM_DIFF"],
        "ONOFF": no_abs + ["ONOFF_DIFF"],
        "GS + ONOFF": no_abs + ["GS_DIFF", "ONOFF_DIFF"],
        "GS + FANTASY": no_abs + ["GS_DIFF", "FANTASY_DIFF"],
    }
    seasons = sorted(data["_SEASON"].unique())
    rec = []
    for idx, ts in enumerate(seasons[1:], start=1):
        tr, te = data[data["_SEASON"].isin(seasons[:idx])], data[data["_SEASON"] == ts]
        for name, feats in variants.items():
            a = tr[tr["IS_HOME"] == 1].dropna(subset=feats + ["WIN"])
            b = te[te["IS_HOME"] == 1].dropna(subset=feats + ["WIN"])
            p = rw.win_model().fit(a[feats], a["WIN"].astype(int)).predict_proba(b[feats])[:, 1]
            for gid, e in zip(b["GAME_ID"], (p - b["WIN"].astype(int).to_numpy()) ** 2):
                rec.append((name, ts, gid, e))
    df = pd.DataFrame(rec, columns=["variant", "season", "game", "sq"])
    base = df[df.variant == "production ABS_DIFF"].set_index("game")["sq"]
    print(f"\n{'variant':22s}{'Brier':>8s}{'vs prod':>10s}{'se':>8s}{'last3':>8s}")
    for name in variants:
        g = df[df.variant == name]
        diff = (g.set_index("game")["sq"] - base).dropna()
        l3 = g[g.season >= "2023-24"]["sq"].mean()
        print(f"{name:22s}{g['sq'].mean():8.4f}{diff.mean():+10.4f}{diff.std() / np.sqrt(len(diff)):8.4f}{l3:8.4f}")


if __name__ == "__main__":
    main()
