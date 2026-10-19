"""Compare live-replay parquets on the same games.

    python -m scripts.backtest.compare base.parquet new.parquet [more.parquet ...]
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score


def metrics(df: pd.DataFrame) -> dict:
    y = (df["HOME_SCORE"] > df["AWAY_SCORE"]).astype(int)
    p = df["P_HOME_WIN"].clip(1e-6, 1 - 1e-6)
    margin = df["HOME_SCORE"] - df["AWAY_SCORE"]
    pred_margin = df["PRED_HOME"] - df["PRED_AWAY"]
    return {
        "games": len(df),
        "auc": round(roc_auc_score(y, p), 4),
        "brier": round(brier_score_loss(y, p), 4),
        "log_loss": round(log_loss(y, p), 4),
        "win_acc": round(((p > 0.5) == y).mean(), 4),
        "total_mae": round((df["PRED_HOME"] + df["PRED_AWAY"] - df["HOME_SCORE"] - df["AWAY_SCORE"]).abs().mean(), 3),
        "margin_mae": round((pred_margin - margin).abs().mean(), 3),
        "score_winner_acc": round(((pred_margin > 0) == (margin > 0)).mean(), 4),
    }


def main(paths):
    runs = {p: pd.read_parquet(p) for p in paths}
    ok = {p: d[d["P_HOME_WIN"].notna()] if "P_HOME_WIN" in d else d.iloc[0:0] for p, d in runs.items()}
    common = set.intersection(*(set(d["GAME_ID"]) for d in ok.values()))
    start = min(pd.to_datetime(d["GAME_DATE"]).min() for d in runs.values())
    rows = []
    for p, d in runs.items():
        o = ok[p]
        rows.append({"run": p, "subset": "all ok", "failed": int(len(d) - len(o)), **metrics(o)})
        rows.append({"run": p, "subset": "common", **metrics(o[o["GAME_ID"].isin(common)])})
        early = o[o["GAME_ID"].isin(common) & (pd.to_datetime(o["GAME_DATE"]) < start + pd.Timedelta(days=30))]
        if len(early) > 20:
            rows.append({"run": p, "subset": "common, first 30 days", **metrics(early)})
    out = pd.DataFrame(rows)
    print(out.to_string(index=False))
    return out


if __name__ == "__main__":
    main(sys.argv[1:])
