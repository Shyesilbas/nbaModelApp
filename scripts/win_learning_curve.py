"""WIN learning curve: does more history help? Production pipeline fit on the k seasons just before the
test season, scored on that season (default: the last backtest season), against pure Elo.

Writes reports/evaluation/win_learning_curve.json. Never touches the locked season or production files.
Usage: PYTHONPATH=. python3 scripts/win_learning_curve.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from scripts.walk_forward_benchmark import load_dataset
from src.features.continuous_elo import HOME_COURT_ADVANTAGE

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports/evaluation/win_learning_curve.json"


def main() -> None:
    data = load_dataset()
    features = [f for f in json.loads((ROOT / "models/production/win_features.json").read_text())
                if f in data.columns and f != "SCORE_PRED_MARGIN"]
    seasons = sorted(data["_SEASON"].unique())
    test_season = seasons[-1]
    home = data[data["IS_HOME"] == 1].dropna(subset=features + ["WIN"])
    test = home[home["_SEASON"] == test_season]
    y = test["WIN"].astype(int).to_numpy()
    elo = 1.0 / (1.0 + np.power(10.0, -(test["ELO_DIFF"].astype(float) + HOME_COURT_ADVANTAGE) / 400.0))
    elo_brier = float(brier_score_loss(y, elo))
    rows = []
    for k in range(1, len(seasons)):
        train = home[home["_SEASON"].isin(seasons[-1 - k:-1])]
        pipe = Pipeline([("imputer", SimpleImputer(strategy="mean")), ("scaler", StandardScaler()),
                         ("clf", LogisticRegression(max_iter=1000, random_state=42))])
        p = pipe.fit(train[features], train["WIN"].astype(int)).predict_proba(test[features])[:, 1]
        rows.append({"train_seasons": k, "train_games": int(len(train)), "brier": round(float(brier_score_loss(y, p)), 4),
                     "auc": round(float(roc_auc_score(y, p)), 4), "brier_gain_vs_elo": round(elo_brier - float(brier_score_loss(y, p)), 4)})
    OUT.write_text(json.dumps({"generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                               "test_season": test_season, "test_games": int(len(test)), "elo_brier": round(elo_brier, 4),
                               "curve": rows}, indent=2) + "\n")
    print(OUT)


if __name__ == "__main__":
    main()
