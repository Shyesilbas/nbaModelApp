"""Paper trading ledger: what the model predicted before tip-off versus what happened.

One frozen record per game (first write wins, never rewritten), stored per season as
JSONL under data/predictions/. Grading joins the ledger with finished games from
the season's raw team_games.csv at read time, so the ledger holds predictions only.
"""
from __future__ import annotations

import json
import logging
import math
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from src.core.data_paths import ROOT, get_data_paths
from src.core.season_utils import normalize_season, season_to_file_token

logger = logging.getLogger(__name__)

LEDGER_DIR = ROOT / "data" / "predictions"
COUNTED_SEASON_TYPES = ("Regular Season", "Playoffs", "PlayIn", "Play-In")
CONFIDENCE_BANDS = ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01))


def ledger_path(season: str, ledger_dir: Path = LEDGER_DIR) -> Path:
    token = season_to_file_token(normalize_season(season))
    return ledger_dir / f"paper_ledger_{token}.jsonl"


REMOTE_REF = "origin/main"
FETCH_INTERVAL_SECONDS = 60
_fetch_lock = threading.Lock()
_last_fetch = 0.0


def _remote_ledger_lines(season: str) -> Optional[List[str]]:
    """The cloud-owned ledger as committed on origin/main, so the page shows fresh snapshots without a pull.

    Fetches at most once a minute; returns None when git or the network is unavailable or the file
    is not on the remote yet, and the caller falls back to the local copy.
    """
    global _last_fetch
    rel = ledger_path(season).relative_to(ROOT).as_posix()
    try:
        with _fetch_lock:
            if time.time() - _last_fetch > FETCH_INTERVAL_SECONDS:
                subprocess.run(["git", "fetch", "--quiet", "origin", "main"], cwd=ROOT, check=True, timeout=20,
                               capture_output=True)
                _last_fetch = time.time()
        shown = subprocess.run(["git", "show", f"{REMOTE_REF}:{rel}"], cwd=ROOT, check=True, timeout=10,
                               capture_output=True, text=True)
        return shown.stdout.splitlines()
    except Exception as exc:
        logger.info("Remote ledger unavailable, using the local file: %s", exc)
        return None


def read_ledger(season: str, ledger_dir: Path = LEDGER_DIR, prefer_remote: bool = False) -> List[Dict[str, Any]]:
    lines = _remote_ledger_lines(season) if prefer_remote else None
    if lines is None:
        path = ledger_path(season, ledger_dir)
        if not path.exists():
            return []
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    return [json.loads(line) for line in (l.strip() for l in lines) if line]


