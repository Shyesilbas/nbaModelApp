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
            return self.metadata.get("version") or self.metadata.get("training_date") or self.metadata.get("model_name")
        return None


class ScoreModelLoader:
    def __init__(self):
        self.pace_model = None
        self.home_rtg_model = None
        self.away_rtg_model = None
        self.margin_model = None
        self.metadata = None
        self.pace_path = None
        self.home_rtg_path = None
        self.away_rtg_path = None
        self.margin_path = None

    def load(self):
        pace_path = ROOT / "models/production/score_model_v6_pace.pkl"
        home_rtg_path = ROOT / "models/production/score_model_v6_home_rtg.pkl"
        away_rtg_path = ROOT / "models/production/score_model_v6_away_rtg.pkl"
        margin_path = ROOT / "models/production/score_model_v6_margin.pkl"
        metadata_path = ROOT / "models/production/score_model_v6_metadata.json"
        
        v6_exists = all(p.exists() for p in [pace_path, home_rtg_path, away_rtg_path, margin_path, metadata_path])
        if not v6_exists:
            pace_path = ROOT / "models/production/score_model_v5_pace.pkl"
            home_rtg_path = ROOT / "models/production/score_model_v5_home_rtg.pkl"
            away_rtg_path = ROOT / "models/production/score_model_v5_away_rtg.pkl"
            margin_path = ROOT / "models/production/score_model_v5_margin.pkl"
            metadata_path = ROOT / "models/production/score_model_v5_metadata.json"
            
            v5_exists = all(p.exists() for p in [pace_path, home_rtg_path, away_rtg_path, margin_path, metadata_path])
            if not v5_exists:
                pace_path = ROOT / "models/production/score_model_v4_pace.pkl"
                home_rtg_path = ROOT / "models/production/score_model_v4_home_rtg.pkl"
                away_rtg_path = ROOT / "models/production/score_model_v4_away_rtg.pkl"
                margin_path = ROOT / "models/production/score_model_v4_margin.pkl"
                metadata_path = ROOT / "models/production/score_model_v4_metadata.json"
                
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

    def load(self):
        pts_path_v6 = ROOT / "models/production/player_v6_lgb_pts.pkl"
        reb_path_v6 = ROOT / "models/production/player_v6_lgb_reb.pkl"
        ast_path_v6 = ROOT / "models/production/player_v6_lgb_ast.pkl"
        features_path_v6 = ROOT / "models/production/player_v6_features.pkl"
        
        if pts_path_v6.exists() and reb_path_v6.exists() and ast_path_v6.exists() and features_path_v6.exists():
            self.pts_model = joblib.load(pts_path_v6)
            self.reb_model = joblib.load(reb_path_v6)
            self.ast_model = joblib.load(ast_path_v6)
            self.feature_cols = joblib.load(features_path_v6)
            self.version = "player_v6_lgb"
            print("Loaded V6 LightGBM Player Models successfully.")
        else:
            pts_path_v5 = ROOT / "models/production/player_v5_lgb_pts.pkl"
            reb_path_v5 = ROOT / "models/production/player_v5_lgb_reb.pkl"
            ast_path_v5 = ROOT / "models/production/player_v5_lgb_ast.pkl"
            features_path_v5 = ROOT / "models/production/player_v5_features.pkl"
            
            if pts_path_v5.exists() and reb_path_v5.exists() and ast_path_v5.exists() and features_path_v5.exists():
                self.pts_model = joblib.load(pts_path_v5)
                self.reb_model = joblib.load(reb_path_v5)
                self.ast_model = joblib.load(ast_path_v5)
                self.feature_cols = joblib.load(features_path_v5)
                self.version = "player_v5_lgb"
                print("Loaded V5 LightGBM Player Models as fallback.")
            else:
                pts_path_v4 = ROOT / "models/production/player_v4_lgb_pts.pkl"
            reb_path_v4 = ROOT / "models/production/player_v4_lgb_reb.pkl"
            ast_path_v4 = ROOT / "models/production/player_v4_lgb_ast.pkl"
            features_path_v4 = ROOT / "models/production/player_v4_features.pkl"
            
            if pts_path_v4.exists() and reb_path_v4.exists() and ast_path_v4.exists() and features_path_v4.exists():
                self.pts_model = joblib.load(pts_path_v4)
                self.reb_model = joblib.load(reb_path_v4)
                self.ast_model = joblib.load(ast_path_v4)
                self.feature_cols = joblib.load(features_path_v4)
                self.version = "player_v4_lgb"
                print("Loaded V4 LightGBM Player Models as fallback.")
            else:
                pts_path_v3 = ROOT / "models/production/player_v3_ridge_pts.pkl"
                reb_path_v3 = ROOT / "models/production/player_v3_ridge_reb.pkl"
                ast_path_v3 = ROOT / "models/production/player_v3_ridge_ast.pkl"
                features_path_v3 = ROOT / "models/production/player_v3_features.pkl"
                
                for p in [pts_path_v3, reb_path_v3, ast_path_v3, features_path_v3]:
                    if not p.exists():
                        raise FileNotFoundError(f"Player model file not found at {p}")
                        
                self.pts_model = joblib.load(pts_path_v3)
                self.reb_model = joblib.load(reb_path_v3)
                self.ast_model = joblib.load(ast_path_v3)
                self.feature_cols = joblib.load(features_path_v3)
                self.version = "player_v3_ridge"
                print("Loaded V3 Ridge Player Models as fallback.")

    def get_version(self) -> str:
        return self.version
