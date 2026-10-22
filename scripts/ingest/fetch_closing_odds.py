#!/usr/bin/env python3
"""Fetch closing moneylines and final scores for a season from the SportsGameOdds API.

Writes data/season=YYYY-YY/raw/closing_odds.csv (one row per finished regular-season or
playoff game, keyed by NBA GAME_ID). The API key is read from SPORTSGAMEODDS_API_KEY and
never stored. Existing rows are kept, so reruns only add newly finished games.
"""
import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.api.services.paper_trading import COUNTED_SEASON_TYPES
from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season

API_URL = "https://api.sportsgameodds.com/v2/events"
PAGE_SIZE = 50
COLUMNS = [
    "game_id", "event_id", "game_date", "start_utc", "home_team", "away_team",
    "home_score", "away_score", "home_ml_close", "away_ml_close",
]
# SportsGameOdds abbreviation -> NBA abbreviation, where they differ.
TEAM_ALIASES: dict = {}


def odds_path(season: str) -> Path:
    return Path(get_data_paths(season).team_games_raw).parent / "closing_odds.csv"


def fetch_events(api_key: str, starts_after: str):
    cursor = None
    while True:
        params = {"leagueID": "NBA", "startsAfter": starts_after, "finalized": "true", "limit": PAGE_SIZE}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(API_URL, headers={"X-Api-Key": api_key}, params=params, timeout=60)
        resp.raise_for_status()
        body = resp.json()
        yield from body.get("data", [])
        cursor = body.get("nextCursor")
        if not cursor:
            return
        time.sleep(0.5)


def to_int(value):
    try:
        return int(str(value).replace("+", ""))
    except (TypeError, ValueError):
        return None


def parse_event(ev: dict) -> dict | None:
    odds = ev.get("odds", {})
    home_ml = odds.get("points-home-game-ml-home", {})
    away_ml = odds.get("points-away-game-ml-away", {})
    teams = ev["teams"]
    home = teams["home"]["names"]["short"]
    away = teams["away"]["names"]["short"]
    row = {
        "event_id": ev["eventID"],
        "start_utc": ev["status"]["startsAt"],
        "home_team": TEAM_ALIASES.get(home, home),
        "away_team": TEAM_ALIASES.get(away, away),
        "home_score": home_ml.get("score"),
        "away_score": away_ml.get("score"),
        "home_ml_close": to_int(home_ml.get("closeBookOdds")),
        "away_ml_close": to_int(away_ml.get("closeBookOdds")),
    }
    if row["home_ml_close"] is None or row["away_ml_close"] is None or row["home_score"] is None:
        return None
    return row


def attach_game_ids(rows: pd.DataFrame, schedule: pd.DataFrame) -> pd.DataFrame:
    """Match each event to the NBA schedule by teams and the closest game date."""
    sched = schedule[schedule["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)].copy()
    sched["GAME_ID"] = sched["GAME_ID"].astype(str).str.zfill(10)
    sched["start"] = pd.to_datetime(sched["GAME_START_UTC"], utc=True)
    out = []
    for r in rows.to_dict("records"):
        cand = sched[
            (sched["HOME_TEAM_ABBREVIATION"] == r["home_team"]) & (sched["AWAY_TEAM_ABBREVIATION"] == r["away_team"])
        ]
        if cand.empty:
            print(f"unmatched: {r['away_team']}@{r['home_team']} {r['start_utc']}")
            continue
        gap = (cand["start"] - pd.Timestamp(r["start_utc"])).abs()
        best = cand.loc[gap.idxmin()]
        if gap.min() > pd.Timedelta(hours=18):
            continue
        out.append({**r, "game_id": best["GAME_ID"], "game_date": best["GAME_DATE"]})
    return pd.DataFrame(out, columns=COLUMNS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default=None)
    parser.add_argument("--starts-after", default=None, help="ISO date; defaults to the day before the first counted game")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("SPORTSGAMEODDS_API_KEY")
    if not api_key:
        print("SPORTSGAMEODDS_API_KEY is not set", file=sys.stderr)
        return 1

    season = normalize_season(args.season or get_default_season())
    schedule = pd.read_csv(get_data_paths(season).raw_schedule, dtype={"GAME_ID": str})
    counted = schedule[schedule["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)]
    if counted.empty:
        print(f"{season}: no regular-season games in the schedule")
        return 1
    starts_after = args.starts_after or (pd.Timestamp(counted["GAME_DATE"].min()) - pd.Timedelta(days=1)).date().isoformat()

    parsed = [p for p in (parse_event(ev) for ev in fetch_events(api_key, starts_after)) if p]
    fetched = attach_game_ids(pd.DataFrame(parsed), schedule) if parsed else pd.DataFrame(columns=COLUMNS)
    print(f"{season}: {len(parsed)} finished events with closing moneylines, {len(fetched)} matched to the schedule")

    path = odds_path(season)
    if path.exists():
        old = pd.read_csv(path, dtype={"game_id": str})
        fetched = pd.concat([old[~old["game_id"].isin(fetched["game_id"])], fetched], ignore_index=True)
    fetched = fetched.sort_values(["game_date", "game_id"])
    if not args.dry_run:
        fetched.to_csv(path, index=False)
    print(f"{len(fetched)} rows -> {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
