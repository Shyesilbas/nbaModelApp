"""Per-quarter team scores and per-player box lines built from the full play-by-play file."""

from __future__ import annotations

import unicodedata
from typing import Any

# Counters tracked from each event's own before/after snapshot of the acting player.
DELTA_KEYS = ("pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "reb", "stl", "blk", "pf", "tov")
STAT_KEYS = DELTA_KEYS + ("ast",)


def _fold(name: str) -> str:
    text = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in text if not unicodedata.combining(ch)).casefold().strip()


def _period_label(period: int) -> str:
    return f"Q{period}" if period <= 4 else f"OT{period - 4}"


def build_quarter_breakdown(payload: dict[str, Any]) -> dict[str, Any]:
    """Aggregate player counting stats per period.

    Assists are not part of the assister's own snapshot, so they are credited from the
    scorer's `assist_player_name`, matched to a unique player of the same team by name.
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

    periods_seen = sorted({int(e.get("period") or 0) for e in events if int(e.get("period") or 0) > 0})
    return {
        "game_id": payload.get("game_id"),
        "home_team": payload.get("home_team"),
        "away_team": payload.get("away_team"),
        "periods": [{"period": p, "label": _period_label(p)} for p in periods_seen],
        "quarter_scores": payload.get("quarter_scores") or [],
        "players": sorted(players.values(), key=lambda p: p["player_id"]),
    }
