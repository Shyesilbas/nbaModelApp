"""Baselines, per-season stability and playoff calibration with confidence intervals for the all-season walk-forward predictions."""
from pathlib import Path

import numpy as np
import pandas as pd

from src.core.data_paths import team_training_csv
from src.features.continuous_elo import HOME_COURT_ADVANTAGE
from src.features.win_strength_features import add_win_strength_features

OUT = Path(__file__).resolve().parents[1]
SEASONS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]
rng = np.random.default_rng(7)

pred = pd.read_csv(OUT / "per_game_predictions.csv", dtype={"GAME_ID": str})
pred["TYPE"] = pred.GAME_ID.str[:3].map({"002": "Regular season", "005": "Play-in", "004": "Playoffs"})

frames = []
for s in SEASONS:
    t = pd.read_csv(team_training_csv(s), dtype={"GAME_ID": str})
    t["GAME_DATE"] = pd.to_datetime(t["GAME_DATE"], errors="coerce")
    t = add_win_strength_features(t)
    t["GAME_ID"] = t.GAME_ID.str.split(".").str[0].str.zfill(10)
    h = t[t.IS_HOME == 1][["GAME_ID", "ELO_DIFF", "WINRATE_LAST_10", "PTS_LAST_10", "PTS_ALLOWED_LAST_10", "OPP_PTS_LAST_10", "OPP_PTS_ALLOWED_LAST_10"]].copy()
    h["_S"] = s
    frames.append(h)
feat = pd.concat(frames)
d = pred.merge(feat, on="GAME_ID", how="left")
print("games", len(d), "missing baseline features", int(d.ELO_DIFF.isna().sum()))

# baselines known before each test season
d["P_ELO"] = 1 / (1 + 10 ** (-(d.ELO_DIFF + HOME_COURT_ADVANTAGE) / 400))
d["P_L10"] = d.WINRATE_LAST_10.fillna(0.5).clip(0.01, 0.99)
d["BASE_TOTAL_L10"] = (d.PTS_LAST_10 + d.PTS_ALLOWED_LAST_10 + d.OPP_PTS_LAST_10 + d.OPP_PTS_ALLOWED_LAST_10) / 2
# simple constant baselines from all strictly earlier test-season games (2021-22 falls back to its own training-season rate: 0.5 / 220 not needed, mark NaN)
def const_for(season):
    prior = pred[pred.SEASON < season]
    if prior.empty:
        return np.nan, np.nan
    return prior.HOME_WIN.mean(), prior.REAL_TOTAL.mean()

rows_c = [const_for(s) for s in d.SEASON]
d["P_CONST"] = [r[0] for r in rows_c]
d["BASE_TOTAL_CONST"] = [r[1] for r in rows_c]

def ll(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))

y = d.HOME_WIN.values
for name, col in [("MODEL", "P_HOME_WIN"), ("ELO", "P_ELO"), ("L10", "P_L10"), ("CONST", "P_CONST")]:
    d[f"BR_{name}"] = (d[col] - y) ** 2
    d[f"LL_{name}"] = ll(y, d[col].values)
    d[f"AC_{name}"] = ((d[col] > 0.5) == (y == 1)).astype(float)
for name, col in [("MODEL", "PRED_TOTAL"), ("L10", "BASE_TOTAL_L10"), ("CONST", "BASE_TOTAL_CONST")]:
    d[f"AE_{name}"] = (d[col] - d.REAL_TOTAL).abs()
    d[f"SE_{name}"] = (d[col] - d.REAL_TOTAL) ** 2

md = ["# Baselines, season stability and playoff calibration\n",
      "Walk-forward predictions 2021-22..2025-26 (`per_game_predictions.csv`). Baselines: Elo + home court (`ELO_DIFF` + home advantage), last-10 win rate, constant home-win rate / mean total of all earlier test seasons (not available for 2021-22), last-10 real points (both teams' scoring and allowing).\n"]


def season_table(g):
    out = {}
    for s, x in g.groupby("SEASON"):
        out[s] = {"games": len(x),
                  "acc MODEL": x.AC_MODEL.mean(), "acc ELO": x.AC_ELO.mean(), "acc home-always": y[x.index].mean() if False else x.HOME_WIN.mean(),
                  "Brier MODEL": x.BR_MODEL.mean(), "Brier ELO": x.BR_ELO.mean(), "Brier L10": x.BR_L10.mean(), "Brier CONST": x.BR_CONST.mean(),
                  "LL MODEL": x.LL_MODEL.mean(), "LL ELO": x.LL_ELO.mean(), "LL CONST": x.LL_CONST.mean()}
    out["ALL"] = {"games": len(g), "acc MODEL": g.AC_MODEL.mean(), "acc ELO": g.AC_ELO.mean(), "acc home-always": g.HOME_WIN.mean(),
                  "Brier MODEL": g.BR_MODEL.mean(), "Brier ELO": g.BR_ELO.mean(), "Brier L10": g.BR_L10.mean(), "Brier CONST": g.BR_CONST.mean(),
                  "LL MODEL": g.LL_MODEL.mean(), "LL ELO": g.LL_ELO.mean(), "LL CONST": g.LL_CONST.mean()}
    return pd.DataFrame(out).T


md += ["## 1. WIN per season (all game types)\n", season_table(d).round(4).to_markdown(), "\n"]
md += ["## 1b. WIN per season, regular season only\n", season_table(d[d.TYPE == "Regular season"]).round(4).to_markdown(), "\n"]


