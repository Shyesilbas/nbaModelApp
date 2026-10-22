#!/usr/bin/env python3
"""Freeze pre-game WIN and SCORE predictions into the paper trading ledger.

Run after `main.py --update-data` and before tip-off. Games already in the ledger
are never rewritten and games that have started are skipped, so each record is a
true pre-game call. Uses the production models; trains nothing.
"""
import argparse
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api.schemas import ScorePredictionRequest, WinProbRequest
from src.api.services import paper_trading as pt
from src.api.services import win_prediction
from src.api.services.score_prediction import predict_score
from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.features.build_matchup_features import build_features
from src.ingestion import nba_injury_report as inj
from src.ingestion.sportsgameodds import TOTAL_OVER, fetch_events, get_api_key, to_float, total_ladder, total_window


def fetch_total_lines(first_day: str, last_day: str) -> dict:
    """Current market total line and rung window per (home, away) for upcoming games.

    Needs SPORTSGAMEODDS_API_KEY; without it (or on an API error) the records are
    written without totals, exactly as before.
    """
    api_key = get_api_key()
    if not api_key:
        print("SPORTSGAMEODDS_API_KEY not set (env or .env): total lines are not frozen")
        return {}
    start = f"{first_day}T00:00:00Z"
    end = (pd.Timestamp(last_day) + pd.Timedelta(days=2)).strftime("%Y-%m-%dT00:00:00Z")
    lines = {}
    try:
        for ev in fetch_events(api_key, startsAfter=start, startsBefore=end, finalized="false"):
            main = to_float(ev.get("odds", {}).get(TOTAL_OVER, {}).get("bookOverUnder"))
            if main is None:
                continue
            names = ev["teams"]
            key = (names["home"]["names"]["short"], names["away"]["names"]["short"])
            lines[key] = (main, total_window(main, total_ladder(ev)))
    except Exception as exc:
        print(f"total lines unavailable: {exc}")
    return lines


def fetch_injuries(season: str):
    """Latest official injury report published today (Eastern), or None when unavailable."""
    try:
        report = inj.fetch_report(season, datetime.now(inj.ET).strftime("%Y-%m-%d"))
    except Exception as exc:
        print(f"injury report unavailable: {exc}")
        return None
    if report is None:
        print("no injury report published yet today: statuses fall back to the carry-forward default")
    return report


def game_injuries(report, season: str, game_date: str, away: str, home: str):
    """Overrides for the model and the frozen summary for the ledger, for one game."""
    if report is None:
        return None, None
    mm_dd_yyyy = datetime.strptime(game_date, "%Y-%m-%d").strftime("%m/%d/%Y")
    entries = [e for e in report.for_matchup(away, home) if e["game_date"] == mm_dd_yyyy]
    overrides, unmatched = inj.to_overrides(entries, season)
    summary = {
        "published_et": report.published_et,
        "submitted": {away: report.submitted(away, home, away), home: report.submitted(away, home, home)},
        "players": [{k: e[k] for k in ("team", "player_name", "status", "reason")} for e in entries],
    }
    if unmatched:
        print(f"  no player id for: {', '.join(unmatched)}")
    return overrides, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default=None)
    parser.add_argument("--date", default=date.today().isoformat(), help="Game date to snapshot (YYYY-MM-DD)")
    parser.add_argument("--through", default=None, help="Last game date of a range starting at --date")
    parser.add_argument("--backfill", action="store_true",
                        help="Also predict games already played, as of their date (origin=backfill, labeled in the UI)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    season = normalize_season(args.season or get_default_season())
    schedule = pd.read_csv(get_data_paths(season).raw_schedule, dtype={"GAME_ID": str})
    games = schedule[
        (schedule["GAME_DATE"] >= args.date)
        & (schedule["GAME_DATE"] <= (args.through or args.date))
        & schedule["SEASON_TYPE"].isin(pt.COUNTED_SEASON_TYPES)
    ]
    if not args.backfill:
        games = games[games["GAME_STATUS"] == "Scheduled"]
    now = datetime.now(timezone.utc)
    logged = {r["game_id"] for r in pt.read_ledger(season)}

    records = []
    total_lines = {} if args.backfill else fetch_total_lines(args.date, args.through or args.date)
    report = None if args.backfill else fetch_injuries(season)
    for g in games.itertuples():
        gid = str(g.GAME_ID).zfill(10)
        if gid in logged:
            continue
        started = str(g.GAME_START_UTC).replace("Z", "+00:00") <= now.isoformat()
        if started and not args.backfill:
            print(f"skip {gid} {g.AWAY_TEAM_ABBREVIATION}@{g.HOME_TEAM_ABBREVIATION}: already started")
            continue
        home, away = g.HOME_TEAM_ABBREVIATION, g.AWAY_TEAM_ABBREVIATION
        day = g.GAME_DATE
        overrides, injuries = (None, None) if started else game_injuries(report, season, day, away, home)
        feats_home = build_features(home, away, day, player_status_overrides=overrides)
        feats_away = build_features(away, home, day, team_is_home=False, player_status_overrides=overrides)
        win = win_prediction.predict(
            WinProbRequest(home_team=home, away_team=away, prediction_date=day), features=feats_home
        )
        score = predict_score(
            ScorePredictionRequest(home_team=home, away_team=away, prediction_date=day),
            features=feats_home,
            away_features=feats_away,
            win_response=win,
        )
        records.append(pt.build_record(
            gid, g.GAME_DATE, g.GAME_START_UTC, home, away, win.model_version,
            win.home_win_probability, score.predicted_home_score, score.predicted_away_score, now=now,
            origin="backfill" if started else "live",
            total_line=total_lines.get((home, away), (None, None))[0],
            total_window_rungs=total_lines.get((home, away), (None, None))[1],
            injury_report=injuries,
        ))
        print(f"{gid} {away}@{home}: {win.predicted_winner} {max(win.home_win_probability, win.away_win_probability):.1%}")

    written = 0 if args.dry_run else pt.append_records(season, records)
    print(f"{season} {args.date}: {len(records)} new predictions, {written} written to {pt.ledger_path(season)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
