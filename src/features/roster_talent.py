"""Roster-talent adjustment to the opening Elo of a season.

Player rating = games-weighted mean of per-game importance (0.5 MIN + PTS + 0.8 AST + 0.6 REB)
over the previous two seasons. Team talent = star-weighted top-8 of its players' ratings.
Adjustment (Elo) = K_CHANGE * z(talent change vs last season's end roster) + K_LEVEL * z(talent level).
Validated walk-forward 2021-22..2025-26: reports/backtests/2026-10-24_roster_elo_adjustment/.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

import numpy as np
import pandas as pd

SEASON_WEIGHTS = (0.5, 0.5)
STAR_WEIGHTS = np.array([1.6, 1.4, 1.2, 1.0, 0.8, 0.7, 0.6, 0.5])
REPLACEMENT_RATING = 20.0
K_CHANGE = 15.0
K_LEVEL = 10.0
MAX_SHIFT = 45.0
MIN_GAMES = 5
GAMES_CAP = 70


def importance(df: pd.DataFrame) -> pd.Series:
    return df["MIN"] * 0.5 + df["PTS"] + df["AST"] * 0.8 + df["REB"] * 0.6


def regular_season_player_games(df: pd.DataFrame) -> pd.DataFrame:
    """Regular-season rows with TEAM, SCORE and a datetime GAME_DATE (``Player_ID`` keyed)."""
    gid = df["Game_ID"].astype(str).str.split(".").str[0].str.zfill(10)
    out = df[gid.str.startswith("002")].copy()
    out["GAME_DATE"] = pd.to_datetime(out["GAME_DATE"])
    out["TEAM"] = out["MATCHUP"].astype(str).str.split().str[0]
    out["SCORE"] = importance(out)
    return out


def player_ratings(seasons_newest_first: Sequence[pd.DataFrame], weights: Sequence[float] = SEASON_WEIGHTS) -> Dict[int, float]:
    num: Dict[int, float] = {}
    den: Dict[int, float] = {}
    for games, w in zip(seasons_newest_first, weights):
        stats = games.groupby("Player_ID").agg(GP=("SCORE", "size"), SCORE=("SCORE", "mean"))
        for pid, row in stats[stats["GP"] >= MIN_GAMES].iterrows():
            wt = w * min(row["GP"], GAMES_CAP)
            num[pid] = num.get(pid, 0.0) + wt * row["SCORE"]
            den[pid] = den.get(pid, 0.0) + wt
    return {p: num[p] / den[p] for p in num}


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
    t_prev = pd.Series({t: team_talent(previous_roster[t], ratings) for t in teams})
    if t_new.std() == 0 or (t_new - t_prev).std() == 0:
        return {}
    shift = (k_change * _z(t_new - t_prev) + k_level * _z(t_new)).clip(-MAX_SHIFT, MAX_SHIFT)
    return {str(t): float(v) for t, v in shift.items()}
