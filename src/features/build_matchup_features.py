"""
Build matchup features for the deployed win-probability model.
Usage (CLI):
  python scripts/build_matchup_features.py --home TEAM_ABBR --away TEAM_ABBR --prediction-date YYYY-MM-DD

Outputs a JSON mapping of feature_name -> value in the exact order defined by the active feature_columns file.

Requirements met:
 - Uses only games with GAME_DATE < prediction_date
 - Performs validation checks to prevent leakage
 - Returns all features in the order from the active feature_columns file
"""
import argparse
import json
from pathlib import Path
import pandas as pd
import numpy as np
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from src.core.data_paths import get_data_paths
from src.core.season_utils import SEASON_START_MONTH, date_to_season
from src.core.artifact_paths import resolve_artifact_path
from src.features.win_strength_features import build_matchup_strength_features, compute_current_elo_state
from src.features.roster_absence import current_roster_ids, live_absence_delta

from functools import lru_cache
import math

# Same file the WIN loader reads, so the feature order always matches the loaded model.
MODEL_FEATURE_COLS = resolve_artifact_path("win_model", "feature_columns_path", "models/production/win_features.json")

NBA_TEAMS_LOCATIONS = {
    "BOS": {"lat": 42.3662, "lon": -71.0621, "tz_offset": -5},
    "BKN": {"lat": 40.6826, "lon": -73.9754, "tz_offset": -5},
    "NYK": {"lat": 40.7505, "lon": -73.9934, "tz_offset": -5},
    "PHI": {"lat": 39.9012, "lon": -75.1719, "tz_offset": -5},
    "TOR": {"lat": 43.6435, "lon": -79.3791, "tz_offset": -5},
    "CHI": {"lat": 41.8806, "lon": -87.6742, "tz_offset": -6},
    "CLE": {"lat": 41.4965, "lon": -81.6881, "tz_offset": -5},
    "DET": {"lat": 42.3411, "lon": -83.0550, "tz_offset": -5},
    "IND": {"lat": 39.7641, "lon": -86.1555, "tz_offset": -5},
    "MIL": {"lat": 43.0451, "lon": -87.9172, "tz_offset": -6},
    "ATL": {"lat": 33.7573, "lon": -84.3963, "tz_offset": -5},
    "CHA": {"lat": 35.2251, "lon": -80.8392, "tz_offset": -5},
    "MIA": {"lat": 25.7814, "lon": -80.1870, "tz_offset": -5},
    "ORL": {"lat": 28.5392, "lon": -81.3839, "tz_offset": -5},
    "WAS": {"lat": 38.8981, "lon": -77.0209, "tz_offset": -5},
    "DEN": {"lat": 39.7486, "lon": -105.0075, "tz_offset": -7},
    "MIN": {"lat": 44.9795, "lon": -93.2761, "tz_offset": -6},
    "OKC": {"lat": 35.4634, "lon": -97.5151, "tz_offset": -6},
    "POR": {"lat": 45.5316, "lon": -122.6668, "tz_offset": -8},
    "UTA": {"lat": 40.7683, "lon": -111.9011, "tz_offset": -7},
    "GSW": {"lat": 37.7680, "lon": -122.3877, "tz_offset": -8},
    "LAC": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "LAL": {"lat": 34.0430, "lon": -118.2673, "tz_offset": -8},
    "PHX": {"lat": 33.4457, "lon": -112.0712, "tz_offset": -7},
    "SAC": {"lat": 38.5802, "lon": -121.4997, "tz_offset": -8},
    "DAL": {"lat": 32.7905, "lon": -96.8103, "tz_offset": -6},
    "HOU": {"lat": 29.7508, "lon": -95.3621, "tz_offset": -6},
    "MEM": {"lat": 35.1381, "lon": -90.0506, "tz_offset": -6},
    "NOP": {"lat": 29.9490, "lon": -90.0821, "tz_offset": -6},
    "SAS": {"lat": 29.4270, "lon": -98.4375, "tz_offset": -6}
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

@lru_cache(maxsize=64)
def _read_frame_cached(path_str: str, mtime_ns: int, size_bytes: int):
    del mtime_ns, size_bytes
    return pd.read_csv(path_str)


def previous_season(season: str) -> str:
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[-2:]}"


def is_preseason_game(game_id=None, season_type=None, season_id=None) -> bool:
    """Preseason rows must never feed rolling features, Elo or game counts."""
    if season_type is not None and "pre" in str(season_type).lower():
        return True
    if season_id is not None and str(season_id).split(".")[0].startswith("1"):
        return True
    gid = str(game_id or "").split(".")[0].zfill(10)
    return gid.startswith("001")


def _read_frame(path: Path):
    stat = path.stat()
    return _read_frame_cached(str(path.resolve()), stat.st_mtime_ns, stat.st_size)


def _load_season_csv(attr: str, season: str | None, skip_empty: bool, fallback: bool = True) -> pd.DataFrame | None:
    """The season's CSV (``attr`` of DataPaths), else the previous season's.

    ``skip_empty``: a header-only file (new season, no games yet) counts as missing.
    """
    seasons = [season] + ([previous_season(season)] if fallback and season else [])
    for s in seasons:
        path = Path(getattr(get_data_paths(s), attr))
        if path.exists():
            df = _read_frame(path)
            if not (skip_empty and df.empty):
                return df
    return None


