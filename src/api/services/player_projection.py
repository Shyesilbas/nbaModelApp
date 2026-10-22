import logging
import re
import pandas as pd
import numpy as np
from pathlib import Path
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[3]

from src.core.data_paths import PLAYER_METADATA_CSV, PLAYER_TRAINING_CSV, get_data_paths
from src.core.season_utils import date_to_season
from src.processing.cleaning import clean_minutes_column
from src.analysis.roster_transactions import MOVEMENTS_PATH, roster_as_of
from src.features.player_form import RAW_GAME_COLUMNS, add_player_matchup_features, pregame_player_rows

logger = logging.getLogger(__name__)

_player_df_cache = {}

# Early season: projections lean on last season's per-game averages, fading out over
# PLAYER_PRIOR_GAMES games of the new season. 2025-26 holdout: first-game MAE PTS 4.48 -> 4.32,
# REB 1.97 -> 1.94, AST 1.34 -> 1.32; unchanged from the third game on.
PLAYER_PRIOR_GAMES = 3
PLAYER_PRIOR_MAX_WEIGHT = 0.4


@lru_cache(maxsize=8)
def _played_logs(path_str: str, _mtime_ns: int) -> pd.DataFrame:
    d = pd.read_csv(path_str, usecols=["Player_ID", "Game_ID", "GAME_DATE", "MIN", "PTS", "REB", "AST", "SEASON_TYPE"], dtype={"Game_ID": str})
    d = d[~d["Game_ID"].str.zfill(10).str.startswith("001")]
    d = d[pd.to_numeric(d["MIN"], errors="coerce").fillna(0.0) > 0].copy()
    d["GAME_DATE"] = pd.to_datetime(d["GAME_DATE"])
    return d


def _season_logs(season: str) -> pd.DataFrame:
    path = Path(get_data_paths(season).player_games_raw)
    if not path.exists():
        return pd.DataFrame(columns=["Player_ID", "GAME_DATE", "PTS", "REB", "AST", "SEASON_TYPE"])
    return _played_logs(str(path), path.stat().st_mtime_ns)


def blend_early_season_projection(full_X: pd.DataFrame, pred_dt) -> pd.DataFrame:
    """Blend RAW_PROJ_* with last regular season's per-game averages for a player's first games."""
    from src.features.build_matchup_features import previous_season

    season = date_to_season(pred_dt)
    current = _season_logs(season)
    games = current[current["GAME_DATE"] < pred_dt].groupby("Player_ID").size()
    prev = _season_logs(previous_season(season))
    prior = prev[prev["SEASON_TYPE"] == "Regular Season"].groupby("Player_ID")[["PTS", "REB", "AST"]].mean()

    pid = full_X["PLAYER_ID"].astype(int)
    n = pid.map(games).fillna(0).to_numpy(dtype=float)
    weight = np.where(n < PLAYER_PRIOR_GAMES, PLAYER_PRIOR_MAX_WEIGHT * (1.0 - n / PLAYER_PRIOR_GAMES), 0.0)
    for stat in ("PTS", "REB", "AST"):
        col = f"RAW_PROJ_{stat}"
        base = pid.map(prior[stat]).to_numpy(dtype=float)
        w = np.where(np.isnan(base), 0.0, weight)
        full_X[col] = (1.0 - w) * full_X[col].to_numpy(dtype=float) + w * np.nan_to_num(base)
    return full_X



def is_playoff_date(dt) -> int:
    if dt.month in {5, 6}:
        return 1
    if dt.month == 4 and dt.day >= 12:
        return 1
    return 0


def scheduled_is_playoff(dt, home_team: str = None, away_team: str = None, season: str = None) -> int:
    """Postseason flag (play-in included, as in training) from the schedule; month rule if the game is not listed."""
    try:
        sched_p = Path(get_data_paths(season or date_to_season(dt)).schedule_combined)
        if sched_p.exists():
            df_sched = pd.read_csv(sched_p, usecols=lambda c: c in {"GAME_DATE", "HOME_TEAM_ABBREVIATION", "AWAY_TEAM_ABBREVIATION", "SEASON_TYPE"})
            match = df_sched[
                (pd.to_datetime(df_sched["GAME_DATE"]).dt.date == dt.date())
                & (df_sched["HOME_TEAM_ABBREVIATION"] == home_team)
                & (df_sched["AWAY_TEAM_ABBREVIATION"] == away_team)
            ]
            if not match.empty:
                return int(str(match.iloc[0]["SEASON_TYPE"]) in {"Playoffs", "PlayIn", "NBA Finals"})
    except Exception:
        pass
    return is_playoff_date(dt)


