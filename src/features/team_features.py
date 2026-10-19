import pandas as pd
import numpy as np
from src.processing.pbp_integration import integrate_pbp_features
from src.processing.season_type_normalizer import drop_preseason
from src.processing.cleaning import regulation_team_minutes

def build_team_features(df: pd.DataFrame, season_dir: str = None) -> pd.DataFrame:
    """
    Engineers features for NBA team games.
    
    Expected input columns:
        SEASON_TYPE, MATCHUP, WL, GAME_DATE, TEAM_ID (or TEAM_ABBREVIATION), PTS
        
    Engineered features:
        - IS_HOME: true if "vs." in MATCHUP, false if "@"
        - OPPONENT_ABBREVIATION: opponent team code from MATCHUP
        - IS_PLAYOFF: true if SEASON_TYPE is 'Playoffs'
        - WIN: 1 if WL == 'W', else 0
        - DAYS_REST: days since previous game for the same team
        - IS_B2B: true if DAYS_REST == 1
        - PTS_LAST_5: 5-game rolling average of points (shifted by 1)
        - PTS_LAST_10: 10-game rolling average of points (shifted by 1)
        - WINRATE_LAST_5: 5-game rolling win rate (shifted by 1)
        - WINRATE_LAST_10: 10-game rolling win rate (shifted by 1)
        
    Args:
        df (pd.DataFrame): Sorted team game logs.
        
    Returns:
        pd.DataFrame: DataFrame with engineered features.
    """
    df = drop_preseason(df)
    
    # 1. Sort to ensure chronological order for time-based features
    team_col = "TEAM_ID" if "TEAM_ID" in df.columns else "TEAM_ABBREVIATION"
    if team_col in df.columns and "GAME_DATE" in df.columns:
        df = df.sort_values(by=[team_col, "GAME_DATE"]).reset_index(drop=True)
    
    # Ensure date is parsed
    if "GAME_DATE" in df.columns and not pd.api.types.is_datetime64_any_dtype(df["GAME_DATE"]):
        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        
    # Ensure PTS is float
    if "PTS" in df.columns:
        df["PTS"] = pd.to_numeric(df["PTS"], errors="coerce")
        
    # 2. IS_HOME: true if "vs.", false if "@"
    if "MATCHUP" in df.columns:
        df["IS_HOME"] = df["MATCHUP"].str.contains("vs.", case=False, na=False)
        # 3. OPPONENT_ABBREVIATION
        # MATCHUP typically formatted as "TEAM vs. OPP" or "TEAM @ OPP"
        # Opponent is always the last token
        df["OPPONENT_ABBREVIATION"] = df["MATCHUP"].str.split().str[-1]
    else:
        df["IS_HOME"] = np.nan
        df["OPPONENT_ABBREVIATION"] = np.nan

    # 4. Standardize season metadata and playoff indicators deterministically
    from src.processing.season_type_normalizer import normalize_season_metadata_columns
    df = normalize_season_metadata_columns(df)

    # 5. WIN: 1 if WL == "W", else 0
    if "WL" in df.columns:
        df["WIN"] = (df["WL"] == "W").astype(int)
    else:
        df["WIN"] = 0

    # 6. DAYS_REST and Schedule Fatigue
    if team_col in df.columns and "GAME_DATE" in df.columns:
        df["DAYS_REST"] = df.groupby(team_col)["GAME_DATE"].diff().dt.days
        df["IS_B2B"] = df["DAYS_REST"] == 1
        
        # 3 games in 4 days and 4 games in 5 days
        diff_2 = df.groupby(team_col)["GAME_DATE"].diff(2).dt.days
        diff_3 = df.groupby(team_col)["GAME_DATE"].diff(3).dt.days
        df["IS_3_IN_4"] = (diff_2 <= 3).astype(int)
        df["IS_4_IN_5"] = (diff_3 <= 4).astype(int)

        from src.features.schedule_density import compute_schedule_density_features
        df = compute_schedule_density_features(df, team_col=team_col)
    else:
        df["DAYS_REST"] = np.nan
        df["IS_B2B"] = False
        df["IS_3_IN_4"] = 0
        df["IS_4_IN_5"] = 0
        df["GAMES_LAST_7D"] = 0
        df["GAMES_LAST_14D"] = 0
        df["TRAVEL_KM_LAST_7D"] = 0.0
        df["CUMULATIVE_FATIGUE_INDEX"] = 0.0

    # 8. PTS_LAST_5 & PTS_LAST_10 (shifted by 1 to prevent data leakage)
    if team_col in df.columns and "PTS" in df.columns:
        df["PTS_LAST_5"] = df.groupby(team_col)["PTS"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["PTS_LAST_10"] = df.groupby(team_col)["PTS"].transform(
            lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
        )
    else:
        df["PTS_LAST_5"] = np.nan
        df["PTS_LAST_10"] = np.nan

    # 9. WINRATE_LAST_5 & WINRATE_LAST_10 (shifted by 1 to prevent data leakage)
    if team_col in df.columns and "WIN" in df.columns:
        df["WINRATE_LAST_5"] = df.groupby(team_col)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["WINRATE_LAST_10"] = df.groupby(team_col)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
        )
    else:
        df["WINRATE_LAST_5"] = np.nan
        df["WINRATE_LAST_10"] = np.nan

    # 9b. Base Advanced Metrics (PACE, OFF_RTG) and Four Factors
    # POSS = FGA + 0.44 * FTA - OREB + TOV
    # PACE = 48.0 * (POSS / (MIN / 5))
    needed_box_cols = ["FGA", "FTA", "OREB", "TOV", "MIN", "FGM", "FG3M", "FG3A", "DREB"]
    if all(col in df.columns for col in needed_box_cols):
        for col in needed_box_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df["MIN"] = regulation_team_minutes(df["MIN"])
        df["POSS"] = df["FGA"] + 0.44 * df["FTA"] - df["OREB"] + df["TOV"]
        df["PACE"] = 48.0 * (df["POSS"] / (df["MIN"].replace(0, np.nan) / 5))
        df["OFF_RTG"] = 100.0 * (df["PTS"] / df["POSS"].replace(0, np.nan))

        # Dean Oliver Four Factors (Offense)
        fga_safe = df["FGA"].replace(0, np.nan)
        poss_safe = df["POSS"].replace(0, np.nan)
        df["EFG_PCT"] = (df["FGM"] + 0.5 * df["FG3M"]) / fga_safe
        df["TOV_PCT"] = df["TOV"] / poss_safe
        df["FT_RATE"] = df["FTA"] / fga_safe
        df["FG3A_RATE"] = df["FG3A"] / fga_safe
    else:
        df["POSS"] = np.nan
        df["PACE"] = np.nan
        df["OFF_RTG"] = np.nan
        df["EFG_PCT"] = np.nan
        df["TOV_PCT"] = np.nan
        df["FT_RATE"] = np.nan
        df["FG3A_RATE"] = np.nan

    # 10. Opponent box stats mapping for defensive ratings and defensive four factors
    if "GAME_ID" in df.columns and "PTS" in df.columns:
        opp_cols_to_map = ["PTS", "OFF_RTG", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "TOV", "POSS"]
        available_opp_cols = [c for c in opp_cols_to_map if c in df.columns]
        
        pts_map = df[["GAME_ID", "TEAM_ABBREVIATION"] + available_opp_cols].copy()
        rename_dict = {c: f"OPP_{c}_TEMP" for c in available_opp_cols}
        pts_map = pts_map.rename(columns=rename_dict)
            
        df = df.merge(
            pts_map,
            left_on=["GAME_ID", "OPPONENT_ABBREVIATION"],
            right_on=["GAME_ID", "TEAM_ABBREVIATION"],
            how="left",
            suffixes=("", "_temp_drop")
        )
        if "TEAM_ABBREVIATION_temp_drop" in df.columns:
            df = df.drop(columns=["TEAM_ABBREVIATION_temp_drop"])
            
        df["PTS_ALLOWED"] = df.get("OPP_PTS_TEMP", np.nan)
        df["DEF_RTG"] = df.get("OPP_OFF_RTG_TEMP", np.nan)

        # Calculate ORB_PCT and Defensive Four Factors
        if "OREB" in df.columns and "OPP_DREB_TEMP" in df.columns:
            tot_orb = df["OREB"] + df["OPP_DREB_TEMP"]
            df["ORB_PCT"] = df["OREB"] / tot_orb.replace(0, np.nan)
        else:
            df["ORB_PCT"] = np.nan

        if "OPP_FGM_TEMP" in df.columns and "OPP_FGA_TEMP" in df.columns:
            opp_fga_safe = df["OPP_FGA_TEMP"].replace(0, np.nan)
            opp_poss_safe = df["OPP_POSS_TEMP"].replace(0, np.nan)
            df["DEF_EFG_PCT"] = (df["OPP_FGM_TEMP"] + 0.5 * df["OPP_FG3M_TEMP"]) / opp_fga_safe
            df["DEF_TOV_PCT"] = df["OPP_TOV_TEMP"] / opp_poss_safe
            df["DEF_FT_RATE"] = df["OPP_FTA_TEMP"] / opp_fga_safe
            df["DEF_FG3A_RATE"] = df["OPP_FG3A_TEMP"] / opp_fga_safe
            
            if "DREB" in df.columns and "OPP_OREB_TEMP" in df.columns:
                tot_def_reb = df["DREB"] + df["OPP_OREB_TEMP"]
                df["DEF_ORB_PCT"] = df["OPP_OREB_TEMP"] / tot_def_reb.replace(0, np.nan)
            else:
                df["DEF_ORB_PCT"] = np.nan
        else:
            df["DEF_EFG_PCT"] = np.nan
            df["DEF_TOV_PCT"] = np.nan
            df["DEF_FT_RATE"] = np.nan
            df["DEF_FG3A_RATE"] = np.nan
            df["DEF_ORB_PCT"] = np.nan

        # Clean temp columns
        drop_temps = [c for c in df.columns if c.endswith("_TEMP")]
        df = df.drop(columns=drop_temps)
    else:
        df["PTS_ALLOWED"] = np.nan
        df["DEF_RTG"] = np.nan
        df["ORB_PCT"] = np.nan
        df["DEF_EFG_PCT"] = np.nan
        df["DEF_TOV_PCT"] = np.nan
        df["DEF_FT_RATE"] = np.nan
        df["DEF_FG3A_RATE"] = np.nan
        df["DEF_ORB_PCT"] = np.nan

    # Fallback to PTS - PLUS_MINUS if PTS_ALLOWED is missing
    if "PTS_ALLOWED" in df.columns and df["PTS_ALLOWED"].isna().any() and "PTS" in df.columns and "PLUS_MINUS" in df.columns:
        df["PTS_ALLOWED"] = df["PTS_ALLOWED"].fillna(df["PTS"] - df["PLUS_MINUS"])

    # 11. Rolling Averages for Four Factors (Shifted by 1 to prevent look-ahead leakage)
    four_factor_cols = [
        "PTS_ALLOWED", "EFG_PCT", "TOV_PCT", "ORB_PCT", "FT_RATE", "FG3A_RATE",
        "DEF_EFG_PCT", "DEF_TOV_PCT", "DEF_ORB_PCT", "DEF_FT_RATE", "DEF_FG3A_RATE"
    ]
    if team_col in df.columns:
        for fcol in four_factor_cols:
            if fcol in df.columns:
                df[f"{fcol}_LAST_5"] = df.groupby(team_col)[fcol].transform(
                    lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
                )
                df[f"{fcol}_LAST_10"] = df.groupby(team_col)[fcol].transform(
                    lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
                )

    # 12. Home/Away split form (rolling 5, shifted by 1, forward filled per team)
    home_mask = df["IS_HOME"] == True
    df.loc[home_mask, "HOME_WINRATE_LAST_5"] = df[home_mask].groupby(team_col)["WIN"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    df.loc[home_mask, "HOME_PTS_LAST_5"] = df[home_mask].groupby(team_col)["PTS"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    df.loc[home_mask, "HOME_PTS_ALLOWED_LAST_5"] = df[home_mask].groupby(team_col)["PTS_ALLOWED"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    
    away_mask = df["IS_HOME"] == False
    df.loc[away_mask, "AWAY_WINRATE_LAST_5"] = df[away_mask].groupby(team_col)["WIN"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    df.loc[away_mask, "AWAY_PTS_LAST_5"] = df[away_mask].groupby(team_col)["PTS"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    df.loc[away_mask, "AWAY_PTS_ALLOWED_LAST_5"] = df[away_mask].groupby(team_col)["PTS_ALLOWED"].transform(
        lambda x: x.shift(1).rolling(5, min_periods=1).mean()
    )
    
    # Forward fill chronological split form per team
    cols_to_ffill = [
        "HOME_WINRATE_LAST_5", "HOME_PTS_LAST_5", "HOME_PTS_ALLOWED_LAST_5",
        "AWAY_WINRATE_LAST_5", "AWAY_PTS_LAST_5", "AWAY_PTS_ALLOWED_LAST_5"
    ]
    df[cols_to_ffill] = df.groupby(team_col)[cols_to_ffill].ffill()

    # 12b. Venue-aware aliases used by training and inference.
    # These resolve to the split that is actually relevant for the row's venue.
    if "IS_HOME" in df.columns:
        df["CURRENT_VENUE_WINRATE_LAST_5"] = np.where(
            df["IS_HOME"] == True, df["HOME_WINRATE_LAST_5"], df["AWAY_WINRATE_LAST_5"]
        )
        df["CURRENT_VENUE_PTS_LAST_5"] = np.where(
            df["IS_HOME"] == True, df["HOME_PTS_LAST_5"], df["AWAY_PTS_LAST_5"]
        )
        df["CURRENT_VENUE_PTS_ALLOWED_LAST_5"] = np.where(
            df["IS_HOME"] == True, df["HOME_PTS_ALLOWED_LAST_5"], df["AWAY_PTS_ALLOWED_LAST_5"]
        )
    else:
        df["CURRENT_VENUE_WINRATE_LAST_5"] = np.nan
        df["CURRENT_VENUE_PTS_LAST_5"] = np.nan
        df["CURRENT_VENUE_PTS_ALLOWED_LAST_5"] = np.nan

    # 13. Head-to-Head (H2H) history features (rolling 5, shifted by 1)
    if "TEAM_ABBREVIATION" in df.columns and "OPPONENT_ABBREVIATION" in df.columns:
        h2h_groupby = ["TEAM_ABBREVIATION", "OPPONENT_ABBREVIATION"]
        df["H2H_GAMES_LAST_5"] = df.groupby(h2h_groupby)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).count()
        ).fillna(0).astype(int)
        df["H2H_WINRATE_LAST_5"] = df.groupby(h2h_groupby)["WIN"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["H2H_PTS_LAST_5"] = df.groupby(h2h_groupby)["PTS"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
        df["H2H_PTS_ALLOWED_LAST_5"] = df.groupby(h2h_groupby)["PTS_ALLOWED"].transform(
            lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
        )
    else:
        df["H2H_GAMES_LAST_5"] = 0
        df["H2H_WINRATE_LAST_5"] = np.nan
        df["H2H_PTS_LAST_5"] = np.nan
        df["H2H_PTS_ALLOWED_LAST_5"] = np.nan

    # 14. Rolling Averages for Advanced Metrics
    if "OFF_RTG" in df.columns and "DEF_RTG" in df.columns:
        df["NET_RTG"] = df["OFF_RTG"] - df["DEF_RTG"]
    else:
        df["NET_RTG"] = np.nan

    # Calculate rolling averages for Advanced Metrics (shifted by 1)
    if team_col in df.columns:
        for metric in ["PACE", "OFF_RTG", "DEF_RTG", "NET_RTG"]:
            if metric in df.columns:
                df[f"{metric}_LAST_5"] = df.groupby(team_col)[metric].transform(
                    lambda x: x.shift(1).rolling(window=5, min_periods=1).mean()
                )
                df[f"{metric}_LAST_10"] = df.groupby(team_col)[metric].transform(
                    lambda x: x.shift(1).rolling(window=10, min_periods=1).mean()
                )

    # Map playoff urgency features
    playoff_map = load_playoff_context_map()
    df["IS_ELIMINATION_GAME"] = df["GAME_ID"].map(lambda x: playoff_map.get(str(x).split(".")[0].zfill(10), {}).get("IS_ELIMINATION_GAME", 0)).fillna(0).astype(int)
    df["CAN_CLINCH_SERIES"] = df["GAME_ID"].map(lambda x: playoff_map.get(str(x).split(".")[0].zfill(10), {}).get("CAN_CLINCH_SERIES", 0)).fillna(0).astype(int)

    df = integrate_pbp_features(df, season_dir)

    return df


def load_playoff_context_map():
    import glob
    import pandas as pd
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    
    mapping = {}
    files = sorted(glob.glob(str(root / "data/season=*/processed/game_results.csv")))
    
    for f in files:
        try:
            df = pd.read_csv(f, dtype={"GAME_ID": str})
            playoffs = df[df["IS_PLAYOFF"] == True].copy()
            if playoffs.empty:
                continue
                
            playoffs["GAME_DATE"] = pd.to_datetime(playoffs["GAME_DATE"])
            playoffs = playoffs.sort_values("GAME_DATE")
            
            series_wins = {}
            for _, row in playoffs.iterrows():
                home = row["HOME_TEAM_ABBREVIATION"]
                away = row["AWAY_TEAM_ABBREVIATION"]
                gid = row["GAME_ID"]
                stype = row["SEASON_TYPE"]
                
                skey = frozenset([home, away])
                if skey not in series_wins:
                    series_wins[skey] = {home: 0, away: 0}
                    
                wins = series_wins[skey]
                is_elim = 0
                can_clinch = 0
                
                if stype != "PlayIn":
                    if wins[home] == 3 or wins[away] == 3:
                        is_elim = 1
                        can_clinch = 1
                        
                gid_str = str(gid).split(".")[0].zfill(10)
                mapping[gid_str] = {
                    "IS_ELIMINATION_GAME": is_elim,
                    "CAN_CLINCH_SERIES": can_clinch
                }
                
                home_score = row["HOME_SCORE"]
                away_score = row["AWAY_SCORE"]
                if home_score > away_score:
                    wins[home] += 1
                else:
                    wins[away] += 1
        except Exception:
            pass
    return mapping
