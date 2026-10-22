"""SportsGameOdds API helpers: event paging, total-line ladders and the line window around a main line."""
from __future__ import annotations

import time
from typing import Any, Dict, Iterator, List, Optional

import requests

API_URL = "https://api.sportsgameodds.com/v2/events"
PAGE_SIZE = 50
WINDOW_STEPS = 2
TOTAL_OVER = "points-all-game-ou-over"
TOTAL_UNDER = "points-all-game-ou-under"


def to_int(value) -> Optional[int]:
    try:
        return int(str(value).replace("+", ""))
    except (TypeError, ValueError):
        return None


def to_float(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def decimal(american: int) -> float:
    return 1 + american / 100 if american > 0 else 1 + 100 / -american


def fetch_events(api_key: str, **params) -> Iterator[Dict[str, Any]]:
    """Page through /v2/events for the NBA with alternate lines included."""
    query = {"leagueID": "NBA", "limit": PAGE_SIZE, "includeAltLines": "true", **params}
    while True:
        resp = requests.get(API_URL, headers={"X-Api-Key": api_key}, params=query, timeout=60)
        resp.raise_for_status()
        body = resp.json()
        yield from body.get("data", [])
        cursor = body.get("nextCursor")
        if not cursor:
            return
        query["cursor"] = cursor
        time.sleep(0.5)


def total_ladder(ev: Dict[str, Any]) -> Dict[float, Dict[str, int]]:
    """Pre-game total lines offered by any bookmaker, with the best odds per side at each line.

    Includes each book's main line and its alternate lines; quotes updated after the
    scheduled start are in-game prices and are dropped.
    """
    odds = ev.get("odds", {})
    start = ev["status"]["startsAt"]
    ladder: Dict[float, Dict[str, int]] = {}
    for side, odd_id in (("over", TOTAL_OVER), ("under", TOTAL_UNDER)):
        for book in odds.get(odd_id, {}).get("byBookmaker", {}).values():
            for q in [book, *book.get("altLines", [])]:
                line, price = to_float(q.get("overUnder")), to_int(q.get("odds"))
                if line is None or price is None or q.get("lastUpdatedAt", start) >= start:
                    continue
                best = ladder.setdefault(line, {}).get(side)
                if best is None or decimal(price) > decimal(best):
                    ladder[line][side] = price
    return ladder


def total_window(main_line: float, ladder: Dict[float, Dict[str, int]], steps: int = WINDOW_STEPS) -> List[Dict[str, Any]]:
    """The main line and `steps` rungs of 1.0 below and above it, with best odds where a book offers them."""
    window = []
    for k in range(-steps, steps + 1):
        line = main_line + k
        rung = ladder.get(line, {})
        window.append({"line": line, "over_odds": rung.get("over"), "under_odds": rung.get("under")})
    return window