def is_preseason_match(dt, home_team: str = None, away_team: str = None, season: str = None) -> bool:
    try:
        from src.core.data_paths import get_data_paths
        from pathlib import Path
        s = season or date_to_season(dt)
        dp = get_data_paths(s)
        sched_p = Path(dp.schedule_combined)
        if sched_p.exists():
            df_sched = pd.read_csv(sched_p)
            df_sched["GAME_DATE"] = pd.to_datetime(df_sched["GAME_DATE"])
            match = df_sched[
                (df_sched["GAME_DATE"].dt.date == dt.date()) &
                (df_sched["HOME_TEAM_ABBREVIATION"] == home_team) &
                (df_sched["AWAY_TEAM_ABBREVIATION"] == away_team)
            ]
            if not match.empty:
                st = str(match.iloc[0].get("SEASON_TYPE", "")).lower()
                gid = str(match.iloc[0].get("GAME_ID", ""))
                return ("pre" in st) or gid.startswith("001") or gid.startswith("126")
    except Exception:
        pass
    return bool(dt.month == 10 and dt.day < 20)


def _normalize_player_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Consolidate Player_ID / PLAYER_ID
    if "Player_ID" in df.columns:
        if "PLAYER_ID" in df.columns:
            df["PLAYER_ID"] = df["PLAYER_ID"].fillna(df["Player_ID"])
            df = df.drop(columns=["Player_ID"])
        else:
            df = df.rename(columns={"Player_ID": "PLAYER_ID"})

    # Consolidate Game_ID / GAME_ID
    if "Game_ID" in df.columns:
        if "GAME_ID" in df.columns:
            df["GAME_ID"] = df["GAME_ID"].fillna(df["Game_ID"])
            df = df.drop(columns=["Game_ID"])
        else:
            df = df.rename(columns={"Game_ID": "GAME_ID"})

    # The model-ready dataset and the current season's feature file overlap; a game
    # counted twice would double-weight it in rolled-forward form.
    if {"PLAYER_ID", "GAME_ID"} <= set(df.columns):
        gid = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)
        df = df.loc[~pd.DataFrame({"p": df["PLAYER_ID"], "g": gid}).duplicated(keep="first")].copy()

    # Ensure TEAM_ABBREVIATION is populated
    if "MATCHUP" in df.columns:
        derived_team = df["MATCHUP"].astype(str).str.split(" ").str[0]
        if "TEAM_ABBREVIATION" in df.columns:
            missing_team = (
                df["TEAM_ABBREVIATION"].isna()
                | (df["TEAM_ABBREVIATION"] == "")
                | (df["TEAM_ABBREVIATION"].astype(str) == "None")
                | (df["TEAM_ABBREVIATION"].astype(str) == "nan")
            )
            df.loc[missing_team, "TEAM_ABBREVIATION"] = derived_team[missing_team]
        else:
            df["TEAM_ABBREVIATION"] = derived_team

    # Ensure MIN columns are populated
    min_col = df["MIN"] if "MIN" in df.columns else 15.0
    min_l5 = df["MIN_LAST_5"] if "MIN_LAST_5" in df.columns else min_col
    if "MIN_EMA_10" in df.columns:
        df["MIN_EMA_10"] = df["MIN_EMA_10"].fillna(min_l5).fillna(min_col).fillna(15.0)
    else:
        df["MIN_EMA_10"] = min_l5

    if "MIN_LAST_5" in df.columns:
        df["MIN_LAST_5"] = df["MIN_LAST_5"].fillna(min_col).fillna(15.0)
    else:
        df["MIN_LAST_5"] = min_col

    min_ema = df["MIN_EMA_10"]
    if "MIN_EMA_5" in df.columns:
        df["MIN_EMA_5"] = df["MIN_EMA_5"].fillna(min_ema)
    else:
        df["MIN_EMA_5"] = min_ema

    if "MIN_LAST_3" in df.columns:
        df["MIN_LAST_3"] = df["MIN_LAST_3"].fillna(df["MIN_LAST_5"])
    else:
        df["MIN_LAST_3"] = df["MIN_LAST_5"]

    if "MIN_LAST_10" in df.columns:
        df["MIN_LAST_10"] = df["MIN_LAST_10"].fillna(min_ema)
    else:
        df["MIN_LAST_10"] = min_ema

    if "MIN_TREND" in df.columns:
        df["MIN_TREND"] = df["MIN_TREND"].fillna(0.0)
    else:
        df["MIN_TREND"] = df["MIN_EMA_5"] - min_ema

    if "MIN_STD_LAST_10" in df.columns:
        df["MIN_STD_LAST_10"] = df["MIN_STD_LAST_10"].fillna(3.0)
    else:
        df["MIN_STD_LAST_10"] = 3.0

    # Ensure USG_PCT is populated
    if "USG_PCT_LAST_10" in df.columns:
        df["USG_PCT_LAST_10"] = df["USG_PCT_LAST_10"].fillna(18.0)
    else:
        df["USG_PCT_LAST_10"] = 18.0

    if "USG_PCT_LAST_3" in df.columns:
        df["USG_PCT_LAST_3"] = df["USG_PCT_LAST_3"].fillna(18.0)
    else:
        df["USG_PCT_LAST_3"] = 18.0

    usg_10 = df["USG_PCT_LAST_10"]
    usg_3 = df["USG_PCT_LAST_3"]
    if "USG_PCT_EMA_10" in df.columns:
        df["USG_PCT_EMA_10"] = df["USG_PCT_EMA_10"].fillna(usg_10)
    else:
        df["USG_PCT_EMA_10"] = usg_10

    if "USG_PCT_EMA_5" in df.columns:
        df["USG_PCT_EMA_5"] = df["USG_PCT_EMA_5"].fillna(usg_3)
    else:
        df["USG_PCT_EMA_5"] = usg_3

    if "USG_PCT_TREND" in df.columns:
        df["USG_PCT_TREND"] = df["USG_PCT_TREND"].fillna(0.0)
    else:
        df["USG_PCT_TREND"] = df["USG_PCT_EMA_5"] - df["USG_PCT_EMA_10"]

    if "USG_PCT_STD_LAST_10" in df.columns:
        df["USG_PCT_STD_LAST_10"] = df["USG_PCT_STD_LAST_10"].fillna(2.0)
    else:
        df["USG_PCT_STD_LAST_10"] = 2.0

    if "TEAM_PACE" in df.columns:
        df["TEAM_PACE"] = df["TEAM_PACE"].fillna(100.0)
    else:
        df["TEAM_PACE"] = 100.0

    if "OPP_TEAM_PACE" in df.columns:
        df["OPP_TEAM_PACE"] = df["OPP_TEAM_PACE"].fillna(100.0)
    else:
        df["OPP_TEAM_PACE"] = 100.0

    if "DAYS_REST" in df.columns:
        df["DAYS_REST"] = df["DAYS_REST"].fillna(2.0)
    else:
        df["DAYS_REST"] = 2.0

    if "PLUS_MINUS_LAST_5" in df.columns:
        df["PLUS_MINUS_LAST_5"] = df["PLUS_MINUS_LAST_5"].fillna(0.0)
    else:
        df["PLUS_MINUS_LAST_5"] = 0.0

    # Ensure POSITION_GROUP / PLAYER_POSITION_GROUP
    if "PLAYER_POSITION_GROUP" not in df.columns and "POSITION_GROUP" in df.columns:
        df["PLAYER_POSITION_GROUP"] = df["POSITION_GROUP"]
    if "POSITION_GROUP" not in df.columns and "PLAYER_POSITION_GROUP" in df.columns:
        df["POSITION_GROUP"] = df["PLAYER_POSITION_GROUP"]
    if "POSITION_GROUP" in df.columns:
        df["POSITION_GROUP"] = df["POSITION_GROUP"].fillna("WING")
    if "PLAYER_POSITION_GROUP" in df.columns:
        df["PLAYER_POSITION_GROUP"] = df["PLAYER_POSITION_GROUP"].fillna("WING")

    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    return df


