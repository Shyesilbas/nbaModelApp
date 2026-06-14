from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import RandomizedSearchCV

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.evaluation.evaluate_v8_segments import add_location_features, load_team_model_ready, segment_masks


REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "score_direct_target_candidate_report.md"
JSON_PATH = REPORT_DIR / "score_direct_target_candidate_metrics.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


DIRECT_FEATURES = [
    "PACE_LAST_5",
    "PACE_LAST_10",
    "OPP_PACE_LAST_5",
    "OPP_PACE_LAST_10",
    "OFF_RTG_LAST_5",
    "OFF_RTG_LAST_10",
    "DEF_RTG_LAST_5",
    "DEF_RTG_LAST_10",
    "OPP_OFF_RTG_LAST_5",
    "OPP_OFF_RTG_LAST_10",
    "OPP_DEF_RTG_LAST_5",
    "OPP_DEF_RTG_LAST_10",
    "NET_RTG_LAST_5",
    "NET_RTG_LAST_10",
    "OPP_NET_RTG_LAST_5",
    "OPP_NET_RTG_LAST_10",
    "WINRATE_LAST_5",
    "WINRATE_LAST_10",
    "OPP_WINRATE_LAST_5",
    "OPP_WINRATE_LAST_10",
    "DAYS_REST",
    "OPP_DAYS_REST",
    "IS_B2B",
    "OPP_IS_B2B",
    "TRAVEL_DISTANCE",
    "TIMEZONE_DIFF",
    "OPP_TRAVEL_DISTANCE",
    "OPP_TIMEZONE_DIFF",
    "TEAM_CORE_TOP3_PLAYED_COUNT",
    "TEAM_CORE_TOP3_AVAILABLE_RATE",
    "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
    "OPP_CORE_TOP3_PLAYED_COUNT",
    "OPP_CORE_TOP3_AVAILABLE_RATE",
    "OPP_CORE_TOP3_PTS_LAST_5_SUM",
    "IS_PLAYOFF",
    "IS_ELIMINATION_GAME",
    "CAN_CLINCH_SERIES",
]


def tune_and_train(X_train: pd.DataFrame, y_train: pd.Series):
    model = xgb.XGBRegressor(random_state=42)
    grid = {
        "n_estimators": [100, 150, 200, 300],
        "max_depth": [3, 4, 5, 6],
        "learning_rate": [0.01, 0.05, 0.1, 0.2],
        "subsample": [0.8, 0.9, 1.0],
        "colsample_bytree": [0.8, 0.9, 1.0],
    }
    search = RandomizedSearchCV(
        model,
        param_distributions=grid,
        n_iter=10,
        scoring="neg_mean_absolute_error",
        cv=3,
        random_state=42,
        n_jobs=1,
    )
    search.fit(X_train, y_train)
    return search.best_estimator_


def score_metrics(df: pd.DataFrame, home_pred: np.ndarray, away_pred: np.ndarray) -> dict:
    actual_total = df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"]
    pred_total = home_pred + away_pred
    actual_margin = df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"]
    pred_margin = home_pred - away_pred
    return {
        "games": int(len(df)),
        "home_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"], home_pred)),
        "away_mae": float(mean_absolute_error(df["ACTUAL_AWAY_PTS"], away_pred)),
        "total_mae": float(mean_absolute_error(actual_total, pred_total)),
        "margin_mae": float(mean_absolute_error(actual_margin, pred_margin)),
    }


def evaluate_segments(eval_df: pd.DataFrame, prefix: str) -> dict:
    out = {"overall": score_metrics(eval_df, eval_df[f"{prefix}_HOME_PTS"], eval_df[f"{prefix}_AWAY_PTS"])}
    for name, fn in segment_masks(eval_df).items():
        mask = fn(eval_df).fillna(False)
        if int(mask.sum()) < 50:
            continue
        g = eval_df.loc[mask]
        out[name] = score_metrics(g, g[f"{prefix}_HOME_PTS"], g[f"{prefix}_AWAY_PTS"])
    return out


