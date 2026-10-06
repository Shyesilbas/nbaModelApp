import pandas as pd
import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

_player_df_cache = {}

def date_to_season(dt) -> str:
    year = dt.year
    month = dt.month
    if month < 10:
        start_year = year - 1
    else:
        start_year = year
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def is_playoff_date(dt) -> int:
    if dt.month in {5, 6}:
        return 1
    if dt.month == 4 and dt.day >= 12:
        return 1
    return 0


def is_preseason_match(dt, home_team: str = None, away_team: str = None, season: str = None) -> bool:
    try:
        from scripts.data_paths import get_data_paths
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


def _load_player_dataset(season: str = None):
    global _player_df_cache

    cache_key = f"player_dataset_{season or 'default'}"
    if cache_key in _player_df_cache:
        return _player_df_cache[cache_key]

    v4_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    dfs = []
    if v4_path.exists():
        dfs.append(pd.read_csv(v4_path))

    if season:
        season_path_parquet = ROOT / f"data/season={season}/features/player_features.parquet"
        season_path_csv = ROOT / f"data/season={season}/features/player_features.csv"
        if season_path_parquet.exists():
            dfs.append(pd.read_parquet(season_path_parquet))
        elif season_path_csv.exists():
            dfs.append(pd.read_csv(season_path_csv))

    if not dfs:
        raise FileNotFoundError("Player dataset (V3 or V4) missing for player inference.")

    df_combined = pd.concat(dfs, ignore_index=True) if len(dfs) > 1 else dfs[0]
    normalized_df = _normalize_player_dataset(df_combined)
    _player_df_cache[cache_key] = normalized_df
    return normalized_df


def _active_roster_ids(team: str, season: str):
    roster_path = ROOT / f"data/season={season}/analysis/team_rosters.csv"
    if not roster_path.exists():
        roster_path = ROOT / "data/canonical/team_rosters.csv"
    if not roster_path.exists():
        return None, None

    try:
        roster_df = pd.read_csv(roster_path)
        team_roster = roster_df[roster_df["TEAM_ABBREVIATION"] == team]
        return set(team_roster["PLAYER_ID"].unique()), team_roster
    except Exception:
        return None, None


def _roster_candidates(last_games, team: str, active_ids, team_roster_df=None):
    if active_ids:
        candidates = last_games[last_games["PLAYER_ID"].isin(active_ids)].copy()
        candidates["TEAM_ABBREVIATION"] = team

        # Synthesize baseline candidate row for any official roster player not yet observed in last_games
        missing_ids = set(active_ids) - set(candidates["PLAYER_ID"])
        if missing_ids and team_roster_df is not None and not last_games.empty:
            template_row = last_games.iloc[0].to_dict()
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
                    "POSITION_GROUP": "WING",
                    "PLAYER_POSITION_GROUP": "WING",
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


def _build_future_rosters(df, home_team: str, away_team: str, pred_dt, prediction_date: str):
    past_df = df[df["GAME_DATE"] < pred_dt]
    if len(past_df) == 0:
        past_df = df

    last_games = past_df.sort_values("GAME_DATE").groupby("PLAYER_ID").last().reset_index()
    season = date_to_season(pred_dt)

    home_active, home_roster_df = _active_roster_ids(home_team, season)
    away_active, away_roster_df = _active_roster_ids(away_team, season)

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

    home_X = _build_inference_df(home_roster, True, _defense_context(past_df, away_team))
    away_X = _build_inference_df(away_roster, False, _defense_context(past_df, home_team))

    is_playoff = is_playoff_date(pred_dt)
    home_X["IS_PLAYOFF"] = is_playoff
    away_X["IS_PLAYOFF"] = is_playoff

    return home_X, away_X


