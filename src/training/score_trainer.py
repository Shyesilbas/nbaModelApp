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
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit
from sklearn.base import clone
from sklearn.metrics import mean_absolute_error, r2_score
from src.training.feature_contract import load_feature_contract
from src.training.validation_utils import chronological_train_test_split, season_holdout_train_test_split
from src.training.provenance import build_training_provenance

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

    def tune_and_train(self, X_train, y_train, game_dates=None, random_state=42):
        base_model = xgb.XGBRegressor(random_state=random_state)
        param_grid = {
            'n_estimators': [100, 150, 200, 300],
            'max_depth': [3, 4, 5, 6],
            'learning_rate': [0.01, 0.05, 0.1, 0.2],
            'subsample': [0.8, 0.9, 1.0],
            'colsample_bytree': [0.8, 0.9, 1.0]
        }
        # Split on unique dates so games from the same day never land on both
        # sides of a validation fold.
        if game_dates is None:
            raise ValueError("Time-aware hyperparameter tuning requires game dates.")
        dates = pd.to_datetime(pd.Series(game_dates, index=X_train.index), errors="coerce")
        if dates.isna().any():
            raise ValueError("Hyperparameter tuning received invalid game dates.")
        unique_dates = pd.DatetimeIndex(dates.drop_duplicates().sort_values())
        if len(unique_dates) < 4:
            raise ValueError("At least four distinct game dates are required for time-series tuning.")
        cv = []
        for train_date_idx, val_date_idx in TimeSeriesSplit(n_splits=3).split(unique_dates):
            train_dates = unique_dates[train_date_idx]
            val_dates = unique_dates[val_date_idx]
            train_rows = np.flatnonzero(dates.isin(train_dates).to_numpy())
            val_rows = np.flatnonzero(dates.isin(val_dates).to_numpy())
            cv.append((train_rows, val_rows))
        search = RandomizedSearchCV(
            base_model, 
            param_distributions=param_grid, 
            n_iter=5,
            scoring='neg_mean_absolute_error', 
            cv=cv,
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
        eval_model = self.tune_and_train(
            X_train, y_train, game_dates=df.loc[X_train.index, "GAME_DATE"]
        )
        mae = mean_absolute_error(y_test, eval_model.predict(X_test))
        # Keep the holdout estimator separate from the production refit. The
        # former is the only model allowed to produce evaluation predictions.
        final_model = clone(eval_model)
        final_model.fit(X, y)
        return eval_model, final_model, float(mae), split_meta, X_test.index.tolist()

    @staticmethod
    def _temporal_oof_predictions(frame, features, target, model_template, date_col="GAME_DATE", block_days=120):
        """Expanding-window predictions; every validation block follows its training data."""
        dates = pd.to_datetime(frame[date_col], errors="coerce")
        if dates.isna().any():
            raise ValueError(f"Temporal OOF requires valid {date_col} values for every row.")
        ordered = frame.assign(_oof_date=dates).sort_values(["_oof_date", "GAME_ID"], kind="stable")
        predictions = pd.Series(index=frame.index, dtype=float)
        unique_dates = pd.DatetimeIndex(ordered["_oof_date"].drop_duplicates().sort_values())
        if len(unique_dates) < 2:
            raise ValueError("Temporal OOF requires at least two distinct game dates.")
        start_pos = max(1, int(len(unique_dates) * 0.35))
        first_validation_date = unique_dates[start_pos]
        validation_dates = unique_dates[unique_dates >= first_validation_date]
        block_ids = ((validation_dates - first_validation_date).days // block_days)
        for block_id in np.unique(block_ids):
            block_dates = validation_dates[block_ids == block_id]
            train_mask = ordered["_oof_date"] < block_dates.min()
            val_mask = ordered["_oof_date"].isin(block_dates)
            if not train_mask.any() or not val_mask.any():
                continue
            model = clone(model_template)
            model.fit(ordered.loc[train_mask, features], ordered.loc[train_mask, target])
            predictions.loc[ordered.loc[val_mask].index] = model.predict(ordered.loc[val_mask, features])
        return predictions

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
        # The saved player model was fit on overlapping game outcomes. Until
        # temporal player OOF projections exist, exclude this entire family.
        df = self.apply_strength_features(df)
        self.validate_dataset_contract(df)
        
        df = df.dropna(subset=["PACE", "OFF_RTG", "DEF_RTG", "PACE_LAST_5", "OFF_RTG_LAST_5", "DEF_RTG_LAST_5"])
        
        loc_feats = df.apply(get_location_features, axis=1)
        df = pd.concat([df, loc_feats], axis=1)
        
        if "GAME_DATE" not in df.columns:
            raise ValueError("Score training requires GAME_DATE for time-safe evaluation.")
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        df = df.dropna(subset=["GAME_DATE"]).sort_values(["GAME_DATE", "GAME_ID"], kind="stable")
        df_home = df[df["IS_HOME"] == True].copy()
        df_away = df[df["IS_HOME"] == False].copy()
        
        df_home["TARGET_PACE"] = df_home["PACE"]
        df_home["TARGET_HOME_OFF_RTG"] = df_home["OFF_RTG"]
        df_away["TARGET_AWAY_OFF_RTG"] = df_away["OFF_RTG"]
        df_home["TARGET_MARGIN"] = df_home["PACE"] * df_home["NET_RTG"] / 100.0
        
        pace_eval_model, pace_model, pace_mae, pace_split, pace_test_idx = self._train_eval_final(df_home, self.pace_features, "TARGET_PACE")
        home_eval_model, home_model, home_mae, home_split, home_test_idx = self._train_eval_final(df_home, self.home_off_rtg_features, "TARGET_HOME_OFF_RTG")
        away_eval_model, away_model, away_mae, away_split, away_test_idx = self._train_eval_final(df_away, self.away_off_rtg_features, "TARGET_AWAY_OFF_RTG")
        margin_eval_model, margin_model, margin_mae, margin_split, margin_test_idx = self._train_eval_final(df_home, self.margin_features, "TARGET_MARGIN")

        eval_home_idx = sorted(set(pace_test_idx).intersection(home_test_idx))
        eval_away_games = set(df_away.loc[away_test_idx, "GAME_ID"].astype(str))

        df_home_eval = df_home.loc[eval_home_idx].copy()
        pred_pace = pace_eval_model.predict(df_home_eval[self.pace_features])
        pred_home_rtg = home_eval_model.predict(df_home_eval[self.home_off_rtg_features])
        df_home_eval["PRED_PACE"] = pred_pace
        df_home_eval["PRED_HOME_RTG"] = pred_home_rtg
        df_home_eval["ACTUAL_HOME_PTS"] = df_home_eval["PACE"] * df_home_eval["OFF_RTG"] / 100.0
        df_home_eval["ACTUAL_AWAY_PTS"] = df_home_eval["PACE"] * df_home_eval["DEF_RTG"] / 100.0
        
        df_away_eval = df_away[df_away["GAME_ID"].astype(str).isin(eval_away_games)][["GAME_ID"] + self.away_off_rtg_features].copy()
        df_away_eval["PRED_AWAY_RTG"] = away_eval_model.predict(df_away_eval[self.away_off_rtg_features])
        df_away_eval = df_away_eval[["GAME_ID", "PRED_AWAY_RTG"]]
        
        df_eval = df_home_eval.merge(df_away_eval, on="GAME_ID", how="inner")
        df_eval["EXPECTED_HOME_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_HOME_RTG"] / 100.0
        df_eval["EXPECTED_AWAY_SCORE"] = df_eval["PRED_PACE"] * df_eval["PRED_AWAY_RTG"] / 100.0
        
        home_score_mae = mean_absolute_error(df_eval["ACTUAL_HOME_PTS"], df_eval["EXPECTED_HOME_SCORE"])
        away_score_mae = mean_absolute_error(df_eval["ACTUAL_AWAY_PTS"], df_eval["EXPECTED_AWAY_SCORE"])
        
        # Out-Of-Fold (OOF) prediction generation to train Ridge calibration without in-sample overfitting
        pred_pace_oof = self._temporal_oof_predictions(df_home, self.pace_features, "TARGET_PACE", pace_eval_model)
        pred_home_rtg_oof = self._temporal_oof_predictions(df_home, self.home_off_rtg_features, "TARGET_HOME_OFF_RTG", home_eval_model)
        pred_margin_oof = self._temporal_oof_predictions(df_home, self.margin_features, "TARGET_MARGIN", margin_eval_model)
        pred_away_rtg_oof = self._temporal_oof_predictions(df_away, self.away_off_rtg_features, "TARGET_AWAY_OFF_RTG", away_eval_model)

        df_home_full_eval = df_home.copy()
        df_home_full_eval["PRED_PACE"] = pred_pace_oof
        df_home_full_eval["PRED_HOME_RTG"] = pred_home_rtg_oof
        df_home_full_eval["PRED_MARGIN_MODEL"] = pred_margin_oof

        df_away_full_eval = df_away[["GAME_ID"]].copy()
        df_away_full_eval["PRED_AWAY_RTG"] = pred_away_rtg_oof

        df_full_eval = df_home_full_eval.merge(df_away_full_eval, on="GAME_ID", how="inner")
        df_full_eval = df_full_eval.dropna(subset=["PRED_PACE", "PRED_HOME_RTG", "PRED_MARGIN_MODEL", "PRED_AWAY_RTG"]).copy()
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

        # Export a historically valid score margin for WIN training. A row's
        # correction may only use residuals from earlier game dates.
        oof_dates = pd.to_datetime(df_full_eval["GAME_DATE"], errors="coerce")
        corrected_oof_margin = pd.Series(index=df_full_eval.index, dtype=float)
        for date in oof_dates.dropna().sort_values().unique():
            earlier = oof_dates < date
            current = oof_dates == date
            if earlier.sum() >= 30:
                fold_ridge = Ridge(alpha=1.0).fit(X_ind.loc[earlier], df_full_eval.loc[earlier, "MARGIN_RESIDUAL"])
                correction = fold_ridge.predict(X_ind.loc[current])
            else:
                correction = np.zeros(int(current.sum()))
            corrected_oof_margin.loc[oof_dates.index[current.to_numpy()]] = (
                df_full_eval.loc[current, "PRED_MARGIN_MODEL"].to_numpy() - correction
            )

        ridge_total = Ridge(alpha=1.0).fit(X_ind, df_full_eval["TOTAL_RESIDUAL"])
        ridge_margin = Ridge(alpha=1.0).fit(X_ind, df_full_eval["MARGIN_RESIDUAL"])

        pred_total_oof = df_full_eval["PRED_TOTAL_RAW"] - ridge_total.predict(X_ind)
        pred_margin_oof = df_full_eval["PRED_MARGIN_MODEL"] - ridge_margin.predict(X_ind)
        pred_home_oof = (pred_total_oof + pred_margin_oof) / 2.0
        pred_away_oof = (pred_total_oof - pred_margin_oof) / 2.0

        conformal_stats = self._compute_conformal_intervals(
            df_full_eval, pred_total_oof, pred_margin_oof, pred_home_oof, pred_away_oof
        )

        df_oof_export = pd.DataFrame({
            "GAME_ID": df_full_eval["GAME_ID"].astype(str).apply(lambda x: x.split(".")[0].zfill(10)),
            "SCORE_PRED_MARGIN_OOF": corrected_oof_margin
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
        
        score_artifacts = [
            self.output_dir / f"score_model_{self.version}_{name}.pkl"
            for name in ["pace", "home_rtg", "away_rtg", "margin", "ridge_total", "ridge_margin"]
        ] + [self.output_dir / f"score_model_{self.version}_oof_margins.parquet"]
        metadata = {
            "version": f"{self.version}_temporal_Ridge_candidate",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "training_manifest": self.manifest_metadata,
            "feature_contract": self.feature_contract.snapshot,
            "provenance": build_training_provenance(
                root=Path(__file__).resolve().parents[2],
                input_files=files,
                feature_contract_path=self.feature_contract.path,
                manifest_path=self.manifest_metadata.get("path"),
                trainer_path=Path(__file__),
                artifact_paths=score_artifacts,
            ),
            "input_files": [str(p) for p in files],
            "row_counts_by_file": row_counts_by_file,
            "final_refit": {
                "enabled": True,
                "rows": int(len(df)),
                "note": "Holdout metrics are computed before final submodels are refit on all eligible rows."
            },
            "evaluation": "time_ordered_inner_search_and_season_holdout",
            "evaluation_scope": "independent_holdout_predictions_from_pre_holdout_models",
            "training_date_min": df["GAME_DATE"].min().date().isoformat(),
            "training_date_max": df["GAME_DATE"].max().date().isoformat(),
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
            "margin_features": self.margin_features,
            "prediction_interval_offsets_80pct": conformal_stats.get("offsets_80pct", {}),
            "prediction_interval_offsets_90pct": conformal_stats.get("offsets_90pct", {}),
            "prediction_interval_offsets_50pct": conformal_stats.get("offsets_50pct", {}),
            "conformal_prediction_intervals": conformal_stats,
        }
        
        metadata_path = self.output_dir / f"score_model_{self.version}_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
        if self.version == "v10":
            with open(self.output_dir / "score_model_v9_metadata.json", "w") as f:
                json.dump(metadata, f, indent=4)
            
        return metadata

    @staticmethod
    def _compute_conformal_intervals(df_full_eval, pred_total, pred_margin, pred_home, pred_away):
        n = len(df_full_eval)
        if n < 50:
            return {}

        targets = {
            "total": (df_full_eval["ACTUAL_TOTAL"] - pred_total).dropna(),
            "margin": (df_full_eval["ACTUAL_MARGIN"] - pred_margin).dropna(),
            "home": (df_full_eval["ACTUAL_HOME_PTS"] - pred_home).dropna(),
            "away": (df_full_eval["ACTUAL_AWAY_PTS"] - pred_away).dropna(),
        }

        offsets_80 = {}
        offsets_90 = {}
        offsets_50 = {}
        empirical_80 = {}
        empirical_90 = {}
        coverage_report = {}

        q_level_80 = min(1.0, np.ceil((n + 1) * 0.80) / n)
        q_level_90 = min(1.0, np.ceil((n + 1) * 0.90) / n)
        q_level_50 = min(1.0, np.ceil((n + 1) * 0.50) / n)

        for key, err in targets.items():
            abs_err = err.abs()
            q80 = float(np.quantile(abs_err, q_level_80))
            q90 = float(np.quantile(abs_err, q_level_90))
            q50 = float(np.quantile(abs_err, q_level_50))

            offsets_80[key] = [round(-q80, 1), round(q80, 1)]
            offsets_90[key] = [round(-q90, 1), round(q90, 1)]
            offsets_50[key] = [round(-q50, 1), round(q50, 1)]

            emp_low_80 = float(np.quantile(err, 0.10))
            emp_high_80 = float(np.quantile(err, 0.90))
            empirical_80[key] = [round(emp_low_80, 1), round(emp_high_80, 1)]

            emp_low_90 = float(np.quantile(err, 0.05))
            emp_high_90 = float(np.quantile(err, 0.95))
            empirical_90[key] = [round(emp_low_90, 1), round(emp_high_90, 1)]

            cov_80 = float((abs_err <= q80).mean())
            cov_90 = float((abs_err <= q90).mean())
            cov_50 = float((abs_err <= q50).mean())

            coverage_report[key] = {
                "std_dev": round(float(err.std()), 2),
                "mae": round(float(abs_err.mean()), 2),
                "bias": round(float(err.mean()), 2),
                "conformal_80_radius": round(q80, 1),
                "conformal_80_empirical_coverage": round(cov_80 * 100, 1),
                "conformal_90_radius": round(q90, 1),
                "conformal_90_empirical_coverage": round(cov_90 * 100, 1),
                "conformal_50_radius": round(q50, 1),
                "conformal_50_empirical_coverage": round(cov_50 * 100, 1),
            }

        return {
            "offsets_80pct": offsets_80,
            "offsets_90pct": offsets_90,
            "offsets_50pct": offsets_50,
            "empirical_quantiles_80pct": empirical_80,
            "empirical_quantiles_90pct": empirical_90,
            "coverage_report": coverage_report,
            "calibration_samples": n,
        }