def markdown_table(rows: list[dict], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        vals = []
        for col in columns:
            value = row.get(col)
            vals.append(f"{value:.5f}" if isinstance(value, float) else str(value))
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def main() -> None:
    meta = json.loads((ROOT / "models" / "production" / "score_model_v8_metadata.json").read_text())
    df = load_team_model_ready()
    df = add_location_features(df)
    df = df[df["IS_HOME"].astype(bool)].copy()
    df = df.dropna(subset=DIRECT_FEATURES + ["PACE", "OFF_RTG", "DEF_RTG"])
    df["ACTUAL_HOME_PTS"] = df["PACE"] * df["OFF_RTG"] / 100.0
    df["ACTUAL_AWAY_PTS"] = df["PACE"] * df["DEF_RTG"] / 100.0
    df["TARGET_TOTAL_POINTS"] = df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"]
    df["TARGET_POINT_DIFF"] = df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"]

    train = df[df["GAME_DATE"] <= SPLIT_DATE].copy()
    test = df[df["GAME_DATE"] > SPLIT_DATE].copy()

    total_model = tune_and_train(train[DIRECT_FEATURES], train["TARGET_TOTAL_POINTS"])
    diff_model = tune_and_train(train[DIRECT_FEATURES], train["TARGET_POINT_DIFF"])

    base_pace = joblib.load(ROOT / "models" / "production" / "score_model_v8_pace.pkl")
    base_home = joblib.load(ROOT / "models" / "production" / "score_model_v8_home_rtg.pkl")
    base_away = joblib.load(ROOT / "models" / "production" / "score_model_v8_away_rtg.pkl")

    away_all = load_team_model_ready()
    away_all = add_location_features(away_all)
    away_test = away_all[(~away_all["IS_HOME"].astype(bool)) & (away_all["GAME_DATE"] > SPLIT_DATE)].copy()
    away_eval = away_test[["GAME_ID"] + meta["away_off_rtg_features"]].copy()
    away_eval["BASE_AWAY_RTG"] = base_away.predict(away_eval[meta["away_off_rtg_features"]])

    eval_df = test.copy()
    eval_df["BASE_PACE"] = base_pace.predict(eval_df[meta["pace_features"]])
    eval_df["BASE_HOME_RTG"] = base_home.predict(eval_df[meta["home_off_rtg_features"]])
    eval_df = eval_df.merge(away_eval[["GAME_ID", "BASE_AWAY_RTG"]], on="GAME_ID", how="inner")
    eval_df["BASE_HOME_PTS"] = eval_df["BASE_PACE"] * eval_df["BASE_HOME_RTG"] / 100.0
    eval_df["BASE_AWAY_PTS"] = eval_df["BASE_PACE"] * eval_df["BASE_AWAY_RTG"] / 100.0

    pred_total = total_model.predict(eval_df[DIRECT_FEATURES])
    pred_diff = diff_model.predict(eval_df[DIRECT_FEATURES])
    eval_df["CAND_HOME_PTS"] = (pred_total + pred_diff) / 2.0
    eval_df["CAND_AWAY_PTS"] = (pred_total - pred_diff) / 2.0

    base_metrics = evaluate_segments(eval_df, "BASE")
    cand_metrics = evaluate_segments(eval_df, "CAND")

    focus = ["overall", "home_b2b", "away_b2b", "either_b2b", "away_rest_advantage", "home_rest_advantage", "playoffs", "small_winrate_gap"]
    rows = []
    for segment in focus:
        if segment not in base_metrics or segment not in cand_metrics:
            continue
        b = base_metrics[segment]
        c = cand_metrics[segment]
        rows.append({
            "segment": segment,
            "games": c["games"],
            "base_total_mae": b["total_mae"],
            "cand_total_mae": c["total_mae"],
            "total_delta": c["total_mae"] - b["total_mae"],
            "base_margin_mae": b["margin_mae"],
            "cand_margin_mae": c["margin_mae"],
            "margin_delta": c["margin_mae"] - b["margin_mae"],
            "base_home_mae": b["home_mae"],
            "cand_home_mae": c["home_mae"],
            "home_delta": c["home_mae"] - b["home_mae"],
            "base_away_mae": b["away_mae"],
            "cand_away_mae": c["away_mae"],
            "away_delta": c["away_mae"] - b["away_mae"],
        })

    overall = rows[0]
    decision = "promote_score_direct_candidate" if overall["total_delta"] < 0 and overall["margin_delta"] <= 0 else "reject"

    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "direct_features": DIRECT_FEATURES,
        "base_metrics": base_metrics,
        "candidate_metrics": cand_metrics,
        "comparison_rows": rows,
        "decision": decision,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    report = [
        "# Score Direct Target Candidate Evaluation",
        "",
        "Candidate predicts direct `TOTAL_POINTS` and `POINT_DIFF`, then reconciles scores mathematically.",
        f"Chronological split: train <= {SPLIT_DATE.date().isoformat()}, test > {SPLIT_DATE.date().isoformat()}.",
        "",
        "## Focus Segment Comparison",
        markdown_table(rows, [
            "segment", "games", "base_total_mae", "cand_total_mae", "total_delta",
            "base_margin_mae", "cand_margin_mae", "margin_delta",
            "base_home_mae", "cand_home_mae", "home_delta",
            "base_away_mae", "cand_away_mae", "away_delta",
        ]),
        "",
        "## Decision",
        f"- Decision: `{decision}`.",
        f"- Overall total MAE delta: {overall['total_delta']:.5f}.",
        f"- Overall margin MAE delta: {overall['margin_delta']:.5f}.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "decision": decision,
        "overall": {
            "base": base_metrics["overall"],
            "candidate": cand_metrics["overall"],
            "total_delta": overall["total_delta"],
            "margin_delta": overall["margin_delta"],
        },
        "focus_segments": rows,
    }, indent=2))


if __name__ == "__main__":
    main()
