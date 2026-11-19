"""Single-game player highs (points, assists, rebounds) for one season store.

Closed seasons never change, so the result is stored once as the `season_highs` doc. Active
seasons are computed on request from `player_boxscores` (cheap local SQL) so new games count
immediately.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .store import dumps, season_db_path

TOP_N = 5
STATS = ("PTS", "AST", "REB")
DOC_NAME = "season_highs"


def compute_season_highs(conn: sqlite3.Connection) -> dict[str, list[dict]]:
    games: dict[str, dict] = {}
    for (raw,) in conn.execute("SELECT data_json FROM games"):
        g = json.loads(raw)
        if g.get("GAME_STATUS") == "Final" and g.get("HOME_SCORE") is not None and g.get("AWAY_SCORE") is not None:
            games[g["GAME_ID"]] = g
    regular = {gid for gid, g in games.items() if g.get("SEASON_TYPE") == "Regular Season"}
    eligible = regular or set(games)

    best: dict[str, list[dict]] = {k: [] for k in STATS}
    query = (
        "SELECT game_id, player_id,"
        " json_extract(data_json, '$.PLAYER_NAME'), json_extract(data_json, '$.TEAM_ABBREVIATION'),"
        " json_extract(data_json, '$.PTS'), json_extract(data_json, '$.AST'), json_extract(data_json, '$.REB')"
        " FROM player_boxscores"
    )
    for game_id, player_id, name, team, *values in conn.execute(query):
        if game_id not in eligible or player_id is None:
            continue
        g = games[game_id]
        for key, value in zip(STATS, values):
            if value is None:
                continue
            rows = best[key]
            if len(rows) >= TOP_N and value <= rows[-1]["value"]:
                continue
            rows.append({
                "id": int(player_id),
                "name": name or str(player_id),
                "team": team or "",
                "value": value,
                "gameId": game_id,
                "sub": f"{g['AWAY_TEAM_ABBREVIATION']} @ {g['HOME_TEAM_ABBREVIATION']}, {g['GAME_DATE']}",
            })
            rows.sort(key=lambda r: r["value"], reverse=True)
            del rows[TOP_N:]
    return best


def store_season_highs(conn: sqlite3.Connection) -> None:
    """Write the doc into a (writable) season store connection."""
    conn.execute("INSERT OR REPLACE INTO docs VALUES (?, ?)", (DOC_NAME, dumps(compute_season_highs(conn))))


def backfill_season_highs(season: str) -> bool:
    """Add the doc to an already built season store without rebuilding it."""
    path: Path = season_db_path(season)
    if not path.exists():
        return False
    conn = sqlite3.connect(path)
    try:
        with conn:
            store_season_highs(conn)
    finally:
        conn.close()
    return True
