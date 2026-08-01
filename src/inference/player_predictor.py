"""
Unified Player Stats Predictor for NBA players.
Uses active production V9 LightGBM + Ridge residual calibration models for PTS, REB, AST.
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional
import pandas as pd
import joblib

from scripts.artifact_paths import resolve_artifact_path


class PlayerPredictor:
    def __init__(self, metadata_path: Optional[Path] = None):
        self.metadata_path = metadata_path or resolve_artifact_path(
            "player_model", "metadata_path", "models/player_v9_metadata.json"
        )
        self.features_path = resolve_artifact_path(
            "player_model", "feature_columns_path", "models/player_v9_features.pkl"
        )
        self.metadata = {}
        self.feature_cols = []
        self.pts_model = None
        self.reb_model = None
        self.ast_model = None
        self.ridge_pts = None
        self.ridge_reb = None
        self.ridge_ast = None
        self._load()

    def _load(self) -> None:
        pts_path = resolve_artifact_path("player_model", "pts_model_path", "models/player_v9_lgb_pts.pkl")
        reb_path = resolve_artifact_path("player_model", "reb_model_path", "models/player_v9_lgb_reb.pkl")
        ast_path = resolve_artifact_path("player_model", "ast_model_path", "models/player_v9_lgb_ast.pkl")

        ridge_pts_path = resolve_artifact_path("player_model", "ridge_pts_path", "models/player_v9_ridge_pts.pkl")
        ridge_reb_path = resolve_artifact_path("player_model", "ridge_reb_path", "models/player_v9_ridge_reb.pkl")
        ridge_ast_path = resolve_artifact_path("player_model", "ridge_ast_path", "models/player_v9_ridge_ast.pkl")

        if Path(self.metadata_path).exists():
            with open(self.metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

        if Path(self.features_path).exists():
            self.feature_cols = joblib.load(self.features_path)

        if Path(pts_path).exists():
            self.pts_model = joblib.load(pts_path)
        if Path(reb_path).exists():
            self.reb_model = joblib.load(reb_path)
        if Path(ast_path).exists():
            self.ast_model = joblib.load(ast_path)

        if Path(ridge_pts_path).exists():
            self.ridge_pts = joblib.load(ridge_pts_path)
        if Path(ridge_reb_path).exists():
            self.ridge_reb = joblib.load(ridge_reb_path)
        if Path(ridge_ast_path).exists():
            self.ridge_ast = joblib.load(ridge_ast_path)

    def predict_player(self, features_df: pd.DataFrame) -> pd.DataFrame:
        """
        Takes a DataFrame containing player feature rows and computes PTS, REB, AST predictions.
        """
        X = features_df[[c for c in self.feature_cols if c in features_df.columns]].copy()
        for c in self.feature_cols:
            if c not in X.columns:
                X[c] = 0.0

        X = X[self.feature_cols]

        pts_pred = self.pts_model.predict(X) if self.pts_model else [0.0] * len(X)
        reb_pred = self.reb_model.predict(X) if self.reb_model else [0.0] * len(X)
        ast_pred = self.ast_model.predict(X) if self.ast_model else [0.0] * len(X)

        df_out = features_df.copy()
        df_out["RAW_PROJ_PTS"] = pts_pred
        df_out["RAW_PROJ_REB"] = reb_pred
        df_out["RAW_PROJ_AST"] = ast_pred

        return df_out
