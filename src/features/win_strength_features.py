from __future__ import annotations

from collections import defaultdict
from typing import Mapping

import numpy as np
import pandas as pd


from src.features.continuous_elo import ContinuousEloEngine, INITIAL_ELO, BASE_K_FACTOR, SEASON_REGRESSION, HOME_COURT_ADVANTAGE

K_FACTOR = BASE_K_FACTOR


def add_pre_game_elo(df: pd.DataFrame) -> pd.DataFrame:
    """Compute leakage-safe pre-game Elo from chronological completed games using ContinuousEloEngine."""
    engine = ContinuousEloEngine()
    return engine.transform_games(df)


def add_win_strength_features(df: pd.DataFrame) -> pd.DataFrame:
    df = add_pre_game_elo(df)
    
    winrate = df.get("WINRATE_LAST_10", 0.5)
    opp_winrate = df.get("OPP_WINRATE_LAST_10", 0.5)
    df["WINRATE_DIFF_LAST_10"] = winrate - opp_winrate
    df["ABS_WINRATE_DIFF_LAST_10"] = df["WINRATE_DIFF_LAST_10"].abs()
    
    days_rest = df.get("DAYS_REST", 2.0)
    opp_days_rest = df.get("OPP_DAYS_REST", 2.0)
    df["REST_DIFF"] = days_rest - opp_days_rest
    
    df["IS_CLOSE_STRENGTH"] = ((df["ABS_ELO_DIFF"] < 60) & (df["ABS_WINRATE_DIFF_LAST_10"] < 0.15)).astype(int)
    
    is_playoff = df.get("IS_PLAYOFF", 0).astype(int)
    df["PLAYOFF_ELO_DIFF"] = is_playoff * df["ELO_DIFF"]
    df["PLAYOFF_ABS_ELO_DIFF"] = is_playoff * df["ABS_ELO_DIFF"]
    df["PLAYOFF_REST_DIFF"] = is_playoff * df["REST_DIFF"]
    df["CLOSE_STRENGTH_REST_DIFF"] = df["IS_CLOSE_STRENGTH"] * df["REST_DIFF"]
    
    net_rtg = df.get("NET_RTG_LAST_10", 0.0)
    opp_net_rtg = df.get("OPP_NET_RTG_LAST_10", 0.0)
    df["NET_RTG_DIFF_LAST_10"] = net_rtg - opp_net_rtg

    efg = df.get("EFG_PCT_LAST_10", 0.53)
    def_efg = df.get("DEF_EFG_PCT_LAST_10", 0.53)
    df["EFG_DIFF_LAST_10"] = efg - def_efg

    fg3a_rate = df.get("FG3A_RATE_LAST_10", 0.38)
    def_fg3a_rate = df.get("DEF_FG3A_RATE_LAST_10", 0.38)
    df["THREE_POINT_RATE_DIFF"] = fg3a_rate - def_fg3a_rate

    tov_pct = df.get("TOV_PCT_LAST_10", 0.13)
    def_tov_pct = df.get("DEF_TOV_PCT_LAST_10", 0.13)
    df["TOV_FORCED_DIFF"] = def_tov_pct - tov_pct

    orb_pct = df.get("ORB_PCT_LAST_10", 0.25)
    def_orb_pct = df.get("DEF_ORB_PCT_LAST_10", 0.25)
    df["REBOUND_CONTROL_DIFF"] = orb_pct - def_orb_pct

    pace = df.get("PACE_LAST_5", 100.0)
    opp_pace = df.get("OPP_PACE_LAST_5", 100.0)
    df["PACE_COLLISION"] = (pace * opp_pace) / 100.0

    ast_to_tov = df.get("AST_TO_TOV_LAST_5", 1.8)
    opp_ast_to_tov = df.get("OPP_AST_TO_TOV_LAST_5", 1.8)
    df["AST_TO_TOV_DIFF_LAST_5"] = ast_to_tov - opp_ast_to_tov

    havoc = df.get("HAVOC_RATE_LAST_5", 0.12)
    opp_havoc = df.get("OPP_HAVOC_RATE_LAST_5", 0.12)
    df["HAVOC_RATE_DIFF_LAST_5"] = havoc - opp_havoc

    ft_margin = df.get("FT_MARGIN_LAST_5", 0.0)
    opp_ft_margin = df.get("OPP_FT_MARGIN_LAST_5", 0.0)
    df["FT_MARGIN_DIFF_LAST_5"] = ft_margin - opp_ft_margin

    fg3_reg = df.get("FG3_REGRESSION_DELTA", 0.0)
    opp_fg3_reg = df.get("OPP_FG3_REGRESSION_DELTA", 0.0)
    df["FG3_REGRESSION_DIFF"] = fg3_reg - opp_fg3_reg
    return df


