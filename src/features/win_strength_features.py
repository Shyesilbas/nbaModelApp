from __future__ import annotations

from collections import defaultdict
from typing import Mapping

import numpy as np
import pandas as pd


INITIAL_ELO = 1500.0
K_FACTOR = 20.0
SEASON_REGRESSION = 0.75


def _season_key(date_value: pd.Timestamp) -> int:
    return int(date_value.year if date_value.month >= 10 else date_value.year - 1)


def add_pre_game_elo(df: pd.DataFrame) -> pd.DataFrame:
    """Compute leakage-safe pre-game Elo from chronological completed games."""
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
    df = df.sort_values(["GAME_DATE", "GAME_ID", "IS_HOME"], ascending=[True, True, False]).reset_index(drop=True)

    elo_state: defaultdict[str, float] = defaultdict(lambda: INITIAL_ELO)
    current_season = None
    rows: list[tuple[int, float, float, float]] = []

    for _, game in df.groupby("GAME_ID", sort=False):
        game = game.sort_values("IS_HOME", ascending=False)
        game_date = pd.to_datetime(game["GAME_DATE"].iloc[0])
        season = _season_key(game_date)
        if current_season is None:
            current_season = season
        elif season != current_season:
            for team in list(elo_state.keys()):
                elo_state[team] = SEASON_REGRESSION * elo_state[team] + (1 - SEASON_REGRESSION) * INITIAL_ELO
            current_season = season

        if len(game) != 2:
            for idx, row in game.iterrows():
                team_elo = elo_state[row["TEAM_ABBREVIATION"]]
                opp_elo = elo_state[row["OPPONENT_ABBREVIATION"]]
                rows.append((idx, team_elo, opp_elo, team_elo - opp_elo))
            continue

        home = game[game["IS_HOME"].astype(bool)]
        away = game[~game["IS_HOME"].astype(bool)]
        if home.empty or away.empty:
            continue

        home_row = home.iloc[0]
        away_row = away.iloc[0]
        home_team = home_row["TEAM_ABBREVIATION"]
        away_team = away_row["TEAM_ABBREVIATION"]
        home_elo = elo_state[home_team]
        away_elo = elo_state[away_team]

        rows.append((int(home_row.name), home_elo, away_elo, home_elo - away_elo))
        rows.append((int(away_row.name), away_elo, home_elo, away_elo - home_elo))

        home_win = int(home_row["WIN"])
        expected_home = 1.0 / (1.0 + 10.0 ** ((away_elo - home_elo) / 400.0))
        expected_away = 1.0 - expected_home
        elo_state[home_team] = home_elo + K_FACTOR * (home_win - expected_home)
        elo_state[away_team] = away_elo + K_FACTOR * ((1 - home_win) - expected_away)

    elo_df = pd.DataFrame(rows, columns=["_idx", "PRE_GAME_ELO", "OPP_PRE_GAME_ELO", "ELO_DIFF"]).set_index("_idx")
    df = df.join(elo_df, how="left")
    df["ABS_ELO_DIFF"] = df["ELO_DIFF"].abs()
    return df


def add_win_strength_features(df: pd.DataFrame) -> pd.DataFrame:
    df = add_pre_game_elo(df)
    df["WINRATE_DIFF_LAST_10"] = df["WINRATE_LAST_10"] - df["OPP_WINRATE_LAST_10"]
    df["ABS_WINRATE_DIFF_LAST_10"] = df["WINRATE_DIFF_LAST_10"].abs()
    df["REST_DIFF"] = df["DAYS_REST"] - df["OPP_DAYS_REST"]
    df["IS_CLOSE_STRENGTH"] = ((df["ABS_ELO_DIFF"] < 60) & (df["ABS_WINRATE_DIFF_LAST_10"] < 0.15)).astype(int)
    df["PLAYOFF_ELO_DIFF"] = df["IS_PLAYOFF"].astype(int) * df["ELO_DIFF"]
    df["PLAYOFF_ABS_ELO_DIFF"] = df["IS_PLAYOFF"].astype(int) * df["ABS_ELO_DIFF"]
    df["PLAYOFF_REST_DIFF"] = df["IS_PLAYOFF"].astype(int) * df["REST_DIFF"]
    df["CLOSE_STRENGTH_REST_DIFF"] = df["IS_CLOSE_STRENGTH"] * df["REST_DIFF"]
    return df


def compute_current_elo_state(team_games: pd.DataFrame) -> dict[str, float]:
    if team_games.empty:
        return {}
    history = add_pre_game_elo(team_games)
    history = history.sort_values(["GAME_DATE", "GAME_ID", "IS_HOME"])
    state: dict[str, float] = {}
    for _, game in history.groupby("GAME_ID", sort=False):
        if len(game) != 2:
            continue
        home = game[game["IS_HOME"].astype(bool)]
        away = game[~game["IS_HOME"].astype(bool)]
        if home.empty or away.empty:
            continue
        home_row = home.iloc[0]
        away_row = away.iloc[0]
        home_team = home_row["TEAM_ABBREVIATION"]
        away_team = away_row["TEAM_ABBREVIATION"]
        pre_home = float(home_row["PRE_GAME_ELO"])
        pre_away = float(away_row["PRE_GAME_ELO"])
        home_win = int(home_row["WIN"])
        expected_home = 1.0 / (1.0 + 10.0 ** ((pre_away - pre_home) / 400.0))
        expected_away = 1.0 - expected_home
        state[home_team] = pre_home + K_FACTOR * (home_win - expected_home)
        state[away_team] = pre_away + K_FACTOR * ((1 - home_win) - expected_away)
    return state


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
    }
