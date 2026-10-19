import pytest
import pandas as pd

from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split


def test_chronological_split_uses_latest_dates_as_holdout():
    X = pd.DataFrame({"x": range(10)})
    y = pd.Series(range(10))
    meta = pd.DataFrame({"GAME_DATE": pd.date_range("2025-01-01", periods=10, freq="D")})

    X_train, X_test, _, _, split = chronological_train_test_split(X, y, meta, test_size=0.2)

    assert split.strategy == "chronological_quantile"
    assert split.train_rows == 8
    assert split.test_rows == 2
    assert X_test["x"].tolist() == [8, 9]


def test_chronological_split_refuses_random_fallback_without_dates():
    X = pd.DataFrame({"x": range(10)})
    y = pd.Series([0, 1] * 5)
    meta = pd.DataFrame({"OTHER": range(10)})

    # A random split would leak later games into training; the split must fail loudly.
    with pytest.raises(ValueError, match="random fallback is disabled"):
        chronological_train_test_split(X, y, meta, test_size=0.2)


def test_season_holdout_split_uses_named_calibration_season():
    X = pd.DataFrame({"x": range(6)})
    y = pd.Series(range(6))
    meta = pd.DataFrame({"GAME_DATE": ["2023-11-01", "2024-02-01", "2024-11-01", "2025-02-01", "2025-11-01", "2026-02-01"]})

    X_train, X_test, _, _, split = season_holdout_train_test_split(X, y, meta, calibration_season="2024-25")

    assert split.strategy == "season_holdout"
    # Seasons after the calibration season are never used to fit the holdout model.
    assert X_train["x"].tolist() == [0, 1]
    assert X_test["x"].tolist() == [2, 3]
    assert split.test_seasons == ["2024-25"]
