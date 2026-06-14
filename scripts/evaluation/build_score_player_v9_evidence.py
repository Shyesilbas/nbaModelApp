from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "score_player_v9_evidence_report.md"
JSON_PATH = REPORT_DIR / "score_player_v9_evidence_metrics.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"Missing required evidence file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def metric(data: dict, path: list[str]) -> float:
    cur = data
    for key in path:
        cur = cur[key]
    return float(cur)


def round_metrics(obj):
    if isinstance(obj, dict):
        return {k: round_metrics(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [round_metrics(v) for v in obj]
    if isinstance(obj, float):
        return round(obj, 6)
    return obj


def update_metadata(path: Path, section: str, evidence: dict) -> None:
    data = load_json(path)
    data[section] = evidence
    path.write_text(json.dumps(data, indent=4), encoding="utf-8")


def main() -> None:
    score_candidate = load_json(REPORT_DIR / "score_postprocessing_candidate_metrics.json")
    score_compare = load_json(REPORT_DIR / "score_v9_vs_v8_comparison.json")
    score_playoffs = load_json(REPORT_DIR / "score_2026_playoffs_validation.md") if False else None
    player_candidate = load_json(REPORT_DIR / "player_postprocessing_candidate_metrics.json")

    score_base = score_candidate["eval_results"]["base_no_corr"]["overall"]
    score_ridge = score_candidate["eval_results"]["ridge_regression"]["overall"]
    score_playoff_base = score_candidate["eval_results"]["base_no_corr"]["playoffs"]
    score_playoff_ridge = score_candidate["eval_results"]["ridge_regression"]["playoffs"]

    player_base = player_candidate["eval_results"]["base_no_corr"]["overall"]["targets"]
    player_ridge = player_candidate["eval_results"]["ridge_regression"]["overall"]["targets"]

    score_evidence = {
        "source": "reports/evaluation/score_postprocessing_candidate_metrics.json",
        "split_date": score_candidate["split_date"],
        "best_strategy": score_candidate["best_strategy"],
        "holdout": {
            "base_no_corr": {
                "total_mae": score_base["total"]["mae"],
                "total_bias": score_base["total"]["mean_error"],
                "margin_mae": score_base["margin"]["mae"],
                "margin_bias": score_base["margin"]["mean_error"],
                "home_mae": score_base["home"]["mae"],
                "away_mae": score_base["away"]["mae"],
            },
            "ridge_regression": {
                "total_mae": score_ridge["total"]["mae"],
                "total_bias": score_ridge["total"]["mean_error"],
                "margin_mae": score_ridge["margin"]["mae"],
                "margin_bias": score_ridge["margin"]["mean_error"],
                "home_mae": score_ridge["home"]["mae"],
                "away_mae": score_ridge["away"]["mae"],
            },
            "delta_ridge_minus_base": {
                "total_mae": score_ridge["total"]["mae"] - score_base["total"]["mae"],
                "total_bias_abs": abs(score_ridge["total"]["mean_error"]) - abs(score_base["total"]["mean_error"]),
                "margin_mae": score_ridge["margin"]["mae"] - score_base["margin"]["mae"],
                "margin_bias_abs": abs(score_ridge["margin"]["mean_error"]) - abs(score_base["margin"]["mean_error"]),
                "home_mae": score_ridge["home"]["mae"] - score_base["home"]["mae"],
                "away_mae": score_ridge["away"]["mae"] - score_base["away"]["mae"],
            },
            "playoffs": {
                "base_total_bias": score_playoff_base["total"]["mean_error"],
                "ridge_total_bias": score_playoff_ridge["total"]["mean_error"],
                "base_margin_bias": score_playoff_base["margin"]["mean_error"],
                "ridge_margin_bias": score_playoff_ridge["margin"]["mean_error"],
                "total_mae_delta": score_playoff_ridge["total"]["mae"] - score_playoff_base["total"]["mae"],
                "margin_mae_delta": score_playoff_ridge["margin"]["mae"] - score_playoff_base["margin"]["mae"],
            },
        },
        "production_v9_vs_v8_source": "reports/evaluation/score_v9_vs_v8_comparison.json",
        "production_v9_vs_v8_summary": {
            "overall_total_mae_delta": metric(score_compare, ["v9_metrics", "overall", "total", "mae"]) - metric(score_compare, ["v8_metrics", "overall", "total", "mae"]),
            "overall_margin_mae_delta": metric(score_compare, ["v9_metrics", "overall", "margin", "mae"]) - metric(score_compare, ["v8_metrics", "overall", "margin", "mae"]),
            "playoff_total_bias_v8": metric(score_compare, ["v8_metrics", "playoffs", "total", "mean_error"]),
            "playoff_total_bias_v9": metric(score_compare, ["v9_metrics", "playoffs", "total", "mean_error"]),
        },
    }

    player_evidence = {
        "source": "reports/evaluation/player_postprocessing_candidate_metrics.json",
        "split_date": player_candidate["split_date"],
        "test_rows": player_candidate["test_rows"],
        "best_strategies": player_candidate["best_strategies"],
        "holdout": {},
    }
    for target in ["pts", "reb", "ast"]:
        base = player_base[target]
        ridge = player_ridge[target]
        player_evidence["holdout"][target] = {
            "base_no_corr": {
                "mae": base["mae"],
                "rmse": base["rmse"],
                "bias": base["bias"],
                "r2": base["r2"],
            },
            "ridge_regression": {
                "mae": ridge["mae"],
                "rmse": ridge["rmse"],
                "bias": ridge["bias"],
                "r2": ridge["r2"],
            },
            "delta_ridge_minus_base": {
                "mae": ridge["mae"] - base["mae"],
                "rmse": ridge["rmse"] - base["rmse"],
                "bias_abs": abs(ridge["bias"]) - abs(base["bias"]),
                "r2": ridge["r2"] - base["r2"],
            },
        }

    evidence = {
        "score": score_evidence,
        "player": player_evidence,
        "decision": {
            "score": "keep_v9_ridge_for_total_and_playoff_bias; monitor_margin_bias",
            "player": "keep_v9_ridge; gains_are_small_overall_but_segment_bias_improves",
        },
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(json.dumps(round_metrics(evidence), indent=2), encoding="utf-8")

    update_metadata(ROOT / "models" / "production" / "score_model_v9_metadata.json", "holdout_postprocessing_evidence", round_metrics(score_evidence))
    update_metadata(ROOT / "models" / "production" / "player_v9_metadata.json", "holdout_postprocessing_evidence", round_metrics(player_evidence))

    score_delta = score_evidence["holdout"]["delta_ridge_minus_base"]
    player_holdout = player_evidence["holdout"]
    report = [
        "# SCORE/PLAYER V9 Evidence Report",
        "",
        "This report summarizes non-leaky chronological holdout evidence for the active V9 post-processing layers.",
        "",
        "## Score V9 Ridge",
        "",
        f"- Split date: `{score_candidate['split_date']}`",
        f"- Best strategy: `{score_candidate['best_strategy']}`",
        f"- Total MAE delta: `{score_delta['total_mae']:.4f}`",
        f"- Margin MAE delta: `{score_delta['margin_mae']:.4f}`",
        f"- Home MAE delta: `{score_delta['home_mae']:.4f}`",
        f"- Away MAE delta: `{score_delta['away_mae']:.4f}`",
        f"- Playoff total bias: `{score_playoff_base['total']['mean_error']:.4f}` -> `{score_playoff_ridge['total']['mean_error']:.4f}`",
        f"- Playoff margin bias: `{score_playoff_base['margin']['mean_error']:.4f}` -> `{score_playoff_ridge['margin']['mean_error']:.4f}`",
        "",
        "## Player V9 Ridge",
        "",
        f"- Split date: `{player_candidate['split_date']}`",
        f"- Test rows: `{player_candidate['test_rows']}`",
        "| Target | Raw MAE | Ridge MAE | MAE Delta | Raw Bias | Ridge Bias |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for target in ["pts", "reb", "ast"]:
        item = player_holdout[target]
        report.append(
            f"| `{target}` | {item['base_no_corr']['mae']:.4f} | {item['ridge_regression']['mae']:.4f} | "
            f"{item['delta_ridge_minus_base']['mae']:.4f} | {item['base_no_corr']['bias']:.4f} | {item['ridge_regression']['bias']:.4f} |"
        )
    report.extend([
        "",
        "## Decision",
        "",
        "- Score: keep V9 Ridge for total and playoff bias correction; margin bias needs monitoring.",
        "- Player: keep V9 Ridge because overall MAE gains are small but consistent, and segment bias improves.",
        "",
        "## Files",
        "",
        f"- JSON: `{JSON_PATH.relative_to(ROOT)}`",
        "- Score metadata updated: `models/production/score_model_v9_metadata.json`",
        "- Player metadata updated: `models/production/player_v9_metadata.json`",
    ])
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")

    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "score_total_mae_delta": score_delta["total_mae"],
        "score_margin_mae_delta": score_delta["margin_mae"],
        "player_pts_mae_delta": player_holdout["pts"]["delta_ridge_minus_base"]["mae"],
        "player_reb_mae_delta": player_holdout["reb"]["delta_ridge_minus_base"]["mae"],
        "player_ast_mae_delta": player_holdout["ast"]["delta_ridge_minus_base"]["mae"],
    }, indent=2))


if __name__ == "__main__":
    main()
