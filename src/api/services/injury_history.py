"""Injury history built from the official NBA injury reports, and the daily injuries view.

For every past game day the final report of that day is stored (one row per listed player) in
data/season=YYYY-YY/raw/injury_history.csv; today's view is read live. From the history come how
long a player has been listed, how many games he missed and who returned recently. Only the
current season is kept: days missing because the app was off are filled from the season's PDF list
on the next sync.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.ingestion import nba_injury_report as inj

logger = logging.getLogger(__name__)

COLUMNS = ["game_date", "team", "player_id", "player_name", "status", "reason", "report_time_et"]
NO_ONE = "NONE"  # marker row: the day was synced and nobody was listed
MAX_DAYS_PER_SYNC = 14
SYNC_INTERVAL_SECONDS = 1800
ROTATION_MINUTES = 15.0
RECENT_RETURN_DAYS = 7
SERIOUS = ("Out", "Doubtful")

_lock = threading.Lock()
_last_sync: Dict[str, float] = {}
_report_cache: Dict[str, inj.InjuryReport] = {}
_urls_cache: Dict[str, Tuple[float, list]] = {}


def history_path(season: str) -> Path:
    return Path(get_data_paths(season).team_games_raw).parent / "injury_history.csv"


def _urls(season: str) -> list:
    """The season page's report list, kept for five minutes."""
    hit = _urls_cache.get(season)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    urls = inj.report_urls(season)
    _urls_cache[season] = (time.time(), urls)
    return urls


def _report(url: str) -> inj.InjuryReport:
    if url not in _report_cache:
        _report_cache[url] = inj.fetch_report_from_url(url)
    return _report_cache[url]


def _final_report(day: str) -> Optional[inj.InjuryReport]:
    """The last report of a past ET day, found by probing the PDF names from 11:45 PM backwards
    (the season page only lists the current day)."""
    for hh, mm, ap in (("11", "45", "PM"), ("11", "30", "PM"), ("11", "15", "PM"), ("11", "00", "PM"),
                       ("10", "45", "PM"), ("10", "30", "PM")):
        url = inj.PDF_URL.format(day=day, hh=hh, mm=mm, ap=ap)
        try:
            return _report(url)
        except Exception:
            continue
    return None


def _read_raw(season: str) -> pd.DataFrame:
    path = history_path(season)
    if not path.exists():
        return pd.DataFrame(columns=COLUMNS)
    return pd.read_csv(path, dtype={"player_id": "Int64"}).fillna({"reason": "", "player_name": ""})


def read_history(season: str) -> pd.DataFrame:
    df = _read_raw(season)
    return df[df["status"] != NO_ONE].reset_index(drop=True)


def _game_days(season: str) -> List[str]:
    from src.api.services.paper_trading import COUNTED_SEASON_TYPES

    sched = pd.read_csv(get_data_paths(season).raw_schedule, usecols=["GAME_DATE", "SEASON_TYPE"])
    return sorted(sched[sched["SEASON_TYPE"].isin(COUNTED_SEASON_TYPES)]["GAME_DATE"].unique())


def sync_history(season: str, today: Optional[str] = None, force: bool = False) -> int:
    """Store the final report of each past game day that is not stored yet. Returns the days added."""
    season = normalize_season(season)
    with _lock:
        if not force and time.time() - _last_sync.get(season, 0.0) < SYNC_INTERVAL_SECONDS:
            return 0
        _last_sync[season] = time.time()
        today = today or datetime.now(inj.ET).strftime("%Y-%m-%d")
        done = set(_read_raw(season)["game_date"])
        missing = [d for d in _game_days(season) if d < today and d not in done][:MAX_DAYS_PER_SYNC]
        if not missing:
            return 0
        rows: List[Dict[str, Any]] = []
        added = 0
        for day in missing:
            report = _final_report(day)
            if report is None:
                logger.warning("No injury report found for %s", day)
                continue
            mmddyyyy = datetime.strptime(day, "%Y-%m-%d").strftime("%m/%d/%Y")
            entries = [e for e in report.entries if e["game_date"] == mmddyyyy]
            overrides, _ = inj.to_overrides(entries, season)
            for e, o in zip(entries, overrides):
                rows.append({"game_date": day, "team": e["team"], "player_id": o.get("player_id"),
                             "player_name": e["player_name"], "status": e["status"], "reason": e["reason"],
                             "report_time_et": report.published_et})
            if not entries:
                rows.append({"game_date": day, "team": "", "player_id": None, "player_name": "", "status": NO_ONE,
                             "reason": "", "report_time_et": report.published_et})
            added += 1
        if rows:
            path = history_path(season)
            existing, new = _read_raw(season), pd.DataFrame(rows, columns=COLUMNS)
            frame = new if existing.empty else pd.concat([existing, new], ignore_index=True)
            frame.sort_values(["game_date", "team", "player_name"]).to_csv(path, index=False)
        return added


