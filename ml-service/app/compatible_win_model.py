from __future__ import annotations

import numpy as np


class CompatibleWinProbabilityModel:
    def __init__(self, imputer_statistics, scaler_mean, scaler_scale, coef, intercept, classes):
        self.imputer_statistics_ = np.asarray(imputer_statistics, dtype=float)
        self.scaler_mean_ = np.asarray(scaler_mean, dtype=float)
        self.scaler_scale_ = np.asarray(scaler_scale, dtype=float)
        self.coef_ = np.asarray(coef, dtype=float)
        self.intercept_ = np.asarray(intercept, dtype=float)
        self.classes_ = np.asarray(classes)
        self.n_features_in_ = int(self.coef_.shape[1])

    def _prepare(self, X):
        arr = np.asarray(X, dtype=float)
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        if arr.shape[1] != self.n_features_in_:
            raise ValueError(f"Expected {self.n_features_in_} features, got {arr.shape[1]}")

        arr = np.where(np.isnan(arr), self.imputer_statistics_, arr)
        scale = np.where(self.scaler_scale_ == 0, 1.0, self.scaler_scale_)
        arr = (arr - self.scaler_mean_) / scale
        return arr

    def decision_function(self, X):
        arr = self._prepare(X)
        return arr @ self.coef_.T + self.intercept_

    def predict_proba(self, X):
        scores = self.decision_function(X).reshape(-1)
        probs1 = 1.0 / (1.0 + np.exp(-scores))
        probs0 = 1.0 - probs1
        return np.vstack([probs0, probs1]).T