def _load_team_features(season: str = None):
    df = _load_season_csv("team_features", season, skip_empty=True)
    if df is None:
        raise FileNotFoundError(f"team_games_features not found; expected at {get_data_paths(season).team_features}")
    return df


def _load_game_results(season: str = None):
    df = _load_season_csv("game_results", season, skip_empty=True)
    if df is None:
        raise FileNotFoundError(f"game_results not found; expected at {get_data_paths(season).game_results}")
    return df


def _load_player_games(season: str = None):
    df = _load_season_csv("player_games_raw", season, skip_empty=False)
    return pd.DataFrame() if df is None else df


def _load_absence_logs(season: str):
    """Current + previous season logs, so a fresh injury counts before the team has 5 games this season."""
    logs = pd.concat([_load_player_games(previous_season(season)), _load_player_games(season)], ignore_index=True)
    return logs.drop_duplicates(subset=["Game_ID", "Player_ID"])


def _load_team_games(season: str = None):
    df = _load_season_csv("team_games_raw", season, skip_empty=False)
    return pd.DataFrame() if df is None else df


def _load_combined_schedule(season: str = None):
    df = _load_season_csv("schedule_combined", season, skip_empty=False, fallback=False)
    return pd.DataFrame() if df is None else df


@lru_cache(maxsize=32)
def _load_joblib_cached(path_str: str, mtime_ns: int):
    import joblib
    return joblib.load(path_str)


def load_cached_joblib(path: Path):
    if not path or not path.exists():
        return None
    return _load_joblib_cached(str(path.resolve()), path.stat().st_mtime_ns)


@lru_cache(maxsize=32)
def _load_json_cached(path_str: str, mtime_ns: int):
    with open(path_str, "r", encoding="utf-8") as f:
        return json.load(f)


def load_cached_json(path: Path):
    if not path or not path.exists():
        return None
    return _load_json_cached(str(path.resolve()), path.stat().st_mtime_ns)


def _ensure_datetime(df, col):
    if not pd.api.types.is_datetime64_any_dtype(df[col]):
        df[col] = pd.to_datetime(df[col], errors="coerce")


# Walk-forward on 2021-22..2025-26: a 6-game window costs +0.0007 log loss vs 12 (within noise).
EARLY_SEASON_BLEND_GAMES = 6

# Score pace/rating inputs start from last season's team averages, pulled this far toward the
# league mean, and hand over to this season's form linearly over EARLY_SEASON_BLEND_GAMES.
# Walk-forward 2021-22..2025-26: total MAE 15.41 -> 14.72 when a team has 0 games, 15.93 -> 15.09 at 1-2.
SCORE_PRIOR_REGRESSION = 0.75
SCORE_FORM_STATS = ("PACE", "OFF_RTG", "DEF_RTG")


@lru_cache(maxsize=8)
def _prior_season_team_form(season: str) -> dict:
    """Team -> {stat: previous regular-season mean, regressed toward the league mean}."""
    try:
        prev = _load_team_features(previous_season(season))
    except FileNotFoundError:
        return {}
    if prev is None or prev.empty or not set(SCORE_FORM_STATS) <= set(prev.columns):
        return {}
    if "SEASON_TYPE" in prev.columns:
        prev = prev[prev["SEASON_TYPE"] == "Regular Season"]
    means = prev.groupby("TEAM_ABBREVIATION")[list(SCORE_FORM_STATS)].mean()
    league = means.mean()
    regressed = league + SCORE_PRIOR_REGRESSION * (means - league)
    return {team: row.to_dict() for team, row in regressed.iterrows()}


def blend_score_form_with_prior(res: dict, season: str, team: str, opp: str, n_team: int, n_opp: int) -> None:
    """Early season: replace the *_LAST_10 pace/rating inputs with prior-to-form blends in place."""
    prior = _prior_season_team_form(season)
    for prefix, abbr, n in (("", team, n_team), ("OPP_", opp, n_opp)):
        if n >= EARLY_SEASON_BLEND_GAMES or abbr not in prior:
            continue
        w = n / EARLY_SEASON_BLEND_GAMES
        for stat in SCORE_FORM_STATS:
            key = f"{prefix}{stat}_LAST_10"
            form = res.get(key)
            base = prior[abbr][stat]
            res[key] = float(base) if form is None or pd.isna(form) else float(w * form + (1.0 - w) * base)


def _raw_season_games(season: str) -> pd.DataFrame:
    """Completed regular-season and playoff team games of one season (no preseason)."""
    path = Path(get_data_paths(season).team_games_raw)
    if not path.exists():
        return pd.DataFrame()
    df = _read_frame(path).copy()
    if df.empty:
        return df
    df["GAME_ID"] = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    _ensure_datetime(df, "GAME_DATE")
    keep = [
        not is_preseason_game(g, t, sid)
        for g, t, sid in zip(df["GAME_ID"], df.get("SEASON_TYPE", [None] * len(df)), df.get("SEASON_ID", [None] * len(df)))
    ]
    return df[keep]


