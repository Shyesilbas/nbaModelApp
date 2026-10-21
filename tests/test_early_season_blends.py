import numpy as np
import pandas as pd

from src.api.services import player_projection as pp
from src.features import build_matchup_features as bmf


def test_score_form_starts_at_prior_and_hands_over_to_form(monkeypatch):
    prior = {"AAA": {"PACE": 100.0, "OFF_RTG": 110.0, "DEF_RTG": 112.0},
             "BBB": {"PACE": 98.0, "OFF_RTG": 115.0, "DEF_RTG": 108.0}}
    monkeypatch.setattr(bmf, "_prior_season_team_form", lambda season: prior)
    res = {"PACE_LAST_10": np.nan, "OFF_RTG_LAST_10": np.nan, "DEF_RTG_LAST_10": np.nan,
           "OPP_PACE_LAST_10": 104.0, "OPP_OFF_RTG_LAST_10": 121.0, "OPP_DEF_RTG_LAST_10": 102.0}
    bmf.blend_score_form_with_prior(res, "2026-27", "AAA", "BBB", 0, 3)
    assert res["PACE_LAST_10"] == 100.0 and res["DEF_RTG_LAST_10"] == 112.0
    assert res["OPP_PACE_LAST_10"] == 101.0  # halfway after 3 of 6 games
    full = {"PACE_LAST_10": 104.0}
    bmf.blend_score_form_with_prior(full, "2026-27", "AAA", "BBB", 6, 6)
    assert full["PACE_LAST_10"] == 104.0


def test_player_projection_leans_on_last_season_for_the_first_games(monkeypatch):
    prev = pd.DataFrame({"Player_ID": [1, 1, 2], "GAME_DATE": pd.to_datetime(["2026-01-01"] * 3),
                         "PTS": [20.0, 30.0, 10.0], "REB": [5.0, 5.0, 4.0], "AST": [5.0, 5.0, 2.0],
                         "SEASON_TYPE": "Regular Season"})
    cur = pd.DataFrame({"Player_ID": [2, 2, 2], "GAME_DATE": pd.to_datetime(["2026-10-20", "2026-10-22", "2026-10-24"]),
                        "PTS": [0.0] * 3, "REB": [0.0] * 3, "AST": [0.0] * 3, "SEASON_TYPE": "Regular Season"})
    monkeypatch.setattr(pp, "_season_logs", lambda season: cur if season == "2026-27" else prev)
    X = pd.DataFrame({"PLAYER_ID": [1, 2, 3], "RAW_PROJ_PTS": [15.0, 12.0, 8.0],
                      "RAW_PROJ_REB": [5.0, 4.0, 3.0], "RAW_PROJ_AST": [5.0, 2.0, 1.0]})
    out = pp.blend_early_season_projection(X, pd.Timestamp("2026-10-26"))
    assert out.loc[0, "RAW_PROJ_PTS"] == 0.6 * 15.0 + 0.4 * 25.0  # no games yet: full prior weight
    assert out.loc[1, "RAW_PROJ_PTS"] == 12.0  # three games played: model only
    assert out.loc[2, "RAW_PROJ_PTS"] == 8.0  # no prior season: model only


def test_player_without_box_scores_scales_league_rookie_rate_with_minutes():
    from src.api.services.usage_redistribution import redistribute_usage_and_minutes

    rows = [{"PLAYER_ID": i, "PLAYER_NAME": f"P{i}", "TEAM_ABBREVIATION": "AAA", "PLAYER_POSITION_GROUP": "GUARD",
             "MIN_EMA_10": 30.0, "USG_PCT_LAST_10": 20.0, "RAW_PROJ_PTS": 15.0, "RAW_PROJ_REB": 4.0,
             "RAW_PROJ_AST": 3.0, "NO_HISTORY": False} for i in range(1, 9)]
    rows.append({"PLAYER_ID": 99, "PLAYER_NAME": "Rookie", "TEAM_ABBREVIATION": "AAA", "PLAYER_POSITION_GROUP": "BIG",
                 "MIN_EMA_10": 0.0, "USG_PCT_LAST_10": 12.0, "RAW_PROJ_PTS": 15.5, "RAW_PROJ_REB": 6.7,
                 "RAW_PROJ_AST": 4.8, "NO_HISTORY": True})
    X = pp.apply_no_history_rates(pd.DataFrame(rows))
    assert X.loc[8, "RAW_PROJ_PTS"] == pp.NO_HISTORY_PER_MIN["BIG"]["PTS"]
    out = redistribute_usage_and_minutes(X, {99: {"status": "ACTIVE", "factor": 1.0, "is_starter": None}})
    rookie = out[out["PLAYER_ID"] == 99].iloc[0]
    assert rookie["PROJ_MIN"] > 0
    assert abs(rookie["RAW_PROJ_PTS"] - 0.399 * rookie["OWN_MIN"]) < 0.1


def test_store_season_averages_skip_preseason_games():
    from src.frontend_store.player_history import compute_averages

    games = [
        {"SEASON_TYPE": "Pre Season", "DID_NOT_PLAY": False, "TEAM_ABBREVIATION": "GSW", "PTS": 23, "MIN": 24.0},
        {"SEASON_TYPE": "Regular Season", "DID_NOT_PLAY": False, "TEAM_ABBREVIATION": "GSW", "PTS": 8, "MIN": 12.0},
    ]
    avg = compute_averages(games)
    assert avg["games_played"] == 1 and avg["PTS"] == 8 and avg["teams"] == ["GSW"]
    assert compute_averages(games[:1])["games_played"] == 0
