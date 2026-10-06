"""
game_summary_fetcher.py
-----------------------
Fetch game metadata (arena, officials) from BoxScoreSummaryV3 (with V2 fallback) and manage local cache.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd

from src.ingestion.nba_api_client import call_nba_api

logger = logging.getLogger("GameSummaryFetcher")


def get_game_summary_cache_path(game_id: str, season: Optional[str] = None) -> Path:
    gid_str = str(game_id).zfill(10)
    if season:
        cache_dir = Path("data") / f"season={season}" / "raw" / "game_summaries"
    else:
        cache_dir = Path("data") / "raw" / "game_summaries"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{gid_str}.json"


def fetch_game_summary(game_id: str, season: Optional[str] = None, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetches arena and officials metadata for a given game ID.
    Caches the result locally to prevent redundant NBA API calls.
    """
    gid_str = str(game_id).zfill(10)
    cache_file = get_game_summary_cache_path(gid_str, season=season)

    if not force_refresh and cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data and ("arena" in data or "officials" in data):
                    return data
        except Exception:
            pass

    arena: Dict[str, Any] = {"name": None, "city": None, "state": None, "country": None, "timezone": None}
    officials: List[Dict[str, Any]] = []

    # 1. Try BoxScoreSummaryV3
    try:
        from nba_api.stats.endpoints import boxscoresummaryv3

        logger.info(f"Fetching BoxScoreSummaryV3 for game {gid_str}...")
        bs3 = call_nba_api(boxscoresummaryv3.BoxScoreSummaryV3, game_id=gid_str)
        frames = bs3.get_data_frames()
        if len(frames) > 2 and not frames[2].empty:
            adf = frames[2]
            arena = {
                "name": str(adf.iloc[0].get("arenaName", "")).strip() or None,
                "city": str(adf.iloc[0].get("arenaCity", "")).strip() or None,
                "state": str(adf.iloc[0].get("arenaState", "")).strip() or None,
                "country": str(adf.iloc[0].get("arenaCountry", "")).strip() or None,
                "timezone": str(adf.iloc[0].get("arenaTimezone", "")).strip() or None,
            }
        if len(frames) > 3 and not frames[3].empty:
            odf = frames[3]
            for _, r in odf.iterrows():
                raw_name = str(r.get("name", "")).strip()
                jersey_num = str(r.get("jerseyNum", "")).strip()
                if raw_name:
                    display_name = f"{raw_name} (#{jersey_num})" if jersey_num else raw_name
                elif jersey_num:
                    display_name = f"Referee #{jersey_num}"
                else:
                    display_name = f"Official {r.get('personId', '')}".strip()
                officials.append({
                    "name": display_name,
                    "raw_name": raw_name,
                    "jerseyNum": jersey_num,
                    "personId": int(r.get("personId", 0)) if pd.notna(r.get("personId")) else None,
                })
    except Exception as exc:
        logger.warning(f"BoxScoreSummaryV3 failed for {gid_str}: {exc}. Trying V2 fallback.")

    # 2. Try BoxScoreSummaryV2 fallback if V3 produced no officials or arena
    if not officials and not arena.get("name"):
        try:
            from nba_api.stats.endpoints import boxscoresummaryv2

            logger.info(f"Falling back to BoxScoreSummaryV2 for game {gid_str}...")
            bs2 = call_nba_api(boxscoresummaryv2.BoxScoreSummaryV2, game_id=gid_str)
            frames2 = bs2.get_data_frames()
            if len(frames2) > 2 and not frames2[2].empty:
                odf2 = frames2[2]
                for _, r in odf2.iterrows():
                    fn = str(r.get("FIRST_NAME", "")).strip()
                    ln = str(r.get("LAST_NAME", "")).strip()
                    raw_name = f"{fn} {ln}".strip()
                    jersey_num = str(r.get("JERSEY_NUM", "")).strip()
                    display_name = f"{raw_name} (#{jersey_num})" if jersey_num else raw_name
                    officials.append({
                        "name": display_name,
                        "raw_name": raw_name,
                        "jerseyNum": jersey_num,
                        "personId": int(r.get("OFFICIAL_ID", 0)) if pd.notna(r.get("OFFICIAL_ID")) else None,
                    })
        except Exception as exc:
            logger.warning(f"BoxScoreSummaryV2 fallback also failed for {gid_str}: {exc}")

    result = {
        "game_id": gid_str,
        "arena": arena,
        "officials": officials,
    }

    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    except Exception as exc:
        logger.error(f"Failed to write game summary cache for {gid_str}: {exc}")

    return result
