#!/usr/bin/env python3
"""WIN shadow candidate trained under the live roster assumption.

Production trains the four roster features (ABS_DIFF, MISSING_ROT_MINS_DIFF, ROT_CONTINUITY_DIFF,
ACTIVE_WT_GS_DIFF) on each game's own box score, while serving only knows the injury report and
"whoever played the previous game plays". This script rebuilds those features with the
carry-forward default, measures the candidate on the same expanding walk-forward as
scripts/walk_forward_benchmark.py (2021-22..2025-26, served under the live default), and writes
a refit on all six seasons to models/experimental/. Nothing under models/production/ is touched
and the locked season 2026-27 is not read.

Usage: PYTHONPATH=. python3 reports/backtests/2026-11-16_win_live_roster_shadow/code/train_shadow.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.base import clone
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from scripts.walk_forward_benchmark import _carry_forward_frame, load_dataset  # noqa: E402
from src.evaluation.bootstrap import paired_block_bootstrap  # noqa: E402
from src.features.continuous_elo import HOME_COURT_ADVANTAGE  # noqa: E402

SEED = 42
N_BOOT = 10000
OUT_DIR = Path(__file__).resolve().parents[1]
MODEL_PATH = ROOT / "models/experimental/win_live_roster_shadow.pkl"
META_PATH = ROOT / "models/experimental/win_live_roster_shadow.json"
SHADOW_NAME = "win_live_roster_v1"


def pipeline() -> Pipeline:
    """Same estimator as production (src/training/win_trainer.py: uncalibrated logistic regression)."""
    return Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=SEED)),
    ])


def main() -> int:
    features = json.loads((ROOT / "models/production/win_features.json").read_text())
    data = load_dataset()
    data_cf = _carry_forward_frame(data)
    seasons = sorted(data["_SEASON"].unique())

    rows, folds = [], []
    for idx, test_season in enumerate(seasons[1:], start=1):
        train = data[data["_SEASON"].isin(seasons[:idx]) & (data["IS_HOME"] == 1)].dropna(subset=features + ["WIN"])
        test = data[(data["_SEASON"] == test_season) & (data["IS_HOME"] == 1)].dropna(subset=features + ["WIN"])
        y_tr, y = train["WIN"].astype(int), test["WIN"].astype(int).to_numpy(dtype=float)
        tr_cf, te_cf = data_cf.loc[train.index], data_cf.loc[test.index]
        p_prod = pipeline().fit(train[features], y_tr).predict_proba(te_cf[features])[:, 1]   # production, served live
        p_shadow = pipeline().fit(tr_cf[features], y_tr).predict_proba(te_cf[features])[:, 1]  # candidate, served live
        p_elo = (1.0 / (1.0 + np.power(10.0, -(test["ELO_DIFF"].astype(float) + HOME_COURT_ADVANTAGE) / 400.0))).to_numpy()
        folds.append({
            "test_season": test_season, "games": int(len(y)),
            "brier_production_live": round(float(brier_score_loss(y, p_prod)), 4),
            "brier_shadow_live": round(float(brier_score_loss(y, p_shadow)), 4),
            "brier_elo": round(float(brier_score_loss(y, p_elo)), 4),
            "log_loss_production_live": round(float(log_loss(y, p_prod)), 4),
            "log_loss_shadow_live": round(float(log_loss(y, p_shadow)), 4),
        })
        rows.append((test["GAME_DATE"].to_numpy(), y, p_prod, p_shadow, p_elo))

    dates = np.concatenate([r[0] for r in rows])
    y, p_prod, p_shadow, p_elo = (np.concatenate([r[i] for r in rows]) for i in (1, 2, 3, 4))
    comparisons = {
        "shadow_minus_production_live": paired_block_bootstrap((p_shadow - y) ** 2 - (p_prod - y) ** 2, dates, n_boot=N_BOOT, seed=SEED),
        "shadow_minus_elo": paired_block_bootstrap((p_shadow - y) ** 2 - (p_elo - y) ** 2, dates, n_boot=N_BOOT, seed=SEED),
    }
    pooled = {
        "games": int(len(y)),
        "brier_production_live": round(float(brier_score_loss(y, p_prod)), 4),
        "brier_shadow_live": round(float(brier_score_loss(y, p_shadow)), 4),
        "brier_elo": round(float(brier_score_loss(y, p_elo)), 4),
        "seasons_shadow_better": int(sum(f["brier_shadow_live"] < f["brier_production_live"] for f in folds)),
    }

    # Refit on every eligible row of the six seasons, as the production trainer does (both team rows).
    full = data.dropna(subset=["WIN"])
    final = clone(pipeline()).fit(data_cf.loc[full.index, features], full["WIN"].astype(int))
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(final, MODEL_PATH)
    clf = final.named_steps["clf"]
    meta = {
        "name": SHADOW_NAME,
        "status": "shadow (not production; logged next to production in the paper ledger)",
        "trained_utc": datetime.now(timezone.utc).isoformat(),
        "seed": SEED,
        "features": features,
        "roster_feature_availability": "carry_forward",
        "train_seasons": seasons,
        "rows": int(len(full)),
        "sha256": hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest(),
        "standardized_coefficients": {f: round(float(c), 4) for f, c in zip(features, clf.coef_[0])},
        "intercept": round(float(clf.intercept_[0]), 4),
    }
    META_PATH.write_text(json.dumps(meta, indent=2) + "\n")
    result = {"pooled": pooled, "folds": folds, "comparisons": comparisons, "bootstrap": {"n_boot": N_BOOT, "seed": SEED, "blocks": "game date"}, "model": meta}
    (OUT_DIR / "results.json").write_text(json.dumps(result, indent=2, default=float) + "\n")
    print(json.dumps({"pooled": pooled, "comparisons": comparisons, "folds": folds}, indent=1, default=float))
    return 0


if __name__ == "__main__":
    sys.exit(main())
