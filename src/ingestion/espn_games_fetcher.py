"""Fetch completed NBA game logs, starters, and play-by-play from ESPN's public JSON API.

Used by cloud/CI workflows (e.g. GitHub Actions) where stats.nba.com blocks datacenter IP
ranges. Outputs match the exact schemas of team_games_fetcher, player_games_fetcher,
starters_fetcher, and pbp_situational so downstream features and models have 100% parity.
"""
from __future__ import annotations

import logging
import os
import re
import time
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
import requests

from src.core.data_paths import get_data_paths
from src.core.season_utils import get_default_season, normalize_season
from src.ingestion.player_games_fetcher import EXPECTED_COLUMNS as PLAYER_COLUMNS
from src.ingestion.starters_fetcher import STARTER_COLUMNS
from src.ingestion.team_games_fetcher import EXPECTED_COLUMNS as TEAM_COLUMNS

logger = logging.getLogger("ESPNGamesFetcher")

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary"
HEADERS = {"User-Agent": "Mozilla/5.0"}

ESPN_ABBR = {
    "NY": "NYK",
    "SA": "SAS",
    "GS": "GSW",
    "NO": "NOP",
    "UTAH": "UTA",
    "WSH": "WAS",
}

NBA_TEAM_META: Dict[str, Tuple[int, str]] = {
    "ATL": (1610612737, "Atlanta Hawks"),
    "BKN": (1610612751, "Brooklyn Nets"),
    "BOS": (1610612738, "Boston Celtics"),
    "CHA": (1610612766, "Charlotte Hornets"),
    "CHI": (1610612741, "Chicago Bulls"),
    "CLE": (1610612739, "Cleveland Cavaliers"),
    "DAL": (1610612742, "Dallas Mavericks"),
    "DEN": (1610612743, "Denver Nuggets"),
    "DET": (1610612765, "Detroit Pistons"),
    "GSW": (1610612744, "Golden State Warriors"),
    "HOU": (1610612745, "Houston Rockets"),
    "IND": (1610612754, "Indiana Pacers"),
    "LAC": (1610612746, "LA Clippers"),
    "LAL": (1610612747, "Los Angeles Lakers"),
    "MEM": (1610612763, "Memphis Grizzlies"),
    "MIA": (1610612748, "Miami Heat"),
    "MIL": (1610612749, "Milwaukee Bucks"),
    "MIN": (1610612750, "Minnesota Timberwolves"),
    "NOP": (1610612740, "New Orleans Pelicans"),
    "NYK": (1610612752, "New York Knicks"),
    "OKC": (1610612760, "Oklahoma City Thunder"),
    "ORL": (1610612753, "Orlando Magic"),
    "PHI": (1610612755, "Philadelphia 76ers"),
    "PHX": (1610612756, "Phoenix Suns"),
    "POR": (1610612757, "Portland Trail Blazers"),
    "SAC": (1610612758, "Sacramento Kings"),
    "SAS": (1610612759, "San Antonio Spurs"),
    "TOR": (1610612761, "Toronto Raptors"),
    "UTA": (1610612762, "Utah Jazz"),
    "WAS": (1610612764, "Washington Wizards"),
}

FALLBACK_PLAYER_ID_BASE = 900_000_000


@dataclass
class ESPNFetchBatch:
    team_df: pd.DataFrame = field(default_factory=lambda: pd.DataFrame(columns=TEAM_COLUMNS))
    player_df: pd.DataFrame = field(default_factory=lambda: pd.DataFrame(columns=PLAYER_COLUMNS))
    starters_df: pd.DataFrame = field(default_factory=lambda: pd.DataFrame(columns=STARTER_COLUMNS))
    pbp_payloads: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    fetched_game_ids: List[str] = field(default_factory=list)
    skipped_game_ids: List[str] = field(default_factory=list)
    unmatched_players: List[Tuple[str, str, str, int]] = field(default_factory=list)


