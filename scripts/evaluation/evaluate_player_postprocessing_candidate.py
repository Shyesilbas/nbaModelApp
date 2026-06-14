from __future__ import annotations

import os
import json
import sys
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.linear_model import Ridge
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "player_postprocessing_candidate_report.md"
JSON_PATH = REPORT_DIR / "player_postprocessing_candidate_metrics.json"


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "rmse": float(np.sqrt(np.mean(np.square(err)))),
        "bias": float(err.mean()),
        "r2": float(r2_score(actual, pred))
    }


def get_indicator_df(df: pd.DataFrame) -> pd.DataFrame:
    indicators = pd.DataFrame(index=df.index)
    indicators["is_playoff"] = (df["IS_PLAYOFF"].astype(int) == 1).astype(float)
    indicators["is_home"] = (df["IS_HOME"].astype(int) == 1).astype(float)
    indicators["pos_guard"] = (df["PLAYER_POSITION_GROUP"] == "GUARD").astype(float)
    indicators["pos_wing"] = (df["PLAYER_POSITION_GROUP"] == "WING").astype(float)
    indicators["pos_big"] = (df["PLAYER_POSITION_GROUP"] == "BIG").astype(float)
    indicators["high_usage"] = (df["USG_PCT_LAST_10"] >= 25.0).astype(float)
    indicators["low_usage"] = (df["USG_PCT_LAST_10"] < 15.0).astype(float)
    indicators["heavy_minutes"] = (df["MIN_EMA_10"] >= 30.0).astype(float)
    indicators["light_minutes"] = (df["MIN_EMA_10"] < 15.0).astype(float)
    return indicators


def get_mutually_exclusive_segment(row: pd.Series) -> str:
    pos = row["PLAYER_POSITION_GROUP"]
    playoff = "playoff" if int(row["IS_PLAYOFF"]) == 1 else "regular"
    return f"{playoff}_{pos.lower()}"


def evaluate_predictions(
    df: pd.DataFrame,
    preds_dict: dict[str, pd.Series],
    targets: dict[str, str],
    segment_defs: dict
) -> dict:
    results = {}
    for name, fn in segment_defs.items():
        mask = fn(df)
        if mask.sum() < 30:
            continue
            
        sub_df = df[mask]
        results[name] = {
            "rows": int(len(sub_df)),
            "targets": {}
        }
        
        for short_name, target_col in targets.items():
            actual = sub_df[target_col]
            pred = preds_dict[short_name].loc[mask]
            results[name]["targets"][short_name] = signed_metrics(actual, pred)
            
    return results


