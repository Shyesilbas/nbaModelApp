"""Background warmup of the per-day feature caches for today's and tomorrow's games.

The first /predict/game_full call for a game spends several seconds rolling team and player
form forward to the game date. Those results are cached per date and data file version, so
computing them once after startup makes the first click as fast as a repeated one.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

logger = logging.getLogger(__name__)
ET = ZoneInfo("America/New_York")


def slate(day: str, season: str) -> list[tuple[str, str]]:
    """(home, away) for the games scheduled on ``day`` (YYYY-MM-DD)."""
    from src.features.build_matchup_features import _load_combined_schedule

    schedule = _load_combined_schedule(season)
    if schedule.empty:
        return []
    rows = schedule[schedule["GAME_DATE"].astype(str).str[:10] == day]
    return list(zip(rows["HOME_TEAM_ABBREVIATION"], rows["AWAY_TEAM_ABBREVIATION"]))


def warm_day(day: str) -> int:
    from src.core.season_utils import date_to_season
    from src.features.build_matchup_features import build_features
    from .player_projection import _roster_frames

    games = slate(day, date_to_season(pd.to_datetime(day)))
    for home, away in games:
        try:
            build_features(home, away, day)
            _roster_frames(home, away, day)
        except Exception as exc:  # a warmup miss only costs the first request its usual time
            logger.info("Slate warmup skipped %s-%s on %s: %s", home, away, day, exc)
    return len(games)


def _run() -> None:
    today = datetime.now(ET).date()
    for day in (today, today + timedelta(days=1)):
        try:
            n = warm_day(day.isoformat())
            logger.info("Slate warmup done for %s: %d games", day, n)
        except Exception as exc:
            logger.info("Slate warmup failed for %s: %s", day, exc)


def start_background_warmup() -> None:
    """Start the warmup thread unless disabled (NBA_WARM_SLATE=0) or running under pytest."""
    if os.environ.get("NBA_WARM_SLATE", "1") == "0" or "PYTEST_CURRENT_TEST" in os.environ:
        return
    threading.Thread(target=_run, name="slate-warmup", daemon=True).start()
