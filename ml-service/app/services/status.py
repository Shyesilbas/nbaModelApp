from src.core.artifact_paths import resolve_artifact_path

from .. import service as svc
from ..schemas import (
    ModelMetrics,
    ModelStatusResponse,
    ScoreModelInfo,
    WinModelInfo,
)


def _extract_win_metrics(metadata):
    metrics = ModelMetrics()
    if not metadata:
        return metrics
    selected = metadata.get("selected_metrics", {})
    flat = metadata.get("metrics", {})
    uncal = flat.get("uncalibrated", {}) if isinstance(flat.get("uncalibrated", {}), dict) else {}
    metrics.roc_auc = selected.get("roc_auc") or metadata.get("roc_auc") or flat.get("roc_auc", uncal.get("roc_auc"))
    metrics.brier = selected.get("brier_score") or selected.get("brier") or metadata.get("brier_score") or flat.get("brier", uncal.get("brier_score"))
    metrics.accuracy = selected.get("accuracy") or metadata.get("accuracy") or flat.get("accuracy", uncal.get("accuracy"))
    return metrics


def _experimental_candidate():
    v5_exp_path = svc.ROOT / "models" / "experimental" / "win_probability_model.pkl"
    if v5_exp_path.exists():
        exp_metadata_path = svc.ROOT / "models" / "experimental" / "win_metadata.json"
        if not exp_metadata_path.exists():
            return None
        import json
        with open(exp_metadata_path, "r") as f:
            exp_metadata = json.load(f)
        exp_metrics = exp_metadata.get("metrics", {})
        best_cal = exp_metadata.get("selected_calibration", "uncalibrated")
        best_metrics = exp_metrics.get(best_cal, {}) or exp_metrics.get("uncalibrated", {}) or {}
        return {
            "model_name": "win_probability_model_v5",
            "path": str(v5_exp_path),
            "training_date": exp_metadata.get("training_date"),
            "version": exp_metadata.get("version") or exp_metadata.get("training_date") or "5.0",
            "metrics": {
                "roc_auc": best_metrics.get("roc_auc"),
                "brier": best_metrics.get("brier_score") or best_metrics.get("brier"),
                "brier_score": best_metrics.get("brier_score") or best_metrics.get("brier"),
                "accuracy": best_metrics.get("accuracy")
            }
        }

    experimental_path = svc.ROOT / "models" / "experimental" / "cross_season_win_logistic_regression.pkl"
    if not experimental_path.exists():
        return None

    exp_metadata_path = experimental_path.parent / "cross_season_win_metadata.json"
    if not exp_metadata_path.exists():
        return {
            "model_name": "cross_season_win_logistic_regression",
            "path": str(experimental_path),
            "training_date": None,
            "version": None,
            # Never report numbers that no metadata file backs.
            "metrics": {"roc_auc": None, "brier": None, "accuracy": None},
            "note": "Metadata file missing; metrics unknown"
        }

    import json
    with open(exp_metadata_path, "r") as f:
        exp_metadata = json.load(f)
    exp_metrics = exp_metadata.get("metrics", {})
    uncalibrated_metrics = exp_metrics.get("uncalibrated", {}) if isinstance(exp_metrics.get("uncalibrated", {}), dict) else {}
    return {
        "model_name": "cross_season_win_logistic_regression",
        "path": str(experimental_path),
        "training_date": exp_metadata.get("training_date"),
        "version": exp_metadata.get("version") or exp_metadata.get("training_date"),
        "metrics": {
            "roc_auc": exp_metrics.get("roc_auc", uncalibrated_metrics.get("roc_auc")),
            "brier": exp_metrics.get("brier", uncalibrated_metrics.get("brier_score")),
            "brier_score": exp_metrics.get("brier_score", uncalibrated_metrics.get("brier_score")),
            "accuracy": exp_metrics.get("accuracy", uncalibrated_metrics.get("accuracy"))
        }
    }


def get_model_status() -> ModelStatusResponse:
    win_model_path = resolve_artifact_path("win_model", "model_path", "models/production/win_model.pkl")
    win_info = WinModelInfo(
        active=svc.loader.model is not None,
        scope="production",
        path=str(win_model_path),
        version=svc.loader.get_version(),
        metrics=_extract_win_metrics(svc.loader.metadata)
    )

    home_model_path = svc.score_loader.home_rtg_path or resolve_artifact_path("score_model", "home_model_path", "models/production/score_model_home_rtg.pkl")
    away_model_path = svc.score_loader.away_rtg_path or resolve_artifact_path("score_model", "away_model_path", "models/production/score_model_away_rtg.pkl")
    total_model_path = svc.score_loader.pace_path or resolve_artifact_path("score_model", "total_model_path", "models/production/score_model_pace.pkl")
    margin_model_path = svc.score_loader.margin_path or resolve_artifact_path("score_model", "margin_model_path", "models/production/score_model_margin.pkl")

    score_metrics = ModelMetrics()
    if svc.score_loader.metadata:
        score_metrics.home_mae = svc.score_loader.metadata.get("derived_home_score_mae")
        score_metrics.away_mae = svc.score_loader.metadata.get("derived_away_score_mae")

    score_info = ScoreModelInfo(
        active=svc.score_loader.home_rtg_model is not None,
        home_model_path=str(home_model_path),
        away_model_path=str(away_model_path),
        total_model_path=str(total_model_path),
        margin_model_path=str(margin_model_path),
        version=svc.score_loader.get_version(),
        metrics=score_metrics
    )

    return ModelStatusResponse(
        win_model=win_info,
        score_model=score_info,
        experimental_candidate=_experimental_candidate()
    )
