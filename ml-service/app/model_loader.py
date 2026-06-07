import joblib
import json
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(ROOT))
from scripts.artifact_paths import resolve_artifact_path


class ModelLoader:
    def __init__(self):
        self.model = None
        self.feature_cols = None
        self.metadata = None

    def load(self):
        model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model.pkl")
        features_path = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns.json")
        metadata_path = resolve_artifact_path("win_model", "metadata_path", "models/model_metadata.json")
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found at {model_path}")
        if not features_path.exists():
            raise FileNotFoundError(f"Feature columns file not found at {features_path}")
        self.model = joblib.load(model_path)
        with open(features_path, "r") as f:
            self.feature_cols = json.load(f)
        if metadata_path.exists():
            with open(metadata_path, "r") as f:
                self.metadata = json.load(f)

    def predict_proba(self, X):
        if self.model is None:
            raise RuntimeError("Model not loaded")
        return self.model.predict_proba(X)

    def get_version(self) -> Optional[str]:
        if self.metadata:
            return self.metadata.get("training_date") or self.metadata.get("model_name")
        return None


class ScoreModelLoader:
    def __init__(self):
        self.home_model = None
        self.away_model = None
        self.total_model = None
        self.diff_model = None
        self.metadata = None

    def load(self):
        home_model_path = resolve_artifact_path("score_model", "home_model_path", "models/home_score_model_v2.pkl")
        away_model_path = resolve_artifact_path("score_model", "away_model_path", "models/away_score_model_v2.pkl")
        total_model_path = resolve_artifact_path("score_model", "total_model_path", "models/direct_total_points_model_v2.pkl")
        diff_model_path = resolve_artifact_path("score_model", "margin_model_path", "models/direct_point_diff_model_v2.pkl")
        metadata_path = resolve_artifact_path("score_model", "metadata_path", "models/score_model_v2_metadata.json")
        for p in [home_model_path, away_model_path, total_model_path, diff_model_path, metadata_path]:
            if not p.exists():
                raise FileNotFoundError(f"Score model file not found at {p}")
        self.home_model = joblib.load(home_model_path)
        self.away_model = joblib.load(away_model_path)
        self.total_model = joblib.load(total_model_path)
        self.diff_model = joblib.load(diff_model_path)
        with open(metadata_path, "r") as f:
            self.metadata = json.load(f)

    def get_version(self) -> Optional[str]:
        if self.metadata:
            return self.metadata.get("model_name") or "score_v2"
        return "score_v2"