def _non_preseason_logs(season: str) -> pd.DataFrame:
    path = Path(get_data_paths(season).player_games_raw)
    if not path.exists():
        return pd.DataFrame()
    raw = pd.read_csv(path, dtype={"Game_ID": str})
    return raw[~raw["Game_ID"].str.zfill(10).str.startswith("001")].copy()


def season_rows_from_raw(season: str) -> pd.DataFrame:
    """This season's player games in the model-ready layout (GAME_* raw columns incl. USG_PCT).

    Built straight from the raw box scores, so a game ingested by any path (daily update or the
    on-demand refresh) reaches player form at once, with usage computed as in training.
    """
    from src.processing.player_dataset_builder import add_usage_pct

    raw = _non_preseason_logs(season)
    if raw.empty:
        return raw
    raw = clean_minutes_column(raw, "MIN")
    raw["GAME_ID"] = raw["Game_ID"].str.zfill(10)
    raw["TEAM_ABBREVIATION"] = raw["MATCHUP"].str.split(" ").str[0]
    raw["OPPONENT_ABBREVIATION"] = raw["MATCHUP"].str.split().str[-1]
    raw["IS_HOME"] = raw["MATCHUP"].str.contains("vs.", regex=False).astype(int)
    raw["GAME_DATE"] = pd.to_datetime(raw["GAME_DATE"])
    raw = add_usage_pct(raw)
    for col in ("PTS", "REB", "AST", "PLUS_MINUS"):
        raw[col] = pd.to_numeric(raw[col], errors="coerce")
    for col, kept in RAW_GAME_COLUMNS.items():
        raw[kept] = raw[col]
    raw["PLAYER_ID"] = raw["Player_ID"]
    keep = ["SEASON_ID", "PLAYER_ID", "GAME_ID", "GAME_DATE", "MATCHUP", "PLAYER_NAME", "SEASON_TYPE",
            "TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION", "IS_HOME", *RAW_GAME_COLUMNS, *RAW_GAME_COLUMNS.values()]
    out = raw[[c for c in keep if c in raw.columns]].copy()
    out["_LIVE_ROW"] = True
    return out


