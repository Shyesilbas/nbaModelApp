import numpy as np
import pandas as pd

from scripts.paper_ledger_report import last10_baseline, summarize_group
from src.evaluation.bootstrap import paired_block_bootstrap, verdict


def test_bootstrap_separates_clear_gain_from_noise():
    rng = np.random.default_rng(0)
    dates = np.repeat(np.arange(100), 5)
    better = paired_block_bootstrap(rng.normal(-0.5, 1.0, 500), dates)
    assert better["ci_high"] < 0 and verdict(better).startswith("model daha iyi")
    noise = paired_block_bootstrap(rng.normal(0.0, 1.0, 500), dates)
    assert noise["ci_low"] < 0 < noise["ci_high"]
    assert paired_block_bootstrap(np.array([1.0]), np.array([0])) is None


def _games(n_dates=6):
    rows = []
    for d in range(n_dates):
        gid = f"00226{d:05d}"
        date = f"2026-10-{20 + d}"
        # BOS always at home scoring 100 + d, NYK scoring 90.
        rows.append({"GAME_ID": gid, "GAME_DATE": date, "TEAM_ABBREVIATION": "BOS", "MATCHUP": "BOS vs. NYK",
                     "PTS": 100 + d, "PLUS_MINUS": 10 + d})
        rows.append({"GAME_ID": gid, "GAME_DATE": date, "TEAM_ABBREVIATION": "NYK", "MATCHUP": "NYK @ BOS",
                     "PTS": 90, "PLUS_MINUS": -(10 + d)})
    return pd.DataFrame(rows)


def test_last10_baseline_uses_only_earlier_games():
    base = last10_baseline(_games(), edge=2.0)
    # Games 0-2 have fewer than 3 earlier games per team.
    assert sorted(base) == ["0022600003", "0022600004", "0022600005"]
    # Game 3: BOS scored 100, 101, 102 and allowed 90; NYK the mirror image.
    b = base["0022600003"]
    assert b["total"] == (101 + 90 + 90 + 101) / 2
    assert b["margin"] == ((101 - 90) - (90 - 101)) / 2 + 2.0


def test_summarize_group_pairs_model_with_elo():
    rows = [
        {"y": 1.0, "home_win_probability": 0.7, "correct": True, "elo_prob": 0.6, "game_date": "2026-10-20",
         "predicted_total": 220, "actual_total": 210, "predicted_margin": 5, "actual_margin": 8,
         "base_total": 215, "base_margin": 3},
        {"y": 0.0, "home_win_probability": 0.4, "correct": True, "elo_prob": 0.55, "game_date": "2026-10-21",
         "predicted_total": 200, "actual_total": 205, "predicted_margin": -2, "actual_margin": -6,
         "base_total": 212, "base_margin": 1},
    ]
    s = summarize_group(rows)
    assert s["games"] == 2 and s["accuracy"] == 1.0
    assert s["brier"] == round((0.3 ** 2 + 0.4 ** 2) / 2, 4)
    assert s["elo_brier"] == round((0.4 ** 2 + 0.55 ** 2) / 2, 4)
    assert s["base_mae_total"] == 6.0 and s["mae_total"] == 7.5
    assert s["brier_vs_elo"]["n"] == 2
