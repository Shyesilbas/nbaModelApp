import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException, Request


REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.environ.get("FRONTEND_DATA_DIR", REPO_ROOT / "data" / "frontend")).resolve()
DATA_TOKEN = os.environ.get("NBA_DATA_API_TOKEN")
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
    return "" if not season or season == "2025-26" else f"_{season}"


def _strip_embedded_detail(game: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in game.items() if k != "game_detail"}


def get_game_index(request: Request, season: str | None = None) -> Any:
    _check_token(request)
    if season and season != "2025-26":
        rows = [g for g in _load_json("all_seasons_games.json") if g.get("SEASON") == season]
    else:
        rows = _load_json("games.json")
    return [_strip_embedded_detail(g) for g in rows]


def get_game_detail(game_id: str, request: Request, season: str | None = None) -> Any:
    _check_token(request)
    gid = _norm_game_id(game_id)
    suffix = _season_suffix(season)

    team_rows = [
        row for row in _load_json(f"team_boxscores{suffix}.json")
        if _norm_game_id(row.get("GAME_ID")) == gid
    ]
    player_rows = [
        row for row in _load_json(f"player_boxscores{suffix}.json")
        if _norm_game_id(row.get("GAME_ID")) == gid
    ]

    detail = None
    if not suffix:
        for row in _load_json("game_details.json"):
            if _norm_game_id(row.get("game_id") or row.get("GAME_ID")) == gid:
                detail = row
                break

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
    games = _load_json("player_season_games.json").get(pid, {})
    averages = _load_json("player_season_averages.json").get(pid, {})
    return {
        "player_id": pid,
        "games": games,
        "averages": averages,
    }


def warm_up_cache() -> None:
    """Pre-load largest JSON files into lru_cache on server startup."""
    large_files = [
        "player_season_games.json",
        "game_details.json",
        "games.json",
        "player_season_averages.json",
        "player_boxscores.json",
    ]
    print("⚡ Warming up frontend data cache...")
    for filename in large_files:
        try:
            path = _resolve_json_path(filename)
            _read_json_file(str(path), path.stat().st_mtime_ns)
            print(f"  ✅ Cached {filename}")
        except Exception as e:
            print(f"  ⚠️ Failed to cache {filename} on startup: {e}")


def get_team_rosters(request: Request, season: str | None = None) -> Any:
    _check_token(request)
    season_key = season or "2025-26"
    path = REPO_ROOT / f"data/season={season_key}/analysis/team_rosters.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"team_rosters not found for {season_key}")
    df = pd.read_csv(path)
    return json.loads(df.to_json(orient="records", double_precision=4))
