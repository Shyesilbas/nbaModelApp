"""Checks run on every training feature matrix before a model is fitted.

They catch the problems the 2026-10 audit found by hand: exact or near-duplicate
columns (OPP_H2H_PTS_LAST_5 == H2H_PTS_ALLOWED_LAST_5), columns that never vary
(IS_PLAYOFF in a regular-season-only fit) and features that add nothing on the
holdout.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

NEAR_DUPLICATE_ABS_CORR = 0.98
LINEAR_DEPENDENCE_R2 = 0.9999


def linear_dependent_features(numeric: pd.DataFrame, r2_threshold: float = LINEAR_DEPENDENCE_R2) -> List[str]:
    """Columns that are an exact linear combination of the others (A_DIFF = A - OPP_A).

    Pairwise correlation misses these, yet they make linear coefficients and SHAP signs arbitrary.
    """
    rows = numeric.dropna()
    if len(rows) <= numeric.shape[1]:
        return []
    z = (rows - rows.mean()) / rows.std()
    dependent = []
    for col in z.columns:
        others = z.drop(columns=[col]).to_numpy()
        target = z[col].to_numpy()
        coef, *_ = np.linalg.lstsq(others, target, rcond=None)
        if 1.0 - np.var(target - others @ coef) / np.var(target) >= r2_threshold:
            dependent.append(col)
    return dependent


def check_feature_matrix(X: pd.DataFrame, model_name: str, corr_threshold: float = NEAR_DUPLICATE_ABS_CORR) -> Dict[str, Any]:
    numeric = X.apply(pd.to_numeric, errors="coerce")
    constant = [c for c in numeric.columns if numeric[c].nunique(dropna=True) <= 1]
    mostly_missing = [c for c in numeric.columns if numeric[c].isna().mean() > 0.5]
    varying = numeric.drop(columns=constant)
    corr = varying.corr().abs()
    pairs: List[List[Any]] = []
    cols = list(corr.columns)
    for i, a in enumerate(cols):
        for b in cols[i + 1:]:
            r = corr.at[a, b]
            if pd.notna(r) and r >= corr_threshold:
                pairs.append([a, b, round(float(r), 4)])
    dependent = linear_dependent_features(varying)
    report = {
        "n_features": int(X.shape[1]),
        "constant_features": constant,
        "mostly_missing_features": mostly_missing,
        "near_duplicate_pairs": pairs,
        "near_duplicate_threshold": corr_threshold,
        "linear_dependent_features": dependent,
    }
    if constant or pairs or dependent:
        logger.warning(
            "%s feature guard: %d constant, %d near-duplicate pairs (|r| >= %.2f): %s, linear combinations: %s",
            model_name, len(constant), len(pairs), corr_threshold, pairs[:5], dependent,
        )
    return report


def permutation_contribution(
    predict: Callable[[pd.DataFrame], np.ndarray],
    X: pd.DataFrame,
    y: pd.Series,
    loss: Callable[[np.ndarray, np.ndarray], float],
    n_repeats: int = 3,
    random_state: int = 42,
) -> List[Dict[str, Any]]:
    """Holdout loss increase when each feature is shuffled; <= 0 means the feature adds nothing."""
    rng = np.random.default_rng(random_state)
    base = loss(np.asarray(y), predict(X))
    rows = []
    for col in X.columns:
        deltas = []
        for _ in range(n_repeats):
            Xp = X.copy()
            Xp[col] = rng.permutation(Xp[col].to_numpy())
            deltas.append(loss(np.asarray(y), predict(Xp)) - base)
        rows.append({"feature": col, "loss_increase": round(float(np.mean(deltas)), 6), "std": round(float(np.std(deltas)), 6)})
    rows.sort(key=lambda r: -r["loss_increase"])
    return rows
