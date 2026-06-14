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


def _normalize_player_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    rename_map = {}
    if "Player_ID" in df.columns and "PLAYER_ID" not in df.columns:
        rename_map["Player_ID"] = "PLAYER_ID"
    if "Game_ID" in df.columns and "GAME_ID" not in df.columns:
        rename_map["Game_ID"] = "GAME_ID"
    if rename_map:
        df = df.rename(columns=rename_map)

    if "TEAM_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
        df["TEAM_ABBREVIATION"] = df["MATCHUP"].astype(str).str.split(" ").str[0]

    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"])
    return df


def _load_player_dataset(season: str = None):
    global _player_df_cache

    season_path = ROOT / f"data/season={season}/features/player_features.csv" if season else None
    v4_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    v3_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    selected_path = season_path if season_path and season_path.exists() else (v4_path if v4_path.exists() else v3_path)

    if not selected_path.exists():
        raise FileNotFoundError("Player dataset (V3 or V4) missing for player inference.")

    cache_key = str(selected_path)
    if cache_key not in _player_df_cache:
        _player_df_cache[cache_key] = _normalize_player_dataset(pd.read_csv(selected_path))

    return _player_df_cache[cache_key]


def _active_roster_ids(team: str, season: str):
    roster_path = ROOT / f"data/season={season}/analysis/team_rosters.csv"
    if not roster_path.exists():
        return None

    try:
        roster_df = pd.read_csv(roster_path)
        return set(roster_df[roster_df["TEAM_ABBREVIATION"] == team]["PLAYER_ID"].unique())
    except Exception:
        return None


def _roster_candidates(last_games, team: str, active_ids):
    if active_ids:
        candidates = last_games[last_games["PLAYER_ID"].isin(active_ids)].copy()
        candidates["TEAM_ABBREVIATION"] = team
        if len(candidates) > 0:
            return candidates

    return last_games[last_games["TEAM_ABBREVIATION"] == team]


def _filter_recent_active(candidates, past_df, team: str):
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

    home_candidates = _roster_candidates(last_games, home_team, _active_roster_ids(home_team, season))
    away_candidates = _roster_candidates(last_games, away_team, _active_roster_ids(away_team, season))

    home_candidates = _filter_recent_active(home_candidates, past_df, home_team)
    away_candidates = _filter_recent_active(away_candidates, past_df, away_team)

    minutes_col = "MIN_EMA_10" if "MIN_EMA_10" in df.columns else ("MIN_LAST_5" if "MIN_LAST_5" in df.columns else "MIN")
    home_roster = home_candidates.sort_values(minutes_col, ascending=False).head(11)
    away_roster = away_candidates.sort_values(minutes_col, ascending=False).head(11)

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


def get_player_predictions(home_team: str, away_team: str, prediction_date: str, player_loader, score_loader):
    """
    Generate player predictions for home and away teams using the V3 Ridge models.
    Respects prediction_date to prevent future data leakage and use accurate historical rosters.
    """
    pred_dt = pd.to_datetime(prediction_date)
    season = date_to_season(pred_dt)
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
        
    full_X["RAW_PROJ_PTS"] = np.maximum(0, raw_pts)
    full_X["RAW_PROJ_REB"] = np.maximum(0, raw_reb)
    full_X["RAW_PROJ_AST"] = np.maximum(0, raw_ast)
    
    # 5. Top-Down Scaling via Score Model
    # Wait, the Score Model needs to be called to get team totals!
    # But this function only returns the players. We need team expected points.
    
    return full_X
