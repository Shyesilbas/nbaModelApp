"""Paper trading ledger: what the model predicted before tip-off versus what happened.

One frozen record per game (first write wins, never rewritten), stored per season as
JSONL under data/predictions/. Grading joins the ledger with finished games from
the season's raw team_games.csv at read time, so the ledger holds predictions only.
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import pandas as pd

from src.core.data_paths import ROOT, get_data_paths
from src.core.season_utils import normalize_season, season_to_file_token
from src.ingestion.sportsgameodds import total_window

logger = logging.getLogger(__name__)

LEDGER_DIR = ROOT / "data" / "predictions"
COUNTED_SEASON_TYPES = ("Regular Season", "Playoffs", "PlayIn", "Play-In")
CONFIDENCE_BANDS = ((0.5, 0.6), (0.6, 0.7), (0.7, 0.8), (0.8, 1.01))


def ledger_path(season: str, ledger_dir: Path = LEDGER_DIR) -> Path:
    token = season_to_file_token(normalize_season(season))
    return ledger_dir / f"paper_ledger_{token}.jsonl"


def read_ledger(season: str, ledger_dir: Path = LEDGER_DIR) -> List[Dict[str, Any]]:
    path = ledger_path(season, ledger_dir)
    if not path.exists():
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


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
    total_line: Optional[float] = None,
    total_window_rungs: Optional[List[Dict[str, Any]]] = None,
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
    if total_line is not None and total_window_rungs:
        # Market total line and its two rungs either side, frozen with the prediction.
        record["total_line"] = total_line
        record["total_window"] = total_window_rungs
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


def american_to_prob(odds: float) -> float:
    return 100.0 / (odds + 100.0) if odds > 0 else -odds / (-odds + 100.0)


def load_closing_odds(season: str) -> Dict[str, Dict[str, Any]]:
    """Closing moneylines by GAME_ID, written by scripts/ingest/fetch_closing_odds.py."""
    path = Path(get_data_paths(season).team_games_raw).parent / "closing_odds.csv"
    if not path.exists():
        return {}
    df = pd.read_csv(path, dtype={"game_id": str})
    ladders: Dict[str, Dict[float, Dict[str, int]]] = {}
    ladder_file = path.with_name("closing_total_ladder.csv")
    if ladder_file.exists():
        for lr in pd.read_csv(ladder_file, dtype={"game_id": str}).itertuples():
            rung = ladders.setdefault(str(lr.game_id).zfill(10), {}).setdefault(float(lr.line), {})
            if pd.notna(lr.over_odds):
                rung["over"] = int(lr.over_odds)
            if pd.notna(lr.under_odds):
                rung["under"] = int(lr.under_odds)
    odds: Dict[str, Dict[str, Any]] = {}
    for r in df.itertuples():
        home_raw, away_raw = american_to_prob(r.home_ml_close), american_to_prob(r.away_ml_close)
        entry = {
            "home_ml_close": int(r.home_ml_close),
            "away_ml_close": int(r.away_ml_close),
            # Vig removed by normalizing the two implied probabilities.
            "market_home_probability": round(home_raw / (home_raw + away_raw), 4),
        }
        if "total_line_close" in df.columns and pd.notna(r.total_line_close):
            entry.update(
                total_line_close=float(r.total_line_close),
                over_odds_close=int(r.over_odds_close),
                under_odds_close=int(r.under_odds_close),
            )
            entry["total_window"] = total_window(entry["total_line_close"], ladders.get(str(r.game_id).zfill(10), {}))
        odds[str(r.game_id).zfill(10)] = entry
    return odds


def _total_outcome(row: Dict[str, Any]) -> Dict[str, Any]:
    """Over/under grading against the model's own total and against the closing line.

    The reference line is the one frozen with the prediction when the ledger has it, else the
    closing line. The model leans Over when its total is above that line, Under when below. For
    an Over lean `total_lean_hit` is true when the model total and the final total both clear the
    lowest rung of the window (two rungs under the line); for an Under lean, when both stay under
    the highest rung (two rungs over). `line_bet_won` is the plain bet result at the line.
    """
    line = row.get("total_line_ref")
    if line is None:
        return {}
    pred, actual = row["predicted_total"], row["actual_total"]
    lean = "over" if pred > line else "under" if pred < line else None
    line_result = "over" if actual > line else "under" if actual < line else "push"
    out: Dict[str, Any] = {"total_lean": lean, "total_line_result": line_result,
                           "total_lean_hit": None, "line_bet_won": None}
    window = row.get("total_window")
    if lean and window:
        if lean == "over":
            low = window[0]["line"]
            out["total_lean_hit"] = pred > low and actual > low
        else:
            high = window[-1]["line"]
            out["total_lean_hit"] = pred < high and actual < high
    if lean:
        out["line_bet_won"] = None if line_result == "push" else lean == line_result
    return out


def grade(
    records: List[Dict[str, Any]],
    results: Dict[str, Dict[str, Any]],
    odds: Optional[Dict[str, Dict[str, Any]]] = None,
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
        row.update((odds or {}).get(rec["game_id"], {}))
        if rec.get("total_window"):
            row["total_line_ref"], row["total_window"], row["total_line_source"] = rec["total_line"], rec["total_window"], "snapshot"
        elif row.get("total_line_close") is not None:
            row["total_line_ref"], row["total_line_source"] = row["total_line_close"], "closing"
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
            row.update(_total_outcome(row))
        graded.append(row)
    return graded


def _market_comparison(done: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Model versus the no-vig closing line on the graded games that have odds."""
    rows = [g for g in done if g.get("market_home_probability") is not None]
    out: Dict[str, Any] = {"games_with_odds": len(rows), "market_accuracy": None, "market_brier": None,
                           "market_log_loss": None, "model_accuracy_on_odds": None, "model_brier_on_odds": None,
                           "model_log_loss_on_odds": None}
    if not rows:
        return out

    def scores(prob_of):
        brier = ll = hits = 0.0
        for g in rows:
            p = min(max(prob_of(g), 1e-6), 1 - 1e-6)
            y = 1.0 if g["actual_winner"] == g["home_team"] else 0.0
            brier += (p - y) ** 2
            ll -= y * math.log(p) + (1 - y) * math.log(1 - p)
            hits += (p >= 0.5) == (y == 1.0)
        n = len(rows)
        return round(hits / n, 4), round(brier / n, 4), round(ll / n, 4)

    out["market_accuracy"], out["market_brier"], out["market_log_loss"] = scores(lambda g: g["market_home_probability"])
    out["model_accuracy_on_odds"], out["model_brier_on_odds"], out["model_log_loss_on_odds"] = scores(
        lambda g: g["home_win_probability"]
    )
    return out


