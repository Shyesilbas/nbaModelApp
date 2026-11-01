"""Frontend data endpoints, served from the SQLite store in data/frontend_store/.

One database per season plus global.db (see src/frontend_store/). The store is the only
source: nothing here reads the pipeline CSVs or exported JSON files.
"""
import json
import logging
import os
import sqlite3
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Request, Response

from src.core.season_utils import get_default_season
from src.frontend_store.store import connect_ro, global_db_path, season_db_path, stored_seasons

logger = logging.getLogger(__name__)

try:
    DEFAULT_SEASON = get_default_season()
except Exception:
    DEFAULT_SEASON = "2026-27"

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_TOKEN = os.environ.get("NBA_DATA_API_TOKEN")


def _check_token(request: Request) -> None:
    if not DATA_TOKEN:
        return
    if request.headers.get("x-data-token") != DATA_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized data access")


def _norm_game_id(value: Any) -> str:
    text = str(value or "").strip().split(".", 1)[0]
    return "".join(ch for ch in text if ch.isdigit()).zfill(10)


def _season_from_game_id(game_id: str) -> str:
    gid = _norm_game_id(game_id)
    if not gid.startswith("00") or not gid[3:5].isdigit():
        raise HTTPException(status_code=400, detail=f"Cannot infer season from GAME_ID={game_id}")
    start_year = 2000 + int(gid[3:5])
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _json_response(text: str) -> Response:
    """Send JSON text from the store as is. Returning the parsed object makes FastAPI walk it
    with jsonable_encoder, which alone takes ~0.3 s for the 1.2 MB player averages."""
    return Response(content=text, media_type="application/json")


def _doc_response(text: str | None, default: Any) -> Response:
    return _json_response(text if text is not None else json.dumps(default))


def _mtime(path: Path) -> int:
    return path.stat().st_mtime_ns if path.exists() else 0


def _season_conn(season: str) -> sqlite3.Connection:
    conn = connect_ro(season_db_path(season))
    if conn is None:
        raise HTTPException(status_code=404, detail=f"No frontend data for season {season}")
    return conn


@lru_cache(maxsize=64)
def _doc(db_path: str, name: str, mtime_ns: int) -> str | None:
    """JSON text of a stored document."""
    del mtime_ns  # part of the cache key: a rebuilt store invalidates the entry
    conn = connect_ro(Path(db_path))
    if conn is None:
        return None
    try:
        row = conn.execute("SELECT data_json FROM docs WHERE name = ?", (name,)).fetchone()
        return row[0] if row else None
    finally:
        conn.close()


def _season_doc(season: str, name: str) -> str | None:
    path = season_db_path(season)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"No frontend data for season {season}")
    return _doc(str(path), name, _mtime(path))


def _global_doc(name: str) -> str | None:
    path = global_db_path()
    if not path.exists():
        raise HTTPException(status_code=503, detail="Frontend store not built; run scripts/build_frontend_store.py")
    return _doc(str(path), name, _mtime(path))


def get_seasons() -> Response:
    return _doc_response(_global_doc("seasons"), stored_seasons())


def get_player_profiles() -> Response:
    return _doc_response(_global_doc("player_profiles"), [])


def get_player_season_averages() -> Response:
    return _doc_response(_global_doc("player_season_averages"), {})


def get_trades() -> Response:
    return _doc_response(_global_doc("trades"), [])


def get_team_rosters(season: str | None = None) -> Response:
    return _doc_response(_season_doc(season or DEFAULT_SEASON, "team_rosters"), [])


def get_multi_team_players(season: str | None = None) -> Response:
    return _doc_response(_season_doc(season or DEFAULT_SEASON, "multi_team_players"), [])


def get_game_results(season: str | None = None) -> Response:
    return _doc_response(_season_doc(season or DEFAULT_SEASON, "game_results"), [])


