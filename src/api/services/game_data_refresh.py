"""On-demand ingestion for completed games, started from the fixtures list or game card."""

from __future__ import annotations

import json
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[3]

_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}
_pending_flush: set[str] = set()
# Refreshes read, append and rewrite shared season files; a single-game refresh and a batch
# running at the same time would drop each other's rows.
_ingest_lock = threading.Lock()

# Coalesced background store rebuild state so finished refreshes release _ingest_lock quickly.
_store_rebuild_lock = threading.Lock()
_store_rebuild_cond = threading.Condition(_store_rebuild_lock)
_pending_store_seasons: list[str] = []
_store_rebuild_running = False
_upsert_seq = 0
_committed_flush_seq: dict[str, int] = {}
_recent_upserts: dict[str, list[tuple[int, tuple[Any, ...]]]] = {}

_INTERACTIVE_API_KWARGS = {
    "max_retries": 2,
    "initial_backoff": 0.4,
    "timeout": 25,
    "min_sleep": 0.15,
    "max_sleep": 0.35,
}


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
            start_year = 2000 + int(yy)
            return f"{start_year}-{str(start_year + 1)[-2:]}"
        except Exception:
            pass
    return "2025-26"


def _load_schedule_df(season_key: str) -> pd.DataFrame:
    from src.core.data_paths import get_data_paths

    try:
        schedule_path = get_data_paths(season_key).schedule_combined
        if os.path.exists(schedule_path):
            df = pd.read_csv(schedule_path, dtype={"GAME_ID": str})
            if not df.empty and "GAME_ID" in df.columns:
                df["GAME_ID"] = df["GAME_ID"].astype(str).str.zfill(10)
            return df
    except Exception:
        pass
    return pd.DataFrame()


def _get_schedule(season_key: str, cache: dict[str, pd.DataFrame] | None) -> pd.DataFrame:
    if cache is not None:
        if season_key not in cache:
            cache[season_key] = _load_schedule_df(season_key)
        return cache[season_key]
    return _load_schedule_df(season_key)


def _match_schedule_teams(schedule: pd.DataFrame, gid: str) -> tuple[str | None, str | None]:
    if schedule.empty or "GAME_ID" not in schedule.columns:
        return None, None
    row = schedule[schedule["GAME_ID"] == gid]
    if row.empty:
        return None, None
    game_row = row.iloc[0]
    h = game_row.get("HOME_TEAM_ABBREVIATION")
    a = game_row.get("AWAY_TEAM_ABBREVIATION")
    return (str(h) if pd.notna(h) else None), (str(a) if pd.notna(a) else None)


def _resolve_game(
    gid: str,
    season: str | None,
    schedule_cache: dict[str, pd.DataFrame] | None = None,
) -> tuple[str, str, str | None, str | None]:
    from src.core.season_utils import normalize_season

    resolved_season = normalize_season(season) if season else _infer_season_from_game_id(gid)
    home_team, away_team = _match_schedule_teams(_get_schedule(resolved_season, schedule_cache), gid)

    if not home_team or not away_team:
        for alt_s in ["2026-27", "2025-26", "2024-25"]:
            if alt_s == resolved_season:
                continue
            h_alt, a_alt = _match_schedule_teams(_get_schedule(alt_s, schedule_cache), gid)
            if h_alt or a_alt:
                resolved_season = alt_s
                home_team, away_team = h_alt, a_alt
                break
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
    from src.core.data_paths import get_data_paths

    gids = list(dict.fromkeys(_game_id(g) for g in game_ids))
    have: dict[str, set[str]] = {}
    schedule_cache: dict[str, pd.DataFrame] = {}
    with _lock:
        pending_flush_snapshot = set(_pending_flush)
    out = []
    for g in gids:
        if g in pending_flush_snapshot:
            continue
        _, resolved, _, _ = _resolve_game(g, season, schedule_cache=schedule_cache)
        if resolved not in have:
            path = get_data_paths(resolved).player_games_raw
            have[resolved] = (
                set(pd.read_csv(path, usecols=["Game_ID"], dtype=str)["Game_ID"].str.zfill(10))
                if os.path.exists(path)
                else set()
            )
        if g not in have[resolved]:
            out.append(g)
    return out


