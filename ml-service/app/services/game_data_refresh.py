"""On-demand ingestion for one completed game, started from its game card."""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def _game_id(value: str) -> str:
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Invalid game ID")
    return digits


def start_refresh(game_id: str, season: str) -> dict[str, Any]:
    gid = _game_id(game_id)
    from scripts.data_paths import get_data_paths
    import pandas as pd

    try:
        schedule_path = get_data_paths(season).schedule_combined
        schedule = pd.read_csv(schedule_path, dtype={"GAME_ID": str})
        row = schedule[schedule["GAME_ID"].astype(str).str.zfill(10) == gid]
        if row.empty or "GAME_START_UTC" not in row:
            raise HTTPException(status_code=503, detail="Scheduled start time is unavailable for this game")
        game_row = row.iloc[0]
        home_team = game_row.get("HOME_TEAM_ABBREVIATION")
        away_team = game_row.get("AWAY_TEAM_ABBREVIATION")
        home_team = str(home_team) if pd.notna(home_team) else None
        away_team = str(away_team) if pd.notna(away_team) else None
        start_value = row.iloc[0]["GAME_START_UTC"]
        start = datetime.fromisoformat(str(start_value).replace("Z", "+00:00"))
        if start.tzinfo is None:
            raise ValueError("timezone is required")
        start = start.astimezone(timezone.utc)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not read the scheduled game start time") from exc
    if datetime.now(timezone.utc) < start + timedelta(hours=4):
        raise HTTPException(status_code=403, detail="Game data can be requested 4 hours after scheduled start")

    with _lock:
        current = _jobs.get(gid)
        if current and current["status"] in {"queued", "running", "complete"}:
            return {"game_id": gid, **current}
        _jobs[gid] = {"status": "queued", "detail": None, "error": None}

    worker = threading.Thread(target=_run_refresh, args=(gid, season, home_team, away_team), daemon=True)
    worker.start()
    return {"game_id": gid, "status": "queued", "detail": None, "error": None}


def get_refresh_status(game_id: str) -> dict[str, Any]:
    gid = _game_id(game_id)
    with _lock:
        job = _jobs.get(gid)
    if not job:
        raise HTTPException(status_code=404, detail="No refresh job found for this game")
    return {"game_id": gid, **job}


def get_completed_detail(game_id: str) -> dict[str, Any] | None:
    gid = _game_id(game_id)
    with _lock:
        job = _jobs.get(gid)
        if job and job.get("status") == "complete":
            return job.get("detail")
    return None


def _records(frame, game_id: str) -> list[dict[str, Any]]:
    rows = frame[frame["GAME_ID"].astype(str).str.zfill(10) == game_id]
    return rows.astype(object).where(rows.notna(), None).to_dict(orient="records")


def _run_refresh(game_id: str, season: str, home_team: str | None, away_team: str | None) -> None:
    with _lock:
        _jobs[game_id]["status"] = "running"
    try:
        from src.ingestion.team_games_fetcher import (
            append_team_games_to_raw_dataset,
            fetch_missing_team_games_by_game_ids,
        )
        from src.ingestion.player_games_fetcher import (
            append_player_games_to_raw_dataset,
            fetch_missing_player_games_by_game_ids,
        )
        from src.ingestion.boxscore_service import BoxscoreService
        from scripts.build_play_by_play import (
            build_play_by_play_payload,
            sync_payload_to_frontend,
            write_payload,
        )
        from scripts.season_utils import normalize_season
        from pathlib import Path

        season_key = normalize_season(season)
        team = fetch_missing_team_games_by_game_ids([game_id], season=season_key)
        if team.empty:
            raise RuntimeError("NBA API returned no team boxscore rows; retry later")
        append_team_games_to_raw_dataset(team, season=season_key)

        players = fetch_missing_player_games_by_game_ids([game_id], season=season_key)
        if players.empty:
            raise RuntimeError("NBA API returned no player boxscore rows; retry later")
        append_player_games_to_raw_dataset(players, season=season_key)

        team_bs, player_bs, _ = BoxscoreService(save=True, season=season_key).run_and_export()
        detail = {
            "game_id": game_id,
            "game_detail": None,
            "team_boxscores": _records(team_bs, game_id),
            "player_boxscores": _records(player_bs, game_id),
        }

        payload = build_play_by_play_payload(game_id, home_team, away_team, 1, 4)
        pbp_dir = Path("data") / f"season={season_key}" / "raw" / "play_by_play"
        write_payload(payload, pbp_dir)
        sync_payload_to_frontend(payload, Path("frontend/public/data/play_by_play"))
        with _lock:
            _jobs[game_id] = {"status": "complete", "detail": detail, "play_by_play": payload, "error": None}
    except Exception as exc:
        with _lock:
            _jobs[game_id] = {"status": "failed", "detail": None, "error": str(exc)}
