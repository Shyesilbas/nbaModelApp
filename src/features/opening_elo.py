"""Opening Elo of a season: chained earlier seasons plus the roster-talent adjustment."""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd

from src.core.data_paths import get_data_paths
from src.features.continuous_elo import build_season_opening_elo
from src.features.roster_talent import (
    CARRIED_WEIGHT,
    PLAYER_GAME_COLUMNS,
    SEASON_WEIGHTS,
    end_roster,
    player_ratings,
    regular_season_player_games,
    roster_elo_adjustment,
)

ROOT = Path(__file__).resolve().parents[2]


def prior_seasons(season: str) -> List[str]:
    return sorted(
        p.parent.parent.name.split("=", 1)[1]
        for p in (ROOT / "data").glob("season=*/raw/team_games.csv")
        if p.parent.parent.name.split("=", 1)[1] < season
    )


def build_opening_elo(season: str) -> Tuple[Dict[str, float], Dict[str, float], List[str]]:
    """(opening ratings, roster adjustment per team, prior seasons used).

    The signed roster is ``team_rosters.csv`` of ``season`` (the bootstrap file, one row per player and team);
    raises FileNotFoundError when it is missing so callers can fall back to the plain chain.
    """
    prev = prior_seasons(season)
    if not prev:
        raise FileNotFoundError(f"no earlier season on disk before {season}")
    roster_path = Path(get_data_paths(season).team_rosters)
    if not roster_path.exists():
        raise FileNotFoundError(f"signed roster not found: {roster_path}")

    games = [
        regular_season_player_games(pd.read_csv(get_data_paths(s).player_games_raw, usecols=PLAYER_GAME_COLUMNS))
        for s in prev[::-1][: len(SEASON_WEIGHTS)]
    ]
    ratings = player_ratings(games)
    signed = pd.read_csv(roster_path)
    new_roster = signed.groupby("TEAM_ABBREVIATION")["PLAYER_ID"].apply(list).to_dict()
    adjustment = roster_elo_adjustment(ratings, end_roster(games[0]), new_roster)
    opening = build_season_opening_elo(prev, roster_adjustment=adjustment, carried_weight=CARRIED_WEIGHT)
    return opening, adjustment, prev
