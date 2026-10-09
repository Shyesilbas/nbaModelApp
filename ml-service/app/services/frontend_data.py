import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, Request

from scripts.season_utils import get_default_season

logger = logging.getLogger(__name__)

try:
    DEFAULT_SEASON = get_default_season()
except Exception:
    DEFAULT_SEASON = "2025-26"


import sqlite3

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.environ.get("FRONTEND_DATA_DIR", REPO_ROOT / "data" / "frontend")).resolve()
DB_PATH = DATA_DIR / "nba_frontend.db"
DATA_TOKEN = os.environ.get("NBA_DATA_API_TOKEN")


def _get_db_conn():
    if not DB_PATH.exists():
        return None
    try:
        return sqlite3.connect(f"file:{DB_PATH.resolve()}?mode=ro", uri=True)
    except Exception:
        return None
GENERIC_ALLOWED_FILES = {
    "core_players.json",
    "dataset_summary.json",
    "game_results.json",
    "highlights.json",
    "manifest.json",
    "model_ready_v2_summary.json",
    "multi_team_players.json",
    "player_name_lookup.json",
    "player_profiles.json",
    "player_season_averages.json",
    "schedule.json",
    "seasons.json",
    "star_candidates.json",
    "team_rosters.json",
    "upcoming_games_context.json",
}


def _check_token(request: Request) -> None:
    if not DATA_TOKEN:
        return
    supplied = request.headers.get("x-data-token")
    if supplied != DATA_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized data access")


def _resolve_json_path(filename: str) -> Path:
    if filename.startswith("/data/"):
        filename = filename.removeprefix("/data/")
    if "/" in filename or "\\" in filename or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid data file")

    path = (DATA_DIR / filename).resolve()
    if DATA_DIR not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid data file")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} not found")
    return path


@lru_cache(maxsize=64)
def _read_json_file(path_str: str, mtime_ns: int) -> Any:
    del mtime_ns
    with open(path_str, "r", encoding="utf-8") as f:
        return json.load(f)


def get_manifest(request: Request) -> Any:
    _check_token(request)
    path = _resolve_json_path("manifest.json")
    manifest = dict(_read_json_file(str(path), path.stat().st_mtime_ns))
    files = manifest.get("files", {})
    manifest["files"] = {name: meta for name, meta in files.items() if name in GENERIC_ALLOWED_FILES}
    return manifest


def get_frontend_json(filename: str, request: Request) -> Any:
    _check_token(request)
    if filename not in GENERIC_ALLOWED_FILES:
        raise HTTPException(status_code=404, detail=f"{filename} is not available as a bulk file")
    path = _resolve_json_path(filename)
    return _read_json_file(str(path), path.stat().st_mtime_ns)


def _norm_game_id(value: Any) -> str:
    text = str(value or "").strip()
    if "." in text:
        text = text.split(".", 1)[0]
    digits = "".join(ch for ch in text if ch.isdigit())
    return digits.zfill(10)


def _season_from_game_id(game_id: str) -> str:
    gid = _norm_game_id(game_id)
    if len(gid) < 5 or not gid.startswith("00"):
        raise HTTPException(status_code=400, detail=f"Cannot infer season from GAME_ID={game_id}")
    try:
        start_year = 2000 + int(gid[3:5])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Cannot infer season from GAME_ID={game_id}") from exc
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def _load_json(filename: str) -> Any:
    path = _resolve_json_path(filename)
    return _read_json_file(str(path), path.stat().st_mtime_ns)


def _season_suffix(season: str | None) -> str:
    return "" if not season or season == DEFAULT_SEASON else f"_{season}"


def _strip_embedded_detail(game: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in game.items() if k != "game_detail"}


def _row_season(game: dict[str, Any]) -> str | None:
    try:
        return _season_from_game_id(game.get("GAME_ID") or game.get("game_id"))
    except HTTPException:
        season = game.get("SEASON")
        return season if isinstance(season, str) and len(season) == 7 and season[4] == "-" else None


