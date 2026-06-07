"""
Build Win Probability Model V2 dataset (team + player features) and train/evaluate multiple models.
Outputs:
 - data/processed/team_win_model_ready_v2_player_features.csv
 - models/win_probability_model_v2.pkl
 - models/win_probability_v2_metadata.json
 - models/win_probability_v2_feature_columns.json
 - reports/win_probability_v2_report.md
 - reports/win_model_v1_vs_v2_comparison.csv
 - reports/win_model_v2_feature_audit.csv
 - reports/win_model_v2_backtest_predictions.csv
 - reports/win_model_v2_backtest_summary.json

This script reuses compute_player_features_for_inference from scripts/build_matchup_features.py
to ensure feature logic is not duplicated and is leakage-free (uses only games before prediction_date).
"""

import os
import sys
from pathlib import Path
import json
import time
import pandas as pd
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             roc_auc_score, confusion_matrix, brier_score_loss)
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.inspection import permutation_importance
import joblib

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "scripts"))

try:
    from build_matchup_features import compute_player_features_for_inference
except Exception as e:
    # fallback: import by full path
    from scripts.build_matchup_features import compute_player_features_for_inference

# Paths helper for dynamic seasons
def get_paths(season=None, output_scope="production"):
    from scripts.data_paths import get_data_paths
    from scripts.season_utils import season_to_file_token
    dp = get_data_paths(season)
    token = season_to_file_token(season or "2025-26")
    
    if output_scope == "experimental":
        output_dataset = ROOT / f"data/experimental/team_win_model_ready_v2_{token}.csv"
        feature_cols_out = ROOT / f"data/experimental/win_probability_v2_feature_columns_{token}.json"
        model_out = ROOT / f"data/experimental/win_probability_model_v2_{token}.pkl"
        metadata_out = ROOT / f"data/experimental/win_probability_v2_metadata_{token}.json"
        report_md = ROOT / f"data/experimental/win_probability_v2_report_{token}.md"
        report_compare = ROOT / f"data/experimental/win_model_v1_vs_v2_comparison_{token}.csv"
        feature_audit = ROOT / f"data/experimental/win_model_v2_feature_audit_{token}.csv"
        backtest_pred = ROOT / f"data/experimental/win_model_v2_backtest_predictions_{token}.csv"
        backtest_sum = ROOT / f"data/experimental/win_model_v2_backtest_summary_{token}.json"
        fixed_model_out = ROOT / f"data/experimental/win_probability_model_v2_fixed_{token}.pkl"
        fixed_meta_out = ROOT / f"data/experimental/win_probability_v2_fixed_metadata_{token}.json"
        feature_cols_out_fixed = ROOT / f"data/experimental/win_probability_v2_fixed_feature_columns_{token}.json"
        team_perspective = ROOT / f"data/experimental/win_model_v2_backtest_team_perspective_{token}.csv"
        game_level_path = ROOT / f"data/experimental/win_model_v2_backtest_game_level_{token}.csv"
    else:
        output_dataset = Path(dp.win_model_dataset)
        feature_cols_out = ROOT / "models/win_probability_v2_feature_columns.json" if token == "2025_26" else ROOT / f"models/win_probability_v2_feature_columns_{token}.json"
        model_out = ROOT / "models/win_probability_model_v2.pkl" if token == "2025_26" else ROOT / f"models/win_probability_model_v2_{token}.pkl"
        metadata_out = ROOT / "models/win_probability_v2_metadata.json" if token == "2025_26" else ROOT / f"models/win_probability_v2_metadata_{token}.json"
        report_md = ROOT / "reports/win_probability_v2_report.md" if token == "2025_26" else ROOT / f"reports/win_probability_v2_report_{token}.md"
        report_compare = ROOT / "reports/win_model_v1_vs_v2_comparison.csv" if token == "2025_26" else ROOT / f"reports/win_model_v1_vs_v2_comparison_{token}.csv"
        feature_audit = ROOT / "reports/win_model_v2_feature_audit.csv" if token == "2025_26" else ROOT / f"reports/win_model_v2_feature_audit_{token}.csv"
        backtest_pred = ROOT / "reports/win_model_v2_backtest_predictions.csv" if token == "2025_26" else ROOT / f"reports/win_model_v2_backtest_predictions_{token}.csv"
        backtest_sum = ROOT / "reports/win_model_v2_backtest_summary.json" if token == "2025_26" else ROOT / f"reports/win_model_v2_backtest_summary_{token}.json"
        fixed_model_out = ROOT / "models/win_probability_model_v2_fixed.pkl" if token == "2025_26" else ROOT / f"models/win_probability_model_v2_fixed_{token}.pkl"
        fixed_meta_out = ROOT / "models/win_probability_v2_fixed_metadata.json" if token == "2025_26" else ROOT / f"models/win_probability_v2_fixed_metadata_{token}.json"
        feature_cols_out_fixed = ROOT / "models/win_probability_v2_fixed_feature_columns.json" if token == "2025_26" else ROOT / f"models/win_probability_v2_fixed_feature_columns_{token}.json"
        team_perspective = ROOT / "reports/win_model_v2_backtest_team_perspective.csv" if token == "2025_26" else ROOT / f"reports/win_model_v2_backtest_team_perspective_{token}.csv"
        game_level_path = ROOT / "reports/win_model_v2_backtest_game_level.csv" if token == "2025_26" else ROOT / f"reports/win_model_v2_backtest_game_level_{token}.csv"

    if output_scope == "experimental" and token == "2024_25":
        team_v1_path = ROOT / "data/experimental/team_games_features_2024_25.csv"
    else:
        team_v1_path = Path(dp.team_model_ready_v2)

    return {
        "TEAM_V1_PATH": Path(team_v1_path),
        "OUTPUT_DATASET": Path(output_dataset),
        "FEATURE_COLS_OUT": Path(feature_cols_out),
        "MODEL_OUT": Path(model_out),
        "METADATA_OUT": Path(metadata_out),
        "REPORT_MD": Path(report_md),
        "REPORT_COMPARE": Path(report_compare),
        "FEATURE_AUDIT": Path(feature_audit),
        "BACKTEST_PRED": Path(backtest_pred),
        "BACKTEST_SUM": Path(backtest_sum),
        "fixed_model_out": Path(fixed_model_out),
        "fixed_meta_out": Path(fixed_meta_out),
        "FEATURE_COLS_OUT_FIXED": Path(feature_cols_out_fixed),
        "team_perspective": Path(team_perspective),
        "game_level_path": Path(game_level_path),
    }


