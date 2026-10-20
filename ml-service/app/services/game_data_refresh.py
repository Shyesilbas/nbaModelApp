"""On-demand ingestion for one completed game, started from its game card."""

from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


def _game_id(value: str) -> str:
    digits = "".join(ch for ch in str(value) if ch.isdigit())
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Invalid game ID")
    return digits


def _infer_season_from_game_id(game_id: str) -> str:
    gid = _game_id(game_id)
    if len(gid) >= 5:
        yy = gid[3:5]
        try:
            year = int(yy)
            start_year = 2000 + year
            return f"{start_year}-{str(start_year + 1)[-2:]}"
        except Exception:
            pass
    return "2025-26"


def _resolve_game(gid: str, season: str | None) -> tuple[str, str, str | None, str | None]:
    from scripts.data_paths import get_data_paths
    from scripts.season_utils import normalize_season

    resolved_season = normalize_season(season) if season else _infer_season_from_game_id(gid)

    home_team = None
    away_team = None

    try:
        schedule_path = get_data_paths(resolved_season).schedule_combined
        if os.path.exists(schedule_path):
            schedule = pd.read_csv(schedule_path, dtype={"GAME_ID": str})
            row = schedule[schedule["GAME_ID"].astype(str).str.zfill(10) == gid]
            if not row.empty:
                game_row = row.iloc[0]
                h = game_row.get("HOME_TEAM_ABBREVIATION")
                a = game_row.get("AWAY_TEAM_ABBREVIATION")
                home_team = str(h) if pd.notna(h) else None
                away_team = str(a) if pd.notna(a) else None
    except Exception:
        pass

    if not home_team or not away_team:
        for alt_s in ["2026-27", "2025-26", "2024-25"]:
            if alt_s == resolved_season:
                continue
            try:
                alt_path = get_data_paths(alt_s).schedule_combined
                if os.path.exists(alt_path):
                    schedule = pd.read_csv(alt_path, dtype={"GAME_ID": str})
                    row = schedule[schedule["GAME_ID"].astype(str).str.zfill(10) == gid]
                    if not row.empty:
                        resolved_season = alt_s
                        game_row = row.iloc[0]
                        h = game_row.get("HOME_TEAM_ABBREVIATION")
                        a = game_row.get("AWAY_TEAM_ABBREVIATION")
                        home_team = str(h) if pd.notna(h) else None
                        away_team = str(a) if pd.notna(a) else None
                        break
            except Exception:
                pass
    return gid, resolved_season, home_team, away_team


def start_refresh(game_id: str, season: str | None = None) -> dict[str, Any]:
    gid = _game_id(game_id)
    gid, resolved_season, home_team, away_team = _resolve_game(gid, season)

    with _lock:
        current = _jobs.get(gid)
        if current and current["status"] in {"queued", "running"}:
            return {"game_id": gid, **current}
        _jobs[gid] = {"status": "queued", "detail": None, "error": None}

    worker = threading.Thread(target=_run_refresh, args=(gid, resolved_season, home_team, away_team), daemon=True)
    worker.start()
    return {"game_id": gid, "status": "queued", "detail": None, "error": None}


def missing_game_ids(game_ids: list[str], season: str | None = None) -> list[str]:
    """Games whose player box scores are not in the raw dataset yet."""
    from scripts.data_paths import get_data_paths

    gids = list(dict.fromkeys(_game_id(g) for g in game_ids))
    have: dict[str, set[str]] = {}
    out = []
    for g in gids:
        _, resolved, _, _ = _resolve_game(g, season)
        if resolved not in have:
            path = get_data_paths(resolved).player_games_raw
            have[resolved] = set(pd.read_csv(path, usecols=["Game_ID"], dtype=str)["Game_ID"].str.zfill(10)) if os.path.exists(path) else set()
        if g not in have[resolved]:
            out.append(g)
    return out


def start_batch_refresh(game_ids: list[str], season: str | None = None) -> dict[str, Any]:
    """One background worker refreshes the games one after another: the ingest/export steps
    rewrite shared files, so running them in parallel threads would corrupt each other."""
    gids = missing_game_ids(game_ids, season)  # fetched games are left alone
    with _lock:
        todo = [g for g in gids if _jobs.get(g, {}).get("status") not in {"queued", "running"}]
        for g in todo:
            _jobs[g] = {"status": "queued", "detail": None, "error": None}

    def _worker():
        for g in todo:
            _, resolved, home, away = _resolve_game(g, season)
            _run_refresh(g, resolved, home, away)

    if todo:
        threading.Thread(target=_worker, daemon=True).start()
    return {"game_ids": gids, "queued": todo}


def get_batch_status(game_ids: list[str]) -> dict[str, Any]:
    """Per-game status (no detail payload; clients fetch it from the single-game status)."""
    out = {}
    with _lock:
        for g in dict.fromkeys(_game_id(x) for x in game_ids):
            job = _jobs.get(g)
            out[g] = {"status": job["status"], "error": job.get("error")} if job else {"status": "unknown", "error": None}
    return {"games": out}


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