def get_game_index(
    season: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Response:
    conn = _season_conn(season or DEFAULT_SEASON)
    try:
        sql, params = "SELECT data_json FROM games WHERE 1=1", []
        if start_date:
            sql, params = sql + " AND game_date >= ?", params + [start_date]
        if end_date:
            sql, params = sql + " AND game_date <= ?", params + [end_date]
        rows = conn.execute(sql + " ORDER BY game_date, game_id", params).fetchall()
    finally:
        conn.close()
    return _json_response("[" + ",".join(r[0] for r in rows) + "]")


def get_season_weeks(season: str | None = None) -> list[dict[str, Any]]:
    conn = _season_conn(season or DEFAULT_SEASON)
    try:
        dates = [r[0] for r in conn.execute("SELECT game_date FROM games WHERE game_date IS NOT NULL")]
    finally:
        conn.close()

    week_counts: dict[str, int] = {}
    for d in dates:
        try:
            day = datetime.strptime(d, "%Y-%m-%d").date()
        except ValueError:
            continue
        monday = (day - timedelta(days=day.weekday())).isoformat()
        week_counts[monday] = week_counts.get(monday, 0) + 1

    weeks = []
    for idx, monday in enumerate(sorted(week_counts), 1):
        start = datetime.strptime(monday, "%Y-%m-%d")
        end = start + timedelta(days=6)
        weeks.append({
            "week_number": idx,
            "start_date": monday,
            "end_date": end.strftime("%Y-%m-%d"),
            "label": f"Week {idx} ({start.strftime('%b %d')} - {end.strftime('%b %d')})",
            "game_count": week_counts[monday],
        })
    return weeks


def get_game_detail(game_id: str, season: str | None = None) -> Any:
    return game_detail_payload(game_id, season)


def game_detail_payload(game_id: str, season: str | None = None) -> dict[str, Any]:
    gid = _norm_game_id(game_id)
    conn = _season_conn(season or _season_from_game_id(gid))
    try:
        detail_row = conn.execute("SELECT data_json FROM game_details WHERE game_id = ?", (gid,)).fetchone()
        team_rows = [json.loads(r[0]) for r in conn.execute("SELECT data_json FROM team_boxscores WHERE game_id = ?", (gid,))]
        player_rows = [json.loads(r[0]) for r in conn.execute("SELECT data_json FROM player_boxscores WHERE game_id = ?", (gid,))]
    finally:
        conn.close()

    detail = json.loads(detail_row[0]) if detail_row else None
    if detail is not None:
        detail["team_stats"] = team_rows
    return {
        "game_id": gid,
        "game_detail": detail,
        "team_boxscores": team_rows,
        "player_boxscores": player_rows,
    }


def get_play_by_play(game_id: str, season: str | None = None) -> Any:
    gid = _norm_game_id(game_id)
    season_key = season or _season_from_game_id(gid)
    conn = connect_ro(season_db_path(season_key))
    if conn is not None:
        try:
            row = conn.execute("SELECT data_json FROM pbp_moments WHERE game_id = ?", (gid,)).fetchone()
        finally:
            conn.close()
        if row:
            return _json_response(row[0])

    # Not in the store yet (e.g. fetched after the last build): condense the raw file.
    from src.frontend_store.pbp_moments import condense_payload

    path = REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play" / f"{gid}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"play_by_play not found for {gid} in {season_key}")
    return condense_payload(json.loads(path.read_text(encoding="utf-8")))


def get_game_quarters(game_id: str, season: str | None = None) -> Any:
    """Quarter scores and per-player quarter stats from the full raw play-by-play."""
    from src.frontend_store.quarter_breakdown import build_quarter_breakdown

    gid = _norm_game_id(game_id)
    season_key = season or _season_from_game_id(gid)
    path = REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play" / f"{gid}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"play_by_play not found for {gid} in {season_key}")
    return build_quarter_breakdown(json.loads(path.read_text(encoding="utf-8")))


def get_player_history(player_id: str) -> Response:
    pid = str(player_id)
    games: list[str] = []
    averages: list[str] = []
    for season in stored_seasons():
        conn = connect_ro(season_db_path(season))
        if conn is None:
            continue
        try:
            row = conn.execute("SELECT games_json, averages_json FROM player_games WHERE player_id = ?", (pid,)).fetchone()
        finally:
            conn.close()
        if row:
            games.append(f"{json.dumps(season)}:{row[0]}")
            averages.append(f"{json.dumps(season)}:{row[1]}")
    return _json_response(
        f'{{"player_id":{json.dumps(pid)},"games":{{{",".join(games)}}},"averages":{{{",".join(averages)}}}}}'
    )


def warm_up_cache() -> None:
    if not global_db_path().exists():
        logger.warning("Frontend store missing; run scripts/build_frontend_store.py")
        return
    for name in ("seasons", "player_profiles", "player_season_averages"):
        _global_doc(name)
    logger.info("Frontend store ready: %d seasons", len(stored_seasons()))
