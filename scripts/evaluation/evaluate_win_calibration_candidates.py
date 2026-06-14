from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.impute import SimpleImputer
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss, log_loss, roc_auc_score
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


REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "win_calibration_candidate_report.md"
JSON_PATH = REPORT_DIR / "win_calibration_candidate_metrics.json"

TRAIN_END = pd.Timestamp("2025-01-31")
CAL_END = pd.Timestamp("2025-04-06")


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)


def metrics(y_true: pd.Series, p: np.ndarray) -> dict:
    return {
        "rows": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, (p >= 0.5).astype(int))),
        "roc_auc": float(roc_auc_score(y_true, p)),
        "brier": float(brier_score_loss(y_true, p)),
        "log_loss": float(log_loss(y_true, np.vstack([1 - p, p]).T)),
        "avg_pred": float(np.mean(p)),
        "actual_rate": float(np.mean(y_true)),
    }


def bucket_rows(y_true: pd.Series, p: np.ndarray) -> list[dict]:
    bins = [0.0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 1.0]
    labels = [f"{bins[i]:.2f}-{bins[i + 1]:.2f}" for i in range(len(bins) - 1)]
    tmp = pd.DataFrame({"y": y_true.to_numpy(), "p": p})
    tmp["bucket"] = pd.cut(tmp["p"], bins=bins, labels=labels, include_lowest=True)
    rows = []
    for bucket, g in tmp.groupby("bucket", observed=False):
        if g.empty:
            continue
        rows.append({
            "bucket": str(bucket),
            "rows": int(len(g)),
            "avg_pred": float(g["p"].mean()),
            "actual_rate": float(g["y"].mean()),
            "calibration_error": float(g["p"].mean() - g["y"].mean()),
            "abs_calibration_error": float(abs(g["p"].mean() - g["y"].mean())),
        })
    return rows


def expected_calibration_error(rows: list[dict]) -> float:
    total = sum(r["rows"] for r in rows)
    if total == 0:
        return float("nan")
    return float(sum(r["rows"] * r["abs_calibration_error"] for r in rows) / total)


def fit_bucket_adjuster(y_cal: pd.Series, p_cal: np.ndarray):
    bins = np.array([0.0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 1.0])
    tmp = pd.DataFrame({"y": y_cal.to_numpy(), "p": p_cal})
    tmp["bucket"] = pd.cut(tmp["p"], bins=bins, include_lowest=True)
    corrections: list[dict] = []
    global_delta = float(tmp["y"].mean() - tmp["p"].mean())
    for interval, g in tmp.groupby("bucket", observed=False):
        if g.empty:
            continue
        left = float(interval.left)
        right = float(interval.right)
        if len(g) >= 50:
            delta = float(g["y"].mean() - g["p"].mean())
        else:
            delta = global_delta
        corrections.append({"left": left, "right": right, "delta": delta, "rows": int(len(g))})

    def transform(p: np.ndarray) -> np.ndarray:
        out = p.copy()
        for corr in corrections:
            if corr["left"] <= 0:
                mask = (p >= corr["left"]) & (p <= corr["right"])
            else:
                mask = (p > corr["left"]) & (p <= corr["right"])
            out[mask] = p[mask] + corr["delta"]
        return np.clip(out, 1e-6, 1 - 1e-6)

    return transform, corrections


def prepare_dataset() -> tuple[pd.DataFrame, list[str]]:
    df = load_team_model_ready()
    df = add_venue_aliases(df)
    df = add_player_projection_features(df)
    feature_cols = json.loads((ROOT / "models" / "production" / "feature_columns_v8.json").read_text())
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing features: {missing}")
    df = df.dropna(subset=["GAME_DATE", "WIN"]).copy()
    return df, feature_cols