def append_records(season: str, records: Iterable[Dict[str, Any]], ledger_dir: Path = LEDGER_DIR) -> int:
    """Append records for games not yet in the ledger. Returns how many were written."""
    existing = {r["game_id"] for r in read_ledger(season, ledger_dir)}
    fresh = []
    for rec in records:
        if rec["game_id"] in existing:
            continue
        existing.add(rec["game_id"])
        fresh.append(rec)
    if not fresh:
        return 0
    path = ledger_path(season, ledger_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        for rec in fresh:
            f.write(json.dumps(rec) + "\n")
    return len(fresh)


def build_record(
    game_id: str,
    game_date: str,
    start_utc: str,
    home_team: str,
    away_team: str,
    model_version: str,
    home_win_probability: float,
    predicted_home_score: float,
    predicted_away_score: float,
    now: Optional[datetime] = None,
    origin: str = "live",
    injury_report: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    p = float(home_win_probability)
    record = {
        "game_id": str(game_id).zfill(10),
        "game_date": str(game_date),
        "start_utc": str(start_utc),
        "created_utc": (now or datetime.now(timezone.utc)).isoformat(),
        "home_team": home_team,
        "away_team": away_team,
        "model_version": model_version,
        "origin": origin,
        "home_win_probability": round(p, 4),
        "predicted_winner": home_team if p >= 0.5 else away_team,
        "predicted_home_score": round(float(predicted_home_score), 1),
        "predicted_away_score": round(float(predicted_away_score), 1),
    }
    if injury_report is not None:
        # Official injury report the prediction was made with (published time, who filed, players listed).
        record["injury_report"] = injury_report
    return record


def load_results(season: str) -> Dict[str, Dict[str, Any]]:
    """Finished games keyed by zero-padded GAME_ID with home/away teams and points."""
    path = Path(get_data_paths(season).team_games_raw)
    if not path.exists():
        return {}
    df = pd.read_csv(path, dtype={"GAME_ID": str})
    df = df[df["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)].dropna(subset=["PTS"])
    results: Dict[str, Dict[str, Any]] = {}
    for gid, grp in df.groupby("GAME_ID"):
        home = grp[grp["MATCHUP"].str.contains("vs.", regex=False)]
        away = grp[grp["MATCHUP"].str.contains("@", regex=False)]
        if len(home) != 1 or len(away) != 1:
            continue
        results[str(gid).zfill(10)] = {
            "home_team": home.iloc[0]["TEAM_ABBREVIATION"],
            "away_team": away.iloc[0]["TEAM_ABBREVIATION"],
            "home_score": int(home.iloc[0]["PTS"]),
            "away_score": int(away.iloc[0]["PTS"]),
        }
    return results


def grade(
    records: List[Dict[str, Any]],
    results: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Attach the outcome to each record. A record made after tip-off is flagged and never counted."""
    graded = []
    for rec in records:
        row = dict(rec)
        row["origin"] = rec.get("origin", "live")
        # Backfill records are as-of re-predictions (features use only earlier games), not frozen calls.
        row["valid"] = row["origin"] == "backfill" or rec["created_utc"] < rec["start_utc"].replace("Z", "+00:00")
        res = results.get(rec["game_id"])
        row["status"] = "final" if res else "pending"
        if res:
            hs, as_ = res["home_score"], res["away_score"]
            winner = res["home_team"] if hs > as_ else res["away_team"]
            row.update(
                actual_home_score=hs,
                actual_away_score=as_,
                actual_winner=winner,
                correct=winner == rec["predicted_winner"],
                predicted_margin=round(rec["predicted_home_score"] - rec["predicted_away_score"], 1),
                actual_margin=hs - as_,
                predicted_total=round(rec["predicted_home_score"] + rec["predicted_away_score"], 1),
                actual_total=hs + as_,
            )
        graded.append(row)
    return graded


def summarize(graded: List[Dict[str, Any]]) -> Dict[str, Any]:
    done = [g for g in graded if g["status"] == "final" and g["valid"]]
    summary: Dict[str, Any] = {
        "games_logged": len(graded),
        "games_pending": sum(1 for g in graded if g["status"] == "pending"),
        "games_graded": len(done),
        "backfilled_graded": sum(1 for g in done if g["origin"] == "backfill"),
        "invalid_late": sum(1 for g in graded if not g["valid"]),
    }
    if not done:
        return {**summary, "accuracy": None, "brier": None, "log_loss": None, "home_baseline_accuracy": None,
                "mae_margin": None, "mae_total": None, "bands": []}

    n = len(done)
    brier = log_loss = 0.0
    home_wins = 0
    for g in done:
        p = g["home_win_probability"]
        y = 1.0 if g["actual_winner"] == g["home_team"] else 0.0
        home_wins += int(y)
        brier += (p - y) ** 2
        pc = min(max(p, 1e-6), 1 - 1e-6)
        log_loss -= y * math.log(pc) + (1 - y) * math.log(1 - pc)

    bands = []
    for lo, hi in CONFIDENCE_BANDS:
        sub = [g for g in done if lo <= max(g["home_win_probability"], 1 - g["home_win_probability"]) < hi]
        if sub:
            bands.append({
                "label": f"{round(lo * 100)}-{min(round(hi * 100), 100)}%",
                "games": len(sub),
                "accuracy": round(sum(g["correct"] for g in sub) / len(sub), 4),
                "mean_confidence": round(sum(max(g["home_win_probability"], 1 - g["home_win_probability"]) for g in sub) / len(sub), 4),
            })

    return {
        **summary,
        "accuracy": round(sum(g["correct"] for g in done) / n, 4),
        "brier": round(brier / n, 4),
        "log_loss": round(log_loss / n, 4),
        "home_baseline_accuracy": round(home_wins / n, 4),
        "mae_margin": round(sum(abs(g["predicted_margin"] - g["actual_margin"]) for g in done) / n, 2),
        "mae_total": round(sum(abs(g["predicted_total"] - g["actual_total"]) for g in done) / n, 2),
        "bands": bands,
    }


def paper_trading_report(season: str) -> Dict[str, Any]:
    season = normalize_season(season)
    graded = grade(read_ledger(season, prefer_remote=True), load_results(season))
    graded.sort(key=lambda g: (g["game_date"], g["start_utc"], g["game_id"]), reverse=True)
    return {"season": season, "summary": summarize(graded), "games": graded}