@lru_cache(maxsize=8)
def _position_totals(seasons: tuple, _mtimes: tuple):
    from src.processing.player_dataset_builder import position_totals_by_game

    raw = pd.concat([_non_preseason_logs(s) for s in seasons], ignore_index=True)
    meta = pd.read_csv(PLAYER_METADATA_CSV, usecols=["PLAYER_ID", "POSITION_GROUP"]).drop_duplicates("PLAYER_ID")
    return position_totals_by_game(raw, meta)


def opponent_allowance(opponent_team: str, pred_dt, season: str) -> dict:
    """OPP_{POS}_{STAT}_ALLOWED_LAST_10 for a game on ``pred_dt``: what the opponent allowed per
    position group over its last 10 games before that date, as the training rows define it."""
    from src.features.build_matchup_features import previous_season
    from src.processing.player_dataset_builder import ALLOWANCE_WINDOW, allowance_column_names

    seasons = (previous_season(season), season)
    paths = [Path(get_data_paths(s).player_games_raw) for s in seasons]
    pivot, stat_cols = _position_totals(seasons, tuple(p.stat().st_mtime_ns if p.exists() else 0 for p in paths))
    games = pivot[(pivot["OPP_TEAM"] == opponent_team) & (pivot["GAME_DATE"] < pd.Timestamp(pred_dt))]
    if games.empty:
        return {}
    recent = games.sort_values("GAME_DATE").tail(ALLOWANCE_WINDOW)[stat_cols].mean()
    return recent.rename(allowance_column_names(stat_cols)).to_dict()


