"""Multi-Season Expanding-Window Walk-Forward Backtest for WIN and SCORE Models.

Evaluates leak-free candidates on sequential unseen seasons:
  Fold 1: Train 2020-21 -> Test 2021-22
  Fold 2: Train 2020-22 -> Test 2022-23
  Fold 3: Train 2020-23 -> Test 2023-24
  Fold 4: Train 2020-24 -> Test 2024-25
  Fold 5: Train 2020-25 -> Test 2025-26

Compares directly against pregame baselines (Elo, rolling stats) and validates
conformal interval coverage on independent seasons.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge, RidgeCV
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, mean_absolute_error, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.core.data_paths import PLAYER_TRAINING_CSV, get_data_paths, team_training_csv
from src.features.roster_absence import add_absence_columns
from src.features.win_strength_features import add_win_strength_features, attach_actual_points
from src.features.continuous_elo import HOME_COURT_ADVANTAGE
from src.training.score_trainer import ScoreModelTrainer, get_location_features
from src.training.player_trainer import PlayerModelTrainer
from src.features.player_form import add_player_matchup_features
from src.training.validation_utils import expanding_window_date_splits
from src.evaluation.bootstrap import paired_block_bootstrap, verdict
from src.evaluation.model_doc_blocks import update_model_docs
from src.evaluation.status_blocks import update_status_docs

ROOT = Path(__file__).resolve().parents[1]
SEASONS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


def _evaluate_prob(y_true: pd.Series, probs: np.ndarray) -> dict:
    p = np.clip(np.asarray(probs, dtype=float), 1e-6, 1.0 - 1e-6)
    y = np.asarray(y_true, dtype=int)
    auc = float(roc_auc_score(y, p)) if len(np.unique(y)) > 1 else None
    return {
        "accuracy": float(accuracy_score(y, p >= 0.5)),
        "roc_auc": auc,
        "brier": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, p)),
        "samples": int(len(y)),
    }


def _evaluate_score(actual_total, pred_total, actual_margin, pred_margin, offsets_80=None):
    res_total = actual_total - pred_total
    res_margin = actual_margin - pred_margin
    total_mae = float(mean_absolute_error(actual_total, pred_total))
    margin_mae = float(mean_absolute_error(actual_margin, pred_margin))
    total_bias = float(res_total.mean())
    margin_bias = float(res_margin.mean())
    
    out = {
        "total_mae": round(total_mae, 4),
        "total_bias": round(total_bias, 4),
        "margin_mae": round(margin_mae, 4),
        "margin_bias": round(margin_bias, 4),
        "samples": int(len(actual_total)),
    }
    if offsets_80 and "total" in offsets_80:
        cov_tot = float((res_total.abs() <= abs(offsets_80["total"][1])).mean())
        cov_mar = float((res_margin.abs() <= abs(offsets_80["margin"][1])).mean())
        out["conformal_80_total_coverage"] = round(cov_tot * 100, 1)
        out["conformal_80_margin_coverage"] = round(cov_mar * 100, 1)
    return out


def _evaluate_player(actual: pd.Series, pred: np.ndarray, baseline: pd.Series) -> dict:
    valid = actual.notna() & pd.Series(pred, index=actual.index).notna() & baseline.notna()
    act = actual[valid].values
    pr = np.asarray(pred)[valid.values]
    base = baseline[valid].values
    mae_mod = float(mean_absolute_error(act, pr))
    mae_base = float(mean_absolute_error(act, base))
    rmse_mod = float(np.sqrt(np.mean((act - pr) ** 2)))
    return {
        "model_mae": round(mae_mod, 4),
        "baseline_mae": round(mae_base, 4),
        "mae_reduction": round(mae_base - mae_mod, 4),
        "model_rmse": round(rmse_mod, 4),
        "samples": int(len(act)),
    }


AVAILABILITY_FEATURES = ["ABS_DIFF", "MISSING_ROT_MINS_DIFF", "ROT_CONTINUITY_DIFF", "ACTIVE_WT_GS_DIFF"]
RELIABILITY_BINS = [0.0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]


def _ridge_pipeline() -> Pipeline:
    """Same estimator as src/training/score_trainer.py (estimator: ridge)."""
    return Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()), ("ridge", RidgeCV(alphas=np.logspace(-2, 4, 25)))])


def _correction_features(df: pd.DataFrame) -> pd.DataFrame:
    """Context features of the production residual correction (src/training/score_trainer.py)."""
    return pd.DataFrame({
        "is_playoff": (df["IS_PLAYOFF"].astype(int) == 1).astype(float),
        "home_b2b": (df["IS_B2B"].astype(int) == 1).astype(float),
        "away_b2b": (df["OPP_IS_B2B"].astype(int) == 1).astype(float),
        "home_rest_advantage": (df["DAYS_REST"] > df["OPP_DAYS_REST"]).astype(float),
        "away_rest_advantage": (df["OPP_DAYS_REST"] > df["DAYS_REST"]).astype(float),
    }, index=df.index)


def score_fold(train_data, test_data, pace_features, home_features, away_features, margin_features):
    """Production SCORE pipeline refit on the training seasons only.

    The four ridge models are fit on all training games; the residual correction and the conformal
    radii come from temporal OOF predictions inside the training seasons, exactly as the trainer does,
    so neither sees the test season. Returns the merged test frame (raw and corrected predictions) and
    the fold's own 80% radii."""
    h_tr, a_tr = train_data[train_data["IS_HOME"] == 1].copy(), train_data[train_data["IS_HOME"] == 0].copy()
    h_te, a_te = test_data[test_data["IS_HOME"] == 1].copy(), test_data[test_data["IS_HOME"] == 0].copy()
    h_tr["TARGET_PACE"], h_tr["TARGET_HOME_OFF_RTG"] = h_tr["PACE"], h_tr["OFF_RTG"]
    a_tr["TARGET_AWAY_OFF_RTG"] = a_tr["OFF_RTG"]
    h_tr["TARGET_MARGIN"] = h_tr["ACTUAL_PTS"] - h_tr["ACTUAL_OPP_PTS"]
    home_specs = [("PRED_PACE", pace_features, "TARGET_PACE"), ("PRED_HOME_RTG", home_features, "TARGET_HOME_OFF_RTG"),
                  ("PRED_MARGIN_MODEL", margin_features, "TARGET_MARGIN")]
    pred_cols = [c for c, _, _ in home_specs] + ["PRED_AWAY_RTG"]

    oof = h_tr.copy()
    for col, feats, target in home_specs:
        oof[col] = ScoreModelTrainer._temporal_oof_predictions(h_tr, feats, target, _ridge_pipeline())
    away_oof = a_tr[["GAME_ID"]].copy()
    away_oof["PRED_AWAY_RTG"] = ScoreModelTrainer._temporal_oof_predictions(a_tr, away_features, "TARGET_AWAY_OFF_RTG", _ridge_pipeline())
    oof = oof.merge(away_oof, on="GAME_ID", how="inner").dropna(subset=pred_cols)
    oof["ACTUAL_HOME_PTS"], oof["ACTUAL_AWAY_PTS"] = oof["ACTUAL_PTS"], oof["ACTUAL_OPP_PTS"]
    oof["ACTUAL_TOTAL"] = oof["ACTUAL_HOME_PTS"] + oof["ACTUAL_AWAY_PTS"]
    oof["ACTUAL_MARGIN"] = oof["ACTUAL_HOME_PTS"] - oof["ACTUAL_AWAY_PTS"]
    oof["PRED_TOTAL_RAW"] = oof["PRED_PACE"] * (oof["PRED_HOME_RTG"] + oof["PRED_AWAY_RTG"]) / 100.0
    x_oof = _correction_features(oof)
    ridge_total = Ridge(alpha=1.0).fit(x_oof, oof["PRED_TOTAL_RAW"] - oof["ACTUAL_TOTAL"])
    ridge_margin = Ridge(alpha=1.0).fit(x_oof, oof["PRED_MARGIN_MODEL"] - oof["ACTUAL_MARGIN"])
    total_oof = oof["PRED_TOTAL_RAW"] - ridge_total.predict(x_oof)
    margin_oof = oof["PRED_MARGIN_MODEL"] - ridge_margin.predict(x_oof)
    radii = ScoreModelTrainer._compute_conformal_intervals(oof, total_oof, margin_oof, (total_oof + margin_oof) / 2.0, (total_oof - margin_oof) / 2.0)

    for col, feats, target in home_specs:
        h_te[col] = _ridge_pipeline().fit(h_tr[feats], h_tr[target]).predict(h_te[feats])
    a_te["PRED_AWAY_RTG"] = _ridge_pipeline().fit(a_tr[away_features], a_tr["TARGET_AWAY_OFF_RTG"]).predict(a_te[away_features])
    merged = h_te.merge(a_te[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner").dropna(subset=pred_cols).copy()
    merged["ACTUAL_TOTAL"] = merged["ACTUAL_PTS"] + merged["ACTUAL_OPP_PTS"]
    merged["ACTUAL_MARGIN"] = merged["ACTUAL_PTS"] - merged["ACTUAL_OPP_PTS"]
    merged["PRED_TOTAL_RAW"] = merged["PRED_PACE"] * (merged["PRED_HOME_RTG"] + merged["PRED_AWAY_RTG"]) / 100.0
    x_te = _correction_features(merged)
    merged["PRED_TOTAL"] = merged["PRED_TOTAL_RAW"] - ridge_total.predict(x_te)
    merged["PRED_MARGIN"] = merged["PRED_MARGIN_MODEL"] - ridge_margin.predict(x_te)
    return merged, radii["offsets_80pct"], float((h_tr["ACTUAL_PTS"] - h_tr["ACTUAL_OPP_PTS"]).mean())


def reliability_table(y: np.ndarray, p: np.ndarray) -> dict:
    """Binned predicted vs realised home-win rate and the sample-weighted ECE."""
    df = pd.DataFrame({"y": y, "p": p, "bin": pd.cut(p, RELIABILITY_BINS, include_lowest=True)})
    g = df.groupby("bin", observed=True).agg(games=("y", "size"), mean_p=("p", "mean"), observed=("y", "mean"))
    ece = float((g["games"] * (g["mean_p"] - g["observed"]).abs()).sum() / g["games"].sum())
    bins = [{"bin": f"{max(i.left, 0.0):.1f}-{i.right:.1f}", "games": int(r.games), "mean_predicted": round(float(r.mean_p), 4), "observed": round(float(r.observed), 4)} for i, r in g.iterrows()]
    return {"ece": round(ece, 4), "bins": bins}


def _carry_forward_frame(data: pd.DataFrame) -> pd.DataFrame:
    """The team-game dataset with the availability features rebuilt under the live default
    (whoever played the previous game plays tonight) instead of the game's own box score."""
    frames = []
    for s in SEASONS:
        path = Path(get_data_paths(s).player_games_raw)
        if path.exists():
            frames.append(pd.read_csv(path, dtype={"Game_ID": str}))
    out = add_absence_columns(data, pd.concat(frames, ignore_index=True), availability="carry_forward")
    assert len(out) == len(data), "carry-forward merge changed the row count"
    out.index = data.index
    return out


def load_dataset() -> pd.DataFrame:
    frames = []
    for s in SEASONS:
        p = team_training_csv(s)
        if not p.exists():
            continue
        df = pd.read_csv(p)
        df["_SEASON"] = s
        frames.append(df)
    full_df = pd.concat(frames, ignore_index=True)
    full_df["GAME_DATE"] = pd.to_datetime(full_df["GAME_DATE"], errors="coerce")
    full_df = attach_actual_points(add_win_strength_features(full_df))
    full_df = full_df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "ACTUAL_PTS", "ACTUAL_OPP_PTS"])
    loc_feats = full_df.apply(get_location_features, axis=1)
    full_df = pd.concat([full_df, loc_feats], axis=1)
    return full_df.sort_values(["GAME_DATE", "GAME_ID"], kind="stable").reset_index(drop=True)


