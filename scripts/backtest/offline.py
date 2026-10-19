"""Offline walk-forward backtest for the WIN, SCORE and PLAYER trainers.

For every test season the production trainers are fit only on earlier seasons,
then every test-season game is predicted and compared with the real result.
Per-game predictions are written next to the metrics so two runs can be
compared on exactly the same games (see ``scripts/backtest/compare.py``).

    python -m scripts.backtest.offline --out reports/backtests/<label> \
        --test-seasons 2023-24 2024-25 2025-26
"""
from __future__ import annotations

import argparse
import json
import shutil
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from src.processing.cleaning import regulation_team_minutes
from scripts.data_paths import get_data_paths
from scripts.season_utils import season_to_file_token
from src.training.player_trainer import PlayerModelTrainer
from src.training.score_trainer import ScoreModelTrainer
from src.training.win_trainer import WinModelTrainer

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parents[2]
FIRST_TRAIN_SEASON = "2020-21"
PLAYER_DATA = ROOT / "data/experimental/player_model_ready_v4_usg.csv"


def season_of(dates: pd.Series) -> pd.Series:
    dates = pd.to_datetime(dates)
    start = np.where(dates.dt.month >= 8, dates.dt.year, dates.dt.year - 1)
    return pd.Series([f"{y}-{str(y + 1)[-2:]}" for y in start], index=dates.index)


def team_files(seasons):
    files = [ROOT / "data/processed" / f"team_model_ready_v3_{season_to_file_token(s)}.csv" for s in seasons]
    missing = [str(f) for f in files if not f.exists()]
    if missing:
        raise FileNotFoundError(f"Missing team model-ready files: {missing}")
    return files


def real_scores(seasons) -> pd.DataFrame:
    frames = []
    for s in seasons:
        tf = pd.read_csv(get_data_paths(s).team_features, usecols=["GAME_ID", "TEAM_ABBREVIATION", "PTS", "MIN"], dtype={"GAME_ID": str})
        frames.append(tf)
    out = pd.concat(frames, ignore_index=True)
    out["GAME_ID"] = out["GAME_ID"].str.split(".").str[0].str.zfill(10)
    return out


def train_models(train_seasons, model_dir: Path):
    holdout = {"strategy": "chronological", "date_col": "GAME_DATE", "test_size": 0.2}
    files = team_files(train_seasons)
    ScoreModelTrainer(data_files=files, output_dir=model_dir, holdout_config=holdout).train_and_export()
    WinModelTrainer(data_files=files, output_dir=model_dir, score_models_dir=model_dir, holdout_config=holdout).train_and_export()

    player = pd.read_csv(PLAYER_DATA)
    player_train = player[season_of(player["GAME_DATE"]).isin(train_seasons)]
    player_path = model_dir / "player_train.csv"
    player_train.to_csv(player_path, index=False)
    PlayerModelTrainer(data_path=player_path, output_dir=model_dir, holdout_config=holdout).train_and_export()
    player_path.unlink()


