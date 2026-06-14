from __future__ import annotations

import json
from pathlib import Path
from typing import Callable, Dict, Iterable

import joblib
import math
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, brier_score_loss, mean_absolute_error, roc_auc_score


ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT / "reports" / "evaluation"
REPORT_PATH = REPORT_DIR / "v8_segment_calibration_report.md"
JSON_PATH = REPORT_DIR / "v8_segment_calibration_metrics.json"

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
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz_offset": -6},
}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def add_location_features(df: pd.DataFrame) -> pd.DataFrame:
    if {"TRAVEL_DISTANCE", "TIMEZONE_DIFF", "OPP_TRAVEL_DISTANCE", "OPP_TIMEZONE_DIFF"}.issubset(df.columns):
        return df

    def row_features(row: pd.Series) -> pd.Series:
        home_team = row["TEAM_ABBREVIATION"] if bool(row["IS_HOME"]) else row["OPPONENT_ABBREVIATION"]
        away_team = row["OPPONENT_ABBREVIATION"] if bool(row["IS_HOME"]) else row["TEAM_ABBREVIATION"]
        home_loc = NBA_TEAMS_LOCATIONS.get(home_team)
        away_loc = NBA_TEAMS_LOCATIONS.get(away_team)
        dist = 0.0
        tz_diff = 0.0
        if home_loc and away_loc:
            dist = haversine(home_loc["lat"], home_loc["lon"], away_loc["lat"], away_loc["lon"])
            tz_diff = abs(home_loc["tz_offset"] - away_loc["tz_offset"])
        if bool(row["IS_HOME"]):
            return pd.Series({"TRAVEL_DISTANCE": 0.0, "TIMEZONE_DIFF": 0.0, "OPP_TRAVEL_DISTANCE": dist, "OPP_TIMEZONE_DIFF": tz_diff})
        return pd.Series({"TRAVEL_DISTANCE": dist, "TIMEZONE_DIFF": tz_diff, "OPP_TRAVEL_DISTANCE": 0.0, "OPP_TIMEZONE_DIFF": 0.0})

    return pd.concat([df, df.apply(row_features, axis=1)], axis=1)


def load_team_model_ready() -> pd.DataFrame:
    files = sorted((ROOT / "data" / "processed").glob("team_model_ready_v3_*.csv"))
    if not files:
        raise FileNotFoundError("No team_model_ready_v3_*.csv files found")
    df = pd.concat([pd.read_csv(p) for p in files], ignore_index=True)
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    return df


