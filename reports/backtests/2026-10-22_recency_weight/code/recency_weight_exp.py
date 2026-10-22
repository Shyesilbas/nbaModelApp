"""Recency-weight experiment: exponential sample weights by game age for WIN, SCORE and PLAYER.

Same expanding-window folds and estimators as scripts/walk_forward_benchmark.py; the only change is
sample_weight = 0.5 ** (age_years / half_life), age measured from the last training game.
Nothing under models/production is read for writing; outputs go to data/experimental/recency_weight/.

Run: PYTHONPATH=. python3 reports/backtests/2026-10-22_recency_weight/code/recency_weight_exp.py
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, RidgeCV
from sklearn.metrics import brier_score_loss, mean_absolute_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from scripts.walk_forward_benchmark import load_dataset, load_player_dataset
from src.training.player_trainer import PlayerModelTrainer

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / "data/experimental/recency_weight"
HALF_LIVES = [None, 4.0, 2.0, 1.0, 0.5]


def weights(dates: pd.Series, half_life: float | None) -> np.ndarray | None:
    if half_life is None:
        return None
    age_years = (dates.max() - dates).dt.days.to_numpy() / 365.25
    return np.power(0.5, age_years / half_life)


def ridge() -> Pipeline:
    return Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()),
                     ("ridge", RidgeCV(alphas=np.logspace(-2, 4, 25)))])


def win_model() -> Pipeline:
    return Pipeline([("imputer", SimpleImputer(strategy="mean")), ("scaler", StandardScaler()),
                     ("clf", LogisticRegression(max_iter=1000, random_state=42))])


def fit(pipe: Pipeline, X, y, w, step: str) -> Pipeline:
    if w is None:
        return pipe.fit(X, y)
    return pipe.fit(X, y, **{f"{step}__sample_weight": w})


def main() -> None:
    data = load_dataset()
    player_feats = joblib.load(ROOT / "models/production/player_features.pkl")
    player = load_player_dataset(player_feats)
    win_feats = [f for f in json.loads((ROOT / "models/production/win_features.json").read_text())
                 if f in data.columns and f != "SCORE_PRED_MARGIN"]
    meta = json.loads((ROOT / "models/production/score_metadata.json").read_text())
    pace_f, home_f, away_f, margin_f = (meta["pace_features"], meta["home_off_rtg_features"],
                                        meta["away_off_rtg_features"], meta["margin_features"])

    seasons = sorted(data["_SEASON"].unique())
    rows = []
    for idx, test_season in enumerate(seasons[1:], start=1):
        train_seasons = seasons[:idx]
        tr = data[data["_SEASON"].isin(train_seasons)]
        te = data[data["_SEASON"] == test_season]
        for hl in HALF_LIVES:
            tag = "none" if hl is None else f"{hl:g}y"

            # WIN
            trh = tr[tr["IS_HOME"] == 1].dropna(subset=win_feats + ["WIN"])
            teh = te[te["IS_HOME"] == 1].dropna(subset=win_feats + ["WIN"])
            m = fit(win_model(), trh[win_feats], trh["WIN"].astype(int), weights(trh["GAME_DATE"], hl), "clf")
            p = m.predict_proba(teh[win_feats])[:, 1]
            rows.append(dict(model="WIN", metric="brier", season=test_season, half_life=tag,
                             value=brier_score_loss(teh["WIN"].astype(int), p), n=len(teh)))

            # SCORE
            h_tr, a_tr = tr[tr["IS_HOME"] == 1].copy(), tr[tr["IS_HOME"] == 0]
            h_te, a_te = te[te["IS_HOME"] == 1].copy(), te[te["IS_HOME"] == 0]
            wh, wa = weights(h_tr["GAME_DATE"], hl), weights(a_tr["GAME_DATE"], hl)
            m_pace = fit(ridge(), h_tr[pace_f], h_tr["PACE"], wh, "ridge")
            m_home = fit(ridge(), h_tr[home_f], h_tr["OFF_RTG"], wh, "ridge")
            m_away = fit(ridge(), a_tr[away_f], a_tr["OFF_RTG"], wa, "ridge")
            m_marg = fit(ridge(), h_tr[margin_f], h_tr["ACTUAL_PTS"] - h_tr["ACTUAL_OPP_PTS"], wh, "ridge")
            h_te["P_PACE"] = m_pace.predict(h_te[pace_f])
            h_te["P_HOME"] = m_home.predict(h_te[home_f])
            h_te["P_MARG"] = m_marg.predict(h_te[margin_f])
            a_sub = a_te[["GAME_ID"] + away_f].copy()
            a_sub["P_AWAY"] = m_away.predict(a_sub[away_f])
            mg = h_te.merge(a_sub[["GAME_ID", "P_AWAY"]], on="GAME_ID").dropna(
                subset=["P_PACE", "P_HOME", "P_MARG", "P_AWAY"])
            total = mg["ACTUAL_PTS"] + mg["ACTUAL_OPP_PTS"]
            margin = mg["ACTUAL_PTS"] - mg["ACTUAL_OPP_PTS"]
            rows.append(dict(model="SCORE", metric="total_mae", season=test_season, half_life=tag,
                             value=mean_absolute_error(total, mg["P_PACE"] * (mg["P_HOME"] + mg["P_AWAY"]) / 100.0),
                             n=len(mg)))
            rows.append(dict(model="SCORE", metric="margin_mae", season=test_season, half_life=tag,
                             value=mean_absolute_error(margin, mg["P_MARG"]), n=len(mg)))

            # PLAYER
            if not player.empty:
                p_tr = player[player["_SEASON"].isin(train_seasons)]
                p_te = player[player["_SEASON"] == test_season]
                for tgt in ["pts", "reb", "ast"]:
                    col = f"TARGET_{tgt.upper()}"
                    a = p_tr.dropna(subset=[col])
                    b = p_te.dropna(subset=[col])
                    mp = fit(PlayerModelTrainer()._model_pipeline(tgt), a[player_feats], a[col],
                             weights(a["GAME_DATE"], hl), "lgb")
                    rows.append(dict(model="PLAYER", metric=f"{tgt}_mae", season=test_season, half_life=tag,
                                     value=mean_absolute_error(b[col], mp.predict(b[player_feats])), n=len(b)))
        print(f"fold {test_season} done", flush=True)

    res = pd.DataFrame(rows)
    OUT.mkdir(parents=True, exist_ok=True)
    res.to_csv(OUT / "results.csv", index=False)

    def wavg(g):
        return float(np.average(g["value"], weights=g["n"]))

    order = ["none"] + [f"{h:g}y" for h in HALF_LIVES[1:]]
    for label, sub in [("all folds (2021-22..2025-26)", res),
                       ("last 3 folds (2023-24..2025-26)", res[res["season"] >= "2023-24"])]:
        piv = sub.groupby(["model", "metric", "half_life"]).apply(wavg, include_groups=False).unstack("half_life")[order]
        print(f"\n== {label} ==")
        print(piv.round(4).to_string())


if __name__ == "__main__":
    main()
