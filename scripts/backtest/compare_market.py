"""Model vs closing market on the same games (market is a yardstick, not a feature).

    python -m scripts.backtest.compare_market preds.parquet [--book PINNACLE]

preds.parquet needs GAME_ID, HOME_SCORE, AWAY_SCORE, P_HOME_WIN, PRED_HOME, PRED_AWAY
(the layout scripts.backtest.compare already uses).
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("preds")
    ap.add_argument("--book", default="PINNACLE")
    a = ap.parse_args()
    p = pd.read_parquet(a.preds)
    p["GAME_ID"] = p["GAME_ID"].astype(str).str.zfill(10)
    m = pd.read_csv(ROOT / "data/odds/nba_market_lines.csv", dtype={"GAME_ID": str})
    b = a.book
    cols = ["GAME_ID", f"P_HOME_NOVIG_{b}", f"SPREAD_HOME_{b}_CLOSE_LINE", f"TOTAL_{b}_CLOSE_LINE"]
    d = p.merge(m[cols], on="GAME_ID").dropna(subset=cols[1:])
    y = (d["HOME_SCORE"] > d["AWAY_SCORE"]).astype(int)
    margin = d["HOME_SCORE"] - d["AWAY_SCORE"]
    total = d["HOME_SCORE"] + d["AWAY_SCORE"]
    mk_p = d[f"P_HOME_NOVIG_{b}"].clip(1e-6, 1 - 1e-6)
    md_p = d["P_HOME_WIN"].clip(1e-6, 1 - 1e-6)
    mkt_margin = -d[f"SPREAD_HOME_{b}_CLOSE_LINE"]  # home -5.5 means home favored by 5.5
    rows = {
        "model": dict(brier=brier_score_loss(y, md_p), logloss=log_loss(y, md_p), auc=roc_auc_score(y, md_p),
                      margin_mae=(margin - (d["PRED_HOME"] - d["PRED_AWAY"])).abs().mean(),
                      total_mae=(total - (d["PRED_HOME"] + d["PRED_AWAY"])).abs().mean()),
        b.lower(): dict(brier=brier_score_loss(y, mk_p), logloss=log_loss(y, mk_p), auc=roc_auc_score(y, mk_p),
                        margin_mae=(margin - mkt_margin).abs().mean(),
                        total_mae=(total - d[f"TOTAL_{b}_CLOSE_LINE"]).abs().mean()),
    }
    print(f"games compared: {len(d)}")
    print(pd.DataFrame(rows).T.round(4).to_string())


if __name__ == "__main__":
    main()