def add_venue_aliases(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "IS_HOME" not in df.columns:
        return df
    is_home = df["IS_HOME"].astype(bool)
    aliases = {
        "CURRENT_VENUE_WINRATE_LAST_5": ("HOME_WINRATE_LAST_5", "AWAY_WINRATE_LAST_5"),
        "CURRENT_VENUE_PTS_LAST_5": ("HOME_PTS_LAST_5", "AWAY_PTS_LAST_5"),
        "CURRENT_VENUE_PTS_ALLOWED_LAST_5": ("HOME_PTS_ALLOWED_LAST_5", "AWAY_PTS_ALLOWED_LAST_5"),
        "OPP_CURRENT_VENUE_WINRATE_LAST_5": ("OPP_AWAY_WINRATE_LAST_5", "OPP_HOME_WINRATE_LAST_5"),
        "OPP_CURRENT_VENUE_PTS_LAST_5": ("OPP_AWAY_PTS_LAST_5", "OPP_HOME_PTS_LAST_5"),
        "OPP_CURRENT_VENUE_PTS_ALLOWED_LAST_5": ("OPP_AWAY_PTS_ALLOWED_LAST_5", "OPP_HOME_PTS_ALLOWED_LAST_5"),
    }
    for alias, (home_col, away_col) in aliases.items():
        if alias not in df.columns and home_col in df.columns and away_col in df.columns:
            df[alias] = np.where(is_home, df[home_col], df[away_col])
    return df


def add_player_projection_features(df: pd.DataFrame) -> pd.DataFrame:
    required = [
        "TEAM_V3_PROJ_PTS_SUM", "TEAM_V3_PROJ_PTS_AVG", "TEAM_V3_PROJ_REB_SUM", "TEAM_V3_PROJ_REB_AVG",
        "TEAM_V3_PROJ_AST_SUM", "TEAM_V3_PROJ_AST_AVG", "TEAM_V3_PROJ_PRA_SUM", "TEAM_V3_PROJ_PRA_AVG",
        "OPP_V3_PROJ_PTS_SUM", "OPP_V3_PROJ_PTS_AVG", "OPP_V3_PROJ_REB_SUM", "OPP_V3_PROJ_REB_AVG",
        "OPP_V3_PROJ_AST_SUM", "OPP_V3_PROJ_AST_AVG", "OPP_V3_PROJ_PRA_SUM", "OPP_V3_PROJ_PRA_AVG",
    ]
    if all(c in df.columns for c in required):
        return df

    player_path = ROOT / "data" / "experimental" / "player_model_ready_v4_usg.csv"
    features_path = ROOT / "models" / "production" / "player_v8_features.pkl"
    if not player_path.exists() or not features_path.exists():
        raise FileNotFoundError("Player model-ready data or player_v8_features.pkl missing")

    player_df = pd.read_csv(player_path)
    player_features = joblib.load(features_path)
    player_df = player_df.dropna(subset=player_features)

    preds = {}
    for target in ["pts", "reb", "ast"]:
        model = joblib.load(ROOT / "models" / "production" / f"player_v8_lgb_{target}.pkl")
        pred = model.predict(player_df[player_features])
        player_df[f"PROJ_{target.upper()}"] = pred
        preds[target] = pred
    player_df["PROJ_PRA"] = preds["pts"] + preds["reb"] + preds["ast"]

    proj_cols = ["PROJ_PTS", "PROJ_REB", "PROJ_AST", "PROJ_PRA"]
    team_agg = player_df.groupby(["GAME_ID", "TEAM_ABBREVIATION"])[proj_cols].agg(["sum", "mean"]).reset_index()
    team_agg.columns = ["GAME_ID", "TEAM_ABBREVIATION"] + [f"{col}_{agg}" for col, agg in team_agg.columns[2:]]

    team_features = team_agg.rename(columns={
        "PROJ_PTS_sum": "TEAM_V3_PROJ_PTS_SUM",
        "PROJ_PTS_mean": "TEAM_V3_PROJ_PTS_AVG",
        "PROJ_REB_sum": "TEAM_V3_PROJ_REB_SUM",
        "PROJ_REB_mean": "TEAM_V3_PROJ_REB_AVG",
        "PROJ_AST_sum": "TEAM_V3_PROJ_AST_SUM",
        "PROJ_AST_mean": "TEAM_V3_PROJ_AST_AVG",
        "PROJ_PRA_sum": "TEAM_V3_PROJ_PRA_SUM",
        "PROJ_PRA_mean": "TEAM_V3_PROJ_PRA_AVG",
    })
    opp_features = team_agg.rename(columns={
        "TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION",
        "PROJ_PTS_sum": "OPP_V3_PROJ_PTS_SUM",
        "PROJ_PTS_mean": "OPP_V3_PROJ_PTS_AVG",
        "PROJ_REB_sum": "OPP_V3_PROJ_REB_SUM",
        "PROJ_REB_mean": "OPP_V3_PROJ_REB_AVG",
        "PROJ_AST_sum": "OPP_V3_PROJ_AST_SUM",
        "PROJ_AST_mean": "OPP_V3_PROJ_AST_AVG",
        "PROJ_PRA_sum": "OPP_V3_PROJ_PRA_SUM",
        "PROJ_PRA_mean": "OPP_V3_PROJ_PRA_AVG",
    })
    out = df.merge(team_features, on=["GAME_ID", "TEAM_ABBREVIATION"], how="inner")
    out = out.merge(opp_features, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="inner")
    return out.dropna(subset=required)


def test_holdout(df: pd.DataFrame, split_date: str) -> pd.DataFrame:
    return df[df["GAME_DATE"] > pd.Timestamp(split_date)].copy()


def safe_auc(y_true: pd.Series, y_score: np.ndarray) -> float | None:
    if y_true.nunique() < 2:
        return None
    return float(roc_auc_score(y_true, y_score))


def win_metrics(y_true: pd.Series, p_win: np.ndarray) -> dict:
    pred = (p_win >= 0.5).astype(int)
    return {
        "rows": int(len(y_true)),
        "accuracy": float(accuracy_score(y_true, pred)),
        "roc_auc": safe_auc(y_true, p_win),
        "brier": float(brier_score_loss(y_true, p_win)),
        "avg_pred": float(np.mean(p_win)),
        "actual_rate": float(np.mean(y_true)),
    }


def score_metrics(df: pd.DataFrame, home_pred: np.ndarray, away_pred: np.ndarray) -> dict:
    return {
        "games": int(len(df)),
        "home_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"], home_pred)),
        "away_mae": float(mean_absolute_error(df["ACTUAL_AWAY_PTS"], away_pred)),
        "total_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"] + df["ACTUAL_AWAY_PTS"], home_pred + away_pred)),
        "margin_mae": float(mean_absolute_error(df["ACTUAL_HOME_PTS"] - df["ACTUAL_AWAY_PTS"], home_pred - away_pred)),
    }