def _pick_column(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _build_gameid_mapping_from_results(df_results: pd.DataFrame) -> pd.DataFrame:
    """
    Build a natural-key -> canonical GAME_ID mapping from results.
    Natural key columns:
      - GAME_DATE (YYYY-MM-DD)
      - TEAM_ABBREVIATION (team side of the row)
      - OPPONENT_ABBREVIATION (opponent side)
      - IS_HOME (1 for home perspective, 0 for away)

    Returns a DataFrame with columns:
      ["GAME_DATE","TEAM_ABBREVIATION","OPPONENT_ABBREVIATION","IS_HOME","GAME_ID"]
    """
    df = df_results.copy()
    # Normalize date
    if "GAME_DATE" in df.columns:
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.strftime("%Y-%m-%d")

    # Identify team abbreviation columns
    home_col = _pick_column(df, ["HOME_TEAM_ABBREVIATION", "HOME_TEAM", "HOME_ABBR", "HOME"])
    away_col = _pick_column(df, ["AWAY_TEAM_ABBREVIATION", "AWAY_TEAM", "AWAY_ABBR", "AWAY"])
    if home_col is None or away_col is None:
        raise RuntimeError("Could not identify home/away team abbreviation columns in game_results")

    needed = [c for c in ["GAME_ID", "GAME_DATE", home_col, away_col] if c is not None]
    miss = [c for c in ["GAME_ID", "GAME_DATE", home_col, away_col] if c not in df.columns]
    if miss:
        raise RuntimeError(f"Missing required columns in game_results: {miss}")

    df = df[needed].copy()
    df.rename(columns={home_col: "HOME_ABBR", away_col: "AWAY_ABBR"}, inplace=True)

    # Build two perspectives per game
    home_rows = df.rename(columns={"HOME_ABBR": "TEAM_ABBREVIATION", "AWAY_ABBR": "OPPONENT_ABBREVIATION"}).copy()
    home_rows["IS_HOME"] = 1
    away_rows = df.rename(columns={"AWAY_ABBR": "TEAM_ABBREVIATION", "HOME_ABBR": "OPPONENT_ABBREVIATION"}).copy()
    away_rows["IS_HOME"] = 0

    map_df = pd.concat([home_rows, away_rows], ignore_index=True)
    # Keep essential columns
    return map_df[["GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME", "GAME_ID"]]


def _apply_gameid_remap_if_needed(df: pd.DataFrame, season: str | None, output_scope: str, dataset_only: bool) -> tuple[pd.DataFrame, dict]:
    """
    For season=="2024-25" & output_scope=="experimental" & dataset_only==True, remap GAME_IDs using
    natural key from game_results. Produces audit stats.

    Returns (df_out, stats_dict)
    """
    stats = {
        "enabled": False,
        "remapped_rows": 0,
        "unmapped_rows": 0,
        "duplicate_nkeys": 0,
        "final_intersection": 0,
    }

    if not (season == "2024-25" and output_scope == "experimental" and dataset_only):
        return df, stats

    stats["enabled"] = True
    # Load game_results to build canonical mapping
    from scripts.data_paths import get_data_paths
    dp = get_data_paths(season)
    results_path = Path(dp.game_results)
    # 2024-25 experimental dataset-only should read experimental game_results
    if season == "2024-25" and output_scope == "experimental" and dataset_only:
        exp_results_path = ROOT / "data/experimental/game_results_2024_25.csv"
        # Prefer experimental path when available; otherwise keep default to avoid breaking other flows
        if exp_results_path.exists():
            results_path = exp_results_path
    df_results = pd.read_csv(results_path)

    # Build mapping and detect duplicate natural keys
    map_df = _build_gameid_mapping_from_results(df_results)
    # Duplicate detection
    dup_counts = map_df.groupby(["GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME"]).size()
    duplicate_keys = dup_counts[dup_counts > 1]
    stats["duplicate_nkeys"] = int(duplicate_keys.shape[0])

    # Prepare feature-side natural key
    df2 = df.copy()
    # Normalize date string
    df2["GAME_DATE"] = pd.to_datetime(df2["GAME_DATE"]).dt.strftime("%Y-%m-%d")
    # IS_HOME: prefer numeric/bool column; else parse from MATCHUP
    if "IS_HOME" in df2.columns:
        is_home_series = df2["IS_HOME"].astype(str).str.lower().isin(["1", "true", "t", "yes"]).astype(int)
    else:
        # Parse MATCHUP like "LAL vs. BOS" or "LAL @ BOS"
        m = df2.get("MATCHUP", "")
        is_home_series = m.astype(str).str.contains("vs.").astype(int)
    df2["IS_HOME"] = is_home_series

    # Ensure required columns exist
    req = ["GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME"]
    for c in req:
        if c not in df2.columns:
            raise RuntimeError(f"Required column missing in features for remap: {c}")

    # Left-join by natural key
    merged = df2.merge(map_df, on=["GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME"], how="left", suffixes=("", "_MAP"))
    # GAME_ID from features may be misaligned; keep original and add canonical
    merged.rename(columns={"GAME_ID": "GAME_ID_ORIG", "GAME_ID_MAP": "GAME_ID"}, inplace=True)

    stats["remapped_rows"] = int(merged["GAME_ID"].notna().sum())
    stats["unmapped_rows"] = int(merged["GAME_ID"].isna().sum())
    # Final intersection against results GAME_ID set
    res_ids = set(df_results["GAME_ID"].astype(str).tolist())
    inter = set(merged["GAME_ID"].dropna().astype(str).unique()) & res_ids
    stats["final_intersection"] = int(len(inter))

    # If coverage < 95%, fail fast with report
    total_rows = merged.shape[0]
    coverage = (stats["remapped_rows"] / total_rows) if total_rows else 0.0
    report = []
    report.append("# 2024-25 Experimental Remap Report — Win Dataset")
    report.append("")
    report.append(f"Remapped rows: {stats['remapped_rows']}")
    report.append(f"Unmapped rows: {stats['unmapped_rows']}")
    report.append(f"Duplicate natural keys in mapping: {stats['duplicate_nkeys']}")
    report.append(f"Final GAME_ID intersection count: {stats['final_intersection']}")
    report.append(f"Total feature rows: {total_rows}")
    report.append(f"Coverage: {coverage*100:.2f}%")
    out_md = ROOT / "reports/audits/win_dataset_remap_2024_25_experimental.md"
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text("\n".join(report))

    if coverage < 0.95:
        raise RuntimeError("Remap coverage below 95% for 2024-25 experimental (win dataset). Aborting dataset generation.")

    return merged, stats


def build_dataset(season=None, output_scope="production", dataset_only: bool = False):
    paths = get_paths(season, output_scope)
    os.makedirs(paths["OUTPUT_DATASET"].parent, exist_ok=True)
    print("Loading V1 team dataset:", paths["TEAM_V1_PATH"])
    df = pd.read_csv(paths["TEAM_V1_PATH"], parse_dates=["GAME_DATE"])

    # Apply experimental-only GAME_ID remap if requested context
    df, remap_stats = _apply_gameid_remap_if_needed(df, season or "", output_scope, dataset_only)

    # Ensure WIN target exists
    if "WIN" not in df.columns:
        raise RuntimeError("WIN target not found in V1 dataset")

    # Identify player feature names from build_matchup_features default list
    sample_feats = compute_player_features_for_inference("LAL", "BOS", df.iloc[0]["GAME_DATE"].strftime("%Y-%m-%d"), season=season)
    player_feat_names = [k for k in sample_feats.keys()]

    # Iterate rows and compute player features leakage-free
    print(f"Computing player features for {len(df)} matchups...")
    rows = []
    start = time.time()
    for i, row in df.iterrows():
        home = row["TEAM_ABBREVIATION"]
        away = row["OPPONENT_ABBREVIATION"]
        pred_date = row["GAME_DATE"].strftime("%Y-%m-%d")
        try:
            p_feats = compute_player_features_for_inference(home, away, pred_date, season=season)
        except Exception as e:
            print(f"Warning: player feature computation failed for index {i} ({home} vs {away} @ {pred_date}): {e}")
            p_feats = {k: 0.0 for k in player_feat_names}
        rows.append(p_feats)
        if (i+1) % 200 == 0:
            print(f"  processed {i+1}/{len(df)}")
    dur = time.time() - start
    print(f"Player feature computation completed in {dur:.1f}s")

    df_player = pd.DataFrame(rows)
    df_out = pd.concat([df.reset_index(drop=True), df_player.reset_index(drop=True)], axis=1)

    # Save dataset
    df_out.to_csv(paths["OUTPUT_DATASET"], index=False)
    print("Saved dataset:", paths["OUTPUT_DATASET"])

    # Write feature columns (V1 features + player features) order for model
    v1_cols = json.loads((ROOT / "models/feature_columns.json").read_text())
    # Ensure we only include pre-game input features (exclude target WIN)
    all_cols = [c for c in v1_cols if c != "WIN"] + [c for c in player_feat_names if c != "WIN"]
    # Final safety assertion to prevent target leakage
    assert "WIN" not in all_cols, "WIN must not be included in feature columns"
    paths["FEATURE_COLS_OUT"].write_text(json.dumps(all_cols, indent=2))
    print("Saved feature columns list to:", paths["FEATURE_COLS_OUT"])
    return df_out, all_cols


def evaluate_and_train(df, feature_cols, season=None):
    paths = get_paths(season)
    # Separate metadata
    meta_cols = [c for c in ["GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION"] if c in df.columns]
    meta = df[meta_cols].copy()
    # X are provided feature columns (pre-game inputs); target WIN kept separately in df
    X = df[feature_cols].copy()
    if "WIN" not in df.columns:
        raise RuntimeError("WIN target missing from dataset")
    y = df["WIN"].astype(int)

    # Chronological split using GAME_DATE quantile as in V1
    meta["GAME_DATE"] = pd.to_datetime(meta["GAME_DATE"])
    split_date = meta["GAME_DATE"].quantile(0.8)
    train_idx = meta.index[meta["GAME_DATE"] <= split_date].tolist()
    test_idx = meta.index[meta["GAME_DATE"] > split_date].tolist()
    if len(train_idx) == 0 or len(test_idx) == 0:
        raise RuntimeError("Chronological split failed — insufficient coverage")

    X_train = X.loc[train_idx]
    X_test = X.loc[test_idx]
    y_train = y.loc[train_idx]
    y_test = y.loc[test_idx]

    # Prepare pipelines
    imputer = SimpleImputer(strategy="mean")
    scaler = StandardScaler()

    lr = Pipeline([("imputer", imputer), ("scaler", scaler), ("clf", LogisticRegression(max_iter=1000, random_state=42))])
    rf = Pipeline([("imputer", imputer), ("clf", RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1))])
    gb = Pipeline([("imputer", imputer), ("clf", GradientBoostingClassifier(n_estimators=200, random_state=42))])

    models = {"logistic_regression": lr, "random_forest": rf, "gradient_boosting": gb}

    # Try LightGBM if available
    try:
        import lightgbm as lgb
        lgbm = Pipeline([("imputer", imputer), ("clf", lgb.LGBMClassifier(n_estimators=200, random_state=42))])
        models["lightgbm"] = lgbm
        print("LightGBM available and added to training list")
    except Exception:
        print("LightGBM not available; skipping")

    results = []
    preds_store = {}
    for name, model in models.items():
        print(f"Training {name}...")
        model.fit(X_train, y_train)
        # Predict
        try:
            y_proba = model.predict_proba(X_test)[:, 1]
        except Exception:
            y_proba = model.decision_function(X_test)
        y_pred = (y_proba >= 0.5).astype(int)
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        roc = roc_auc_score(y_test, y_proba)
        brier = brier_score_loss(y_test, y_proba)
        cm = confusion_matrix(y_test, y_pred)
        print(f"{name} -- Acc {acc:.4f}, ROC-AUC {roc:.4f}, Brier {brier:.4f}")
        results.append({"model": name, "accuracy": acc, "precision": prec, "recall": rec, "f1": f1, "roc_auc": roc, "brier": brier})
        preds_store[name] = {"y_test_idx": list(y_test.index), "y_test": y_test.tolist(), "y_proba": y_proba.tolist(), "y_pred": y_pred.tolist()}

    metrics_df = pd.DataFrame(results)
    metrics_df.to_csv(paths["REPORT_COMPARE"], index=False)
    print("Saved model comparison to:", paths["REPORT_COMPARE"])

    # Calibration: evaluate sigmoid and isotonic for best model(s) by ROC/Brier
    # Choose top model by roc_auc then brier
    best = metrics_df.sort_values(["roc_auc", "brier"], ascending=[False, True]).iloc[0]
    best_name = best["model"]
    print("Best model by ROC/Brier ranking:", best_name)
    best_model = models[best_name]

    # Calibrate
    calibrations = {"uncalibrated": best_model}
    sig = CalibratedClassifierCV(best_model.named_steps["clf"], method="sigmoid", cv="prefit")
    try:
        # Need to fit calibrator on validation set: use a portion of training set
        # We'll refit base estimator on X_train_small to provide 'prefit' behavior
        # Simpler approach: perform CalibratedClassifierCV with cv=3 on training data (wrap with pipeline)
        from sklearn.model_selection import StratifiedKFold
        cal_sig = CalibratedClassifierCV(best_model.named_steps["clf"], method="sigmoid", cv=3)
        # fit the raw classifier on X_train then calibrate
        # Extract imputed/scaled X_train
        X_train_trans = best_model.named_steps["imputer"].fit_transform(X_train)
        if "scaler" in best_model.named_steps:
            X_train_trans = best_model.named_steps["scaler"].fit_transform(X_train_trans)
        cal_sig.fit(X_train_trans, y_train)
        calibrations["sigmoid"] = cal_sig
    except Exception as e:
        print("Sigmoid calibration failed:", e)

    try:
        cal_iso = CalibratedClassifierCV(best_model.named_steps["clf"], method="isotonic", cv=3)
        X_train_trans = best_model.named_steps["imputer"].transform(X_train)
        if "scaler" in best_model.named_steps:
            X_train_trans = best_model.named_steps["scaler"].transform(X_train_trans)
        cal_iso.fit(X_train_trans, y_train)
        calibrations["isotonic"] = cal_iso
    except Exception as e:
        print("Isotonic calibration failed:", e)

    # Evaluate calibrations on X_test
    cal_results = []
    for label, cal in calibrations.items():
        if label == "uncalibrated":
            # use pipeline prediction
            try:
                y_proba = cal.predict_proba(X_test)[:, 1]
            except Exception:
                y_proba = cal.decision_function(X_test)
        else:
            # need to transform X_test to raw features for calibrator
            X_test_trans = best_model.named_steps["imputer"].transform(X_test)
            if "scaler" in best_model.named_steps:
                X_test_trans = best_model.named_steps["scaler"].transform(X_test_trans)
            try:
                y_proba = cal.predict_proba(X_test_trans)[:, 1]
            except Exception:
                y_proba = cal.decision_function(X_test_trans)
        y_pred = (np.array(y_proba) >= 0.5).astype(int)
        brier = brier_score_loss(y_test, y_proba)
        roc = roc_auc_score(y_test, y_proba)
        acc = accuracy_score(y_test, y_pred)
        cal_results.append({"calibration": label, "roc_auc": roc, "brier": brier, "accuracy": acc})
    cal_df = pd.DataFrame(cal_results)
    print("Calibration results:\n", cal_df)

    # Feature importance / audit
    # For linear models, coefficients. For tree models, feature_importances_. For LGB, similar.
    audit_rows = []
    try:
        clf = best_model.named_steps["clf"]
        # Use imputed training set for permutation importance
        X_train_imp = best_model.named_steps["imputer"].fit_transform(X_train)
        # Permutation importance (uses fitted clf)
        print("Computing permutation importance (may take a while)...")
        perm = permutation_importance(clf, X_train_imp, y_train, n_repeats=10, random_state=42, n_jobs=-1)
        imp_means = perm.importances_mean
        features = X_train.columns.tolist()

        # Helper to map feature to corrected group
        def map_group(f):
            # schedule/rest
            if f in {"DAYS_REST", "IS_B2B", "OPP_DAYS_REST", "OPP_IS_B2B"}:
                return "schedule_rest"
            # rolling team form
            if f in {"PTS_LAST_5", "PTS_LAST_10", "WINRATE_LAST_5", "WINRATE_LAST_10", "PTS_ALLOWED_LAST_5", "PTS_ALLOWED_LAST_10"}:
                return "rolling_team_form"
            # opponent rolling form
            if f.startswith("OPP_") and not f.startswith("OPP_HOME_") and not f.startswith("OPP_AWAY_"):
                return "opponent_rolling_form"
            # home/away split (team-level)
            if f in {"HOME_WINRATE_LAST_5", "HOME_PTS_LAST_5", "HOME_PTS_ALLOWED_LAST_5", "AWAY_WINRATE_LAST_5", "AWAY_PTS_LAST_5", "AWAY_PTS_ALLOWED_LAST_5"}:
                return "home_away_split"
            if f.startswith("HOME_") or f.startswith("AWAY_"):
                # Distinguish player vs home/away by presence of CORE or TOP or MISSING
                if any(tok in f for tok in ["CORE", "TOP", "MISSING"]):
                    return "player_features"
                # otherwise it's a home/away team split
                return "home_away_split"
            # H2H
            if f.startswith("H2H_") or f.startswith("OPP_H2H_"):
                return "h2h"
            # core player availability
            if any(s in f for s in ["CORE_PLAYERS_AVAILABLE_COUNT", "CORE_PLAYERS_MISSING_COUNT", "TOP1_AVAILABLE", "TOP2_AVAILABLE", "TOP3_AVAILABLE"]):
                return "core_player_availability"
            # expected minutes / player production
            if any(s in f for s in ["EXPECTED_MIN", "EXPECTED_PTS", "EXPECTED_AST", "EXPECTED_REB", "EXPECTED_PRA", "MIN_SUM", "MINUTES_SHARE"]):
                return "player_expected_minutes_production"
            # missing core player impact
            if f.startswith("HOME_MISSING_CORE") or f.startswith("AWAY_MISSING_CORE"):
                return "missing_core_impact"
            # default
            return "other"

        if hasattr(clf, "coef_"):
            coefs = clf.coef_.ravel()
            for f, coef, imp in zip(features, coefs, imp_means):
                audit_rows.append({"feature": f, "group": map_group(f), "coef_or_importance": float(coef), "perm_importance": float(imp)})
        elif hasattr(clf, "feature_importances_"):
            fi = clf.feature_importances_
            for f, importance, imp in zip(features, fi, imp_means):
                audit_rows.append({"feature": f, "group": map_group(f), "coef_or_importance": float(importance), "perm_importance": float(imp)})
        else:
            for f, imp in zip(features, imp_means):
                audit_rows.append({"feature": f, "group": map_group(f), "coef_or_importance": None, "perm_importance": float(imp)})
    except Exception as e:
        print("Feature audit failed:", e)

    pd.DataFrame(audit_rows).to_csv(paths["FEATURE_AUDIT"], index=False)
    print("Saved feature audit to:", paths["FEATURE_AUDIT"])

    # Save final chosen model (uncalibrated best) under fixed filename
    joblib.dump(best_model, paths["fixed_model_out"])
    print("Saved final model to:", paths["fixed_model_out"])

    # Save metadata
    metadata = {"model": best_name, "feature_columns": feature_cols, "trained_on_until": str(split_date)}
    paths["fixed_meta_out"].write_text(json.dumps(metadata, indent=2))

    # Also save feature columns (fixed)
    paths["FEATURE_COLS_OUT_FIXED"].write_text(json.dumps(feature_cols, indent=2))

    # Write a brief report
    with open(paths["REPORT_MD"], "w") as f:
        f.write("# Win Probability Model V2 Report\n\n")
        f.write("## Model comparison (train/test chronological split)\n")
        f.write(metrics_df.to_csv(index=False))
        f.write("\n\n## Calibration results\n")
        f.write(cal_df.to_csv(index=False))
        f.write("\n\n## Feature audit (top 20)\n")
        fa = pd.DataFrame(audit_rows).sort_values(by="perm_importance", ascending=False).head(20)
        f.write(fa.to_csv(index=False))
    print("Saved report to:", paths["REPORT_MD"])

    return best_name, best_model, preds_store


