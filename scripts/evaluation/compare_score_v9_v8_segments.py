from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.evaluation.evaluate_v8_segments import add_location_features, load_team_model_ready, segment_masks

REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "score_v9_vs_v8_comparison.md"
JSON_PATH = REPORT_DIR / "score_v9_vs_v8_comparison.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "mean_error": float(err.mean()),
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


def score_metrics(df: pd.DataFrame, home_pred: pd.Series, away_pred: pd.Series) -> dict:
    actual_total = df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"]
    pred_total = home_pred + away_pred
    actual_margin = df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"]
    pred_margin = home_pred - away_pred

    return {
        "games": int(len(df)),
        "total": signed_metrics(actual_total, pred_total),
        "margin": signed_metrics(actual_margin, pred_margin),
        "home": signed_metrics(df["ACTUAL_HOME_PTS"], home_pred),
        "away": signed_metrics(df["ACTUAL_AWAY_PTS"], away_pred),
    }


def evaluate_model_version(df: pd.DataFrame, version: str, is_v9: bool) -> dict:
    model_dir = ROOT / "models" / "production"
    meta = json.loads((model_dir / f"score_model_{version}_metadata.json").read_text())

    pace_model = joblib.load(model_dir / f"score_model_{version}_pace.pkl")
    home_model = joblib.load(model_dir / f"score_model_{version}_home_rtg.pkl")
    away_model = joblib.load(model_dir / f"score_model_{version}_away_rtg.pkl")
    margin_model = joblib.load(model_dir / f"score_model_{version}_margin.pkl")

    df = df.copy()
    df["PRED_PACE"] = pace_model.predict(df[meta["pace_features"]])
    df["PRED_HOME_RTG"] = home_model.predict(df[meta["home_off_rtg_features"]])
    df["PRED_MARGIN_MODEL"] = margin_model.predict(df[meta["margin_features"]])

    # Load away model and predict on away perspective
    away_all = load_team_model_ready()
    away_all = add_location_features(away_all)
    away_eval = away_all[(~away_all["IS_HOME"].astype(bool)) & (away_all["GAME_DATE"] > SPLIT_DATE)].copy()
    away_eval["PRED_AWAY_RTG"] = away_model.predict(away_eval[meta["away_off_rtg_features"]])

    eval_df = df.merge(away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    eval_df["PRED_TOTAL_RAW"] = eval_df["PRED_PACE"] * (eval_df["PRED_HOME_RTG"] + eval_df["PRED_AWAY_RTG"]) / 100.0

    if is_v9:
        # Load Ridge models and apply corrections
        ridge_total = joblib.load(model_dir / f"score_model_{version}_ridge_total.pkl")
        ridge_margin = joblib.load(model_dir / f"score_model_{version}_ridge_margin.pkl")

        X_ind = get_indicator_df(eval_df)
        total_res_pred = ridge_total.predict(X_ind)
        margin_res_pred = ridge_margin.predict(X_ind)

        corrected_total = eval_df["PRED_TOTAL_RAW"] - total_res_pred
        corrected_margin = eval_df["PRED_MARGIN_MODEL"] - margin_res_pred
    else:
        corrected_total = eval_df["PRED_TOTAL_RAW"]
        corrected_margin = eval_df["PRED_MARGIN_MODEL"]

    home_pred = (corrected_total + corrected_margin) / 2.0
    away_pred = (corrected_total - corrected_margin) / 2.0

    eval_df["ACTUAL_HOME_PTS"] = eval_df["PACE"] * eval_df["OFF_RTG"] / 100.0
    eval_df["ACTUAL_AWAY_PTS"] = eval_df["PACE"] * eval_df["DEF_RTG"] / 100.0

    metrics = {"overall": score_metrics(eval_df, home_pred, away_pred)}
    for name, fn in segment_masks(eval_df).items():
        mask = fn(eval_df).fillna(False)
        if int(mask.sum()) < 25:
            continue
        g = eval_df.loc[mask]
        metrics[name] = score_metrics(g, home_pred.loc[mask], away_pred.loc[mask])

    return metrics


def main() -> None:
    df = load_team_model_ready()
    df = add_location_features(df)
    test_df = df[(df["IS_HOME"].astype(bool)) & (df["GAME_DATE"] > SPLIT_DATE)].copy()
    test_df = test_df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])

    v8_metrics = evaluate_model_version(test_df, "v8", is_v9=False)
    v9_metrics = evaluate_model_version(test_df, "v9", is_v9=True)

    focus_segments = ["overall", "home_b2b", "away_b2b", "either_b2b", "away_rest_advantage", "home_rest_advantage", "playoffs"]

    comparison_rows = []
    for seg in focus_segments:
        if seg in v8_metrics and seg in v9_metrics:
            v8_s = v8_metrics[seg]
            v9_s = v9_metrics[seg]
            comparison_rows.append({
                "segment": seg,
                "games": v9_s["games"],
                "v8_total_mae": v8_s["total"]["mae"],
                "v9_total_mae": v9_s["total"]["mae"],
                "total_mae_delta": v9_s["total"]["mae"] - v8_s["total"]["mae"],
                "v8_total_bias": v8_s["total"]["mean_error"],
                "v9_total_bias": v9_s["total"]["mean_error"],
                "v8_margin_mae": v8_s["margin"]["mae"],
                "v9_margin_mae": v9_s["margin"]["mae"],
                "margin_mae_delta": v9_s["margin"]["mae"] - v8_s["margin"]["mae"],
                "v8_margin_bias": v8_s["margin"]["mean_error"],
                "v9_margin_bias": v9_s["margin"]["mean_error"],
            })

    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "v8_metrics": v8_metrics,
        "v9_metrics": v9_metrics,
        "comparison_rows": comparison_rows,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # Generate Markdown Table helper
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
        "# SCORE V9 vs V8 Model Segment Comparison Report",
        "",
        f"Chronological split test set: games after {SPLIT_DATE.date().isoformat()}.",
        "V9 uses the full train set with Ridge residual post-processing calibration applied.",
        "V8 is the current production model without post-processing calibration.",
        "",
        "## Performance Comparison",
        "",
        "### Total Score Metrics",
        make_md_table(comparison_rows, [
            "segment", "games", "v8_total_mae", "v9_total_mae", "total_mae_delta", "v8_total_bias", "v9_total_bias"
        ]),
        "",
        "### Margin Metrics",
        make_md_table(comparison_rows, [
            "segment", "games", "v8_margin_mae", "v9_margin_mae", "margin_mae_delta", "v8_margin_bias", "v9_margin_bias"
        ]),
        "",
        "## Summary Findings",
        f"- Overall Total MAE delta: {v9_metrics['overall']['total']['mae'] - v8_metrics['overall']['total']['mae']:.5f}",
        f"- Overall Margin MAE delta: {v9_metrics['overall']['margin']['mae'] - v8_metrics['overall']['margin']['mae']:.5f}",
        f"- Playoff Total Bias reduction: from {v8_metrics['playoffs']['total']['mean_error']:.4f} to {v9_metrics['playoffs']['total']['mean_error']:.4f}",
        f"- Playoff Margin Bias reduction: from {v8_metrics['playoffs']['margin']['mean_error']:.4f} to {v9_metrics['playoffs']['margin']['mean_error']:.4f}",
    ]

    REPORT_PATH.write_text("\n".join(report_lines), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "overall_total_mae_v8": v8_metrics["overall"]["total"]["mae"],
        "overall_total_mae_v9": v9_metrics["overall"]["total"]["mae"],
        "overall_margin_mae_v8": v8_metrics["overall"]["margin"]["mae"],
        "overall_margin_mae_v9": v9_metrics["overall"]["margin"]["mae"],
        "playoff_total_bias_v8": v8_metrics["playoffs"]["total"]["mean_error"],
        "playoff_total_bias_v9": v9_metrics["playoffs"]["total"]["mean_error"],
    }, indent=2))


if __name__ == "__main__":
    main()
