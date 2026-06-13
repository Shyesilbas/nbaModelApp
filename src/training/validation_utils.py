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
