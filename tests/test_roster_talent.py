import pandas as pd

from src.features.roster_talent import (
    REPLACEMENT_RATING,
    SHRINK_GAMES,
    player_ratings,
    regular_season_player_games,
    roster_elo_adjustment,
    team_talent,
)

STATS = ["PTS", "AST", "FGM", "FGA", "FTM", "FTA", "OREB", "DREB", "STL", "BLK", "TOV", "PF"]


def _row(pid, team, game, pts, fga=10, fgm=5):
    row = {c: 0 for c in STATS}
    row.update({"Player_ID": pid, "Game_ID": f"002000{game:04d}", "GAME_DATE": "2026-01-01",
                "MATCHUP": f"{team} vs. XXX", "PTS": pts, "FGA": fga, "FGM": fgm})
    return row


def _games(rows):
    return regular_season_player_games(pd.DataFrame(rows))


def test_ratings_skip_short_samples_and_shrink_toward_replacement():
    new = _games([_row(1, "AAA", g, 30) for g in range(60)] + [_row(2, "AAA", g, 30) for g in range(3)])
    old = _games([_row(1, "AAA", g, 10) for g in range(60)])
    r = player_ratings([new, old])
    assert 2 not in r
    raw = new[new.Player_ID == 1].SCORE.mean() * 0.5 + old.SCORE.mean() * 0.5
    assert REPLACEMENT_RATING < r[1] < raw


def test_inefficient_volume_rates_below_efficient_scoring():
    efficient = _games([_row(1, "AAA", g, 20, fga=10, fgm=8) for g in range(60)])
    wasteful = _games([_row(2, "AAA", g, 20, fga=25, fgm=8) for g in range(60)])
    assert player_ratings([efficient])[1] > player_ratings([wasteful])[2]


def test_fewer_games_pull_rating_toward_replacement():
    full = _games([_row(1, "AAA", g, 30) for g in range(70)])
    short = _games([_row(2, "AAA", g, 30) for g in range(SHRINK_GAMES)])
    r = player_ratings([full, full])
    r_short = player_ratings([short, short])
    assert r[1] > r_short[2] > REPLACEMENT_RATING


def test_star_counts_more_than_depth():
    ratings = {1: 60.0, 2: 30.0, 3: 30.0}
    assert team_talent([1], ratings) > team_talent([2, 3], ratings)


def test_adjustment_follows_talent_level():
    ratings = {i: 40.0 for i in range(1, 40)}
    ratings[99] = 70.0
    prev = {"A": [1, 2], "B": [3, 4], "C": [5, 6], "D": [7, 8]}
    new = {"A": [99, 2], "B": [3, 4], "C": [5, 6], "D": [7, 8]}
    adj = roster_elo_adjustment(ratings, prev, new)
    assert adj["A"] > 0 > adj["B"]
    assert roster_elo_adjustment(ratings, {"A": [1]}, {"A": [1]}) == {}
