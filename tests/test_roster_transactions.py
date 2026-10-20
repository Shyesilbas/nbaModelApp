import pandas as pd

from src.analysis.roster_transactions import apply_movements


def _roster():
    return pd.DataFrame([
        dict(TEAM_ABBREVIATION="MIN", PLAYER_ID=1, PLAYER_NAME="Cut Guy", AVG_MIN=5.0),
        dict(TEAM_ABBREVIATION="ATL", PLAYER_ID=2, PLAYER_NAME="Traded Star", AVG_MIN=34.0),
        dict(TEAM_ABBREVIATION="BOS", PLAYER_ID=3, PLAYER_NAME="Stays", AVG_MIN=20.0),
    ])


def _mv(date, kind, pid, team, slug="new-guy"):
    return dict(TRANSACTION_DATE=pd.Timestamp(date), Transaction_Type=kind, PLAYER_ID=pid,
                TEAM_ABBREVIATION=team, PLAYER_SLUG=slug)


def _team_of(roster, pid):
    hit = roster[roster.PLAYER_ID == pid]
    return None if hit.empty else hit.TEAM_ABBREVIATION.iloc[0]


def test_waive_trade_and_signing():
    moves = pd.DataFrame([
        _mv("2026-10-17", "Waive", 1, "MIN"),
        _mv("2026-12-15", "Trade", 2, "CHA"),
        _mv("2026-12-16", "Signing", 9, "ATL", slug="kj-martin"),
    ])
    out = apply_movements(_roster(), moves)
    assert _team_of(out, 1) is None
    assert _team_of(out, 2) == "CHA"
    assert out.loc[out.PLAYER_ID == 2, "AVG_MIN"].iloc[0] == 34.0  # stats travel with the player
    assert _team_of(out, 9) == "ATL" and out.loc[out.PLAYER_ID == 9, "PLAYER_NAME"].iloc[0] == "Kj Martin"
    assert _team_of(out, 3) == "BOS"


def test_waive_by_former_team_does_not_remove_player():
    moves = pd.DataFrame([_mv("2026-12-15", "Trade", 2, "CHA"), _mv("2026-12-20", "Waive", 2, "ATL")])
    assert _team_of(apply_movements(_roster(), moves), 2) == "CHA"


def test_replaying_reflected_moves_is_a_noop():
    moves = pd.DataFrame([_mv("2026-09-01", "Trade", 3, "BOS")])
    pd.testing.assert_frame_equal(apply_movements(_roster(), moves), _roster())


def test_moves_already_in_game_logs_are_skipped():
    moves = pd.DataFrame([_mv("2026-12-15", "Trade", 2, "CHA")])
    out = apply_movements(_roster(), moves, last_game_dates={2: pd.Timestamp("2026-12-20")})
    assert _team_of(out, 2) == "ATL"
