"""Replay a finished season through the live prediction service.

Every game is predicted the way the API would have predicted it on the
morning of the game: features come from ``build_features`` with
``prediction_date`` set to the game date, and the WIN and SCORE responses come
from the service functions with whatever models are in ``models/production``.

    python -m scripts.backtest.live --season 2025-26 --out reports/backtests/<label>/live_2025_26.parquet
"""
from __future__ import annotations

import argparse
import sys
import warnings
from multiprocessing import Pool
from pathlib import Path

import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml-service"))


def _build(build_features, team, opponent, date, season):
    """Visiting-team features; older builders without ``team_is_home`` fall back to the flip."""
    import inspect
    if "team_is_home" in inspect.signature(build_features).parameters:
        return build_features(team, opponent, date, season=season, team_is_home=False)
    return build_features(team, opponent, date, season=season)


def _predict_game(game):
    import contextlib, io
    from app import service as svc
    from app.schemas import ScorePredictionRequest, WinProbRequest
    from app.services.score_prediction import predict_score
    from scripts.build_matchup_features import build_features

    gid, date, home, away, season = game
    row = {"GAME_ID": gid, "GAME_DATE": date, "HOME": home, "AWAY": away}
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            feats = build_features(home, away, date, season=season)
            away_feats = _build(build_features, away, home, date, season)
            win = svc.predict(WinProbRequest(home_team=home, away_team=away, prediction_date=date), features=feats)
            score = predict_score(
                ScorePredictionRequest(home_team=home, away_team=away, prediction_date=date),
                features=feats, away_features=away_feats, win_response=win,
            )
        row.update({
            "P_HOME_WIN": win.home_win_probability,
            "PRED_HOME": score.predicted_home_score,
            "PRED_AWAY": score.predicted_away_score,
            "ELO_BLEND_WEIGHT": float(feats.get("EARLY_SEASON_ELO_BLEND_WEIGHT", 0.0)),
            "SCORE_PRED_MARGIN": feats.get("SCORE_PRED_MARGIN"),
        })
    except Exception as exc:  # a failed game is a result too: the API would have errored
        row["ERROR"] = str(exc)[:200]
    return row


def run(season: str, out: Path, workers: int = 4, limit: int | None = None):
    from scripts.data_paths import get_data_paths

    games = pd.read_csv(get_data_paths(season).game_results, dtype={"GAME_ID": str})
    games = games[~games["SEASON_TYPE"].astype(str).str.lower().str.contains("pre")]
    games = games.dropna(subset=["HOME_SCORE", "AWAY_SCORE"]).sort_values("GAME_DATE")
    if limit:
        games = games.head(limit)
    jobs = [
        (str(r.GAME_ID).zfill(10), str(r.GAME_DATE)[:10], r.HOME_TEAM_ABBREVIATION, r.AWAY_TEAM_ABBREVIATION, season)
        for r in games.itertuples()
    ]
    with Pool(workers) as pool:
        rows = pool.map(_predict_game, jobs, chunksize=8)
    res = pd.DataFrame(rows).merge(
        games.assign(GAME_ID=games["GAME_ID"].str.zfill(10))[["GAME_ID", "HOME_SCORE", "AWAY_SCORE", "SEASON_TYPE"]],
        on="GAME_ID", how="left",
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    res.to_parquet(out, index=False)
    return res


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default="2025-26")
    parser.add_argument("--out", required=True)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    run(args.season, Path(args.out), args.workers, args.limit)
