"""Season-type report (regular, play-in, playoffs, finals) of the all-season walk-forward predictions."""
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parents[1]
d = pd.read_csv(OUT / "per_game_predictions.csv", dtype={"GAME_ID": str}).sort_values(["GAME_DATE", "GAME_ID"])
kind = d.GAME_ID.str[:3].map({"002": "Regular season", "005": "Play-in", "004": "Playoffs"})
d["TYPE"] = kind
d["ROUND"] = np.where(kind == "Playoffs", d.GAME_ID.str[7], "")

# pseudo line known pre-game: mean real total of the season's regular-season games played before this game
reg = d[d.TYPE == "Regular season"]
line = []
for _, g in d.groupby("SEASON"):
    r = g[g.TYPE == "Regular season"].REAL_TOTAL
    exp = r.expanding().mean().shift(1)
    full = r.mean()
    s = pd.Series(np.where(g.TYPE == "Regular season", exp.reindex(g.index), full), index=g.index)
    line.append(s)
d["LINE"] = pd.concat(line)
d["DEV"] = d.PRED_TOTAL - d.LINE
d["CONF"] = np.maximum(d.P_HOME_WIN, 1 - d.P_HOME_WIN)
d["PICK_HOME"] = (d.P_HOME_WIN > 0.5).astype(int)


def groups():
    yield "Regular season", d[d.TYPE == "Regular season"]
    yield "Play-in", d[d.TYPE == "Play-in"]
    yield "Playoffs (all)", d[d.TYPE == "Playoffs"]
    yield "  Playoffs excl. Finals", d[(d.TYPE == "Playoffs") & (d.ROUND != "4")]
    yield "Finals", d[(d.TYPE == "Playoffs") & (d.ROUND == "4")]
    yield "ALL", d


def total_row(g):
    e = g.TOTAL_ERROR
    return {"games": len(g), "real_total": g.REAL_TOTAL.mean(), "pred_total": g.PRED_TOTAL.mean(), "bias": e.mean(), "MAE": e.abs().mean(),
            "RMSE": np.sqrt((e ** 2).mean()), "within_10": (e.abs() <= 10).mean(), "margin_MAE": g.MARGIN_ERROR.abs().mean(), "OT_share": g.OVERTIME.mean()}


def win_row(g):
    p = g.P_HOME_WIN.clip(1e-6, 1 - 1e-6)
    y = g.HOME_WIN
    return {"games": len(g), "correct": int(g.WIN_CORRECT.sum()), "accuracy": g.WIN_CORRECT.mean(), "always_home_acc": y.mean(),
            "mean_conf": g.CONF.mean(), "brier": ((p - y) ** 2).mean(), "log_loss": -(y * np.log(p) + (1 - y) * np.log(1 - p)).mean()}


def table(fn, frame_iter):
    return pd.DataFrame({name: fn(g) for name, g in frame_iter if len(g)}).T


def band(g, col, edges, labels):
    return pd.cut(g[col], edges, labels=labels, right=False)


md = ["# Season-type report (walk-forward, 2021-22..2025-26)\n", "Source: `per_game_predictions.csv`. Season type from GAME_ID (002 regular, 005 play-in, 004 playoffs; round digit 4 = Finals).\n"]
fmt = lambda t: t.round(3).to_markdown()
md += ["## Total points error (pred - real)\n", fmt(table(total_row, groups())), "\n## Winner (WIN model, pick = P_HOME_WIN > 0.5)\n", fmt(table(win_row, groups())), "\n"]

wedges = [0.5, 0.55, 0.60, 0.70, 0.80, 1.01]
wlabels = ["0.50-0.55 (toss-up)", "0.55-0.60", "0.60-0.70", "0.70-0.80", "0.80+ (confident)"]
md.append("## Winner by confidence (confidence = max(p, 1-p))\n")
for name, g in groups():
    if len(g) < 100 and name != "Play-in" and name != "Finals":
        continue
    g = g.assign(B=band(g, "CONF", wedges, wlabels))
    t = g.groupby("B", observed=True).agg(games=("WIN_CORRECT", "size"), accuracy=("WIN_CORRECT", "mean"), mean_conf=("CONF", "mean"))
    t["gap"] = t.accuracy - t.mean_conf
    md += [f"### {name.strip()}\n", fmt(t), "\n"]

dedges = [0, 3, 6, 10, 100]
dlabels = ["|dev| < 3 (near line)", "3-6", "6-10", "10+ (extreme)"]
md.append("## Total by how far the prediction is from the pre-game line (mean real total of the season's regular-season games; not a bookmaker line)\n")
md.append("direction_acc = share where real total is on the same side of the line as the prediction.\n")
for name, g in groups():
    g = g.assign(ADEV=g.DEV.abs())
    g = g.assign(B=band(g, "ADEV", dedges, dlabels))
    g = g.assign(DIR=((g.PRED_TOTAL > g.LINE) == (g.REAL_TOTAL > g.LINE)).astype(int))
    t = g.groupby("B", observed=True).agg(games=("DIR", "size"), direction_acc=("DIR", "mean"), MAE=("TOTAL_ERROR", lambda x: x.abs().mean()), bias=("TOTAL_ERROR", "mean"))
    md += [f"### {name.strip()}\n", fmt(t), "\n"]

(OUT / "season_type_report.md").write_text("\n".join(md))
print("\n".join(md))