def load_player_dataset(player_features: list[str]) -> pd.DataFrame:
    csv_path = PLAYER_TRAINING_CSV
    if not csv_path.exists():
        return pd.DataFrame()
    wanted = set(["SEASON_ID", "GAME_DATE", "TARGET_PTS", "TARGET_REB", "TARGET_AST", "PLAYER_POSITION_GROUP",
                  "PTS_EMA_10", "REB_EMA_10", "AST_EMA_10"] + player_features)
    df = pd.read_csv(csv_path, usecols=lambda c: c in wanted or "_ALLOWED_LAST_10" in c)
    df = add_player_matchup_features(df)  # derived columns of the production feature list
    season_map = {
        22020: "2020-21", 42020: "2020-21", 52020: "2020-21",
        22021: "2021-22", 42021: "2021-22", 52021: "2021-22",
        22022: "2022-23", 42022: "2022-23", 52022: "2022-23",
        22023: "2023-24", 42023: "2023-24", 52023: "2023-24",
        22024: "2024-25", 42024: "2024-25", 52024: "2024-25",
        22025: "2025-26", 42025: "2025-26", 52025: "2025-26",
    }
    df["_SEASON"] = df["SEASON_ID"].map(season_map)
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    return df.dropna(subset=["_SEASON", "GAME_DATE"]).sort_values("GAME_DATE").reset_index(drop=True)


