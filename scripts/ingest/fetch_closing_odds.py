#!/usr/bin/env python3
"""Fetch closing moneylines and final scores for a season from the SportsGameOdds API.

Writes data/season=YYYY-YY/raw/closing_odds.csv (one row per finished regular-season or
playoff game, keyed by NBA GAME_ID). The API key is read from SPORTSGAMEODDS_API_KEY (environment or the
git-ignored .env) and never stored. Existing rows are kept, so reruns only add newly finished games.
"""
import argparse
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
from src.ingestion.sportsgameodds import fetch_events, get_api_key, to_float, to_int, total_ladder

COLUMNS = [
    "game_id", "event_id", "game_date", "start_utc", "home_team", "away_team",
    "home_score", "away_score", "home_ml_close", "away_ml_close",
    "total_line_close", "over_odds_close", "under_odds_close",
]
LADDER_COLUMNS = ["game_id", "line", "over_odds", "under_odds"]
# SportsGameOdds abbreviation -> NBA abbreviation, where they differ.
TEAM_ALIASES: dict = {}


def odds_path(season: str) -> Path:
    return Path(get_data_paths(season).team_games_raw).parent / "closing_odds.csv"


def ladder_path(season: str) -> Path:
    return Path(get_data_paths(season).team_games_raw).parent / "closing_total_ladder.csv"


def parse_event(ev: dict) -> dict | None:
    odds = ev.get("odds", {})
    home_ml = odds.get("points-home-game-ml-home", {})
    away_ml = odds.get("points-away-game-ml-away", {})
    over = odds.get("points-all-game-ou-over", {})
    under = odds.get("points-all-game-ou-under", {})
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
        "total_line_close": to_float(over.get("closeBookOverUnder")),
        "over_odds_close": to_int(over.get("closeBookOdds")),
        "under_odds_close": to_int(under.get("closeBookOdds")),
    }
    row["ladder"] = total_ladder(ev)
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
    parser.add_argument("--full", action="store_true", help="Refetch the whole season instead of only games after the last stored one")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = get_api_key()
    if not api_key:
        print("SPORTSGAMEODDS_API_KEY is not set (env or .env)", file=sys.stderr)
        return 1

    season = normalize_season(args.season or get_default_season())
    schedule = pd.read_csv(get_data_paths(season).raw_schedule, dtype={"GAME_ID": str})
    counted = schedule[schedule["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)]
    if counted.empty:
        print(f"{season}: no regular-season games in the schedule")
        return 1
    path = odds_path(season)
    first_day = pd.Timestamp(counted["GAME_DATE"].min())
    if path.exists() and ladder_path(season).exists() and not args.full:
        first_day = pd.Timestamp(pd.read_csv(path, usecols=["game_date"])["game_date"].max())
    starts_after = args.starts_after or (first_day - pd.Timedelta(days=1)).date().isoformat()

    parsed = [p for p in (parse_event(ev) for ev in fetch_events(api_key, startsAfter=starts_after, finalized="true")) if p]
    fetched = attach_game_ids(pd.DataFrame(parsed), schedule) if parsed else pd.DataFrame(columns=COLUMNS)
    event_game = dict(zip(fetched["event_id"], fetched["game_id"]))
    ladder_rows = [
        {"game_id": event_game[p["event_id"]], "line": line, "over_odds": v.get("over"), "under_odds": v.get("under")}
        for p in parsed if p["event_id"] in event_game
        for line, v in sorted(p["ladder"].items())
    ]
    print(f"{season}: {len(parsed)} finished events with closing moneylines, {len(fetched)} matched to the schedule")

    if path.exists():
        old = pd.read_csv(path, dtype={"game_id": str})
        fetched = pd.concat([old[~old["game_id"].isin(fetched["game_id"])], fetched], ignore_index=True)
    fetched = fetched.sort_values(["game_date", "game_id"])
    ladder = pd.DataFrame(ladder_rows, columns=LADDER_COLUMNS)
    if ladder_path(season).exists():
        old_ladder = pd.read_csv(ladder_path(season), dtype={"game_id": str})
        ladder = pd.concat([old_ladder[~old_ladder["game_id"].isin(ladder["game_id"])], ladder], ignore_index=True)
    if not args.dry_run:
        fetched.to_csv(path, index=False)
        ladder.sort_values(["game_id", "line"]).to_csv(ladder_path(season), index=False)
    print(f"{len(fetched)} rows -> {path}; {len(ladder)} ladder rows -> {ladder_path(season)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
