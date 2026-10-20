from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import pandas as pd
import numpy as np

from scripts.season_utils import season_labels


@dataclass(frozen=True)
class SplitMetadata:
    strategy: str
    split_date: Optional[str]
    train_rows: int
    test_rows: int
    train_seasons: Optional[list[str]] = None
    test_seasons: Optional[list[str]] = None


def expanding_window_date_splits(meta: pd.DataFrame, date_col: str = "GAME_DATE", n_splits: int = 3):
    """Return positional train/validation folds grouped by date, never by row."""
    if date_col not in meta.columns:
        raise ValueError(f"Expanding-window folds require `{date_col}`.")
    dates = pd.to_datetime(meta[date_col], errors="coerce").reset_index(drop=True)
    if dates.isna().any():
        raise ValueError(f"Expanding-window folds have invalid `{date_col}` values.")
    unique_dates = pd.DatetimeIndex(dates.drop_duplicates().sort_values())
    if len(unique_dates) <= n_splits:
        raise ValueError(f"Need more than {n_splits} distinct dates for expanding-window folds.")
    from sklearn.model_selection import TimeSeriesSplit

    folds = []
    for train_date_idx, val_date_idx in TimeSeriesSplit(n_splits=n_splits).split(unique_dates):
        train_dates = unique_dates[train_date_idx]
        val_dates = unique_dates[val_date_idx]
        train_rows = np.flatnonzero(dates.isin(train_dates).to_numpy())
        val_rows = np.flatnonzero(dates.isin(val_dates).to_numpy())
        folds.append((train_rows, val_rows))
    return folds


def season_from_dates(dates: pd.Series) -> pd.Series:
    return season_labels(dates)


def season_holdout_train_test_split(
    X: pd.DataFrame,
    y: pd.Series,
    meta: pd.DataFrame,
    *,
    calibration_season: str,
    date_col: str = "GAME_DATE",
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, SplitMetadata]:
    if date_col not in meta.columns:
        raise ValueError(f"Season holdout split requires `{date_col}` in metadata.")
    dates = pd.to_datetime(meta[date_col], errors="coerce")
    if dates.isna().any():
        raise ValueError(f"Season holdout split has invalid `{date_col}` values.")
    seasons = season_from_dates(dates)
    test_idx = meta.index[seasons == calibration_season]
    if len(test_idx) == 0:
        raise ValueError(f"Season holdout contains no rows for {calibration_season}.")
    cutoff = dates.loc[test_idx].min()
    train_idx = meta.index[(seasons != calibration_season) & (dates < cutoff)]
    if len(train_idx) == 0 or len(test_idx) == 0:
        raise ValueError(f"Season holdout split has train={len(train_idx)} test={len(test_idx)} for calibration_season={calibration_season}.")
    split_meta = SplitMetadata(
        strategy="season_holdout",
        split_date=None,
        train_rows=int(len(train_idx)),
        test_rows=int(len(test_idx)),
        train_seasons=sorted(seasons.loc[train_idx].dropna().unique().tolist()),
        test_seasons=[calibration_season],
    )
    return X.loc[train_idx], X.loc[test_idx], y.loc[train_idx], y.loc[test_idx], split_meta


def chronological_train_test_split(
    X: pd.DataFrame,
    y: pd.Series,
    meta: pd.DataFrame,
    *,
    date_col: str = "GAME_DATE",
    test_size: float = 0.2,
    random_state: int = 42,
    stratify_random: bool = False,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series, SplitMetadata]:
    """Create a temporal holdout; missing dates are an error, never randomized."""
    if date_col not in meta.columns:
        raise ValueError(f"Chronological split requires `{date_col}`; random fallback is disabled.")
    dates = pd.to_datetime(meta[date_col], errors="coerce")
    if dates.isna().any():
        raise ValueError(f"Chronological split has invalid `{date_col}` values.")
    split_date = dates.quantile(1 - test_size)
    train_idx = meta.index[dates <= split_date]
    test_idx = meta.index[dates > split_date]
    if len(train_idx) == 0 or len(test_idx) == 0:
        raise ValueError(f"Chronological split produced train={len(train_idx)} test={len(test_idx)}.")
    split_meta = SplitMetadata(
        strategy="chronological_quantile",
        split_date=pd.Timestamp(split_date).date().isoformat(),
        train_rows=int(len(train_idx)),
        test_rows=int(len(test_idx)),
    )
    return X.loc[train_idx], X.loc[test_idx], y.loc[train_idx], y.loc[test_idx], split_meta