def start_batch_refresh(game_ids: list[str], season: str | None = None) -> dict[str, Any]:
    """Background worker fetches batch games progressively and flushes season files once."""
    gids = missing_game_ids(game_ids, season)  # fetched games are left alone
    with _lock:
        todo = [g for g in gids if _jobs.get(g, {}).get("status") not in {"queued", "running"}]
        for g in todo:
            _jobs[g] = {"status": "queued", "detail": None, "error": None}

    def _worker():
        schedule_cache: dict[str, pd.DataFrame] = {}
        resolved = []
        for g in todo:
            _, season_key, home, away = _resolve_game(g, season, schedule_cache=schedule_cache)
            resolved.append((g, season_key, home, away))
        with _ingest_lock:
            _refresh_many_locked(resolved, schedule_cache=schedule_cache)

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


def _record_upsert(season_key: str, *upsert_args: Any, mark_flushed: bool = False) -> None:
    """Remember recent single-game SQLite upserts so a concurrent rebuild never drops them."""
    global _upsert_seq
    with _store_rebuild_lock:
        _upsert_seq += 1
        bucket = _recent_upserts.setdefault(season_key, [])
        bucket.append((_upsert_seq, upsert_args))
        if len(bucket) > 64:
            del bucket[:-64]
        if mark_flushed:
            _committed_flush_seq[season_key] = _upsert_seq


def _replay_newer_upserts(season_key: str, included_seq: int) -> None:
    from src.frontend_store.builders import upsert_game_to_season_store

    with _store_rebuild_lock:
        entries = list(_recent_upserts.get(season_key, []))
        newer = [(seq, args) for seq, args in entries if seq > included_seq]
        _recent_upserts[season_key] = newer
    for _, args in newer:
        try:
            upsert_game_to_season_store(*args)
        except Exception as exc:
            logger.warning("Upsert replay failed for %s: %s", season_key, exc)


def _schedule_store_rebuild(season_key: str) -> None:
    """Queue a non-blocking, coalesced frontend store rebuild after releasing _ingest_lock."""
    global _store_rebuild_running
    with _store_rebuild_lock:
        if season_key not in _pending_store_seasons:
            _pending_store_seasons.append(season_key)
        if _store_rebuild_running:
            return
        _store_rebuild_running = True

    def _worker() -> None:
        global _store_rebuild_running
        while True:
            with _store_rebuild_lock:
                if not _pending_store_seasons:
                    _store_rebuild_running = False
                    _store_rebuild_cond.notify_all()
                    return
                target_season = _pending_store_seasons.pop(0)
                included_seq = _committed_flush_seq.get(target_season, 0)
            try:
                _rebuild_frontend_store(target_season)
                _replay_newer_upserts(target_season, included_seq)
            except Exception as exc:
                logger.warning("Post-refresh frontend store rebuild failed for %s: %s", target_season, exc)

    threading.Thread(target=_worker, daemon=True).start()


def wait_for_store_rebuild(timeout: float = 30.0) -> bool:
    """Wait for any queued background store rebuilds to finish (useful in tests)."""
    with _store_rebuild_lock:
        return _store_rebuild_cond.wait_for(lambda: not _store_rebuild_running, timeout=timeout)


def _run_refresh(game_id: str, season: str, home_team: str | None, away_team: str | None) -> None:
    with _ingest_lock:
        _refresh_locked(game_id, season, home_team, away_team)


