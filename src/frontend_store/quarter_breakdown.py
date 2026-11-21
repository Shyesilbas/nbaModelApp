"""Per-quarter team scores and per-player box lines built from the full play-by-play file.

Seconds on court per period come from the lineup rebuild in `src/processing/pbp_lineups.py` and are only
attached when the rebuild resolves every substitution and its game totals match the box score minutes.
"""

from __future__ import annotations

import unicodedata
from typing import Any

# Counters tracked from each event's own before/after snapshot of the acting player.
DELTA_KEYS = ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "reb", "stl", "blk", "pf", "tov")
STAT_KEYS = DELTA_KEYS + ("ast",)
# Largest mean absolute gap (minutes) between rebuilt and box score minutes before seconds are withheld.
MAX_MINUTES_MAE = 1.0


def _fold(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in text if not unicodedata.combining(ch)).casefold().strip()


def _period_label(period: int) -> str:
    return f"Q{period}" if period <= 4 else f"OT{period - 4}"


def _seconds_by_period(payload: dict[str, Any], box_rows: list[dict[str, Any]]) -> dict[int, dict[int, int]] | None:
    """``{player_id: {period: seconds}}`` from the rebuilt lineups, or None when the rebuild is not trustworthy."""
    import pandas as pd

    from src.processing.pbp_lineups import extract_stints

    box = pd.DataFrame(box_rows)
    if box.empty or not {"PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "MIN"} <= set(box.columns):
        return None
    try:
        stints, status = extract_stints(payload, box)
    except (KeyError, TypeError, ValueError):
        return None
    if not status["ok"] or not stints:
        return None
    seconds: dict[int, dict[int, int]] = {}
    for stint in stints:
        for key in ("HOME_PLAYERS", "AWAY_PLAYERS"):
            for pid in str(stint[key]).split("|"):
                per = seconds.setdefault(int(pid), {})
                per[stint["PERIOD"]] = per.get(stint["PERIOD"], 0) + int(stint["SECONDS"])
    box_minutes = dict(zip(box["PLAYER_ID"].astype(int), pd.to_numeric(box["MIN"], errors="coerce").fillna(0.0)))
    gaps = [abs(sum(seconds.get(pid, {}).values()) / 60.0 - mins) for pid, mins in box_minutes.items()]
    if not gaps or sum(gaps) / len(gaps) > MAX_MINUTES_MAE:
        return None
    return seconds


def build_quarter_breakdown(payload: dict[str, Any], box_rows: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Aggregate player counting stats per period.

    Assists are not part of the assister's own snapshot, so they are credited from the
    scorer's `assist_player_name`, matched to a unique player of the same team by name.
    With the game's box score rows, each period line also carries `sec` (seconds on court)
    and `minutes_available` is true; players who logged minutes without a stat event are added.
    """
    events = payload.get("events") or []

    names_by_team: dict[tuple[str, str], set[int]] = {}
    players: dict[int, dict[str, Any]] = {}
    for event in events:
        pid = event.get("player_id")
        team = event.get("team")
        name = event.get("player_name")
        if not pid or not team or not name or event.get("player_stats_after") is None:
            continue
        players.setdefault(int(pid), {"player_id": int(pid), "name": name, "team": team, "periods": {}})
        names_by_team.setdefault((team, _fold(name)), set()).add(int(pid))

    def bucket(pid: int, period: int) -> dict[str, int]:
        periods = players[pid]["periods"]
        return periods.setdefault(str(period), {key: 0 for key in STAT_KEYS})

    for event in events:
        period = int(event.get("period") or 0)
        if period <= 0:
            continue
        pid = event.get("player_id")
        before = event.get("player_stats_before")
        after = event.get("player_stats_after")
        if pid and int(pid) in players and before and after:
            row = bucket(int(pid), period)
            for key in DELTA_KEYS:
                row[key] += max(0, int(after.get(key, 0)) - int(before.get(key, 0)))
        assist_name = event.get("assist_player_name")
        team = event.get("team")
        if assist_name and team:
            ids = names_by_team.get((team, _fold(assist_name)), set())
            if len(ids) == 1:
                bucket(next(iter(ids)), period)["ast"] += 1

    seconds = _seconds_by_period(payload, box_rows) if box_rows else None
    if seconds is not None:
        for row in box_rows or []:
            pid = int(row["PLAYER_ID"])
            if pid in seconds and pid not in players:
                players[pid] = {"player_id": pid, "name": row.get("PLAYER_NAME") or str(pid), "team": row.get("TEAM_ABBREVIATION"), "periods": {}}
        for pid, per in seconds.items():
            if pid not in players:
                continue
            for period, secs in per.items():
                if secs > 0:
                    bucket(pid, period)["sec"] = secs
        for player in players.values():
            for row in player["periods"].values():
                row.setdefault("sec", 0)

    periods_seen = sorted({int(e.get("period") or 0) for e in events if int(e.get("period") or 0) > 0})
    return {
        "game_id": payload.get("game_id"),
        "home_team": payload.get("home_team"),
        "away_team": payload.get("away_team"),
        "periods": [{"period": p, "label": _period_label(p)} for p in periods_seen],
        "quarter_scores": payload.get("quarter_scores") or [],
        "players": sorted(players.values(), key=lambda p: p["player_id"]),
        "minutes_available": seconds is not None,
    }
