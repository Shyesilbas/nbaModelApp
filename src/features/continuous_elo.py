from __future__ import annotations

import math
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


INITIAL_ELO = 1500.0
# Tuned on 2020-21..2025-26 home-win log-loss (grid over K, HCA, carryover):
# K=10/HCA=50/carryover=0.6 scored 0.625 vs 0.648 for the old K=20/HCA=100/0.75.
# The MOV multiplier already scales updates up to ~3.5x, so K=20 overreacted, and
# home teams win ~55% of games, which is ~35-50 Elo points, not 100.
BASE_K_FACTOR = 10.0
HOME_COURT_ADVANTAGE = 50.0
SEASON_REGRESSION = 0.6


def _calc_season_key(date_val: pd.Timestamp) -> str:
    year = date_val.year
    month = date_val.month
    if month >= 10:
        start_year = year
        end_year = (year + 1) % 100
    else:
        start_year = year - 1
        end_year = year % 100
    return f"{start_year}-{end_year:02d}"


def compute_mov_multiplier(margin: float, elo_diff: float) -> float:
    """
    FiveThirtyEight Margin of Victory (MOV) multiplier for NBA Elo.
    Prevents garbage time distortion while rewarding dominant wins.
    """
    abs_mov = abs(margin)
    mult = math.log(abs_mov + 1.0) * (2.2 / (elo_diff * 0.001 + 2.2))
    return float(max(0.2, min(mult, 3.5)))