def compute_current_elo_state(team_games: pd.DataFrame) -> dict[str, float]:
    if team_games.empty:
        return {}
    engine = ContinuousEloEngine()
    engine.transform_games(team_games)
    return dict(engine.ratings)


def build_matchup_strength_features(
    *,
    home_team: str,
    away_team: str,
    home_row: Mapping[str, object],
    away_row: Mapping[str, object],
    is_playoff: int,
    days_rest_home: float,
    days_rest_away: float,
    elo_state: Mapping[str, float],
) -> dict[str, float]:
    home_elo = float(elo_state.get(home_team, INITIAL_ELO))
    away_elo = float(elo_state.get(away_team, INITIAL_ELO))
    elo_diff = home_elo - away_elo
    winrate_diff = float(home_row.get("WINRATE_LAST_10", np.nan)) - float(away_row.get("WINRATE_LAST_10", np.nan))
    rest_diff = float(days_rest_home) - float(days_rest_away)
    abs_elo_diff = abs(elo_diff)
    abs_winrate_diff = abs(winrate_diff)
    is_close = int(abs_elo_diff < 60 and abs_winrate_diff < 0.15)
    playoff = int(is_playoff)
    
    net_rtg_diff = float(home_row.get("NET_RTG_LAST_10", 0.0)) - float(away_row.get("NET_RTG_LAST_10", 0.0))
    efg_diff = float(home_row.get("EFG_PCT_LAST_10", 0.53)) - float(away_row.get("DEF_EFG_PCT_LAST_10", 0.53))
    three_point_diff = float(home_row.get("FG3A_RATE_LAST_10", 0.38)) - float(away_row.get("DEF_FG3A_RATE_LAST_10", 0.38))
    tov_forced_diff = float(home_row.get("DEF_TOV_PCT_LAST_10", 0.13)) - float(away_row.get("TOV_PCT_LAST_10", 0.13))
    reb_control_diff = float(home_row.get("ORB_PCT_LAST_10", 0.25)) - float(away_row.get("DEF_ORB_PCT_LAST_10", 0.25))
    pace_collision = (float(home_row.get("PACE_LAST_5", 100.0)) * float(away_row.get("PACE_LAST_5", 100.0))) / 100.0
    ast_to_tov_diff = float(home_row.get("AST_TO_TOV_LAST_5", 1.8)) - float(away_row.get("AST_TO_TOV_LAST_5", 1.8))
    havoc_diff = float(home_row.get("HAVOC_RATE_LAST_5", 0.12)) - float(away_row.get("HAVOC_RATE_LAST_5", 0.12))
    ft_margin_diff = float(home_row.get("FT_MARGIN_LAST_5", 0.0)) - float(away_row.get("FT_MARGIN_LAST_5", 0.0))
    fg3_reg_diff = float(home_row.get("FG3_REGRESSION_DELTA", 0.0)) - float(away_row.get("FG3_REGRESSION_DELTA", 0.0))

    return {
        "PRE_GAME_ELO": home_elo,
        "OPP_PRE_GAME_ELO": away_elo,
        "ELO_DIFF": elo_diff,
        "ABS_ELO_DIFF": abs_elo_diff,
        "WINRATE_DIFF_LAST_10": winrate_diff,
        "ABS_WINRATE_DIFF_LAST_10": abs_winrate_diff,
        "REST_DIFF": rest_diff,
        "IS_CLOSE_STRENGTH": float(is_close),
        "PLAYOFF_ELO_DIFF": playoff * elo_diff,
        "PLAYOFF_ABS_ELO_DIFF": playoff * abs_elo_diff,
        "PLAYOFF_REST_DIFF": playoff * rest_diff,
        "CLOSE_STRENGTH_REST_DIFF": is_close * rest_diff,
        "NET_RTG_DIFF_LAST_10": net_rtg_diff,
        "EFG_DIFF_LAST_10": efg_diff,
        "THREE_POINT_RATE_DIFF": three_point_diff,
        "TOV_FORCED_DIFF": tov_forced_diff,
        "REBOUND_CONTROL_DIFF": reb_control_diff,
        "PACE_COLLISION": pace_collision,
        "AST_TO_TOV_DIFF_LAST_5": ast_to_tov_diff,
        "HAVOC_RATE_DIFF_LAST_5": havoc_diff,
        "FT_MARGIN_DIFF_LAST_5": ft_margin_diff,
        "FG3_REGRESSION_DIFF": fg3_reg_diff,
    }
