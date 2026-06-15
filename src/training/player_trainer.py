import os
import json
import joblib
import warnings
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import lightgbm as lgb
from src.training.feature_contract import load_feature_contract
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split

warnings.filterwarnings("ignore")

class PlayerModelTrainer:
    def __init__(self, data_path=None, output_dir=None, version="v9", manifest_metadata=None, holdout_config=None, feature_contract_path=None):
        root = Path(__file__).resolve().parents[2]
        self.data_path = Path(data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.version = version
        self.manifest_metadata = manifest_metadata or {}
        self.holdout_config = holdout_config or {}
        self.feature_contract = load_feature_contract(feature_contract_path or root / "config/features/player_v9.yaml", root=root)
        self.exclude_cols = self.feature_contract.list_value("exclude_columns")
        self.required_context_cols = self.feature_contract.list_value("required_context_columns")
        self.targets_map = self.feature_contract.dict_value("targets")
        self.training_season_ids = self._eligible_season_ids()

    def _eligible_season_ids(self):
        seasons = list(self.manifest_metadata.get("train_seasons", []))
        calibration_season = self.manifest_metadata.get("calibration_season")
        if calibration_season and calibration_season not in seasons:
            seasons.append(calibration_season)
        ids = []
        for season in seasons:
            try:
                start_year = season.split("-")[0]
                ids.extend([int(prefix + start_year) for prefix in ["2", "4", "5"]])
            except Exception:
                continue
        return sorted(set(ids))

    def load_dataset(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Dataset path {self.data_path} does not exist.")
        return pd.read_csv(self.data_path)

    def validate_dataset_contract(self, df):
        required = self.required_context_cols + list(self.targets_map.keys())
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"Player dataset missing required contract columns: {missing}")
        if df.empty:
            raise ValueError("Player dataset is empty after load.")

    def build_feature_matrix(self, df):
        features = [c for c in df.columns if c not in self.exclude_cols and c not in self.targets_map.keys()]
        if not features:
            raise ValueError("Player feature contract resolved zero feature columns.")
        return df[features], features

    def filter_training_rows(self, df):
        if not self.training_season_ids:
            return df.copy()
        season_values = pd.to_numeric(df["SEASON_ID"], errors="coerce")
        train_df = df[season_values.isin(self.training_season_ids)].copy()
        if train_df.empty:
            raise ValueError(f"Player dataset has no rows for training SEASON_ID values: {self.training_season_ids}")
        return train_df

    def train_and_export(self):
        df = self.load_dataset()
        self.validate_dataset_contract(df)
        train_df = self.filter_training_rows(df)
        X, features = self.build_feature_matrix(train_df)
        os.makedirs(self.output_dir, exist_ok=True)
        
        feature_path = self.output_dir / f"player_{self.version}_features.pkl"
        joblib.dump(features, feature_path)
        
        metadata_metrics = {}
        
        for target, short_name in self.targets_map.items():
            y = train_df[target].fillna(0)
            
            pipeline = Pipeline([
                ('imputer', SimpleImputer(strategy='mean')),
                ('lgb', lgb.LGBMRegressor(
                    n_estimators=150, 
                    learning_rate=0.05, 
                    max_depth=5, 
                    random_state=42, 
                    n_jobs=-1, 
                    verbose=-1
                ))
            ])
            
            if self.holdout_config.get("strategy") == "season_holdout":
                X_train, X_test, y_train, y_test, split_meta = season_holdout_train_test_split(
                    X,
                    y,
                    train_df,
                    calibration_season=self.holdout_config["calibration_season"],
                    date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                )
            else:
                X_train, X_test, y_train, y_test, split_meta = chronological_train_test_split(
                    X,
                    y,
                    train_df,
                    date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                    test_size=float(self.holdout_config.get("test_size", 0.2)),
                )

            pipeline.fit(X_train, y_train)

            preds = pipeline.predict(X_test)
            mae = mean_absolute_error(y_test, preds)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            r2 = r2_score(y_test, preds)

            # Export a final model trained on all available historical rows after holdout evaluation.
            pipeline.fit(X, y)

            model_name = f"player_{self.version}_lgb_{short_name}.pkl"
            model_path = self.output_dir / model_name
            joblib.dump(pipeline, model_path)

            # Build Ridge calibration features
            X_ind = pd.DataFrame(index=train_df.index)
            X_ind["is_playoff"] = (train_df["IS_PLAYOFF"].astype(int) == 1).astype(float)
            X_ind["is_home"] = (train_df["IS_HOME"].astype(int) == 1).astype(float)
            X_ind["pos_guard"] = (train_df["PLAYER_POSITION_GROUP"] == "GUARD").astype(float)
            X_ind["pos_wing"] = (train_df["PLAYER_POSITION_GROUP"] == "WING").astype(float)
            X_ind["pos_big"] = (train_df["PLAYER_POSITION_GROUP"] == "BIG").astype(float)
            X_ind["high_usage"] = (train_df["USG_PCT_LAST_10"] >= 25.0).astype(float)
            X_ind["low_usage"] = (train_df["USG_PCT_LAST_10"] < 15.0).astype(float)
            X_ind["heavy_minutes"] = (train_df["MIN_EMA_10"] >= 30.0).astype(float)
            X_ind["light_minutes"] = (train_df["MIN_EMA_10"] < 15.0).astype(float)

            # Predict on full dataset to calculate residuals
            full_preds = pipeline.predict(X)
            residuals = full_preds - y

            ridge = Ridge(alpha=10.0)
            ridge.fit(X_ind, residuals)

            ridge_name = f"player_{self.version}_ridge_{short_name}.pkl"
            ridge_path = self.output_dir / ridge_name
            joblib.dump(ridge, ridge_path)

            metadata_metrics[short_name] = {
                "mae": float(mae),
                "rmse": float(rmse),
                "r2": float(r2),
                "split": split_meta.__dict__,
                "ridge_coefs": ridge.coef_.tolist(),
                "ridge_intercept": float(ridge.intercept_),
                "ridge_features": X_ind.columns.tolist()
            }
            
        metadata = {
            "version": f"{self.version}_LightGBM_Ridge",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "input_file": str(self.data_path),
            "number_of_rows": int(len(df)),
            "training_rows": int(len(train_df)),
            "training_season_ids": self.training_season_ids,
            "season_coverage": sorted(pd.to_numeric(df["SEASON_ID"], errors="coerce").dropna().astype(int).unique().tolist()) if "SEASON_ID" in df.columns else [],
            "final_refit": {
                "enabled": True,
                "rows": int(len(train_df)),
                "note": "Holdout metrics are computed before each final target model is refit on all eligible rows."
            },
            "features_count": len(features),
            "targets": list(self.targets_map.keys()),
            "evaluation": "chronological_holdout",
            "evaluation_metrics": metadata_metrics
        }
        
        metadata_path = self.output_dir / f"player_{self.version}_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
            
        return metadata
