from __future__ import annotations

import json
import math
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
REPORT_PATH = REPORT_DIR / "score_feature_candidate_report.md"
JSON_PATH = REPORT_DIR / "score_feature_candidate_metrics.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


SCHEDULE_STRESS_FEATURES = [
    "REST_DIFF",
    "ABS_REST_DIFF",
    "HOME_REST_ADVANTAGE",
    "AWAY_REST_ADVANTAGE",
    "EITHER_B2B",
    "B2B_ASYMMETRY",
    "HOME_B2B_ONLY",
    "AWAY_B2B_ONLY",
    "TRAVEL_REST_INTERACTION",
    "OPP_TRAVEL_REST_INTERACTION",
    "TIMEZONE_REST_INTERACTION",
    "OPP_TIMEZONE_REST_INTERACTION",
    "PLAYOFF_REST_DIFF",
    "PLAYOFF_EITHER_B2B",
]


def add_score_candidate_features(df: pd.DataFrame) -> pd.DataFrame:
    df = add_location_features(df.copy())
    df["REST_DIFF"] = df["DAYS_REST"] - df["OPP_DAYS_REST"]
    df["ABS_REST_DIFF"] = df["REST_DIFF"].abs()
    df["HOME_REST_ADVANTAGE"] = (df["REST_DIFF"] > 0).astype(int)
    df["AWAY_REST_ADVANTAGE"] = (df["REST_DIFF"] < 0).astype(int)
    df["EITHER_B2B"] = ((df["IS_B2B"].astype(int) == 1) | (df["OPP_IS_B2B"].astype(int) == 1)).astype(int)
    df["B2B_ASYMMETRY"] = (df["IS_B2B"].astype(int) - df["OPP_IS_B2B"].astype(int)).astype(float)
    df["HOME_B2B_ONLY"] = ((df["IS_B2B"].astype(int) == 1) & (df["OPP_IS_B2B"].astype(int) == 0)).astype(int)
    df["AWAY_B2B_ONLY"] = ((df["IS_B2B"].astype(int) == 0) & (df["OPP_IS_B2B"].astype(int) == 1)).astype(int)
    safe_rest = df["DAYS_REST"].replace(0, 0.5)
    safe_opp_rest = df["OPP_DAYS_REST"].replace(0, 0.5)
    df["TRAVEL_REST_INTERACTION"] = df["TRAVEL_DISTANCE"] / safe_rest
    df["OPP_TRAVEL_REST_INTERACTION"] = df["OPP_TRAVEL_DISTANCE"] / safe_opp_rest
    df["TIMEZONE_REST_INTERACTION"] = df["TIMEZONE_DIFF"] / safe_rest
    df["OPP_TIMEZONE_REST_INTERACTION"] = df["OPP_TIMEZONE_DIFF"] / safe_opp_rest
    df["PLAYOFF_REST_DIFF"] = df["IS_PLAYOFF"].astype(int) * df["REST_DIFF"]
    df["PLAYOFF_EITHER_B2B"] = df["IS_PLAYOFF"].astype(int) * df["EITHER_B2B"]
    return df.replace([np.inf, -np.inf], np.nan)


def tune_and_train(X_train: pd.DataFrame, y_train: pd.Series):
    base = xgb.XGBRegressor(random_state=42)
    grid = {
        "n_estimators": [100, 150, 200, 300],
        "max_depth": [3, 4, 5, 6],
        "learning_rate": [0.01, 0.05, 0.1, 0.2],
        "subsample": [0.8, 0.9, 1.0],
        "colsample_bytree": [0.8, 0.9, 1.0],
    }
    search = RandomizedSearchCV(
        base,
        param_distributions=grid,
        n_iter=10,
        scoring="neg_mean_absolute_error",
        cv=3,
        random_state=42,
        n_jobs=1,
    )
    search.fit(X_train, y_train)
    return search.best_estimator_


def split_train_test(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    return df[df["GAME_DATE"] <= SPLIT_DATE].copy(), df[df["GAME_DATE"] > SPLIT_DATE].copy()


def score_metrics(df: pd.DataFrame, home_pred: np.ndarray, away_pred: np.ndarray) -> dict:
    return {
        "games": int(len(df)),
        "home_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"], home_pred)),
        "away_mae": float(mean_absolute_error(df["ACTUAL_AWAY_PTS"], away_pred)),
        "total_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"], home_pred + away_pred)),
        "margin_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"], home_pred - away_pred)),
    }


