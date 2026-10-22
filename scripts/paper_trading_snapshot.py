#!/usr/bin/env python3
"""Freeze pre-game WIN and SCORE predictions into the paper trading ledger.

Run after `main.py --update-data` and before tip-off. Games already in the ledger
are never rewritten and games that have started are skipped, so each record is a
true pre-game call. Uses the production models; trains nothing.

Best timing: run `--pre-tip 15` every 5 minutes. Each game is frozen on the first run inside
its window that has the official injury report. If the report cannot be fetched, the game is
left for the next run and is frozen without it only on the last attempt before tip-off.
"""
import argparse
import sys
from datetime import date, datetime, timedelta, timezone
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


FINAL_ATTEMPT_MINUTES = 6  # inside this many minutes to tip-off a game is frozen even without a report


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
    parser.add_argument("--pre-tip", type=int, default=None, metavar="MINUTES",
                        help="Only snapshot games that tip off within MINUTES from now (ignores --date). Run it every "
                             "5 minutes: each game is frozen on the first run in its window that has the newest injury "
                             "report")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    if args.pre_tip is not None:
        args.date = now.date().isoformat()
        args.through = (now + timedelta(days=1)).date().isoformat()

    season = normalize_season(args.season or get_default_season())
    schedule = pd.read_csv(get_data_paths(season).raw_schedule, dtype={"GAME_ID": str})
    games = schedule[
        (schedule["GAME_DATE"] >= args.date)
        & (schedule["GAME_DATE"] <= (args.through or args.date))
        & schedule["SEASON_TYPE"].isin(pt.COUNTED_SEASON_TYPES)
    ]
    if not args.backfill:
        games = games[games["GAME_STATUS"] == "Scheduled"]
    if args.pre_tip is not None:
        start = pd.to_datetime(games["GAME_START_UTC"], utc=True)
        games = games[(start > now) & (start <= now + timedelta(minutes=args.pre_tip))]
    logged = {r["game_id"] for r in pt.read_ledger(season)}

    records = []
    pending = [g for g in games.itertuples() if str(g.GAME_ID).zfill(10) not in logged]
    if not pending:
        print(f"{season}: no unlogged games to snapshot")
        return 0
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
        minutes_to_tip = (pd.Timestamp(g.GAME_START_UTC) - pd.Timestamp(now)).total_seconds() / 60
        if args.pre_tip is not None and report is None and minutes_to_tip > FINAL_ATTEMPT_MINUTES:
            print(f"retry later {gid} {away}@{home}: no injury report, {minutes_to_tip:.0f} min to tip-off")
            continue
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
            injury_report=injuries,
        ))
        print(f"{gid} {away}@{home}: {win.predicted_winner} {max(win.home_win_probability, win.away_win_probability):.1%}")

    written = 0 if args.dry_run else pt.append_records(season, records)
    print(f"{season} {args.date}: {len(records)} new predictions, {written} written to {pt.ledger_path(season)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
