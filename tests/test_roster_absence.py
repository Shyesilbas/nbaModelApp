import pandas as pd

from src.features.roster_absence import add_absence_columns, assumed_out_players, build_absence_deltas, live_absence_delta


def _logs(n_games=8, star_plays_last=True):
    """Team AAA: a star (30 min, 25 pts) and four 25-minute role players, every game."""
    rows = []
    for g in range(n_games):
        gid = f"002240{g:04d}"
        date = pd.Timestamp("2024-11-01") + pd.Timedelta(days=2 * g)
        players = {1: ("Star", 30, 25), 2: ("B", 25, 8), 3: ("C", 25, 8), 4: ("D", 25, 8), 5: ("E", 25, 8)}
        for pid, (name, minutes, pts) in players.items():
            if pid == 1 and g == n_games - 1 and not star_plays_last:
                continue
            rows.append(dict(
                Player_ID=pid, PLAYER_NAME=name, Game_ID=gid, GAME_DATE=date, MATCHUP="AAA vs. BBB",
                MIN=minutes, PTS=pts, FGM=pts // 2, FGA=pts, FTM=0, FTA=0, OREB=0, DREB=2, STL=0,
                AST=2, BLK=0, PF=1, TOV=1,
            ))
    return pd.DataFrame(rows)


def test_missing_star_lowers_delta_and_matches_live_override():
    logs = _logs(star_plays_last=False)
    deltas = build_absence_deltas(logs).set_index("GAME_ID")["ABS_DELTA"]
    last = deltas.index[-1]
    assert deltas.iloc[0] == 0.0  # no history yet
    assert deltas.loc[last] < -5  # star absent on the last night

    # live inference with the same availability must reproduce the training value
    pred_date = logs["GAME_DATE"].max() + pd.Timedelta(days=1)
    history = _logs(n_games=7)  # games before "tonight"
    out = live_absence_delta(history, "AAA", pred_date, {1: {"factor": 0.0}})
    assert abs(out - deltas.loc[last]) < 1e-6


def test_out_override_beats_default_and_name_lookup_works():
    history = _logs(n_games=7)
    date = history["GAME_DATE"].max() + pd.Timedelta(days=1)
    healthy = live_absence_delta(history, "AAA", date, None)
    out = live_absence_delta(history, "AAA", date, {"star": {"factor": 0.0}})
    restricted = live_absence_delta(history, "AAA", date, {"star": {"factor": 0.5}})
    assert out < restricted < healthy


def test_add_absence_columns_is_antisymmetric_per_game():
    logs = _logs(star_plays_last=False)
    healthy = _logs(star_plays_last=True)
    other = healthy.assign(MATCHUP="BBB @ AAA", Player_ID=healthy["Player_ID"] + 100)
    games = pd.concat([logs, other])
    model = pd.DataFrame({
        "GAME_ID": ["0022400007"] * 2,
        "TEAM_ABBREVIATION": ["AAA", "BBB"],
        "OPPONENT_ABBREVIATION": ["BBB", "AAA"],
    })
    out = add_absence_columns(model, games).set_index("TEAM_ABBREVIATION")
    assert out.loc["AAA", "ABS_DIFF"] == -out.loc["BBB", "ABS_DIFF"]
    assert out.loc["AAA", "ABS_DIFF"] < 0


def test_assumed_out_flags_only_unmentioned_rotation_players_who_skipped_last_game():
    history = _logs(n_games=8, star_plays_last=False)
    date = history["GAME_DATE"].max() + pd.Timedelta(days=1)
    assert assumed_out_players(history, "AAA", date) == {1}
    assert assumed_out_players(history, "AAA", date, {1: {"factor": 1.0}}) == set()  # explicit ACTIVE
    # ... and an explicit ACTIVE brings the team back to its healthy value
    assert live_absence_delta(history, "AAA", date, {1: {"factor": 1.0}}) > live_absence_delta(history, "AAA", date)


def test_offseason_only_overrides_move_the_feature_and_use_the_whole_history():
    # 20 games; the star misses the last 16, so a 15-game window would not see him at all
    history = _logs(n_games=20)
    history = history[~((history["Player_ID"] == 1) & (history["Game_ID"] >= "0022400004"))]
    opener = history["GAME_DATE"].max() + pd.Timedelta(days=120)
    assert live_absence_delta(history, "AAA", opener, None) == 0.0
    assert assumed_out_players(history, "AAA", opener) == set()
    assert live_absence_delta(history, "AAA", opener, {1: {"factor": 0.0}}) < 0