def main():
    print("--- Player Post-Processing Calibration Candidate Evaluation ---")
    
    # Load canonical player model ready dataset
    data_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    if not data_path.exists():
        raise FileNotFoundError(f"Player dataset missing at {data_path}")
        
    df = pd.read_csv(data_path)
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    
    exclude_cols = [
        'SEASON_ID', 'Player_ID', 'GAME_DATE', 'MATCHUP', 'VIDEO_AVAILABLE', 
        'PLAYER_NAME', 'SEASON_TYPE', 'OPPONENT_ABBREVIATION', 'GAME_ID', 
        'Game_ID', 'TEAM_ABBREVIATION', 'PLAYER_POSITION_GROUP'
    ]
    targets = {
        'pts': 'TARGET_PTS',
        'reb': 'TARGET_REB',
        'ast': 'TARGET_AST'
    }
    features = [c for c in df.columns if c not in exclude_cols and c not in targets.values()]
    
    # Chronological Split (80% quantile)
    split_date = df["GAME_DATE"].quantile(0.8)
    print(f"Split Date: {split_date.strftime('%Y-%m-%d')}")
    
    train_df = df[df["GAME_DATE"] <= split_date].copy()
    test_df = df[df["GAME_DATE"] > split_date].copy()
    
    # 1. Train Base LightGBM Models
    base_preds_train = {}
    base_preds_test = {}
    
    for short_name, target_col in targets.items():
        pipeline = Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('lgb', lgb.LGBMRegressor(
                n_estimators=150, 
                learning_rate=0.05, 
                max_depth=5, 
                random_state=42, 
                n_jobs=-1, 
                verbose=-1
            ))
        ])
        
        X_train = train_df[features]
        y_train = train_df[target_col].fillna(0)
        X_test = test_df[features]
        
        pipeline.fit(X_train, y_train)
        
        base_preds_train[short_name] = pd.Series(pipeline.predict(X_train), index=train_df.index)
        base_preds_test[short_name] = pd.Series(pipeline.predict(X_test), index=test_df.index)
        
    # Calculate Residuals on Train Set (Prediction - Actual)
    train_df["PTS_RESIDUAL"] = base_preds_train["pts"] - train_df["TARGET_PTS"]
    train_df["REB_RESIDUAL"] = base_preds_train["reb"] - train_df["TARGET_REB"]
    train_df["AST_RESIDUAL"] = base_preds_train["ast"] - train_df["TARGET_AST"]
    
    # --- Learn Delineated Corrections ---
    
    # Strategy A: Mutually Exclusive Segments
    train_df["me_segment"] = train_df.apply(get_mutually_exclusive_segment, axis=1)
    me_corr = {}
    for short_name in targets.keys():
        col_res = f"{short_name.upper()}_RESIDUAL"
        me_corr[short_name] = train_df.groupby("me_segment")[col_res].mean().to_dict()
        
    # Strategy B: Overlapping Segment Mean Corrections
    overlapping_defs = {
        "playoffs": lambda x: x["IS_PLAYOFF"].astype(int) == 1,
        "home": lambda x: x["IS_HOME"].astype(int) == 1,
        "pos_guard": lambda x: x["PLAYER_POSITION_GROUP"] == "GUARD",
        "pos_wing": lambda x: x["PLAYER_POSITION_GROUP"] == "WING",
        "pos_big": lambda x: x["PLAYER_POSITION_GROUP"] == "BIG",
    }
    
    ov_corr = {short_name: {} for short_name in targets.keys()}
    for name, fn in overlapping_defs.items():
        mask = fn(train_df)
        for short_name in targets.keys():
            col_res = f"{short_name.upper()}_RESIDUAL"
            if mask.sum() > 0:
                ov_corr[short_name][name] = float(train_df.loc[mask, col_res].mean())
            else:
                ov_corr[short_name][name] = 0.0
                
    # Strategy C: Ridge Regression Calibration
    X_train_ind = get_indicator_df(train_df)
    ridge_models = {}
    for short_name in targets.keys():
        col_res = f"{short_name.upper()}_RESIDUAL"
        ridge = Ridge(alpha=10.0)
        ridge.fit(X_train_ind, train_df[col_res])
        ridge_models[short_name] = ridge
        
    # --- Apply and Evaluate on Test Set ---
    
    # 1. Base Predictions (no corrections)
    test_preds_base = {k: v.copy() for k, v in base_preds_test.items()}
    
    # 2. ME Segment corrections
    test_me_segment = test_df.apply(get_mutually_exclusive_segment, axis=1)
    test_preds_me = {}
    for short_name in targets.keys():
        corr = test_me_segment.map(me_corr[short_name]).fillna(0.0)
        test_preds_me[short_name] = base_preds_test[short_name] - corr
        
    # 3. Overlapping Sum corrections
    test_preds_sum = {}
    test_matching_masks = {name: fn(test_df) for name, fn in overlapping_defs.items()}
    for short_name in targets.keys():
        sum_corr = pd.Series(0.0, index=test_df.index)
        for name in overlapping_defs:
            mask = test_matching_masks[name]
            sum_corr.loc[mask] += ov_corr[short_name][name]
        test_preds_sum[short_name] = base_preds_test[short_name] - sum_corr
        
    # 4. Overlapping Avg corrections
    test_preds_avg = {}
    for short_name in targets.keys():
        sum_corr = pd.Series(0.0, index=test_df.index)
        match_count = pd.Series(0.0, index=test_df.index)
        for name in overlapping_defs:
            mask = test_matching_masks[name]
            sum_corr.loc[mask] += ov_corr[short_name][name]
            match_count.loc[mask] += 1.0
        avg_corr = np.where(match_count > 0, sum_corr / match_count, 0.0)
        test_preds_avg[short_name] = base_preds_test[short_name] - avg_corr
        
    # 5. Ridge Regression corrections
    X_test_ind = get_indicator_df(test_df)
    test_preds_ridge = {}
    for short_name in targets.keys():
        pred_res = ridge_models[short_name].predict(X_test_ind)
        test_preds_ridge[short_name] = base_preds_test[short_name] - pred_res
        
    # --- Run Evaluations ---
    strategies = {
        "base_no_corr": test_preds_base,
        "me_segment_table": test_preds_me,
        "overlapping_sum": test_preds_sum,
        "overlapping_avg": test_preds_avg,
        "ridge_regression": test_preds_ridge,
    }
    
    segment_defs = {
        "overall": lambda x: pd.Series(True, index=x.index),
        "regular_season": lambda x: x["IS_PLAYOFF"].astype(int) == 0,
        "playoffs": lambda x: x["IS_PLAYOFF"].astype(int) == 1,
        "home": lambda x: x["IS_HOME"].astype(int) == 1,
        "away": lambda x: x["IS_HOME"].astype(int) == 0,
        "guard": lambda x: x["PLAYER_POSITION_GROUP"] == "GUARD",
        "wing": lambda x: x["PLAYER_POSITION_GROUP"] == "WING",
        "big": lambda x: x["PLAYER_POSITION_GROUP"] == "BIG",
        "high_usage": lambda x: x["USG_PCT_LAST_10"] >= 25.0,
        "med_usage": lambda x: (x["USG_PCT_LAST_10"] >= 15.0) & (x["USG_PCT_LAST_10"] < 25.0),
        "low_usage": lambda x: x["USG_PCT_LAST_10"] < 15.0,
        "heavy_minutes": lambda x: x["MIN_EMA_10"] >= 30.0,
        "rotation_minutes": lambda x: (x["MIN_EMA_10"] >= 15.0) & (x["MIN_EMA_10"] < 30.0),
        "light_minutes": lambda x: x["MIN_EMA_10"] < 15.0,
    }
    
    eval_results = {}
    for strat_name, preds_dict in strategies.items():
        eval_results[strat_name] = evaluate_predictions(test_df, preds_dict, targets, segment_defs)
        
    # --- Find Best Strategy per Target ---
    best_strategy = {}
    for short_name in targets.keys():
        best_strategy[short_name] = min(
            strategies.keys(),
            key=lambda k: eval_results[k]["overall"]["targets"][short_name]["mae"]
        )
        
    # Log Coefficients for Ridge
    ridge_coefs = {}
    for short_name in targets.keys():
        ridge_coefs[short_name] = {
            "coefs": ridge_models[short_name].coef_.tolist(),
            "intercept": float(ridge_models[short_name].intercept_),
        }
        
    # Prepare export data
    data = {
        "split_date": split_date.strftime("%Y-%m-%d"),
        "test_rows": int(len(test_df)),
        "learned_corrections": {
            "me_segment_table": me_corr,
            "overlapping": ov_corr,
            "ridge": ridge_coefs,
            "ridge_features": X_train_ind.columns.tolist()
        },
        "eval_results": eval_results,
        "best_strategies": best_strategy
    }
    
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")
    
    # Build Comparison Tables for Report
    tables = {}
    for short_name in targets.keys():
        rows_list = []
        for seg in segment_defs.keys():
            row_data = {"segment": seg}
            for strat in strategies.keys():
                metrics_res = eval_results[strat][seg]["targets"][short_name]
                row_data[f"{strat}_mae"] = metrics_res["mae"]
                row_data[f"{strat}_bias"] = metrics_res["bias"]
            rows_list.append(row_data)
            
        columns = ["segment"] + [f"{strat}_mae" for strat in strategies.keys()]
        header_str = "| " + " | ".join(columns) + " |"
        sep_str = "| " + " | ".join(["---"] * len(columns)) + " |"
        row_strs = []
        for r in rows_list:
            vals = []
            for col in columns:
                val = r.get(col)
                vals.append(f"{val:.4f}" if isinstance(val, float) else str(val))
            row_strs.append("| " + " | ".join(vals) + " |")
        tables[short_name] = "\n".join([header_str, sep_str] + row_strs)
        
    report = [
        "# Player Post-Processing Segment-Level Calibration Report",
        "",
        f"Chronological split date: player games after {split_date.strftime('%Y-%m-%d')}.",
        "",
        "## Overall Comparison of Strategies",
        "",
        "### PTS MAE by Strategy",
        tables["pts"],
        "",
        "### REB MAE by Strategy",
        tables["reb"],
        "",
        "### AST MAE by Strategy",
        tables["ast"],
        "",
        "## Summary Findings",
        "",
        "### 1. Optimal Post-Processing Strategy",
        f"- **PTS Best Strategy**: `{best_strategy['pts']}` (MAE: {eval_results[best_strategy['pts']]['overall']['targets']['pts']['mae']:.4f} vs Raw: {eval_results['base_no_corr']['overall']['targets']['pts']['mae']:.4f})",
        f"- **REB Best Strategy**: `{best_strategy['reb']}` (MAE: {eval_results[best_strategy['reb']]['overall']['targets']['reb']['mae']:.4f} vs Raw: {eval_results['base_no_corr']['overall']['targets']['reb']['mae']:.4f})",
        f"- **AST Best Strategy**: `{best_strategy['ast']}` (MAE: {eval_results[best_strategy['ast']]['overall']['targets']['ast']['mae']:.4f} vs Raw: {eval_results['base_no_corr']['overall']['targets']['ast']['mae']:.4f})",
        "",
        "### 2. Segment Bias Reductions (Ridge vs Raw)",
        f"- **Playoffs PTS Bias**: Ridge: {eval_results['ridge_regression']['playoffs']['targets']['pts']['bias']:.4f} vs Raw: {eval_results['base_no_corr']['playoffs']['targets']['pts']['bias']:.4f}",
        f"- **Bigs REB Bias**: Ridge: {eval_results['ridge_regression']['big']['targets']['reb']['bias']:.4f} vs Raw: {eval_results['base_no_corr']['big']['targets']['reb']['bias']:.4f}",
        f"- **Guards AST Bias**: Ridge: {eval_results['ridge_regression']['guard']['targets']['ast']['bias']:.4f} vs Raw: {eval_results['base_no_corr']['guard']['targets']['ast']['bias']:.4f}",
        "",
        "### 3. Ridge Coefficients",
        f"Features: {X_train_ind.columns.tolist()}",
        f"- **PTS Intercept**: {ridge_coefs['pts']['intercept']:.4f}, Coefs: {ridge_coefs['pts']['coefs']}",
        f"- **REB Intercept**: {ridge_coefs['reb']['intercept']:.4f}, Coefs: {ridge_coefs['reb']['coefs']}",
        f"- **AST Intercept**: {ridge_coefs['ast']['intercept']:.4f}, Coefs: {ridge_coefs['ast']['coefs']}",
        ""
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")
    print(f"Report saved to {REPORT_PATH}")
    print(f"JSON saved to {JSON_PATH}")


if __name__ == "__main__":
    main()
