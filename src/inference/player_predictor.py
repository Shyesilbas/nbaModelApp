"""
Unified Player Stats Predictor for NBA players.
Uses the active production V9 LightGBM models for PTS, REB, AST.
"""

import json
from pathlib import Path
from typing import Optional
import pandas as pd
import joblib

from src.core.artifact_paths import resolve_artifact_path
from src.features.player_form import add_player_matchup_features


class PlayerPredictor:
    def __init__(self, metadata_path: Optional[Path] = None):
        self.metadata_path = metadata_path or resolve_artifact_path(
            "player_model", "metadata_path", "models/player_metadata.json"
        )
        self.features_path = resolve_artifact_path(
            "player_model", "feature_columns_path", "models/player_features.pkl"
        )
        self.metadata = {}
        self.feature_cols = []
        self.pts_model = None
        self.reb_model = None
        self.ast_model = None
        self._load()

    def _load(self) -> None:
        pts_path = resolve_artifact_path("player_model", "pts_model_path", "models/player_model_pts.pkl")
        reb_path = resolve_artifact_path("player_model", "reb_model_path", "models/player_model_reb.pkl")
        ast_path = resolve_artifact_path("player_model", "ast_model_path", "models/player_model_ast.pkl")

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

    def predict_player(self, features_df: pd.DataFrame) -> pd.DataFrame:
        """
        Takes a DataFrame containing player feature rows and computes PTS, REB, AST predictions.
        """
        if "PLAYER_POSITION_GROUP" in features_df.columns:
            features_df = add_player_matchup_features(features_df)
        # A missing feature is unknown, not zero: NaN lets the model's imputer use its training mean.
        X = features_df.reindex(columns=self.feature_cols)

        pts_pred = self.pts_model.predict(X) if self.pts_model else [0.0] * len(X)
        reb_pred = self.reb_model.predict(X) if self.reb_model else [0.0] * len(X)
        ast_pred = self.ast_model.predict(X) if self.ast_model else [0.0] * len(X)

        df_out = features_df.copy()
        df_out["RAW_PROJ_PTS"] = pts_pred
        df_out["RAW_PROJ_REB"] = reb_pred
        df_out["RAW_PROJ_AST"] = ast_pred

        return df_out