def segment_eval(test_df: pd.DataFrame, y_test: pd.Series, p: np.ndarray) -> dict:
    tmp = test_df.copy()
    tmp["P_HOME_WIN"] = p
    out = {}
    for name, fn in segment_masks(tmp).items():
        mask = fn(tmp).fillna(False)
        if int(mask.sum()) < 50:
            continue
        out[name] = metrics(y_test.loc[mask], p[mask.to_numpy()])
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
    df, feature_cols = prepare_dataset()
    train = df[df["GAME_DATE"] <= TRAIN_END].copy()
    cal = df[(df["GAME_DATE"] > TRAIN_END) & (df["GAME_DATE"] <= CAL_END)].copy()
    test = df[df["GAME_DATE"] > CAL_END].copy()

    base = Pipeline([
        ("imputer", SimpleImputer(strategy="mean")),
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, random_state=42)),
    ])
    base.fit(train[feature_cols], train["WIN"].astype(int))

    p_cal = base.predict_proba(cal[feature_cols])[:, 1]
    p_test_base = base.predict_proba(test[feature_cols])[:, 1]
    y_cal = cal["WIN"].astype(int)
    y_test = test["WIN"].astype(int)

    platt = LogisticRegression(random_state=42)
    platt.fit(logit(p_cal), y_cal)
    p_test_platt = platt.predict_proba(logit(p_test_base))[:, 1]

    isotonic = IsotonicRegression(out_of_bounds="clip")
    isotonic.fit(p_cal, y_cal)
    p_test_iso = np.clip(isotonic.predict(p_test_base), 1e-6, 1 - 1e-6)

    bucket_adjuster, bucket_corrections = fit_bucket_adjuster(y_cal, p_cal)
    p_test_bucket = bucket_adjuster(p_test_base)

    candidates = {
        "base_uncalibrated": p_test_base,
        "platt_logit": p_test_platt,
        "isotonic": p_test_iso,
        "bucket_delta": p_test_bucket,
    }

    candidate_metrics = {}
    for name, probs in candidates.items():
        rows = bucket_rows(y_test, probs)
        candidate_metrics[name] = {
            **metrics(y_test, probs),
            "ece": expected_calibration_error(rows),
            "buckets": rows,
            "segments": segment_eval(test, y_test, probs),
        }

    best_name = min(candidate_metrics, key=lambda k: (candidate_metrics[k]["brier"], candidate_metrics[k]["ece"]))
    data = {
        "split": {
            "train_end": TRAIN_END.date().isoformat(),
            "calibration_end": CAL_END.date().isoformat(),
            "train_rows": int(len(train)),
            "calibration_rows": int(len(cal)),
            "test_rows": int(len(test)),
        },
        "candidates": candidate_metrics,
        "best_by_brier_then_ece": best_name,
        "bucket_corrections": bucket_corrections,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    summary_rows = [{"candidate": name, **{k: v for k, v in m.items() if k not in {"buckets", "segments"}}} for name, m in candidate_metrics.items()]
    best = candidate_metrics[best_name]
    base_m = candidate_metrics["base_uncalibrated"]
    report = [
        "# Win Calibration Candidate Evaluation",
        "",
        f"Train: <= {TRAIN_END.date().isoformat()}, calibration: ({TRAIN_END.date().isoformat()}, {CAL_END.date().isoformat()}], test: > {CAL_END.date().isoformat()}.",
        "",
        "## Summary",
        markdown_table(summary_rows, ["candidate", "rows", "accuracy", "roc_auc", "brier", "log_loss", "ece", "avg_pred", "actual_rate"]),
        "",
        "## Decision",
        f"- Best candidate by Brier then ECE: `{best_name}`.",
        f"- Brier delta vs base: {best['brier'] - base_m['brier']:.5f}.",
        f"- ECE delta vs base: {best['ece'] - base_m['ece']:.5f}.",
        f"- ROC-AUC delta vs base: {best['roc_auc'] - base_m['roc_auc']:.5f}.",
        "",
        "## Best Candidate Buckets",
        markdown_table(best["buckets"], ["bucket", "rows", "avg_pred", "actual_rate", "calibration_error", "abs_calibration_error"]),
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")
    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "best": best_name,
        "base": {k: base_m[k] for k in ["roc_auc", "brier", "ece", "log_loss"]},
        "best_metrics": {k: best[k] for k in ["roc_auc", "brier", "ece", "log_loss"]},
    }, indent=2))


if __name__ == "__main__":
    main()