def _load_player_dataset(season: str = None):
    global _player_df_cache

    v4_path = PLAYER_TRAINING_CSV
    season_path = None
    if season:
        season_path = Path(get_data_paths(season).player_games_raw)

    # Keyed by file versions so a data refresh is picked up without restarting the service.
    meta_path = PLAYER_METADATA_CSV
    sources = [p for p in (v4_path, season_path, meta_path) if p is not None and p.exists()]
    cache_key = tuple((str(p), p.stat().st_mtime_ns) for p in sources)
    if cache_key in _player_df_cache:
        return _player_df_cache[cache_key]
    _player_df_cache.clear()

    dfs = []
    if v4_path.exists():
        dfs.append(pd.read_csv(v4_path))
    if season_path is not None and season_path.exists():
        dfs.append(season_rows_from_raw(season))

    if not dfs:
        raise FileNotFoundError("Player dataset (V3 or V4) missing for player inference.")

    df_combined = pd.concat(dfs, ignore_index=True) if len(dfs) > 1 else dfs[0]
    normalized_df = _normalize_player_dataset(df_combined)
    if meta_path.exists():
        # Current-season feature files carry no position; the training dataset takes it from
        # this same file, so map it here instead of letting the WING fill-in stand.
        meta = pd.read_csv(meta_path, usecols=["PLAYER_ID", "POSITION_GROUP"]).drop_duplicates("PLAYER_ID")
        canonical = normalized_df["PLAYER_ID"].map(meta.set_index("PLAYER_ID")["POSITION_GROUP"])
        for col in ("PLAYER_POSITION_GROUP", "POSITION_GROUP"):
            normalized_df[col] = canonical.fillna(normalized_df[col])
    _player_df_cache[cache_key] = normalized_df
    return normalized_df


@lru_cache(maxsize=32)
def _season_roster(roster_path: str, season: str, as_of: str, _mtimes: tuple) -> pd.DataFrame:
    # The bootstrap roster is a pre-season snapshot; replay trades/signings/waivers up to the game date.
    return roster_as_of(pd.read_csv(roster_path), season, as_of)


def _active_roster_ids(team: str, season: str, as_of=None):
    roster_path = Path(get_data_paths(season).team_rosters)
    if not roster_path.exists():
        return None, None

    try:
        as_of = pd.Timestamp(as_of or pd.Timestamp.today()).strftime("%Y-%m-%d")
        mtimes = tuple(p.stat().st_mtime if p.exists() else 0.0 for p in (roster_path, MOVEMENTS_PATH))
        roster_df = _season_roster(str(roster_path), season, as_of, mtimes)
        team_roster = roster_df[roster_df["TEAM_ABBREVIATION"] == team]
        return set(team_roster["PLAYER_ID"].unique()), team_roster
    except Exception:
        return None, None


# Per-minute production of players in their first 60 NBA days (regular season 2021-22..2025-26,
# 555 players). Players with no NBA box score yet are projected as rate x projected minutes:
# the model has no form to read for them.
NO_HISTORY_PER_MIN = {
    "GUARD": {"PTS": 0.384, "REB": 0.139, "AST": 0.104},
    "WING": {"PTS": 0.377, "REB": 0.185, "AST": 0.064},
    "BIG": {"PTS": 0.399, "REB": 0.283, "AST": 0.066},
}


def _is_player_form_column(col: str) -> bool:
    if col in RAW_GAME_COLUMNS.values() or col in RAW_GAME_COLUMNS:
        return True
    return bool(re.search(r"_(LAST|EMA)_\d+$|_PER_MIN_LAST_10$|_TREND$|_STD_LAST_10$", col))


@lru_cache(maxsize=1)
def _metadata_positions() -> dict:
    if not PLAYER_METADATA_CSV.exists():
        return {}
    meta = pd.read_csv(PLAYER_METADATA_CSV, usecols=["PLAYER_ID", "POSITION_GROUP"]).dropna()
    return {int(p): str(g) for p, g in zip(meta["PLAYER_ID"], meta["POSITION_GROUP"])}


def apply_no_history_rates(full_X: pd.DataFrame) -> pd.DataFrame:
    """RAW_PROJ_* of players without any box score become per-minute rates (scaled by minutes later)."""
    if "NO_HISTORY" not in full_X.columns:
        return full_X
    mask = full_X["NO_HISTORY"].fillna(False).astype(bool)
    pos = full_X.loc[mask, "PLAYER_POSITION_GROUP"].fillna("WING").astype(str).str.upper()
    for stat in ("PTS", "REB", "AST"):
        full_X.loc[mask, f"RAW_PROJ_{stat}"] = pos.map(lambda p: NO_HISTORY_PER_MIN.get(p, NO_HISTORY_PER_MIN["WING"])[stat])
    return full_X