def _totals_comparison(done: List[Dict[str, Any]]) -> Dict[str, Any]:
    rows = [g for g in done if g.get("total_line_ref") is not None]
    leaned = [g for g in rows if g["total_lean"]]
    bets = [g for g in leaned if g["line_bet_won"] is not None]
    out: Dict[str, Any] = {"games_with_total": len(rows), "total_leans": len(leaned), "total_lean_hit_rate": None,
                           "line_bets": len(bets), "line_bet_win_rate": None,
                           "market_mae_total": None, "model_mae_total_on_line": None}
    if leaned:
        out["total_lean_hit_rate"] = round(sum(g["total_lean_hit"] for g in leaned) / len(leaned), 4)
    if bets:
        out["line_bet_win_rate"] = round(sum(g["line_bet_won"] for g in bets) / len(bets), 4)
    if rows:
        out["market_mae_total"] = round(sum(abs(g["total_line_ref"] - g["actual_total"]) for g in rows) / len(rows), 2)
        out["model_mae_total_on_line"] = round(sum(abs(g["predicted_total"] - g["actual_total"]) for g in rows) / len(rows), 2)
    return out


def summarize(graded: List[Dict[str, Any]]) -> Dict[str, Any]:
    done = [g for g in graded if g["status"] == "final" and g["valid"]]
    summary: Dict[str, Any] = {
        "games_logged": len(graded),
        "games_pending": sum(1 for g in graded if g["status"] == "pending"),
        "games_graded": len(done),
        "backfilled_graded": sum(1 for g in done if g["origin"] == "backfill"),
        "invalid_late": sum(1 for g in graded if not g["valid"]),
    }
    summary.update(_market_comparison(done))
    summary.update(_totals_comparison(done))
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
    graded = grade(read_ledger(season), load_results(season), load_closing_odds(season))
    graded.sort(key=lambda g: (g["game_date"], g["start_utc"], g["game_id"]), reverse=True)
    return {"season": season, "summary": summarize(graded), "games": graded}
