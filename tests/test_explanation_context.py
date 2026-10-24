from src.api.services.explanation import build_explanation_context


def test_context_reads_early_season_facts():
    ctx = build_explanation_context({
        "GAMES_PLAYED_HOME_SEASON": 2,
        "GAMES_PLAYED_AWAY_SEASON": 2,
        "WINRATE_LAST_10": 0.5,
        "OPP_WINRATE_LAST_10": 0.0,
        "IS_B2B": 1,
        "OPP_IS_B2B": 1,
        "EARLY_SEASON_ELO_BLEND_WEIGHT": 0.27,
    })
    assert ctx.home_games_played == 2 and ctx.away_games_played == 2
    assert ctx.home_winrate_last_10 == 0.5 and ctx.away_winrate_last_10 == 0.0
    assert ctx.home_is_b2b and ctx.away_is_b2b


def test_context_handles_missing_values():
    ctx = build_explanation_context({"WINRATE_LAST_10": float("nan")})
    assert ctx.home_winrate_last_10 is None
    assert ctx.home_games_played == 0 and not ctx.home_is_b2b