def _roster_candidates(last_games, team: str, active_ids, team_roster_df=None):
    if active_ids:
        candidates = last_games[last_games["PLAYER_ID"].isin(active_ids)].copy()
        candidates["TEAM_ABBREVIATION"] = team

        # Synthesize baseline candidate row for any official roster player not yet observed in last_games.
        # The template only supplies the game context columns: another player's form must not leak in.
        missing_ids = set(active_ids) - set(candidates["PLAYER_ID"])
        if missing_ids and team_roster_df is not None and not last_games.empty:
            template_row = {
                c: (np.nan if _is_player_form_column(c) else v) for c, v in last_games.iloc[0].to_dict().items()
            }
            positions = _metadata_positions()
            missing_rows = team_roster_df[team_roster_df["PLAYER_ID"].isin(missing_ids)]
            new_rows = []
            for _, r in missing_rows.iterrows():
                row_copy = template_row.copy()
                pid = r["PLAYER_ID"]
                pname = r.get("PLAYER_NAME", f"Player {pid}")
                avg_min = float(r.get("AVG_MIN", 0.0))
                avg_pts = float(r.get("AVG_PTS", 0.0))
                avg_reb = float(r.get("AVG_REB", 0.0))
                avg_ast = float(r.get("AVG_AST", 0.0))
                row_copy.update({
                    "PLAYER_ID": pid,
                    "PLAYER_NAME": pname,
                    "TEAM_ABBREVIATION": team,
                    "MIN_EMA_10": avg_min,
                    "MIN_EMA_5": avg_min,
                    "MIN_LAST_5": avg_min,
                    "MIN_LAST_3": avg_min,
                    "MIN_LAST_10": avg_min,
                    "MIN": avg_min,
                    "PTS_LAST_5": avg_pts,
                    "PTS_LAST_10": avg_pts,
                    "PTS": avg_pts,
                    "REB_LAST_5": avg_reb,
                    "REB": avg_reb,
                    "AST_LAST_5": avg_ast,
                    "AST": avg_ast,
                    "USG_PCT_LAST_10": 12.0,
                    "USG_PCT_LAST_3": 12.0,
                    "USG_PCT_EMA_10": 12.0,
                    "USG_PCT_EMA_5": 12.0,
                    "POSITION_GROUP": positions.get(int(pid), "WING"),
                    "PLAYER_POSITION_GROUP": positions.get(int(pid), "WING"),
                    "NO_HISTORY": True,
                })
                new_rows.append(row_copy)
            if new_rows:
                candidates = pd.concat([candidates, pd.DataFrame(new_rows)], ignore_index=True)

        if len(candidates) > 0:
            return candidates

    return last_games[last_games["TEAM_ABBREVIATION"] == team]



def _filter_recent_active(candidates, past_df, team: str, active_ids=None):
    if active_ids:
        # If an official roster is defined for this season/matchup, respect it and preserve all roster members
        return candidates

    team_dates = sorted(past_df[past_df["TEAM_ABBREVIATION"] == team]["GAME_DATE"].unique())
    if len(team_dates) < 5:
        return candidates

    recent_dates = team_dates[-15:]
    recent_active = set(
        past_df[
            (past_df["TEAM_ABBREVIATION"] == team)
            & (past_df["GAME_DATE"].isin(recent_dates))
        ]["PLAYER_ID"].unique()
    )
    filtered = candidates[candidates["PLAYER_ID"].isin(recent_active)]
    return filtered if len(filtered) > 0 else candidates


def _opponent_context(past_df, opponent_team: str, pred_dt, season: str) -> dict:
    """Opponent allowance from the raw box scores up to the game; the stored-row lookup is the fallback."""
    try:
        values = opponent_allowance(opponent_team, pred_dt, season)
        if values:
            return values
    except Exception as exc:
        logger.warning("Opponent allowance from raw logs failed for %s: %s", opponent_team, exc)
    return _defense_context(past_df, opponent_team)


def _defense_context(past_df, opponent_team: str):
    defense_rows = past_df[past_df["OPPONENT_ABBREVIATION"] == opponent_team].sort_values("GAME_DATE").tail(1)
    if len(defense_rows) == 0:
        defense_rows = past_df.tail(1)

    opp_cols = [c for c in past_df.columns if c.startswith("OPP_") and "ALLOWED" in c]
    return {c: defense_rows[c].values[0] for c in opp_cols}


