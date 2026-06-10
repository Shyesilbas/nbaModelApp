import pandas as pd
import numpy as np
from collections import defaultdict

K = 20
INITIAL_ELO = 1500
REGRESSION_FACTOR = 0.75

def _apply_regression(elo_dict):
    for team in list(elo_dict.keys()):
        elo_dict[team] = REGRESSION_FACTOR * elo_dict[team] + (1 - REGRESSION_FACTOR) * INITIAL_ELO

def compute_pre_game_elo(df: pd.DataFrame) -> pd.DataFrame:
    """Add PRE_GAME_ELO, OPP_PRE_GAME_ELO and ELO_DIFF columns.

    Assumes df contains at least the following columns:
        GAME_DATE, TEAM_ABBREVIATION, OPPONENT_ABBREVIATION,
        HOME_TEAM_ABBREVIATION, AWAY_TEAM_ABBREVIATION,
        HOME_PTS, AWAY_PTS
    The function processes rows chronologically and updates Elo after each game
    using the home‑team perspective.
    """
    df = df.copy()
    if 'GAME_DATE' not in df.columns:
        raise ValueError('GAME_DATE column required for Elo computation')
    df['GAME_DATE'] = pd.to_datetime(df['GAME_DATE'])
    df = df.sort_values('GAME_DATE').reset_index(drop=True)

    elo_state = defaultdict(lambda: INITIAL_ELO)
    regression_applied = False
    pre_vals = []
    opp_pre_vals = []
    diff_vals = []

    for idx, row in df.iterrows():
        # Detect season change to 2025‑26 (first game with year >= 2025)
        if not regression_applied and row['GAME_DATE'].year >= 2025:
            _apply_regression(elo_state)
            regression_applied = True

        team = row['TEAM_ABBREVIATION']
        opp = row['OPPONENT_ABBREVIATION']
        pre_vals.append(elo_state[team])
        opp_pre_vals.append(elo_state[opp])
        diff_vals.append(elo_state[team] - elo_state[opp])

        # Update Elo using home perspective if columns exist
        if {'HOME_TEAM_ABBREVIATION', 'AWAY_TEAM_ABBREVIATION', 'HOME_PTS', 'AWAY_PTS'}.issubset(df.columns):
            if row['TEAM_ABBREVIATION'] == row['HOME_TEAM_ABBREVIATION']:
                home = row['HOME_TEAM_ABBREVIATION']
                away = row['AWAY_TEAM_ABBREVIATION']
                home_pts = row['HOME_PTS']
                away_pts = row['AWAY_PTS']
                outcome = 1 if home_pts > away_pts else (0.5 if home_pts == away_pts else 0)
                exp_home = 1 / (1 + 10 ** ((elo_state[away] - elo_state[home]) / 400))
                exp_away = 1 - exp_home
                elo_state[home] = elo_state[home] + K * (outcome - exp_home)
                elo_state[away] = elo_state[away] + K * ((1 - outcome) - exp_away)
    df['PRE_GAME_ELO'] = pre_vals
    df['OPP_PRE_GAME_ELO'] = opp_pre_vals
    df['ELO_DIFF'] = diff_vals
    return df
