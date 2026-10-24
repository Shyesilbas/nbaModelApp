import pandas as pd

from src.features.roster_talent import (
    player_ratings,
    regular_season_player_games,
    roster_elo_adjustment,
    team_talent,
)


def _games(rows):
    return regular_season_player_games(pd.DataFrame(rows))


def _row(pid, team, game, mins, pts):
    return {"Player_ID": pid, "Game_ID": f"002000{game:04d}", "GAME_DATE": "2026-01-01",
            "MATCHUP": f"{team} vs. XXX", "MIN": mins, "PTS": pts, "AST": 0, "REB": 0}


def test_ratings_weight_recent_season_and_skip_short_samples():
    new = _games([_row(1, "AAA", g, 30, 30) for g in range(10)] + [_row(2, "AAA", g, 30, 30) for g in range(3)])
    old = _games([_row(1, "AAA", g, 10, 10) for g in range(10)])
    r = player_ratings([new, old], weights=(0.75, 0.25))
    assert 2 not in r
    assert abs(r[1] - (0.75 * 10 * 45 + 0.25 * 10 * 15) / (0.75 * 10 + 0.25 * 10)) < 1e-9


def test_star_counts_more_than_depth():
    ratings = {1: 60.0, 2: 30.0, 3: 30.0}
    assert team_talent([1], ratings) > team_talent([2, 3], ratings)


def test_adjustment_is_zero_sum_direction():
    ratings = {i: 40.0 for i in range(1, 40)}
    ratings[99] = 70.0
    prev = {"A": [1, 2], "B": [3, 4], "C": [5, 6], "D": [7, 8]}
    new = {"A": [99, 2], "B": [3, 4], "C": [5, 6], "D": [7, 8]}
    adj = roster_elo_adjustment(ratings, prev, new)
    assert adj["A"] > 0 > adj["B"]
    assert roster_elo_adjustment(ratings, {"A": [1]}, {"A": [1]}) == {}
