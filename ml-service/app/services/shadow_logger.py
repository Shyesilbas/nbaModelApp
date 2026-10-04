"""Shadow Prediction Logger for Live Service Inference.

Records every live model prediction with provenance metadata, timestamps,
interval bounds, and key feature snapshots into an append-only JSONL log.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
LOG_DIR = ROOT / "data" / "predictions"
SHADOW_LOG_FILE = LOG_DIR / "shadow_predictions_log.jsonl"


def log_game_prediction(
    game_id: str,
    home_team: str,
    away_team: str,
    prediction_date: str,
    model_version: str,
    win_probability: float,
    predicted_home_score: float,
    predicted_away_score: float,
    predicted_total: float,
    predicted_margin: float,
    home_range: Optional[list[float]] = None,
    away_range: Optional[list[float]] = None,
    total_range: Optional[list[float]] = None,
    margin_range: Optional[list[float]] = None,
    features_snapshot: Optional[Dict[str, Any]] = None,
) -> str:
    """Logs a single full game prediction into shadow log. Returns prediction_id."""
    prediction_id = str(uuid.uuid4())
    record = {
        "prediction_id": prediction_id,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "game_id": str(game_id),
        "prediction_date": str(prediction_date),
        "home_team": str(home_team),
        "away_team": str(away_team),
        "model_version": str(model_version),
        "win_probability": round(float(win_probability), 4),
        "predicted_home_score": round(float(predicted_home_score), 2),
        "predicted_away_score": round(float(predicted_away_score), 2),
        "predicted_total": round(float(predicted_total), 2),
        "predicted_margin": round(float(predicted_margin), 2),
        "home_range": home_range or [],
        "away_range": away_range or [],
        "total_range": total_range or [],
        "margin_range": margin_range or [],
        "features_snapshot": features_snapshot or {},
    }

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(SHADOW_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
    except Exception as exc:
        logger.warning("Failed to write shadow prediction log: %s", exc)

    return prediction_id
