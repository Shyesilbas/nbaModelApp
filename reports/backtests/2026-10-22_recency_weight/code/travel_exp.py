"""Travel / time-zone / altitude features added to the production WIN and SCORE inputs.

Per team-game (strictly pre-game): distance from the previous game's venue, signed time-zone shift
(east positive), consecutive road games, km travelled in the previous 7 days, visitor at altitude (DEN/UTA).
Game-level features are home minus away, plus the altitude flag.

Run: PYTHONPATH=. python3 reports/backtests/2026-10-22_recency_weight/code/travel_exp.py
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, mean_absolute_error

from scripts.walk_forward_benchmark import load_dataset
from src.features.schedule_density import NBA_TEAMS_LOCATIONS as LOC, haversine_km

ROOT = Path(__file__).resolve().parents[4]
spec = importlib.util.spec_from_file_location("rw", Path(__file__).with_name("recency_weight_exp.py"))
rw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rw)

ALT = {"DEN", "UTA"}


def team_travel(data: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for team, g in data.sort_values("GAME_DATE").groupby("TEAM_ABBREVIATION"):
        prev_loc, prev_date, streak = None, None, 0
        hist = []  # (date, km)
        for _, r in g.iterrows():
            venue = team if r["IS_HOME"] == 1 else str(r["OPPONENT_ABBREVIATION"]).upper()
            cur = LOC.get(venue)
            gap = (r["GAME_DATE"] - prev_date).days if prev_date is not None else 999
            if prev_loc is None or gap > 10 or cur is None:
                km, tz = 0.0, 0.0
            else:
                km = haversine_km(prev_loc["lat"], prev_loc["lon"], cur["lat"], cur["lon"])
                tz = cur["tz"] - prev_loc["tz"]
            streak = 0 if gap > 10 else streak
            streak = streak + 1 if r["IS_HOME"] == 0 else 0
            km7 = sum(k for d, k in hist if 0 < (r["GAME_DATE"] - d).days <= 7)
            rows.append((r["GAME_ID"], team, km, tz, streak, km7))
            hist.append((r["GAME_DATE"], km))
            if cur is not None:
                prev_loc = cur
            prev_date = r["GAME_DATE"]
    return pd.DataFrame(rows, columns=["GAME_ID", "TEAM_ABBREVIATION", "T_KM", "T_TZ", "T_STREAK", "T_KM7"])


def add_travel(data: pd.DataFrame) -> pd.DataFrame:
    t = team_travel(data)
    d = data.merge(t, on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")
    opp = t.rename(columns={"TEAM_ABBREVIATION": "OPPONENT_ABBREVIATION", **{c: "O" + c for c in t.columns[2:]}})
    d = d.merge(opp, on=["GAME_ID", "OPPONENT_ABBREVIATION"], how="left")
    d["TRAVEL_KM_DIFF"] = d["T_KM"] - d["OT_KM"]
    d["TZ_SHIFT_DIFF"] = d["T_TZ"] - d["OT_TZ"]
    d["ROAD_STREAK_DIFF"] = d["T_STREAK"] - d["OT_STREAK"]
    d["KM7_DIFF"] = d["T_KM7"] - d["OT_KM7"]
    visitor_at_alt = ((d["IS_HOME"] == 0) & d["OPPONENT_ABBREVIATION"].isin(ALT)).astype(int)
    d["ALT_VISITOR"] = np.where(d["IS_HOME"] == 1, d["OPPONENT_ABBREVIATION"].map(lambda x: 0) + d["TEAM_ABBREVIATION"].isin(ALT).astype(int), 0)
    d["ALT_VISITOR"] = d["TEAM_ABBREVIATION"].isin(ALT).astype(int).where(d["IS_HOME"] == 1, visitor_at_alt)
    return d


GROUPS = {
    "base": [],
    "+travel_km": ["TRAVEL_KM_DIFF", "KM7_DIFF"],
    "+tz": ["TZ_SHIFT_DIFF"],
    "+road_streak": ["ROAD_STREAK_DIFF"],
    "+altitude": ["ALT_VISITOR"],
    "+all": ["TRAVEL_KM_DIFF", "KM7_DIFF", "TZ_SHIFT_DIFF", "ROAD_STREAK_DIFF", "ALT_VISITOR"],
}


def main() -> None:
    data = add_travel(load_dataset())
    wf = [f for f in json.loads((ROOT / "models/production/win_features.json").read_text())
          if f in data.columns and f != "SCORE_PRED_MARGIN"]
    meta = json.loads((ROOT / "models/production/score_metadata.json").read_text())
    pace_f, home_f, away_f, margin_f = (meta["pace_features"], meta["home_off_rtg_features"],
                                        meta["away_off_rtg_features"], meta["margin_features"])
    seasons = sorted(data["_SEASON"].unique())
    rec = []
    for idx, ts in enumerate(seasons[1:], start=1):
        tr, te = data[data["_SEASON"].isin(seasons[:idx])], data[data["_SEASON"] == ts]
        for name, extra in GROUPS.items():
            feats = wf + extra
            trh = tr[tr["IS_HOME"] == 1].dropna(subset=feats + ["WIN"])
            teh = te[te["IS_HOME"] == 1].dropna(subset=feats + ["WIN"])
            p = rw.win_model().fit(trh[feats], trh["WIN"].astype(int)).predict_proba(teh[feats])[:, 1]
            sq = (p - teh["WIN"].astype(int).to_numpy()) ** 2
            for gid, v in zip(teh["GAME_ID"], sq):
                rec.append(("WIN", name, ts, gid, v))

            mf = margin_f + [c for c in extra if c in ("TRAVEL_KM_DIFF", "KM7_DIFF", "TZ_SHIFT_DIFF", "ROAD_STREAK_DIFF", "ALT_VISITOR")]
            pf = pace_f + [c for c in extra if c in ("ALT_VISITOR", "TRAVEL_KM_DIFF")]
            h, a = tr[tr["IS_HOME"] == 1].dropna(subset=mf + pf), tr[tr["IS_HOME"] == 0]
            ht, at = te[te["IS_HOME"] == 1].dropna(subset=mf + pf).copy(), te[te["IS_HOME"] == 0]
            ht["PP"] = rw.ridge().fit(h[pf], h["PACE"]).predict(ht[pf])
            ht["PH"] = rw.ridge().fit(h[home_f], h["OFF_RTG"]).predict(ht[home_f])
            ht["PM"] = rw.ridge().fit(h[mf], h["ACTUAL_PTS"] - h["ACTUAL_OPP_PTS"]).predict(ht[mf])
            asub = at[["GAME_ID"] + away_f].copy()
            asub["PA"] = rw.ridge().fit(a[away_f], a["OFF_RTG"]).predict(asub[away_f])
            mg = ht.merge(asub[["GAME_ID", "PA"]], on="GAME_ID").dropna(subset=["PP", "PH", "PM", "PA"])
            tot = mg["ACTUAL_PTS"] + mg["ACTUAL_OPP_PTS"]
            e_tot = (tot - mg["PP"] * (mg["PH"] + mg["PA"]) / 100).abs()
            e_mar = ((mg["ACTUAL_PTS"] - mg["ACTUAL_OPP_PTS"]) - mg["PM"]).abs()
            for gid, v in zip(mg["GAME_ID"], e_tot):
                rec.append(("SCORE total MAE", name, ts, gid, v))
            for gid, v in zip(mg["GAME_ID"], e_mar):
                rec.append(("SCORE margin MAE", name, ts, gid, v))
        print("done", ts, flush=True)

    df = pd.DataFrame(rec, columns=["metric", "variant", "season", "game", "err"])
    base = df[df.variant == "base"].set_index(["metric", "game"])["err"]
    print(f"{'metric':18s}{'variant':14s}{'value':>9s}{'vs base':>10s}{'paired se':>11s}")
    for (metric, var), g in df.groupby(["metric", "variant"], sort=False):
        s = g.set_index(["metric", "game"])["err"]
        diff = (s - base.reindex(s.index)).dropna()
        print(f"{metric:18s}{var:14s}{g['err'].mean():9.4f}{diff.mean():+10.4f}{diff.std() / np.sqrt(len(diff)):11.4f}")


if __name__ == "__main__":
    main()