def _plain(name: str) -> str:
    return inj._plain(name)


def _games(season: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """(team game dates, player appearances) for the season so far."""
    paths = get_data_paths(season)
    teams = pd.read_csv(paths.team_games_raw, usecols=["TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "SEASON_TYPE"],
                        dtype={"GAME_ID": str})
    players = pd.read_csv(paths.player_games_raw, usecols=["PLAYER_NAME", "Game_ID", "GAME_DATE", "MATCHUP", "MIN"],
                          dtype={"Game_ID": str})
    teams = teams[teams["SEASON_TYPE"].isin(("Regular Season", "Playoffs", "PlayIn", "Play-In"))]
    players = players[players["MIN"] > 0].copy()
    players["team"] = players["MATCHUP"].str.split(" ").str[0]
    players["plain"] = players["PLAYER_NAME"].map(_plain)
    return teams, players


def _streak(listed_dates: set, team_dates: List[str]) -> List[str]:
    """Team game dates of the player's most recent unbroken run of listings."""
    run: List[str] = []
    for d in reversed(team_dates):
        if d in listed_dates:
            run.append(d)
        elif run:
            break
        elif d != team_dates[-1]:
            break
    return list(reversed(run))


def _player_state(season: str, listing: List[Dict[str, Any]], today: str, history: pd.DataFrame,
                  teams: pd.DataFrame, players: pd.DataFrame) -> List[Dict[str, Any]]:
    """Adds since / games_missed / minutes / rotation to listed players."""
    out = []
    for p in listing:
        team, plain = p["team"], _plain(p["player_name"])
        team_dates = sorted(teams.loc[teams["TEAM_ABBREVIATION"] == team, "GAME_DATE"].unique())
        mine = history[(history["team"] == team) & (history["player_name"].map(_plain) == plain)]
        listed = set(mine["game_date"])
        streak = _streak(listed, [d for d in team_dates if d < today])
        since = streak[0] if streak else today
        played = players[(players["team"] == team) & (players["plain"] == plain)]
        missed_dates = [d for d in team_dates if d >= since and d < today]
        missed = [d for d in missed_dates if d not in set(played["GAME_DATE"])]
        recent = played.sort_values("GAME_DATE").tail(10)["MIN"]
        minutes = round(float(recent.mean()), 1) if len(recent) else None
        out.append({**p, "since": since, "games_missed": len(missed), "minutes": minutes,
                    "rotation": bool(minutes is not None and minutes >= ROTATION_MINUTES)})
    return out


def recent_returns(season: str, today: str, history: pd.DataFrame, teams: pd.DataFrame,
                   players: pd.DataFrame) -> List[Dict[str, Any]]:
    """Players listed Out or Doubtful earlier who have played again within the last week."""
    cutoff = (datetime.strptime(today, "%Y-%m-%d") - timedelta(days=RECENT_RETURN_DAYS)).strftime("%Y-%m-%d")
    out = []
    serious = history[history["status"].isin(SERIOUS)]
    for (team, name), grp in serious.groupby(["team", "player_name"]):
        plain = _plain(name)
        last_listed = grp["game_date"].max()
        played = players[(players["team"] == team) & (players["plain"] == plain) & (players["GAME_DATE"] > last_listed)]
        if played.empty:
            continue
        back = played["GAME_DATE"].min()
        if back < cutoff:
            continue
        team_dates = sorted(teams.loc[teams["TEAM_ABBREVIATION"] == team, "GAME_DATE"].unique())
        first = grp["game_date"].min()
        out.append({"team": team, "player_name": name, "listed_from": first, "listed_to": last_listed,
                    "returned_on": back,
                    "games_missed": len([d for d in team_dates if first <= d < back])})
    return sorted(out, key=lambda r: r["returned_on"], reverse=True)


SAMPLE_MINUTES = 60


def _sample_reports(season: str, day: str) -> List[Tuple[datetime, inj.InjuryReport]]:
    """About one report per hour of ``day`` plus the newest one, parsed in parallel and cached."""
    from concurrent.futures import ThreadPoolExecutor

    day_urls = [(w, u) for w, u in _urls(season) if w.strftime("%Y-%m-%d") == day]
    if not day_urls:
        return []
    picked, last_slot = [], None
    for when, url in day_urls:
        slot = when.replace(minute=0, second=0, microsecond=0)
        if slot != last_slot:
            picked.append((when, url))
            last_slot = slot
    if picked[-1][1] != day_urls[-1][1]:
        picked.append(day_urls[-1])
    with ThreadPoolExecutor(max_workers=6) as pool:
        reports = list(pool.map(lambda wu: _report(wu[1]), picked))
    return [(w, r) for (w, _), r in zip(picked, reports)]


def status_changes(season: str, day: str, game_date: Optional[str] = None, matchup: Optional[str] = None
                   ) -> List[Dict[str, Any]]:
    """Players whose status changed across the day's reports, with each step and its report time.

    A status of None means the player is not on the report (no restriction). ``game_date`` and
    ``matchup`` narrow the rows to one game.
    """
    samples = _sample_reports(season, day)
    if len(samples) < 2:
        return []
    mmddyyyy = datetime.strptime(game_date or day, "%Y-%m-%d").strftime("%m/%d/%Y")

    matchups: Dict[Tuple[str, str], str] = {}

    def table(report):
        rows = {}
        for e in report.entries:
            if e["game_date"] == mmddyyyy and (matchup is None or e["matchup"] == matchup):
                rows[(e["team"], e["player_name"])] = e["status"]
                matchups[(e["team"], e["player_name"])] = e["matchup"]
        return rows

    tables = [(r.published_et, table(r), r.not_submitted) for _, r in samples]
    out = []
    for key in sorted({k for _, t, _ in tables for k in t}):
        steps: List[Dict[str, Any]] = []
        for published, t, unfiled in tables:
            if (matchups[key], key[0]) in unfiled:
                continue  # the team had not filed yet: absence says nothing about the player
            status = t.get(key)
            if not steps or steps[-1]["status"] != status:
                steps.append({"status": status, "at": published})
        if len(steps) > 1:
            out.append({"team": key[0], "player_name": key[1], "steps": steps})
    return out


def changes_for_day(season: str, day: str) -> List[Dict[str, Any]]:
    return status_changes(season, day, game_date=day)


def changes_for_game(season: str, day: str, away: str, home: str) -> List[Dict[str, Any]]:
    """Status changes for one game, from today's reports (the day the report is read, Eastern)."""
    today = datetime.now(inj.ET).strftime("%Y-%m-%d")
    try:
        return status_changes(season, today, game_date=day, matchup=f"{away}@{home}")
    except Exception as exc:
        logger.warning("Injury changes unavailable: %s", exc)
        return []


def injuries_payload(season: Optional[str], day: Optional[str]) -> Dict[str, Any]:
    season = normalize_season(season or get_default_season())
    today = datetime.now(inj.ET).strftime("%Y-%m-%d")
    day = day or today
    try:
        sync_history(season)
    except Exception as exc:
        logger.warning("Injury history sync failed: %s", exc)
    history = read_history(season)
    teams, players = _games(season)
    live = day >= today
    published, not_filed, listing = None, [], []
    if live:
        report = None
        try:
            report = inj.fetch_report(season, today) if day == today else None
        except Exception as exc:
            logger.warning("Live injury report unavailable: %s", exc)
        mmddyyyy = datetime.strptime(day, "%Y-%m-%d").strftime("%m/%d/%Y")
        if report:
            published = report.published_et
            not_filed = sorted({t for (_, t) in report.not_submitted})
            listing = [dict(e) for e in report.entries if e["game_date"] == mmddyyyy]
    else:
        listing = [{"game_date": r.game_date, "team": r.team, "player_name": r.player_name, "status": r.status,
                    "reason": r.reason, "matchup": ""} for r in history[history["game_date"] == day].itertuples()]
        day_rows = history[history["game_date"] == day]
        published = day_rows["report_time_et"].iloc[0] if len(day_rows) else None
    detailed = _player_state(season, listing, today if live else day, history, teams, players)
    detailed.sort(key=lambda p: (p["team"], not p["rotation"], p["player_name"]))
    return {
        "season": season, "date": day, "live": live, "published_et": published, "not_filed": not_filed,
        "players": detailed,
        "changes": changes_for_day(season, day) if live and day == today else [],
        "recent_returns": recent_returns(season, today, history, teams, players),
        "stored_days": sorted(_read_raw(season)["game_date"].unique()),
    }
