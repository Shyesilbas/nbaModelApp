import numpy as np
import pandas as pd

from src.inference.score_predictor import interval_offsets_80
from src.training.score_trainer import MIN_PLAYOFF_CALIBRATION_GAMES, ScoreModelTrainer

BASE = {"total": [-24.0, 24.0], "margin": [-17.1, 17.1], "home": [-15.0, 15.0], "away": [-14.8, 14.8]}
META = {"prediction_interval_offsets_80pct": BASE, "prediction_interval_offsets_80pct_playoff": {"margin": [-19.6, 19.6]}}
FALLBACK = {"total": [-1.0, 1.0], "margin": [-1.0, 1.0], "home": [-1.0, 1.0], "away": [-1.0, 1.0]}


def test_playoff_game_overrides_only_the_margin_radius():
    offsets = interval_offsets_80(META, True, FALLBACK)
    assert offsets["margin"] == [-19.6, 19.6]
    assert {k: v for k, v in offsets.items() if k != "margin"} == {k: v for k, v in BASE.items() if k != "margin"}


def test_regular_season_game_keeps_the_regular_radius():
    assert interval_offsets_80(META, False, FALLBACK) == BASE


def test_metadata_without_playoff_radius_falls_back_to_the_regular_one():
    meta = {"prediction_interval_offsets_80pct": BASE}
    assert interval_offsets_80(meta, True, FALLBACK) == BASE
    assert interval_offsets_80({}, True, FALLBACK) == FALLBACK


def _eval_frame(n_regular: int, n_playoff: int, seed: int = 0) -> tuple[pd.DataFrame, pd.Series]:
    rng = np.random.default_rng(seed)
    is_playoff = np.r_[np.zeros(n_regular, dtype=int), np.ones(n_playoff, dtype=int)]
    noise = rng.normal(0, np.where(is_playoff == 1, 15.0, 10.0))
    frame = pd.DataFrame({"IS_PLAYOFF": is_playoff, "ACTUAL_TOTAL": 220.0 + noise, "ACTUAL_MARGIN": noise,
                          "ACTUAL_HOME_PTS": 110.0 + noise / 2, "ACTUAL_AWAY_PTS": 110.0 - noise / 2})
    return frame, pd.Series(0.0, index=frame.index)


def test_playoff_margin_radius_is_wider_when_playoff_errors_are_wider():
    frame, zero = _eval_frame(2000, 300)
    stats = ScoreModelTrainer._compute_conformal_intervals(frame, 220.0 + zero, zero, 110.0 + zero, 110.0 + zero)
    assert stats["playoff_calibration_samples"] == 300
    assert stats["playoff_offsets_80pct"]["margin"][1] > stats["offsets_80pct"]["margin"][1]


def test_playoff_radius_is_omitted_with_too_few_playoff_games():
    frame, zero = _eval_frame(2000, MIN_PLAYOFF_CALIBRATION_GAMES - 1)
    stats = ScoreModelTrainer._compute_conformal_intervals(frame, 220.0 + zero, zero, 110.0 + zero, 110.0 + zero)
    assert stats["playoff_offsets_80pct"] == {}