def evaluate_predictions(eval_df: pd.DataFrame, prefix: str) -> dict:
    metrics = {
        "overall": score_metrics(eval_df, eval_df[f"{prefix}_HOME_PTS"], eval_df[f"{prefix}_AWAY_PTS"])
    }
    for name, fn in segment_masks(eval_df).items():
        mask = fn(eval_df).fillna(False)
        if int(mask.sum()) < 50:
            continue
        g = eval_df.loc[mask]
        metrics[name] = score_metrics(g, g[f"{prefix}_HOME_PTS"], g[f"{prefix}_AWAY_PTS"])
    return metrics


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
    df = add_score_candidate_features(df)
    df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])

    home = df[df["IS_HOME"].astype(bool)].copy()
    away = df[~df["IS_HOME"].astype(bool)].copy()

    home["TARGET_PACE"] = home["PACE"]
    home["TARGET_HOME_OFF_RTG"] = home["OFF_RTG"]
    away["TARGET_AWAY_OFF_RTG"] = away["OFF_RTG"]

    home_train, home_test = split_train_test(home)
    away_train, away_test = split_train_test(away)

    base_pace_features = meta["pace_features"]
    base_home_features = meta["home_off_rtg_features"]
    base_away_features = meta["away_off_rtg_features"]
    cand_pace_features = base_pace_features + SCHEDULE_STRESS_FEATURES
    cand_home_features = base_home_features + SCHEDULE_STRESS_FEATURES
    cand_away_features = base_away_features + SCHEDULE_STRESS_FEATURES

    base_pace = joblib.load(ROOT / "models" / "production" / "score_model_v8_pace.pkl")
    base_home = joblib.load(ROOT / "models" / "production" / "score_model_v8_home_rtg.pkl")
    base_away = joblib.load(ROOT / "models" / "production" / "score_model_v8_away_rtg.pkl")

    cand_pace = tune_and_train(home_train[cand_pace_features], home_train["TARGET_PACE"])
    cand_home = tune_and_train(home_train[cand_home_features], home_train["TARGET_HOME_OFF_RTG"])
    cand_away = tune_and_train(away_train[cand_away_features], away_train["TARGET_AWAY_OFF_RTG"])

    eval_df = home_test.copy()
    eval_df["ACTUAL_HOME_PTS"] = eval_df["PACE"] * eval_df["OFF_RTG"] / 100.0
    eval_df["ACTUAL_AWAY_PTS"] = eval_df["PACE"] * eval_df["DEF_RTG"] / 100.0

    away_base = away_test[["GAME_ID"] + base_away_features].copy()
    away_base["BASE_AWAY_RTG"] = base_away.predict(away_base[base_away_features])
    away_cand = away_test[["GAME_ID"] + cand_away_features].copy()
    away_cand["CAND_AWAY_RTG"] = cand_away.predict(away_cand[cand_away_features])

    eval_df["BASE_PACE"] = base_pace.predict(eval_df[base_pace_features])
    eval_df["BASE_HOME_RTG"] = base_home.predict(eval_df[base_home_features])
    eval_df["CAND_PACE"] = cand_pace.predict(eval_df[cand_pace_features])
    eval_df["CAND_HOME_RTG"] = cand_home.predict(eval_df[cand_home_features])
    eval_df = eval_df.merge(away_base[["GAME_ID", "BASE_AWAY_RTG"]], on="GAME_ID", how="inner")
    eval_df = eval_df.merge(away_cand[["GAME_ID", "CAND_AWAY_RTG"]], on="GAME_ID", how="inner")

    eval_df["BASE_HOME_PTS"] = eval_df["BASE_PACE"] * eval_df["BASE_HOME_RTG"] / 100.0
    eval_df["BASE_AWAY_PTS"] = eval_df["BASE_PACE"] * eval_df["BASE_AWAY_RTG"] / 100.0
    eval_df["CAND_HOME_PTS"] = eval_df["CAND_PACE"] * eval_df["CAND_HOME_RTG"] / 100.0
    eval_df["CAND_AWAY_PTS"] = eval_df["CAND_PACE"] * eval_df["CAND_AWAY_RTG"] / 100.0

    base_metrics = evaluate_predictions(eval_df, "BASE")
    cand_metrics = evaluate_predictions(eval_df, "CAND")

    focus = ["overall", "home_b2b", "away_b2b", "either_b2b", "away_rest_advantage", "home_rest_advantage", "playoffs"]
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

    overall_delta = cand_metrics["overall"]["total_mae"] - base_metrics["overall"]["total_mae"]
    b2b_delta = cand_metrics.get("either_b2b", {}).get("total_mae", math.inf) - base_metrics.get("either_b2b", {}).get("total_mae", math.inf)
    decision = "promote_score_candidate" if overall_delta <= 0 and b2b_delta <= 0 else "reject"

    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "schedule_stress_features": SCHEDULE_STRESS_FEATURES,
        "base_metrics": base_metrics,
        "candidate_metrics": cand_metrics,
        "comparison_rows": rows,
        "decision": decision,
    }
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    report = [
        "# Score Schedule-Stress Feature Candidate Evaluation",
        "",
        f"Chronological split: train <= {SPLIT_DATE.date().isoformat()}, test > {SPLIT_DATE.date().isoformat()}.",
        "",
        "## Candidate Additions",
        "",
        "\n".join(f"- `{name}`" for name in SCHEDULE_STRESS_FEATURES),
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
        f"- Overall total MAE delta: {overall_delta:.5f}.",
        f"- Either-B2B total MAE delta: {b2b_delta:.5f}.",
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
            "total_delta": overall_delta,
        },
        "focus_segments": rows,
    }, indent=2))


if __name__ == "__main__":
    main()
