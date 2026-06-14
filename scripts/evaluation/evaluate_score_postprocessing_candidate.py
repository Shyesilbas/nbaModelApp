from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.evaluation.evaluate_v8_segments import add_location_features, load_team_model_ready, segment_masks

REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "score_postprocessing_candidate_report.md"
JSON_PATH = REPORT_DIR / "score_postprocessing_candidate_metrics.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "mean_error": float(err.mean()),
        "median_error": float(err.median()),
        "rmse": float(np.sqrt(np.mean(np.square(err)))),
    }


def get_indicator_df(df: pd.DataFrame) -> pd.DataFrame:
    indicators = pd.DataFrame(index=df.index)
    indicators["is_playoff"] = (df["IS_PLAYOFF"].astype(int) == 1).astype(float)
    indicators["home_b2b"] = (df["IS_B2B"].astype(int) == 1).astype(float)
    indicators["away_b2b"] = (df["OPP_IS_B2B"].astype(int) == 1).astype(float)
    indicators["home_rest_advantage"] = (df["DAYS_REST"] > df["OPP_DAYS_REST"]).astype(float)
    indicators["away_rest_advantage"] = (df["OPP_DAYS_REST"] > df["DAYS_REST"]).astype(float)
    return indicators


def get_mutually_exclusive_segment(row: pd.Series) -> str:
    if int(row["IS_PLAYOFF"]) == 1:
        return "playoffs"
    elif int(row["IS_B2B"]) == 1:
        return "home_b2b"
    elif int(row["OPP_IS_B2B"]) == 1:
        return "away_b2b"
    elif row["DAYS_REST"] > row["OPP_DAYS_REST"]:
        return "home_rest_advantage"
    elif row["OPP_DAYS_REST"] > row["DAYS_REST"]:
        return "away_rest_advantage"
    else:
        return "other"


