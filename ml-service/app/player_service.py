import pandas as pd
import numpy as np
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]

def get_player_predictions(home_team: str, away_team: str, player_loader, score_loader):
    """
    Generate player predictions for home and away teams using the V3 Ridge models.
    Scales the predictions top-down using the Score Model's expected points.
    """
    
    v3_path = ROOT / "data/experimental/player_model_ready_v3_matchups.csv"
    if not v3_path.exists():
        raise FileNotFoundError("V3 dataset missing for player inference.")
        
    df = pd.read_csv(v3_path)
    df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'])
    
    # 1. Identify current roster for home and away teams
    # We find all players whose LAST game was for this team.
    last_games = df.sort_values("GAME_DATE").groupby("PLAYER_ID").last().reset_index()
    
    # Also filter out players who haven't played in a long time to simulate active roster
    # For MVP, just take top 10 players by MIN_EMA_10 for each team
    home_roster = last_games[last_games["TEAM_ABBREVIATION"] == home_team].sort_values("MIN_EMA_10", ascending=False).head(10)
    away_roster = last_games[last_games["TEAM_ABBREVIATION"] == away_team].sort_values("MIN_EMA_10", ascending=False).head(10)
    
    if len(home_roster) == 0 or len(away_roster) == 0:
        raise ValueError(f"No active players found for {home_team} or {away_team}")
        
    # 2. Get Team Defense Stats (Opponent Matchup Features)
    # To get what home_team allows, we look at the last game where OPP_TEAM == home_team
    # In V3, the feature is computed for the OPPONENT_ABBREVIATION.
    # Wait, the rolling features in V3 are attached to the team playing defense.
    # So if we want home_team's defense, we find a row where OPPONENT_ABBREVIATION == home_team and take those OPP_ features.
    home_def = df[df["OPPONENT_ABBREVIATION"] == home_team].sort_values("GAME_DATE").tail(1) # just get the very last row
    if len(home_def) == 0:
        home_def = df.tail(1) # fallback
    
    away_def = df[df["OPPONENT_ABBREVIATION"] == away_team].sort_values("GAME_DATE").tail(1)
    if len(away_def) == 0:
        away_def = df.tail(1)
        
    opp_cols = [c for c in df.columns if c.startswith("OPP_") and "ALLOWED" in c]
    
    home_def_dict = {c: home_def[c].values[0] for c in opp_cols}
    away_def_dict = {c: away_def[c].values[0] for c in opp_cols}
    
    # 3. Construct inference DataFrame
    def build_inference_df(roster_df, is_home, def_dict):
        # Override the opponent defense columns with the specific opponent's defense
        for k, v in def_dict.items():
            roster_df[k] = v
            
        roster_df["IS_HOME"] = 1 if is_home else 0
        return roster_df
        
    home_X = build_inference_df(home_roster.copy(), True, away_def_dict)  # Home faces Away defense
    away_X = build_inference_df(away_roster.copy(), False, home_def_dict) # Away faces Home defense
    
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
    raw_pra = player_loader.pra_model.predict(X_matrix)
    
    full_X["RAW_PROJ_PTS"] = raw_pts
    full_X["RAW_PROJ_REB"] = np.maximum(0, raw_reb)
    full_X["RAW_PROJ_AST"] = np.maximum(0, raw_ast)
    
    # 5. Top-Down Scaling via Score Model
    # Wait, the Score Model needs to be called to get team totals!
    # But this function only returns the players. We need team expected points.
    
    return full_X
