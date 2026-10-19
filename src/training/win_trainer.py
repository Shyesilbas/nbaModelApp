import os
import json
import joblib
import warnings
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             roc_auc_score, brier_score_loss, log_loss)
from src.training.feature_contract import load_feature_contract, resolve_feature_list
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split, expanding_window_date_splits
from src.training.provenance import build_training_provenance

from scripts.data_paths import get_data_paths
from scripts.season_utils import get_default_season
from src.features.win_strength_features import add_win_strength_features
from src.training.feature_guards import check_feature_matrix, permutation_contribution

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
    "NET_RTG_DIFF_LAST_10",
    "EFG_DIFF_LAST_10",
    "THREE_POINT_RATE_DIFF",
    "TOV_FORCED_DIFF",
    "REBOUND_CONTROL_DIFF",
    "PACE_COLLISION",
]

DEFAULTABLE_REQUIRED_FEATURES = {
    "IS_ELIMINATION_GAME": 0,
    "CAN_CLINCH_SERIES": 0,
    "H2H_GAMES_LAST_5": 0,
    "OPP_H2H_GAMES_LAST_5": 0,
    "NET_RTG_DIFF_LAST_10": 0.0,
    "EFG_DIFF_LAST_10": 0.0,
    "THREE_POINT_RATE_DIFF": 0.0,
    "TOV_FORCED_DIFF": 0.0,
    "REBOUND_CONTROL_DIFF": 0.0,
    "PACE_COLLISION": 100.0,
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
        version="v10",
        player_data_path=None,
        player_models_dir=None,
        score_models_dir=None,
        data_files=None,
        manifest_metadata=None,
        holdout_config=None,
        feature_contract_path=None,
    ):
        self.version = version
        root = Path(__file__).resolve().parents[2]
        self.data_pattern = data_path or str(root / "data/processed/team_model_ready_v3_*.csv")
        self.data_files = [Path(p) for p in data_files] if data_files else None
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.player_data_path = Path(player_data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.player_models_dir = Path(player_models_dir or root / "models/experimental")
        self.score_models_dir = Path(score_models_dir or self.output_dir)
        self.manifest_metadata = manifest_metadata or {}
        self.holdout_config = holdout_config or {}
        self.feature_contract = load_feature_contract(feature_contract_path or root / "config/features/win_v10.yaml", root=root)
        self.target_col = self.feature_contract.raw.get("target", "WIN")
        excluded = set(self.feature_contract.list_value("excluded_features"))
        # An excluded derived feature (SCORE_PRED_MARGIN) is never built, so it cannot be selected.
        self.strength_features = [c for c in self.feature_contract.list_value("derived_features") if c not in excluded]
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

    def apply_score_prediction_enrichment(self, df):
        if "SCORE_PRED_MARGIN" in set(self.feature_contract.list_value("excluded_features")):
            # The WIN model no longer reads the SCORE model, so it needs no SCORE OOF artifact.
            return df.drop(columns=["SCORE_PRED_MARGIN"], errors="ignore")
        if "SCORE_PRED_MARGIN" in df.columns:
            # Never trust a precomputed margin column whose generation cutoff
            # and model snapshot are not recorded alongside the rows.
            df = df.drop(columns=["SCORE_PRED_MARGIN"])

        root_prod = Path(__file__).resolve().parents[2] / "models/production"
        candidates = [
            (self.score_models_dir / "score_model_v10_margin.pkl", self.score_models_dir / "score_model_v10_metadata.json", self.score_models_dir / "score_model_v10_ridge_margin.pkl"),
            (self.output_dir / "score_model_v10_margin.pkl", self.output_dir / "score_model_v10_metadata.json", self.output_dir / "score_model_v10_ridge_margin.pkl"),
            (root_prod / "score_model_v10_margin.pkl", root_prod / "score_model_v10_metadata.json", root_prod / "score_model_v10_ridge_margin.pkl"),
            (self.score_models_dir / "score_model_v9_margin.pkl", self.score_models_dir / "score_model_v9_metadata.json", self.score_models_dir / "score_model_v9_ridge_margin.pkl"),
            (self.output_dir / "score_model_v9_margin.pkl", self.output_dir / "score_model_v9_metadata.json", self.output_dir / "score_model_v9_ridge_margin.pkl"),
            (root_prod / "score_model_v9_margin.pkl", root_prod / "score_model_v9_metadata.json", root_prod / "score_model_v9_ridge_margin.pkl"),
        ]
        margin_model_path, meta_path, ridge_path = next(
            ((m, meta, r) for m, meta, r in candidates if m.exists() and meta.exists()),
            (None, None, None)
        )
        if margin_model_path is None:
            df["SCORE_PRED_MARGIN"] = 0.0
            return df

        oof_candidates = [
            self.score_models_dir / f"score_model_{self.version}_oof_margins.parquet",
            self.output_dir / f"score_model_{self.version}_oof_margins.parquet",
            self.score_models_dir / "score_model_v10_oof_margins.parquet",
            self.output_dir / "score_model_v10_oof_margins.parquet",
            root_prod / "score_model_v10_oof_margins.parquet",
        ]
        oof_path = next((p for p in oof_candidates if p.exists()), None)
        if oof_path is None:
            raise RuntimeError("WIN training requires the time-safe SCORE OOF margin artifact; train SCORE first.")
        try:
            df_oof = pd.read_parquet(oof_path)
            oof_map = dict(zip(
                df_oof["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10)),
                pd.to_numeric(df_oof["SCORE_PRED_MARGIN_OOF"], errors="coerce"),
            ))
        except Exception as exc:
            raise RuntimeError(f"Could not read SCORE OOF margins from {oof_path}") from exc

        try:
            df_game_ids = df["GAME_ID"].astype(str).values
            df_is_home = df["IS_HOME"].astype(bool).values
            margins = np.full(len(df), np.nan, dtype=float)
            for i, (gid, is_h) in enumerate(zip(df_game_ids, df_is_home)):
                clean_gid = gid.split(".")[0].zfill(10)
                margin = oof_map.get(clean_gid, np.nan)
                if pd.notna(margin):
                    margins[i] = float(margin) if is_h else -float(margin)

            # A final SCORE model may supply predictions only for a genuinely
            # later holdout season. Never use it to fill missing historical OOF rows.
            score_meta = json.loads(meta_path.read_text())
            cutoff = pd.Timestamp(score_meta["training_date_max"])
            row_dates = pd.to_datetime(df["GAME_DATE"], errors="coerce")
            future_mask = row_dates > cutoff
            if future_mask.any():
                margin_model = joblib.load(margin_model_path)
                ridge_margin = joblib.load(ridge_path) if ridge_path and ridge_path.exists() else None
                from scripts.generate_report import add_location_features, get_indicator_df
                enriched = add_location_features(df.copy())
                enriched = add_win_strength_features(enriched)
                enriched = enriched.loc[future_mask].copy()
                req_cols = score_meta.get("margin_features", [])
                missing = [column for column in req_cols if column not in enriched.columns]
                if missing:
                    raise ValueError(f"Future holdout rows are missing SCORE features: {missing}")
                future_home = enriched[enriched["IS_HOME"].astype(bool)]
                raw = margin_model.predict(future_home[req_cols])
                if ridge_margin is not None:
                    raw = raw - ridge_margin.predict(get_indicator_df(future_home))
                by_game = dict(zip(future_home["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10), raw))
                for idx in df.index[future_mask]:
                    clean_gid = str(df.loc[idx, "GAME_ID"]).split(".")[0].zfill(10)
                    if clean_gid in by_game:
                        value = float(by_game[clean_gid])
                        margins[df.index.get_loc(idx)] = value if bool(df.loc[idx, "IS_HOME"]) else -value
            df["SCORE_PRED_MARGIN"] = margins
        except Exception as exc:
            raise RuntimeError("Failed to attach time-safe SCORE OOF margins to WIN training rows") from exc
        return df

    def prepare_features(self, df):
        """Turn a team-game frame (with SCORE_PRED_MARGIN attached) into the model matrix.

        Shared by training and the backtest harness so both see identical features.
        """

        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        df = df.dropna(subset=["GAME_DATE"]).sort_values(["GAME_DATE", "GAME_ID"], kind="stable").reset_index(drop=True)

        df_features, df_meta = self.separate_metadata(df)
        df_features = df_features.reset_index(drop=True)
        df_meta = df_meta.reset_index(drop=True)
        if self.target_col not in df_features.columns:
            raise ValueError(f"Target {self.target_col} not found in dataset columns")

        feature_cols_before_strength = df_features.columns.tolist()
        meta_cols_before_strength = df_meta.columns.tolist()
        strength_input = pd.concat([df_features, df_meta], axis=1)
        strength_input = add_win_strength_features(strength_input)
        extra_strength = [c for c in self.strength_features if c not in feature_cols_before_strength]
        df_features = strength_input[feature_cols_before_strength + extra_strength].copy()
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
        excluded_feature_cols = set(self.feature_contract.list_value("excluded_features"))
        required_feature_cols = [c for c in required_feature_cols if c not in excluded_feature_cols]
        missing_allowed = [c for c in required_feature_cols if c not in X.columns]
        non_defaultable_missing = [c for c in missing_allowed if c not in self.defaultable_required_features]
        if non_defaultable_missing:
            raise ValueError(f"Missing required v9 feature columns: {non_defaultable_missing}")
        for col in missing_allowed:
            X[col] = self.defaultable_required_features[col]
        imputed_missing_required_features = missing_allowed
        X = X[required_feature_cols]
        return X, y, df_meta, {
            "dropped_static_venue_split_features": drop_static,
            "imputed_missing_required_features": imputed_missing_required_features,
        }

    def train_and_export(self):
        files = self.resolve_dataset_files()
        df, row_counts_by_file = self.load_training_dataset(files)
        self.validate_dataset_contract(df)
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        df = df.dropna(subset=["GAME_DATE"]).sort_values(["GAME_DATE", "GAME_ID"], kind="stable").reset_index(drop=True)
        # Historical predictions from a player model trained on overlapping
        # outcomes are target leakage. Date-safe player OOF features are not
        # available yet, so keep this feature family out of WIN inputs.
        projection_enrichment = {
            "applied": False,
            "reason": "disabled_until_date_safe_player_oof_predictions_exist",
        }
        df = self.apply_score_prediction_enrichment(df)
        X, y, df_meta, feature_info = self.prepare_features(df)
        drop_static = feature_info["dropped_static_venue_split_features"]
        imputed_missing_required_features = feature_info["imputed_missing_required_features"]

        if "SCORE_PRED_MARGIN" in X.columns:
            valid_oof = np.isfinite(pd.to_numeric(X["SCORE_PRED_MARGIN"], errors="coerce"))
            dropped_without_historical_score_oof = int((~valid_oof).sum())
            X = X.loc[valid_oof].copy()
            y = y.loc[valid_oof].copy()
            df_meta = df_meta.loc[valid_oof].copy()
            if X.empty:
                raise ValueError("No WIN rows have a valid historical SCORE OOF margin.")
        else:
            dropped_without_historical_score_oof = 0
        
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
        
        import lightgbm as lgb
        from sklearn.base import clone

        lr_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=42))
        ])

        # Sparse L1 logistic: in the audit two features carried almost all signal,
        # so a model that can zero out the rest is a natural candidate.
        l1_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(penalty="l1", C=0.05, solver="liblinear", max_iter=1000, random_state=42))
        ])

        lgb_pipeline = Pipeline([
            ("imputer", SimpleImputer(strategy="mean")),
            ("clf", lgb.LGBMClassifier(
                n_estimators=150,
                learning_rate=0.03,
                max_depth=4,
                num_leaves=15,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbose=-1
            ))
        ])

        # Select model family/calibration only on an inner, past-only block.
        train_meta = df_meta.loc[X_train_full.index]
        train_dates = pd.to_datetime(train_meta[self.holdout_config.get("date_col", "GAME_DATE")])
        unique_train_dates = pd.DatetimeIndex(train_dates.drop_duplicates().sort_values())
        if len(unique_train_dates) < 10:
            raise ValueError("WIN model selection needs at least ten distinct training dates.")
        inner_cutoff = unique_train_dates[int(len(unique_train_dates) * 0.8)]
        inner_train_mask = train_dates < inner_cutoff
        inner_val_mask = train_dates >= inner_cutoff
        X_inner_train, y_inner_train = X_train_full.loc[inner_train_mask], y_train_full.loc[inner_train_mask]
        X_inner_val, y_inner_val = X_train_full.loc[inner_val_mask], y_train_full.loc[inner_val_mask]
        inner_meta = train_meta.loc[inner_train_mask]
        calibration_splits = expanding_window_date_splits(
            inner_meta,
            date_col=self.holdout_config.get("date_col", "GAME_DATE"),
            n_splits=3,
        )

        candidates = []
        selection_metrics = {}
        for family_name, base_pipe in [("logistic_regression", lr_pipeline), ("logistic_l1", l1_pipeline), ("lightgbm", lgb_pipeline)]:
            uncalibrated = clone(base_pipe).fit(X_inner_train, y_inner_train)
            p_uncal = uncalibrated.predict_proba(X_inner_val)[:, 1]
            m_uncal = self.eval_metrics(y_inner_val, p_uncal)
            candidates.append((f"{family_name}_uncalibrated", family_name, "uncalibrated", base_pipe, m_uncal))
            selection_metrics[f"{family_name}_uncalibrated"] = m_uncal

            for method in ["sigmoid", "isotonic"]:
                try:
                    calibrated = CalibratedClassifierCV(
                        estimator=clone(base_pipe), method=method, cv=calibration_splits
                    ).fit(X_inner_train, y_inner_train)
                    probabilities = calibrated.predict_proba(X_inner_val)[:, 1]
                    metrics = self.eval_metrics(y_inner_val, probabilities)
                    key = f"{family_name}_{method}"
                    candidates.append((key, family_name, method, base_pipe, metrics))
                    selection_metrics[key] = metrics
                except Exception:
                    continue

        if not candidates:
            raise ValueError("No WIN candidate could be evaluated on the inner time holdout.")
        # One inner block is too small to separate the families: in the 2023-24
        # walk-forward fit LightGBM won it by 0.001 Brier and then lost 0.017 AUC on
        # the test season. The family is therefore chosen on the mean Brier of
        # expanding-window folds over the whole training span, and only the
        # calibration is chosen on the inner block.
        family_folds = expanding_window_date_splits(
            train_meta,
            date_col=self.holdout_config.get("date_col", "GAME_DATE"),
            n_splits=4,
        )
        family_brier = {}
        for family_name, base_pipe in [("logistic_regression", lr_pipeline), ("logistic_l1", l1_pipeline), ("lightgbm", lgb_pipeline)]:
            fold_scores = []
            for fold_train, fold_val in family_folds:
                fitted = clone(base_pipe).fit(X_train_full.iloc[fold_train], y_train_full.iloc[fold_train])
                fold_scores.append(brier_score_loss(y_train_full.iloc[fold_val], fitted.predict_proba(X_train_full.iloc[fold_val])[:, 1]))
            family_brier[family_name] = float(np.mean(fold_scores))
        chosen_family = min(family_brier, key=family_brier.get)
        best_cand_name, best_family, best_calib, best_base_pipe, best_metrics = min(
            (c for c in candidates if c[1] == chosen_family),
            key=lambda item: (item[4]["brier_score"], -item[4]["roc_auc"]),
        )

        os.makedirs(self.output_dir, exist_ok=True)
        refit_all = self.holdout_config.get("final_refit_scope") != "train_only"
        final_X = X if refit_all else X_train_full
        final_y = y if refit_all else y_train_full

        def fit_selected(X_fit, y_fit):
            base = clone(best_base_pipe)
            if best_calib == "uncalibrated":
                return base.fit(X_fit, y_fit)
            splits = expanding_window_date_splits(
                df_meta.loc[X_fit.index],
                date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                n_splits=3,
            )
            return CalibratedClassifierCV(estimator=base, method=best_calib, cv=splits).fit(X_fit, y_fit)

        # Holdout metrics always come from a model that never saw the holdout rows;
        # the shipped model may then be refit on every eligible row.
        eval_model = fit_selected(X_train_full, y_train_full)
        holdout_probabilities = eval_model.predict_proba(X_test)[:, 1]
        holdout_metrics = self.eval_metrics(y_test, holdout_probabilities)
        final_model = fit_selected(final_X, final_y) if refit_all else eval_model

        feature_guard = check_feature_matrix(X_train_full, "WIN")
        feature_guard["holdout_permutation_log_loss"] = permutation_contribution(
            lambda frame: eval_model.predict_proba(frame)[:, 1],
            X_test,
            y_test,
            lambda yt, p: float(log_loss(yt, np.clip(p, 1e-6, 1 - 1e-6))),
        )

        model_path = self.output_dir / f"win_probability_model_{self.version}.pkl"
        joblib.dump(final_model, model_path)
        if self.version == "v10":
            joblib.dump(final_model, self.output_dir / "win_probability_model_v9.pkl")
        
        feature_cols = X.columns.tolist()
        feat_path = self.output_dir / f"feature_columns_{self.version}.json"
        with open(feat_path, "w") as f:
            json.dump(feature_cols, f, indent=2)
        if self.version == "v10":
            with open(self.output_dir / "feature_columns_v9.json", "w") as f:
                json.dump(feature_cols, f, indent=2)
            
        win_artifacts = [model_path, feat_path]
        metadata = {
            "model_name": best_family,
            "version": "10.2-temporal-candidate" if self.version == "v10" else "9.2-temporal-candidate",
            "training_date": datetime.utcnow().isoformat() + "Z",
            "number_of_rows": int(df.shape[0]),
            "number_of_features": int(X.shape[1]),
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "provenance": build_training_provenance(
                root=Path(__file__).resolve().parents[2],
                input_files=files,
                feature_contract_path=self.feature_contract.path,
                manifest_path=self.manifest_metadata.get("path"),
                trainer_path=Path(__file__),
                artifact_paths=win_artifacts,
            ),
            "input_files": [str(p) for p in files],
            "row_counts_by_file": row_counts_by_file,
            "player_projection_enrichment": projection_enrichment,
            "imputed_missing_required_features": imputed_missing_required_features,
            "dropped_without_historical_score_oof": dropped_without_historical_score_oof,
            "final_refit": {
                "enabled": True,
                "rows": int(len(final_X)),
                "scope": self.holdout_config.get("final_refit_scope", "all_eligible_rows"),
                "note": "Holdout metrics are computed before the final model is fit according to the configured refit scope."
            },
            "evaluation": "inner_temporal_model_selection_then_locked_season_holdout",
            "split": split_meta.__dict__,
            "dropped_static_venue_split_features": sorted(drop_static),
            "model_selection_metrics_inner_holdout": selection_metrics,
            "model_family_selection_fold_brier": family_brier,
            "holdout_metrics": holdout_metrics,
            "selected_model": best_cand_name,
            "selected_family": best_family,
            "selected_calibration": best_calib,
            "selected_metrics": holdout_metrics,
            "feature_guard": feature_guard,
            "target_column": self.target_col
        }
        
        meta_path = self.output_dir / "model_metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)
            
        return metadata