@lru_cache(maxsize=64)
def _pregame_rows_cached(season: str, date_str: str, matchups: tuple) -> dict:
    """Feature rows exactly as training sees them, for games that have not been played yet.

    Training rows hold each team's form *before* that game (rolling windows are
    shifted by one). Reusing a team's last stored row at inference therefore
    skips its most recent game. Instead, a placeholder row for every requested
    matchup is appended to the season's completed games and the training
    feature code is re-run, so the placeholder gets the same pregame values a
    training row would have, including H2H against today's opponent.
    """
    from src.features import build_team_features
    from src.features.boxscore_advanced_features import compute_team_boxscore_advanced_features

    pred_dt = pd.to_datetime(date_str)
    raw = _raw_season_games(season)
    past = raw[raw["GAME_DATE"] < pred_dt] if not raw.empty else raw
    team_ids = {}
    for s in [season, previous_season(season)]:
        r = _raw_season_games(s)
        if not r.empty and "TEAM_ID" in r.columns:
            for abbr, tid in zip(r["TEAM_ABBREVIATION"], r["TEAM_ID"]):
                team_ids.setdefault(abbr, tid)

    season_id = (past["SEASON_ID"].iloc[-1] if not past.empty and "SEASON_ID" in past.columns else f"2{season[:4]}")
    placeholders = []
    for i, (home, away, stype) in enumerate(matchups):
        gid = f"PREGAME{i:03d}"
        for team, opp, at_home in [(home, away, True), (away, home, False)]:
            placeholders.append({
                "SEASON_ID": season_id,
                "TEAM_ID": team_ids.get(team, 0),
                "TEAM_ABBREVIATION": team,
                "GAME_ID": gid,
                "GAME_DATE": pred_dt,
                "MATCHUP": f"{team} vs. {opp}" if at_home else f"{team} @ {opp}",
                "SEASON_TYPE": stype or "Regular Season",
            })
    frame = pd.concat([past, pd.DataFrame(placeholders)], ignore_index=True)
    feats = build_team_features(frame, season_dir=get_data_paths(season).season_dir)
    adv = compute_team_boxscore_advanced_features(frame)
    adv_cols = [c for c in adv.columns if c not in feats.columns]
    feats = feats.merge(adv[["GAME_ID", "TEAM_ABBREVIATION"] + adv_cols], on=["GAME_ID", "TEAM_ABBREVIATION"], how="left")

    rows = {}
    for i, (home, away, _) in enumerate(matchups):
        game = feats[feats["GAME_ID"].astype(str) == f"PREGAME{i:03d}"]
        for _, r in game.iterrows():
            rows[(r["TEAM_ABBREVIATION"], home, away)] = r
    return rows


def pregame_team_rows(season: str, pred_dt: pd.Timestamp, home_team: str, away_team: str, full_games_df: pd.DataFrame) -> dict:
    """Pregame rows for every game scheduled on ``pred_dt`` (one feature build per day)."""
    day = full_games_df[full_games_df["GAME_DATE"].dt.normalize() == pred_dt.normalize()] if not full_games_df.empty else full_games_df
    matchups = []
    for r in day.itertuples():
        if not is_preseason_game(getattr(r, "GAME_ID", None), getattr(r, "SEASON_TYPE", None)):
            matchups.append((r.HOME_TEAM_ABBREVIATION, r.AWAY_TEAM_ABBREVIATION, getattr(r, "SEASON_TYPE", None)))
    if not any(m[0] == home_team and m[1] == away_team for m in matchups):
        matchups.append((home_team, away_team, None))
    return _pregame_rows_cached(season, pred_dt.strftime("%Y-%m-%d"), tuple(sorted(set(matchups), key=str)))


