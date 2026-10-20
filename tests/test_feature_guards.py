import numpy as np
import pandas as pd

from src.training.feature_guards import check_feature_matrix


def test_guard_flags_diff_column_that_pairwise_correlation_misses():
    rng = np.random.default_rng(0)
    X = pd.DataFrame({"A": rng.normal(size=500), "OPP_A": rng.normal(size=500), "B": rng.normal(size=500)})
    X["A_DIFF"] = X["A"] - X["OPP_A"]

    report = check_feature_matrix(X, "TEST")

    assert report["near_duplicate_pairs"] == []
    assert set(report["linear_dependent_features"]) == {"A", "OPP_A", "A_DIFF"}


def test_guard_passes_independent_columns():
    rng = np.random.default_rng(1)
    X = pd.DataFrame(rng.normal(size=(500, 4)), columns=list("abcd"))

    assert check_feature_matrix(X, "TEST")["linear_dependent_features"] == []
