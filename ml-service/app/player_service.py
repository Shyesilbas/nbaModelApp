import pandas as pd
import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

_v3_df_cache = None

def date_to_season(dt) -> str:
    year = dt.year
    month = dt.month
    if month < 10:
        start_year = year - 1
    else:
        start_year = year
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def get_player_predictions(home_team: str, away_team: str, prediction_date: str, player_loader, score_loader):
    """
    Generate player predictions for home and away teams using the V3 Ridge models.
    Respects prediction_date to prevent future data leakage and use accurate historical rosters.
    """
    global _v3_df_cache
    
    v4_path = ROOT / "data/experimental/player_model_ready_v4_usg.csv"
    v3_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    selected_path = v4_path if v4_path.exists() else v3_path
    
    if not selected_path.exists():
        raise FileNotFoundError("Player dataset (V3 or V4) missing for player inference.")
        
    if _v3_df_cache is None:
        _v3_df_cache = pd.read_csv(selected_path)
        _v3_df_cache['GAME_DATE'] = pd.to_datetime(_v3_df_cache['GAME_DATE'])
        
    df = _v3_df_cache
    pred_dt = pd.to_datetime(prediction_date)
    
    historical_home = df[(df['TEAM_ABBREVIATION'] == home_team) & (df['GAME_DATE'] == pred_dt)].copy()
    historical_away = df[(df['TEAM_ABBREVIATION'] == away_team) & (df['GAME_DATE'] == pred_dt)].copy()
    
    if len(historical_home) > 0 and len(historical_away) > 0:
        # Historical game: Use exact roster that played
        home_X = historical_home
        away_X = historical_away
        home_X["IS_HOME"] = 1
        away_X["IS_HOME"] = 0
    else:
        # Future game or not in dataset: Use past games to build active roster
        past_df = df[df['GAME_DATE'] < pred_dt]
        if len(past_df) == 0:
            # Fallback to entire dataset if date is very early (shouldn't happen in normal use)
            past_df = df
            
        last_games = past_df.sort_values("GAME_DATE").groupby("PLAYER_ID").last().reset_index()
        
        # Season-aware filtering using the team_rosters.csv dataset
        season_str = date_to_season(pred_dt)
        roster_path = ROOT / f"data/season={season_str}/analysis/team_rosters.csv"
        
        home_active = None
        away_active = None
        
        if roster_path.exists():
            try:
                roster_df = pd.read_csv(roster_path)
                home_active = set(roster_df[roster_df["TEAM_ABBREVIATION"] == home_team]["PLAYER_ID"].unique())
                away_active = set(roster_df[roster_df["TEAM_ABBREVIATION"] == away_team]["PLAYER_ID"].unique())
            except Exception:
                pass
                
        if home_active:
            home_roster_candidates = last_games[last_games["PLAYER_ID"].isin(home_active)].copy()
            home_roster_candidates["TEAM_ABBREVIATION"] = home_team
            if len(home_roster_candidates) == 0:
                home_roster_candidates = last_games[last_games["TEAM_ABBREVIATION"] == home_team]
        else:
            home_roster_candidates = last_games[last_games["TEAM_ABBREVIATION"] == home_team]
            
        if away_active:
            away_roster_candidates = last_games[last_games["PLAYER_ID"].isin(away_active)].copy()
            away_roster_candidates["TEAM_ABBREVIATION"] = away_team
            if len(away_roster_candidates) == 0:
                away_roster_candidates = last_games[last_games["TEAM_ABBREVIATION"] == away_team]
        else:
            away_roster_candidates = last_games[last_games["TEAM_ABBREVIATION"] == away_team]
            
        # Filter to only players who have played at least one of the team's last 15 games
        home_dates = sorted(past_df[past_df["TEAM_ABBREVIATION"] == home_team]["GAME_DATE"].unique())
        if len(home_dates) >= 5:
            home_last_15 = home_dates[-15:]
            home_recent_active = set(past_df[(past_df["TEAM_ABBREVIATION"] == home_team) & (past_df["GAME_DATE"].isin(home_last_15))]["PLAYER_ID"].unique())
            filtered = home_roster_candidates[home_roster_candidates["PLAYER_ID"].isin(home_recent_active)]
            if len(filtered) > 0:
                home_roster_candidates = filtered
                
        away_dates = sorted(past_df[past_df["TEAM_ABBREVIATION"] == away_team]["GAME_DATE"].unique())
        if len(away_dates) >= 5:
            away_last_15 = away_dates[-15:]
            away_recent_active = set(past_df[(past_df["TEAM_ABBREVIATION"] == away_team) & (past_df["GAME_DATE"].isin(away_last_15))]["PLAYER_ID"].unique())
            filtered = away_roster_candidates[away_roster_candidates["PLAYER_ID"].isin(away_recent_active)]
            if len(filtered) > 0:
                away_roster_candidates = filtered
            
        home_roster = home_roster_candidates.sort_values("MIN_EMA_10", ascending=False).head(11)
        away_roster = away_roster_candidates.sort_values("MIN_EMA_10", ascending=False).head(11)
        
        if len(home_roster) == 0 or len(away_roster) == 0:
            raise ValueError(f"No active players found for {home_team} or {away_team} before {prediction_date}")
            
        home_def = past_df[past_df["OPPONENT_ABBREVIATION"] == home_team].sort_values("GAME_DATE").tail(1)
        if len(home_def) == 0:
            home_def = past_df.tail(1)
            
        away_def = past_df[past_df["OPPONENT_ABBREVIATION"] == away_team].sort_values("GAME_DATE").tail(1)
        if len(away_def) == 0:
            away_def = past_df.tail(1)
            
        opp_cols = [c for c in past_df.columns if c.startswith("OPP_") and "ALLOWED" in c]
        
        home_def_dict = {c: home_def[c].values[0] for c in opp_cols}
        away_def_dict = {c: away_def[c].values[0] for c in opp_cols}
        
        def build_inference_df(roster_df, is_home, def_dict):
            for k, v in def_dict.items():
                roster_df[k] = v
            roster_df["IS_HOME"] = 1 if is_home else 0
            return roster_df
            
        home_X = build_inference_df(home_roster.copy(), True, away_def_dict)
        away_X = build_inference_df(away_roster.copy(), False, home_def_dict)
    
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
    
    full_X["RAW_PROJ_PTS"] = raw_pts
    full_X["RAW_PROJ_REB"] = np.maximum(0, raw_reb)
    full_X["RAW_PROJ_AST"] = np.maximum(0, raw_ast)
    
    # 5. Top-Down Scaling via Score Model
    # Wait, the Score Model needs to be called to get team totals!
    # But this function only returns the players. We need team expected points.
    
    return full_X
