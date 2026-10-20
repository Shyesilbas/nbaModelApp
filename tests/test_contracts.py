import pandas as pd
import pytest

from src.validation.contracts import ContractViolation, check_player_games, check_team_games, check_team_model_ready


def _team_games():
    return pd.DataFrame([
        dict(GAME_ID="0022600001", TEAM_ID=1, TEAM_ABBREVIATION="AAA", GAME_DATE="2026-10-21", MATCHUP="AAA vs. BBB", PTS=110),
        dict(GAME_ID="0022600001", TEAM_ID=2, TEAM_ABBREVIATION="BBB", GAME_DATE="2026-10-21", MATCHUP="BBB @ AAA", PTS=104),
    ])


def test_valid_team_games_pass():
    check_team_games(_team_games())


def test_duplicate_team_rows_and_bad_dates_are_reported_together():
    bad = pd.concat([_team_games(), _team_games().iloc[[0]]], ignore_index=True)
    bad.loc[1, "GAME_DATE"] = "not a date"
    with pytest.raises(ContractViolation) as exc:
        check_team_games(bad)
    msg = str(exc.value)
    assert "duplicate rows" in msg and "more than two team rows" in msg and "unparseable GAME_DATE" in msg


def test_float_mangled_game_ids_are_normalized_not_flagged():
    df = _team_games()
    df["GAME_ID"] = [22600001.0, 22600001.0]
    check_team_games(df)


def test_player_duplicates_fail():
    row = dict(Game_ID="0022600001", Player_ID=7, GAME_DATE="2026-10-21", MATCHUP="AAA vs. BBB", MIN=30, PTS=20)
    with pytest.raises(ContractViolation, match="duplicate"):
        check_player_games(pd.DataFrame([row, row]))


def test_model_ready_win_must_pair_up():
    df = _team_games().assign(WIN=[1, 1])
    with pytest.raises(ContractViolation, match="WIN does not sum to 1"):
        check_team_model_ready(df)
    check_team_model_ready(df.assign(WIN=[1, 0]))