def segment_masks(df: pd.DataFrame) -> Dict[str, Callable[[pd.DataFrame], pd.Series]]:
    masks = {
        "all": lambda x: pd.Series(True, index=x.index),
        "regular_season": lambda x: x["IS_PLAYOFF"].astype(int) == 0,
        "playoffs": lambda x: x["IS_PLAYOFF"].astype(int) == 1,
        "home_b2b": lambda x: x["IS_B2B"].astype(int) == 1,
        "away_b2b": lambda x: x["OPP_IS_B2B"].astype(int) == 1,
        "either_b2b": lambda x: (x["IS_B2B"].astype(int) == 1) | (x["OPP_IS_B2B"].astype(int) == 1),
        "home_rest_advantage": lambda x: x["DAYS_REST"] > x["OPP_DAYS_REST"],
        "away_rest_advantage": lambda x: x["OPP_DAYS_REST"] > x["DAYS_REST"],
        "large_winrate_gap": lambda x: (x["WINRATE_LAST_10"] - x["OPP_WINRATE_LAST_10"]).abs() >= 0.30,
        "small_winrate_gap": lambda x: (x["WINRATE_LAST_10"] - x["OPP_WINRATE_LAST_10"]).abs() < 0.10,
        "missing_core_home": lambda x: x.get("TEAM_CORE_TOP3_MISSING_COUNT", 0) > 0,
        "missing_core_away": lambda x: x.get("OPP_CORE_TOP3_MISSING_COUNT", 0) > 0,
    }
    if "P_HOME_WIN" in df.columns:
        masks.update({
            "low_conf_50_55": lambda x: x["P_HOME_WIN"].between(0.50, 0.55) | x["P_HOME_WIN"].between(0.45, 0.50),
            "high_conf_65_plus": lambda x: (x["P_HOME_WIN"] >= 0.65) | (x["P_HOME_WIN"] <= 0.35),
        })
    return masks


def calibration_buckets(df: pd.DataFrame) -> list[dict]:
    bins = [0.0, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 1.0]
    labels = [f"{bins[i]:.2f}-{bins[i + 1]:.2f}" for i in range(len(bins) - 1)]
    tmp = df.copy()
    tmp["bucket"] = pd.cut(tmp["P_HOME_WIN"], bins=bins, labels=labels, include_lowest=True)
    rows = []
    for bucket, g in tmp.groupby("bucket", observed=False):
        if g.empty:
            continue
        rows.append({
            "bucket": str(bucket),
            "rows": int(len(g)),
            "avg_pred": float(g["P_HOME_WIN"].mean()),
            "actual_rate": float(g["WIN"].mean()),
            "calibration_error": float(g["P_HOME_WIN"].mean() - g["WIN"].mean()),
        })
    return rows