def get_game_index(
    request: Request,
    season: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Any:
    _check_token(request)
    season_key = season or DEFAULT_SEASON

    # SQLite is a fast index, but it can lag behind the canonical JSON exports
    # and contain only a partial season. Merge all available sources by GAME_ID
    # so one stale database row cannot hide the rest of the schedule.
    games_by_id: dict[str, dict[str, Any]] = {}
    conn = _get_db_conn()
    if conn is not None:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT data_json FROM games_index WHERE season = ?", (season_key,))
            rows = cursor.fetchall()
            for row in rows:
                game = json.loads(row[0])
                gid = _norm_game_id(game.get("GAME_ID") or game.get("game_id"))
                if gid.strip("0"):
                    games_by_id[gid] = game
        except Exception as e:
            logger.warning("SQLite games_index query failed, falling back to JSON: %s", e)
        finally:
            conn.close()

    for filename in ("all_seasons_games.json", "games.json"):
        try:
            source_rows = _load_json(filename)
        except HTTPException:
            continue
        if not isinstance(source_rows, list):
            continue
        for game in source_rows:
            if _row_season(game) != season_key:
                continue
            gid = _norm_game_id(game.get("GAME_ID") or game.get("game_id"))
            if gid.strip("0"):
                existing = games_by_id.get(gid, {})
                is_existing_completed = (
                    existing.get("GAME_STATUS") in ("Final", "FINAL")
                    or (existing.get("HOME_SCORE") is not None and existing.get("AWAY_SCORE") is not None)
                )
                is_new_completed = (
                    game.get("GAME_STATUS") in ("Final", "FINAL")
                    or (game.get("HOME_SCORE") is not None and game.get("AWAY_SCORE") is not None)
                )
                if is_existing_completed and not is_new_completed:
                    games_by_id[gid] = {**game, **existing}
                else:
                    games_by_id[gid] = {**existing, **game}

    raw_games = list(games_by_id.values())

    if start_date or end_date:
        filtered = []
        for g in raw_games:
            d = g.get("GAME_DATE")
            if not d:
                continue
            if start_date and d < start_date:
                continue
            if end_date and d > end_date:
                continue
            filtered.append(g)
        raw_games = filtered

    return [_strip_embedded_detail(g) for g in raw_games]


def get_season_weeks(request: Request, season: str | None = None) -> list[dict[str, Any]]:
    _check_token(request)
    games = get_game_index(request, season=season)

    from datetime import datetime, timedelta
    week_map: dict[tuple[str, str], int] = {}
    for g in games:
        d_str = g.get("GAME_DATE")
        if not d_str:
            continue
        try:
            dt = datetime.strptime(d_str, "%Y-%m-%d").date()
            mon = dt - timedelta(days=dt.weekday())
            sun = mon + timedelta(days=6)
            key = (mon.isoformat(), sun.isoformat())
            week_map[key] = week_map.get(key, 0) + 1
        except Exception:
            continue

    sorted_keys = sorted(week_map.keys())
    result = []
    for idx, (mon, sun) in enumerate(sorted_keys, 1):
        dt_start = datetime.strptime(mon, "%Y-%m-%d")
        dt_end = datetime.strptime(sun, "%Y-%m-%d")
        start_fmt = dt_start.strftime("%b %d")
        end_fmt = dt_end.strftime("%b %d")
        count = week_map[(mon, sun)]
        result.append({
            "week_number": idx,
            "start_date": mon,
            "end_date": sun,
            "label": f"Week {idx} ({start_fmt} - {end_fmt})",
            "game_count": count,
        })
    return result


@lru_cache(maxsize=16)
def _get_game_grouped_boxscores(filename: str, mtime_ns: int) -> dict[str, list[dict[str, Any]]]:
    path = _resolve_json_path(filename)
    raw = _read_json_file(str(path), mtime_ns)
    grouped: dict[str, list[dict[str, Any]]] = {}
    if isinstance(raw, list):
        for row in raw:
            gid = _norm_game_id(row.get("GAME_ID"))
            if gid not in grouped:
                grouped[gid] = []
            grouped[gid].append(row)
    return grouped


@lru_cache(maxsize=8)
def _get_game_details_index(mtime_ns: int) -> dict[str, dict[str, Any]]:
    path = _resolve_json_path("game_details.json")
    raw = _read_json_file(str(path), mtime_ns)
    index: dict[str, dict[str, Any]] = {}
    if isinstance(raw, list):
        for row in raw:
            gid = _norm_game_id(row.get("game_id") or row.get("GAME_ID"))
            index[gid] = row
    return index


def get_game_detail(game_id: str, request: Request, season: str | None = None) -> Any:
    _check_token(request)
    gid = _norm_game_id(game_id)
    season_key = season or DEFAULT_SEASON

    conn = _get_db_conn()
    if conn is not None:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT data_json FROM game_details WHERE game_id = ?", (gid,))
            gd_row = cursor.fetchone()
            detail = json.loads(gd_row[0]) if gd_row else None

            if season:
                cursor.execute(
                    "SELECT data_json FROM team_boxscores WHERE game_id = ? AND season = ?",
                    (gid, season),
                )
            else:
                cursor.execute(
                    "SELECT data_json FROM team_boxscores WHERE game_id = ?",
                    (gid,),
                )
            team_rows = [json.loads(r[0]) for r in cursor.fetchall()]

            if season:
                cursor.execute(
                    "SELECT data_json FROM player_boxscores WHERE game_id = ? AND season = ?",
                    (gid, season),
                )
            else:
                cursor.execute(
                    "SELECT data_json FROM player_boxscores WHERE game_id = ?",
                    (gid,),
                )
            player_rows = [json.loads(r[0]) for r in cursor.fetchall()]

            if detail is not None or team_rows or player_rows:
                return {
                    "game_id": gid,
                    "game_detail": detail,
                    "team_boxscores": team_rows,
                    "player_boxscores": player_rows,
                }
        except Exception as e:
            logger.warning("SQLite game_detail query failed, falling back to JSON: %s", e)
        finally:
            conn.close()

    # JSON fallback
    suffix = _season_suffix(season)
    tb_filename = f"team_boxscores{suffix}.json"
    pb_filename = f"player_boxscores{suffix}.json"

    tb_path = _resolve_json_path(tb_filename)
    pb_path = _resolve_json_path(pb_filename)

    team_dict = _get_game_grouped_boxscores(tb_filename, tb_path.stat().st_mtime_ns)
    player_dict = _get_game_grouped_boxscores(pb_filename, pb_path.stat().st_mtime_ns)

    team_rows = team_dict.get(gid, [])
    player_rows = player_dict.get(gid, [])

    detail = None
    if not suffix:
        gd_path = _resolve_json_path("game_details.json")
        details_index = _get_game_details_index(gd_path.stat().st_mtime_ns)
        detail = details_index.get(gid)

    return {
        "game_id": gid,
        "game_detail": detail,
        "team_boxscores": team_rows,
        "player_boxscores": player_rows,
    }


def get_play_by_play(game_id: str, request: Request, season: str | None = None) -> Any:
    _check_token(request)
    gid = _norm_game_id(game_id)
    season_key = season or _season_from_game_id(gid)
    pbp_dir = (REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play").resolve()
    path = (pbp_dir / f"{gid}.json").resolve()
    if pbp_dir not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid play-by-play path")
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"play_by_play not found for {gid} in {season_key}")
    return _read_json_file(str(path), path.stat().st_mtime_ns)


def get_player_history(player_id: str, request: Request) -> Any:
    _check_token(request)
    pid = str(player_id)

    conn = _get_db_conn()
    if conn is not None:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT games_json, averages_json FROM player_history WHERE player_id = ?", (pid,))
            row = cursor.fetchone()
            if row:
                return {
                    "player_id": pid,
                    "games": json.loads(row[0]),
                    "averages": json.loads(row[1]),
                }
            return {
                "player_id": pid,
                "games": {},
                "averages": {},
            }
        except Exception as e:
            logger.warning("SQLite player_history query failed, falling back to JSON: %s", e)
        finally:
            conn.close()

    # JSON fallback
    games = _load_json("player_season_games.json").get(pid, {})
    averages = _load_json("player_season_averages.json").get(pid, {})
    return {
        "player_id": pid,
        "games": games,
        "averages": averages,
    }


def warm_up_cache() -> None:
    """Pre-warm database and essential files."""
    if DB_PATH.exists():
        logger.info("Found frontend SQLite database at %s. Fast point queries enabled with zero startup RAM.", DB_PATH.name)
        return

    essential_files = [
        "game_details.json",
        "games.json",
        "player_season_averages.json",
        "player_boxscores.json",
    ]
    logger.info("Warming up frontend data cache...")
    for filename in essential_files:
        try:
            path = _resolve_json_path(filename)
            _read_json_file(str(path), path.stat().st_mtime_ns)
            logger.info("Cached %s", filename)
        except Exception as e:
            logger.warning("Failed to cache %s on startup: %s", filename, e)


def get_team_rosters(request: Request, season: str | None = None) -> Any:
    _check_token(request)
    season_key = season or DEFAULT_SEASON

    conn = _get_db_conn()
    if conn is not None:
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT data_json FROM team_rosters WHERE season = ?", (season_key,))
            row = cursor.fetchone()
            if row:
                return json.loads(row[0])
        except Exception as e:
            logger.warning("SQLite team_rosters query failed, falling back to CSV: %s", e)
        finally:
            conn.close()

    path = REPO_ROOT / f"data/season={season_key}/analysis/team_rosters.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"team_rosters not found for {season_key}")
    df = pd.read_csv(path)
    return json.loads(df.to_json(orient="records", double_precision=4))
