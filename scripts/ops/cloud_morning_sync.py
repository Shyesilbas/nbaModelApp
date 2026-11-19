#!/usr/bin/env python3
"""Cloud-safe morning sync: fetch missing completed games via ESPN, rebuild snapshot inputs, and refresh reports.

Designed for GitHub Actions (and usable locally) where stats.nba.com blocks datacenter IPs.
Uses only tracked repository inputs plus ESPN's public NBA JSON API, keeping 100% schema and
feature parity with the local morning routine (scripts/ops/morning.py).
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.core.data_paths import PBP_SITUATIONAL_CSV, get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.ingestion.atomic_io import write_csv_atomic, write_text_atomic
from src.ingestion.espn_games_fetcher import fetch_missing_games_from_espn
from src.ingestion.nba_injury_report import ET
from src.ingestion.player_games_fetcher import append_player_games_to_raw_dataset
from src.ingestion.starters_fetcher import append_starters, missing_starter_game_ids
from src.ingestion.team_games_fetcher import append_team_games_to_raw_dataset

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("CloudMorningSync")

MIN_HOURS_AFTER_TIP = 2.0


def _norm_gid(series: pd.Series) -> pd.Series:
    return series.astype(str).str.split(".").str[0].str.strip().str.zfill(10)


def _load_schedule_rows(season: str) -> pd.DataFrame:
    paths = get_data_paths(season)
    frames: List[pd.DataFrame] = []
    for path in (paths.raw_schedule, paths.raw_finals_schedule):
        if os.path.exists(path):
            df = pd.read_csv(path, dtype={"GAME_ID": str})
            if not df.empty:
                frames.append(df)
    if not frames:
        return pd.DataFrame()
    sched = pd.concat(frames, ignore_index=True)
    sched["GAME_ID"] = _norm_gid(sched["GAME_ID"])
    sched = sched[~sched["GAME_ID"].str.startswith("003")].drop_duplicates(subset=["GAME_ID"], keep="last")
    return sched


def find_missing_due_games(
    season: str,
    now_utc: Optional[datetime] = None,
    *,
    only_date: Optional[str] = None,
) -> pd.DataFrame:
    """Return schedule rows for games that should be completed by now but lack raw team/player logs."""
    now = now_utc or datetime.now(timezone.utc)
    cutoff_utc = now - timedelta(hours=MIN_HOURS_AFTER_TIP)
    today_et = now.astimezone(ET).strftime("%Y-%m-%d")

    sched = _load_schedule_rows(season)
    if sched.empty:
        return pd.DataFrame()

    sched["GAME_DATE_ISO"] = pd.to_datetime(sched["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

    paths = get_data_paths(season)
    have_team: set[str] = set()
    if os.path.exists(paths.team_games_raw):
        t_df = pd.read_csv(paths.team_games_raw, usecols=["GAME_ID"], dtype=str)
        counts = _norm_gid(t_df["GAME_ID"]).value_counts()
        have_team = set(counts[counts >= 2].index)

    have_player: set[str] = set()
    if os.path.exists(paths.player_games_raw):
        p_df = pd.read_csv(paths.player_games_raw, usecols=["Game_ID"], dtype=str)
        have_player = set(_norm_gid(p_df["Game_ID"]).unique())

    complete_ids = have_team & have_player

    if only_date:
        due_mask = sched["GAME_DATE_ISO"] == str(only_date)
    else:
        start_ts = pd.to_datetime(sched.get("GAME_START_UTC"), utc=True, errors="coerce")
        has_start = start_ts.notna()
        due_by_start = has_start & (start_ts <= pd.Timestamp(cutoff_utc))
        due_by_date = (~has_start) & sched["GAME_DATE_ISO"].notna() & (sched["GAME_DATE_ISO"] < today_et)
        due_mask = due_by_start | due_by_date

    missing = sched[due_mask & (~sched["GAME_ID"].isin(complete_ids))].copy()
    return missing.sort_values(["GAME_DATE_ISO", "GAME_ID"]).reset_index(drop=True)


def missing_pbp_situational_game_ids(season: str, limit: int = 30) -> List[str]:
    """Played non-preseason games in raw/team_games.csv that have no PBP situational row yet."""
    paths = get_data_paths(season)
    if not os.path.exists(paths.team_games_raw):
        return []
    played = _norm_gid(pd.read_csv(paths.team_games_raw, usecols=["GAME_ID"], dtype=str)["GAME_ID"]).unique()
    have: set[str] = set()
    if PBP_SITUATIONAL_CSV.exists():
        have = set(_norm_gid(pd.read_csv(PBP_SITUATIONAL_CSV, usecols=["GAME_ID"], dtype=str)["GAME_ID"]))
    return [g for g in played if not g.startswith("001") and g not in have][:limit]


def _update_pbp_situational(season: str, pbp_payloads: Dict[str, Dict[str, Any]]) -> int:
    """Persist new PBP JSONs locally and merge parsed situational rows into PBP_SITUATIONAL_CSV."""
    if not pbp_payloads:
        return 0
    from src.features.pbp_situational import parse_pbp_file

    pbp_dir = ROOT / "data" / f"season={season}" / "raw" / "play_by_play"
    pbp_dir.mkdir(parents=True, exist_ok=True)

    records: List[Dict[str, Any]] = []
    for gid, payload in pbp_payloads.items():
        pbp_path = pbp_dir / f"{gid}.json"
        write_text_atomic(json.dumps(payload, indent=2), pbp_path)
        rec = parse_pbp_file(str(pbp_path))
        if rec:
            records.append(rec)

    if not records:
        return 0

    new_df = pd.DataFrame(records)
    new_df["GAME_ID"] = _norm_gid(new_df["GAME_ID"])
    new_gids = set(new_df["GAME_ID"])

    if PBP_SITUATIONAL_CSV.exists():
        prev_df = pd.read_csv(PBP_SITUATIONAL_CSV, dtype={"GAME_ID": str})
        prev_df["GAME_ID"] = _norm_gid(prev_df["GAME_ID"])
        prev_df = prev_df[~prev_df["GAME_ID"].isin(new_gids)]
        merged = pd.concat([prev_df, new_df], ignore_index=True)
    else:
        merged = new_df

    merged = merged.drop_duplicates(subset=["GAME_ID"], keep="last")
    PBP_SITUATIONAL_CSV.parent.mkdir(parents=True, exist_ok=True)
    write_csv_atomic(merged, PBP_SITUATIONAL_CSV)
    return len(records)


def _mark_schedule_final(season: str, fetched_game_ids: List[str]) -> None:
    """Mark newly ingested games as Final in raw/schedule.csv."""
    if not fetched_game_ids:
        return
    paths = get_data_paths(season)
    sched_path = paths.raw_schedule
    if not os.path.exists(sched_path):
        return
    df = pd.read_csv(sched_path, dtype={"GAME_ID": str})
    if df.empty or "GAME_STATUS" not in df.columns:
        return
    gids = {str(g).zfill(10) for g in fetched_game_ids}
    mask = _norm_gid(df["GAME_ID"]).isin(gids) & (df["GAME_STATUS"] != "Final")
    if not mask.any():
        return
    df.loc[mask, "GAME_STATUS"] = "Final"
    write_csv_atomic(df, sched_path)
    logger.info("Marked %d game(s) Final in %s", int(mask.sum()), sched_path)


def _features_lag_raw(season: str) -> bool:
    """True when raw/team_games.csv has games that are not yet in features/team_features.csv."""
    paths = get_data_paths(season)
    if not os.path.exists(paths.team_games_raw):
        return False
    if not os.path.exists(paths.team_features):
        return True
    raw_ids = set(_norm_gid(pd.read_csv(paths.team_games_raw, usecols=["GAME_ID"], dtype=str)["GAME_ID"]))
    feat_ids = set(_norm_gid(pd.read_csv(paths.team_features, usecols=["GAME_ID"], dtype=str)["GAME_ID"]))
    return bool(raw_ids - feat_ids)


def _rebuild_derived_inputs(season: str) -> None:
    from src.analysis.live_roster_refresh import build_live_roster
    from src.ingestion.boxscore_service import BoxscoreService
    from src.orchestration.pipeline_runner import PipelineRunner

    runner = PipelineRunner(season=season)
    logger.info("Rebuilding team features and advanced boxscore enrichment for %s...", season)
    runner.sync_features()

    logger.info("Rebuilding game_results.csv for %s...", season)
    BoxscoreService(save=True, season=season, warm_summaries=False).run_and_export()

    logger.info("Rebuilding schedule_combined.csv for %s...", season)
    runner.build_schedule_context(save=True)

    logger.info("Rebuilding team_rosters_live.csv for %s...", season)
    build_live_roster(season)


def _refresh_espn_transactions() -> None:
    try:
        from scripts.ingest.ingest_espn_transactions import fetch as fetch_espn_transactions

        fetch_espn_transactions()
    except Exception as exc:
        logger.warning("ESPN transactions refresh failed (continuing with cached feed): %s", exc)


def _refresh_reports(season: str) -> None:
    cmd = [sys.executable, str(ROOT / "scripts" / "refresh_reports.py"), "--walk-forward", "never", "--season", season]
    env = {**os.environ, "PYTHONPATH": str(ROOT)}
    proc = subprocess.run(cmd, cwd=ROOT, env=env)
    if proc.returncode != 0:
        logger.warning("Report refresh exited with code %d; data sync above still stands.", proc.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--season", default=None, help="Season key, e.g. 2026-27 (default: active season)")
    parser.add_argument("--date", default=None, help="Optional single YYYY-MM-DD date to sync")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; write nothing")
    parser.add_argument("--force-rebuild", action="store_true", help="Rebuild features/results/rosters even with 0 new games")
    parser.add_argument("--skip-transactions", action="store_true", help="Skip refreshing ESPN transactions")
    parser.add_argument("--skip-reports", action="store_true", help="Skip refreshing ledger reports and doc blocks")
    args = parser.parse_args()

    season = normalize_season(args.season or get_default_season())
    logger.info("=== Cloud Morning Sync (%s) ===", season)

    missing_df = find_missing_due_games(season, only_date=args.date)
    missing_raw_ids = set(missing_df["GAME_ID"]) if not missing_df.empty else set()

    # Also backfill missing starter flags or PBP situational rows on already-ingested games
    # without overwriting their existing raw team/player box scores.
    aux_df = pd.DataFrame()
    starter_gap_ids: set[str] = set()
    pbp_gap_ids: set[str] = set()
    if not args.date:
        starter_gap_ids = set(missing_starter_game_ids(season=season, limit=30)) - missing_raw_ids
        pbp_gap_ids = set(missing_pbp_situational_game_ids(season=season, limit=30)) - missing_raw_ids
        aux_ids = starter_gap_ids | pbp_gap_ids
        if aux_ids:
            sched = _load_schedule_rows(season)
            aux_df = sched[sched["GAME_ID"].isin(aux_ids)].copy()
            logger.info(
                "Detected %d auxiliary backfill game(s) (missing starters=%d, missing PBP=%d).",
                len(aux_df),
                len(starter_gap_ids),
                len(pbp_gap_ids),
            )

    logger.info("Due missing raw games detected: %d", len(missing_df))

    fetched_ids: List[str] = []
    aux_updated = 0
    if not missing_df.empty:
        batch = fetch_missing_games_from_espn(missing_df, season=season, repo_root=ROOT)
        fetched_ids = batch.fetched_game_ids
        logger.info(
            "ESPN raw fetch complete: %d fetched, %d skipped/not final yet, %d team rows, %d player rows, %d starter rows, %d PBP payloads.",
            len(batch.fetched_game_ids),
            len(batch.skipped_game_ids),
            len(batch.team_df),
            len(batch.player_df),
            len(batch.starters_df),
            len(batch.pbp_payloads),
        )
        if not args.dry_run:
            if not batch.team_df.empty:
                append_team_games_to_raw_dataset(batch.team_df, season=season)
            if not batch.player_df.empty:
                append_player_games_to_raw_dataset(batch.player_df, season=season)
            if not batch.starters_df.empty:
                append_starters(batch.starters_df, season=season)
            if batch.pbp_payloads:
                n_sit = _update_pbp_situational(season, batch.pbp_payloads)
                logger.info("Updated %d PBP situational record(s).", n_sit)
            _mark_schedule_final(season, fetched_ids)

    if not aux_df.empty:
        aux_batch = fetch_missing_games_from_espn(aux_df, season=season, repo_root=ROOT)
        logger.info(
            "ESPN aux backfill complete: %d fetched, %d starter rows, %d PBP payloads.",
            len(aux_batch.fetched_game_ids),
            len(aux_batch.starters_df),
            len(aux_batch.pbp_payloads),
        )
        if not args.dry_run:
            if starter_gap_ids and not aux_batch.starters_df.empty:
                s_only = aux_batch.starters_df[aux_batch.starters_df["Game_ID"].isin(starter_gap_ids)]
                if not s_only.empty:
                    append_starters(s_only, season=season)
                    aux_updated += s_only["Game_ID"].nunique()
            if pbp_gap_ids and aux_batch.pbp_payloads:
                p_only = {gid: payload for gid, payload in aux_batch.pbp_payloads.items() if gid in pbp_gap_ids}
                if p_only:
                    n_sit = _update_pbp_situational(season, p_only)
                    logger.info("Backfilled %d missing PBP situational record(s).", n_sit)
                    aux_updated += n_sit

    if args.dry_run:
        logger.info("Dry run: skipping disk writes, derived rebuilds, and report refresh.")
        return 0

    if not args.skip_transactions:
        _refresh_espn_transactions()

    needs_rebuild = bool(fetched_ids) or bool(aux_updated) or args.force_rebuild or _features_lag_raw(season)
    if needs_rebuild:
        _rebuild_derived_inputs(season)
        if not args.skip_reports:
            _refresh_reports(season)
    else:
        logger.info("Raw data and features already up to date; skipping derived rebuilds.")
        if not args.skip_reports:
            # Ledger may have received new pre-tip snapshots overnight; regrade if needed.
            _refresh_reports(season)

    logger.info("=== Cloud Morning Sync Finished (%d new game(s), %d aux backfill(s)) ===", len(fetched_ids), aux_updated)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
