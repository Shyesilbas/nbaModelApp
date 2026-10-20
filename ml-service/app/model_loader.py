import joblib
import json
import warnings
from pathlib import Path
from typing import Optional
from sklearn.exceptions import InconsistentVersionWarning

warnings.filterwarnings(
    "ignore",
    message=r"Trying to unpickle estimator .* from version 1\.9\.0 .*",
    category=UserWarning,
)

ROOT = Path(__file__).resolve().parents[2]
import sys
sys.path.insert(0, str(ROOT))
from scripts.artifact_paths import resolve_artifact_path


def _all_exist(paths):
    return all(p.exists() for p in paths)


def _score_paths(version: int):
    base = ROOT / "models" / "production"
    return {
        "pace": base / f"score_model_v{version}_pace.pkl",
        "home_rtg": base / f"score_model_v{version}_home_rtg.pkl",
        "away_rtg": base / f"score_model_v{version}_away_rtg.pkl",
        "margin": base / f"score_model_v{version}_margin.pkl",
        "metadata": base / f"score_model_v{version}_metadata.json",
        "ridge_total": base / f"score_model_v{version}_ridge_total.pkl",
        "ridge_margin": base / f"score_model_v{version}_ridge_margin.pkl",
    }


def _player_paths(version: int, kind: str):
    base = ROOT / "models" / "production"
    return {
        "pts": base / f"player_v{version}_{kind}_pts.pkl",
        "reb": base / f"player_v{version}_{kind}_reb.pkl",
        "ast": base / f"player_v{version}_{kind}_ast.pkl",
        "features": base / f"player_v{version}_features.pkl",
        "ridge_pts": base / f"player_v{version}_ridge_pts.pkl",
        "ridge_reb": base / f"player_v{version}_ridge_reb.pkl",
        "ridge_ast": base / f"player_v{version}_ridge_ast.pkl",
    }


def _patch_logistic_regression_compat(model):
    """Backfill attrs expected by older sklearn runtimes when loading newer pickles."""
    candidates = []
    if hasattr(model, "named_steps"):
        candidates.append(model.named_steps.get("clf"))
    if hasattr(model, "calibrated_classifiers_"):
        for calibrated in model.calibrated_classifiers_:
            estimator = getattr(calibrated, "estimator", None)
            if hasattr(estimator, "named_steps"):
                candidates.append(estimator.named_steps.get("clf"))
            else:
                candidates.append(estimator)

    for clf in candidates:
        if clf is not None and clf.__class__.__name__ == "LogisticRegression" and not hasattr(clf, "multi_class"):
            clf.multi_class = "auto"
    return model


class ModelLoader:
    def __init__(self):
        self.model = None
        self.feature_cols = None
        self.metadata = None

    def load(self):
        model_path = resolve_artifact_path("win_model", "model_path", "models/win_probability_model_v9.pkl")
        features_path = resolve_artifact_path("win_model", "feature_columns_path", "models/feature_columns_v9.json")
        metadata_path = resolve_artifact_path("win_model", "metadata_path", "models/model_metadata.json")
        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found at {model_path}")
        if not features_path.exists():
            raise FileNotFoundError(f"Feature columns file not found at {features_path}")
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
            self.model = joblib.load(model_path)
        self.model = _patch_logistic_regression_compat(self.model)
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
            return self.metadata.get("version") or self.metadata.get("training_date") or self.metadata.get("model_name")
        return None