def _fetch_game_raw(
    game_id: str,
    season_key: str,
    schedule_df: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Fetch one game's team, player, and starter DataFrames without touching season CSVs.

    All three callers share the 120s BoxScoreTraditionalV3 (and V2 fallback) response cache in nba_api_client.
    """
    from src.ingestion.nba_api_client import clear_boxscore_cache
    from src.ingestion.player_games_fetcher import fetch_player_games_from_boxscore
    from src.ingestion.starters_fetcher import fetch_game_starters
    from src.ingestion.team_games_fetcher import fetch_team_games_from_boxscore

    clear_boxscore_cache(game_id)

    team = fetch_team_games_from_boxscore(game_id, schedule_df=schedule_df, season=season_key)
    if team.empty:
        raise RuntimeError("NBA API returned no team boxscore rows; retry later")

    players = fetch_player_games_from_boxscore(game_id, schedule_df=schedule_df, season=season_key)
    if players.empty:
        raise RuntimeError("NBA API returned no player boxscore rows; retry later")

    starters = pd.DataFrame()
    try:
        starters = fetch_game_starters(game_id)
    except Exception as exc:  # starters are a side record; never fail the refresh over them
        logger.warning("Starter recording failed for %s: %s", game_id, exc)

    return team, players, starters


def _build_in_memory_detail(
    gid: str,
    season_key: str,
    team_df: pd.DataFrame,
    player_df: pd.DataFrame,
    starters_df: pd.DataFrame,
    schedule_df: pd.DataFrame | None,
) -> tuple[dict[str, Any], dict | None]:
    """Build game detail, normalized boxscores, and feed row in memory for immediate display."""
    from src.frontend_store.builders import _records, build_game_detail
    from src.ingestion.boxscore_loader import (
        assemble_game_results,
        normalize_player_boxscores,
        normalize_team_boxscores,
    )

    team_bs = normalize_team_boxscores(team_df)
    player_bs = normalize_player_boxscores(player_df, starters_df=starters_df if not starters_df.empty else None)
    results_df = assemble_game_results(team_bs, schedule_df=schedule_df, season=season_key)

    team_rows = _records(team_bs)
    player_rows = _records(player_bs)
    result_rows = _records(results_df)
    result_row = result_rows[0] if result_rows else None

    sched_row: dict[str, Any] = {}
    if schedule_df is not None and not schedule_df.empty and "GAME_ID" in schedule_df.columns:
        matched = schedule_df[schedule_df["GAME_ID"].astype(str).str.zfill(10) == gid]
        if not matched.empty:
            sched_records = _records(matched.iloc[[0]])
            if sched_records:
                sched_row = sched_records[0]

    merged_row = dict(sched_row)
    if result_row:
        for k, v in result_row.items():
            if v is not None or k not in merged_row:
                merged_row[k] = v
    merged_row["GAME_ID"] = gid
    merged_row["SEASON"] = season_key

    detail = build_game_detail(season_key, merged_row, player_rows)
    detail["team_stats"] = team_rows
    payload = {
        "game_id": gid,
        "game_detail": detail,
        "team_boxscores": team_rows,
        "player_boxscores": player_rows,
    }
    return payload, merged_row


def _flush_season_raw(
    season_key: str,
    fetched_rows: list[tuple[str, pd.DataFrame, pd.DataFrame, pd.DataFrame]],
) -> None:
    """Append all newly fetched games for a season to raw CSVs and export boxscores once."""
    from src.ingestion.boxscore_service import BoxscoreService
    from src.ingestion.player_games_fetcher import append_player_games_to_raw_dataset
    from src.ingestion.starters_fetcher import append_starters
    from src.ingestion.team_games_fetcher import append_team_games_to_raw_dataset

    if not fetched_rows:
        return

    gids = [gid for gid, _, _, _ in fetched_rows]
    try:
        team_all = pd.concat([t for _, t, _, _ in fetched_rows if not t.empty], ignore_index=True)
        player_all = pd.concat([p for _, _, p, _ in fetched_rows if not p.empty], ignore_index=True)
        starter_frames = [s for _, _, _, s in fetched_rows if not s.empty]

        if not team_all.empty:
            append_team_games_to_raw_dataset(team_all, season=season_key)
        if not player_all.empty:
            append_player_games_to_raw_dataset(player_all, season=season_key)
        if starter_frames:
            append_starters(pd.concat(starter_frames, ignore_index=True), season=season_key)

        BoxscoreService(save=True, season=season_key, warm_summaries=False).run_and_export()
        with _store_rebuild_lock:
            _committed_flush_seq[season_key] = _upsert_seq
    finally:
        with _lock:
            _pending_flush.difference_update(gids)


def _resolve_teams_from_df(
    team_df: pd.DataFrame,
    game_id: str,
    home_team: str | None,
    away_team: str | None,
) -> tuple[str | None, str | None]:
    if home_team and away_team:
        return home_team, away_team
    if team_df.empty or "GAME_ID" not in team_df.columns:
        return home_team, away_team
    teams = team_df[team_df["GAME_ID"].astype(str).str.zfill(10) == game_id]
    for _, trow in teams.iterrows():
        m = str(trow.get("MATCHUP", ""))
        if "vs." in m:
            home_team = home_team or trow.get("TEAM_ABBREVIATION")
        elif "@" in m:
            away_team = away_team or trow.get("TEAM_ABBREVIATION")
    return home_team, away_team


def _fetch_and_write_pbp(
    game_id: str,
    season_key: str,
    home_team: str | None,
    away_team: str | None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Fetch/read play-by-play JSON and parse its situational record without rewriting the CSV."""
    from src.processing.build_play_by_play import build_play_by_play_payload, write_payload

    pbp_dir = REPO_ROOT / "data" / f"season={season_key}" / "raw" / "play_by_play"
    pbp_path = pbp_dir / f"{game_id}.json"

    payload: dict[str, Any] | None = None
    if pbp_path.exists():
        try:
            payload = json.loads(pbp_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = None

    if payload is None:
        try:
            payload = build_play_by_play_payload(game_id, home_team, away_team, 1, 10)
            write_payload(payload, pbp_dir)
        except Exception as exc:
            logger.warning("Play-by-play fetch failed for %s: %s", game_id, exc)
            return None, None

    pbp_rec: dict[str, Any] | None = None
    try:
        from src.features.pbp_situational import parse_pbp_file
        pbp_rec = parse_pbp_file(str(pbp_path))
    except Exception as exc:
        logger.warning("PBP situational features failed for %s: %s", game_id, exc)
    return payload, pbp_rec


def _append_pbp_situational_batch(records: list[dict[str, Any]]) -> None:
    """Update pbp_situational.csv once for a batch of games."""
    if not records:
        return
    try:
        from src.core.data_paths import PBP_SITUATIONAL_CSV
        from src.ingestion.atomic_io import write_csv_atomic

        sit_path = PBP_SITUATIONAL_CSV
        new_df = pd.DataFrame(records)
        new_gids = set(new_df["GAME_ID"].astype(str).str.zfill(10))
        if sit_path.exists():
            sit_df = pd.read_csv(sit_path)
            sit_df = sit_df[~sit_df["GAME_ID"].astype(str).str.zfill(10).isin(new_gids)]
            sit_df = pd.concat([sit_df, new_df], ignore_index=True)
        else:
            sit_df = new_df
        write_csv_atomic(sit_df, sit_path)
    except Exception as exc:
        logger.warning("Failed updating PBP situational CSV: %s", exc)


def _fetch_summary_safe(game_id: str, season_key: str) -> None:
    try:
        from src.ingestion.game_summary_fetcher import fetch_game_summary
        fetch_game_summary(game_id, season=season_key)
    except Exception as exc:
        logger.warning("Game summary unavailable for %s: %s", game_id, exc)


def _enrich_season_secondary(
    season_key: str,
    games: list[tuple[str, str | None, str | None]],
) -> None:
    """Fetch summaries and PBP only for the newly refreshed games, then sync the frontend store."""
    if not games:
        return

    from src.ingestion.nba_api_client import api_call_options

    pbp_records: list[dict[str, Any]] = []

    def _run_summary(gid: str) -> tuple[str, str, Any]:
        with api_call_options(**_INTERACTIVE_API_KWARGS):
            _fetch_summary_safe(gid, season_key)
        return gid, "summary", None

    def _run_pbp(gid: str, home: str | None, away: str | None) -> tuple[str, str, tuple[dict | None, dict | None]]:
        with api_call_options(**_INTERACTIVE_API_KWARGS):
            return gid, "pbp", _fetch_and_write_pbp(gid, season_key, home, away)

    workers = max(1, min(4, len(games) * 2))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = []
        for gid, home, away in games:
            futures.append(pool.submit(_run_summary, gid))
            futures.append(pool.submit(_run_pbp, gid, home, away))
        for fut in as_completed(futures):
            try:
                gid, kind, res = fut.result()
                if kind == "pbp":
                    payload, pbp_rec = res
                    if pbp_rec:
                        pbp_records.append(pbp_rec)
                    if payload is not None:
                        with _lock:
                            if gid in _jobs and _jobs[gid].get("status") == "complete":
                                _jobs[gid]["play_by_play"] = payload
            except Exception as exc:
                logger.warning("Secondary enrichment failed: %s", exc)

    _append_pbp_situational_batch(pbp_records)
    _schedule_store_rebuild(season_key)


def _fail(game_id: str, exc: Exception) -> None:
    logger.error("Error during on-demand game data refresh for %s: %s", game_id, exc, exc_info=exc)
    with _lock:
        _pending_flush.discard(game_id)
        _jobs[game_id] = {"status": "failed", "detail": None, "error": str(exc)}


def _refresh_locked(game_id: str, season: str, home_team: str | None, away_team: str | None) -> None:
    """Single-game refresh: fetch boxscore + summary + PBP in parallel, update UI fast, then sync store."""
    from src.core.season_utils import normalize_season
    from src.frontend_store.builders import upsert_game_to_season_store
    from src.ingestion.nba_api_client import api_call_options

    with _lock:
        _jobs[game_id]["status"] = "running"

    try:
        season_key = normalize_season(season)
        schedule_df = _load_schedule_df(season_key)

        def _fetch_raw_interactive():
            with api_call_options(**_INTERACTIVE_API_KWARGS):
                return _fetch_game_raw(game_id, season_key, schedule_df)

        def _fetch_summary_interactive():
            with api_call_options(**_INTERACTIVE_API_KWARGS):
                _fetch_summary_safe(game_id, season_key)

        def _fetch_pbp_interactive(h: str | None, a: str | None):
            with api_call_options(**_INTERACTIVE_API_KWARGS):
                return _fetch_and_write_pbp(game_id, season_key, h, a)

        with ThreadPoolExecutor(max_workers=3) as pool:
            raw_fut = pool.submit(_fetch_raw_interactive)
            sum_fut = pool.submit(_fetch_summary_interactive)
            pbp_fut = (
                pool.submit(_fetch_pbp_interactive, home_team, away_team)
                if (home_team and away_team)
                else None
            )
            team_df, player_df, starters_df = raw_fut.result()
            sum_fut.result()
            if pbp_fut is not None:
                pbp_payload, pbp_rec = pbp_fut.result()
            else:
                resolved_home, resolved_away = _resolve_teams_from_df(team_df, game_id, home_team, away_team)
                pbp_payload, pbp_rec = _fetch_pbp_interactive(resolved_home, resolved_away)

        detail, merged_row = _build_in_memory_detail(
            game_id, season_key, team_df, player_df, starters_df, schedule_df
        )

        with _lock:
            _pending_flush.add(game_id)

        _flush_season_raw(season_key, [(game_id, team_df, player_df, starters_df)])
        if pbp_rec:
            _append_pbp_situational_batch([pbp_rec])

        upsert_args = (
            season_key,
            game_id,
            merged_row,
            detail["team_boxscores"],
            detail["player_boxscores"],
            detail["game_detail"],
            pbp_payload,
        )
        upsert_game_to_season_store(*upsert_args)
        _record_upsert(season_key, *upsert_args, mark_flushed=True)

        with _lock:
            _jobs[game_id] = {
                "status": "complete",
                "detail": detail,
                "play_by_play": pbp_payload,
                "error": None,
            }

        _schedule_store_rebuild(season_key)
    except Exception as exc:
        _fail(game_id, exc)


def _refresh_many_locked(
    todo: list[tuple[str, str, str | None, str | None]],
    schedule_cache: dict[str, pd.DataFrame] | None = None,
) -> None:
    """Batch refresh: stream each game to complete as soon as its boxscore arrives,
    then flush season CSVs once and run secondary PBP/summary/store sync."""
    from src.core.season_utils import normalize_season
    from src.frontend_store.builders import upsert_game_to_season_store
    from src.ingestion.nba_api_client import api_call_options

    if not todo:
        return

    cache = schedule_cache if schedule_cache is not None else {}
    fetched_by_season: dict[str, list[tuple[str, pd.DataFrame, pd.DataFrame, pd.DataFrame]]] = {}
    meta_by_season: dict[str, list[tuple[str, str | None, str | None]]] = {}

    def _fetch_one(gid: str, season: str, home: str | None, away: str | None):
        with _lock:
            _jobs[gid]["status"] = "running"
        season_key = normalize_season(season)
        schedule_df = _get_schedule(season_key, cache)
        with api_call_options(**_INTERACTIVE_API_KWARGS):
            team_df, player_df, starters_df = _fetch_game_raw(gid, season_key, schedule_df)
        detail, merged_row = _build_in_memory_detail(
            gid, season_key, team_df, player_df, starters_df, schedule_df
        )
        r_home, r_away = _resolve_teams_from_df(team_df, gid, home, away)
        return gid, season_key, r_home, r_away, team_df, player_df, starters_df, detail, merged_row

    max_workers = max(1, min(4, len(todo)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        future_map = {
            pool.submit(_fetch_one, gid, season, home, away): gid
            for gid, season, home, away in todo
        }
        for fut in as_completed(future_map):
            gid = future_map[fut]
            try:
                (
                    gid,
                    season_key,
                    r_home,
                    r_away,
                    team_df,
                    player_df,
                    starters_df,
                    detail,
                    merged_row,
                ) = fut.result()

                upsert_args = (
                    season_key,
                    gid,
                    merged_row,
                    detail["team_boxscores"],
                    detail["player_boxscores"],
                    detail["game_detail"],
                )
                upsert_game_to_season_store(*upsert_args)
                _record_upsert(season_key, *upsert_args)
                with _lock:
                    _pending_flush.add(gid)
                    _jobs[gid] = {
                        "status": "complete",
                        "detail": detail,
                        "play_by_play": None,
                        "error": None,
                    }

                fetched_by_season.setdefault(season_key, []).append((gid, team_df, player_df, starters_df))
                meta_by_season.setdefault(season_key, []).append((gid, r_home, r_away))
            except Exception as exc:
                _fail(gid, exc)

    for season_key, fetched_rows in fetched_by_season.items():
        try:
            _flush_season_raw(season_key, fetched_rows)
        except Exception as exc:
            logger.error("Batch raw flush failed for %s: %s", season_key, exc, exc_info=exc)
        try:
            _enrich_season_secondary(season_key, meta_by_season.get(season_key, []))
        except Exception as exc:
            logger.warning("Batch secondary enrichment failed for %s: %s", season_key, exc)