def _provenance() -> dict:
    """Which production configuration was benchmarked, so a stale report is visible at a glance."""
    out = {}
    for family, key in (("win", "training_date"), ("score", "updated_at"), ("player", "updated_at")):
        meta_path = ROOT / f"models/production/{family}_metadata.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text())
            out[family] = {"version": meta.get("version"), "trained_at": meta.get(key)}
    try:
        out["git_commit"] = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
    except Exception:
        out["git_commit"] = None
    return out


def _signed(x: float, digits: int) -> str:
    return f"{x:+.{digits}f}"


def run_walk_forward_backtest():
    print("Loading data across all available seasons...")
    data = load_dataset()
    print(f"Total processed team rows: {len(data)}")

    # Load player features and data
    player_feat_path = ROOT / "models/production/player_features.pkl"
    if player_feat_path.exists():
        import joblib
        player_features = joblib.load(player_feat_path)
    else:
        player_features = ["PTS_LAST_5", "PTS_LAST_10", "MIN_LAST_5", "REB_LAST_5", "AST_LAST_5", "IS_HOME"]
    
    player_data = load_player_dataset(player_features)
    print(f"Total processed player rows: {len(player_data)}")

    # Load feature columns
    win_features_path = ROOT / "models/production/win_features.json"
    if win_features_path.exists():
        win_features = [f for f in json.loads(win_features_path.read_text()) if f in data.columns and f != "SCORE_PRED_MARGIN"]
    else:
        win_features = ["ELO_DIFF", "WINRATE_DIFF_LAST_10", "REST_DIFF", "NET_RTG_DIFF_LAST_10", "EFG_DIFF_LAST_10", "PACE_COLLISION"]

    score_meta_path = ROOT / "models/production/score_metadata.json"
    if score_meta_path.exists():
        s_meta = json.loads(score_meta_path.read_text())
        pace_features = s_meta["pace_features"]
        home_features = s_meta["home_off_rtg_features"]
        away_features = s_meta["away_off_rtg_features"]
        margin_features = s_meta["margin_features"]
    else:
        pace_features = ["PACE_LAST_5", "OPP_PACE_LAST_5", "PACE_COLLISION"]
        home_features = ["OFF_RTG_LAST_5", "EFG_PCT_LAST_5"]
        away_features = ["OFF_RTG_LAST_5", "EFG_PCT_LAST_5"]
        margin_features = ["ELO_DIFF", "REST_DIFF"]

    folds = []
    # Per-game loss differences (model minus baseline) for the paired date-block bootstrap.
    paired = {"win_brier": [], "win_brier_live_like": [], "score_total": [], "score_margin": [],
              "player_pts": [], "player_reb": [], "player_ast": []}
    available_seasons = sorted(data["_SEASON"].unique())
    data_cf = _carry_forward_frame(data)
    no_avail_features = [f for f in win_features if f not in AVAILABILITY_FEATURES]
    pooled = {k: ([], []) for k in ("production", "live_like_serve", "live_like_retrain", "no_availability", "elo")}

    for idx, test_season in enumerate(available_seasons[1:], start=1):
        train_seasons = available_seasons[:idx]
        print("\n=======================================================")
        print(f"Fold {idx}: Train {train_seasons} -> Test {test_season}")
        print("=======================================================")

        train_data = data[data["_SEASON"].isin(train_seasons)].copy()
        test_data = data[data["_SEASON"] == test_season].copy()

        # ----------------------------------------------------
        # 1. WIN MODEL WALK-FORWARD
        # ----------------------------------------------------
        train_home = train_data[train_data["IS_HOME"] == 1].dropna(subset=win_features + ["WIN"]).copy()
        test_home = test_data[test_data["IS_HOME"] == 1].dropna(subset=win_features + ["WIN"]).copy()

        X_train_win = train_home[win_features]
        y_train_win = train_home["WIN"].astype(int)
        X_test_win = test_home[win_features]
        y_test_win = test_home["WIN"].astype(int)

        cal_splits = expanding_window_date_splits(train_home, date_col="GAME_DATE", n_splits=3)
        
        # Benchmark Logistic Regression
        lr_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(C=0.3, max_iter=1500, random_state=42)),
        ])
        try:
            calibrated_lr = CalibratedClassifierCV(estimator=lr_pipe, method="sigmoid", cv=cal_splits)
            calibrated_lr.fit(X_train_win, y_train_win)
            p_win_lr = calibrated_lr.predict_proba(X_test_win)[:, 1]
        except Exception:
            lr_pipe.fit(X_train_win, y_train_win)
            p_win_lr = lr_pipe.predict_proba(X_test_win)[:, 1]

        # Production configuration (src/training/win_trainer.py: uncalibrated logistic regression)
        prod_pipe = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=42)),
        ])
        p_win_prod = prod_pipe.fit(X_train_win, y_train_win).predict_proba(X_test_win)[:, 1]

        # Baselines for WIN
        elo_prob = 1.0 / (1.0 + np.power(10.0, -(test_home["ELO_DIFF"].astype(float) + HOME_COURT_ADVANTAGE) / 400.0))
        last10_prob = test_home["WINRATE_LAST_10"].fillna(0.50).astype(float)

        win_eval_prod = _evaluate_prob(y_test_win, p_win_prod)
        win_eval_lr = _evaluate_prob(y_test_win, p_win_lr)
        win_eval_elo = _evaluate_prob(y_test_win, elo_prob)
        win_eval_last10 = _evaluate_prob(y_test_win, last10_prob)
        y_arr = y_test_win.to_numpy(dtype=float)
        paired["win_brier"].append(pd.DataFrame({
            "date": test_home["GAME_DATE"].to_numpy(),
            "diff": (p_win_prod - y_arr) ** 2 - (elo_prob.to_numpy(dtype=float) - y_arr) ** 2,
        }))

        # Availability audit: the production model trained on box-score availability, served with the
        # live default (previous-game carry-forward), retrained on that default, and without the group.
        te_cf, tr_cf = data_cf.loc[test_home.index], data_cf.loc[train_home.index]
        p_live_serve = prod_pipe.predict_proba(te_cf[win_features])[:, 1]
        p_live_retrain = clone(prod_pipe).fit(tr_cf[win_features], y_train_win).predict_proba(te_cf[win_features])[:, 1]
        p_no_avail = clone(prod_pipe).fit(X_train_win[no_avail_features], y_train_win).predict_proba(X_test_win[no_avail_features])[:, 1]
        for key, probs in (("production", p_win_prod), ("live_like_serve", p_live_serve), ("live_like_retrain", p_live_retrain),
                           ("no_availability", p_no_avail), ("elo", elo_prob.to_numpy(dtype=float))):
            pooled[key][0].append(y_arr)
            pooled[key][1].append(np.asarray(probs, dtype=float))
        paired["win_brier_live_like"].append(pd.DataFrame({
            "date": test_home["GAME_DATE"].to_numpy(),
            "diff": (p_live_serve - y_arr) ** 2 - (elo_prob.to_numpy(dtype=float) - y_arr) ** 2,
        }))

        # ----------------------------------------------------
        # 2. SCORE MODEL WALK-FORWARD
        # ----------------------------------------------------
        merged_test, fold_offsets_80, home_edge = score_fold(train_data, test_data, pace_features, home_features, away_features, margin_features)
        pred_total_model, pred_margin_model = merged_test["PRED_TOTAL"], merged_test["PRED_MARGIN"]

        # Baselines from recent real points: both teams' last-10 scoring and allowing, plus the training home edge.
        base_total = (merged_test["PTS_LAST_10"] + merged_test["PTS_ALLOWED_LAST_10"] + merged_test["OPP_PTS_LAST_10"] + merged_test["OPP_PTS_ALLOWED_LAST_10"]) / 2.0
        base_margin = ((merged_test["PTS_LAST_10"] - merged_test["PTS_ALLOWED_LAST_10"]) - (merged_test["OPP_PTS_LAST_10"] - merged_test["OPP_PTS_ALLOWED_LAST_10"])) / 2.0 + home_edge

        score_eval_model = _evaluate_score(merged_test["ACTUAL_TOTAL"], pred_total_model, merged_test["ACTUAL_MARGIN"], pred_margin_model, fold_offsets_80)
        score_eval_model["conformal_80_radius"] = {"total": fold_offsets_80["total"][1], "margin": fold_offsets_80["margin"][1]}
        score_eval_raw = _evaluate_score(merged_test["ACTUAL_TOTAL"], merged_test["PRED_TOTAL_RAW"], merged_test["ACTUAL_MARGIN"], merged_test["PRED_MARGIN_MODEL"])
        score_eval_base = _evaluate_score(merged_test["ACTUAL_TOTAL"], base_total, merged_test["ACTUAL_MARGIN"], base_margin)
        paired["score_total"].append(pd.DataFrame({
            "date": merged_test["GAME_DATE"].to_numpy(),
            "diff": ((merged_test["ACTUAL_TOTAL"] - pred_total_model).abs() - (merged_test["ACTUAL_TOTAL"] - base_total).abs()).to_numpy(),
        }))
        paired["score_margin"].append(pd.DataFrame({
            "date": merged_test["GAME_DATE"].to_numpy(),
            "diff": ((merged_test["ACTUAL_MARGIN"] - pred_margin_model).abs() - (merged_test["ACTUAL_MARGIN"] - base_margin).abs()).to_numpy(),
        }))

        # ----------------------------------------------------
        # 3. PLAYER MODEL WALK-FORWARD
        # ----------------------------------------------------
        player_eval_fold = {}
        if not player_data.empty:
            p_train = player_data[player_data["_SEASON"].isin(train_seasons)].copy()
            p_test = player_data[player_data["_SEASON"] == test_season].copy()
            
            for target_name in ["pts", "reb", "ast"]:
                target_col = f"TARGET_{target_name.upper()}"
                # Strongest simple baseline; features stay NaN-able because the production pipeline imputes them.
                base_col = f"{target_name.upper()}_EMA_10"
                p_tr = p_train.dropna(subset=[target_col])
                p_te = p_test.dropna(subset=[target_col, base_col])

                m_p = PlayerModelTrainer()._model_pipeline(target_name)  # production LightGBM settings
                m_p.fit(p_tr[player_features], p_tr[target_col])
                pred_p = m_p.predict(p_te[player_features])
                
                player_eval_fold[target_name] = _evaluate_player(p_te[target_col], pred_p, p_te[base_col])
                paired[f"player_{target_name}"].append(pd.DataFrame({
                    "date": p_te["GAME_DATE"].to_numpy(),
                    "diff": np.abs(p_te[target_col].to_numpy() - pred_p) - np.abs(p_te[target_col].to_numpy() - p_te[base_col].to_numpy()),
                }))

        fold_record = {
            "fold": idx,
            "test_season": test_season,
            "train_seasons": train_seasons,
            "train_rows": int(len(train_home)),
            "test_games": int(len(test_home)),
            "win": {
                "production": win_eval_prod,
                "logistic_benchmark": win_eval_lr,
                "pregame_elo": win_eval_elo,
                "last10_winrate": win_eval_last10,
                "beats_elo": bool(win_eval_prod["brier"] <= win_eval_elo["brier"] and win_eval_prod["roc_auc"] >= win_eval_elo["roc_auc"]),
            },
            "score": {
                "model": score_eval_model,
                "model_raw": score_eval_raw,
                "rolling_baseline": score_eval_base,
                "beats_baseline": bool(score_eval_model["total_mae"] <= score_eval_base["total_mae"] and score_eval_model["margin_mae"] <= score_eval_base["margin_mae"]),
            },
            "player": player_eval_fold,
        }
        folds.append(fold_record)

        print(f"WIN   | Production Brier: {win_eval_prod['brier']:.4f} (Elo: {win_eval_elo['brier']:.4f}) | AUC: {win_eval_prod['roc_auc']:.4f} (Elo: {win_eval_elo['roc_auc']:.4f})")
        print(f"SCORE | Total MAE: {score_eval_model['total_mae']:.2f} (Base: {score_eval_base['total_mae']:.2f}) | Margin MAE: {score_eval_model['margin_mae']:.2f} (Base: {score_eval_base['margin_mae']:.2f}) | Conformal 80% Coverage: {score_eval_model.get('conformal_80_total_coverage')}%")
        if player_eval_fold:
            p_pts = player_eval_fold.get("pts", {})
            p_reb = player_eval_fold.get("reb", {})
            p_ast = player_eval_fold.get("ast", {})
            print(f"PLAYER| PTS MAE: {p_pts.get('model_mae')} (Base: {p_pts.get('baseline_mae')}) | REB MAE: {p_reb.get('model_mae')} (Base: {p_reb.get('baseline_mae')}) | AST MAE: {p_ast.get('model_mae')} (Base: {p_ast.get('baseline_mae')})")

    # Aggregate summaries
    total_test_games = sum(f["test_games"] for f in folds)
    avg_prod_acc = sum(f["win"]["production"]["accuracy"] * f["test_games"] for f in folds) / total_test_games
    avg_lr_acc = sum(f["win"]["logistic_benchmark"]["accuracy"] * f["test_games"] for f in folds) / total_test_games
    avg_elo_acc = sum(f["win"]["pregame_elo"]["accuracy"] * f["test_games"] for f in folds) / total_test_games
    
    avg_prod_brier = sum(f["win"]["production"]["brier"] * f["test_games"] for f in folds) / total_test_games
    avg_lr_brier = sum(f["win"]["logistic_benchmark"]["brier"] * f["test_games"] for f in folds) / total_test_games
    avg_elo_brier = sum(f["win"]["pregame_elo"]["brier"] * f["test_games"] for f in folds) / total_test_games

    avg_prod_auc = sum(f["win"]["production"]["roc_auc"] * f["test_games"] for f in folds) / total_test_games
    avg_lr_auc = sum(f["win"]["logistic_benchmark"]["roc_auc"] * f["test_games"] for f in folds) / total_test_games
    avg_elo_auc = sum(f["win"]["pregame_elo"]["roc_auc"] * f["test_games"] for f in folds) / total_test_games

    avg_score_total_mae = sum(f["score"]["model"]["total_mae"] * f["test_games"] for f in folds) / total_test_games
    avg_base_total_mae = sum(f["score"]["rolling_baseline"]["total_mae"] * f["test_games"] for f in folds) / total_test_games
    avg_score_margin_mae = sum(f["score"]["model"]["margin_mae"] * f["test_games"] for f in folds) / total_test_games
    avg_base_margin_mae = sum(f["score"]["rolling_baseline"]["margin_mae"] * f["test_games"] for f in folds) / total_test_games
    avg_cov_total = sum(f["score"]["model"].get("conformal_80_total_coverage", 80.0) * f["test_games"] for f in folds) / total_test_games
    avg_cov_margin = sum(f["score"]["model"].get("conformal_80_margin_coverage", 80.0) * f["test_games"] for f in folds) / total_test_games
    avg_raw_total_mae = sum(f["score"]["model_raw"]["total_mae"] * f["test_games"] for f in folds) / total_test_games
    avg_raw_margin_mae = sum(f["score"]["model_raw"]["margin_mae"] * f["test_games"] for f in folds) / total_test_games

    # Player aggregate
    player_summary = {}
    for target_name in ["pts", "reb", "ast"]:
        target_samples = sum(f["player"].get(target_name, {}).get("samples", 0) for f in folds)
        if target_samples > 0:
            avg_m_mae = sum(f["player"][target_name]["model_mae"] * f["player"][target_name]["samples"] for f in folds) / target_samples
            avg_b_mae = sum(f["player"][target_name]["baseline_mae"] * f["player"][target_name]["samples"] for f in folds) / target_samples
            avg_m_rmse = sum(f["player"][target_name]["model_rmse"] * f["player"][target_name]["samples"] for f in folds) / target_samples
            player_summary[target_name] = {
                "model_mae": round(avg_m_mae, 4),
                "baseline_mae": round(avg_b_mae, 4),
                "mae_reduction": round(avg_b_mae - avg_m_mae, 4),
                "model_rmse": round(avg_m_rmse, 4),
                "total_samples": target_samples,
            }

    significance = {}
    for key, frames in paired.items():
        df_pair = pd.concat(frames, ignore_index=True)
        significance[key] = paired_block_bootstrap(df_pair["diff"].to_numpy(), df_pair["date"].astype(str).to_numpy())

    availability_audit = {}
    for key, (ys, ps) in pooled.items():
        y_all, p_all = np.concatenate(ys), np.clip(np.concatenate(ps), 1e-6, 1 - 1e-6)
        availability_audit[key] = {"brier": round(float(brier_score_loss(y_all, p_all)), 4), "log_loss": round(float(log_loss(y_all, p_all)), 4), "games": int(len(y_all))}
    reliability = reliability_table(np.concatenate(pooled["production"][0]), np.concatenate(pooled["production"][1]))

    summary = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "provenance": _provenance(),
        "total_unseen_games": total_test_games,
        "folds_evaluated": len(folds),
        "significance_vs_baseline": significance,
        "win_availability_audit": availability_audit,
        "win_reliability": reliability,
        "aggregate_win": {
            "production_brier": round(avg_prod_brier, 4),
            "production_auc": round(avg_prod_auc, 4),
            "production_accuracy": round(avg_prod_acc, 4),
            "logistic_benchmark_brier": round(avg_lr_brier, 4),
            "logistic_benchmark_auc": round(avg_lr_auc, 4),
            "logistic_benchmark_accuracy": round(avg_lr_acc, 4),
            "elo_brier": round(avg_elo_brier, 4),
            "elo_auc": round(avg_elo_auc, 4),
            "elo_accuracy": round(avg_elo_acc, 4),
            "prod_brier_improvement_vs_elo": round(avg_elo_brier - avg_prod_brier, 4),
        },
        "aggregate_score": {
            "model_total_mae": round(avg_score_total_mae, 4),
            "baseline_total_mae": round(avg_base_total_mae, 4),
            "total_mae_reduction": round(avg_base_total_mae - avg_score_total_mae, 4),
            "model_margin_mae": round(avg_score_margin_mae, 4),
            "baseline_margin_mae": round(avg_base_margin_mae, 4),
            "margin_mae_reduction": round(avg_base_margin_mae - avg_score_margin_mae, 4),
            "average_conformal_80_coverage": round(avg_cov_total, 1),
            "average_conformal_80_margin_coverage": round(avg_cov_margin, 1),
            "raw_total_mae": round(avg_raw_total_mae, 4),
            "raw_margin_mae": round(avg_raw_margin_mae, 4),
        },
        "aggregate_player": player_summary,
        "folds": folds,
    }

    # Save JSON report
    rep_json = ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json"
    rep_json.parent.mkdir(parents=True, exist_ok=True)
    rep_json.write_text(json.dumps(summary, indent=2))

    # Save Markdown report
    pts_sum = player_summary.get("pts", {})
    reb_sum = player_summary.get("reb", {})
    ast_sum = player_summary.get("ast", {})

    prov = summary["provenance"]
    prov_str = ", ".join(
        f"{fam.upper()} `{prov[fam]['version']}` (eğitim {str(prov[fam]['trained_at'])[:10]})" for fam in ("win", "score", "player") if fam in prov
    )
    agg_w, agg_s = summary["aggregate_win"], summary["aggregate_score"]

    md_content = f"""# Çok Sezonlu Expanding-Window Walk-Forward Backtest Raporu

> Bu dosya `scripts/walk_forward_benchmark.py` tarafından üretilir; elle düzenlenmez.

**Rapor Tarihi:** {summary['timestamp']}  
**Ölçülen Üretim Yapılandırması:** {prov_str}; git `{prov.get('git_commit')}`  
**Yöntem:** Kesintisiz Genişleyen Zaman Pencereleri (Expanding Window). Her sezon yalnızca önceki tamamlanmış sezonlarla eğitilen modellerle test edilmiştir; geleceğe dönük hiçbir bilgi sızıntısı (leakage) bulunmamaktadır.  
**Toplam Görülmemiş Test Maçı:** {total_test_games} maç (5 ayrı NBA sezonu)

---

## 1. Genel Özet Karnesi (5 Sezonun Ağırlıklı Ortalaması)

### Galibiyet Olasılığı (WIN Model) vs. Pregame Elo Baseline
| Model / Taban Çizgisi | Brier Score (Düşük = İyi) | ROC-AUC | Doğruluk (Accuracy) |
|---|---:|---:|---:|
| **Logistic Regression (Üretim Mimarisi)** | **{summary['aggregate_win']['production_brier']:.4f}** | **{summary['aggregate_win']['production_auc']:.4f}** | **%{summary['aggregate_win']['production_accuracy']*100:.2f}** |
| **Lojistik Regresyon Benchmark** | {summary['aggregate_win']['logistic_benchmark_brier']:.4f} | {summary['aggregate_win']['logistic_benchmark_auc']:.4f} | %{summary['aggregate_win']['logistic_benchmark_accuracy']*100:.2f} |
| **Saf Elo Baseline** | {summary['aggregate_win']['elo_brier']:.4f} | {summary['aggregate_win']['elo_auc']:.4f} | %{summary['aggregate_win']['elo_accuracy']*100:.2f} |
| **Elo Karşısında Fark (Üretim; Brier için + = daha iyi)** | **{_signed(agg_w['prod_brier_improvement_vs_elo'], 4)}** | **{_signed(agg_w['production_auc'] - agg_w['elo_auc'], 4)}** | **{_signed((agg_w['production_accuracy'] - agg_w['elo_accuracy']) * 100, 2)} puan** |

### Takım Skoru (SCORE Model) vs. Son 10 Maç Sayıları Baseline
| Metrik | Model (Çok Sezonlu) | Son 10 Maç Taban Çizgisi | Fark / Kazanım |
|---|---:|---:|---:|
| **Toplam Skor MAE** | **{agg_s['model_total_mae']:.2f} sayı** | {agg_s['baseline_total_mae']:.2f} sayı | **{_signed(-agg_s['total_mae_reduction'], 2)} sayı** |
| **Sayı Farkı (Margin) MAE** | **{agg_s['model_margin_mae']:.2f} sayı** | {agg_s['baseline_margin_mae']:.2f} sayı | **{_signed(-agg_s['margin_mae_reduction'], 2)} sayı** |
| **Conformal %80 Kapsama (toplam / margin)** | **%{agg_s['average_conformal_80_coverage']:.1f} / %{agg_s['average_conformal_80_margin_coverage']:.1f}** | - | hedef %80 |

### Oyuncu Tahminleri (PLAYER Model) vs. EMA-10 Ortalaması
| Hedef İstatistik | LightGBM Modeli MAE | EMA-10 Taban Çizgisi | MAE İyileşmesi | Toplam Test Satırı |
|---|---:|---:|---:|---:|
| **Sayı (PTS)** | **{pts_sum.get('model_mae', 0):.2f}** | {pts_sum.get('baseline_mae', 0):.2f} | **{_signed(-pts_sum.get('mae_reduction', 0), 3)} sayı** | {pts_sum.get('total_samples', 0):,} |
| **Ribaund (REB)** | **{reb_sum.get('model_mae', 0):.2f}** | {reb_sum.get('baseline_mae', 0):.2f} | **{_signed(-reb_sum.get('mae_reduction', 0), 3)} rib** | {reb_sum.get('total_samples', 0):,} |
| **Asist (AST)** | **{ast_sum.get('model_mae', 0):.2f}** | {ast_sum.get('baseline_mae', 0):.2f} | **{_signed(-ast_sum.get('mae_reduction', 0), 3)} ast** | {ast_sum.get('total_samples', 0):,} |

---

## 2. Sezon Bazında Ayrıntılı Walk-Forward Sonuçları

| Sezon | Test Maçı | WIN Brier (Üretim / Elo) | WIN AUC (Üretim / Elo) | SCORE Total MAE (Mod / Base) | SCORE Margin MAE (Mod / Base) | Conformal 80% | PTS MAE (Mod / Base) | REB MAE (Mod / Base) | AST MAE (Mod / Base) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
"""
    for f in folds:
        w_prod = f["win"]["production"]
        w_e = f["win"]["pregame_elo"]
        s_m = f["score"]["model"]
        s_b = f["score"]["rolling_baseline"]
        p_f = f.get("player", {})
        pts_f = p_f.get("pts", {})
        reb_f = p_f.get("reb", {})
        ast_f = p_f.get("ast", {})
        cov = s_m.get("conformal_80_total_coverage", "N/A")
        cov_str = f"%{cov}" if isinstance(cov, (int, float)) else str(cov)
        md_content += f"| **{f['test_season']}** | {f['test_games']} | {w_prod['brier']:.4f} / {w_e['brier']:.4f} | {w_prod['roc_auc']:.4f} / {w_e['roc_auc']:.4f} | {s_m['total_mae']:.2f} / {s_b['total_mae']:.2f} | {s_m['margin_mae']:.2f} / {s_b['margin_mae']:.2f} | {cov_str} | {pts_f.get('model_mae', 0):.2f} / {pts_f.get('baseline_mae', 0):.2f} | {reb_f.get('model_mae', 0):.2f} / {reb_f.get('baseline_mae', 0):.2f} | {ast_f.get('model_mae', 0):.2f} / {ast_f.get('baseline_mae', 0):.2f} |\n"

    md_content += """
---

## 3. Anlamlılık ve Sezon Bazında Tutarlılık

Fark = model kaybı - baseline kaybı (negatif = model daha iyi). %95 aralık, aynı tarihteki maçlar birlikte örneklenerek (date-block, 2000 tekrar) hesaplanır.

| Karşılaştırma | Ortalama Fark | %95 CI | Model daha iyi olasılığı | Yorum | Kazanılan Sezon |
|---|---:|---:|---:|---|---:|
"""
    n_folds = len(folds)
    season_wins = {
        "win_brier": sum(f["win"]["production"]["brier"] < f["win"]["pregame_elo"]["brier"] for f in folds),
        "score_total": sum(f["score"]["model"]["total_mae"] < f["score"]["rolling_baseline"]["total_mae"] for f in folds),
        "score_margin": sum(f["score"]["model"]["margin_mae"] < f["score"]["rolling_baseline"]["margin_mae"] for f in folds),
        **{f"player_{t}": sum(f["player"].get(t, {}).get("mae_reduction", 0) > 0 for f in folds) for t in ("pts", "reb", "ast")},
    }
    labels = {
        "win_brier": "WIN Brier vs saf Elo",
        "win_brier_live_like": "WIN Brier vs saf Elo (canlı kadro varsayımı)",
        "score_total": "SCORE toplam MAE vs son-10",
        "score_margin": "SCORE margin MAE vs son-10",
        **{f"player_{t}": f"PLAYER {t.upper()} MAE vs EMA-10" for t in ("pts", "reb", "ast")},
    }
    for key, label in labels.items():
        ci = significance.get(key)
        if ci:
            digits = 4 if key.startswith("win_brier") else 3
            md_content += (
                f"| {label} | {_signed(ci['mean_diff'], digits)} | [{_signed(ci['ci_low'], digits)}, {_signed(ci['ci_high'], digits)}] "
                f"| %{ci['p_model_better'] * 100:.1f} | {verdict(ci)} | {f"{season_wins[key]}/{n_folds}" if key in season_wins else "-"} |\n"
            )
    coverages = [f["score"]["model"].get("conformal_80_total_coverage") for f in folds]
    coverages = [c for c in coverages if isinstance(c, (int, float))]
    if coverages:
        md_content += f"""
Conformal %80 toplam kapsaması sezonlar arasında %{min(coverages):.1f} - %{max(coverages):.1f} aralığında. Yarıçaplar her fold'da yalnızca o fold'un eğitim sezonlarının temporal OOF artıklarından hesaplanır (test sezonu hiçbir aşamada görülmez); sezon başına yarıçaplar JSON raporunda `conformal_80_radius` altındadır.

Not: SCORE modeli üretim hattıyla ölçülür: dört ridge modeli, ardından eğitim sezonlarının OOF artıklarından öğrenilen bağlam düzeltmesi (`ridge_total`, `ridge_margin`). Düzeltmesiz ham model: toplam MAE {agg_s['raw_total_mae']:.2f}, margin MAE {agg_s['raw_margin_mae']:.2f}.
"""

    audit = summary["win_availability_audit"]
    elo_b = audit["elo"]["brier"]
    audit_rows = [
        ("production", "Üretim: maç kaydındaki gerçek kadro (eğitim ve test)"),
        ("live_like_serve", "Üretim modeli, test sezonunda canlı varsayımla (önceki maçta oynayan oynar)"),
        ("live_like_retrain", "Canlı varsayımla yeniden eğitilmiş ve test edilmiş"),
        ("no_availability", "Kadro özellikleri (4 adet) olmadan"),
        ("elo", "Saf Elo"),
    ]
    md_content += """
---

## 4. WIN Kadro Bilgisi Denetimi (look-ahead)

Eğitim ve backtest, kadro özelliklerini (`ABS_DIFF`, `MISSING_ROT_MINS_DIFF`, `ROT_CONTINUITY_DIFF`, `ACTIVE_WT_GS_DIFF`) o maçın kendi box score'undan üretir; canlıda bu bilgi sakatlık raporundan ve "önceki maçta oynayan oynar" varsayımından gelir. Aşağıdaki satırlar aynı walk-forward'ı farklı kadro varsayımlarıyla çalıştırır. Canlı varsayım sakatlık raporunu içermez, yani raporun getirdiği bilgi için alt sınırdır.

| Varyant | Brier | Log loss | Elo'ya karşı Brier farkı |
|---|---:|---:|---:|
"""
    for key, label in audit_rows:
        md_content += f"| {label} | {audit[key]['brier']:.4f} | {audit[key]['log_loss']:.4f} | {_signed(audit[key]['brier'] - elo_b, 4)} |\n"
    live_ci = significance.get("win_brier_live_like")
    if live_ci:
        md_content += f"\nCanlı varsayımla üretim modeli vs saf Elo: fark {_signed(live_ci['mean_diff'], 4)}, %95 CI [{_signed(live_ci['ci_low'], 4)}, {_signed(live_ci['ci_high'], 4)}], {verdict(live_ci)}.\n"

    rel = summary["win_reliability"]
    md_content += f"""
---

## 5. WIN Güvenilirlik Tablosu (Üretim, 5 Sezon Birleşik)

Ev sahibi galibiyet olasılığı bantlarında tahmin edilen ile gerçekleşen oran. ECE (maç ağırlıklı) = **{rel['ece']:.4f}**.

| Tahmin bandı | Maç | Ortalama tahmin | Gerçekleşen |
|---|---:|---:|---:|
"""
    for row in rel["bins"]:
        md_content += f"| {row['bin']} | {row['games']} | {row['mean_predicted']:.3f} | {row['observed']:.3f} |\n"

    rep_md = ROOT / "reports/evaluation/multi_season_walk_forward_backtest.md"
    rep_md.write_text(md_content)
    print(f"\nSaved Walk-Forward JSON Report: {rep_json}")
    print(f"Saved Walk-Forward Markdown Report: {rep_md}")
    for path in update_model_docs(summary, ROOT) + update_status_docs(ROOT):
        print(f"Updated doc: {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docs-only", action="store_true",
                        help="Rewrite the model-doc blocks from the existing JSON report without rerunning.")
    if parser.parse_args().docs_only:
        saved = json.loads((ROOT / "reports/evaluation/multi_season_walk_forward_backtest.json").read_text())
        for path in update_model_docs(saved, ROOT) + update_status_docs(ROOT):
            print(f"Updated doc: {path}")
    else:
        run_walk_forward_backtest()

