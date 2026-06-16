import os
import json
import joblib
import warnings
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             roc_auc_score, brier_score_loss)
from src.training.feature_contract import load_feature_contract, resolve_feature_list
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season
from src.features.win_strength_features import add_win_strength_features

warnings.filterwarnings("ignore")

STATIC_VENUE_SPLIT_FEATURES = {
    "HOME_WINRATE_LAST_5",
    "HOME_PTS_LAST_5",
    "HOME_PTS_ALLOWED_LAST_5",
    "AWAY_WINRATE_LAST_5",
    "AWAY_PTS_LAST_5",
    "AWAY_PTS_ALLOWED_LAST_5",
    "OPP_HOME_WINRATE_LAST_5",
    "OPP_HOME_PTS_LAST_5",
    "OPP_HOME_PTS_ALLOWED_LAST_5",
    "OPP_AWAY_WINRATE_LAST_5",
    "OPP_AWAY_PTS_LAST_5",
    "OPP_AWAY_PTS_ALLOWED_LAST_5",
}

WIN_STRENGTH_FEATURES = [
    "PRE_GAME_ELO",
    "OPP_PRE_GAME_ELO",
    "ELO_DIFF",
    "ABS_ELO_DIFF",
    "WINRATE_DIFF_LAST_10",
    "ABS_WINRATE_DIFF_LAST_10",
    "REST_DIFF",
    "IS_CLOSE_STRENGTH",
    "PLAYOFF_ELO_DIFF",
    "PLAYOFF_ABS_ELO_DIFF",
    "PLAYOFF_REST_DIFF",
    "CLOSE_STRENGTH_REST_DIFF",
]

DEFAULTABLE_REQUIRED_FEATURES = {
    "IS_ELIMINATION_GAME": 0,
    "CAN_CLINCH_SERIES": 0,
    "H2H_GAMES_LAST_5": 0,
    "OPP_H2H_GAMES_LAST_5": 0,
    "IS_CLOSE_STRENGTH": 0,
    "TEAM_V3_PROJ_PTS_SUM": 0.0,
    "TEAM_V3_PROJ_PTS_AVG": 0.0,
    "TEAM_V3_PROJ_REB_SUM": 0.0,
    "TEAM_V3_PROJ_REB_AVG": 0.0,
    "TEAM_V3_PROJ_AST_SUM": 0.0,
    "TEAM_V3_PROJ_AST_AVG": 0.0,
    "TEAM_V3_PROJ_PRA_SUM": 0.0,
    "TEAM_V3_PROJ_PRA_AVG": 0.0,
    "OPP_V3_PROJ_PTS_SUM": 0.0,
    "OPP_V3_PROJ_PTS_AVG": 0.0,
    "OPP_V3_PROJ_REB_SUM": 0.0,
    "OPP_V3_PROJ_REB_AVG": 0.0,
    "OPP_V3_PROJ_AST_SUM": 0.0,
    "OPP_V3_PROJ_AST_AVG": 0.0,
    "OPP_V3_PROJ_PRA_SUM": 0.0,
    "OPP_V3_PROJ_PRA_AVG": 0.0,
}

