"""Player status overrides from the official NBA injury report, with the starting five adjusted.

Used by the prediction endpoints when the caller sends no overrides, and by the paper trading
snapshot, so both predict from the same roster status. Out players become OUT; Questionable and
Doubtful keep their own labels, with the measured probability of playing as factor
(nba_injury_report.STATUS_FACTOR). RESTRICTED is left to minute limits set by hand. When a starter
of the team's previous game is out, the best remaining players from that game move into the lineup.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from src.core.data_paths import PLAYER_METADATA_CSV, get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.ingestion import nba_injury_report as inj
from src.ingestion.starters_fetcher import starters_path

logger = logging.getLogger(__name__)

REPORT_TTL_SECONDS = 300
RECENT_GAMES = 10
STARTERS = 5
# Position groups in data/reference/player_metadata.csv. A replacement comes from the same group as
# the starter he replaces; if the bench has nobody there, from the closest group, then anyone.
NEXT_BEST_GROUPS = {"BIG": ("WING", "GUARD"), "WING": ("GUARD", "BIG"), "GUARD": ("WING", "BIG")}

_cache_lock = threading.Lock()
_cache: Dict[str, Tuple[float, Optional[inj.InjuryReport]]] = {}


def cached_report(season: str, day: str) -> Optional[inj.InjuryReport]:
    """The newest report published on ``day``, kept for a few minutes. None when unavailable."""
    key = f"{season}|{day}"
    with _cache_lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < REPORT_TTL_SECONDS:
            return hit[1]
    try:
        report = inj.fetch_report(season, day)
    except Exception as exc:
        logger.warning("Injury report unavailable: %s", exc)
        return None
    with _cache_lock:
        _cache[key] = (time.time(), report)
    return report


def _position_groups() -> Dict[int, str]:
    """Player id -> BIG / WING / GUARD (UNKNOWN when the metadata has none)."""
    if not PLAYER_METADATA_CSV.exists():
        return {}
    meta = pd.read_csv(PLAYER_METADATA_CSV, usecols=["PLAYER_ID", "POSITION_GROUP"]).drop_duplicates("PLAYER_ID")
    return {int(r.PLAYER_ID): str(r.POSITION_GROUP).upper() for r in meta.itertuples()}


def starter_replacements(team: str, game_date: str, out_ids: set, season: str) -> List[int]:
    """Players to promote because starters of the previous game are out.

    Each out starter is replaced by the player with the most minutes over the team's recent games
    who also played the previous game, preferring the same position group (a center out brings in
    a big man before a guard who simply plays more).
    """
    if not out_ids:
        return []
    seasons = [season]
    start = int(season[:4]) - 1
    seasons.append(f"{start}-{str(start + 1)[2:]}")
    games_frames, starter_frames = [], []
    for s in seasons:
        pg, sp = Path(get_data_paths(s).player_games_raw), starters_path(s)
        if pg.exists() and sp.exists():
            games_frames.append(pd.read_csv(pg, usecols=["Player_ID", "Game_ID", "GAME_DATE", "MATCHUP", "MIN"],
                                            dtype={"Game_ID": str}))
            starter_frames.append(pd.read_csv(sp, dtype={"Game_ID": str}))
    if not games_frames:
        return []
    games = pd.concat(games_frames, ignore_index=True)
    starters = pd.concat(starter_frames, ignore_index=True)
    games["GAME_DATE"] = pd.to_datetime(games["GAME_DATE"], errors="coerce", format="mixed")
    games["team"] = games["MATCHUP"].str.split(" ").str[0]
    games["Game_ID"] = games["Game_ID"].str.zfill(10)
    starters["Game_ID"] = starters["Game_ID"].str.zfill(10)
    mine = games[(games["team"] == team) & (games["GAME_DATE"] < pd.Timestamp(game_date)) & (games["MIN"] > 0)]
    recorded = set(starters.loc[starters["TEAM_ABBREVIATION"] == team, "Game_ID"])
    prior = mine[mine["Game_ID"].isin(recorded)]
    if prior.empty:
        return []
    last_id = prior.sort_values(["GAME_DATE", "Game_ID"]).iloc[-1]["Game_ID"]
    last_five = set(starters[(starters["Game_ID"] == last_id) & (starters["TEAM_ABBREVIATION"] == team)
                             & (starters["IS_STARTER"] == 1)]["Player_ID"].astype(int))
    if not last_five & out_ids:
        return []
    lost = [pid for pid in last_five if pid in out_ids]
    recent_ids = list(mine.sort_values(["GAME_DATE", "Game_ID"])["Game_ID"].drop_duplicates().tail(RECENT_GAMES))
    played_last = set(mine[mine["Game_ID"] == last_id]["Player_ID"].astype(int))
    pool = (mine[mine["Game_ID"].isin(recent_ids)].groupby("Player_ID")["MIN"].mean().sort_values(ascending=False))
    candidates = [int(pid) for pid in pool.index if int(pid) in played_last and int(pid) not in last_five
                  and int(pid) not in out_ids]
    groups = _position_groups()
    minutes = pool.to_dict()
    promoted: List[int] = []
    for starter in sorted(lost, key=lambda pid: -minutes.get(pid, 0.0)):
        wanted = groups.get(starter, "UNKNOWN")
        for group in (wanted, *NEXT_BEST_GROUPS.get(wanted, ()), None):
            pick = next((c for c in candidates if c not in promoted and (group is None or groups.get(c) == group)), None)
            if pick is not None:
                promoted.append(pick)
                break
    return promoted


def build_overrides(report: Optional[inj.InjuryReport], season: str, game_date: str, away: str, home: str
                    ) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Model overrides for one game and the summary shown in the UI and frozen in the ledger."""
    if report is None:
        return None, None
    mm_dd_yyyy = datetime.strptime(game_date, "%Y-%m-%d").strftime("%m/%d/%Y")
    entries = [e for e in report.for_matchup(away, home) if e["game_date"] == mm_dd_yyyy]
    overrides, unmatched = inj.to_overrides(entries, season)
    promoted_names: List[str] = []
    for team in (away, home):
        out_ids = {o["player_id"] for o, e in zip(overrides, entries)
                   if o.get("player_id") and e["team"] == team and e["status"] == "Out"}
        try:
            for pid in starter_replacements(team, game_date, out_ids, season):
                overrides.append({"player_id": pid, "status": "ACTIVE", "status_factor": 1.0, "is_starter": True})
                promoted_names.append(f"{team} #{pid}")
        except Exception as exc:
            logger.warning("Starter adjustment failed for %s: %s", team, exc)
    summary = {
        "published_et": report.published_et,
        "submitted": {away: report.submitted(away, home, away), home: report.submitted(away, home, home)},
        "players": [{k: e[k] for k in ("team", "player_name", "status", "reason")} for e in entries],
        "promoted_starters": [o["player_id"] for o in overrides if o.get("is_starter")],
        "unmatched": unmatched,
    }
    return overrides, summary


def auto_overrides(home: str, away: str, game_date: str, season: Optional[str] = None
                   ) -> Tuple[Optional[List[Dict[str, Any]]], Optional[Dict[str, Any]]]:
    """Overrides for a prediction request. Only for games dated today or tomorrow (Eastern), the days
    the report covers; other dates predict without roster status, as before."""
    today = datetime.now(inj.ET).date()
    try:
        day = datetime.strptime(game_date[:10], "%Y-%m-%d").date()
    except ValueError:
        return None, None
    if not today <= day <= today + timedelta(days=1):
        return None, None
    season = normalize_season(season or get_default_season())
    report = cached_report(season, today.isoformat())
    return build_overrides(report, season, day.isoformat(), away.upper(), home.upper())