def build_features(home_team: str, away_team: str, prediction_date: str, season: str = None, player_status_overrides: list = None, team_is_home: bool = True):
    """Return Ordered dict (feature_name -> value) matching the active win model feature list.
    home_team and away_team should be team abbreviations (e.g., "LAL"). prediction_date is YYYY-MM-DD.

    Features are built from ``home_team``'s point of view. Pass ``team_is_home=False``
    to get the visiting team's row of a game that ``away_team`` hosts (used by
    the away scoring model, which was trained on visiting-team rows).
    """
    if not season:
        season = date_to_season(pd.to_datetime(prediction_date))

    pred_dt = pd.to_datetime(prediction_date)

    feat_cols = json.loads(MODEL_FEATURE_COLS.read_text())

    team_df = _load_team_features(season)
    games_df = _load_game_results(season)
    schedule_df = _load_combined_schedule(season)
    current_season_team_df = team_df.copy()

    # Early in a season the current-season files may only contain a few games.
    # Carry forward the previous season's history so every team has pregame data,
    # while retaining current-season rows for teams that have already played.
    if True:
        try:
            prior_team_df = _load_team_features(previous_season(season))
        except FileNotFoundError:
            prior_team_df = pd.DataFrame()
        if not prior_team_df.empty:
            team_df = pd.concat([prior_team_df, team_df], ignore_index=True)
            if "GAME_ID" in team_df.columns:
                team_df = team_df.drop_duplicates(
                    subset=[c for c in ["GAME_ID", "TEAM_ABBREVIATION"] if c in team_df.columns],
                    keep="last",
                )

        try:
            prior_games_df = _load_game_results(previous_season(season))
        except FileNotFoundError:
            prior_games_df = pd.DataFrame()
        if not prior_games_df.empty:
            games_df = pd.concat([prior_games_df, games_df], ignore_index=True)
            if "GAME_ID" in games_df.columns:
                games_df = games_df.drop_duplicates(subset=["GAME_ID"], keep="last")

    # Normalize datetimes
    _ensure_datetime(team_df, "GAME_DATE")
    _ensure_datetime(games_df, "GAME_DATE")
    if not schedule_df.empty:
        _ensure_datetime(schedule_df, "GAME_DATE")

    # Keep a full, unfiltered copy of games_df to lookup the scheduled game details
    full_games_df = games_df.copy()

    # Filtering to games strictly before prediction date to prevent leakage
    team_df = team_df[team_df["GAME_DATE"] < pred_dt].copy()
    games_df = games_df[games_df["GAME_DATE"] < pred_dt].copy()

    # Basic validation
    if team_df.empty:
        raise RuntimeError("No team-level games found before prediction_date; check data or date range")

    def last_row_for(team_abbr: str):
        df = team_df[team_df["TEAM_ABBREVIATION"] == team_abbr]
        if df.empty:
            return None
        df = df.sort_values("GAME_DATE")
        return df.iloc[-1]

    home_row = last_row_for(home_team)
    away_row = last_row_for(away_team)

    # Leakage checks: ensure the last rows used are strictly prior
    checks = []
    if home_row is None:
        checks.append(f"No historical games found for home team {home_team} before {prediction_date}")
    else:
        if home_row["GAME_DATE"] >= pred_dt:
            checks.append(f"Home team last game date {home_row['GAME_DATE']} is not before prediction_date {prediction_date}")
    if away_row is None:
        checks.append(f"No historical games found for away team {away_team} before {prediction_date}")
    else:
        if away_row["GAME_DATE"] >= pred_dt:
            checks.append(f"Away team last game date {away_row['GAME_DATE']} is not before prediction_date {prediction_date}")
    if checks:
        raise RuntimeError("Leakage/coverage check failed: " + "; ".join(checks))

    # Replace the teams' last stored rows (which describe their previous game)
    # with true pregame rows for this game.
    venue_home, venue_away = (home_team, away_team) if team_is_home else (away_team, home_team)
    try:
        pregame = pregame_team_rows(season, pred_dt, venue_home, venue_away, full_games_df)
        home_row = pregame.get((home_team, venue_home, venue_away), home_row)
        away_row = pregame.get((away_team, venue_home, venue_away), away_row)
    except Exception as e:
        print(f"Warning: pregame feature rows unavailable, falling back to last stored rows: {e}")

    def safe_get(row, col, default=0.0):
        if row is None:
            return default
        return row.get(col, default) if col in row.index else default

    # Compose features in order
    out = {}

    out["IS_HOME"] = 1 if team_is_home else 0

    # IS_PLAYOFF: look up scheduled game or fallback to month-based playoff windows (April-June)
    scheduled_game = full_games_df[
        (full_games_df["GAME_DATE"].dt.date == pred_dt.date()) &
        (full_games_df["HOME_TEAM_ABBREVIATION"] == venue_home) &
        (full_games_df["AWAY_TEAM_ABBREVIATION"] == venue_away)
    ]
    scheduled_game_row = scheduled_game.iloc[0] if not scheduled_game.empty else None

    is_preseason_val = False
    if scheduled_game_row is not None:
        is_playoff_val = bool(scheduled_game_row.get("IS_PLAYOFF", False)) or (scheduled_game_row.get("SEASON_TYPE") in ["Playoffs", "PlayIn", "NBA Finals"])
        st_label = str(scheduled_game_row.get("SEASON_TYPE", "")).lower()
        gid_label = str(scheduled_game_row.get("GAME_ID", ""))
        is_preseason_val = ("pre" in st_label) or gid_label.startswith("001") or gid_label.startswith("126")
    else:
        is_playoff_val = pred_dt.month in [4, 5, 6]
        is_preseason_val = bool(pred_dt.month == 10 and pred_dt.day < 20)

    out["IS_PLAYOFF"] = int(is_playoff_val)
    out["IS_PRESEASON"] = int(is_preseason_val)
    out["SEASON_TYPE"] = "Pre Season" if is_preseason_val else ("Playoffs" if is_playoff_val else "Regular Season")

    # IS_ELIMINATION_GAME and CAN_CLINCH_SERIES
    if is_playoff_val:
        playoffs = full_games_df[
            (full_games_df["SEASON_TYPE"].isin(["Playoffs", "PlayIn", "NBA Finals"])) |
            (full_games_df["IS_PLAYOFF"] == True)
        ].copy()
        
        h2h_playoffs = playoffs[
            ((playoffs["HOME_TEAM_ABBREVIATION"] == home_team) & (playoffs["AWAY_TEAM_ABBREVIATION"] == away_team)) |
            ((playoffs["HOME_TEAM_ABBREVIATION"] == away_team) & (playoffs["AWAY_TEAM_ABBREVIATION"] == home_team))
        ]
        
        series_start = pd.Timestamp(f"{int(season.split('-')[0])}-{SEASON_START_MONTH:02d}-01")
        prior_h2h = h2h_playoffs[
            (h2h_playoffs["GAME_DATE"] < pred_dt) & (h2h_playoffs["GAME_DATE"] >= series_start)
        ].sort_values("GAME_DATE")
        
        wins = {home_team: 0, away_team: 0}
        for _, row in prior_h2h.iterrows():
            g_home = row["HOME_TEAM_ABBREVIATION"]
            g_away = row["AWAY_TEAM_ABBREVIATION"]
            winner = row.get("WINNER_TEAM_ABBREVIATION")
            home_score = row.get("HOME_SCORE")
            away_score = row.get("AWAY_SCORE")
            
            if pd.notna(winner) and winner in wins:
                wins[winner] += 1
            elif pd.notna(home_score) and pd.notna(away_score):
                if home_score > away_score:
                    wins[g_home] += 1
                elif away_score > home_score:
                    wins[g_away] += 1
                    
        current_season_type = scheduled_game_row.get("SEASON_TYPE", "Playoffs") if scheduled_game_row is not None else "Playoffs"
        
        is_elim = 0
        can_clinch = 0
        if current_season_type != "PlayIn":
            if wins[home_team] == 3 or wins[away_team] == 3:
                is_elim = 1
                can_clinch = 1
        out["IS_ELIMINATION_GAME"] = is_elim
        out["CAN_CLINCH_SERIES"] = can_clinch
        out["HOME_SERIES_WINS"] = wins[home_team]
        out["AWAY_SERIES_WINS"] = wins[away_team]
    else:
        out["IS_ELIMINATION_GAME"] = 0
        out["CAN_CLINCH_SERIES"] = 0
        out["HOME_SERIES_WINS"] = 0
        out["AWAY_SERIES_WINS"] = 0

    # DAYS_REST / IS_B2B: compute from last game date in the schedule (which includes all scheduled postseason matches)
    # to prevent incorrect rest calculations for future scheduled playoff games.
    def get_last_scheduled_date(team_abbr):
        if not schedule_df.empty:
            team_games = schedule_df[
                ((schedule_df["HOME_TEAM_ABBREVIATION"] == team_abbr) |
                 (schedule_df["AWAY_TEAM_ABBREVIATION"] == team_abbr)) &
                (schedule_df["GAME_DATE"] < pred_dt)
            ]
            if not team_games.empty:
                return team_games["GAME_DATE"].max()
        return None

    def compute_rest_and_b2b_for_team(team_abbr, fallback_row):
        last_date = get_last_scheduled_date(team_abbr)
        if last_date is None:
            last_date = pd.to_datetime(fallback_row["GAME_DATE"]) if fallback_row is not None else None
            
        if last_date is None:
            return (np.nan, 0)
            
        days = (pred_dt - last_date).days
        is_b2b = 1 if days == 1 else 0
        return (float(days), is_b2b)

    days_rest_home, is_b2b_home = compute_rest_and_b2b_for_team(home_team, home_row)
    days_rest_away, is_b2b_away = compute_rest_and_b2b_for_team(away_team, away_row)

    out["DAYS_REST"] = days_rest_home if not pd.isna(days_rest_home) else np.nan
    out["IS_B2B"] = is_b2b_home

    # Location features
    home_loc = NBA_TEAMS_LOCATIONS.get(home_team)
    away_loc = NBA_TEAMS_LOCATIONS.get(away_team)
    if home_loc and away_loc:
        dist = haversine(home_loc["lat"], home_loc["lon"], away_loc["lat"], away_loc["lon"])
        tz_diff = abs(home_loc["tz_offset"] - away_loc["tz_offset"])
    else:
        dist = 0.0
        tz_diff = 0.0

    out["TRAVEL_DISTANCE"] = 0.0 if team_is_home else dist
    out["TIMEZONE_DIFF"] = 0.0 if team_is_home else tz_diff

    # The opening ratings already carry forward franchise strength. Replay only
    # this season's games on top of them; replaying prior-season rows would
    # double-count history now that those rows are included for rolling features.
    # Season opening ratings (carried over from earlier seasons) plus this
    # season's completed games; preseason games never move Elo.
    elo_input = _raw_season_games(season)
    if not elo_input.empty:
        elo_input = elo_input[elo_input["GAME_DATE"] < pred_dt]
    elo_state = compute_current_elo_state(elo_input, season=season)
    out.update(build_matchup_strength_features(
        home_team=home_team,
        away_team=away_team,
        home_row=home_row,
        away_row=away_row,
        is_playoff=out["IS_PLAYOFF"],
        days_rest_home=days_rest_home,
        days_rest_away=days_rest_away,
        elo_state=elo_state,
    ))

    # PTS_LAST_5, PTS_LAST_10, WINRATE_LAST_5, WINRATE_LAST_10 for home
    out["PTS_LAST_5"] = float(safe_get(home_row, "PTS_LAST_5", np.nan))
    out["PTS_LAST_10"] = float(safe_get(home_row, "PTS_LAST_10", np.nan))
    out["WINRATE_LAST_5"] = float(safe_get(home_row, "WINRATE_LAST_5", np.nan))
    out["WINRATE_LAST_10"] = float(safe_get(home_row, "WINRATE_LAST_10", np.nan))

    # Opponent equivalents (OPP_...): use away_row as opponent viewpoint
    out["OPP_DAYS_REST"] = days_rest_away if not pd.isna(days_rest_away) else np.nan
    out["OPP_IS_B2B"] = is_b2b_away
    out["OPP_TRAVEL_DISTANCE"] = dist if team_is_home else 0.0
    out["OPP_TIMEZONE_DIFF"] = tz_diff if team_is_home else 0.0
    out["OPP_PTS_LAST_5"] = float(safe_get(away_row, "PTS_LAST_5", np.nan))
    out["OPP_PTS_LAST_10"] = float(safe_get(away_row, "PTS_LAST_10", np.nan))
    out["OPP_WINRATE_LAST_5"] = float(safe_get(away_row, "WINRATE_LAST_5", np.nan))
    out["OPP_WINRATE_LAST_10"] = float(safe_get(away_row, "WINRATE_LAST_10", np.nan))

    # PTS_ALLOWED_LAST_5, PTS_ALLOWED_LAST_10
    out["PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "PTS_ALLOWED_LAST_5", np.nan))
    out["PTS_ALLOWED_LAST_10"] = float(safe_get(home_row, "PTS_ALLOWED_LAST_10", np.nan))
    out["OPP_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "PTS_ALLOWED_LAST_5", np.nan))
    out["OPP_PTS_ALLOWED_LAST_10"] = float(safe_get(away_row, "PTS_ALLOWED_LAST_10", np.nan))

    # Home/Away splits and venue-aware aliases
    out["HOME_WINRATE_LAST_5"] = float(safe_get(home_row, "HOME_WINRATE_LAST_5", np.nan))
    out["HOME_PTS_LAST_5"] = float(safe_get(home_row, "HOME_PTS_LAST_5", np.nan))
    out["HOME_PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "HOME_PTS_ALLOWED_LAST_5", np.nan))

    out["AWAY_WINRATE_LAST_5"] = float(safe_get(home_row, "AWAY_WINRATE_LAST_5", np.nan))
    out["AWAY_PTS_LAST_5"] = float(safe_get(home_row, "AWAY_PTS_LAST_5", np.nan))
    out["AWAY_PTS_ALLOWED_LAST_5"] = float(safe_get(home_row, "AWAY_PTS_ALLOWED_LAST_5", np.nan))

    # Opponent home/away splits (from away_row perspective)
    out["OPP_HOME_WINRATE_LAST_5"] = float(safe_get(away_row, "HOME_WINRATE_LAST_5", np.nan))
    out["OPP_HOME_PTS_LAST_5"] = float(safe_get(away_row, "HOME_PTS_LAST_5", np.nan))
    out["OPP_HOME_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "HOME_PTS_ALLOWED_LAST_5", np.nan))

    out["OPP_AWAY_WINRATE_LAST_5"] = float(safe_get(away_row, "AWAY_WINRATE_LAST_5", np.nan))
    out["OPP_AWAY_PTS_LAST_5"] = float(safe_get(away_row, "AWAY_PTS_LAST_5", np.nan))
    out["OPP_AWAY_PTS_ALLOWED_LAST_5"] = float(safe_get(away_row, "AWAY_PTS_ALLOWED_LAST_5", np.nan))

    # Pregame rows already resolve CURRENT_VENUE_* to the venue of this game.
    for col in ["CURRENT_VENUE_WINRATE_LAST_5", "CURRENT_VENUE_PTS_LAST_5", "CURRENT_VENUE_PTS_ALLOWED_LAST_5"]:
        out[col] = float(safe_get(home_row, col, np.nan))
        out[f"OPP_{col}"] = float(safe_get(away_row, col, np.nan))

    # H2H: the pregame rows hold this season's last meetings with today's opponent,
    # NaN before the first meeting, exactly like the training rows.
    for col in ["H2H_GAMES_LAST_5", "H2H_WINRATE_LAST_5", "H2H_PTS_LAST_5", "H2H_PTS_ALLOWED_LAST_5"]:
        out[col] = float(safe_get(home_row, col, np.nan))
        out[f"OPP_{col}"] = float(safe_get(away_row, col, np.nan))

    # Situational and Advanced Net Rating Differentials
    clean_h = float(safe_get(home_row, "CLEAN_NET_RTG_LAST_10", safe_get(home_row, "NET_RTG_LAST_10", 0.0)))
    clean_a = float(safe_get(away_row, "CLEAN_NET_RTG_LAST_10", safe_get(away_row, "NET_RTG_LAST_10", 0.0)))
    out["CLEAN_NET_RTG_DIFF_LAST_10"] = clean_h - clean_a

    clutch_h = float(safe_get(home_row, "CLUTCH_NET_RTG_LAST_10", safe_get(home_row, "NET_RTG_LAST_10", 0.0)))
    clutch_a = float(safe_get(away_row, "CLUTCH_NET_RTG_LAST_10", safe_get(away_row, "NET_RTG_LAST_10", 0.0)))
    out["CLUTCH_NET_RTG_DIFF_LAST_10"] = clutch_h - clutch_a

    # Final mapping and missing-column handling for the original required cols
    # (roster absence features are filled in further down, from player logs and overrides)
    LIVE_ROSTER_FEATURES = {"ABS_DELTA", "OPP_ABS_DELTA", "ABS_DIFF"}
    res = {}
    missing_cols = []
    for c in feat_cols:
        if c in out:
            res[c] = out[c]
        elif c.startswith("OPP_") and away_row is not None and c[4:] in away_row.index:
            val = away_row[c[4:]]
            res[c] = float(val) if pd.notna(val) else np.nan
        else:
            # If a required model feature is not computed above, attempt to pull from home_row
            val = safe_get(home_row, c, np.nan)
            if pd.isna(val) and c not in LIVE_ROSTER_FEATURES:
                missing_cols.append(c)
            res[c] = float(val) if pd.notna(val) else np.nan

    if missing_cols:
        # warn but continue; downstream code should impute as the model pipeline expects
        print("Warning: the following features could not be directly computed and are NaN:", missing_cols)

    # Append all other features from home_row
    if home_row is not None:
        for c in home_row.index:
            if c not in res:
                val = home_row[c]
                if isinstance(val, (int, float, np.integer, np.floating)):
                    res[c] = float(val) if pd.notna(val) else np.nan
                elif isinstance(val, pd.Timestamp):
                    res[c] = str(val)
                elif isinstance(val, (bool, np.bool_)):
                    res[c] = bool(val)
                else:
                    res[c] = val
                
    # Append all other features from away_row as OPP_
    if away_row is not None:
        for c in away_row.index:
            opp_c = f"OPP_{c}"
            if opp_c not in res:
                val = away_row[c]
                if isinstance(val, (int, float, np.integer, np.floating)):
                    res[opp_c] = float(val) if pd.notna(val) else np.nan
                elif isinstance(val, pd.Timestamp):
                    res[opp_c] = str(val)
                elif isinstance(val, (bool, np.bool_)):
                    res[opp_c] = bool(val)
                else:
                    res[opp_c] = val

    # Map HOME/AWAY player features to TEAM/OPP player features for Score V3
    for k, v in list(out.items()):
        if k not in res:
            res[k] = v
        # Translate player features:
        # Never let an alias overwrite a real feature: AWAY_PTS_LAST_5 is this
        # team's away-venue split, not the opponent's OPP_PTS_LAST_5.
        if k.startswith("HOME_"):
            team_k = k.replace("HOME_", "TEAM_", 1)
            if team_k not in out:
                res[team_k] = v
        elif k.startswith("AWAY_"):
            opp_k = k.replace("AWAY_", "OPP_", 1)
            if opp_k not in out:
                res[opp_k] = v

    # Manually map aliases to fix V3 score missing player gap feature names
    res["TEAM_CORE_TOP3_PTS_LAST_5_SUM"] = res.get("HOME_TOP3_EXPECTED_PTS_SUM", 0.0)
    res["OPP_CORE_TOP3_PTS_LAST_5_SUM"] = res.get("AWAY_TOP3_EXPECTED_PTS_SUM", 0.0)
    res["TEAM_CORE_TOP3_PLAYED_COUNT"] = res.get("HOME_TOP3_AVAILABLE", 0.0)
    res["OPP_CORE_TOP3_PLAYED_COUNT"] = res.get("AWAY_TOP3_AVAILABLE", 0.0)
    res["TEAM_CORE_TOP3_AVAILABLE_RATE"] = res.get("HOME_TOP3_AVAILABLE", 0.0) / 3.0

    # Early season: games played this season and the Elo blend weight
    try:
        season_start_year = int(season.split("-")[0])
        season_start_dt = pd.Timestamp(f"{season_start_year}-{SEASON_START_MONTH:02d}-01")
        raw_tg = _raw_season_games(season)
        if not raw_tg.empty and "GAME_DATE" in raw_tg.columns:
            _ensure_datetime(raw_tg, "GAME_DATE")
            n_home = int(len(raw_tg[(raw_tg["TEAM_ABBREVIATION"] == home_team) & (raw_tg["GAME_DATE"] < pred_dt) & (raw_tg["GAME_DATE"] >= season_start_dt)]))
            n_away = int(len(raw_tg[(raw_tg["TEAM_ABBREVIATION"] == away_team) & (raw_tg["GAME_DATE"] < pred_dt) & (raw_tg["GAME_DATE"] >= season_start_dt)]))
        else:
            n_home = 0
            n_away = 0

        n_min = min(n_home, n_away)

        res["GAMES_PLAYED_HOME_SEASON"] = n_home
        res["GAMES_PLAYED_AWAY_SEASON"] = n_away

        # Prediction-level Pure Elo blend weight until both teams have played
        # EARLY_SEASON_BLEND_GAMES regular-season games (preseason is not counted).
        # Features themselves stay raw: the models were trained on raw early-season
        # rows, and shrinking them here raised walk-forward log loss in every 0-20 game bucket.
        if n_min < EARLY_SEASON_BLEND_GAMES:
            res["EARLY_SEASON_ELO_BLEND_WEIGHT"] = float(max(0.0, 1.0 - (n_min / EARLY_SEASON_BLEND_GAMES)) * 0.40)
        else:
            res["EARLY_SEASON_ELO_BLEND_WEIGHT"] = 0.0
        blend_score_form_with_prior(res, season, home_team, away_team, n_home, n_away)
    except Exception:
        pass

    # Situational and Advanced Net Rating Differentials (computed for all games)
    try:
        clean_h = float(res.get("CLEAN_NET_RTG_LAST_10") if res.get("CLEAN_NET_RTG_LAST_10") is not None else (res.get("NET_RTG_LAST_10") or 0.0))
        clean_a = float(res.get("OPP_CLEAN_NET_RTG_LAST_10") if res.get("OPP_CLEAN_NET_RTG_LAST_10") is not None else (res.get("OPP_NET_RTG_LAST_10") or 0.0))
        res["CLEAN_NET_RTG_DIFF_LAST_10"] = clean_h - clean_a

        clutch_h = float(res.get("CLUTCH_NET_RTG_LAST_10") or 0.0)
        clutch_a = float(res.get("OPP_CLUTCH_NET_RTG_LAST_10") or 0.0)
        res["CLUTCH_NET_RTG_DIFF_LAST_10"] = clutch_h - clutch_a

        if "NET_RTG_DIFF_LAST_10" not in res or res["NET_RTG_DIFF_LAST_10"] is None:
            net_h = float(res.get("NET_RTG_LAST_10") or 0.0)
            net_a = float(res.get("OPP_NET_RTG_LAST_10") or 0.0)
            res["NET_RTG_DIFF_LAST_10"] = net_h - net_a
    except Exception:
        pass


    # Roster availability: players marked OUT/RESTRICTED move the team strength the
    # form features still credit them with (see src/features/roster_absence.py).
    overrides = _parse_player_overrides(player_status_overrides)
    player_logs = _load_player_games(season)
    player_logs = _load_absence_logs(season)
    pre = bool(res.get("IS_PRESEASON"))
    res["ABS_DELTA"] = live_absence_delta(player_logs, home_team, pred_dt, overrides, pre, current_roster_ids(home_team, pred_dt))
    res["OPP_ABS_DELTA"] = live_absence_delta(player_logs, away_team, pred_dt, overrides, pre, current_roster_ids(away_team, pred_dt))
    res["ABS_DIFF"] = res["ABS_DELTA"] - res["OPP_ABS_DELTA"]

    # Validation: ensure all values derived from rows have GAME_DATE < prediction_date
    # (we filtered at top; assert again)
    if any(team_df["GAME_DATE"] >= pred_dt):
        raise RuntimeError("Leakage detected: team features contain games on/after prediction_date")

    return res


def _parse_player_overrides(overrides):
    lookup = {}
    if not overrides:
        return lookup
    for item in overrides:
        if isinstance(item, dict):
            pid = item.get("player_id")
            pname = item.get("player_name")
            status = str(item.get("status", "ACTIVE")).upper()
            minute_limit = item.get("minute_limit")
            factor = item.get("status_factor")
            is_starter = item.get("is_starter")
        else:
            pid = getattr(item, "player_id", None)
            pname = getattr(item, "player_name", None)
            status = str(getattr(item, "status", "ACTIVE")).upper()
            minute_limit = getattr(item, "minute_limit", None)
            factor = getattr(item, "status_factor", None)
            is_starter = getattr(item, "is_starter", None)

        if factor is None:
            if status in ("OUT", "INACTIVE"):
                factor = 0.0
            elif status in ("RESTRICTED", "QUESTIONABLE"):
                factor = 0.6
            else:
                factor = 1.0

        entry = {
            "status": status,
            "factor": float(factor),
            "minute_limit": minute_limit,
            "is_starter": is_starter,
        }
        if pid is not None:
            try:
                lookup[int(pid)] = entry
            except (ValueError, TypeError):
                pass
        if pname:
            lookup[str(pname).strip().lower()] = entry
    return lookup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True, help="Home team abbreviation (e.g., LAL)")
    parser.add_argument("--away", required=True, help="Away team abbreviation (e.g., BOS)")
    parser.add_argument("--prediction-date", required=True, help="YYYY-MM-DD (tip-off date)")
    parser.add_argument("--out-json", help="Optional output path; prints to stdout if omitted")
    parser.add_argument("--season", help="Optional season string (e.g., 2024-25)")
    args = parser.parse_args()

    feats = build_features(args.home.upper(), args.away.upper(), args.prediction_date, season=args.season)
    out_text = json.dumps(feats, indent=2)
    if args.out_json:
        Path(args.out_json).write_text(out_text)
    else:
        print(out_text)


if __name__ == '__main__':
    main()
