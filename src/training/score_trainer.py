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
from src.training.validation_utils import chronological_train_test_split

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
    def __init__(self, data_pattern=None, output_dir=None):
        root = Path(__file__).resolve().parents[2]
        self.data_pattern = data_pattern or str(root / "data/processed/team_model_ready_v3_*.csv")
        self.output_dir = Path(output_dir or root / "models/experimental")
        
        self.pace_features = [
            "PACE_LAST_5", "PACE_LAST_10", "OPP_PACE_LAST_5", "OPP_PACE_LAST_10",
            "OFF_RTG_LAST_5", "DEF_RTG_LAST_5", "OPP_OFF_RTG_LAST_5", "OPP_DEF_RTG_LAST_5",
            "DAYS_REST", "OPP_DAYS_REST", "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"
        ]
        
        self.base_off_rtg_features = [
            "OFF_RTG_LAST_5", "OFF_RTG_LAST_10", "PACE_LAST_5", "WINRATE_LAST_5", 
            "OPP_DEF_RTG_LAST_5", "OPP_DEF_RTG_LAST_10", "OPP_PACE_LAST_5",
            "TEAM_CORE_TOP3_PLAYED_COUNT", "TEAM_CORE_TOP3_AVAILABLE_RATE", "TEAM_CORE_TOP3_PTS_LAST_5_SUM",
            "OPP_CORE_TOP3_PLAYED_COUNT", "DAYS_REST", "OPP_DAYS_REST", "IS_ELIMINATION_GAME", "CAN_CLINCH_SERIES"
        ]
        
        self.home_off_rtg_features = self.base_off_rtg_features.copy()
        self.away_off_rtg_features = self.base_off_rtg_features.copy() + ["TRAVEL_DISTANCE", "TIMEZONE_DIFF"]
        self.margin_features = self.home_off_rtg_features + ["DEF_RTG_LAST_5", "DEF_RTG_LAST_10", "OPP_OFF_RTG_LAST_5"]

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
        X_train, X_test, y_train, y_test, split_meta = chronological_train_test_split(
            X,
            y,
            df,
            test_size=0.2,
        )
        eval_model = self.tune_and_train(X_train, y_train)
        mae = mean_absolute_error(y_test, eval_model.predict(X_test))
        final_model = self.tune_and_train(X, y)
        return final_model, float(mae), split_meta, X_test.index.tolist()

    def train_and_export(self):
        files = glob.glob(self.data_pattern)
        if not files:
            raise FileNotFoundError(f"No V3 datasets found matching {self.data_pattern}")
            
        df_list = [pd.read_csv(f) for f in files]
        df = pd.concat(df_list, ignore_index=True)
        
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
        
        os.makedirs(self.output_dir, exist_ok=True)
        joblib.dump(pace_model, self.output_dir / "score_model_v8_pace.pkl")
        joblib.dump(home_model, self.output_dir / "score_model_v8_home_rtg.pkl")
        joblib.dump(away_model, self.output_dir / "score_model_v8_away_rtg.pkl")
        joblib.dump(margin_model, self.output_dir / "score_model_v8_margin.pkl")
        
        metadata = {
            "version": "8.0_XGBoost",
            "updated_at": datetime.utcnow().isoformat() + "Z",
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
            "pace_features": self.pace_features,
            "home_off_rtg_features": self.home_off_rtg_features,
            "away_off_rtg_features": self.away_off_rtg_features,
            "margin_features": self.margin_features
        }
        
        metadata_path = self.output_dir / "score_model_v8_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
            
        return metadata
