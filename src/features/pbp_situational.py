import glob
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd

from src.processing.season_type_normalizer import parse_game_id_metadata

logger = logging.getLogger(__name__)


def parse_pbp_file(file_path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        logger.debug("Failed to read pbp file %s: %s", file_path, e)
        return None

    game_id = data.get("game_id")
    home_team = data.get("home_team")
    away_team = data.get("away_team")
    events = data.get("events", [])

    if not game_id or not home_team or not away_team or not events:
        return None

    gid_str = str(game_id).split(".")[0].strip().zfill(10)
    meta = parse_game_id_metadata(gid_str)
    season_type = meta.get("SEASON_TYPE", "Regular Season")
    is_playoff = meta.get("IS_PLAYOFF", False)
    is_finals = (season_type == "NBA Finals")
    is_preseason = gid_str.startswith("001")
    if is_preseason:
        season_type = "Pre Season"

    # Context-aware garbage time thresholds
    if is_preseason:
        q3_thresh = 20
        q4_early_thresh = 15
        q4_mid_thresh = 12
        q4_late_thresh = 8
        comeback_floor = 8
    elif is_finals:
        q3_thresh = 35
        q4_early_thresh = 28
        q4_mid_thresh = 22
        q4_late_thresh = 15
        comeback_floor = 12
    elif is_playoff:
        q3_thresh = 30
        q4_early_thresh = 25
        q4_mid_thresh = 18
        q4_late_thresh = 12
        comeback_floor = 10
    else:
        # Regular Season standard
        q3_thresh = 25
        q4_early_thresh = 20
        q4_mid_thresh = 15
        q4_late_thresh = 10
        comeback_floor = 10

    total_events = len(events)
    garbage_events = 0
    clutch_events = 0
    clean_home_pts = 0
    clean_away_pts = 0
    clutch_home_pts = 0
    clutch_away_pts = 0
    garbage_pts = 0

    in_garbage = False

    for e in events:
        period = e.get("period", 1)
        clock_str = str(e.get("clock", "12:00")).strip()
        pts = int(e.get("points_scored", 0) or 0)
        team = e.get("team")
        score_home = int(e.get("score_home", 0) or 0)
        score_away = int(e.get("score_away", 0) or 0)
        margin = abs(score_home - score_away)

        parts = clock_str.split(":")
        secs = 0
        if len(parts) == 2:
            try:
                secs = int(parts[0]) * 60 + int(parts[1])
            except ValueError:
                secs = 0

        # Dynamic game-type aware garbage time condition
        if (
            (period == 3 and margin >= q3_thresh)
            or (period == 4 and secs >= 360 and margin >= q4_early_thresh)
            or (period == 4 and secs < 360 and margin >= q4_mid_thresh)
            or (period == 4 and secs <= 120 and margin >= q4_late_thresh)
        ):
            in_garbage = True
        elif margin < comeback_floor:
            in_garbage = False

        # NBA official clutch definition: margin <= 5 points in the final 5 minutes of Q4 or OT
        is_clutch = (period == 4 and secs <= 300 and margin <= 5) or (period > 4 and margin <= 5)

        if in_garbage:
            garbage_events += 1
            garbage_pts += pts
        else:
            if team == home_team:
                clean_home_pts += pts
            elif team == away_team:
                clean_away_pts += pts

        if is_clutch:
            clutch_events += 1
            if team == home_team:
                clutch_home_pts += pts
            elif team == away_team:
                clutch_away_pts += pts

    total_pts = clean_home_pts + clean_away_pts + garbage_pts
    garbage_share = round(garbage_events / max(1, total_events), 4)
    garbage_pts_share = round(garbage_pts / max(1, total_pts), 4)

    return {
        "GAME_ID": gid_str,
        "SEASON_TYPE": season_type,
        "IS_PLAYOFF": is_playoff,
        "PLAYOFF_ROUND": meta.get("PLAYOFF_ROUND"),
        "HOME_TEAM": home_team,
        "AWAY_TEAM": away_team,
        "TOTAL_PBP_EVENTS": total_events,
        "GARBAGE_TIME_SHARE": garbage_share,
        "GARBAGE_TIME_PTS_SHARE": garbage_pts_share,
        "CLEAN_HOME_PTS": clean_home_pts,
        "CLEAN_AWAY_PTS": clean_away_pts,
        "CLEAN_MARGIN": clean_home_pts - clean_away_pts,
        "CLUTCH_EVENT_COUNT": clutch_events,
        "CLUTCH_HOME_PTS": clutch_home_pts,
        "CLUTCH_AWAY_PTS": clutch_away_pts,
        "CLUTCH_MARGIN": clutch_home_pts - clutch_away_pts,
    }


def build_situational_dataset(data_dir: str = "data") -> pd.DataFrame:
    pattern = os.path.join(data_dir, "season=*", "raw", "play_by_play", "*.json")
    files = glob.glob(pattern)
    logger.info("Found %d play-by-play files to process across seasons", len(files))

    records: List[Dict[str, Any]] = []
    for f in files:
        rec = parse_pbp_file(f)
        if rec:
            records.append(rec)

    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)
    df.drop_duplicates(subset=["GAME_ID"], inplace=True)
    return df


def load_situational_lookup(csv_path: str = "data/processed/pbp_situational_features.csv") -> Dict[tuple[str, str], Dict[str, float]]:
    lookup: Dict[tuple[str, str], Dict[str, float]] = {}
    p = Path(csv_path)
    if not p.exists():
        return lookup

    try:
        df = pd.read_csv(p)
        for _, r in df.iterrows():
            gid = str(r["GAME_ID"]).split(".")[0].strip().zfill(10)
            ht = str(r.get("HOME_TEAM") or "").strip()
            at = str(r.get("AWAY_TEAM") or "").strip()
            clean_margin = float(r.get("CLEAN_MARGIN", 0.0) or 0.0)
            clutch_margin = float(r.get("CLUTCH_MARGIN", 0.0) or 0.0)
            garbage_share = float(r.get("GARBAGE_TIME_SHARE", 0.11) or 0.11)

            if ht:
                lookup[(gid, ht)] = {
                    "CLEAN_MARGIN": clean_margin,
                    "CLUTCH_MARGIN": clutch_margin,
                    "GARBAGE_TIME_SHARE": garbage_share,
                }
            if at:
                lookup[(gid, at)] = {
                    "CLEAN_MARGIN": -clean_margin,
                    "CLUTCH_MARGIN": -clutch_margin,
                    "GARBAGE_TIME_SHARE": garbage_share,
                }
    except Exception as exc:
        logger.warning("Failed to load situational lookup from %s: %s", csv_path, exc)

    return lookup