def backtest_chronological(df, feature_cols, model_pipeline, season=None):
    paths = get_paths(season)
    # For each date in chronological order, train on all prior games and predict that date's games
    print("Starting chronological backtest...")
    df_sorted = df.sort_values("GAME_DATE")
    unique_dates = df_sorted["GAME_DATE"].drop_duplicates().sort_values()

    records = []
    # Use imputer/scaler from model pipeline
    for current_date in unique_dates:
        train_mask = df_sorted["GAME_DATE"] < current_date
        test_mask = df_sorted["GAME_DATE"] == current_date
        if train_mask.sum() < 50 or test_mask.sum() == 0:
            # skip early dates with insufficient training data
            continue
        train_df = df_sorted.loc[train_mask]
        test_df = df_sorted.loc[test_mask]
        # Build X/y from full dataset; feature_cols are pre-game inputs
        X_train = train_df[feature_cols].copy()
        y_train = train_df["WIN"].astype(int)
        X_test = test_df[feature_cols].copy()
        y_test = test_df["WIN"].astype(int)
        # Fit fresh model on X_train
        clf = model_pipeline.named_steps["clf"]
        # Preprocess
        imp = model_pipeline.named_steps.get("imputer", SimpleImputer(strategy="mean"))
        scaler = model_pipeline.named_steps.get("scaler", None)
        X_train_imp = imp.fit_transform(X_train)
        X_test_imp = imp.transform(X_test)
        if scaler:
            X_train_imp = scaler.fit_transform(X_train_imp)
            X_test_imp = scaler.transform(X_test_imp)
        # Fit classifier
        clf.fit(X_train_imp, y_train)
        # Predict
        try:
            y_proba = clf.predict_proba(X_test_imp)[:, 1]
        except Exception:
            y_proba = clf.decision_function(X_test_imp)
        y_pred = (y_proba >= 0.5).astype(int)
        for idx, gid in enumerate(test_df.get("GAME_ID", test_df.index)):
            rec = {
                "GAME_DATE": str(current_date.date()),
                "GAME_ID": gid,
                "HOME_TEAM": test_df.iloc[idx]["TEAM_ABBREVIATION"],
                "AWAY_TEAM": test_df.iloc[idx]["OPPONENT_ABBREVIATION"],
                "y_true": int(y_test.iloc[idx]),
                "y_proba": float(y_proba[idx]),
                "y_pred": int(y_pred[idx])
            }
            records.append(rec)
    df_preds = pd.DataFrame(records)
    df_preds.to_csv(paths["BACKTEST_PRED"], index=False)
    # Team-perspective backtest saved. Now create game-level backtest (one prediction per GAME_ID) by selecting home-team rows (IS_HOME == True) where available
    df_team = df_preds.copy()
    # Save team-perspective backtest with requested filename
    df_team.to_csv(paths["team_perspective"], index=False)

    # Game-level: pick home team rows from original dataset to have one prediction per GAME_ID
    try:
        full = pd.read_csv(paths["OUTPUT_DATASET"], parse_dates=["GAME_DATE"]) if Path(paths["OUTPUT_DATASET"]).exists() else None
        if full is not None:
            merged = pd.merge(df_preds, full[["GAME_ID", "IS_HOME"]], on="GAME_ID", how="left")
            # Normalize IS_HOME values
            merged["IS_HOME"] = merged["IS_HOME"].astype(str)
            home_rows = merged[merged["IS_HOME"].str.lower().isin(["true","1"])].copy()
            if home_rows.empty:
                # fallback: first occurrence per GAME_ID
                game_level = merged.drop_duplicates(subset=["GAME_ID"]).copy()
            else:
                game_level = home_rows.drop_duplicates(subset=["GAME_ID"]).copy()
        else:
            game_level = df_preds.drop_duplicates(subset=["GAME_ID"]).copy()
    except Exception:
        game_level = df_preds.drop_duplicates(subset=["GAME_ID"]).copy()

    game_level.to_csv(paths["game_level_path"], index=False)

    # Summary
    summary = {}
    if not df_preds.empty:
        summary["team_perspective"] = {
            "overall_accuracy": float((df_preds["y_pred"] == df_preds["y_true"]).mean()),
            "brier_score": float(brier_score_loss(df_preds["y_true"], df_preds["y_proba"]))
        }
        try:
            summary["team_perspective"]["roc_auc"] = float(roc_auc_score(df_preds["y_true"], df_preds["y_proba"]))
        except Exception:
            summary["team_perspective"]["roc_auc"] = None
        # Confidence buckets
        df_preds["bucket"] = pd.cut(df_preds["y_proba"], bins=np.linspace(0,1,11), include_lowest=True)
        bucket_acc = df_preds.groupby("bucket").apply(lambda g: (g["y_pred"]==g["y_true"]).mean()).reset_index()
        bucket_acc.columns = ["bucket","accuracy"]
        bucket_acc["bucket"] = bucket_acc["bucket"].astype(str)
        summary["team_perspective"]["bucket_accuracy"] = bucket_acc.to_dict(orient="list")

        # Game-level summary
        if not game_level.empty:
            summary["game_level"] = {
                "overall_accuracy": float((game_level["y_pred"] == game_level["y_true"]).mean()),
                "brier_score": float(brier_score_loss(game_level["y_true"], game_level["y_proba"]))
            }
            try:
                summary["game_level"]["roc_auc"] = float(roc_auc_score(game_level["y_true"], game_level["y_proba"]))
            except Exception:
                summary["game_level"]["roc_auc"] = None
            # buckets
            game_level["bucket"] = pd.cut(game_level["y_proba"], bins=np.linspace(0,1,11), include_lowest=True)
            g_bucket_acc = game_level.groupby("bucket").apply(lambda g: (g["y_pred"]==g["y_true"]).mean()).reset_index()
            g_bucket_acc.columns = ["bucket","accuracy"]
            g_bucket_acc["bucket"] = g_bucket_acc["bucket"].astype(str)
            summary["game_level"]["bucket_accuracy"] = g_bucket_acc.to_dict(orient="list")

    # Ensure serializable
    def _serialize(o):
        if isinstance(o, (np.floating, np.float32, np.float64)):
            return float(o)
        if isinstance(o, (np.integer, np.int32, np.int64)):
            return int(o)
        return o
    json_safe = json.loads(json.dumps(summary, default=_serialize))
    paths["BACKTEST_SUM"].write_text(json.dumps(json_safe, indent=2))
    print("Saved backtest predictions and summary")
    return df_preds, summary


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", help="Season string (e.g. 2025-26)")
    parser.add_argument("--dataset-only", action="store_true", help="Only build dataset, do not train/evaluate models")
    parser.add_argument("--output-scope", choices=["production", "experimental"], default="production", help="Output scope")
    args = parser.parse_args()

    df_out, feature_cols = build_dataset(season=args.season, output_scope=args.output_scope, dataset_only=args.dataset_only)
    if not args.dataset_only:
        best_name, best_model, preds_store = evaluate_and_train(df_out, feature_cols, season=args.season)
        backtest_chronological(df_out, feature_cols, best_model, season=args.season)
        print("All artifacts saved.")
    else:
        print("Dataset-only mode completed. No model training performed.")