def _build_inference_df(roster_df, is_home: bool, defense_values):
    roster_df = roster_df.copy()
    for key, value in defense_values.items():
        roster_df[key] = value
    roster_df["IS_HOME"] = 1 if is_home else 0
    return roster_df


def _build_future_rosters(df, home_team: str, away_team: str, pred_dt, prediction_date: str, roll_forward: bool = True):
    past_df = df[df["GAME_DATE"] < pred_dt]
    if len(past_df) == 0:
        past_df = df

    season = date_to_season(pred_dt)

    home_active, home_roster_df = _active_roster_ids(home_team, season, pred_dt)
    away_active, away_roster_df = _active_roster_ids(away_team, season, pred_dt)

    # Form is computed per player, so only the two teams' players (anyone who ever
    # played for either, plus the listed rosters) need rolling forward, not the league.
    wanted = set(past_df.loc[past_df["TEAM_ABBREVIATION"].isin([home_team, away_team]), "PLAYER_ID"]) | set(home_active or ()) | set(away_active or ())
    form_history = past_df[past_df["PLAYER_ID"].isin(wanted)]
    try:
        if not roll_forward:
            # Lineup preview: each player's last stored form row is enough to list and rank a roster.
            raise ValueError("roll-forward skipped")
        # Roll each player's form forward to include their latest game, as training rows do.
        last_games = pregame_player_rows(form_history, "PLAYER_ID", pred_dt)
    except ValueError as exc:
        if roll_forward:
            logger.warning("Player form not rolled forward (%s); using each player's last stored row.", exc)
        last_games = form_history.sort_values("GAME_DATE").groupby("PLAYER_ID").last().reset_index()

    home_candidates = _roster_candidates(last_games, home_team, home_active, home_roster_df)
    away_candidates = _roster_candidates(last_games, away_team, away_active, away_roster_df)

    home_candidates = _filter_recent_active(home_candidates, past_df, home_team, home_active)
    away_candidates = _filter_recent_active(away_candidates, past_df, away_team, away_active)

    minutes_col = "MIN_EMA_10" if "MIN_EMA_10" in df.columns else ("MIN_LAST_5" if "MIN_LAST_5" in df.columns else "MIN")

    # Provide all active roster members (without arbitrary truncation) so the complete rotation is available for status overrides
    home_roster = home_candidates.sort_values(minutes_col, ascending=False)
    away_roster = away_candidates.sort_values(minutes_col, ascending=False)

    if not home_active:
        home_roster = home_roster.head(18)
    if not away_active:
        away_roster = away_roster.head(18)

    if len(home_roster) == 0 or len(away_roster) == 0:
        raise ValueError(f"No active players found for {home_team} or {away_team} before {prediction_date}")

    home_X = _build_inference_df(home_roster, True, _opponent_context(past_df, away_team, pred_dt, season))
    away_X = _build_inference_df(away_roster, False, _opponent_context(past_df, home_team, pred_dt, season))

    is_playoff = scheduled_is_playoff(pred_dt, home_team, away_team, season)
    home_X["IS_PLAYOFF"] = is_playoff
    away_X["IS_PLAYOFF"] = is_playoff

    return home_X, away_X


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


def _roster_frames(home_team, away_team, prediction_date, is_preseason=None, roll_forward=True):
    """Home and away roster rows (with form features) for a game, no model involved."""
    pred_dt = pd.to_datetime(prediction_date)
    season = date_to_season(pred_dt)
    if is_preseason is None:
        is_preseason = is_preseason_match(pred_dt, home_team, away_team, season)

    df = _load_player_dataset(season)

    # A played game from the model-ready dataset reuses its stored pregame rows; this season's
    # rows come from the raw box scores and carry no form features, so they are rolled forward.
    stored = df[~df["_LIVE_ROW"].eq(True)] if "_LIVE_ROW" in df.columns else df
    historical_home = stored[(stored['TEAM_ABBREVIATION'] == home_team) & (stored['GAME_DATE'] == pred_dt)].copy()
    historical_away = stored[(stored['TEAM_ABBREVIATION'] == away_team) & (stored['GAME_DATE'] == pred_dt)].copy()

    if len(historical_home) > 0 and len(historical_away) > 0:
        home_X = historical_home
        away_X = historical_away
        home_X["IS_HOME"] = 1
        away_X["IS_HOME"] = 0
    else:
        home_X, away_X = _build_future_rosters(df, home_team, away_team, pred_dt, prediction_date, roll_forward)
    return home_X, away_X, is_preseason


