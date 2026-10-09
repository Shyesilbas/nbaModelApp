"""On-demand ingestion for one completed game, started from its game card."""

from __future__ import annotations

import json
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


def start_refresh(game_id: str, season: str | None = None) -> dict[str, Any]:
    gid = _game_id(game_id)
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

    with _lock:
        current = _jobs.get(gid)
        if current and current["status"] in {"queued", "running"}:
            return {"game_id": gid, **current}
        _jobs[gid] = {"status": "queued", "detail": None, "error": None}

    worker = threading.Thread(target=_run_refresh, args=(gid, resolved_season, home_team, away_team), daemon=True)
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

        gd_entry = None
        try:
            for gd_file in [REPO_ROOT / "data" / "frontend" / "game_details.json", REPO_ROOT / "frontend" / "public" / "data" / "game_details.json"]:
                if gd_file.exists():
                    with open(gd_file, "r", encoding="utf-8") as f:
                        gd_all = json.load(f)
                    for item in gd_all:
                        if str(item.get("game_id", "")).zfill(10) == game_id:
                            gd_entry = item
                            break
                    if gd_entry:
                        break
        except Exception:
            pass

        detail = {
            "game_id": game_id,
            "game_detail": gd_entry,
            "team_boxscores": _records(team_bs, game_id),
            "player_boxscores": _records(player_bs, game_id),
        }

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

            try:
                from scripts.export_frontend_data import export_data
                from scripts.export_all_seasons_games import main as export_all_main

                for out_dir in [str(REPO_ROOT / "data" / "frontend"), str(REPO_ROOT / "frontend" / "public" / "data")]:
                    export_data(season=season_key, out_dir=out_dir)
                    export_all_main(out_dir=out_dir)
            except Exception as e:
                logger.warning("Error running frontend exports: %s", e)

            try:
                import sqlite3
                db_path = REPO_ROOT / "data" / "frontend" / "nba_frontend.db"
                if db_path.exists():
                    conn = sqlite3.connect(db_path)
                    cur = conn.cursor()

                    cur.execute("SELECT season, data_json FROM games_index WHERE game_id = ?", (game_id,))
                    existing_rows = cur.fetchall()
                    if existing_rows:
                        for s_val, dj_val in existing_rows:
                            g_obj = json.loads(dj_val)
                            g_obj["GAME_STATUS"] = "Final"
                            g_obj["HOME_SCORE"] = home_pts
                            g_obj["AWAY_SCORE"] = away_pts
                            g_obj["WINNER_TEAM_ABBREVIATION"] = winner
                            g_obj["LOSER_TEAM_ABBREVIATION"] = loser
                            cur.execute(
                                "UPDATE games_index SET data_json = ? WHERE season = ? AND game_id = ?",
                                (json.dumps(g_obj), s_val, game_id),
                            )
                    else:
                        games_file = REPO_ROOT / "data" / "frontend" / "games.json"
                        if games_file.exists():
                            with open(games_file, "r", encoding="utf-8") as f:
                                all_g = json.load(f)
                            for g in all_g:
                                if str(g.get("GAME_ID", "")).zfill(10) == game_id:
                                    cur.execute(
                                        "INSERT OR REPLACE INTO games_index (season, game_id, data_json) VALUES (?, ?, ?)",
                                        (season_key, game_id, json.dumps(g)),
                                    )
                                    break

                    cur.execute("DELETE FROM team_boxscores WHERE game_id = ? AND season = ?", (game_id, season_key))
                    t_rows = _records(team_bs, game_id)
                    for tr in t_rows:
                        cur.execute(
                            "INSERT INTO team_boxscores (game_id, season, data_json) VALUES (?, ?, ?)",
                            (game_id, season_key, json.dumps(tr)),
                        )

                    cur.execute("DELETE FROM player_boxscores WHERE game_id = ? AND season = ?", (game_id, season_key))
                    p_rows = _records(player_bs, game_id)
                    for pr in p_rows:
                        pid = pr.get("PLAYER_ID")
                        try:
                            pid = int(pid) if pid is not None else None
                        except (ValueError, TypeError):
                            pid = None
                        cur.execute(
                            "INSERT INTO player_boxscores (game_id, player_id, season, data_json) VALUES (?, ?, ?, ?)",
                            (game_id, pid, season_key, json.dumps(pr)),
                        )

                    if not gd_entry:
                        for gd_file in [REPO_ROOT / "data" / "frontend" / "game_details.json", REPO_ROOT / "frontend" / "public" / "data" / "game_details.json"]:
                            if gd_file.exists():
                                try:
                                    with open(gd_file, "r", encoding="utf-8") as f:
                                        for item in json.load(f):
                                            if str(item.get("game_id", "")).zfill(10) == game_id:
                                                gd_entry = item
                                                break
                                    if gd_entry:
                                        detail["game_detail"] = gd_entry
                                        break
                                except Exception:
                                    pass

                    if gd_entry:
                        cur.execute(
                            "INSERT OR REPLACE INTO game_details (game_id, data_json) VALUES (?, ?)",
                            (game_id, json.dumps(gd_entry)),
                        )

                    for sf_name in ["games.json", "all_seasons_games.json", "manifest.json", "schedule.json"]:
                        sf_path = REPO_ROOT / "data" / "frontend" / sf_name
                        if sf_path.exists():
                            cur.execute(
                                "INSERT OR REPLACE INTO static_files (filename, data_json) VALUES (?, ?)",
                                (sf_name, sf_path.read_text(encoding="utf-8")),
                            )

                    conn.commit()
                    conn.close()
            except Exception as e:
                logger.warning("Error updating SQLite tables for game %s: %s", game_id, e)

        payload = None
        try:
            payload = build_play_by_play_payload(game_id, home_team, away_team, 1, 10)
            pbp_dir = REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play"
            write_payload(payload, pbp_dir)
            sync_payload_to_frontend(payload, REPO_ROOT / "frontend" / "public" / "data" / "play_by_play")

            try:
                from scripts.export_play_by_play_moments import condense_payload

                condensed = condense_payload(payload)
                for moments_dir in [
                    REPO_ROOT / "data" / "frontend" / "play_by_play_moments" / season_key,
                    REPO_ROOT / "frontend" / "public" / "data" / "play_by_play_moments" / season_key,
                ]:
                    moments_dir.mkdir(parents=True, exist_ok=True)
                    (moments_dir / f"{game_id}.json").write_text(json.dumps(condensed, indent=2), encoding="utf-8")
            except Exception:
                pass

            try:
                from src.features.pbp_situational import parse_pbp_file

                pbp_rec = parse_pbp_file(str(pbp_dir / f"{game_id}.json"))
                if pbp_rec:
                    sit_path = REPO_ROOT / "data" / "processed" / "pbp_situational_features.parquet"
                    if sit_path.exists():
                        sit_df = pd.read_parquet(sit_path)
                        sit_df = sit_df[sit_df["GAME_ID"].astype(str).str.zfill(10) != game_id]
                        new_row = pd.DataFrame([pbp_rec])
                        sit_df = pd.concat([sit_df, new_row], ignore_index=True)
                        sit_df.to_parquet(sit_path, index=False)
            except Exception:
                pass
        except Exception:
            pass

        try:
            from .frontend_data import _read_json_file, _get_game_grouped_boxscores, _get_game_details_index
            _read_json_file.cache_clear()
            _get_game_grouped_boxscores.cache_clear()
            _get_game_details_index.cache_clear()
        except Exception:
            pass

        with _lock:
            _jobs[game_id] = {"status": "complete", "detail": detail, "play_by_play": payload, "error": None}
    except Exception as exc:
        logger.exception("Error during on-demand game data refresh for %s: %s", game_id, exc)
        with _lock:
            _jobs[game_id] = {"status": "failed", "detail": None, "error": str(exc)}