def build_base_predictions() -> tuple[pd.DataFrame, dict]:
    meta = json.loads((ROOT / "models" / "production" / "score_model_v8_metadata.json").read_text())
    df = load_team_model_ready()
    df = add_location_features(df)
    df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])

    home = df[df["IS_HOME"].astype(bool)].copy()
    away = df[~df["IS_HOME"].astype(bool)].copy()

    pace_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_pace.pkl")
    home_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_home_rtg.pkl")
    away_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_away_rtg.pkl")
    margin_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_margin.pkl")

    home["ACTUAL_HOME_PTS"] = home["PACE"] * home["OFF_RTG"] / 100.0
    home["ACTUAL_AWAY_PTS"] = home["PACE"] * home["DEF_RTG"] / 100.0
    home["ACTUAL_TOTAL"] = home["ACTUAL_HOME_PTS"] + home["ACTUAL_AWAY_PTS"]
    home["ACTUAL_MARGIN"] = home["ACTUAL_HOME_PTS"] - home["ACTUAL_AWAY_PTS"]

    home["PRED_PACE"] = pace_model.predict(home[meta["pace_features"]])
    home["PRED_HOME_RTG"] = home_model.predict(home[meta["home_off_rtg_features"]])
    home["PRED_MARGIN_MODEL"] = margin_model.predict(home[meta["margin_features"]])

    away_eval = away[["GAME_ID"] + meta["away_off_rtg_features"]].copy()
    away_eval["PRED_AWAY_RTG"] = away_model.predict(away_eval[meta["away_off_rtg_features"]])

    eval_df = home.merge(away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    eval_df["PRED_HOME_PTS_RAW"] = eval_df["PRED_PACE"] * eval_df["PRED_HOME_RTG"] / 100.0
    eval_df["PRED_AWAY_PTS_RAW"] = eval_df["PRED_PACE"] * eval_df["PRED_AWAY_RTG"] / 100.0
    eval_df["PRED_TOTAL_RAW"] = eval_df["PRED_HOME_PTS_RAW"] + eval_df["PRED_AWAY_PTS_RAW"]
    eval_df["PRED_MARGIN_RAW"] = eval_df["PRED_HOME_PTS_RAW"] - eval_df["PRED_AWAY_PTS_RAW"]

    return eval_df, meta


def evaluate_corrected_preds(df: pd.DataFrame, home_pred: pd.Series, away_pred: pd.Series) -> dict:
    actual_total = df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"]
    pred_total = home_pred + away_pred
    actual_margin = df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"]
    pred_margin = home_pred - away_pred

    metrics = {
        "overall": {
            "total": signed_metrics(actual_total, pred_total),
            "margin": signed_metrics(actual_margin, pred_margin),
            "home": signed_metrics(df["ACTUAL_HOME_PTS"], home_pred),
            "away": signed_metrics(df["ACTUAL_AWAY_PTS"], away_pred),
        }
    }

    for name, fn in segment_masks(df).items():
        mask = fn(df).fillna(False)
        if int(mask.sum()) < 25:
            continue
        g = df.loc[mask]
        g_home = home_pred.loc[mask]
        g_away = away_pred.loc[mask]
        g_actual_total = g["ACTUAL_HOME_PTS"] + g["ACTUAL_AWAY_PTS"]
        g_pred_total = g_home + g_away
        g_actual_margin = g["ACTUAL_HOME_PTS"] - g["ACTUAL_AWAY_PTS"]
        g_pred_margin = g_home - g_away

        metrics[name] = {
            "total": signed_metrics(g_actual_total, g_pred_total),
            "margin": signed_metrics(g_actual_margin, g_pred_margin),
            "home": signed_metrics(g["ACTUAL_HOME_PTS"], g_home),
            "away": signed_metrics(g["ACTUAL_AWAY_PTS"], g_away),
        }
    return metrics


def main() -> None:
    eval_df, meta = build_base_predictions()

    # Train (calibration learning) and Test (holdout evaluation) split
    train_df = eval_df[eval_df["GAME_DATE"] <= SPLIT_DATE].copy()
    test_df = eval_df[eval_df["GAME_DATE"] > SPLIT_DATE].copy()

    # Calculate residuals on train (prediction - actual)
    train_df["TOTAL_RESIDUAL"] = train_df["PRED_TOTAL_RAW"] - train_df["ACTUAL_TOTAL"]
    train_df["MARGIN_RESIDUAL"] = train_df["PRED_MARGIN_MODEL"] - train_df["ACTUAL_MARGIN"]

    # --- Learn Delineated Corrections ---

    # 1. Mutually Exclusive Segments
    train_df["me_segment"] = train_df.apply(get_mutually_exclusive_segment, axis=1)
    me_total_corr = train_df.groupby("me_segment")["TOTAL_RESIDUAL"].mean().to_dict()
    me_margin_corr = train_df.groupby("me_segment")["MARGIN_RESIDUAL"].mean().to_dict()

    # 2. Overlapping Segments (playoffs, home_b2b, away_b2b, home_rest_advantage, away_rest_advantage)
    overlapping_defs = {
        "playoffs": lambda x: x["IS_PLAYOFF"].astype(int) == 1,
        "home_b2b": lambda x: x["IS_B2B"].astype(int) == 1,
        "away_b2b": lambda x: x["OPP_IS_B2B"].astype(int) == 1,
        "home_rest_advantage": lambda x: x["DAYS_REST"] > x["OPP_DAYS_REST"],
        "away_rest_advantage": lambda x: x["OPP_DAYS_REST"] > x["DAYS_REST"],
    }

    ov_total_corr = {}
    ov_margin_corr = {}
    for name, fn in overlapping_defs.items():
        mask = fn(train_df)
        if mask.sum() > 0:
            ov_total_corr[name] = float(train_df.loc[mask, "TOTAL_RESIDUAL"].mean())
            ov_margin_corr[name] = float(train_df.loc[mask, "MARGIN_RESIDUAL"].mean())
        else:
            ov_total_corr[name] = 0.0
            ov_margin_corr[name] = 0.0

    # 3. Regression-Based Calibration (Ridge)
    X_train_ind = get_indicator_df(train_df)
    ridge_total = Ridge(alpha=1.0)
    ridge_total.fit(X_train_ind, train_df["TOTAL_RESIDUAL"])

    ridge_margin = Ridge(alpha=1.0)
    ridge_margin.fit(X_train_ind, train_df["MARGIN_RESIDUAL"])

    # --- Apply and Evaluate on Test Set ---

    # Base Reconciled Predictions (no corrections)
    base_home_pred = (test_df["PRED_TOTAL_RAW"] + test_df["PRED_MARGIN_MODEL"]) / 2.0
    base_away_pred = (test_df["PRED_TOTAL_RAW"] - test_df["PRED_MARGIN_MODEL"]) / 2.0

    # Strategy 2: Mutually Exclusive Table
    test_me_segment = test_df.apply(get_mutually_exclusive_segment, axis=1)
    me_total_adj = test_df["PRED_TOTAL_RAW"] - test_me_segment.map(me_total_corr).fillna(0.0)
    me_margin_adj = test_df["PRED_MARGIN_MODEL"] - test_me_segment.map(me_margin_corr).fillna(0.0)
    me_home_pred = (me_total_adj + me_margin_adj) / 2.0
    me_away_pred = (me_total_adj - me_margin_adj) / 2.0

    # Strategy 3 & 4: Overlapping (Sum and Average)
    test_matching_masks = {name: fn(test_df) for name, fn in overlapping_defs.items()}
    sum_total_corr = pd.Series(0.0, index=test_df.index)
    sum_margin_corr = pd.Series(0.0, index=test_df.index)
    match_count = pd.Series(0.0, index=test_df.index)

    for name in overlapping_defs:
        mask = test_matching_masks[name]
        sum_total_corr.loc[mask] += ov_total_corr[name]
        sum_margin_corr.loc[mask] += ov_margin_corr[name]
        match_count.loc[mask] += 1.0

    # Sum Strategy
    sum_total_adj = test_df["PRED_TOTAL_RAW"] - sum_total_corr
    sum_margin_adj = test_df["PRED_MARGIN_MODEL"] - sum_margin_corr
    sum_home_pred = (sum_total_adj + sum_margin_adj) / 2.0
    sum_away_pred = (sum_total_adj - sum_margin_adj) / 2.0

    # Average Strategy
    avg_total_corr = np.where(match_count > 0, sum_total_corr / match_count, 0.0)
    avg_margin_corr = np.where(match_count > 0, sum_margin_corr / match_count, 0.0)
    avg_total_adj = test_df["PRED_TOTAL_RAW"] - avg_total_corr
    avg_margin_adj = test_df["PRED_MARGIN_MODEL"] - avg_margin_corr
    avg_home_pred = (avg_total_adj + avg_margin_adj) / 2.0
    avg_away_pred = (avg_total_adj - avg_margin_adj) / 2.0

    # Strategy 5: Regression-Based Calibration
    X_test_ind = get_indicator_df(test_df)
    pred_total_res = ridge_total.predict(X_test_ind)
    pred_margin_res = ridge_margin.predict(X_test_ind)

    reg_total_adj = test_df["PRED_TOTAL_RAW"] - pred_total_res
    reg_margin_adj = test_df["PRED_MARGIN_MODEL"] - pred_margin_res
    reg_home_pred = (reg_total_adj + reg_margin_adj) / 2.0
    reg_away_pred = (reg_total_adj - reg_margin_adj) / 2.0

    # --- Run Evaluations ---
    strategies = {
        "base_no_corr": (base_home_pred, base_away_pred),
        "me_segment_table": (me_home_pred, me_away_pred),
        "overlapping_sum": (sum_home_pred, sum_away_pred),
        "overlapping_avg": (avg_home_pred, avg_away_pred),
        "ridge_regression": (reg_home_pred, reg_away_pred),
    }

    eval_results = {}
    for name, (h_pred, a_pred) in strategies.items():
        eval_results[name] = evaluate_corrected_preds(test_df, h_pred, a_pred)

    # --- Build Comparison Table ---
    focus_segments = ["overall", "home_b2b", "away_b2b", "either_b2b", "away_rest_advantage", "home_rest_advantage", "playoffs"]
    comparison_rows = []
    for segment in focus_segments:
        row = {"segment": segment}
        for strat in strategies:
            if segment in eval_results[strat]:
                row[f"{strat}_total_mae"] = eval_results[strat][segment]["total"]["mae"]
                row[f"{strat}_total_bias"] = eval_results[strat][segment]["total"]["mean_error"]
                row[f"{strat}_margin_mae"] = eval_results[strat][segment]["margin"]["mae"]
                row[f"{strat}_margin_bias"] = eval_results[strat][segment]["margin"]["mean_error"]
        comparison_rows.append(row)

    # Pick the best strategy by overall total MAE and margin MAE
    best_strategy = min(strategies.keys(), key=lambda k: (eval_results[k]["overall"]["total"]["mae"], eval_results[k]["overall"]["margin"]["mae"]))

    # Prepare export data
    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "learned_corrections": {
            "mutually_exclusive": {
                "total": me_total_corr,
                "margin": me_margin_corr,
            },
            "overlapping": {
                "total": ov_total_corr,
                "margin": ov_margin_corr,
            },
            "ridge_coefs": {
                "total": ridge_total.coef_.tolist(),
                "total_intercept": float(ridge_total.intercept_),
                "margin": ridge_margin.coef_.tolist(),
                "margin_intercept": float(ridge_margin.intercept_),
                "features": X_train_ind.columns.tolist(),
            }
        },
        "eval_results": eval_results,
        "comparison_rows": comparison_rows,
        "best_strategy": best_strategy,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # Build Markdown Report
    def make_md_table(rows: list[dict], cols: list[str]) -> str:
        lines = ["| " + " | ".join(cols) + " |", "| " + " | ".join(["---"] * len(cols)) + " |"]
        for r in rows:
            line_vals = []
            for col in cols:
                val = r.get(col)
                if isinstance(val, float):
                    line_vals.append(f"{val:.4f}")
                else:
                    line_vals.append(str(val))
            lines.append("| " + " | ".join(line_vals) + " |")
        return "\n".join(lines)

    report_lines = [
        "# SCORE Post-Processing Segment-Level Calibration Report",
        "",
        f"Chronological split: training <= {SPLIT_DATE.date().isoformat()}, test > {SPLIT_DATE.date().isoformat()}.",
        "",
        "## Overall Comparison of Strategies",
        "",
        "| Strategy | Total MAE | Total Bias | Margin MAE | Margin Bias | Home MAE | Away MAE |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]

    for strat in strategies:
        r = eval_results[strat]["overall"]
        report_lines.append(
            f"| `{strat}` | {r['total']['mae']:.4f} | {r['total']['mean_error']:.4f} | {r['margin']['mae']:.4f} | {r['margin']['mean_error']:.4f} | {r['home']['mae']:.4f} | {r['away']['mae']:.4f} |"
        )

    report_lines.extend([
        "",
        "## Segment-Level Details",
        "",
        "### Total Score MAE Comparison",
        make_md_table(comparison_rows, ["segment"] + [f"{strat}_total_mae" for strat in strategies]),
        "",
        "### Total Score Bias Comparison",
        make_md_table(comparison_rows, ["segment"] + [f"{strat}_total_bias" for strat in strategies]),
        "",
        "### Margin MAE Comparison",
        make_md_table(comparison_rows, ["segment"] + [f"{strat}_margin_mae" for strat in strategies]),
        "",
        "### Margin Bias Comparison",
        make_md_table(comparison_rows, ["segment"] + [f"{strat}_margin_bias" for strat in strategies]),
        "",
        "## Learned Corrections",
        "",
        "### Mutually Exclusive Table",
        f"Total: {json.dumps(me_total_corr, indent=2)}",
        "",
        f"Margin: {json.dumps(me_margin_corr, indent=2)}",
        "",
        "### Overlapping Table",
        f"Total: {json.dumps(ov_total_corr, indent=2)}",
        "",
        f"Margin: {json.dumps(ov_margin_corr, indent=2)}",
        "",
        "### Ridge Regression Coefficients",
        f"Features: {X_train_ind.columns.tolist()}",
        f"Total Intercept: {ridge_total.intercept_:.4f}, Coefs: {ridge_total.coef_}",
        f"Margin Intercept: {ridge_margin.intercept_:.4f}, Coefs: {ridge_margin.coef_}",
        "",
        "## Decision",
        f"Recommended Strategy: `{best_strategy}`",
    ])

    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "best_strategy": best_strategy,
        "overall_total_mae_baseline": eval_results["base_no_corr"]["overall"]["total"]["mae"],
        "overall_total_mae_best": eval_results[best_strategy]["overall"]["total"]["mae"],
        "overall_margin_mae_baseline": eval_results["base_no_corr"]["overall"]["margin"]["mae"],
        "overall_margin_mae_best": eval_results[best_strategy]["overall"]["margin"]["mae"],
    }, indent=2))


if __name__ == "__main__":
    main()
