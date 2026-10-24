"""Roster-talent adjustment to the opening Elo of a season.

Player rating = games-weighted mean of per-game Hollinger game score (rescaled to the importance range)
over the previous two seasons, shrunk toward a replacement-level player by games played.
Team talent = star-weighted top-8 of its players' ratings.
Opening Elo = 1500 + CARRIED_WEIGHT * (chained Elo - 1500) + K_LEVEL * z(talent level) [+ K_CHANGE * z(talent change)].
Validated walk-forward 2021-22..2025-26: reports/backtests/2026-10-24_roster_elo_adjustment/.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

import numpy as np
import pandas as pd

SEASON_WEIGHTS = (0.5, 0.5)
STAR_WEIGHTS = np.array([1.6, 1.4, 1.2, 1.0, 0.8, 0.7, 0.6, 0.5])
REPLACEMENT_RATING = 20.0
CARRIED_WEIGHT = 0.75
K_CHANGE = 0.0
K_LEVEL = 30.0
SHRINK_GAMES = 20
MAX_SHIFT = 45.0
MIN_GAMES = 5
GAMES_CAP = 70


PLAYER_GAME_COLUMNS = ["Player_ID", "Game_ID", "GAME_DATE", "MATCHUP", "PTS", "AST", "FGM", "FGA", "FTM", "FTA",
                       "OREB", "DREB", "STL", "BLK", "TOV", "PF"]


def game_score(df: pd.DataFrame) -> pd.Series:
    """Hollinger game score, scaled to the 0.5 MIN + PTS + 0.8 AST + 0.6 REB range."""
    gs = (df["PTS"] + 0.4 * df["FGM"] - 0.7 * df["FGA"] - 0.4 * (df["FTA"] - df["FTM"]) + 0.7 * df["OREB"]
          + 0.3 * df["DREB"] + df["STL"] + 0.7 * df["AST"] + 0.7 * df["BLK"] - 0.4 * df["PF"] - df["TOV"])
    return gs * 1.8 + 8.0


def regular_season_player_games(df: pd.DataFrame) -> pd.DataFrame:
    """Regular-season rows with TEAM, SCORE and a datetime GAME_DATE (``Player_ID`` keyed)."""
    gid = df["Game_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    out = df[gid.str.startswith("002")].copy()
    stat_cols = [c for c in PLAYER_GAME_COLUMNS if c not in ("Player_ID", "Game_ID", "GAME_DATE", "MATCHUP")]
    out[stat_cols] = out[stat_cols].fillna(0)
    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"])
    out["TEAM"] = out["MATCHUP"].astype(str).str.split().str[0]
    out["SCORE"] = game_score(out)
    return out


def player_ratings(seasons_newest_first: Sequence[pd.DataFrame], weights: Sequence[float] = SEASON_WEIGHTS) -> Dict[int, float]:
    num: Dict[int, float] = {}
    den: Dict[int, float] = {}
    games: Dict[int, float] = {}
    for season_games, w in zip(seasons_newest_first, weights):
        stats = season_games.groupby("Player_ID").agg(GP=("SCORE", "size"), SCORE=("SCORE", "mean"))
        for pid, row in stats[stats["GP"] >= MIN_GAMES].iterrows():
            wt = w * min(row["GP"], GAMES_CAP)
            num[pid] = num.get(pid, 0.0) + wt * row["SCORE"]
            den[pid] = den.get(pid, 0.0) + wt
            games[pid] = games.get(pid, 0.0) + w * row["GP"]
    return {
        p: (games[p] * (num[p] / den[p]) + SHRINK_GAMES * REPLACEMENT_RATING) / (games[p] + SHRINK_GAMES) for p in num
    }


def end_roster(games: pd.DataFrame) -> Dict[str, List[int]]:
    """Team -> players, by the team of each player's last regular-season game."""
    last = games.sort_values("GAME_DATE").groupby("Player_ID").tail(1)
    return last.groupby("TEAM")["Player_ID"].apply(list).to_dict()


def team_talent(players: Iterable[int], ratings: Dict[int, float]) -> float:
    top = sorted((ratings.get(p, REPLACEMENT_RATING) for p in players), reverse=True)[: len(STAR_WEIGHTS)]
    top += [REPLACEMENT_RATING] * (len(STAR_WEIGHTS) - len(top))
    return float((np.array(top) * STAR_WEIGHTS).sum())


def _z(s: pd.Series) -> pd.Series:
    return (s - s.mean()) / s.std()


def roster_elo_adjustment(
    ratings: Dict[int, float],
    previous_roster: Dict[str, List[int]],
    new_roster: Dict[str, List[int]],
    k_change: float = K_CHANGE,
    k_level: float = K_LEVEL,
) -> Dict[str, float]:
    teams = sorted(set(previous_roster) & set(new_roster))
    if len(teams) < 3:
        return {}
    t_new = pd.Series({t: team_talent(new_roster[t], ratings) for t in teams})
    if t_new.std() == 0:
        return {}
    shift = k_level * _z(t_new)
    if k_change:
        t_prev = pd.Series({t: team_talent(previous_roster[t], ratings) for t in teams})
        if (t_new - t_prev).std() > 0:
            shift = shift + k_change * _z(t_new - t_prev)
    return {str(t): float(v) for t, v in shift.clip(-MAX_SHIFT, MAX_SHIFT).items()}
