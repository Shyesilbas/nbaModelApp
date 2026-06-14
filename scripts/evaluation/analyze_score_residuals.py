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
REPORT_PATH = REPORT_DIR / "score_v8_residual_analysis.md"
JSON_PATH = REPORT_DIR / "score_v8_residual_analysis.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


def signed_metrics(actual: pd.Series, pred: pd.Series) -> dict:
    err = pred - actual
    return {
        "mae": float(mean_absolute_error(actual, pred)),
        "mean_error": float(err.mean()),
        "median_error": float(err.median()),
        "rmse": float(np.sqrt(np.mean(np.square(err)))),
        "p10_error": float(err.quantile(0.10)),
        "p90_error": float(err.quantile(0.90)),
    }


def build_eval_df() -> tuple[pd.DataFrame, dict]:
    meta = json.loads((ROOT / "models" / "production" / "score_model_v8_metadata.json").read_text())
    df = load_team_model_ready()
    df = add_location_features(df)
    df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])

    home = df[(df["IS_HOME"].astype(bool)) & (df["GAME_DATE"] > SPLIT_DATE)].copy()
    away = df[(~df["IS_HOME"].astype(bool)) & (df["GAME_DATE"] > SPLIT_DATE)].copy()

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
    eval_df["PRED_HOME_PTS_RECON"] = (eval_df["PRED_TOTAL_RAW"] + eval_df["PRED_MARGIN_MODEL"]) / 2.0
    eval_df["PRED_AWAY_PTS_RECON"] = (eval_df["PRED_TOTAL_RAW"] - eval_df["PRED_MARGIN_MODEL"]) / 2.0
    eval_df["PRED_TOTAL_RECON"] = eval_df["PRED_HOME_PTS_RECON"] + eval_df["PRED_AWAY_PTS_RECON"]
    eval_df["PRED_MARGIN_RECON"] = eval_df["PRED_HOME_PTS_RECON"] - eval_df["PRED_AWAY_PTS_RECON"]

    eval_df["TOTAL_ERROR"] = eval_df["PRED_TOTAL_RECON"] - eval_df["ACTUAL_TOTAL"]
    eval_df["MARGIN_ERROR"] = eval_df["PRED_MARGIN_RECON"] - eval_df["ACTUAL_MARGIN"]
    eval_df["HOME_ERROR"] = eval_df["PRED_HOME_PTS_RECON"] - eval_df["ACTUAL_HOME_PTS"]
    eval_df["AWAY_ERROR"] = eval_df["PRED_AWAY_PTS_RECON"] - eval_df["ACTUAL_AWAY_PTS"]
    eval_df["PACE_ERROR"] = eval_df["PRED_PACE"] - eval_df["PACE"]
    eval_df["HOME_RTG_ERROR"] = eval_df["PRED_HOME_RTG"] - eval_df["OFF_RTG"]
    eval_df["AWAY_RTG_ERROR"] = eval_df["PRED_AWAY_RTG"] - eval_df["DEF_RTG"]
    eval_df["RAW_MARGIN_ERROR"] = eval_df["PRED_MARGIN_RAW"] - eval_df["ACTUAL_MARGIN"]
    eval_df["MARGIN_MODEL_ERROR"] = eval_df["PRED_MARGIN_MODEL"] - eval_df["ACTUAL_MARGIN"]
    return eval_df, meta


def segment_summary(df: pd.DataFrame) -> dict:
    return {
        "games": int(len(df)),
        "home": signed_metrics(df["ACTUAL_HOME_PTS"], df["PRED_HOME_PTS_RECON"]),
        "away": signed_metrics(df["ACTUAL_AWAY_PTS"], df["PRED_AWAY_PTS_RECON"]),
        "total": signed_metrics(df["ACTUAL_TOTAL"], df["PRED_TOTAL_RECON"]),
        "margin_reconciled": signed_metrics(df["ACTUAL_MARGIN"], df["PRED_MARGIN_RECON"]),
        "margin_raw_rating": signed_metrics(df["ACTUAL_MARGIN"], df["PRED_MARGIN_RAW"]),
        "margin_model": signed_metrics(df["ACTUAL_MARGIN"], df["PRED_MARGIN_MODEL"]),
        "pace": signed_metrics(df["PACE"], df["PRED_PACE"]),
        "home_rtg": signed_metrics(df["OFF_RTG"], df["PRED_HOME_RTG"]),
        "away_rtg": signed_metrics(df["DEF_RTG"], df["PRED_AWAY_RTG"]),
    }