def predict_win(seasons, test_season, model_dir: Path) -> pd.DataFrame:
    trainer = WinModelTrainer(data_files=team_files(seasons), output_dir=model_dir, score_models_dir=model_dir)
    df, _ = trainer.load_training_dataset(trainer.resolve_dataset_files())
    df = trainer.apply_score_prediction_enrichment(df)
    X, y, meta, _ = trainer.prepare_features(df)
    model = joblib.load(model_dir / "win_probability_model_v10.pkl")
    cols = json.loads((model_dir / "feature_columns_v10.json").read_text())
    mask = (season_of(meta["GAME_DATE"]) == test_season).to_numpy() & X["IS_HOME"].astype(bool).to_numpy()
    p = model.predict_proba(X.loc[mask, cols])[:, 1]
    return pd.DataFrame({
        "GAME_ID": meta.loc[mask, "GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10).to_numpy(),
        "GAME_DATE": pd.to_datetime(meta.loc[mask, "GAME_DATE"]).to_numpy(),
        "HOME": meta.loc[mask, "TEAM_ABBREVIATION"].to_numpy(),
        "AWAY": meta.loc[mask, "OPPONENT_ABBREVIATION"].to_numpy(),
        "P_HOME_WIN": p,
        "HOME_WIN": y[mask].to_numpy(),
    })


def predict_score(seasons, test_season, model_dir: Path) -> pd.DataFrame:
    trainer = ScoreModelTrainer(data_files=team_files(seasons), output_dir=model_dir)
    df, _ = trainer.load_training_dataset(trainer.resolve_dataset_files())
    df = trainer.prepare_frame(df)
    df = df[season_of(df["GAME_DATE"]) == test_season].copy()
    df["GAME_ID"] = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    meta = json.loads((model_dir / "score_model_v10_metadata.json").read_text())
    load = lambda name: joblib.load(model_dir / f"score_model_v10_{name}.pkl")
    home = df[df["IS_HOME"] == True].set_index("GAME_ID")
    away = df[df["IS_HOME"] == False].set_index("GAME_ID")
    games = home.index.intersection(away.index)
    home, away = home.loc[games], away.loc[games]

    pace = load("pace").predict(home[meta["pace_features"]])
    home_rtg = load("home_rtg").predict(home[meta["home_off_rtg_features"]])
    away_rtg = load("away_rtg").predict(away[meta["away_off_rtg_features"]])
    total = pace * (home_rtg + away_rtg) / 100.0
    margin = load("margin").predict(home[meta["margin_features"]])

    from scripts.generate_report import get_indicator_df
    ind = get_indicator_df(home)
    total = total - load("ridge_total").predict(ind)
    margin = margin - load("ridge_margin").predict(ind)

    pts = real_scores([test_season]).set_index(["GAME_ID", "TEAM_ABBREVIATION"])
    home_pts = pts.loc[list(zip(games, home["TEAM_ABBREVIATION"])), "PTS"].to_numpy()
    away_pts = pts.loc[list(zip(games, away["TEAM_ABBREVIATION"])), "PTS"].to_numpy()
    minutes = pts.loc[list(zip(games, home["TEAM_ABBREVIATION"])), "MIN"].to_numpy()
    return pd.DataFrame({
        "GAME_ID": games,
        "PRED_TOTAL": total,
        "PRED_MARGIN": margin,
        "REAL_TOTAL": home_pts + away_pts,
        "REAL_MARGIN": home_pts - away_pts,
        "OVERTIME": regulation_team_minutes(pd.Series(minutes)).to_numpy() > 240,
    })


def predict_player(test_season, model_dir: Path) -> pd.DataFrame:
    df = pd.read_csv(PLAYER_DATA)
    df = df[season_of(df["GAME_DATE"]) == test_season].copy()
    features = joblib.load(model_dir / "player_v9_features.pkl")
    out = pd.DataFrame({"GAME_ID": df["GAME_ID"].astype(str), "PLAYER_ID": df.get("Player_ID", df.get("PLAYER_ID"))})
    import importlib, sys
    sys.path.insert(0, str(ROOT / "ml-service"))
    ridge_frame = importlib.import_module("app.player_service")._ridge_calibration_frame
    ind = ridge_frame(df)
    X = df[features].apply(pd.to_numeric, errors="coerce")
    for target, short in [("TARGET_PTS", "pts"), ("TARGET_REB", "reb"), ("TARGET_AST", "ast")]:
        raw = joblib.load(model_dir / f"player_v9_lgb_{short}.pkl").predict(X)
        raw = raw - joblib.load(model_dir / f"player_v9_ridge_{short}.pkl").predict(ind)
        out[f"PRED_{short.upper()}"] = np.maximum(0.0, raw)
        out[f"REAL_{short.upper()}"] = df[target].to_numpy()
    return out


def win_metrics(df: pd.DataFrame) -> dict:
    from sklearn.metrics import brier_score_loss, log_loss, roc_auc_score
    p = df["P_HOME_WIN"].clip(1e-6, 1 - 1e-6)
    y = df["HOME_WIN"]
    return {
        "games": int(len(df)),
        "auc": round(float(roc_auc_score(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "log_loss": round(float(log_loss(y, p)), 4),
        "accuracy": round(float(((p >= 0.5) == (y == 1)).mean()), 4),
    }


def score_metrics(df: pd.DataFrame) -> dict:
    return {
        "games": int(len(df)),
        "total_mae": round(float((df["PRED_TOTAL"] - df["REAL_TOTAL"]).abs().mean()), 3),
        "margin_mae": round(float((df["PRED_MARGIN"] - df["REAL_MARGIN"]).abs().mean()), 3),
        "winner_accuracy": round(float((np.sign(df["PRED_MARGIN"]) == np.sign(df["REAL_MARGIN"])).mean()), 4),
    }


def player_metrics(df: pd.DataFrame) -> dict:
    out = {"rows": int(len(df))}
    for s in ["PTS", "REB", "AST"]:
        out[f"{s.lower()}_mae"] = round(float((df[f"PRED_{s}"] - df[f"REAL_{s}"]).abs().mean()), 4)
    return out


def run(out_dir: Path, test_seasons, keep_models: bool = False):
    out_dir.mkdir(parents=True, exist_ok=True)
    summary = {}
    for test in test_seasons:
        train = [s for s in _seasons_between(FIRST_TRAIN_SEASON, test) if s < test]
        model_dir = out_dir / "models" / test
        model_dir.mkdir(parents=True, exist_ok=True)
        print(f"[backtest] {test}: training on {train}", flush=True)
        train_models(train, model_dir)
        win = predict_win(train + [test], test, model_dir)
        score = predict_score(train + [test], test, model_dir)
        player = predict_player(test, model_dir)
        tok = season_to_file_token(test)
        win.to_parquet(out_dir / f"win_{tok}.parquet", index=False)
        score.to_parquet(out_dir / f"score_{tok}.parquet", index=False)
        player.to_parquet(out_dir / f"player_{tok}.parquet", index=False)
        summary[test] = {"win": win_metrics(win), "score": score_metrics(score), "player": player_metrics(player)}
        print(json.dumps({test: summary[test]}, indent=1), flush=True)
        if not keep_models:
            shutil.rmtree(model_dir)
    (out_dir / "metrics.json").write_text(json.dumps(summary, indent=2))
    return summary


def _seasons_between(first: str, last: str):
    a, b = int(first[:4]), int(last[:4])
    return [f"{y}-{str(y + 1)[-2:]}" for y in range(a, b + 1)]


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--test-seasons", nargs="+", default=["2023-24", "2024-25", "2025-26"])
    parser.add_argument("--keep-models", action="store_true")
    args = parser.parse_args()
    run(Path(args.out), args.test_seasons, keep_models=args.keep_models)
