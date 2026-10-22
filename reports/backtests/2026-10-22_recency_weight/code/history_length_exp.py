"""Learning curve: train on the last k seasons only, test on the following season.

Run: PYTHONPATH=. python3 reports/backtests/2026-10-22_recency_weight/code/history_length_exp.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, mean_absolute_error

from scripts.walk_forward_benchmark import load_dataset, load_player_dataset
from src.training.player_trainer import PlayerModelTrainer

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("rw", Path(__file__).with_name("recency_weight_exp.py"))
rw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rw)


def main() -> None:
    data = load_dataset()
    pf = joblib.load(ROOT / "models/production/player_features.pkl")
    player = load_player_dataset(pf)
    wf = [f for f in json.loads((ROOT / "models/production/win_features.json").read_text())
          if f in data.columns and f != "SCORE_PRED_MARGIN"]
    meta = json.loads((ROOT / "models/production/score_metadata.json").read_text())
    pace_f, home_f, away_f, margin_f = (meta["pace_features"], meta["home_off_rtg_features"],
                                        meta["away_off_rtg_features"], meta["margin_features"])
    seasons = sorted(data["_SEASON"].unique())
    rows = []
    for ti in range(3, len(seasons)):
        ts = seasons[ti]
        for k in range(1, ti + 1):
            trs = seasons[ti - k:ti]
            tr, te = data[data["_SEASON"].isin(trs)], data[data["_SEASON"] == ts]
            trh = tr[tr["IS_HOME"] == 1].dropna(subset=wf + ["WIN"])
            teh = te[te["IS_HOME"] == 1].dropna(subset=wf + ["WIN"])
            p = rw.win_model().fit(trh[wf], trh["WIN"].astype(int)).predict_proba(teh[wf])[:, 1]
            rows.append((ts, k, "WIN brier", brier_score_loss(teh["WIN"].astype(int), p), len(teh)))
            h, a = tr[tr["IS_HOME"] == 1], tr[tr["IS_HOME"] == 0]
            ht, at = te[te["IS_HOME"] == 1].copy(), te[te["IS_HOME"] == 0]
            ht["PP"] = rw.ridge().fit(h[pace_f], h["PACE"]).predict(ht[pace_f])
            ht["PH"] = rw.ridge().fit(h[home_f], h["OFF_RTG"]).predict(ht[home_f])
            ht["PM"] = rw.ridge().fit(h[margin_f], h["ACTUAL_PTS"] - h["ACTUAL_OPP_PTS"]).predict(ht[margin_f])
            asub = at[["GAME_ID"] + away_f].copy()
            asub["PA"] = rw.ridge().fit(a[away_f], a["OFF_RTG"]).predict(asub[away_f])
            mg = ht.merge(asub[["GAME_ID", "PA"]], on="GAME_ID").dropna(subset=["PP", "PH", "PM", "PA"])
            tot = mg["ACTUAL_PTS"] + mg["ACTUAL_OPP_PTS"]
            rows.append((ts, k, "SCORE total MAE", mean_absolute_error(tot, mg["PP"] * (mg["PH"] + mg["PA"]) / 100), len(mg)))
            rows.append((ts, k, "SCORE margin MAE", mean_absolute_error(mg["ACTUAL_PTS"] - mg["ACTUAL_OPP_PTS"], mg["PM"]), len(mg)))
            ptr, pte = player[player["_SEASON"].isin(trs)], player[player["_SEASON"] == ts]
            for t in ["pts", "reb", "ast"]:
                c = f"TARGET_{t.upper()}"
                x, y = ptr.dropna(subset=[c]), pte.dropna(subset=[c])
                m = PlayerModelTrainer()._model_pipeline(t).fit(x[pf], x[c])
                rows.append((ts, k, f"PLAYER {t.upper()} MAE", mean_absolute_error(y[c], m.predict(y[pf])), len(y)))
        print("done", ts, flush=True)
    df = pd.DataFrame(rows, columns=["test", "k", "metric", "value", "n"])
    out = df.groupby(["metric", "k"]).apply(lambda g: np.average(g["value"], weights=g["n"]), include_groups=False).unstack("k")
    print(out.round(4).to_string())
    print("\nonly test 2025-26:")
    print(df[df.test == "2025-26"].pivot(index="metric", columns="k", values="value").round(4).to_string())


if __name__ == "__main__":
    main()
