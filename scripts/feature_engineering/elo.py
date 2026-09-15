import pandas as pd
import numpy as np
from collections import defaultdict

K = 20
INITIAL_ELO = 1500
REGRESSION_FACTOR = 0.75

def _apply_regression(elo_dict):
    for team in list(elo_dict.keys()):
        elo_dict[team] = REGRESSION_FACTOR * elo_dict[team] + (1 - REGRESSION_FACTOR) * INITIAL_ELO

from src.features.continuous_elo import ContinuousEloEngine

def compute_pre_game_elo(df: pd.DataFrame) -> pd.DataFrame:
    """Add PRE_GAME_ELO, OPP_PRE_GAME_ELO and ELO_DIFF columns using ContinuousEloEngine."""
    engine = ContinuousEloEngine()
    return engine.transform_games(df)
