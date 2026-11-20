"""Grading of the per-game detail frozen in the paper ledger: shadow WIN candidates and PLAYER projections.

Both are read from the same pre-tip records as the production call, so they are prospective.
The PLAYER baseline is each player's EMA-10 over his earlier games (the walk-forward skill gate),
rebuilt here from the raw box scores so the ledger does not have to store it.
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

from src.core.data_paths import get_data_paths
from src.evaluation.bootstrap import paired_block_bootstrap

STATS = ("pts", "reb", "ast")
EMA_SPAN = 10


def shadow_summary(rows: list[dict]) -> dict[str, dict]:
    """Brier of every shadow candidate against production and Elo on the games that carry it."""
    by_name: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        for name in (r.get("shadow") or {}):
            by_name[name].append(r)
    out = {}
    for name, sub in sorted(by_name.items()):
        y = np.array([r["y"] for r in sub], dtype=float)
        ps = np.array([r["shadow"][name] for r in sub], dtype=float)
        pp = np.array([r["home_win_probability"] for r in sub], dtype=float)
        dates = np.array([r["game_date"] for r in sub])
        entry = {
            "games": len(sub),
            "shadow_brier": round(float(np.mean((ps - y) ** 2)), 4),
            "production_brier": round(float(np.mean((pp - y) ** 2)), 4),
            "shadow_accuracy": round(float(np.mean((ps >= 0.5) == (y == 1.0))), 4),
            "shadow_vs_production": paired_block_bootstrap((ps - y) ** 2 - (pp - y) ** 2, dates),
        }
        elo = [(r["elo_prob"], r["shadow"][name], r["y"], r["game_date"]) for r in sub if r.get("elo_prob") is not None]
        if elo:
            pe, pse, ye, de = (np.array(c) for c in zip(*elo))
            pe, pse, ye = pe.astype(float), pse.astype(float), ye.astype(float)
            entry["elo_brier"] = round(float(np.mean((pe - ye) ** 2)), 4)
            entry["shadow_vs_elo"] = paired_block_bootstrap((pse - ye) ** 2 - (pe - ye) ** 2, de)
        out[name] = entry
    return out


def _previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def player_actuals(season: str) -> pd.DataFrame:
    """Played box score lines of this and the previous season with the pregame EMA-10 of PTS/REB/AST."""
    frames = []
    for s in (_previous_season(season), season):
        path = Path(get_data_paths(s).player_games_raw)
        if path.exists():
            frames.append(pd.read_csv(path, dtype={"Game_ID": str},
                                      usecols=["Player_ID", "Game_ID", "GAME_DATE", "MIN", "PTS", "REB", "AST"]))
    if not frames:
        return pd.DataFrame()
    df = pd.concat(frames, ignore_index=True)
    df["Game_ID"] = df["Game_ID"].str.zfill(10)
    df = df[~df["Game_ID"].str.startswith("001")]
    for c in ("MIN", "PTS", "REB", "AST"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df[df["MIN"].fillna(0.0) > 0].drop_duplicates(["Player_ID", "Game_ID"])
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    df = df.sort_values(["Player_ID", "GAME_DATE", "Game_ID"], kind="stable")
    grp = df.groupby("Player_ID", sort=False)
    for c in ("PTS", "REB", "AST"):
        prior = grp[c].shift(1)
        df[f"{c}_EMA"] = prior.groupby(df["Player_ID"], sort=False).ewm(
            span=EMA_SPAN, min_periods=1).mean().reset_index(level=0, drop=True)
    return df


def player_summary(rows: list[dict], season: str) -> dict | None:
    """MAE of the frozen PLAYER projections against EMA-10, on players projected to play who did play."""
    rows = [r for r in rows if r.get("players")]
    if not rows:
        return None
    actual = player_actuals(season)
    if actual.empty:
        return None
    wanted = {r["game_id"] for r in rows}
    actual = actual[actual["Game_ID"].isin(wanted)]
    by_game: dict = {}
    cols = ["MIN", "PTS", "REB", "AST", "PTS_EMA", "REB_EMA", "AST_EMA"]
    for gid, pid, *vals in zip(actual["Game_ID"], actual["Player_ID"], *(actual[c] for c in cols)):
        by_game.setdefault(gid, {})[pid] = dict(zip(cols, vals))
    recs, projected_active, played_total, played_covered = [], 0, 0, 0
    for r in rows:
        box = by_game.get(r["game_id"])
        if box is None:
            continue
        played_total += len(box)
        for p in r["players"]:
            expected = p["status"] not in ("OUT", "DNP") and p["min"] > 0
            projected_active += int(expected)
            if p["id"] not in box:
                continue
            played_covered += 1
            if not expected:
                continue
            a = box[p["id"]]
            rec = {"date": r["game_date"], "min_err": abs(p["min"] - a["MIN"])}
            for s in STATS:
                rec[f"{s}_model"] = abs(p[s] - a[s.upper()])
                rec[f"{s}_base"] = abs(a[f"{s.upper()}_EMA"] - a[s.upper()])  # NaN without an earlier game
            rec["pts_raw"] = abs(p["raw_pts"] - a["PTS"])
            recs.append(rec)
    if not recs:
        return None
    df = pd.DataFrame(recs)
    out = {
        "games": len(rows),
        "rows": len(df),
        "projected_to_play": projected_active,
        "played_share_of_projected": round(len(df) / projected_active, 4) if projected_active else None,
        "box_score_players": played_total,
        "box_score_players_listed": round(played_covered / played_total, 4) if played_total else None,
        "minutes_mae": round(float(df["min_err"].mean()), 2),
        "raw_pts_mae": round(float(df["pts_raw"].mean()), 3),
        "stats": {},
    }
    for s in STATS:
        sub = df.dropna(subset=[f"{s}_base"])
        if sub.empty:
            out["stats"][s] = {"rows": 0, "model_mae": None, "ema10_mae": None, "model_vs_ema10": None}
            continue
        out["stats"][s] = {
            "rows": len(sub),
            "model_mae": round(float(sub[f"{s}_model"].mean()), 3),
            "ema10_mae": round(float(sub[f"{s}_base"].mean()), 3),
            "model_vs_ema10": paired_block_bootstrap((sub[f"{s}_model"] - sub[f"{s}_base"]).to_numpy(), sub["date"].to_numpy()),
        }
    return out
