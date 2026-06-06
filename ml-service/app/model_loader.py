import joblib
import json
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "models" / "win_probability_model.pkl"
FEATURES_PATH = ROOT / "models" / "feature_columns.json"
METADATA_PATH = ROOT / "models" / "model_metadata.json"


class ModelLoader:
    def __init__(self):
        self.model = None
        self.feature_cols = None
        self.metadata = None

    def load(self):
        if not MODEL_PATH.exists():
            raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
        if not FEATURES_PATH.exists():
            raise FileNotFoundError(f"Feature columns file not found at {FEATURES_PATH}")
        self.model = joblib.load(MODEL_PATH)
        with open(FEATURES_PATH, "r") as f:
            self.feature_cols = json.load(f)
        if METADATA_PATH.exists():
            with open(METADATA_PATH, "r") as f:
                self.metadata = json.load(f)

    def predict_proba(self, X):
        if self.model is None:
            raise RuntimeError("Model not loaded")
        return self.model.predict_proba(X)

    def get_version(self) -> Optional[str]:
        if self.metadata:
            return self.metadata.get("training_date") or self.metadata.get("model_name")
        return None


SCORE_HOME_MODEL_PATH = ROOT / "models" / "home_score_model_v2.pkl"
SCORE_AWAY_MODEL_PATH = ROOT / "models" / "away_score_model_v2.pkl"
SCORE_TOTAL_MODEL_PATH = ROOT / "models" / "direct_total_points_model_v2.pkl"
SCORE_DIFF_MODEL_PATH = ROOT / "models" / "direct_point_diff_model_v2.pkl"
SCORE_METADATA_PATH = ROOT / "models" / "score_model_v2_metadata.json"


class ScoreModelLoader:
    def __init__(self):
        self.home_model = None
        self.away_model = None
        self.total_model = None
        self.diff_model = None
        self.metadata = None

    def load(self):
        for p in [SCORE_HOME_MODEL_PATH, SCORE_AWAY_MODEL_PATH, SCORE_TOTAL_MODEL_PATH, SCORE_DIFF_MODEL_PATH, SCORE_METADATA_PATH]:
            if not p.exists():
                raise FileNotFoundError(f"Score model file not found at {p}")
        self.home_model = joblib.load(SCORE_HOME_MODEL_PATH)
        self.away_model = joblib.load(SCORE_AWAY_MODEL_PATH)
        self.total_model = joblib.load(SCORE_TOTAL_MODEL_PATH)
        self.diff_model = joblib.load(SCORE_DIFF_MODEL_PATH)
        with open(SCORE_METADATA_PATH, "r") as f:
            self.metadata = json.load(f)

    def get_version(self) -> Optional[str]:
        if self.metadata:
            return self.metadata.get("model_name") or "score_v2"
        return "score_v2"