_ROLE_SEASONS = ["2022-23", "2023-24", "2024-25", "2025-26", "2026-27"]
_role_model_cache = {}


def _role_model():
    """Role-minutes model fitted on the recorded starter flags; refit when those files change."""
    from src.features.starter_history import fit_role_model, load_role_inputs
    from src.ingestion.starters_fetcher import starters_path
    key = tuple(starters_path(s).stat().st_mtime_ns if starters_path(s).exists() else 0 for s in _ROLE_SEASONS)
    if key not in _role_model_cache:
        _role_model_cache.clear()
        _role_model_cache[key] = fit_role_model(*load_role_inputs(_ROLE_SEASONS))
    return _role_model_cache[key]


def _with_assumed_out(override_lookup: dict, home_team: str, away_team: str, prediction_date, raw_overrides, is_preseason) -> dict:
    """Rotation players who skipped their team's previous game and nobody mentioned count as OUT,
    as in the WIN/SCORE availability feature. Such a player plays the next game 27% of the time
    (rotation players, 20+ minutes, regular seasons 2022-23..2025-26) against 92% for one who played."""
    from .availability import assumed_out_ids

    lookup = dict(override_lookup)
    for team in (home_team, away_team):
        try:
            ids = assumed_out_ids(team, str(prediction_date)[:10], raw_overrides, preseason=bool(is_preseason))
        except Exception as exc:
            logger.warning("Assumed-out players unavailable for %s: %s", team, exc)
            continue
        for pid in ids:
            lookup.setdefault(int(pid), {"status": "OUT", "factor": 0.0, "minute_limit": None, "is_starter": None, "assumed": True})
    return lookup


def get_player_predictions(
    home_team: str,
    away_team: str,
    prediction_date: str,
    player_loader,
    score_loader,
    player_status_overrides=None,
    is_preseason: bool = None,
):
    """
    Generate player predictions for home and away teams using the V9 LightGBM models.
    Respects prediction_date to prevent future data leakage and use accurate historical rosters.
    Applies player injury/status overrides and redistributes scoring usage when players are out/restricted.
    """
    home_X, away_X, is_preseason = _roster_frames(home_team, away_team, prediction_date, is_preseason)

    full_X = add_player_matchup_features(pd.concat([home_X, away_X], ignore_index=True))
    full_X["IS_PRESEASON"] = 1 if is_preseason else 0
    features = player_loader.feature_cols
    
    # Ensure all columns exist
    # A missing feature is unknown, not zero: NaN lets the model's imputer use its training mean.
    for f in features:
        if f not in full_X.columns:
            full_X[f] = np.nan
            
    X_matrix = full_X[features]

    # 4. Predict Raw Values
    raw_pts = player_loader.pts_model.predict(X_matrix)
    raw_reb = player_loader.reb_model.predict(X_matrix)
    raw_ast = player_loader.ast_model.predict(X_matrix)

    full_X["RAW_PROJ_PTS"] = np.maximum(0.0, raw_pts)
    full_X["RAW_PROJ_REB"] = np.maximum(0.0, raw_reb)
    full_X["RAW_PROJ_AST"] = np.maximum(0.0, raw_ast)
    full_X = apply_no_history_rates(full_X)
    if not is_preseason:
        full_X = blend_early_season_projection(full_X, pd.to_datetime(prediction_date))

    # Process overrides and usage redistribution via dedicated engine
    from .usage_redistribution import redistribute_usage_and_minutes
    override_lookup = _parse_player_overrides(player_status_overrides)
    override_lookup = _with_assumed_out(override_lookup, home_team, away_team, prediction_date, player_status_overrides, is_preseason)
    full_X = redistribute_usage_and_minutes(
        full_X,
        override_lookup,
        is_preseason=bool(is_preseason),
        role_model=_role_model(),
    )

    return full_X

