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
    import pandas as pd
    import os

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

        gd_entry = None
        try:
            import json
            for gd_file in [Path("data/frontend/game_details.json"), Path("frontend/public/data/game_details.json")]:
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
            except Exception:
                pass

            try:
                import json
                for all_games_path in [
                    Path("frontend/public/data/all_seasons_games.json"),
                    Path("data/frontend/all_seasons_games.json"),
                ]:
                    if all_games_path.exists():
                        with open(all_games_path, "r", encoding="utf-8") as f:
                            games_list = json.load(f)
                        updated = False
                        for g in games_list:
                            if str(g.get("GAME_ID", "")).zfill(10) == game_id:
                                g["GAME_STATUS"] = "Final"
                                g["HOME_SCORE"] = home_pts
                                g["AWAY_SCORE"] = away_pts
                                g["WINNER_TEAM_ABBREVIATION"] = winner
                                g["LOSER_TEAM_ABBREVIATION"] = loser
                                updated = True
                        if updated:
                            with open(all_games_path, "w", encoding="utf-8") as f:
                                json.dump(games_list, f, separators=(",", ":"))
            except Exception:
                pass

        payload = None
        try:
            payload = build_play_by_play_payload(game_id, home_team, away_team, 1, 10)
            pbp_dir = Path("data") / f"season={season_key}" / "raw" / "play_by_play"
            write_payload(payload, pbp_dir)
            sync_payload_to_frontend(payload, Path("frontend/public/data/play_by_play"))

            try:
                import json
                from scripts.export_play_by_play_moments import condense_payload

                condensed = condense_payload(payload)
                for moments_dir in [
                    Path("data") / "frontend" / "play_by_play_moments" / season_key,
                    Path("frontend") / "public" / "data" / "play_by_play_moments" / season_key,
                ]:
                    moments_dir.mkdir(parents=True, exist_ok=True)
                    (moments_dir / f"{game_id}.json").write_text(json.dumps(condensed, indent=2), encoding="utf-8")
            except Exception:
                pass

            try:
                import pandas as pd
                from src.features.pbp_situational import parse_pbp_file

                pbp_rec = parse_pbp_file(str(pbp_dir / f"{game_id}.json"))
                if pbp_rec:
                    sit_path = Path("data/processed/pbp_situational_features.parquet")
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
            from scripts.build_frontend_db import build_frontend_db
            build_frontend_db()
        except Exception:
            pass

        with _lock:
            _jobs[game_id] = {"status": "complete", "detail": detail, "play_by_play": payload, "error": None}
    except Exception as exc:
        with _lock:
            _jobs[game_id] = {"status": "failed", "detail": None, "error": str(exc)}

