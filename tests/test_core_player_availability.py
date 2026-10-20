import pandas as pd

from src.features.core_player_availability_features import build_core_player_availability_features, build_core_rosters, _prepare_player_games


def _season(n_games=10, late_star_from=None, traded_after=None, minutes_override=None):
    """AAA vs BBB every other day. AAA: players 1-5 at 30 min / 10 pts; player 6 a bench guy."""
    team_rows, player_rows = [], []
    for g in range(n_games):
        gid = f"002240{g:04d}"
        date = pd.Timestamp("2024-11-01") + pd.Timedelta(days=2 * g)
        for tid, abbr in ((1, "AAA"), (2, "BBB")):
            team_rows.append(dict(GAME_ID=gid, GAME_DATE=date, TEAM_ID=tid, TEAM_ABBREVIATION=abbr))
        for pid in range(1, 7):
            team = "AAA"
            if traded_after is not None and pid == 1 and g > traded_after:
                team = "BBB"
            minutes, pts = (30, 10) if pid <= 5 else (12, 4)
            if late_star_from is not None and pid == 6 and g >= late_star_from:
                minutes, pts = 40, 40
            if minutes_override and (g, pid) in minutes_override:
                minutes = minutes_override[(g, pid)]
            player_rows.append(dict(
                Player_ID=pid, PLAYER_NAME=f"P{pid}", Game_ID=gid, GAME_DATE=date, MATCHUP=f"{team} vs. XXX",
                MIN=minutes, PTS=pts, AST=2, REB=4,
                PTS_LAST_5=pts, AST_LAST_5=2, REB_LAST_5=4, MIN_LAST_5=minutes, PLUS_MINUS_LAST_5=0,
            ))
    return pd.DataFrame(team_rows), pd.DataFrame(player_rows)


def _cores(team, players, game_idx):
    gid = f"002240{game_idx:04d}"
    cores = build_core_rosters(team, _prepare_player_games(players))
    return set(cores[(cores.GAME_ID == gid) & (cores.TEAM_ABBREVIATION == "AAA")].Player_ID)


def test_core_list_uses_only_past_games():
    team, players = _season(late_star_from=6)
    assert 6 not in _cores(team, players, 5)  # future breakout is invisible before it happens
    assert 6 in _cores(team, players, 9)  # three breakout games later he is core


def test_no_core_before_min_games():
    team, players = _season()
    out = build_core_player_availability_features(team, players)
    first = out[(out.GAME_ID == "0022400000") & (out.TEAM_ABBREVIATION == "AAA")].iloc[0]
    assert first.TEAM_CORE_TOP3_EXPECTED_COUNT == 0
    assert first.TEAM_CORE_TOP3_AVAILABLE_RATE == 1.0


def test_traded_player_leaves_old_team_core():
    team, players = _season(traded_after=4)
    assert 1 in _cores(team, players, 4)
    assert 1 not in _cores(team, players, 6)


def test_tonights_actual_minutes_do_not_leak():
    team, players = _season()
    base = build_core_player_availability_features(team, players)
    _, changed_players = _season(minutes_override={(8, p): 5 for p in range(1, 6)})
    changed = build_core_player_availability_features(team, changed_players)
    gid, cols = "0022400008", ["TEAM_CORE_TOP3_MINUTES_SUM", "TEAM_CORE_TOP3_PLAYED_COUNT"]
    pick = lambda df: df[(df.GAME_ID == gid) & (df.TEAM_ABBREVIATION == "AAA")][cols].iloc[0].tolist()
    assert pick(base) == pick(changed)


def test_absent_core_player_counts_as_missing_and_opponent_mirrors():
    team, players = _season()
    players = players[~((players.Game_ID == "0022400008") & (players.Player_ID == 1))]
    out = build_core_player_availability_features(team, players)
    gid = "0022400008"
    aaa = out[(out.GAME_ID == gid) & (out.TEAM_ABBREVIATION == "AAA")].iloc[0]
    bbb = out[(out.GAME_ID == gid) & (out.TEAM_ABBREVIATION == "BBB")].iloc[0]
    assert aaa.TEAM_CORE_TOP5_MISSING_COUNT == 1
    assert bbb.OPP_CORE_TOP5_MISSING_COUNT == 1
