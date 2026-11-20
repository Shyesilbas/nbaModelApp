"""Paired, date-block bootstrap for model-vs-baseline loss differences.

Games on the same date share league-wide conditions (schedule density, officiating
trends), so whole dates are resampled instead of single games. The interval is for the
mean of ``diff = model_loss - baseline_loss``: an upper bound below zero means the
model is better than the baseline at that confidence level. With fewer than ``MIN_BLOCKS``
dates the resampled means take only a handful of values and the interval is meaningless, so
no interval is returned.
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

MIN_BLOCKS = 5


def roc_auc_score(y: np.ndarray, score: np.ndarray) -> float:
    """Binary ROC-AUC via the rank-sum identity (ties get average ranks, like sklearn).

    sklearn's roc_auc_score costs ~3 ms per call from input validation alone, which made the
    bootstrap (thousands of calls) the slowest part of API startup.
    """
    y = np.asarray(y) > 0.5
    n_pos = int(y.sum())
    n_neg = len(y) - n_pos
    score = np.asarray(score, dtype=float)
    order = np.argsort(score, kind="stable")
    sorted_score = score[order]
    # Average rank per tie group: group g spans [start, end) in sorted order.
    starts = np.flatnonzero(np.r_[True, sorted_score[1:] != sorted_score[:-1]])
    ends = np.r_[starts[1:], len(score)]
    group_rank = (starts + ends + 1) / 2.0
    ranks = np.empty(len(score))
    ranks[order] = np.repeat(group_rank, ends - starts)
    return float((ranks[y].sum() - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))


def paired_block_bootstrap(
    diff: np.ndarray,
    blocks: np.ndarray,
    n_boot: int = 2000,
    level: float = 0.95,
    seed: int = 42,
) -> Optional[dict]:
    """Mean of ``diff`` with a percentile interval from resampling ``blocks`` with replacement."""
    diff = np.asarray(diff, dtype=float)
    blocks = np.asarray(blocks)
    ok = ~np.isnan(diff)
    diff, blocks = diff[ok], blocks[ok]
    if len(diff) < 2:
        return None
    codes, _ = pd.factorize(blocks)
    n_blocks = int(codes.max()) + 1
    if n_blocks < MIN_BLOCKS:
        return None
    sums = np.bincount(codes, weights=diff, minlength=n_blocks)
    counts = np.bincount(codes, minlength=n_blocks).astype(float)
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, n_blocks, size=(n_boot, n_blocks))
    means = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)
    alpha = (1.0 - level) / 2.0
    lo, hi = np.quantile(means, [alpha, 1.0 - alpha])
    return {
        "mean_diff": round(float(diff.mean()), 5),
        "ci_low": round(float(lo), 5),
        "ci_high": round(float(hi), 5),
        "level": level,
        "n": int(len(diff)),
        "blocks": n_blocks,
        "p_model_better": round(float((means < 0).mean()), 4),
    }


def verdict(ci: Optional[dict]) -> str:
    """Plain-language reading of a ``paired_block_bootstrap`` result (lower loss is better)."""
    if not ci:
        return "yetersiz veri"
    if ci["ci_high"] < 0:
        return "model daha iyi (CI sıfırın altında)"
    if ci["ci_low"] > 0:
        return "baseline daha iyi (CI sıfırın üstünde)"
    return "fark anlamlı değil (CI sıfırı kapsıyor)"


def paired_block_bootstrap_auc(
    y: np.ndarray,
    p_model: np.ndarray,
    p_base: np.ndarray,
    blocks: np.ndarray,
    n_boot: int = 1000,
    level: float = 0.95,
    seed: int = 42,
) -> Optional[dict]:
    """ROC-AUC of the model minus the baseline on the same games, resampling whole date blocks.

    Unlike a loss, AUC is not a per-game mean, so every replicate recomputes both AUCs on the
    resampled games. ``mean_diff`` is the AUC difference on all games; positive means the model ranks better.
    """
    y, p_model, p_base = (np.asarray(a, dtype=float) for a in (y, p_model, p_base))
    codes, _ = pd.factorize(np.asarray(blocks))
    n_blocks = int(codes.max()) + 1
    if len(y) < 2 or n_blocks < MIN_BLOCKS:
        return None
    members = [np.flatnonzero(codes == b) for b in range(n_blocks)]
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_boot):
        idx = np.concatenate([members[b] for b in rng.integers(0, n_blocks, size=n_blocks)])
        if y[idx].min() == y[idx].max():
            continue
        diffs.append(roc_auc_score(y[idx], p_model[idx]) - roc_auc_score(y[idx], p_base[idx]))
    diffs = np.asarray(diffs)
    alpha = (1.0 - level) / 2.0
    lo, hi = np.quantile(diffs, [alpha, 1.0 - alpha])
    return {
        "mean_diff": round(float(roc_auc_score(y, p_model) - roc_auc_score(y, p_base)), 5),
        "ci_low": round(float(lo), 5),
        "ci_high": round(float(hi), 5),
        "level": level,
        "n": int(len(y)),
        "blocks": n_blocks,
        "p_model_better": round(float((diffs > 0).mean()), 4),
    }


def verdict_higher_better(ci: Optional[dict]) -> str:
    """Same reading as ``verdict`` for a difference where a higher value is better (AUC)."""
    if not ci:
        return "yetersiz veri"
    if ci["ci_low"] > 0:
        return "model daha iyi (CI sıfırın üstünde)"
    if ci["ci_high"] < 0:
        return "baseline daha iyi (CI sıfırın altında)"
    return "fark anlamlı değil (CI sıfırı kapsıyor)"
