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
from src.training.feature_guards import check_feature_matrix
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split, expanding_window_date_splits
from src.training.provenance import build_training_provenance

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

    def _model_pipeline(self, target=None):
        params = {
            "n_estimators": 150,
            "learning_rate": 0.05,
            "max_depth": 5,
            "random_state": 42,
            "n_jobs": -1,
            "verbose": -1,
        }
        # The contract can override LightGBM settings, e.g. objective: l1 to fit the
        # conditional median, which is what an MAE-scored prop line needs.
        params.update(self.feature_contract.dict_value("lgb_params"))
        params.update(self.feature_contract.dict_value("lgb_params_by_target").get(target) or {})
        return Pipeline([
            ('imputer', SimpleImputer(strategy='mean')),
            ('lgb', lgb.LGBMRegressor(**params)),
        ])

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
        exclude_lower = {str(c).lower() for c in self.exclude_cols}
        features = [
            c for c in df.columns 
            if c.lower() not in exclude_lower and c not in self.targets_map.keys()
        ]
        postgame_columns = {
            "PTS", "MIN", "REB", "AST", "PLUS_MINUS", "WL", "WIN",
            "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
            "FTM", "FTA", "FT_PCT", "OREB", "DREB", "STL", "BLK",
            "TOV", "PF", "TARGET_PTS", "TARGET_REB", "TARGET_AST",
            "GAME_PTS", "GAME_REB", "GAME_AST", "GAME_MIN", "GAME_USG_PCT", "GAME_PLUS_MINUS",
        }
        leaked = sorted(set(features) & postgame_columns)
        if leaked:
            raise ValueError(f"Player feature contract includes same-game outcome fields: {leaked}")
        if not features:
            raise ValueError("Player feature contract resolved zero feature columns.")
        X = df[features].copy()
        for col in features:
            X[col] = pd.to_numeric(X[col], errors="coerce")
        return X, features

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
        if "GAME_DATE" not in train_df.columns:
            raise ValueError("Player model training requires GAME_DATE for time-safe validation.")
        train_df["GAME_DATE"] = pd.to_datetime(train_df["GAME_DATE"], errors="coerce")
        train_df = train_df.dropna(subset=["GAME_DATE"]).sort_values(["GAME_DATE"], kind="stable").reset_index(drop=True)
        X, features = self.build_feature_matrix(train_df)
        feature_guard = check_feature_matrix(X, "PLAYER")
        os.makedirs(self.output_dir, exist_ok=True)
        
        feature_path = self.output_dir / f"player_{self.version}_features.pkl"
        joblib.dump(features, feature_path)
        
        metadata_metrics = {}
        
        for target, short_name in self.targets_map.items():
            target_df = train_df[train_df[target].notna()].copy()
            if target_df.empty:
                raise ValueError(f"Player target {target} has no observed values.")
            X_target = X.loc[target_df.index]
            y = pd.to_numeric(target_df[target], errors="coerce")
            
            pipeline = self._model_pipeline(short_name)
            
            if self.holdout_config.get("strategy") == "season_holdout":
                X_train, X_test, y_train, y_test, split_meta = season_holdout_train_test_split(
                    X_target,
                    y,
                    target_df,
                    calibration_season=self.holdout_config["calibration_season"],
                    date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                )
            else:
                X_train, X_test, y_train, y_test, split_meta = chronological_train_test_split(
                    X_target,
                    y,
                    target_df,
                    date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                    test_size=float(self.holdout_config.get("test_size", 0.2)),
                )

            pipeline.fit(X_train, y_train)

            preds = pipeline.predict(X_test)
            mae = mean_absolute_error(y_test, preds)
            rmse = np.sqrt(mean_squared_error(y_test, preds))
            r2 = r2_score(y_test, preds)

            final_X = X_train if self.holdout_config.get("final_refit_scope") == "train_only" else X
            final_y = y_train if self.holdout_config.get("final_refit_scope") == "train_only" else y
            fit_df = target_df.loc[final_X.index].copy()
            pipeline.fit(final_X, final_y)

            model_name = f"player_{self.version}_lgb_{short_name}.pkl"
            model_path = self.output_dir / model_name
            joblib.dump(pipeline, model_path)

            # Build Ridge calibration features
            X_fit = X_target.loc[final_X.index]
            y_fit = y.loc[final_y.index]
            X_ind = pd.DataFrame(index=fit_df.index)
            X_ind["is_playoff"] = (fit_df["IS_PLAYOFF"].astype(int) == 1).astype(float)
            X_ind["is_home"] = (fit_df["IS_HOME"].astype(int) == 1).astype(float)
            X_ind["pos_guard"] = (fit_df["PLAYER_POSITION_GROUP"] == "GUARD").astype(float)
            X_ind["pos_wing"] = (fit_df["PLAYER_POSITION_GROUP"] == "WING").astype(float)
            X_ind["pos_big"] = (fit_df["PLAYER_POSITION_GROUP"] == "BIG").astype(float)
            X_ind["high_usage"] = (fit_df["USG_PCT_LAST_10"] >= 25.0).astype(float)
            X_ind["low_usage"] = (fit_df["USG_PCT_LAST_10"] < 15.0).astype(float)
            X_ind["heavy_minutes"] = (fit_df["MIN_EMA_10"] >= 30.0).astype(float)
            X_ind["light_minutes"] = (fit_df["MIN_EMA_10"] < 15.0).astype(float)

            # Out-Of-Fold residual calculation for Ridge calibration to prevent in-sample overfitting
            temporal_splits = expanding_window_date_splits(fit_df, date_col="GAME_DATE", n_splits=3)
            oof_preds = pd.Series(index=fit_df.index, dtype=float)
            for f_tr, f_val in temporal_splits:
                fold_pipe = self._model_pipeline(short_name)
                fold_pipe.fit(X_fit.iloc[f_tr], y_fit.iloc[f_tr])
                oof_preds.iloc[f_val] = fold_pipe.predict(X_fit.iloc[f_val])

            valid_oof = oof_preds.notna()
            residuals = oof_preds.loc[valid_oof] - y_fit.loc[valid_oof]

            ridge = Ridge(alpha=10.0)
            ridge.fit(X_ind.loc[valid_oof], residuals)

            ridge_name = f"player_{self.version}_ridge_{short_name}.pkl"
            ridge_path = self.output_dir / ridge_name
            joblib.dump(ridge, ridge_path)

            metadata_metrics[short_name] = {
                "mae": float(mae),
                "ridge_training_rows": int(valid_oof.sum()),
                "ridge_oof_strategy": "expanding_window_by_game_date",
                "rmse": float(rmse),
                "r2": float(r2),
                "split": split_meta.__dict__,
                "ridge_coefs": ridge.coef_.tolist(),
                "ridge_intercept": float(ridge.intercept_),
                "ridge_features": X_ind.columns.tolist()
            }
            
        player_artifacts = [
            self.output_dir / f"player_{self.version}_{kind}_{target}.pkl"
            for target in ["pts", "reb", "ast"] for kind in ["lgb", "ridge"]
        ] + [self.output_dir / f"player_{self.version}_features.pkl"]
        metadata = {
            "version": f"{self.version}_temporal_Ridge_candidate",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "provenance": build_training_provenance(
                root=Path(__file__).resolve().parents[2],
                input_files=[self.data_path],
                feature_contract_path=self.feature_contract.path,
                manifest_path=self.manifest_metadata.get("path"),
                trainer_path=Path(__file__),
                artifact_paths=player_artifacts,
            ),
            "input_file": str(self.data_path),
            "number_of_rows": int(len(df)),
            "training_rows": int(len(train_df)),
            "evaluation_training_rows": int(len(final_X)),
            "training_season_ids": self.training_season_ids,
            "season_coverage": sorted(pd.to_numeric(df["SEASON_ID"], errors="coerce").dropna().astype(int).unique().tolist()) if "SEASON_ID" in df.columns else [],
            "feature_guard": feature_guard,
            "final_refit": {
                "enabled": True,
                "rows": int(len(final_X)),
                "scope": self.holdout_config.get("final_refit_scope", "all_eligible_rows"),
                "note": "Final target models and Ridge corrections use only the configured pre-holdout fit scope."
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