def normalize_espn_abbr(abbr: str) -> str:
    code = str(abbr or "").strip().upper()
    return ESPN_ABBR.get(code, code)


def normalize_player_name(name: str) -> str:
    cleaned = unicodedata.normalize("NFKD", str(name or "")).encode("ascii", "ignore").decode().lower()
    cleaned = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b\.?", "", cleaned)
    cleaned = re.sub(r"[^a-z ]", "", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _season_id(season: str, season_type: str) -> int:
    norm_season = normalize_season(season)
    start_year = int(norm_season.split("-")[0])
    if season_type == "Regular Season":
        return 20000 + start_year
    if season_type == "PlayIn":
        return 50000 + start_year
    if season_type in ("Pre Season", "Preseason"):
        return 10000 + start_year
    return 40000 + start_year


def _previous_season(season: str) -> str:
    start = int(normalize_season(season)[:4]) - 1
    return f"{start}-{str(start + 1)[2:]}"


def _parse_made_att(value: Any) -> Tuple[int, int]:
    text = str(value or "").strip()
    if "-" not in text:
        return 0, 0
    left, right = text.split("-", 1)
    return _to_int(left), _to_int(right)


def _to_int(value: Any, default: int = 0) -> int:
    text = str(value or "").strip()
    if not text or text in {"--", "N/A", "nan", "None"}:
        return default
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return default


def _to_float(value: Any, default: float = 0.0) -> float:
    text = str(value or "").strip()
    if not text or text in {"--", "N/A", "nan", "None"}:
        return default
    if ":" in text:
        try:
            mins, secs = text.split(":", 1)
            return float(mins) + float(secs) / 60.0
        except (TypeError, ValueError):
            return default
    try:
        return float(text)
    except (TypeError, ValueError):
        return default


def _pct(made: int, attempted: int) -> float:
    return round(made / attempted, 3) if attempted > 0 else 0.0


def _normalize_clock(clock_str: Any) -> str:
    text = str(clock_str or "").strip()
    if not text:
        return "00:00"
    if ":" in text:
        mins, secs = text.split(":", 1)
        sec_int = int(float(secs)) if secs else 0
        return f"{int(mins):02d}:{sec_int:02d}"
    try:
        total_secs = max(0, int(float(text)))
        return f"{total_secs // 60:02d}:{total_secs % 60:02d}"
    except (TypeError, ValueError):
        return "00:00"


def _get_json(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    *,
    timeout: int = 25,
    max_retries: int = 3,
    backoff: float = 1.0,
) -> Dict[str, Any]:
    last_exc: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            resp = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:
            last_exc = exc
            if attempt == max_retries:
                break
            sleep_s = backoff * (2 ** (attempt - 1))
            logger.warning("ESPN request failed (%s, attempt %d/%d): %s", url, attempt, max_retries, exc)
            time.sleep(sleep_s)
    raise RuntimeError(f"ESPN request failed for {url}: {last_exc}") from last_exc


def load_team_meta(season: Optional[str] = None) -> Dict[str, Tuple[int, str]]:
    """Build TEAM_ABBREVIATION -> (TEAM_ID, TEAM_NAME) from local raw logs with static fallback."""
    meta = dict(NBA_TEAM_META)
    norm_season = normalize_season(season or get_default_season())
    for s in (_previous_season(norm_season), norm_season):
        path = get_data_paths(s).team_games_raw
        if not os.path.exists(path):
            continue
        try:
            df = pd.read_csv(path, usecols=["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME"])
            for _, row in df.drop_duplicates("TEAM_ABBREVIATION", keep="last").iterrows():
                abbr = str(row["TEAM_ABBREVIATION"]).strip().upper()
                if abbr and pd.notna(row["TEAM_ID"]):
                    meta[abbr] = (int(row["TEAM_ID"]), str(row["TEAM_NAME"]).strip())
        except Exception as exc:
            logger.warning("Could not read team metadata from %s: %s", path, exc)
    return meta


def load_player_id_lookup(season: Optional[str] = None, repo_root: Optional[Path] = None) -> Dict[str, int]:
    """Build normalized player name -> canonical NBA Player_ID map from tracked repo tables."""
    norm_season = normalize_season(season or get_default_season())
    prev_season = _previous_season(norm_season)
    root = repo_root or Path(__file__).resolve().parents[2]
    data_dir = root / "data"

    lookup: Dict[str, int] = {}

    def _ingest_csv(path: Path, id_col: str, name_cols: Iterable[str]) -> None:
        if not path.exists():
            return
        try:
            df = pd.read_csv(path)
        except Exception as exc:
            logger.warning("Could not read player lookup from %s: %s", path, exc)
            return
        if id_col not in df.columns:
            return
        for name_col in name_cols:
            if name_col not in df.columns:
                continue
            for pid, name in zip(df[id_col], df[name_col]):
                if pd.isna(pid) or pd.isna(name):
                    continue
                key = normalize_player_name(str(name))
                if key and key not in lookup:
                    try:
                        lookup[key] = int(float(pid))
                    except (TypeError, ValueError):
                        continue

    sources = [
        (data_dir / f"season={norm_season}" / "raw" / "player_games.csv", "Player_ID", ("PLAYER_NAME",)),
        (data_dir / f"season={norm_season}" / "analysis" / "player_name_lookup.csv", "PLAYER_ID", ("RAW_PLAYER_NAME", "NORMALIZED_PLAYER_NAME")),
        (data_dir / f"season={norm_season}" / "analysis" / "team_rosters.csv", "PLAYER_ID", ("PLAYER_NAME",)),
        (data_dir / f"season={norm_season}" / "analysis" / "team_rosters_live.csv", "PLAYER_ID", ("PLAYER_NAME",)),
        (data_dir / f"season={prev_season}" / "raw" / "player_games.csv", "Player_ID", ("PLAYER_NAME",)),
        (data_dir / "reference" / "player_metadata.csv", "PLAYER_ID", ("PLAYER_NAME",)),
    ]
    for path, id_col, name_cols in sources:
        _ingest_csv(path, id_col, name_cols)

    # Local bundled fallback from nba_api if installed (makes zero network requests).
    try:
        from nba_api.stats.static import players as static_players

        for entry in static_players.get_players():
            key = normalize_player_name(entry.get("full_name", ""))
            if key and key not in lookup:
                lookup[key] = int(entry["id"])
    except Exception:
        pass

    return lookup


def resolve_player_id(
    display_name: str,
    espn_athlete_id: Any,
    player_lookup: Dict[str, int],
) -> Tuple[int, bool]:
    """Return (player_id, matched_canonical). Falls back deterministically for debut players."""
    key = normalize_player_name(display_name)
    if key in player_lookup:
        return player_lookup[key], True
    espn_int = _to_int(espn_athlete_id, default=0)
    if espn_int > 0:
        fallback_id = FALLBACK_PLAYER_ID_BASE + espn_int
    else:
        fallback_id = FALLBACK_PLAYER_ID_BASE + (abs(hash(key)) % 90_000_000)
    return fallback_id, False


def fetch_espn_final_events_for_date(game_date: str) -> Dict[Tuple[str, str], str]:
    """Fetch ESPN scoreboard for YYYY-MM-DD and return {(home_abbr, away_abbr): event_id} for Final games."""
    yyyymmdd = str(game_date).replace("-", "")[:8]
    payload = _get_json(SCOREBOARD_URL, params={"dates": yyyymmdd})
    mapping: Dict[Tuple[str, str], str] = {}
    for event in payload.get("events", []):
        status = (event.get("status") or {}).get("type") or {}
        is_final = bool(status.get("completed")) or str(status.get("name", "")).upper() == "STATUS_FINAL"
        if not is_final:
            continue
        comps = event.get("competitions") or []
        if not comps:
            continue
        competitors = comps[0].get("competitors") or []
        home_abbr = away_abbr = None
        for comp in competitors:
            abbr = normalize_espn_abbr((comp.get("team") or {}).get("abbreviation", ""))
            if comp.get("homeAway") == "home":
                home_abbr = abbr
            elif comp.get("homeAway") == "away":
                away_abbr = abbr
        if home_abbr and away_abbr and event.get("id"):
            mapping[(home_abbr, away_abbr)] = str(event["id"])
    return mapping


def fetch_espn_game_summary(event_id: str) -> Dict[str, Any]:
    return _get_json(SUMMARY_URL, params={"event": str(event_id)})


def _infer_periods(summary: Dict[str, Any]) -> int:
    periods = 4
    header_comps = (summary.get("header") or {}).get("competitions") or []
    if header_comps:
        for comp in header_comps[0].get("competitors") or []:
            lines = comp.get("linescores") or []
            if len(lines) > periods:
                periods = len(lines)
    for play in summary.get("plays") or []:
        pnum = _to_int((play.get("period") or {}).get("number"), default=0)
        if pnum > periods:
            periods = pnum
    return periods


def _build_pbp_payload_from_espn(
    summary: Dict[str, Any],
    game_id: str,
    home_abbr: str,
    away_abbr: str,
) -> Optional[Dict[str, Any]]:
    plays = summary.get("plays") or []
    if not plays:
        return None

    team_id_to_abbr: Dict[str, str] = {}
    header_comps = (summary.get("header") or {}).get("competitions") or []
    if header_comps:
        for comp in header_comps[0].get("competitors") or []:
            tid = str(comp.get("id") or (comp.get("team") or {}).get("id") or "")
            abbr = normalize_espn_abbr((comp.get("team") or {}).get("abbreviation", ""))
            if tid and abbr:
                team_id_to_abbr[tid] = abbr

    events: List[Dict[str, Any]] = []
    for play in plays:
        period = _to_int((play.get("period") or {}).get("number"), default=1)
        clock = _normalize_clock((play.get("clock") or {}).get("displayValue", "00:00"))
        scoring = bool(play.get("scoringPlay"))
        points_scored = _to_int(play.get("scoreValue"), default=0) if scoring else 0
        tid = str((play.get("team") or {}).get("id") or "")
        team = team_id_to_abbr.get(tid)
        events.append({
            "period": period,
            "clock": clock,
            "points_scored": points_scored,
            "team": team,
            "score_home": _to_int(play.get("homeScore"), default=0),
            "score_away": _to_int(play.get("awayScore"), default=0),
            "description": str(play.get("text") or ""),
            "action_type": str((play.get("type") or {}).get("text") or ""),
        })

    return {
        "game_id": str(game_id).zfill(10),
        "home_team": home_abbr,
        "away_team": away_abbr,
        "events": events,
    }


def parse_espn_summary(
    summary: Dict[str, Any],
    *,
    game_id: str,
    game_date: str,
    season: str,
    season_type: str,
    home_abbr: str,
    away_abbr: str,
    team_meta: Dict[str, Tuple[int, str]],
    player_lookup: Dict[str, int],
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Optional[Dict[str, Any]], List[Tuple[str, str, str, int]]]:
    """Parse one ESPN summary JSON into (team_df, player_df, starters_df, pbp_payload, unmatched_players)."""
    gid = str(game_id).zfill(10)
    date_iso = pd.to_datetime(game_date).strftime("%Y-%m-%d")
    sid = _season_id(season, season_type)
    periods = _infer_periods(summary)
    team_minutes = 240 + max(0, periods - 4) * 25

    boxscore = summary.get("boxscore") or {}
    raw_teams = boxscore.get("teams") or []
    raw_players = boxscore.get("players") or []
    if len(raw_teams) != 2 or len(raw_players) != 2:
        raise ValueError(f"Incomplete ESPN boxscore for {gid} (teams={len(raw_teams)}, player_groups={len(raw_players)})")

    # Authoritative scores from header competitors (fallback to stat computation).
    score_by_abbr: Dict[str, int] = {}
    header_comps = (summary.get("header") or {}).get("competitions") or []
    if header_comps:
        for comp in header_comps[0].get("competitors") or []:
            abbr = normalize_espn_abbr((comp.get("team") or {}).get("abbreviation", ""))
            if abbr and comp.get("score") is not None:
                score_by_abbr[abbr] = _to_int(comp.get("score"))

    parsed_teams: Dict[str, Dict[str, Any]] = {}
    for entry in raw_teams:
        abbr = normalize_espn_abbr((entry.get("team") or {}).get("abbreviation", ""))
        stats = {s.get("name"): s.get("displayValue") for s in (entry.get("statistics") or [])}
        fgm, fga = _parse_made_att(stats.get("fieldGoalsMade-fieldGoalsAttempted"))
        fg3m, fg3a = _parse_made_att(stats.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted"))
        ftm, fta = _parse_made_att(stats.get("freeThrowsMade-freeThrowsAttempted"))
        pts = score_by_abbr.get(abbr, 2 * fgm + fg3m + ftm)
        tov = _to_int(stats.get("turnovers"), default=-1)
        if tov < 0:
            tov = _to_int(stats.get("totalTurnovers"), default=0)
        parsed_teams[abbr] = {
            "PTS": pts,
            "FGM": fgm,
            "FGA": fga,
            "FG_PCT": _pct(fgm, fga),
            "FG3M": fg3m,
            "FG3A": fg3a,
            "FG3_PCT": _pct(fg3m, fg3a),
            "FTM": ftm,
            "FTA": fta,
            "FT_PCT": _pct(ftm, fta),
            "OREB": _to_int(stats.get("offensiveRebounds")),
            "DREB": _to_int(stats.get("defensiveRebounds")),
            "REB": _to_int(stats.get("totalRebounds")),
            "AST": _to_int(stats.get("assists")),
            "STL": _to_int(stats.get("steals")),
            "BLK": _to_int(stats.get("blocks")),
            "TOV": tov,
            "PF": _to_int(stats.get("fouls")),
        }

    if home_abbr not in parsed_teams or away_abbr not in parsed_teams:
        raise ValueError(f"ESPN teams {list(parsed_teams)} do not match expected {away_abbr} @ {home_abbr} for {gid}")

    home_pts = parsed_teams[home_abbr]["PTS"]
    away_pts = parsed_teams[away_abbr]["PTS"]
    if home_pts <= 0 or away_pts <= 0:
        raise ValueError(f"Invalid zero score for {gid}: {home_abbr}={home_pts}, {away_abbr}={away_pts}")

    wl_by_abbr = {
        home_abbr: "W" if home_pts > away_pts else "L",
        away_abbr: "W" if away_pts > home_pts else "L",
    }
    pm_by_abbr = {
        home_abbr: float(home_pts - away_pts),
        away_abbr: float(away_pts - home_pts),
    }

    team_rows = []
    for abbr in (home_abbr, away_abbr):
        team_id, team_name = team_meta.get(abbr, NBA_TEAM_META[abbr])
        matchup = f"{home_abbr} vs. {away_abbr}" if abbr == home_abbr else f"{away_abbr} @ {home_abbr}"
        st = parsed_teams[abbr]
        team_rows.append({
            "SEASON_ID": sid,
            "TEAM_ID": int(team_id),
            "TEAM_ABBREVIATION": abbr,
            "TEAM_NAME": team_name,
            "GAME_ID": gid,
            "GAME_DATE": date_iso,
            "MATCHUP": matchup,
            "WL": wl_by_abbr[abbr],
            "MIN": int(team_minutes),
            "PTS": int(st["PTS"]),
            "FGM": int(st["FGM"]),
            "FGA": int(st["FGA"]),
            "FG_PCT": float(st["FG_PCT"]),
            "FG3M": int(st["FG3M"]),
            "FG3A": int(st["FG3A"]),
            "FG3_PCT": float(st["FG3_PCT"]),
            "FTM": int(st["FTM"]),
            "FTA": int(st["FTA"]),
            "FT_PCT": float(st["FT_PCT"]),
            "OREB": int(st["OREB"]),
            "DREB": int(st["DREB"]),
            "REB": int(st["REB"]),
            "AST": int(st["AST"]),
            "STL": int(st["STL"]),
            "BLK": int(st["BLK"]),
            "TOV": int(st["TOV"]),
            "PF": int(st["PF"]),
            "PLUS_MINUS": pm_by_abbr[abbr],
            "SEASON_TYPE": season_type,
        })

    player_rows = []
    starter_rows = []
    unmatched_players: List[Tuple[str, str, str, int]] = []

    for grp in raw_players:
        abbr = normalize_espn_abbr((grp.get("team") or {}).get("abbreviation", ""))
        stat_blocks = grp.get("statistics") or []
        if not stat_blocks:
            continue
        labels = [str(lbl).upper() for lbl in (stat_blocks[0].get("labels") or [])]
        matchup = f"{home_abbr} vs. {away_abbr}" if abbr == home_abbr else f"{away_abbr} @ {home_abbr}"
        wl = wl_by_abbr.get(abbr)

        for entry in stat_blocks[0].get("athletes") or []:
            athlete = entry.get("athlete") or {}
            name = str(athlete.get("displayName") or "").strip()
            if not name:
                continue
            espn_id = athlete.get("id")
            pid, matched = resolve_player_id(name, espn_id, player_lookup)
            is_starter = 1 if entry.get("starter") else 0
            did_not_play = bool(entry.get("didNotPlay"))
            raw_vals = entry.get("stats") or []

            starter_rows.append({
                "Game_ID": gid,
                "Player_ID": int(pid),
                "TEAM_ABBREVIATION": abbr,
                "IS_STARTER": is_starter,
            })

            if did_not_play or not raw_vals:
                continue

            if not matched:
                unmatched_players.append((gid, abbr, name, pid))

            row_map = dict(zip(labels, raw_vals))
            fgm, fga = _parse_made_att(row_map.get("FG"))
            fg3m, fg3a = _parse_made_att(row_map.get("3PT"))
            ftm, fta = _parse_made_att(row_map.get("FT"))
            player_rows.append({
                "SEASON_ID": sid,
                "Player_ID": int(pid),
                "Game_ID": gid,
                "GAME_DATE": date_iso,
                "MATCHUP": matchup,
                "WL": wl,
                "MIN": _to_float(row_map.get("MIN")),
                "FGM": float(fgm),
                "FGA": float(fga),
                "FG_PCT": _pct(fgm, fga),
                "FG3M": float(fg3m),
                "FG3A": float(fg3a),
                "FG3_PCT": _pct(fg3m, fg3a),
                "FTM": float(ftm),
                "FTA": float(fta),
                "FT_PCT": _pct(ftm, fta),
                "OREB": _to_float(row_map.get("OREB")),
                "DREB": _to_float(row_map.get("DREB")),
                "REB": _to_float(row_map.get("REB")),
                "AST": _to_float(row_map.get("AST")),
                "STL": _to_float(row_map.get("STL")),
                "BLK": _to_float(row_map.get("BLK")),
                "TOV": _to_float(row_map.get("TO")),
                "PF": _to_float(row_map.get("PF")),
                "PTS": _to_float(row_map.get("PTS")),
                "PLUS_MINUS": _to_float(row_map.get("+/-")),
                "VIDEO_AVAILABLE": 1,
                "PLAYER_NAME": name,
                "SEASON_TYPE": season_type,
            })

    team_df = pd.DataFrame(team_rows, columns=TEAM_COLUMNS)
    player_df = pd.DataFrame(player_rows, columns=PLAYER_COLUMNS)
    starters_df = pd.DataFrame(starter_rows, columns=STARTER_COLUMNS)
    if not starters_df.empty:
        per_team = starters_df.groupby("TEAM_ABBREVIATION")["IS_STARTER"].sum()
        if len(per_team) != 2 or not (per_team == 5).all():
            logger.warning("ESPN starter counts incomplete for %s (%s); dropping starter rows.", gid, per_team.to_dict())
            starters_df = pd.DataFrame(columns=STARTER_COLUMNS)

    pbp_payload = _build_pbp_payload_from_espn(summary, gid, home_abbr, away_abbr)
    return team_df, player_df, starters_df, pbp_payload, unmatched_players


def fetch_missing_games_from_espn(
    missing_schedule_rows: pd.DataFrame,
    season: Optional[str] = None,
    *,
    repo_root: Optional[Path] = None,
    sleep_seconds: float = 0.25,
) -> ESPNFetchBatch:
    """Fetch completed missing games from ESPN for the supplied schedule rows."""
    norm_season = normalize_season(season or get_default_season())
    batch = ESPNFetchBatch()
    if missing_schedule_rows is None or missing_schedule_rows.empty:
        return batch

    team_meta = load_team_meta(norm_season)
    player_lookup = load_player_id_lookup(norm_season, repo_root=repo_root)

    work = missing_schedule_rows.copy()
    work["GAME_ID"] = work["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    work["GAME_DATE"] = pd.to_datetime(work["GAME_DATE"], errors="coerce").dt.strftime("%Y-%m-%d")

    team_frames: List[pd.DataFrame] = []
    player_frames: List[pd.DataFrame] = []
    starter_frames: List[pd.DataFrame] = []

    for game_date, date_group in work.groupby("GAME_DATE", sort=True):
        if pd.isna(game_date):
            continue
        try:
            event_map = fetch_espn_final_events_for_date(str(game_date))
        except Exception as exc:
            logger.error("Failed fetching ESPN scoreboard for %s: %s", game_date, exc)
            batch.skipped_game_ids.extend(date_group["GAME_ID"].tolist())
            continue

        for _, srow in date_group.iterrows():
            gid = str(srow["GAME_ID"]).zfill(10)
            home_abbr = str(srow["HOME_TEAM_ABBREVIATION"]).strip().upper()
            away_abbr = str(srow["AWAY_TEAM_ABBREVIATION"]).strip().upper()
            season_type = str(srow.get("SEASON_TYPE") or "Regular Season")
            event_id = event_map.get((home_abbr, away_abbr))
            if not event_id:
                logger.info("ESPN has no Final event yet for %s (%s @ %s on %s); skipping.", gid, away_abbr, home_abbr, game_date)
                batch.skipped_game_ids.append(gid)
                continue

            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

            try:
                summary = fetch_espn_game_summary(event_id)
                t_df, p_df, s_df, pbp_payload, unmatched = parse_espn_summary(
                    summary,
                    game_id=gid,
                    game_date=str(game_date),
                    season=norm_season,
                    season_type=season_type,
                    home_abbr=home_abbr,
                    away_abbr=away_abbr,
                    team_meta=team_meta,
                    player_lookup=player_lookup,
                )
            except Exception as exc:
                logger.error("Failed parsing ESPN game %s (event %s): %s", gid, event_id, exc)
                batch.skipped_game_ids.append(gid)
                continue

            if t_df.empty or p_df.empty:
                batch.skipped_game_ids.append(gid)
                continue

            team_frames.append(t_df)
            player_frames.append(p_df)
            if not s_df.empty:
                starter_frames.append(s_df)
            if pbp_payload:
                batch.pbp_payloads[gid] = pbp_payload
            batch.fetched_game_ids.append(gid)
            batch.unmatched_players.extend(unmatched)

            for _, abbr, name, pid in unmatched:
                logger.warning("Debut/unmapped player %s (%s, %s) assigned fallback Player_ID=%d", name, abbr, gid, pid)

    if team_frames:
        batch.team_df = pd.concat(team_frames, ignore_index=True)
    if player_frames:
        batch.player_df = pd.concat(player_frames, ignore_index=True)
    if starter_frames:
        batch.starters_df = pd.concat(starter_frames, ignore_index=True)
    return batch
