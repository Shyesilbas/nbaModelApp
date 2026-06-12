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

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season

warnings.filterwarnings("ignore")

class WinModelTrainer:
    def __init__(self, data_path=None, output_dir=None, player_data_path=None, player_models_dir=None):
        root = Path(__file__).resolve().parents[2]
        self.data_path = Path(data_path or get_data_paths(get_default_season()).team_model_ready_v2)
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.player_data_path = Path(player_data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.player_models_dir = Path(player_models_dir or root / "models/production")
        self.target_col = "WIN"

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

    def train_and_export(self):
        if not self.data_path.exists():
            raise FileNotFoundError(f"Dataset path {self.data_path} does not exist.")
            
        df = pd.read_csv(self.data_path)
        
        if self.player_data_path.exists() and self.player_models_dir.exists():
            try:
                player_df = pd.read_csv(self.player_data_path)
                features_path = self.player_models_dir / "player_v4_features.pkl"
                if features_path.exists():
                    player_features = joblib.load(features_path)
                    player_df = player_df.dropna(subset=player_features)
                    
                    targets = ["pts", "reb", "ast"]
                    predictions = {}
                    for t in targets:
                        model_path = self.player_models_dir / f"player_v4_lgb_{t}.pkl"
                        if model_path.exists():
                            model = joblib.load(model_path)
                            pred = model.predict(player_df[player_features])
                            player_df[f"PROJ_{t.upper()}"] = pred
                            predictions[t] = pred
                        else:
                            player_df[f"PROJ_{t.upper()}"] = 0.0
                            predictions[t] = 0.0
                            
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
                    
                    df = df.merge(team_features_df, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
                    df = df.merge(opp_features_df, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
                    
                    new_cols = [
                        "TEAM_V3_PROJ_PTS_SUM", "TEAM_V3_PROJ_REB_SUM", "TEAM_V3_PROJ_AST_SUM", "TEAM_V3_PROJ_PRA_SUM",
                        "OPP_V3_PROJ_PTS_SUM", "OPP_V3_PROJ_REB_SUM", "OPP_V3_PROJ_AST_SUM", "OPP_V3_PROJ_PRA_SUM",
                        "TEAM_V3_PROJ_PTS_AVG", "TEAM_V3_PROJ_REB_AVG", "TEAM_V3_PROJ_AST_AVG", "TEAM_V3_PROJ_PRA_AVG",
                        "OPP_V3_PROJ_PTS_AVG", "OPP_V3_PROJ_REB_AVG", "OPP_V3_PROJ_AST_AVG", "OPP_V3_PROJ_PRA_AVG"
                    ]
                    df = df.dropna(subset=new_cols)
            except Exception:
                pass

        df_features, df_meta = self.separate_metadata(df)
        if self.target_col not in df_features.columns:
            raise ValueError(f"Target {self.target_col} not found in dataset columns")
            
        suspects = self.leakage_check(df_features, thresh=0.95)
        if suspects:
            exact_dups = [c for c, corr in suspects if corr == 1.0]
            if exact_dups:
                df_features = df_features.drop(columns=exact_dups)
                
        y = df_features[self.target_col].astype(int)
        X = df_features.drop(columns=[self.target_col])
        
        if "GAME_DATE" in df_meta.columns:
            df_meta["GAME_DATE"] = pd.to_datetime(df_meta["GAME_DATE"])
            split_date = df_meta["GAME_DATE"].quantile(0.8)
            train_idx = df_meta.index[df_meta["GAME_DATE"] <= split_date].tolist()
            test_idx = df_meta.index[df_meta["GAME_DATE"] > split_date].tolist()
            if len(train_idx) == 0 or len(test_idx) == 0:
                X_train_full, X_test, y_train_full, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
            else:
                X_train_full = X.loc[train_idx]
                X_test = X.loc[test_idx]
                y_train_full = y.loc[train_idx]
                y_test = y.loc[test_idx]
        else:
            X_train_full, X_test, y_train_full, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
            
        X_train, X_cal, y_train, y_cal = train_test_split(X_train_full, y_train_full, test_size=0.2, random_state=42, stratify=y_train_full)
        
        lr_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=42))
        ])
        
        lr_pipeline.fit(X_train, y_train)
        
        try:
            y_proba_uncal = lr_pipeline.predict_proba(X_test)[:, 1]
        except Exception:
            y_proba_uncal = lr_pipeline.decision_function(X_test)
        metrics_uncal = self.eval_metrics(y_test, y_proba_uncal)
        
        calibrator_sig = CalibratedClassifierCV(estimator=lr_pipeline, method="sigmoid", cv='prefit')
        calibrator_sig.fit(X_cal, y_cal)
        y_proba_sig = calibrator_sig.predict_proba(X_test)[:, 1]
        metrics_sig = self.eval_metrics(y_test, y_proba_sig)
        
        try:
            calibrator_iso = CalibratedClassifierCV(estimator=lr_pipeline, method="isotonic", cv='prefit')
            calibrator_iso.fit(X_cal, y_cal)
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
        model_path = self.output_dir / "win_probability_model.pkl"
        joblib.dump(best_model, model_path)
        
        feature_cols = X.columns.tolist()
        feat_path = self.output_dir / "feature_columns.json"
        with open(feat_path, "w") as f:
            json.dump(feature_cols, f, indent=2)
            
        metadata = {
            "model_name": "logistic_regression",
            "training_date": datetime.utcnow().isoformat() + "Z",
            "number_of_rows": int(df.shape[0]),
            "number_of_features": int(X.shape[1]),
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