def _ridge_calibration_frame(full_X):
    X_ind = pd.DataFrame(index=full_X.index)
    X_ind["is_playoff"] = (full_X["IS_PLAYOFF"].fillna(0).astype(int) == 1).astype(float)
    X_ind["is_home"] = (full_X["IS_HOME"].fillna(0).astype(int) == 1).astype(float)

    pos_col = "PLAYER_POSITION_GROUP" if "PLAYER_POSITION_GROUP" in full_X.columns else "POSITION_GROUP"
    pos_vals = full_X[pos_col].fillna("WING") if pos_col in full_X.columns else pd.Series("WING", index=full_X.index)
    X_ind["pos_guard"] = (pos_vals == "GUARD").astype(float)
    X_ind["pos_wing"] = (pos_vals == "WING").astype(float)
    X_ind["pos_big"] = (pos_vals == "BIG").astype(float)

    usg_vals = full_X["USG_PCT_LAST_10"].fillna(18.0) if "USG_PCT_LAST_10" in full_X.columns else pd.Series(18.0, index=full_X.index)
    X_ind["high_usage"] = (usg_vals >= 25.0).astype(float)
    X_ind["low_usage"] = (usg_vals < 15.0).astype(float)

    min_vals = full_X["MIN_EMA_10"].fillna(20.0) if "MIN_EMA_10" in full_X.columns else pd.Series(20.0, index=full_X.index)
    X_ind["heavy_minutes"] = (min_vals >= 30.0).astype(float)
    X_ind["light_minutes"] = (min_vals < 15.0).astype(float)

    return X_ind


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
        else:
            pid = getattr(item, "player_id", None)
            pname = getattr(item, "player_name", None)
            status = str(getattr(item, "status", "ACTIVE")).upper()
            minute_limit = getattr(item, "minute_limit", None)
            factor = getattr(item, "status_factor", None)

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
        }
        if pid is not None:
            try:
                lookup[int(pid)] = entry
            except (ValueError, TypeError):
                pass
        if pname:
            lookup[str(pname).strip().lower()] = entry
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
    Generate player predictions for home and away teams using the V3/V4 Ridge models.
    Respects prediction_date to prevent future data leakage and use accurate historical rosters.
    Applies player injury/status overrides and redistributes scoring usage when players are out/restricted.
    """
    pred_dt = pd.to_datetime(prediction_date)
    season = date_to_season(pred_dt)
    if is_preseason is None:
        is_preseason = is_preseason_match(pred_dt, home_team, away_team, season)

    df = _load_player_dataset(season)
    
    historical_home = df[(df['TEAM_ABBREVIATION'] == home_team) & (df['GAME_DATE'] == pred_dt)].copy()
    historical_away = df[(df['TEAM_ABBREVIATION'] == away_team) & (df['GAME_DATE'] == pred_dt)].copy()
    
    if len(historical_home) > 0 and len(historical_away) > 0:
        home_X = historical_home
        away_X = historical_away
        home_X["IS_HOME"] = 1
        away_X["IS_HOME"] = 0
    else:
        home_X, away_X = _build_future_rosters(df, home_team, away_team, pred_dt, prediction_date)
    
    full_X = pd.concat([home_X, away_X], ignore_index=True)
    full_X["IS_PRESEASON"] = 1 if is_preseason else 0
    features = player_loader.feature_cols
    
    # Ensure all columns exist
    for f in features:
        if f not in full_X.columns:
            full_X[f] = 0
            
    X_matrix = full_X[features]
    
    # 4. Predict Raw Values
    raw_pts = player_loader.pts_model.predict(X_matrix)
    raw_reb = player_loader.reb_model.predict(X_matrix)
    raw_ast = player_loader.ast_model.predict(X_matrix)
    
    # Apply Ridge calibration if available
    if (getattr(player_loader, "ridge_pts_model", None) is not None and 
        getattr(player_loader, "ridge_reb_model", None) is not None and 
        getattr(player_loader, "ridge_ast_model", None) is not None):
        
        X_ind = _ridge_calibration_frame(full_X)
        
        res_pts = player_loader.ridge_pts_model.predict(X_ind)
        res_reb = player_loader.ridge_reb_model.predict(X_ind)
        res_ast = player_loader.ridge_ast_model.predict(X_ind)
        
        raw_pts = raw_pts - res_pts
        raw_reb = raw_reb - res_reb
        raw_ast = raw_ast - res_ast
        
    full_X["RAW_PROJ_PTS"] = np.maximum(0.0, raw_pts)
    full_X["RAW_PROJ_REB"] = np.maximum(0.0, raw_reb)
    full_X["RAW_PROJ_AST"] = np.maximum(0.0, raw_ast)
    
    # Process overrides and usage redistribution via dedicated engine
    from .services.usage_redistribution import redistribute_usage_and_minutes
    override_lookup = _parse_player_overrides(player_status_overrides)
    full_X = redistribute_usage_and_minutes(
        full_X,
        override_lookup,
        is_preseason=bool(is_preseason),
    )

    return full_X

