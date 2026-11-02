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