def total_table(g):
    out = {}
    for s, x in list(g.groupby("SEASON")) + [("ALL", g)]:
        out[s] = {"games": len(x), "MAE MODEL": x.AE_MODEL.mean(), "MAE L10": x.AE_L10.mean(), "MAE CONST": x.AE_CONST.mean(),
                  "RMSE MODEL": np.sqrt(x.SE_MODEL.mean()), "RMSE L10": np.sqrt(x.SE_L10.mean()), "RMSE CONST": np.sqrt(x.SE_CONST.mean())}
    return pd.DataFrame(out).T


md += ["## 1c. TOTAL points per season (MAE / RMSE; CONST = mean total of earlier test seasons)\n", total_table(d).round(3).to_markdown(), "\n"]


def boot_ci(diff, n=4000):
    diff = np.asarray(diff)
    idx = rng.integers(0, len(diff), (n, len(diff)))
    m = diff[idx].mean(axis=1)
    return diff.mean(), np.percentile(m, 2.5), np.percentile(m, 97.5)


rows = []
for s, x in list(d.groupby("SEASON")) + [("ALL", d)]:
    for label, a, b in [("Brier MODEL-ELO", "BR_MODEL", "BR_ELO"), ("LogLoss MODEL-ELO", "LL_MODEL", "LL_ELO"), ("Total MAE MODEL-L10", "AE_MODEL", "AE_L10"), ("Total RMSE^2 MODEL-L10", "SE_MODEL", "SE_L10")]:
        m, lo, hi = boot_ci((x[a] - x[b]).values)
        rows.append({"season": s, "metric (negative = model better)": label, "mean diff": m, "ci95 low": lo, "ci95 high": hi, "significant": bool(hi < 0 or lo > 0)})
md += ["## 1d. Paired bootstrap 95% CI of the model minus baseline difference\n", pd.DataFrame(rows).round(4).to_markdown(index=False), "\n"]

# 3. playoff calibration
d["CONF"] = np.maximum(d.P_HOME_WIN, 1 - d.P_HOME_WIN)


def wilson(k, n, z=1.96):
    if n == 0:
        return (np.nan, np.nan)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - h, c + h


def conf_table(g, edges=(0.5, 0.6, 0.7, 0.8, 1.01), labels=("0.50-0.60", "0.60-0.70", "0.70-0.80", "0.80+")):
    g = g.assign(B=pd.cut(g.CONF, list(edges), labels=list(labels), right=False))
    r = []
    for b, x in g.groupby("B", observed=True):
        k, n = int(x.AC_MODEL.sum()), len(x)
        lo, hi = wilson(k, n)
        r.append({"band": b, "games": n, "accuracy": k / n, "ci95 low": lo, "ci95 high": hi, "mean_conf": x.CONF.mean(), "inside CI": bool(lo <= x.CONF.mean() <= hi)})
    return pd.DataFrame(r)


po = d[d.TYPE == "Playoffs"]
reg = d[d.TYPE == "Regular season"]
md += ["## 3. Playoff confidence calibration\n", "### Playoffs, all seasons pooled (Wilson 95% CI)\n", conf_table(po).round(3).to_markdown(index=False), "\n",
       "### Regular season, same bands (reference)\n", conf_table(reg).round(3).to_markdown(index=False), "\n"]
rows = []
for s, x in po.groupby("SEASON"):
    hi = x[x.CONF >= 0.7]
    k, n = int(hi.AC_MODEL.sum()), len(hi)
    lo_, hi_ = wilson(k, n)
    rows.append({"season": s, "playoff games": len(x), "accuracy": x.AC_MODEL.mean(), "games conf>=0.70": n, "acc conf>=0.70": k / n if n else np.nan, "ci95 low": lo_, "ci95 high": hi_, "mean conf>=0.70": hi.CONF.mean()})
md += ["### Playoffs per season, conf >= 0.70\n", pd.DataFrame(rows).round(3).to_markdown(index=False), "\n"]
hi = po[po.CONF >= 0.7]
rhi = reg[reg.CONF >= 0.7]
k, n = int(hi.AC_MODEL.sum()), len(hi)
lo_, hi_ = wilson(k, n)
gap = hi.AC_MODEL - hi.CONF
m, glo, ghi = boot_ci(gap.values)
md += [f"Playoffs conf >= 0.70 pooled: {n} games, accuracy {k / n:.3f} (95% CI {lo_:.3f}-{hi_:.3f}), mean confidence {hi.CONF.mean():.3f}; accuracy minus confidence {m:+.3f} (bootstrap CI {glo:+.3f} to {ghi:+.3f}). Regular season conf >= 0.70: {len(rhi)} games, accuracy {rhi.AC_MODEL.mean():.3f}, mean confidence {rhi.CONF.mean():.3f}.\n"]
# playoffs vs Elo
md += ["### Playoffs: model vs baselines\n", pd.DataFrame({"games": [len(po)], "Brier MODEL": [po.BR_MODEL.mean()], "Brier ELO": [po.BR_ELO.mean()], "LL MODEL": [po.LL_MODEL.mean()], "LL ELO": [po.LL_ELO.mean()], "acc MODEL": [po.AC_MODEL.mean()], "acc ELO": [po.AC_ELO.mean()]}).round(4).to_markdown(index=False), "\n"]
d_br = boot_ci((po.BR_MODEL - po.BR_ELO).values)
md += [f"Playoff Brier MODEL-ELO: {d_br[0]:+.4f} (95% CI {d_br[1]:+.4f} to {d_br[2]:+.4f}).\n"]

(OUT / "baseline_stability_report.md").write_text("\n".join(md))
print("\n".join(md))
