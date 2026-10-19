"""Compare walk-forward runs written by scripts/backtest/offline.py.

Metrics are pooled over the test seasons, once on every game a run scored and
once on the games every run scored, so runs with different row filters stay
comparable.

    python -m scripts.backtest.compare_offline runA runB ...
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score


def _load(run: Path, kind: str) -> pd.DataFrame:
    parts = [pd.read_parquet(p) for p in sorted(run.glob(f"{kind}_*.parquet"))]
    df = pd.concat(parts, ignore_index=True)
    df["GAME_ID"] = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    return df


def _win(df):
    y, p = df["HOME_WIN"].astype(int), df["P_HOME_WIN"].clip(1e-6, 1 - 1e-6)
    return {"games": len(df), "auc": roc_auc_score(y, p), "brier": brier_score_loss(y, p),
            "log_loss": log_loss(y, p), "acc": ((p > 0.5) == y).mean()}


def _score(df):
    return {"total_mae": (df["PRED_TOTAL"] - df["REAL_TOTAL"]).abs().mean(),
            "margin_mae": (df["PRED_MARGIN"] - df["REAL_MARGIN"]).abs().mean(),
            "winner_acc": ((df["PRED_MARGIN"] > 0) == (df["REAL_MARGIN"] > 0)).mean()}


def _player(df):
    return {f"{t.lower()}_mae": (df[f"PRED_{t}"] - df[f"REAL_{t}"]).abs().mean() for t in ("PTS", "REB", "AST")} | {"rows": len(df)}


def main(runs):
    runs = [Path(r) for r in runs]
    data = {r: {k: _load(r, k) for k in ("win", "score", "player")} for r in runs}
    common = set.intersection(*(set(d["win"]["GAME_ID"]) for d in data.values()))
    keys = ["GAME_ID", "PLAYER_ID"]
    pcommon = None
    for d in data.values():
        idx = pd.MultiIndex.from_frame(d["player"][keys].astype(str))
        pcommon = idx if pcommon is None else pcommon.intersection(idx)
    rows = []
    for r, d in data.items():
        for subset, games in (("all", None), ("common", common)):
            w = d["win"] if games is None else d["win"][d["win"]["GAME_ID"].isin(games)]
            s = d["score"] if games is None else d["score"][d["score"]["GAME_ID"].isin(games)]
            p = d["player"]
            if games is not None:
                p = p[pd.MultiIndex.from_frame(p[keys].astype(str)).isin(pcommon)]
            rows.append({"run": r.name, "subset": subset, **_win(w), **_score(s), **_player(p)})
    out = pd.DataFrame(rows).round(4)
    print(out.to_string(index=False))
    return out


if __name__ == "__main__":
    main(sys.argv[1:])
