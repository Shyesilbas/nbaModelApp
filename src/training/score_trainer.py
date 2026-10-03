import os
import glob
import math
import json
import joblib
import pandas as pd
import numpy as np
import xgboost as xgb
from datetime import datetime
from pathlib import Path
from sklearn.model_selection import train_test_split, RandomizedSearchCV
from sklearn.metrics import mean_absolute_error, r2_score
from src.training.feature_contract import load_feature_contract
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split

NBA_TEAMS_LOCATIONS = {
    "BOS": {"lat": 42.3662, "lon": -71.0621, "tz_offset": -5},
    "BKN": {"lat": 40.6826, "lon": -73.9754, "tz_offset": -5},
    "NYK": {"lat": 40.7505, "lon": -73.9934, "tz_offset": -5},
    "PHI": {"lat": 39.9012, "lon": -75.1719, "tz_offset": -5},
    "TOR": {"lat": 43.6435, "lon": -79.3791, "tz_offset": -5},
    "CHI": {"lat": 41.8806, "lon": -87.6742, "tz_offset": -6},
    "CLE": {"lat": 41.4965, "lon": -81.6881, "tz_offset": -5},
    "DET": {"lat": 42.3411, "lon": -83.0550, "tz_offset": -5},
    "IND": {"lat": 39.7641, "lon": -86.1555, "tz_offset": -5},
    "MIL": {"lat": 43.0451, "lon": -87.9172, "tz_offset": -6},
    "ATL": {"lat": 33.7573, "lon": -84.3963, "tz_offset": -5},
    "CHA": {"lat": 35.2251, "lon": -80.8392, "tz_offset": -5},
    "MIA": {"lat": 25.7814, "lon": -80.1870, "tz_offset": -5},
    "ORL": {"lat": 28.5392, "lon": -81.3839, "tz_offset": -5},
    "WAS": {"lat": 38.8981, "lon": -77.0209, "tz_offset": -5},
    "DEN": {"lat": 39.7486, "lon": -105.0075, "tz_offset": -7},
    "MIN": {"lat": 44.9795, "lon": -93.2761, "tz_offset": -6},
    "OKC": {"lat": 35.4634, "lon": -97.5151, "tz_offset": -6},
    "POR": {"lat": 45.5316, "lon": -122.6668, "tz_offset": -8},
    "UTA": {"lat": 40.7683, "lon": -111.9011, "tz_offset": -7},
    "GSW": {"lat": 37.7680, "lon": -122.3877, "tz_offset": -8},
    "LAC": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "LAL": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "PHX": {"lat": 33.4457, "lon": -112.0712, "tz_offset": -7},
    "SAC": {"lat": 38.5802, "lon": -121.4997, "tz_offset": -8},
    "DAL": {"lat": 32.7905, "lon": -96.8103, "tz_offset": -6},
    "HOU": {"lat": 29.7508, "lon": -95.3621, "tz_offset": -6},
    "MEM": {"lat": 35.1381, "lon": -90.0506, "tz_offset": -6},
    "NOP": {"lat": 29.9490, "lon": -90.0821, "tz_offset": -6},
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz_offset": -6}
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def get_location_features(row):
    home_team = row["TEAM_ABBREVIATION"] if row["IS_HOME"] else row["OPPONENT_ABBREVIATION"]
    away_team = row["OPPONENT_ABBREVIATION"] if row["IS_HOME"] else row["TEAM_ABBREVIATION"]
    
    home_loc = NBA_TEAMS_LOCATIONS.get(home_team)
    away_loc = NBA_TEAMS_LOCATIONS.get(away_team)
    
    dist = 0.0
    tz_diff = 0.0
    if home_loc and away_loc:
        dist = haversine(home_loc["lat"], home_loc["lon"], away_loc["lat"], away_loc["lon"])
        tz_diff = abs(home_loc["tz_offset"] - away_loc["tz_offset"])
        
    if row["IS_HOME"]:
        return pd.Series({"TRAVEL_DISTANCE": 0.0, "TIMEZONE_DIFF": 0.0, "OPP_TRAVEL_DISTANCE": dist, "OPP_TIMEZONE_DIFF": tz_diff})
    else:
        return pd.Series({"TRAVEL_DISTANCE": dist, "TIMEZONE_DIFF": tz_diff, "OPP_TRAVEL_DISTANCE": 0.0, "OPP_TIMEZONE_DIFF": 0.0})

class ScoreModelTrainer:
    def __init__(self, data_pattern=None, output_dir=None, version="v10", data_files=None, manifest_metadata=None, holdout_config=None, feature_contract_path=None, player_data_path=None, player_models_dir=None):
        self.version = version
        root = Path(__file__).resolve().parents[2]
        self.data_pattern = data_pattern or str(root / "data/processed/team_model_ready_v3_*.csv")
        self.data_files = [Path(p) for p in data_files] if data_files else None
        self.output_dir = Path(output_dir or root / "models/experimental")
        self.player_data_path = Path(player_data_path or root / "data/experimental/player_model_ready_v4_usg.csv")
        self.player_models_dir = Path(player_models_dir or root / "models/production")
        self.manifest_metadata = manifest_metadata or {}
        self.holdout_config = holdout_config or {}
        self.feature_contract = load_feature_contract(feature_contract_path or root / "config/features/score_v10.yaml", root=root)
        self.pace_features = self.feature_contract.list_value("pace_features")
        self.base_off_rtg_features = self.feature_contract.list_value("base_off_rtg_features")
        self.home_off_rtg_features = self.base_off_rtg_features.copy()
        self.away_off_rtg_features = self.base_off_rtg_features.copy() + self.feature_contract.list_value("away_extra_features")
        self.margin_features = self.home_off_rtg_features + self.feature_contract.list_value("margin_extra_features")

    def apply_player_projection_enrichment(self, df):
        if "TEAM_V3_PROJ_PTS_SUM" in df.columns:
            return df
        if not self.player_data_path.exists():
            return df
        try:
            player_df = pd.read_csv(self.player_data_path)
            if "Game_ID" in player_df.columns:
                player_df = player_df.rename(columns={"Game_ID": "GAME_ID"})
            player_df["GAME_ID"] = player_df["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10))

            root_models_prod = Path(__file__).resolve().parents[2] / "models/production"
            candidates = [
                (self.player_models_dir / "player_v9_features.pkl", self.player_models_dir, "player_v9_lgb_"),
                (root_models_prod / "player_v9_features.pkl", root_models_prod, "player_v9_lgb_"),
            ]
            features_path, models_dir, model_prefix = next(
                ((p, d, prefix) for p, d, prefix in candidates if p.exists()),
                (None, None, None),
            )
            if features_path is None or not features_path.exists():
                return df

            player_features = joblib.load(features_path)
            player_df = player_df.dropna(subset=[c for c in player_features if c in player_df.columns])

            targets = ["pts", "reb", "ast"]
            predictions = {}
            for t in targets:
                model_path = models_dir / f"{model_prefix}{t}.pkl"
                if not model_path.exists():
                    model_path = root_models_prod / f"{model_prefix}{t}.pkl"
                if model_path.exists():
                    model = joblib.load(model_path)
                    pred = model.predict(player_df[player_features])
                    player_df[f"PROJ_{t.upper()}"] = pred
                    predictions[t] = pred
                else:
                    return df

            player_df["PROJ_PRA"] = predictions["pts"] + predictions["reb"] + predictions["ast"]

            targets_with_pra = ["pts", "reb", "ast", "pra"]
            proj_cols = [f"PROJ_{t.upper()}" for t in targets_with_pra]
            team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(["sum", "mean"]).reset_index()
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

            df["GAME_ID"] = df["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10))
            df = df.merge(team_features_df, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
            df = df.merge(opp_features_df, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
            return df
        except Exception as e:
            print(f"Warning: Player projection enrichment failed in score trainer: {e}")
            return df

    def apply_strength_features(self, df):
        if "PACE_COLLISION" in df.columns and "ELO_DIFF" in df.columns:
            return df
        from src.features.win_strength_features import add_win_strength_features
        return add_win_strength_features(df)

    def tune_and_train(self, X_train, y_train, random_state=42):
        base_model = xgb.XGBRegressor(random_state=random_state)
        param_grid = {
            'n_estimators': [100, 150, 200, 300],
            'max_depth': [3, 4, 5, 6],
            'learning_rate': [0.01, 0.05, 0.1, 0.2],
            'subsample': [0.8, 0.9, 1.0],
            'colsample_bytree': [0.8, 0.9, 1.0]
        }
        search = RandomizedSearchCV(
            base_model, 
            param_distributions=param_grid, 
            n_iter=10, 
            scoring='neg_mean_absolute_error', 
            cv=3, 
            random_state=random_state, 
            n_jobs=1
        )
        search.fit(X_train, y_train)
        return search.best_estimator_

    def _train_eval_final(self, df, features, target_col):
        X = df[features]
        y = df[target_col]
        if self.holdout_config.get("strategy") == "season_holdout":
            X_train, X_test, y_train, y_test, split_meta = season_holdout_train_test_split(
                X,
                y,
                df,
                calibration_season=self.holdout_config["calibration_season"],
                date_col=self.holdout_config.get("date_col", "GAME_DATE"),
            )
        else:
            X_train, X_test, y_train, y_test, split_meta = chronological_train_test_split(
                X,
                y,
                df,
                date_col=self.holdout_config.get("date_col", "GAME_DATE"),
                test_size=float(self.holdout_config.get("test_size", 0.2)),
            )
        eval_model = self.tune_and_train(X_train, y_train)
        mae = mean_absolute_error(y_test, eval_model.predict(X_test))
        final_model = self.tune_and_train(X, y)
        return final_model, float(mae), split_meta, X_test.index.tolist()

    def resolve_dataset_files(self):
        files = self.data_files if self.data_files is not None else [Path(p) for p in glob.glob(self.data_pattern)]
        if not files:
            raise FileNotFoundError(f"No V3 datasets found matching {self.data_pattern}")
        return files

    def load_training_dataset(self, files):
        row_counts_by_file = {}
        df_list = []
        for f in files:
            f_df = pd.read_csv(f)
            row_counts_by_file[str(f)] = int(len(f_df))
            df_list.append(f_df)
        return pd.concat(df_list, ignore_index=True), row_counts_by_file

    def validate_dataset_contract(self, df):
        required = sorted(set(["PACE", "OFF_RTG", "DEF_RTG", "NET_RTG", "IS_HOME", "GAME_ID", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION"] + self.pace_features + self.home_off_rtg_features + self.away_off_rtg_features + self.margin_features))
        missing = [c for c in required if c not in df.columns and c not in {"TRAVEL_DISTANCE", "TIMEZONE_DIFF"}]
        if missing:
            raise ValueError(f"Score dataset missing required contract columns: {missing}")
        if df.empty:
            raise ValueError("Score dataset is empty after load.")

    def train_and_export(self):
        from sklearn.linear_model import Ridge
            
        files = self.resolve_dataset_files()
        df, row_counts_by_file = self.load_training_dataset(files)
        df = self.apply_player_projection_enrichment(df)
        df = self.apply_strength_features(df)
        self.validate_dataset_contract(df)
        
        df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
        
        loc_feats = df.apply(get_location_features, axis=1)
        df = pd.concat([df, loc_feats], axis=1)
        
        df_home = df[df["IS_HOME"] == True].copy()
        df_away = df[df["IS_HOME"] == False].copy()
        
        df_home["TARGET_PACE"] = df_home["PACE"]
        df_home["TARGET_HOME_OFF_RTG"] = df_home["OFF_RTG"]
        df_away["TARGET_AWAY_OFF_RTG"] = df_away["OFF_RTG"]
        df_home["TARGET_MARGIN"] = df_home["PACE"] * df_home["NET_RTG"] / 100.0
        
        pace_model, pace_mae, pace_split, pace_test_idx = self._train_eval_final(df_home, self.pace_features, "TARGET_PACE")
        home_model, home_mae, home_split, home_test_idx = self._train_eval_final(df_home, self.home_off_rtg_features, "TARGET_HOME_OFF_RTG")
        away_model, away_mae, away_split, away_test_idx = self._train_eval_final(df_away, self.away_off_rtg_features, "TARGET_AWAY_OFF_RTG")
        margin_model, margin_mae, margin_split, margin_test_idx = self._train_eval_final(df_home, self.margin_features, "TARGET_MARGIN")

        eval_home_idx = sorted(set(pace_test_idx).intersection(home_test_idx))
        eval_away_games = set(df_away.loc[away_test_idx, "GAME_ID"].astype(str))

        df_home_eval = df_home.loc[eval_home_idx].copy()
        pred_pace = pace_model.predict(df_home_eval[self.pace_features])
        pred_home_rtg = home_model.predict(df_home_eval[self.home_off_rtg_features])
        df_home_eval["PRED_PACE"] = pred_pace
        df_home_eval["PRED_HOME_RTG"] = pred_home_rtg
        df_home_eval["ACTUAL_HOME_PTS"] = df_home_eval["PACE"] * df_home_eval["OFF_RTG"] / 100.0
        df_home_eval["ACTUAL_AWAY_PTS"] = df_home_eval["PACE"] * df_home_eval["DEF_RTG"] / 100.0
        
        df_away_eval = df_away[df_away["GAME_ID"].astype(str).isin(eval_away_games)][["GAME_ID"] + self.away_off_rtg_features].copy()
        df_away_eval["PRED_AWAY_RTG"] = away_model.predict(df_away_eval[self.away_off_rtg_features])
        df_away_eval = df_away_eval[["GAME_ID", "PRED_AWAY_RTG"]]
        
        df_eval = df_home_eval.merge(df_away_eval, on="GAME_ID", how="inner")
        df_eval["EXPECTED_HOME_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_HOME_RTG"] / 100.0
        df_eval["EXPECTED_AWAY_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_AWAY_RTG"] / 100.0
        
        home_score_mae = mean_absolute_error(df_eval["ACTUAL_HOME_PTS"], df_eval["EXPECTED_HOME_SCORE"])
        away_score_mae = mean_absolute_error(df_eval["ACTUAL_AWAY_PTS"], df_eval["EXPECTED_AWAY_SCORE"])
        
        # Out-Of-Fold (OOF) prediction generation to train Ridge calibration without in-sample overfitting
        from sklearn.model_selection import KFold
        kf = KFold(n_splits=5, shuffle=True, random_state=42)

        pred_pace_oof = pd.Series(index=df_home.index, dtype=float)
        pred_home_rtg_oof = pd.Series(index=df_home.index, dtype=float)
        pred_margin_oof = pd.Series(index=df_home.index, dtype=float)

        for train_idx, val_idx in kf.split(df_home):
            fold_pace = xgb.XGBRegressor(**pace_model.get_params())
            fold_pace.fit(df_home.iloc[train_idx][self.pace_features], df_home.iloc[train_idx]["TARGET_PACE"])
            pred_pace_oof.iloc[val_idx] = fold_pace.predict(df_home.iloc[val_idx][self.pace_features])

            fold_home = xgb.XGBRegressor(**home_model.get_params())
            fold_home.fit(df_home.iloc[train_idx][self.home_off_rtg_features], df_home.iloc[train_idx]["TARGET_HOME_OFF_RTG"])
            pred_home_rtg_oof.iloc[val_idx] = fold_home.predict(df_home.iloc[val_idx][self.home_off_rtg_features])

            fold_margin = xgb.XGBRegressor(**margin_model.get_params())
            fold_margin.fit(df_home.iloc[train_idx][self.margin_features], df_home.iloc[train_idx]["TARGET_MARGIN"])
            pred_margin_oof.iloc[val_idx] = fold_margin.predict(df_home.iloc[val_idx][self.margin_features])

        pred_away_rtg_oof = pd.Series(index=df_away.index, dtype=float)
        for train_idx, val_idx in kf.split(df_away):
            fold_away = xgb.XGBRegressor(**away_model.get_params())
            fold_away.fit(df_away.iloc[train_idx][self.away_off_rtg_features], df_away.iloc[train_idx]["TARGET_AWAY_OFF_RTG"])
            pred_away_rtg_oof.iloc[val_idx] = fold_away.predict(df_away.iloc[val_idx][self.away_off_rtg_features])

        df_home_full_eval = df_home.copy()
        df_home_full_eval["PRED_PACE"] = pred_pace_oof
        df_home_full_eval["PRED_HOME_RTG"] = pred_home_rtg_oof
        df_home_full_eval["PRED_MARGIN_MODEL"] = pred_margin_oof

        df_away_full_eval = df_away[["GAME_ID"]].copy()
        df_away_full_eval["PRED_AWAY_RTG"] = pred_away_rtg_oof

        df_full_eval = df_home_full_eval.merge(df_away_full_eval, on="GAME_ID", how="inner")
        df_full_eval["ACTUAL_HOME_PTS"] = df_full_eval["PACE"] * df_full_eval["OFF_RTG"] / 100.0
        df_full_eval["ACTUAL_AWAY_PTS"] = df_full_eval["PACE"] * df_full_eval["DEF_RTG"] / 100.0
        df_full_eval["ACTUAL_TOTAL"] = df_full_eval["ACTUAL_HOME_PTS"] + df_full_eval["ACTUAL_AWAY_PTS"]
        df_full_eval["ACTUAL_MARGIN"] = df_full_eval["ACTUAL_HOME_PTS"] - df_full_eval["ACTUAL_AWAY_PTS"]

        df_full_eval["PRED_TOTAL_RAW"] = df_full_eval["PRED_PACE"] * (df_full_eval["PRED_HOME_RTG"] + df_full_eval["PRED_AWAY_RTG"]) / 100.0

        df_full_eval["TOTAL_RESIDUAL"] = df_full_eval["PRED_TOTAL_RAW"] - df_full_eval["ACTUAL_TOTAL"]
        df_full_eval["MARGIN_RESIDUAL"] = df_full_eval["PRED_MARGIN_MODEL"] - df_full_eval["ACTUAL_MARGIN"]

        # Build Ridge calibration features
        X_ind = pd.DataFrame(index=df_full_eval.index)
        X_ind["is_playoff"] = (df_full_eval["IS_PLAYOFF"].astype(int) == 1).astype(float)
        X_ind["home_b2b"] = (df_full_eval["IS_B2B"].astype(int) == 1).astype(float)
        X_ind["away_b2b"] = (df_full_eval["OPP_IS_B2B"].astype(int) == 1).astype(float)
        X_ind["home_rest_advantage"] = (df_full_eval["DAYS_REST"] > df_full_eval["OPP_DAYS_REST"]).astype(float)
        X_ind["away_rest_advantage"] = (df_full_eval["OPP_DAYS_REST"] > df_full_eval["DAYS_REST"]).astype(float)

        ridge_total = Ridge(alpha=1.0)
        ridge_total.fit(X_ind, df_full_eval["TOTAL_RESIDUAL"])

        ridge_margin = Ridge(alpha=1.0)
        ridge_margin.fit(X_ind, df_full_eval["MARGIN_RESIDUAL"])

        df_oof_export = pd.DataFrame({
            "GAME_ID": df_full_eval["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10)),
            "SCORE_PRED_MARGIN_OOF": df_full_eval["PRED_MARGIN_MODEL"] - ridge_margin.predict(X_ind)
        })

        os.makedirs(self.output_dir, exist_ok=True)
        df_oof_export.to_parquet(self.output_dir / f"score_model_{self.version}_oof_margins.parquet", index=False)
        joblib.dump(pace_model, self.output_dir / f"score_model_{self.version}_pace.pkl")
        joblib.dump(home_model, self.output_dir / f"score_model_{self.version}_home_rtg.pkl")
        joblib.dump(away_model, self.output_dir / f"score_model_{self.version}_away_rtg.pkl")
        joblib.dump(margin_model, self.output_dir / f"score_model_{self.version}_margin.pkl")
        joblib.dump(ridge_total, self.output_dir / f"score_model_{self.version}_ridge_total.pkl")
        joblib.dump(ridge_margin, self.output_dir / f"score_model_{self.version}_ridge_margin.pkl")
        if self.version == "v10":
            df_oof_export.to_parquet(self.output_dir / "score_model_v9_oof_margins.parquet", index=False)
            joblib.dump(pace_model, self.output_dir / "score_model_v9_pace.pkl")
            joblib.dump(home_model, self.output_dir / "score_model_v9_home_rtg.pkl")
            joblib.dump(away_model, self.output_dir / "score_model_v9_away_rtg.pkl")
            joblib.dump(margin_model, self.output_dir / "score_model_v9_margin.pkl")
            joblib.dump(ridge_total, self.output_dir / "score_model_v9_ridge_total.pkl")
            joblib.dump(ridge_margin, self.output_dir / "score_model_v9_ridge_margin.pkl")
        
        metadata = {
            "version": f"{self.version}_Ridge",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "input_files": [str(p) for p in files],
            "row_counts_by_file": row_counts_by_file,
            "final_refit": {
                "enabled": True,
                "rows": int(len(df)),
                "note": "Holdout metrics are computed before final submodels are refit on all eligible rows."
            },
            "evaluation": "chronological_holdout",
            "pace_mae": float(pace_mae),
            "home_rtg_mae": float(home_mae),
            "away_rtg_mae": float(away_mae),
            "margin_mae": float(margin_mae),
            "derived_home_score_mae": float(home_score_mae),
            "derived_away_score_mae": float(away_score_mae),
            "splits": {
                "pace": pace_split.__dict__,
                "home_rtg": home_split.__dict__,
                "away_rtg": away_split.__dict__,
                "margin": margin_split.__dict__,
                "derived_score_eval_games": int(len(df_eval)),
            },
            "ridge_coefs": {
                "total": ridge_total.coef_.tolist(),
                "total_intercept": float(ridge_total.intercept_),
                "margin": ridge_margin.coef_.tolist(),
                "margin_intercept": float(ridge_margin.intercept_),
                "features": X_ind.columns.tolist()
            },
            "pace_features": self.pace_features,
            "home_off_rtg_features": self.home_off_rtg_features,
            "away_off_rtg_features": self.away_off_rtg_features,
            "margin_features": self.margin_features
        }
        
        metadata_path = self.output_dir / f"score_model_{self.version}_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
        if self.version == "v10":
            with open(self.output_dir / "score_model_v9_metadata.json", "w") as f:
                json.dump(metadata, f, indent=4)
            
        return metadata
