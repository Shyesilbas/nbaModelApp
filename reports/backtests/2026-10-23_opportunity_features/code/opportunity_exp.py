"""Box score opportunity features for PLAYER REB/AST/PTS, walk-forward against the production 21 features.

Rebound and assist counts depend on how many chances the game offers. Per player-game we compute
REB per available rebound (own + opponent misses, scaled by minutes/48), AST per teammate made field goal and
shot-use per team shot, take pre-game EMA-10 of those rates, and multiply by the pre-game expected game
environment (rolling team and opponent misses / makes / shots). No API calls, all seasons.
Usage: PYTHONPATH=. python3 reports/backtests/2026-10-23_opportunity_features/code/opportunity_exp.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from scripts.walk_forward_benchmark import SEASONS
from src.core.data_paths import get_data_paths
from src.training.player_trainer import PlayerModelTrainer

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
NEW = ["REB_RATE_EMA10", "AST_RATE_EMA10", "SHOT_USE_EMA10", "EXP_REB_OPP", "EXP_AST_OPP", "EXP_SHOT_OPP",
       "EXP_REB_RATE", "EXP_AST_RATE", "EXP_SHOT_RATE"]


def team_env() -> pd.DataFrame:
    frames = []
    for s in SEASONS:
        t = pd.read_csv(get_data_paths(s).team_games_raw, dtype={"GAME_ID": str})
        frames.append(t[["GAME_ID", "GAME_DATE", "TEAM_ABBREVIATION", "MATCHUP", "FGM", "FGA", "FTA"]])
    t = pd.concat(frames, ignore_index=True)
    t["GAME_ID"] = t["GAME_ID"].str.zfill(10)
    t["GAME_DATE"] = pd.to_datetime(t["GAME_DATE"])
    o = t[["GAME_ID", "TEAM_ABBREVIATION", "FGM", "FGA", "FTA"]].rename(
        columns={"TEAM_ABBREVIATION": "OPP", "FGM": "O_FGM", "FGA": "O_FGA", "FTA": "O_FTA"})
    t["OPP"] = t["MATCHUP"].str.split().str[-1]
    t = t.merge(o, on=["GAME_ID", "OPP"], how="left")
    t["MISSES"] = (t["FGA"] - t["FGM"]) + (t["O_FGA"] - t["O_FGM"])
    t["SHOTS"] = t["FGA"] + 0.44 * t["FTA"]
    t = t.sort_values(["TEAM_ABBREVIATION", "GAME_DATE", "GAME_ID"])
    for c in ("MISSES", "FGM", "SHOTS"):
        t[f"R_{c}"] = t.groupby("TEAM_ABBREVIATION")[c].transform(lambda x: x.shift(1).rolling(10, min_periods=3).mean())
    return t[["GAME_ID", "TEAM_ABBREVIATION", "OPP", "MISSES", "FGM", "SHOTS", "R_MISSES", "R_FGM", "R_SHOTS"]]


def player_rates() -> pd.DataFrame:
    frames = [pd.read_csv(get_data_paths(s).player_games_raw, dtype={"Game_ID": str}) for s in SEASONS]
    p = pd.concat(frames, ignore_index=True)
    p["GAME_ID"] = p["Game_ID"].str.zfill(10)
    p["GAME_DATE"] = pd.to_datetime(p["GAME_DATE"])
    p["TEAM_ABBREVIATION"] = p["MATCHUP"].str.split().str[0]
    p["MIN"] = pd.to_numeric(p["MIN"], errors="coerce")
    p = p[p["MIN"] > 0].merge(team_env()[["GAME_ID", "TEAM_ABBREVIATION", "MISSES", "FGM", "SHOTS"]].rename(
        columns={"FGM": "T_FGM"}), on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    share = p["MIN"] / 48.0
    p["REB_RATE"] = p["REB"] / (p["MISSES"] * share)
    p["AST_RATE"] = p["AST"] / ((p["T_FGM"] - p["FGM"]).clip(lower=1) * share)
    p["SHOT_USE"] = (p["FGA"] + 0.44 * p["FTA"]) / (p["SHOTS"] * share)
    p = p.sort_values(["Player_ID", "GAME_DATE", "GAME_ID"])
    for src, dst in (("REB_RATE", "REB_RATE_EMA10"), ("AST_RATE", "AST_RATE_EMA10"), ("SHOT_USE", "SHOT_USE_EMA10")):
        p[dst] = p.groupby("Player_ID")[src].transform(lambda x: x.shift(1).ewm(span=10, min_periods=3).mean())
    return p[["GAME_ID", "Player_ID", "REB_RATE_EMA10", "AST_RATE_EMA10", "SHOT_USE_EMA10"]]


def load_players(feats: list[str]) -> pd.DataFrame:
    """Same rows and derived columns as the walk-forward loader, plus the join keys."""
    from src.features.player_form import add_player_matchup_features
    keep = {"SEASON_ID", "GAME_ID", "Player_ID", "GAME_DATE", "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "MIN_EMA_10",
            "TARGET_PTS", "TARGET_REB", "TARGET_AST", "PLAYER_POSITION_GROUP", "PTS_EMA_10", "REB_EMA_10", "AST_EMA_10"} | set(feats)
    d = pd.read_csv(ROOT / "data/training/player_model_ready.csv", usecols=lambda c: c in keep or "_ALLOWED_LAST_10" in c)
    d = add_player_matchup_features(d)
    d["GAME_ID"] = d["GAME_ID"].astype(str).str.zfill(10)
    d["_SEASON"] = d["SEASON_ID"].astype(str).str[-4:].astype(int).map(lambda y: f"{y}-{str(y + 1)[-2:]}")
    d["GAME_DATE"] = pd.to_datetime(d["GAME_DATE"], errors="coerce")
    return d.dropna(subset=["_SEASON", "GAME_DATE"]).reset_index(drop=True)


def main() -> int:
    feats = joblib.load(ROOT / "models/production/player_features.pkl")
    d = load_players(feats)
    d = d.merge(player_rates(), on=["GAME_ID", "Player_ID"], how="left")
    env = team_env()
    mine = env[["GAME_ID", "TEAM_ABBREVIATION", "R_MISSES", "R_FGM", "R_SHOTS"]]
    opp = env.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", "R_MISSES": "O_R_MISSES",
                              "R_FGM": "O_R_FGM", "R_SHOTS": "O_R_SHOTS"})[
        ["GAME_ID", "OPPONENT_ABBREVIATION", "O_R_MISSES", "O_R_FGM", "O_R_SHOTS"]]
    d = d.merge(mine, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left").merge(opp, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="left")
    share = d["MIN_EMA_10"] / 48.0
    d["EXP_REB_OPP"] = (d["R_MISSES"] + d["O_R_MISSES"]) / 2 * share
    d["EXP_AST_OPP"] = (d["R_FGM"] + d["O_R_FGM"]) / 2 * share
    d["EXP_SHOT_OPP"] = (d["R_SHOTS"] + d["O_R_SHOTS"]) / 2 * share
    d["EXP_REB_RATE"] = d["EXP_REB_OPP"] * d["REB_RATE_EMA10"]
    d["EXP_AST_RATE"] = d["EXP_AST_OPP"] * d["AST_RATE_EMA10"]
    d["EXP_SHOT_RATE"] = d["EXP_SHOT_OPP"] * d["SHOT_USE_EMA10"]
    print(f"rows {len(d)}, new feature coverage {d[NEW].notna().mean().round(3).to_dict()}", flush=True)

    rng = np.random.default_rng(0)
    results, rows = {}, []
    seasons = sorted(d["_SEASON"].unique())
    for idx, test in enumerate(seasons[1:], start=1):
        tr_d, te_d = d[d["_SEASON"].isin(seasons[:idx])], d[d["_SEASON"] == test]
        for tgt in ("pts", "reb", "ast"):
            col, basecol = f"TARGET_{tgt.upper()}", f"{tgt.upper()}_EMA_10"
            tr, te = tr_d.dropna(subset=[col]), te_d.dropna(subset=[col, basecol])
            errs = {}
            for name, fs in (("prod", feats), ("opp", feats + NEW)):
                m = PlayerModelTrainer()._model_pipeline(tgt)
                m.fit(tr[fs], tr[col])
                errs[name] = np.abs(te[col].values - m.predict(te[fs]))
            diff = errs["prod"] - errs["opp"]  # positive = new features better
            rows.append({"season": test, "target": tgt, "n": len(te), "prod_mae": errs["prod"].mean(),
                         "opp_mae": errs["opp"].mean(), "gain": diff.mean(), "diff": diff})
            print(f"{test} {tgt}: prod {errs['prod'].mean():.4f} opp {errs['opp'].mean():.4f} gain {diff.mean():+.4f}", flush=True)
    lines = ["| target | prod MAE | +opportunity MAE | gain | 95% CI | seasons better |", "|---|---|---|---|---|---|"]
    for tgt in ("pts", "reb", "ast"):
        r = [x for x in rows if x["target"] == tgt]
        n = sum(x["n"] for x in r)
        diff = np.concatenate([x["diff"] for x in r])
        boot = [rng.choice(diff, size=len(diff)).mean() for _ in range(500)]
        lo, hi = np.percentile(boot, [2.5, 97.5])
        pm = sum(x["prod_mae"] * x["n"] for x in r) / n
        om = sum(x["opp_mae"] * x["n"] for x in r) / n
        better = sum(x["gain"] > 0 for x in r)
        lines.append(f"| {tgt.upper()} | {pm:.4f} | {om:.4f} | {diff.mean():+.4f} | [{lo:+.4f}, {hi:+.4f}] | {better}/{len(r)} |")
    (OUT / "results.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