def _rebuild_frontend_store(season_key: str) -> None:
    """Rebuild the season's frontend store (and the global one) from the refreshed data."""
    from src.analysis.live_roster_refresh import build_live_roster
    from src.frontend_store.builders import build_global_store, build_season_store

    try:
        build_live_roster(season_key)
    except Exception as e:
        logger.warning("Error building live roster: %s", e)
    build_season_store(season_key, force=True)
    build_global_store()


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
        from scripts.build_play_by_play import build_play_by_play_payload, write_payload
        from scripts.season_utils import normalize_season

        season_key = normalize_season(season)
        team = fetch_missing_team_games_by_game_ids([game_id], season=season_key)
        if team.empty:
            raise RuntimeError("NBA API returned no team boxscore rows; retry later")
        append_team_games_to_raw_dataset(team, season=season_key)

        players = fetch_missing_player_games_by_game_ids([game_id], season=season_key)
        if players.empty:
            raise RuntimeError("NBA API returned no player boxscore rows; retry later")
        append_player_games_to_raw_dataset(players, season=season_key)

        try:
            from src.ingestion.starters_fetcher import collect_starters
            collect_starters([game_id], season=season_key)
        except Exception as exc:  # starters are a side record; never fail the refresh over them
            logger.warning("Starter recording failed for %s: %s", game_id, exc)

        team_bs, player_bs, _ = BoxscoreService(save=True, season=season_key).run_and_export()

        # Fallback to team boxscores for abbreviations and scores
        home_pts = None
        away_pts = None
        winner = None
        loser = None
        teams = team_bs[team_bs["GAME_ID"].astype(str).str.zfill(10) == game_id]
        if not home_team or not away_team:
            for _, trow in teams.iterrows():
                m = str(trow.get("MATCHUP", ""))
                if "vs." in m:
                    home_team = home_team or trow.get("TEAM_ABBREVIATION")
                elif "@" in m:
                    away_team = away_team or trow.get("TEAM_ABBREVIATION")

        for _, trow in teams.iterrows():
            tabbr = str(trow.get("TEAM_ABBREVIATION", ""))
            pts = trow.get("PTS")
            wl = trow.get("WL")
            if tabbr == home_team:
                home_pts = int(pts) if pd.notna(pts) else None
                if wl == "W":
                    winner = home_team
                elif wl == "L":
                    loser = home_team
            elif tabbr == away_team:
                away_pts = int(pts) if pd.notna(pts) else None
                if wl == "W":
                    winner = away_team
                elif wl == "L":
                    loser = away_team

        if home_pts is not None and away_pts is not None:
            if not winner:
                winner = home_team if home_pts > away_pts else away_team
                loser = away_team if home_pts > away_pts else home_team

            try:
                from scripts.data_paths import get_data_paths
                gr_path = Path(get_data_paths(season_key).game_results)
                if gr_path.exists():
                    gr_df = pd.read_csv(gr_path, dtype={"GAME_ID": str})
                    mask = gr_df["GAME_ID"].astype(str).str.zfill(10) == game_id
                    if mask.any():
                        gr_df.loc[mask, "GAME_STATUS"] = "Final"
                        gr_df.loc[mask, "HOME_SCORE"] = home_pts
                        gr_df.loc[mask, "AWAY_SCORE"] = away_pts
                        gr_df.loc[mask, "WINNER_TEAM_ABBREVIATION"] = winner
                        gr_df.loc[mask, "LOSER_TEAM_ABBREVIATION"] = loser
                        gr_df.to_csv(gr_path, index=False)
            except Exception as e:
                logger.warning("Error updating game_results.csv: %s", e)

        payload = None
        try:
            payload = build_play_by_play_payload(game_id, home_team, away_team, 1, 10)
            pbp_dir = REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play"
            write_payload(payload, pbp_dir)
            try:
                from src.features.pbp_situational import parse_pbp_file

                pbp_rec = parse_pbp_file(str(pbp_dir / f"{game_id}.json"))
                if pbp_rec:
                    sit_path = REPO_ROOT / "data" / "processed" / "pbp_situational_features.csv"
                    if sit_path.exists():
                        sit_df = pd.read_csv(sit_path)
                        sit_df = sit_df[sit_df["GAME_ID"].astype(str).str.zfill(10) != game_id]
                        new_row = pd.DataFrame([pbp_rec])
                        sit_df = pd.concat([sit_df, new_row], ignore_index=True)
                        sit_df.to_csv(sit_path, index=False)
            except Exception as exc:
                logger.warning("PBP situational features failed for %s: %s", game_id, exc)
        except Exception as exc:
            logger.warning("Play-by-play fetch failed for %s: %s", game_id, exc)

        _rebuild_frontend_store(season_key)
        from .frontend_data import game_detail_payload

        detail = game_detail_payload(game_id, season_key)

        with _lock:
            _jobs[game_id] = {"status": "complete", "detail": detail, "play_by_play": payload, "error": None}
    except Exception as exc:
        logger.exception("Error during on-demand game data refresh for %s: %s", game_id, exc)
        with _lock:
            _jobs[game_id] = {"status": "failed", "detail": None, "error": str(exc)}

