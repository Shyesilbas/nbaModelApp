from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.evaluation.evaluate_v8_segments import (
    add_player_projection_features,
    add_venue_aliases,
    load_team_model_ready,
    segment_masks,
)
from src.features.win_strength_features import add_win_strength_features


REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "win_feature_candidate_report.md"
JSON_PATH = REPORT_DIR / "win_feature_candidate_metrics.json"
SPLIT_DATE = pd.Timestamp("2025-04-06")


def metrics(y_true: pd.Series, p: np.ndarray) -> dict:
    pred = (p >= 0.5).astype(int)
    return {
        "rows": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, pred)),
        "roc_auc": float(roc_auc_score(y_true, p)),
        "brier": float(brier_score_loss(y_true, p)),
        "avg_pred": float(np.mean(p)),
        "actual_rate": float(np.mean(y_true)),
    }


def train_predict(train: pd.DataFrame, test: pd.DataFrame, features: list[str]) -> np.ndarray:
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])
    model.fit(train[features], train["WIN"].astype(int))
    return model.predict_proba(test[features])[:, 1]


def segment_metrics(test: pd.DataFrame, p: np.ndarray) -> dict:
    tmp = test.copy()
    tmp["P_HOME_WIN"] = p
    out = {}
    for name, fn in segment_masks(tmp).items():
        mask = fn(tmp).fillna(False)
        if int(mask.sum()) < 50:
            continue
        out[name] = metrics(tmp.loc[mask, "WIN"].astype(int), p[mask.to_numpy()])
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
    df = load_team_model_ready()
    df = add_venue_aliases(df)
    df = add_player_projection_features(df)
    df = add_win_strength_features(df)

    base_features = json.loads((ROOT / "models" / "production" / "feature_columns_v8.json").read_text())
    candidate_additions = [
        "PRE_GAME_ELO",
        "OPP_PRE_GAME_ELO",
        "ELO_DIFF",
        "ABS_ELO_DIFF",
        "WINRATE_DIFF_LAST_10",
        "ABS_WINRATE_DIFF_LAST_10",
        "REST_DIFF",
        "IS_CLOSE_STRENGTH",
        "PLAYOFF_ELO_DIFF",
        "PLAYOFF_ABS_ELO_DIFF",
        "PLAYOFF_REST_DIFF",
        "CLOSE_STRENGTH_REST_DIFF",
    ]
    candidate_features = base_features + candidate_additions

    train = df[df["GAME_DATE"] <= SPLIT_DATE].dropna(subset=["WIN"]).copy()
    test = df[df["GAME_DATE"] > SPLIT_DATE].dropna(subset=["WIN"]).copy()

    p_base = train_predict(train, test, base_features)
    p_candidate = train_predict(train, test, candidate_features)

    base_overall = metrics(test["WIN"].astype(int), p_base)
    candidate_overall = metrics(test["WIN"].astype(int), p_candidate)
    base_segments = segment_metrics(test, p_base)
    candidate_segments = segment_metrics(test, p_candidate)

    focus_segments = ["overall", "playoffs", "small_winrate_gap", "low_conf_50_55", "either_b2b", "large_winrate_gap"]
    comparison_rows = []
    for segment in focus_segments:
        base_m = base_overall if segment == "overall" else base_segments.get(segment)
        cand_m = candidate_overall if segment == "overall" else candidate_segments.get(segment)
        if not base_m or not cand_m:
            continue
        comparison_rows.append({
            "segment": segment,
            "rows": cand_m["rows"],
            "base_auc": base_m["roc_auc"],
            "cand_auc": cand_m["roc_auc"],
            "auc_delta": cand_m["roc_auc"] - base_m["roc_auc"],
            "base_brier": base_m["brier"],
            "cand_brier": cand_m["brier"],
            "brier_delta": cand_m["brier"] - base_m["brier"],
            "base_acc": base_m["accuracy"],
            "cand_acc": cand_m["accuracy"],
            "acc_delta": cand_m["accuracy"] - base_m["accuracy"],
        })

    decision = "reject"
    if candidate_overall["brier"] <= base_overall["brier"] and candidate_overall["roc_auc"] >= base_overall["roc_auc"] - 0.002:
        playoff = next((r for r in comparison_rows if r["segment"] == "playoffs"), None)
        small_gap = next((r for r in comparison_rows if r["segment"] == "small_winrate_gap"), None)
        if (playoff and playoff["brier_delta"] < 0) or (small_gap and small_gap["brier_delta"] < 0):
            decision = "promote_candidate_for_v9_training"

    data = {
        "split_date": SPLIT_DATE.date().isoformat(),
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "base_features_count": len(base_features),
        "candidate_features_count": len(candidate_features),
        "candidate_additions": candidate_additions,
        "base_overall": base_overall,
        "candidate_overall": candidate_overall,
        "base_segments": base_segments,
        "candidate_segments": candidate_segments,
        "comparison_rows": comparison_rows,
        "decision": decision,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    report = [
        "# Win Feature Candidate Evaluation",
        "",
        f"Chronological split: train <= {SPLIT_DATE.date().isoformat()}, test > {SPLIT_DATE.date().isoformat()}.",
        "",
        "## Candidate Additions",
        "",
        "\n".join(f"- `{name}`" for name in candidate_additions),
        "",
        "## Focus Segment Comparison",
        markdown_table(comparison_rows, [
            "segment", "rows", "base_auc", "cand_auc", "auc_delta",
            "base_brier", "cand_brier", "brier_delta", "base_acc", "cand_acc", "acc_delta",
        ]),
        "",
        "## Decision",
        f"- Decision: `{decision}`.",
        f"- Overall AUC delta: {candidate_overall['roc_auc'] - base_overall['roc_auc']:.5f}.",
        f"- Overall Brier delta: {candidate_overall['brier'] - base_overall['brier']:.5f}.",
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "decision": decision,
        "overall": {
            "base": base_overall,
            "candidate": candidate_overall,
            "auc_delta": candidate_overall["roc_auc"] - base_overall["roc_auc"],
            "brier_delta": candidate_overall["brier"] - base_overall["brier"],
        },
        "focus_segments": comparison_rows,
    }, indent=2))


if __name__ == "__main__":
    main()
