from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

import pandas as pd
from sklearn.model_selection import train_test_split


@dataclass(frozen=True)
class SplitMetadata:
    strategy: str
    split_date: Optional[str]
    train_rows: int
    test_rows: int
    train_seasons: Optional[list[str]] = None
    test_seasons: Optional[list[str]] = None


def season_from_dates(dates: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(dates, errors="coerce")
    years = parsed.dt.year.where(parsed.dt.month >= 10, parsed.dt.year - 1)
    return years.astype("Int64").astype(str) + "-" + ((years + 1) % 100).astype("Int64").astype(str).str.zfill(2)


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
    seasons = season_from_dates(meta[date_col])
    train_idx = meta.index[seasons != calibration_season]
    test_idx = meta.index[seasons == calibration_season]
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
    """Prefer a temporal holdout; fall back to random only if dates are unavailable."""
    if date_col in meta.columns:
        dates = pd.to_datetime(meta[date_col], errors="coerce")
        valid_dates = dates.dropna()
        if not valid_dates.empty:
            split_date = valid_dates.quantile(1 - test_size)
            train_idx = meta.index[dates <= split_date]
            test_idx = meta.index[dates > split_date]
            if len(train_idx) > 0 and len(test_idx) > 0:
                split_meta = SplitMetadata(
                    strategy="chronological_quantile",
                    split_date=pd.Timestamp(split_date).date().isoformat(),
                    train_rows=int(len(train_idx)),
                    test_rows=int(len(test_idx)),
                )
                return X.loc[train_idx], X.loc[test_idx], y.loc[train_idx], y.loc[test_idx], split_meta

    stratify = y if stratify_random else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=random_state,
        stratify=stratify,
    )
    split_meta = SplitMetadata(
        strategy="random_fallback",
        split_date=None,
        train_rows=int(len(X_train)),
        test_rows=int(len(X_test)),
    )
    return X_train, X_test, y_train, y_test, split_meta
