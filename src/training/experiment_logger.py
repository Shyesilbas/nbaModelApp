"""
Lightweight Experiment Logger for Model Training Runs.
Tracks model hyperparameters, dataset shapes, evaluation metrics, and validation metadata.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional


class ExperimentLogger:
    def __init__(self, ledger_path: Optional[Path] = None):
        self.project_root = Path(__file__).resolve().parents[2]
        self.ledger_path = ledger_path or (self.project_root / "reports" / "operations" / "experiment_runs.json")
        self.ledger_path.parent.mkdir(parents=True, exist_ok=True)

    def log_run(
        self,
        model_name: str,
        model_version: str,
        hyperparameters: Dict[str, Any],
        metrics: Dict[str, Any],
        dataset_info: Dict[str, Any],
        notes: str = "",
    ) -> Dict[str, Any]:
        run_record = {
            "timestamp": datetime.now().isoformat(),
            "model_name": model_name,
            "model_version": model_version,
            "hyperparameters": hyperparameters,
            "metrics": metrics,
            "dataset_info": dataset_info,
            "notes": notes,
        }

        history = []
        if self.ledger_path.exists():
            try:
                with open(self.ledger_path, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except Exception:
                history = []

        history.append(run_record)
        with open(self.ledger_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)

        return run_record