class WinModelTrainer:
    def __init__(
        self,
        data_path=None,
        output_dir=None,
        player_data_path=None,
        player_models_dir=None,
        data_files=None,
        manifest_metadata=None,
        holdout_config=None,
        feature_contract_path=None,
    ):
        root = Path(__file__).resolve().parents[2]
        self.data_pattern = data_path or str(root / "data/processed/team_model_ready_v3_*.csv")
        self.data_files = [Path(p) for p in data_files] if data_files else None
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.player_data_path = Path(player_data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.player_models_dir = Path(player_models_dir or root / "models/experimental")
        self.manifest_metadata = manifest_metadata or {}
        self.holdout_config = holdout_config or {}
        self.feature_contract = load_feature_contract(feature_contract_path or root / "config/features/win_v9.yaml", root=root)
        self.target_col = self.feature_contract.raw.get("target", "WIN")
        self.strength_features = self.feature_contract.list_value("derived_features")
        self.static_venue_split_features = set(self.feature_contract.list_value("static_venue_split_features"))
        self.defaultable_required_features = self.feature_contract.dict_value("defaultable_features")

    def separate_metadata(self, df):
        meta_candidates = [
            "GAME_ID", "GAME_DATE", "MATCHUP", "TEAM_NAME", "TEAM_ABBREVIATION",
            "OPPONENT_ABBREVIATION", "TEAM_ID"
        ]
        meta = [c for c in df.columns if c in meta_candidates]
        object_cols = df.select_dtypes(include=[object]).columns.tolist()
        for c in object_cols:
            if c not in meta:
                meta.append(c)
        meta = list(dict.fromkeys(meta))
        features = [c for c in df.columns if c not in meta]
        return df[features].copy(), df[meta].copy()

    def leakage_check(self, df, thresh=0.95):
        suspects = []
        numeric = df.select_dtypes(include=[np.number]).copy()
        if self.target_col not in numeric.columns:
            raise ValueError(f"Target column {self.target_col} not found in numeric columns")
        corrs = numeric.corr()[self.target_col].abs().sort_values(ascending=False)
        for col, val in corrs.items():
            if col == self.target_col:
                continue
            if val >= thresh:
                suspects.append((col, float(val)))
        for col in numeric.columns:
            if col == self.target_col:
                continue
            if numeric[col].equals(numeric[self.target_col]):
                suspects.append((col, 1.0))
        return suspects

    def eval_metrics(self, y_true, y_proba, threshold=0.5):
        y_pred = (y_proba >= threshold).astype(int)
        acc = accuracy_score(y_true, y_pred)
        prec = precision_score(y_true, y_pred, zero_division=0)
        rec = recall_score(y_true, y_pred, zero_division=0)
        f1 = f1_score(y_true, y_pred, zero_division=0)
        roc = roc_auc_score(y_true, y_proba)
        brier = brier_score_loss(y_true, y_proba)
        return dict(accuracy=acc, precision=prec, recall=rec, f1=f1, roc_auc=roc, brier_score=brier)

    def resolve_dataset_files(self):
        import glob
        if self.data_files is not None:
            files = self.data_files
        elif isinstance(self.data_pattern, Path):
            files = [self.data_pattern]
        elif os.path.exists(self.data_pattern) and os.path.isfile(self.data_pattern):
            files = [Path(self.data_pattern)]
        else:
            files = [Path(p) for p in glob.glob(str(self.data_pattern))]
            
        if not files:
            raise FileNotFoundError(f"No V2 datasets found matching {self.data_pattern}")
        return files

    def load_training_dataset(self, files):
        df_list = []
        row_counts_by_file = {}
        for f in files:
            if os.path.exists(f):
                f_df = pd.read_csv(f)
                row_counts_by_file[str(f)] = int(len(f_df))
                df_list.append(f_df)
        if not df_list:
            raise FileNotFoundError(f"No V2 datasets could be read from pattern {self.data_pattern}")
        return pd.concat(df_list, ignore_index=True), row_counts_by_file

    def validate_dataset_contract(self, df):
        required = [self.target_col, "GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME", "IS_PLAYOFF", "WINRATE_LAST_10", "OPP_WINRATE_LAST_10", "DAYS_REST", "OPP_DAYS_REST"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            raise ValueError(f"Win dataset missing required contract columns: {missing}")
        if df.empty:
            raise ValueError("Win dataset is empty after load.")

    def apply_player_projection_enrichment(self, df):
        projection_enrichment = {"attempted": False, "applied": False, "reason": None}
        
        if self.player_data_path.exists() and self.player_models_dir.exists():
            try:
                projection_enrichment["attempted"] = True
                player_df = pd.read_csv(self.player_data_path)

                root_models_prod = Path(__file__).resolve().parents[2] / "models/production"
                candidates = [
                    (self.player_models_dir / "player_v9_features.pkl", self.player_models_dir, "player_v9_lgb_"),
                    (root_models_prod / "player_v9_features.pkl", root_models_prod, "player_v9_lgb_"),
                    (self.player_models_dir / "player_v8_features.pkl", self.player_models_dir, "player_v8_lgb_"),
                    (root_models_prod / "player_v8_features.pkl", root_models_prod, "player_v8_lgb_"),
                    (self.player_models_dir / "player_v7_features.pkl", self.player_models_dir, "player_v7_lgb_"),
                    (root_models_prod / "player_v7_features.pkl", root_models_prod, "player_v7_lgb_"),
                    (self.player_models_dir / "player_v6_features.pkl", self.player_models_dir, "player_v6_lgb_"),
                    (root_models_prod / "player_v6_features.pkl", root_models_prod, "player_v6_lgb_"),
                    (self.player_models_dir / "player_v5_features.pkl", self.player_models_dir, "player_v5_lgb_"),
                    (root_models_prod / "player_v5_features.pkl", root_models_prod, "player_v5_lgb_"),
                    (self.player_models_dir / "player_v4_features.pkl", self.player_models_dir, "player_v4_lgb_"),
                    (root_models_prod / "player_v4_features.pkl", root_models_prod, "player_v4_lgb_"),
                ]
                features_path, models_dir, model_prefix = next(
                    ((p, d, prefix) for p, d, prefix in candidates if p.exists()),
                    (None, None, None),
                )
                if features_path is None or models_dir is None or model_prefix is None:
                    raise FileNotFoundError("No compatible player model feature file found for win-model projection features.")

                if features_path.exists():
                    player_features = joblib.load(features_path)
                    player_df = player_df.dropna(subset=player_features)
                    
                    targets = ["pts", "reb", "ast"]
                    predictions = {}
                    for t in targets:
                        model_path = models_dir / f"{model_prefix}{t}.pkl"
                        if model_path.exists():
                            model = joblib.load(model_path)
                            pred = model.predict(player_df[player_features])
                            player_df[f"PROJ_{t.upper()}"] = pred
                            predictions[t] = pred
                        else:
                            raise FileNotFoundError(f"Required player projection model missing: {model_path}")
                            
                    player_df["PROJ_PRA"] = predictions["pts"] + predictions["reb"] + predictions["ast"]
                    
                    targets_with_pra = ["pts", "reb", "ast", "pra"]
                    proj_cols = [f"PROJ_{t.upper()}" for t in targets_with_pra]
                    team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(['sum', 'mean']).reset_index()
                    team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]
                    
                    team_features_df = team_agg.rename(columns={
                        "PROJ_PTS_sum": "TEAM_V3_PROJ_PTS_SUM",
                        "PROJ_REB_sum": "TEAM_V3_PROJ_REB_SUM",
                        "PROJ_AST_sum": "TEAM_V3_PROJ_AST_SUM",
                        "PROJ_PRA_sum": "TEAM_V3_PROJ_PRA_SUM",
                        "PROJ_PTS_mean": "TEAM_V3_PROJ_PTS_AVG",
                        "PROJ_REB_mean": "TEAM_V3_PROJ_REB_AVG",
                        "PROJ_AST_mean": "TEAM_V3_PROJ_AST_AVG",
                        "PROJ_PRA_mean": "TEAM_V3_PROJ_PRA_AVG",
                    })
                    
                    opp_features_df = team_agg.rename(columns={
                        "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
                        "PROJ_PTS_sum": "OPP_V3_PROJ_PTS_SUM",
                        "PROJ_REB_sum": "OPP_V3_PROJ_REB_SUM",
                        "PROJ_AST_sum": "OPP_V3_PROJ_AST_SUM",
                        "PROJ_PRA_sum": "OPP_V3_PROJ_PRA_SUM",
                        "PROJ_PTS_mean": "OPP_V3_PROJ_PTS_AVG",
                        "PROJ_REB_mean": "OPP_V3_PROJ_REB_AVG",
                        "PROJ_AST_mean": "OPP_V3_PROJ_AST_AVG",
                        "PROJ_PRA_mean": "OPP_V3_PROJ_PRA_AVG",
                    })
                    
                    enriched_df = df.merge(team_features_df, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
                    enriched_df = enriched_df.merge(opp_features_df, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
                    if enriched_df.empty:
                        projection_enrichment["reason"] = "No overlapping GAME_ID rows between team training datasets and player projection dataset."
                        raise StopIteration
                    df = enriched_df
                    
                    new_cols = [
                        "TEAM_V3_PROJ_PTS_SUM", "TEAM_V3_PROJ_REB_SUM", "TEAM_V3_PROJ_AST_SUM", "TEAM_V3_PROJ_PRA_SUM",
                        "OPP_V3_PROJ_PTS_SUM", "OPP_V3_PROJ_REB_SUM", "OPP_V3_PROJ_AST_SUM", "OPP_V3_PROJ_PRA_SUM",
                        "TEAM_V3_PROJ_PTS_AVG", "TEAM_V3_PROJ_REB_AVG", "TEAM_V3_PROJ_AST_AVG", "TEAM_V3_PROJ_PRA_AVG",
                        "OPP_V3_PROJ_PTS_AVG", "OPP_V3_PROJ_REB_AVG", "OPP_V3_PROJ_AST_AVG", "OPP_V3_PROJ_PRA_AVG"
                    ]
                    df = df.dropna(subset=new_cols)
                    if df.empty:
                        projection_enrichment["reason"] = "Player projection enrichment produced no complete rows after required projection columns."
                        raise StopIteration
                    projection_enrichment["applied"] = True
            except Exception as exc:
                if isinstance(exc, StopIteration):
                    pass
                else:
                    raise RuntimeError("Failed to build player projection features for win model training") from exc
        return df, projection_enrichment

    def train_and_export(self):
        files = self.resolve_dataset_files()
        df, row_counts_by_file = self.load_training_dataset(files)
        self.validate_dataset_contract(df)
        df, projection_enrichment = self.apply_player_projection_enrichment(df)

        df_features, df_meta = self.separate_metadata(df)
        df_features = df_features.reset_index(drop=True)
        df_meta = df_meta.reset_index(drop=True)
        if self.target_col not in df_features.columns:
            raise ValueError(f"Target {self.target_col} not found in dataset columns")

        feature_cols_before_strength = df_features.columns.tolist()
        meta_cols_before_strength = df_meta.columns.tolist()
        strength_input = pd.concat([df_features, df_meta], axis=1)
        strength_input = add_win_strength_features(strength_input)
        df_features = strength_input[feature_cols_before_strength + self.strength_features].copy()
        df_meta = strength_input[meta_cols_before_strength].copy()

        if "IS_HOME" in df_features.columns:
            venue_aliases = {
                "CURRENT_VENUE_WINRATE_LAST_5": ("HOME_WINRATE_LAST_5", "AWAY_WINRATE_LAST_5"),
                "CURRENT_VENUE_PTS_LAST_5": ("HOME_PTS_LAST_5", "AWAY_PTS_LAST_5"),
                "CURRENT_VENUE_PTS_ALLOWED_LAST_5": ("HOME_PTS_ALLOWED_LAST_5", "AWAY_PTS_ALLOWED_LAST_5"),
                "OPP_CURRENT_VENUE_WINRATE_LAST_5": ("OPP_AWAY_WINRATE_LAST_5", "OPP_HOME_WINRATE_LAST_5"),
                "OPP_CURRENT_VENUE_PTS_LAST_5": ("OPP_AWAY_PTS_LAST_5", "OPP_HOME_PTS_LAST_5"),
                "OPP_CURRENT_VENUE_PTS_ALLOWED_LAST_5": ("OPP_AWAY_PTS_ALLOWED_LAST_5", "OPP_HOME_PTS_ALLOWED_LAST_5"),
            }
            is_home = df_features["IS_HOME"].astype(bool)
            for alias, (when_home_col, when_away_col) in venue_aliases.items():
                if alias not in df_features.columns and when_home_col in df_features.columns and when_away_col in df_features.columns:
                    df_features[alias] = np.where(is_home, df_features[when_home_col], df_features[when_away_col])

        drop_static = [c for c in self.static_venue_split_features if c in df_features.columns]
        if drop_static:
            df_features = df_features.drop(columns=drop_static)
            
        suspects = self.leakage_check(df_features, thresh=0.95)
        if suspects:
            exact_dups = [c for c, corr in suspects if corr == 1.0]
            if exact_dups:
                df_features = df_features.drop(columns=exact_dups)
                
        y = df_features[self.target_col].astype(int)
        X = df_features.drop(columns=[self.target_col])

        imputed_missing_required_features = []
        required_feature_cols = resolve_feature_list(self.feature_contract)
        missing_allowed = [c for c in required_feature_cols if c not in X.columns]
        non_defaultable_missing = [c for c in missing_allowed if c not in self.defaultable_required_features]
        if non_defaultable_missing:
            raise ValueError(f"Missing required v9 feature columns: {non_defaultable_missing}")
        for col in missing_allowed:
            X[col] = self.defaultable_required_features[col]
        imputed_missing_required_features = missing_allowed
        X = X[required_feature_cols]
        
        if self.holdout_config.get("strategy") in {"season_holdout", "external_season_holdout"}:
            X_train_full, X_test, y_train_full, y_test, split_meta = season_holdout_train_test_split(
                X,
                y,
                df_meta,
                calibration_season=self.holdout_config["calibration_season"],
                date_col=self.holdout_config.get("date_col", "GAME_DATE"),
            )
        else:
            X_train_full, X_test, y_train_full, y_test, split_meta = chronological_train_test_split(
                X,
                y,
                df_meta,
                date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                test_size=float(self.holdout_config.get("test_size", 0.2)),
                stratify_random=True,
            )
        
        lr_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=42))
        ])
        
        lr_pipeline.fit(X_train_full, y_train_full)
        
        try:
            y_proba_uncal = lr_pipeline.predict_proba(X_test)[:, 1]
        except Exception:
            y_proba_uncal = lr_pipeline.decision_function(X_test)
        metrics_uncal = self.eval_metrics(y_test, y_proba_uncal)
        
        calibrator_sig = CalibratedClassifierCV(estimator=lr_pipeline, method="sigmoid", cv=3)
        calibrator_sig.fit(X_train_full, y_train_full)
        y_proba_sig = calibrator_sig.predict_proba(X_test)[:, 1]
        metrics_sig = self.eval_metrics(y_test, y_proba_sig)
        
        try:
            calibrator_iso = CalibratedClassifierCV(estimator=lr_pipeline, method="isotonic", cv=3)
            calibrator_iso.fit(X_train_full, y_train_full)
            y_proba_iso = calibrator_iso.predict_proba(X_test)[:, 1]
            metrics_iso = self.eval_metrics(y_test, y_proba_iso)
        except Exception:
            metrics_iso = None
            calibrator_iso = None
            
        candidates = [
            ("uncalibrated", lr_pipeline, metrics_uncal),
            ("sigmoid", calibrator_sig, metrics_sig)
        ]
        if metrics_iso is not None and calibrator_iso is not None:
            candidates.append(("isotonic", calibrator_iso, metrics_iso))
            
        candidates_sorted = sorted(candidates, key=lambda item: (item[2]["brier_score"], -item[2]["roc_auc"]))
        best_name, best_model, best_metrics = candidates_sorted[0]
        
        os.makedirs(self.output_dir, exist_ok=True)
        final_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=42))
        ])
        final_X = X_train_full if self.holdout_config.get("final_refit_scope") == "train_only" else X
        final_y = y_train_full if self.holdout_config.get("final_refit_scope") == "train_only" else y
        if best_name == "uncalibrated":
            final_model = final_pipeline.fit(final_X, final_y)
        else:
            final_model = CalibratedClassifierCV(estimator=final_pipeline, method=best_name, cv=3)
            final_model.fit(final_X, final_y)

        model_path = self.output_dir / "win_probability_model_v9.pkl"
        joblib.dump(final_model, model_path)
        
        feature_cols = X.columns.tolist()
        feat_path = self.output_dir / "feature_columns_v9.json"
        with open(feat_path, "w") as f:
            json.dump(feature_cols, f, indent=2)
            
        metadata = {
            "model_name": "logistic_regression",
            "version": "9.0",
            "training_date": datetime.utcnow().isoformat() + "Z",
            "number_of_rows": int(df.shape[0]),
            "number_of_features": int(X.shape[1]),
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "input_files": [str(p) for p in files],
            "row_counts_by_file": row_counts_by_file,
            "player_projection_enrichment": projection_enrichment,
            "imputed_missing_required_features": imputed_missing_required_features,
            "final_refit": {
                "enabled": True,
                "rows": int(len(final_X)),
                "scope": self.holdout_config.get("final_refit_scope", "all_eligible_rows"),
                "note": "Holdout metrics are computed before the final model is fit according to the configured refit scope."
            },
            "evaluation": "chronological_holdout",
            "split": split_meta.__dict__,
            "dropped_static_venue_split_features": sorted(drop_static),
            "strength_features": self.strength_features,
            "metrics": {
                "uncalibrated": metrics_uncal,
                "sigmoid": metrics_sig,
                "isotonic": metrics_iso
            },
            "selected_calibration": best_name,
            "target_column": self.target_col
        }
        
        meta_path = self.output_dir / "model_metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)
            
        return metadata