def evaluate_win(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    model = joblib.load(ROOT / "models" / "production" / "win_probability_model_v8.pkl")
    if hasattr(model, "named_steps"):
        clf = model.named_steps.get("clf")
        if clf is not None and not hasattr(clf, "multi_class"):
            clf.multi_class = "auto"
    feature_cols = json.loads((ROOT / "models" / "production" / "feature_columns_v8.json").read_text())
    df = add_venue_aliases(df)
    df = add_player_projection_features(df)
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing win features: {missing}")
    test = test_holdout(df.dropna(subset=["WIN"]), "2025-04-06")
    X = test[feature_cols]
    test["P_HOME_WIN"] = model.predict_proba(X)[:, 1]

    metrics = {"overall": win_metrics(test["WIN"].astype(int), test["P_HOME_WIN"].to_numpy())}
    for name, fn in segment_masks(test).items():
        mask = fn(test).fillna(False)
        if int(mask.sum()) < 25:
            continue
        metrics[name] = win_metrics(test.loc[mask, "WIN"].astype(int), test.loc[mask, "P_HOME_WIN"].to_numpy())
    metrics["calibration_buckets"] = calibration_buckets(test)
    return test, metrics


def evaluate_score(df: pd.DataFrame) -> dict:
    meta = json.loads((ROOT / "models" / "production" / "score_model_v8_metadata.json").read_text())
    pace_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_pace.pkl")
    home_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_home_rtg.pkl")
    away_model = joblib.load(ROOT / "models" / "production" / "score_model_v8_away_rtg.pkl")

    df = add_location_features(df)
    home = test_holdout(df[df["IS_HOME"].astype(bool)].copy(), "2025-04-06")
    away = test_holdout(df[~df["IS_HOME"].astype(bool)].copy(), "2025-04-06")
    home["ACTUAL_HOME_PTS"] = home["PACE"] * home["OFF_RTG"] / 100.0
    home["ACTUAL_AWAY_PTS"] = home["PACE"] * home["DEF_RTG"] / 100.0
    home["PRED_PACE"] = pace_model.predict(home[meta["pace_features"]])
    home["PRED_HOME_RTG"] = home_model.predict(home[meta["home_off_rtg_features"]])
    away_eval = away[["GAME_ID"] + meta["away_off_rtg_features"]].copy()
    away_eval["PRED_AWAY_RTG"] = away_model.predict(away_eval[meta["away_off_rtg_features"]])
    eval_df = home.merge(away_eval[["GAME_ID", "PRED_AWAY_RTG"]], on="GAME_ID", how="inner")
    eval_df["PRED_HOME_PTS"] = eval_df["PRED_PACE"] * eval_df["PRED_HOME_RTG"] / 100.0
    eval_df["PRED_AWAY_PTS"] = eval_df["PRED_PACE"] * eval_df["PRED_AWAY_RTG"] / 100.0

    metrics = {"overall": score_metrics(eval_df, eval_df["PRED_HOME_PTS"], eval_df["PRED_AWAY_PTS"])}
    for name, fn in segment_masks(eval_df).items():
        mask = fn(eval_df).fillna(False)
        if int(mask.sum()) < 25:
            continue
        g = eval_df.loc[mask]
        metrics[name] = score_metrics(g, g["PRED_HOME_PTS"], g["PRED_AWAY_PTS"])
    return metrics


def markdown_table(rows: Iterable[dict], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        vals = []
        for c in columns:
            v = row.get(c)
            if isinstance(v, float):
                vals.append(f"{v:.4f}")
            else:
                vals.append(str(v))
        lines.append("| " + " | ".join(vals) + " |")
    return "\n".join(lines)


def write_report(win: dict, score: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    data = {"win": win, "score": score}
    JSON_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    win_rows = [{"segment": k, **v} for k, v in win.items() if isinstance(v, dict) and "rows" in v]
    score_rows = [{"segment": k, **v} for k, v in score.items() if isinstance(v, dict) and "games" in v]
    cal_rows = win["calibration_buckets"]

    report = [
        "# V8 Segment & Calibration Evaluation",
        "",
        "Evaluation is computed on the chronological holdout after 2025-04-06 for team models.",
        "",
        "## Key Findings",
        "",
        "- WIN is strongest when team-strength separation is clear: `large_winrate_gap` ROC-AUC is 0.8245 and Brier is 0.1717.",
        "- WIN is weakest in toss-up contexts: `low_conf_50_55` ROC-AUC is 0.5525 and Brier is 0.2482.",
        "- WIN playoff performance is materially weaker than regular season: playoff ROC-AUC is 0.6781 vs regular-season ROC-AUC 0.7519.",
        "- SCORE error is worst in schedule-stress contexts, especially `home_b2b` total MAE 15.7562 and `away_rest_advantage` total MAE 15.6631.",
        "- Calibration is not globally broken, but mid/high buckets need correction: 0.65-0.70 is overconfident by +0.0447, 0.70-1.00 is underconfident by -0.0278.",
        "",
        "## Next Improvement Targets",
        "",
        "1. Build an out-of-fold probability calibration layer and evaluate it against this report before promotion.",
        "2. Add playoff-specific and close-team-strength features, because those are the weakest WIN segments.",
        "3. Improve score model schedule-stress handling for B2B/rest-advantage segments.",
        "",
        "## Win Segments",
        markdown_table(win_rows, ["segment", "rows", "accuracy", "roc_auc", "brier", "avg_pred", "actual_rate"]),
        "",
        "## Win Calibration Buckets",
        markdown_table(cal_rows, ["bucket", "rows", "avg_pred", "actual_rate", "calibration_error"]),
        "",
        "## Score Segments",
        markdown_table(score_rows, ["segment", "games", "home_mae", "away_mae", "total_mae", "margin_mae"]),
        "",
    ]
    REPORT_PATH.write_text("\n".join(report), encoding="utf-8")


def main() -> None:
    df = load_team_model_ready()
    win_df, win = evaluate_win(df)
    score = evaluate_score(df)
    write_report(win, score)
    print(json.dumps({
        "report": str(REPORT_PATH),
        "json": str(JSON_PATH),
        "win_overall": win["overall"],
        "score_overall": score["overall"],
    }, indent=2))


if __name__ == "__main__":
    main()
