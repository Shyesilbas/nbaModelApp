from __future__ import annotations

from typing import Callable, Dict, Iterable

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, mean_absolute_error, mean_squared_error, r2_score, roc_auc_score


def segment_masks(df: pd.DataFrame, segments: Iterable[str]) -> Dict[str, pd.Series]:
    masks: Dict[str, pd.Series] = {}
    index = df.index
    for segment in segments:
        if segment == "overall":
            masks[segment] = pd.Series(True, index=index)
        elif segment == "regular_season" and "IS_PLAYOFF" in df.columns:
            masks[segment] = df["IS_PLAYOFF"].astype(int) == 0
        elif segment == "playoffs" and "IS_PLAYOFF" in df.columns:
            masks[segment] = df["IS_PLAYOFF"].astype(int) == 1
        elif segment == "home" and "IS_HOME" in df.columns:
            masks[segment] = df["IS_HOME"].astype(bool)
        elif segment == "away" and "IS_HOME" in df.columns:
            masks[segment] = ~df["IS_HOME"].astype(bool)
        elif segment == "close_games":
            if "ACTUAL_MARGIN" in df.columns:
                masks[segment] = df["ACTUAL_MARGIN"].abs() <= 5
            elif "NET_RTG" in df.columns and "PACE" in df.columns:
                masks[segment] = (df["PACE"] * df["NET_RTG"] / 100.0).abs() <= 5
        elif segment == "favorites" and "ELO_DIFF" in df.columns:
            masks[segment] = df["ELO_DIFF"] > 0
        elif segment == "underdogs" and "ELO_DIFF" in df.columns:
            masks[segment] = df["ELO_DIFF"] <= 0
    return masks


def evaluate_segments(df: pd.DataFrame, segments: Iterable[str], metric_fn: Callable[[pd.DataFrame], Dict[str, float]]) -> Dict[str, Dict[str, float]]:
    results: Dict[str, Dict[str, float]] = {}
    for name, mask in segment_masks(df, segments).items():
        segment_df = df.loc[mask].copy()
        if segment_df.empty:
            results[name] = {"samples": 0}
            continue
        results[name] = metric_fn(segment_df)
        results[name]["samples"] = int(len(segment_df))
    return results


def win_metrics(df: pd.DataFrame) -> Dict[str, float]:
    y = df["actual"].astype(int)
    probs = df["pred_proba"].astype(float)
    pred = (probs >= 0.5).astype(int)
    return {
        "accuracy": float(accuracy_score(y, pred)),
        "roc_auc": float(roc_auc_score(y, probs)) if y.nunique() > 1 else 1.0,
        "brier": float(brier_score_loss(y, probs)),
    }


def score_metrics(df: pd.DataFrame) -> Dict[str, float]:
    return {
        "total_mae": float(mean_absolute_error(df["ACTUAL_TOTAL"], df["PRED_TOTAL"])),
        "total_bias": float((df["PRED_TOTAL"] - df["ACTUAL_TOTAL"]).mean()),
        "margin_mae": float(mean_absolute_error(df["ACTUAL_MARGIN"], df["PRED_MARGIN"])),
        "margin_bias": float((df["PRED_MARGIN"] - df["ACTUAL_MARGIN"]).mean()),
    }


def player_metrics(target: str) -> Callable[[pd.DataFrame], Dict[str, float]]:
    actual_col = f"actual_{target}"
    pred_col = f"pred_{target}"

    def _metrics(df: pd.DataFrame) -> Dict[str, float]:
        return {
            "mae": float(mean_absolute_error(df[actual_col], df[pred_col])),
            "rmse": float(np.sqrt(mean_squared_error(df[actual_col], df[pred_col]))),
            "r2": float(r2_score(df[actual_col], df[pred_col])) if len(df) > 1 else 0.0,
        }

    return _metrics