def markdown_table(rows: list[dict], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        vals = []
        for col in columns:
            value = row.get(col)
            vals.append(f"{value:.4f}" if isinstance(value, float) else str(value))
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def flatten_focus(name: str, summary: dict) -> dict:
    return {
        "segment": name,
        "games": summary["games"],
        "total_mae": summary["total"]["mae"],
        "total_bias": summary["total"]["mean_error"],
        "margin_mae": summary["margin_reconciled"]["mae"],
        "margin_bias": summary["margin_reconciled"]["mean_error"],
        "pace_mae": summary["pace"]["mae"],
        "pace_bias": summary["pace"]["mean_error"],
        "home_rtg_mae": summary["home_rtg"]["mae"],
        "home_rtg_bias": summary["home_rtg"]["mean_error"],
        "away_rtg_mae": summary["away_rtg"]["mae"],
        "away_rtg_bias": summary["away_rtg"]["mean_error"],
    }


def main() -> None:
    eval_df, _ = build_eval_df()
    summaries = {"overall": segment_summary(eval_df)}
    for name, fn in segment_masks(eval_df).items():
        mask = fn(eval_df).fillna(False)
        if int(mask.sum()) < 50:
            continue
        summaries[name] = segment_summary(eval_df.loc[mask])

    focus = ["overall", "home_b2b", "away_b2b", "either_b2b", "away_rest_advantage", "home_rest_advantage", "playoffs", "small_winrate_gap"]
    rows = [flatten_focus(name, summaries[name]) for name in focus if name in summaries]

    # Identify largest signed biases for actionable follow-up.
    bias_rows = []
    for name, summary in summaries.items():
        if summary["games"] < 50:
            continue
        bias_rows.append({
            "segment": name,
            "games": summary["games"],
            "total_bias_abs": abs(summary["total"]["mean_error"]),
            "total_bias": summary["total"]["mean_error"],
            "margin_bias_abs": abs(summary["margin_reconciled"]["mean_error"]),
            "margin_bias": summary["margin_reconciled"]["mean_error"],
            "pace_bias_abs": abs(summary["pace"]["mean_error"]),
            "pace_bias": summary["pace"]["mean_error"],
        })
    bias_rows = sorted(bias_rows, key=lambda r: (r["total_bias_abs"], r["margin_bias_abs"]), reverse=True)

    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "summaries": summaries,
        "focus_rows": rows,
        "largest_bias_rows": bias_rows[:10],
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    report = [
        "# Score V8 Residual Analysis",
        "",
        f"Chronological holdout: games after {SPLIT_DATE.date().isoformat()}. Signed error is `prediction - actual`.",
        "",
        "## Focus Segment Residuals",
        markdown_table(rows, [
            "segment", "games", "total_mae", "total_bias", "margin_mae", "margin_bias",
            "pace_mae", "pace_bias", "home_rtg_mae", "home_rtg_bias", "away_rtg_mae", "away_rtg_bias",
        ]),
        "",
        "## Largest Signed Biases",
        markdown_table(bias_rows[:10], [
            "segment", "games", "total_bias", "total_bias_abs", "margin_bias", "margin_bias_abs", "pace_bias", "pace_bias_abs",
        ]),
        "",
        "## Interpretation",
        "",
        "- If total bias is near zero but MAE is high, the problem is variance/noise, not a simple global correction.",
        "- If pace bias is large in a segment, pace feature/model should be targeted before rating models.",
        "- If margin model bias differs from raw rating margin bias, reconciliation is contributing to directional error.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "overall": rows[0],
        "largest_bias_rows": bias_rows[:5],
    }, indent=2))


if __name__ == "__main__":
    main()