class ContinuousEloEngine:
    """
    Chronological, leakage-safe multi-season Elo engine for the NBA.
    Maintains persistent franchise strength across seasons with:
    - Home court advantage (HOME_COURT_ADVANTAGE Elo points)
    - Margin of victory (MOV) adaptive updates, damped by the winner's pregame edge
    - Inter-season mean reversion (SEASON_REGRESSION * Elo + rest * 1500)
    """

    def __init__(
        self,
        initial_elo: float = INITIAL_ELO,
        k_factor: float = BASE_K_FACTOR,
        home_advantage: float = HOME_COURT_ADVANTAGE,
        season_regression: float = SEASON_REGRESSION,
        initial_ratings: Optional[Dict[str, float]] = None,
    ):
        self.initial_elo = initial_elo
        self.k_factor = k_factor
        self.home_advantage = home_advantage
        self.season_regression = season_regression
        if initial_ratings:
            self.ratings: Dict[str, float] = defaultdict(lambda: self.initial_elo, initial_ratings)
        else:
            self.ratings: Dict[str, float] = defaultdict(lambda: self.initial_elo)
        self.current_season: Optional[str] = None

    def apply_season_regression(self):
        """Regresses all franchise ratings towards league mean between seasons."""
        for team in list(self.ratings.keys()):
            self.ratings[team] = (
                self.season_regression * self.ratings[team]
                + (1.0 - self.season_regression) * self.initial_elo
            )

    def process_season_transition_if_needed(self, season_key: str):
        if self.current_season is None:
            self.current_season = season_key
        elif season_key != self.current_season:
            self.apply_season_regression()
            self.current_season = season_key

    def transform_games(self, df_all_games: pd.DataFrame) -> pd.DataFrame:
        """
        Takes raw or processed team games dataframe covering multiple seasons,
        sorts chronologically, and appends pre-game Elo features without look-ahead leakage.
        """
        df = df_all_games.copy()
        if "IS_HOME" not in df.columns and "MATCHUP" in df.columns:
            df["IS_HOME"] = df["MATCHUP"].astype(str).str.contains("vs.", case=False, na=False)
        if "OPPONENT_ABBREVIATION" not in df.columns and "MATCHUP" in df.columns:
            df["OPPONENT_ABBREVIATION"] = df["MATCHUP"].astype(str).str.split().str[-1]

        df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce")
        df["_TEMP_GID"] = df["GAME_ID"].astype(str).str.split(".").str[0].str.zfill(10)

        # A date-only schedule does not tell us tipoff order. Every game on a
        # date must therefore see the same start-of-day ratings.
        df = df.sort_values(["GAME_DATE", "_TEMP_GID", "IS_HOME"], ascending=[True, True, False]).reset_index(drop=True)

        pre_elos: Dict[int, float] = {}
        opp_pre_elos: Dict[int, float] = {}

        for game_date, date_rows in df.groupby("GAME_DATE", sort=True):
            self.process_season_transition_if_needed(_calc_season_key(game_date))
            # First compute features and outcomes against an unchanged rating
            # state, then apply that day's results simultaneously.
            daily_updates = []
            for gid, game_rows in date_rows.groupby("_TEMP_GID", sort=False):

                if len(game_rows) != 2:
                # Fallback for solitary records
                    for idx, row in game_rows.iterrows():
                        team = row["TEAM_ABBREVIATION"]
                        opp = row["OPPONENT_ABBREVIATION"]
                        pre_elos[idx] = self.ratings[team]
                        opp_pre_elos[idx] = self.ratings[opp]
                    continue

                home_sub = game_rows[game_rows["IS_HOME"].astype(bool)]
                away_sub = game_rows[~game_rows["IS_HOME"].astype(bool)]

                if home_sub.empty or away_sub.empty:
                    home_sub = game_rows.iloc[[0]]
                    away_sub = game_rows.iloc[[1]]

                home_idx = int(home_sub.index[0])
                away_idx = int(away_sub.index[0])

                home_team = home_sub["TEAM_ABBREVIATION"].iloc[0]
                away_team = away_sub["TEAM_ABBREVIATION"].iloc[0]

                home_elo = self.ratings[home_team]
                away_elo = self.ratings[away_team]

            # Save PRE-GAME ratings (Strictly before game outcome update)
                pre_elos[home_idx] = home_elo
                opp_pre_elos[home_idx] = away_elo

                pre_elos[away_idx] = away_elo
                opp_pre_elos[away_idx] = home_elo

            # Check if game outcome exists
                if "WL" in home_sub.columns and pd.notna(home_sub["WL"].iloc[0]):
                    home_won = 1.0 if home_sub["WL"].iloc[0] == "W" else 0.0
                elif "WIN" in home_sub.columns and pd.notna(home_sub["WIN"].iloc[0]):
                    home_won = float(home_sub["WIN"].iloc[0])
                else:
                    continue

                home_pts = float(home_sub["PTS"].iloc[0]) if "PTS" in home_sub.columns and pd.notna(home_sub["PTS"].iloc[0]) else 100.0
                away_pts = float(away_sub["PTS"].iloc[0]) if "PTS" in away_sub.columns and pd.notna(away_sub["PTS"].iloc[0]) else 100.0
                margin = home_pts - away_pts

            # Effective home Elo with home court advantage boost
                home_effective = home_elo + self.home_advantage
                # MOV dampening uses the winner's edge: a favourite's blowout moves
                # ratings less, an upset moves them more.
                elo_diff = (home_effective - away_elo) if home_won == 1.0 else (away_elo - home_effective)

                expected_home = 1.0 / (1.0 + 10.0 ** ((away_elo - home_effective) / 400.0))
                mov_mult = compute_mov_multiplier(margin, elo_diff)

                shift = self.k_factor * mov_mult * (home_won - expected_home)

                daily_updates.append((home_team, away_team, shift))
            for home_team, away_team, shift in daily_updates:
                self.ratings[home_team] += shift
                self.ratings[away_team] -= shift

        df["PRE_GAME_ELO"] = df.index.map(pre_elos)
        df["OPP_PRE_GAME_ELO"] = df.index.map(opp_pre_elos)
        df["ELO_DIFF"] = df["PRE_GAME_ELO"] - df["OPP_PRE_GAME_ELO"]
        df["ABS_ELO_DIFF"] = df["ELO_DIFF"].abs()

        is_home_bool = df["IS_HOME"].astype(bool)
        df["HOME_COURT_ELO_DIFF"] = np.where(
            is_home_bool,
            (df["PRE_GAME_ELO"] + self.home_advantage) - df["OPP_PRE_GAME_ELO"],
            df["PRE_GAME_ELO"] - (df["OPP_PRE_GAME_ELO"] + self.home_advantage)
        )
        df["ELO_EXPECTED_WIN_PROB"] = 1.0 / (1.0 + 10.0 ** (-df["HOME_COURT_ELO_DIFF"] / 400.0))

        df = df.drop(columns=["_TEMP_GID"])
        return df