class ScoreModelLoader:
    def __init__(self):
        self.pace_model = None
        self.home_rtg_model = None
        self.away_rtg_model = None
        self.margin_model = None
        self.ridge_total_model = None
        self.ridge_margin_model = None
        self.metadata = None
        self.pace_path = None
        self.home_rtg_path = None
        self.away_rtg_path = None
        self.margin_path = None

    def load(self):
        manifest_paths = {
            "pace": resolve_artifact_path("score_model", "total_model_path", "models/production/score_model_v9_pace.pkl"),
            "home_rtg": resolve_artifact_path("score_model", "home_model_path", "models/production/score_model_v9_home_rtg.pkl"),
            "away_rtg": resolve_artifact_path("score_model", "away_model_path", "models/production/score_model_v9_away_rtg.pkl"),
            "margin": resolve_artifact_path("score_model", "margin_model_path", "models/production/score_model_v9_margin.pkl"),
            "metadata": resolve_artifact_path("score_model", "metadata_path", "models/production/score_model_v9_metadata.json"),
            "ridge_total": resolve_artifact_path("score_model", "ridge_total_path", "models/production/score_model_v9_ridge_total.pkl"),
            "ridge_margin": resolve_artifact_path("score_model", "ridge_margin_path", "models/production/score_model_v9_ridge_margin.pkl"),
        }

        required_keys = ["pace", "home_rtg", "away_rtg", "margin", "metadata"]
        paths = manifest_paths
        if not _all_exist(paths[k] for k in required_keys):
            paths = next(
                (candidate for candidate in (_score_paths(v) for v in [8, 7, 6, 5, 4])
                 if _all_exist(candidate[k] for k in required_keys)),
                paths,
            )

        pace_path = paths["pace"]
        home_rtg_path = paths["home_rtg"]
        away_rtg_path = paths["away_rtg"]
        margin_path = paths["margin"]
        metadata_path = paths["metadata"]
        ridge_total_path = paths["ridge_total"]
        ridge_margin_path = paths["ridge_margin"]

        for p in [pace_path, home_rtg_path, away_rtg_path, margin_path, metadata_path]:
            if not p.exists():
                raise FileNotFoundError(f"Score model file not found at {p}")
                
        self.pace_model = joblib.load(pace_path)
        self.home_rtg_model = joblib.load(home_rtg_path)
        self.away_rtg_model = joblib.load(away_rtg_path)
        self.margin_model = joblib.load(margin_path)
        
        self.pace_path = pace_path
        self.home_rtg_path = home_rtg_path
        self.away_rtg_path = away_rtg_path
        self.margin_path = margin_path
        
        with open(metadata_path, "r") as f:
            self.metadata = json.load(f)

        if ridge_total_path.exists() and ridge_margin_path.exists():
            self.ridge_total_model = joblib.load(ridge_total_path)
            self.ridge_margin_model = joblib.load(ridge_margin_path)
        else:
            self.ridge_total_model = None
            self.ridge_margin_model = None

    def get_version(self) -> Optional[str]:
        if self.metadata:
            return self.metadata.get("version", "score_v4")
        return "score_v4"


class PlayerModelLoader:
    def __init__(self):
        self.pts_model = None
        self.reb_model = None
        self.ast_model = None
        self.feature_cols = None
        self.version = "player_v3_ridge"

    def _load_bundle(self, paths, version: str, message: str):
        self.pts_model = joblib.load(paths["pts"])
        self.reb_model = joblib.load(paths["reb"])
        self.ast_model = joblib.load(paths["ast"])
        self.feature_cols = joblib.load(paths["features"])
        self.version = version
        print(message)

    def load(self):
        pts_path = resolve_artifact_path("player_model", "pts_model_path", "models/production/player_v9_lgb_pts.pkl")
        reb_path = resolve_artifact_path("player_model", "reb_model_path", "models/production/player_v9_lgb_reb.pkl")
        ast_path = resolve_artifact_path("player_model", "ast_model_path", "models/production/player_v9_lgb_ast.pkl")
        features_path = resolve_artifact_path("player_model", "feature_columns_path", "models/production/player_v9_features.pkl")


        v9_exists = all(p.exists() for p in [pts_path, reb_path, ast_path, features_path])
        if not v9_exists:
            pts_path = ROOT / "models/production/player_v9_lgb_pts.pkl"
            reb_path = ROOT / "models/production/player_v9_lgb_reb.pkl"
            ast_path = ROOT / "models/production/player_v9_lgb_ast.pkl"
            features_path = ROOT / "models/production/player_v9_features.pkl"

        v9_actual_exists = all(p.exists() for p in [pts_path, reb_path, ast_path, features_path])
        if v9_actual_exists:
            self._load_bundle(
                {"pts": pts_path, "reb": reb_path, "ast": ast_path, "features": features_path},
                "player_v9_lgb",
                "Loaded V9 LightGBM Player Models successfully."
            )
            return

        # Fallbacks:
        # V8
        for version, kind, label in [
            (8, "lgb", "Loaded V8 LightGBM Player Models successfully."),
            (7, "lgb", "Loaded V7 LightGBM Player Models successfully."),
            (6, "lgb", "Loaded V6 LightGBM Player Models successfully."),
            (5, "lgb", "Loaded V5 LightGBM Player Models as fallback."),
            (4, "lgb", "Loaded V4 LightGBM Player Models as fallback."),
            (3, "ridge", "Loaded V3 Ridge Player Models as fallback."),
        ]:
            paths = _player_paths(version, kind)
            if _all_exist(paths[k] for k in ["pts", "reb", "ast", "features"]):
                self._load_bundle(paths, f"player_v{version}_{kind}", label)
                return

        raise FileNotFoundError("No player models could be loaded.")

    def get_version(self) -> str:
        return self.version
