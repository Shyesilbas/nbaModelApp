import numpy as np

from src.evaluation.bootstrap import paired_block_bootstrap_auc, verdict_higher_better


def _games(n_dates=60, per_date=8, seed=0):
    rng = np.random.default_rng(seed)
    dates = np.repeat(np.arange(n_dates), per_date)
    signal = rng.normal(size=len(dates))
    y = (signal + rng.normal(scale=1.0, size=len(dates)) > 0).astype(float)
    return y, signal, rng.normal(size=len(dates)), dates


def test_informative_model_beats_noise_baseline():
    y, good, noise, dates = _games()
    ci = paired_block_bootstrap_auc(y, good, noise, dates, n_boot=300)
    assert ci["mean_diff"] > 0.1
    assert ci["ci_low"] > 0
    assert verdict_higher_better(ci).startswith("model daha iyi")


def test_identical_scores_give_zero_difference():
    y, good, _, dates = _games()
    ci = paired_block_bootstrap_auc(y, good, good, dates, n_boot=200)
    assert ci["mean_diff"] == 0 and ci["ci_low"] == 0 and ci["ci_high"] == 0
    assert verdict_higher_better(ci).startswith("fark anlamlı değil")


def test_too_few_date_blocks_returns_none():
    y, good, noise, dates = _games(n_dates=3)
    assert paired_block_bootstrap_auc(y, good, noise, dates) is None