def build_continuous_elo_dataset(seasons: List[str]) -> Tuple[pd.DataFrame, Dict[str, float]]:
    """
    Loads raw team games across specified seasons, chronologically connects them,
    and returns DataFrame with continuous pre-game Elo ratings.
    """
    from scripts.data_paths import get_data_paths
    from pathlib import Path

    dfs: List[pd.DataFrame] = []
    for s in seasons:
        dp = get_data_paths(s)
        p = Path(dp.team_games_raw)
        if p.exists():
            s_df = pd.read_csv(p)
            s_df["SEASON"] = s
            dfs.append(s_df)

    if not dfs:
        raise FileNotFoundError(f"No team games found for seasons {seasons}")

    full_df = pd.concat(dfs, ignore_index=True)
    engine = ContinuousEloEngine()
    enriched_df = engine.transform_games(full_df)
    return enriched_df, dict(engine.ratings)


def compute_offseason_roster_adjustment(
    prev_roster_df: pd.DataFrame,
    curr_roster_df: pd.DataFrame,
    max_shift: float = 45.0,
) -> Dict[str, float]:
    """
    Computes zero-sum Elo adjustment for offseason roster turnover based on
    top-8 players' importance score delta between previous and current season rosters.
    """
    if prev_roster_df.empty or curr_roster_df.empty:
        return {}

    score_col = "IMPORTANCE_SCORE" if "IMPORTANCE_SCORE" in curr_roster_df.columns else "AVG_PTS"
    if score_col not in prev_roster_df.columns or score_col not in curr_roster_df.columns:
        return {}

    def get_top8_sum(df: pd.DataFrame) -> pd.Series:
        teams = df["TEAM_ABBREVIATION"].unique()
        res = {}
        for t in teams:
            t_sub = df[df["TEAM_ABBREVIATION"] == t]
            res[t] = float(t_sub.nlargest(8, score_col)[score_col].sum())
        return pd.Series(res)

    prev_scores = get_top8_sum(prev_roster_df)
    curr_scores = get_top8_sum(curr_roster_df)

    deltas = (curr_scores - prev_scores).dropna()
    if deltas.empty or float(deltas.std()) == 0:
        return {}

    mean_delta = float(deltas.mean())
    std_delta = float(deltas.std())

    adj_dict = {}
    for team, delta in deltas.items():
        z = (float(delta) - mean_delta) / (std_delta if std_delta > 0 else 1.0)
        shift = float(np.clip(z * 15.0, -max_shift, max_shift))
        adj_dict[str(team)] = shift

    return adj_dict


def build_season_opening_elo(
    prev_seasons: List[str],
    prev_roster_df: Optional[pd.DataFrame] = None,
    curr_roster_df: Optional[pd.DataFrame] = None,
    season_regression: float = SEASON_REGRESSION,
) -> Dict[str, float]:
    """
    Calculates season opening Elo ratings by chaining historical seasons,
    applying offseason mean-reversion (SEASON_REGRESSION * Elo + rest * 1500),
    and applying offseason roster turnover adjustments if roster data is provided.
    """
    _, end_ratings = build_continuous_elo_dataset(prev_seasons)

    opening_ratings = {}
    for team, r in end_ratings.items():
        opening_ratings[team] = round(season_regression * r + (1.0 - season_regression) * INITIAL_ELO, 2)

    if prev_roster_df is not None and curr_roster_df is not None:
        roster_adj = compute_offseason_roster_adjustment(prev_roster_df, curr_roster_df)
        for team, adj in roster_adj.items():
            if team in opening_ratings:
                opening_ratings[team] = round(opening_ratings[team] + adj, 2)

    return opening_ratings
