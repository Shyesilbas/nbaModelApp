import pytest
import pandas as pd

from src.features.roster_absence import (
    add_absence_columns,
    assumed_out_players,
    build_absence_deltas,
    live_absence_delta,
    live_roster_metrics,
)


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


def test_departed_player_is_not_an_absence():
    history = _logs(n_games=8, star_plays_last=False)
    date = history["GAME_DATE"].max() + pd.Timedelta(days=1)
    assert assumed_out_players(history, "AAA", date) == {1}
    # player 1 left the roster: neither assumed out nor a negative delta
    assert assumed_out_players(history, "AAA", date, roster_ids={2, 3, 4, 5}) == set()
    assert live_absence_delta(history, "AAA", date, roster_ids={2, 3, 4, 5}) == 0.0



def test_new_signing_is_not_a_returning_star_after_the_first_game_of_a_season():
    # 14 games last season without player 9, then one game of the new season with him
    old = _logs(n_games=14)
    new = _logs(n_games=1)
    new["Game_ID"] = "0022500001"
    new["GAME_DATE"] = old["GAME_DATE"].max() + pd.Timedelta(days=5)
    signing = new[new["Player_ID"] == 1].copy()
    signing["Player_ID"], signing["PLAYER_NAME"], signing["PTS"] = 9, "Signing", 40
    history = pd.concat([old, new, signing], ignore_index=True)
    date = new["GAME_DATE"].max() + pd.Timedelta(days=2)
    assert live_absence_delta(history, "AAA", date) == 0.0


def test_rotation_continuity_and_missing_mins_parity():
    logs = _logs(n_games=8, star_plays_last=False)
    deltas = build_absence_deltas(logs).set_index("GAME_ID")
    last_gid = deltas.index[-1]
    
    # In the 8th game, player 1 (Star, 30 min) is missing
    assert deltas.loc[last_gid, "MISSING_ROT_MINS"] == 30.0
    assert abs(deltas.loc[last_gid, "ROT_CONTINUITY"] - (100.0 / 130.0)) < 1e-5
    assert deltas.loc[last_gid, "ACTIVE_WT_GS"] == 4.6

    # Live inference with override must reproduce these exact values
    pred_date = logs["GAME_DATE"].max() + pd.Timedelta(days=1)
    history = _logs(n_games=7)
    live_res = live_roster_metrics(history, "AAA", pred_date, {1: {"factor": 0.0}})
    
    assert abs(live_res["MISSING_ROT_MINS"] - deltas.loc[last_gid, "MISSING_ROT_MINS"]) < 1e-6
    assert abs(live_res["ROT_CONTINUITY"] - deltas.loc[last_gid, "ROT_CONTINUITY"]) < 1e-6
    assert abs(live_res["ACTIVE_WT_GS"] - deltas.loc[last_gid, "ACTIVE_WT_GS"]) < 1e-6


def test_add_absence_columns_rotation_antisymmetry():
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
    
    # Continuity diff is antisymmetric
    assert abs(out.loc["AAA", "ROT_CONTINUITY_DIFF"] + out.loc["BBB", "ROT_CONTINUITY_DIFF"]) < 1e-6
    assert out.loc["AAA", "ROT_CONTINUITY_DIFF"] < 0
    assert out.loc["BBB", "ROT_CONTINUITY_DIFF"] > 0

    # Missing rotation mins diff is antisymmetric (positive is good: opponent missing more than us)
    assert abs(out.loc["AAA", "MISSING_ROT_MINS_DIFF"] + out.loc["BBB", "MISSING_ROT_MINS_DIFF"]) < 1e-6
    assert out.loc["AAA", "MISSING_ROT_MINS_DIFF"] < 0
    assert out.loc["BBB", "MISSING_ROT_MINS_DIFF"] > 0



def test_carry_forward_availability_cannot_see_tonights_absence():
    logs = _logs(star_plays_last=False)
    actual = build_absence_deltas(logs).set_index("GAME_ID")["ABS_DELTA"]
    carried = build_absence_deltas(logs, availability="carry_forward").set_index("GAME_ID")["ABS_DELTA"]
    last = actual.index[-1]
    assert actual.loc[last] < -5  # the box score knows the star sat out
    assert carried.loc[last] > actual.loc[last] + 5  # the live default does not: he played the previous game
    with pytest.raises(ValueError):
        build_absence_deltas(logs, availability="injury_report")
